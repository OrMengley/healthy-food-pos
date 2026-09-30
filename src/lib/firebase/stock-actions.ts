import { db } from "./config";
import {
    collection,
    addDoc,
    updateDoc,
    doc,
    getDocs,
    query,
    where,
    serverTimestamp,
    Timestamp,
    runTransaction,
} from "firebase/firestore";
import { Stock, StockMovement, Product, AdjustmentReason } from "@/types";
import { parseFirestoreDate } from "@/lib/utils";


// --- Stock ---

export async function getStocks() {
    const q = query(collection(db, "stocks"));
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: parseFirestoreDate(data.date),
                created_at: parseFirestoreDate(data.created_at),
            } as Stock;
        })
        .filter((s) => !s.is_archived)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * Record a simple Stock In (Restock) with product, quantity, optional cost, note, and date.
 */
export async function recordStockIn(data: {
    product_id: string;
    warehouse_id?: string;
    quantity: number;
    cost?: number;
    note?: string;
    date?: Date;
    created_by?: string;
    created_by_name?: string;
}) {
    if (data.quantity <= 0) {
        throw new Error("Quantity must be greater than 0");
    }

    const warehouseId = data.warehouse_id || "main";

    return await runTransaction(db, async (transaction) => {
        const productRef = doc(db, "products", data.product_id);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) throw new Error("Product not found");
        const productData = productSnap.data() as Product;

        // Calculate previous total stock
        const allStocksQuery = query(
            collection(db, "stocks"),
            where("product_id", "==", data.product_id),
            where("is_archived", "==", false)
        );
        const allStockSnaps = await getDocs(allStocksQuery);
        let previousTotalStock = 0;
        allStockSnaps.forEach(doc => previousTotalStock += doc.data().quantity);

        const now = data.date || new Date();
        const costValue = data.cost !== undefined ? Number(data.cost) : (productData.cost || productData.cost_recommand || 0);

        // Add to batch or new stock doc
        const stockRef = doc(collection(db, "stocks"));
        transaction.set(stockRef, {
            product_id: data.product_id,
            product_barcode: productData.barcode,
            warehouse_id: warehouseId,
            product: { ...productData, id: productSnap.id },
            cost: costValue,
            quantity: data.quantity,
            date: Timestamp.fromDate(now),
            is_archived: false,
            created_by: data.created_by || "Admin",
            created_at: serverTimestamp(),
        });

        const newTotalStock = previousTotalStock + data.quantity;

        // Create Stock Movement
        const movementRef = doc(collection(db, "stock_movements"));
        transaction.set(movementRef, {
            product_id: data.product_id,
            product_name: productData.name,
            product_barcode: productData.barcode,
            type: "stock_in",
            quantity: data.quantity,
            unit_cost: costValue,
            total_cost: costValue * data.quantity,
            to_warehouse_id: warehouseId,
            previous_stock_level: previousTotalStock,
            new_stock_level: newTotalStock,
            note: data.note || "Stock In Restock",
            created_by: data.created_by || "Admin",
            created_by_name: data.created_by_name || "Admin",
            date: Timestamp.fromDate(now),
            created_at: serverTimestamp(),
        });

        return movementRef.id;
    });
}

/**
 * Adjusts stock level by adding or deducting.
 * Reasons: 'Damaged' | 'Inventory Count Discrepancy' | 'Sample/Promo' | 'Other'
 */
export async function adjustStock(data: {
    product_id: string;
    warehouse_id?: string;
    type: 'up' | 'down';
    quantity: number;
    cost?: number;
    reason?: AdjustmentReason | string;
    note?: string;
    date?: Date;
    created_by?: string;
    created_by_name?: string;
}) {
    if (data.quantity <= 0) {
        throw new Error("Quantity must be greater than 0");
    }

    const warehouseId = data.warehouse_id || "main";

    return await runTransaction(db, async (transaction) => {
        const productRef = doc(db, "products", data.product_id);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) throw new Error("Product not found");
        const productData = productSnap.data() as Product;

        const allStocksQuery = query(
            collection(db, "stocks"),
            where("product_id", "==", data.product_id),
            where("is_archived", "==", false)
        );
        const allStockSnaps = await getDocs(allStocksQuery);
        let previousTotalStock = 0;
        allStockSnaps.forEach(doc => previousTotalStock += doc.data().quantity);
        const now = data.date || new Date();

        if (data.type === 'down') {
            // Deduct FIFO
            const availableStocks = allStockSnaps.docs
                .map(d => ({ id: d.id, ...d.data() } as Stock))
                .filter(s => s.quantity > 0)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const totalAvailable = availableStocks.reduce((sum, s) => sum + s.quantity, 0);
            if (totalAvailable < data.quantity) {
                throw new Error(`Insufficient stock. Available: ${totalAvailable}, Requested deduction: ${data.quantity}`);
            }

            let remainingToDeduct = data.quantity;
            let totalCostDeducted = 0;

            for (const stockRecord of availableStocks) {
                if (remainingToDeduct <= 0) break;
                const takeQty = Math.min(stockRecord.quantity, remainingToDeduct);
                const recCost = stockRecord.cost || productData.cost || productData.cost_recommand || 0;
                totalCostDeducted += recCost * takeQty;

                transaction.update(doc(db, "stocks", stockRecord.id), {
                    quantity: stockRecord.quantity - takeQty,
                    updated_at: serverTimestamp(),
                });

                remainingToDeduct -= takeQty;
            }

            const unitCost = data.quantity > 0 ? totalCostDeducted / data.quantity : (productData.cost || 0);
            const newTotalStock = previousTotalStock - data.quantity;

            // Movement Record
            const movementRef = doc(collection(db, "stock_movements"));
            transaction.set(movementRef, {
                product_id: data.product_id,
                product_name: productData.name,
                product_barcode: productData.barcode,
                type: "adjustment",
                quantity: data.quantity,
                unit_cost: unitCost,
                total_cost: totalCostDeducted,
                from_warehouse_id: warehouseId,
                previous_stock_level: previousTotalStock,
                new_stock_level: newTotalStock,
                reason: data.reason || "Inventory Count Discrepancy",
                note: data.note ? `${data.reason ? `[${data.reason}] ` : ""}${data.note}` : (data.reason || "Adjustment Down"),
                created_by: data.created_by || "Admin",
                created_by_name: data.created_by_name || "Admin",
                date: Timestamp.fromDate(now),
                created_at: serverTimestamp(),
            });

        } else {
            // Adjustment Up
            const costValue = data.cost !== undefined ? Number(data.cost) : (productData.cost || productData.cost_recommand || 0);

            const stockRef = doc(collection(db, "stocks"));
            transaction.set(stockRef, {
                product_id: data.product_id,
                product_barcode: productData.barcode,
                warehouse_id: warehouseId,
                product: { ...productData, id: productSnap.id },
                cost: costValue,
                date: Timestamp.fromDate(now),
                quantity: data.quantity,
                is_archived: false,
                created_by: data.created_by || "Admin",
                created_at: serverTimestamp(),
            });

            const newTotalStock = previousTotalStock + data.quantity;

            // Movement Record
            const movementRef = doc(collection(db, "stock_movements"));
            transaction.set(movementRef, {
                product_id: data.product_id,
                product_name: productData.name,
                product_barcode: productData.barcode,
                type: "adjustment",
                quantity: data.quantity,
                to_warehouse_id: warehouseId,
                unit_cost: costValue,
                previous_stock_level: previousTotalStock,
                new_stock_level: newTotalStock,
                reason: data.reason || "Inventory Count Discrepancy",
                note: data.note ? `${data.reason ? `[${data.reason}] ` : ""}${data.note}` : (data.reason || "Adjustment Up"),
                created_by: data.created_by || "Admin",
                created_by_name: data.created_by_name || "Admin",
                date: Timestamp.fromDate(now),
                created_at: serverTimestamp(),
            });
        }
    });
}

export async function archiveStock(id: string) {
    const docRef = doc(db, "stocks", id);
    await updateDoc(docRef, {
        is_archived: true,
        archived_at: serverTimestamp(),
    });
}

// --- Stock Movements ---

export async function getStockMovements() {
    const q = query(collection(db, "stock_movements"));
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: parseFirestoreDate(data.date, parseFirestoreDate(data.created_at)),
                created_at: parseFirestoreDate(data.created_at),
            } as StockMovement;
        })
        .sort((a, b) => new Date(b.date || b.created_at).getTime() - new Date(a.date || a.created_at).getTime());
}

export async function createStockMovement(data: Omit<StockMovement, "id" | "created_at">) {
    await addDoc(collection(db, "stock_movements"), {
        ...data,
        date: Timestamp.fromDate(new Date(data.date)),
        created_at: serverTimestamp(),
    });
}

export async function getAdjustmentMovements() {
    const q = query(collection(db, "stock_movements"), where("type", "==", "adjustment"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            ...data,
            date: parseFirestoreDate(data.date),
            created_at: parseFirestoreDate(data.created_at),
        };
    }).sort((a, b) => b.date.getTime() - a.date.getTime()) as StockMovement[];
}

