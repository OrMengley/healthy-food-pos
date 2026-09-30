import { db } from "./config";
import {
    collection,
    doc,
    getDocs,
    query,
    where,
    serverTimestamp,
    runTransaction,
    Timestamp,
} from "firebase/firestore";
import { StockMovement, Stock } from "@/types";
import { parseFirestoreDate } from "@/lib/utils";

export async function getStockMovements() {
    const q = query(collection(db, "stock_movements"), where("type", "==", "transfer"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            date: parseFirestoreDate(data.date),
            created_at: parseFirestoreDate(data.created_at),
        };
    }).sort((a, b) => b.date.getTime() - a.date.getTime()) as StockMovement[];
}

export async function createStockTransfer(data: {
    product_id: string;
    from_warehouse_id: string;
    to_warehouse_id: string;
    quantity: number;
    note?: string;
    created_by: string;
}) {
    // ─── PRE-TRANSACTION QUERIES ──────────────────────────────────
    // Firestore transactions don't support getDocs() inside them.
    // We query the doc IDs first, then re-read them with transaction.get() inside.

    // Fetch source stock docs for this product in the source warehouse
    const sourceStocksQuery = query(
        collection(db, "stocks"),
        where("product_id", "==", data.product_id),
        where("warehouse_id", "==", data.from_warehouse_id),
        where("is_archived", "==", false)
    );
    const sourceStockSnaps = await getDocs(sourceStocksQuery);

    // Fetch all product stock docs (for movement record calculation)
    const allProductStocksQuery = query(
        collection(db, "stocks"),
        where("product_id", "==", data.product_id),
        where("is_archived", "==", false)
    );
    const allStockSnaps = await getDocs(allProductStocksQuery);

    // Fetch all target stock docs to find existing ones
    const targetStocksQuery = query(
        collection(db, "stocks"),
        where("product_id", "==", data.product_id),
        where("warehouse_id", "==", data.to_warehouse_id),
        where("is_archived", "==", false)
    );
    const targetStockSnaps = await getDocs(targetStocksQuery);

    // ─── TRANSACTION ─────────────────────────────────────────────
    const movementId = await runTransaction(db, async (transaction) => {
        // 1. READ PHASE — re-read all docs inside transaction for isolation
        const productRef = doc(db, "products", data.product_id);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) throw new Error("Product not found");

        // Re-read source stock docs via transaction.get()
        const sourceStockDocs = await Promise.all(
            sourceStockSnaps.docs.map(d => transaction.get(doc(db, "stocks", d.id)))
        );
        const sourceStocks = sourceStockDocs
            .filter(d => d.exists() && (d.data()?.quantity ?? 0) > 0)
            .map(d => ({ id: d.id, ...d.data() } as Stock))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const totalAvailable = sourceStocks.reduce((sum, s) => sum + s.quantity, 0);
        if (totalAvailable < data.quantity) {
            throw new Error(`Insufficient stock. Available: ${totalAvailable}, Requested: ${data.quantity}`);
        }

        // Re-read all product stock docs for the movement record
        const allStockDocs = await Promise.all(
            allStockSnaps.docs.map(d => transaction.get(doc(db, "stocks", d.id)))
        );
        let productTotalStock = 0;
        allStockDocs.forEach(d => {
            if (d.exists()) productTotalStock += d.data()?.quantity ?? 0;
        });

        // Re-read target stock docs
        const targetStockDocs = await Promise.all(
            targetStockSnaps.docs.map(d => transaction.get(doc(db, "stocks", d.id)))
        );
        const targetStocks = targetStockDocs
            .filter(d => d.exists())
            .map(d => ({ id: d.id, ...d.data() } as Stock));

        // 2. WRITE PHASE
        let remainingToTransfer = data.quantity;
        const now = new Date();

        // Map to group additions to target warehouse by cost
        const targetAdditionsByCost = new Map<number, number>();

        for (const sourceStock of sourceStocks) {
            if (remainingToTransfer <= 0) break;

            const takeQty = Math.min(sourceStock.quantity, remainingToTransfer);

            // a. Deduct from Source Stock
            const sourceStockRef = doc(db, "stocks", sourceStock.id);
            transaction.update(sourceStockRef, {
                quantity: sourceStock.quantity - takeQty,
                updated_at: serverTimestamp(),
            });

            // Keep track of how much to add to the target warehouse per cost
            const currentAddition = targetAdditionsByCost.get(sourceStock.cost) ?? 0;
            targetAdditionsByCost.set(sourceStock.cost, currentAddition + takeQty);

            remainingToTransfer -= takeQty;
        }

        // b. Apply target warehouse additions
        for (const [cost, addQty] of targetAdditionsByCost.entries()) {
            const existingTarget = targetStocks.find(t => t.cost === cost);
            if (existingTarget) {
                const targetRef = doc(db, "stocks", existingTarget.id);
                transaction.update(targetRef, {
                    quantity: existingTarget.quantity + addQty,
                    updated_at: serverTimestamp(),
                });
            } else {
                // Find a source stock with this cost to copy product details from
                const sourceStock = sourceStocks.find(s => s.cost === cost)!;
                const targetRef = doc(collection(db, "stocks"));
                transaction.set(targetRef, {
                    product_id: sourceStock.product_id,
                    product_barcode: sourceStock.product_barcode,
                    warehouse_id: data.to_warehouse_id,
                    product: sourceStock.product,
                    cost: sourceStock.cost,
                    date: Timestamp.fromDate(now),
                    quantity: addQty,
                    is_archived: false,
                    created_by: data.created_by,
                    created_at: serverTimestamp(),
                });
            }
        }

        // 3. Create Movement Record
        const movementRef = doc(collection(db, "stock_movements"));
        const movementDoc = {
            product_id: data.product_id,
            type: "transfer",
            quantity: data.quantity,
            from_warehouse_id: data.from_warehouse_id,
            to_warehouse_id: data.to_warehouse_id,
            previous_stock_level: productTotalStock,
            new_stock_level: productTotalStock, // total stays same — just moved
            note: data.note || "Stock transfer",
            created_by: data.created_by,
            date: Timestamp.fromDate(now),
            created_at: serverTimestamp(),
        };
        transaction.set(movementRef, movementDoc);

        return movementRef.id;
    });

    return movementId;
}

export async function createMultipleStockTransfers(data: {
    from_warehouse_id: string;
    to_warehouse_id: string;
    items: {
        product_id: string;
        quantity: number;
    }[];
    note?: string;
    created_by: string;
}) {
    if (!data.items || data.items.length === 0) {
        throw new Error("Please add at least one product item to transfer");
    }

    const transferIds: string[] = [];

    for (const item of data.items) {
        const id = await createStockTransfer({
            product_id: item.product_id,
            from_warehouse_id: data.from_warehouse_id,
            to_warehouse_id: data.to_warehouse_id,
            quantity: item.quantity,
            note: data.note,
            created_by: data.created_by,
        });
        transferIds.push(id);
    }

    return transferIds;
}


export async function getAllStockMovements() {
    const q = query(collection(db, "stock_movements"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            date: parseFirestoreDate(data.date),
            created_at: parseFirestoreDate(data.created_at),
        };
    }).sort((a, b) => b.date.getTime() - a.date.getTime()) as StockMovement[];
}


