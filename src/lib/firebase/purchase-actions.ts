import { db } from "./config";
import {
    collection,
    doc,
    getDocs,
    getDoc,
    query,
    where,
    serverTimestamp,
    Timestamp,
    runTransaction,
    updateDoc,
} from "firebase/firestore";
import { Purchase, PurchaseItem, Product, Stock } from "@/types";
import { parseFirestoreDate, formatCambodiaDate, parseCambodiaInputDate } from "@/lib/utils";
import { format } from "date-fns";

export interface CreatePurchaseItemInput {
    product_id: string;
    product_name: string;
    product_barcode: string;
    product_image?: string;
    quantity: number;
    cost: number;
    total: number;
}

export interface CreatePurchasePayload {
    reference_no: string;
    warehouse_id: string;
    supplier_name?: string;
    supplier_phone?: string;
    note?: string;
    date: Date | string;
    created_by: string;
    created_by_name?: string;
    items: CreatePurchaseItemInput[];
}

/**
 * Generate unique Purchase Order reference number in Cambodia Timezone: PO-YYYYMMDD-XXXX
 */
export function generatePurchaseRefNo(): string {
    const dateStr = formatCambodiaDate(new Date(), "code");
    const randPart = Math.floor(1000 + Math.random() * 9000);
    return `PO-${dateStr}-${randPart}`;
}

export async function getPurchases(): Promise<Purchase[]> {
    const q = query(collection(db, "purchases"));
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((d) => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                status: data.status || (data.is_deleted ? "cancelled" : "completed"),
                date: parseFirestoreDate(data.date),
                updated_at: parseFirestoreDate(data.updated_at),
                created_at: parseFirestoreDate(data.created_at),
                cancelled_at: parseFirestoreDate(data.cancelled_at),
                deleted_at: parseFirestoreDate(data.deleted_at),
            } as Purchase;
        })
        .filter((p) => !p.is_deleted || p.status === "cancelled")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getPurchaseById(id: string): Promise<Purchase | null> {
    const docRef = doc(db, "purchases", id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    return {
        id: docSnap.id,
        ...data,
        status: data.status || (data.is_deleted ? "cancelled" : "completed"),
        date: parseFirestoreDate(data.date),
        updated_at: parseFirestoreDate(data.updated_at),
        created_at: parseFirestoreDate(data.created_at),
        cancelled_at: parseFirestoreDate(data.cancelled_at),
        deleted_at: parseFirestoreDate(data.deleted_at),
    } as Purchase;
}

export async function getPurchaseItems(purchaseId?: string): Promise<PurchaseItem[]> {
    const q = query(collection(db, "purchase_items"));
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            ...data,
            created_at: parseFirestoreDate(data.created_at),
        } as PurchaseItem;
    });

    if (purchaseId) {
        return items.filter((item) => item.purchase_id === purchaseId);
    }
    return items;
}

/**
 * Atomically create a multi-product Purchase Order:
 * 1. Inserts purchase header & items (status: "completed")
 * 2. Creates new Stock batches for each product with flexible cost
 * 3. Logs Stock Movement records (type: "stock_in")
 * 4. Updates product recommended cost to latest purchase price
 */
export async function createPurchase(
    purchaseDataOrPayload: CreatePurchasePayload | (Omit<Purchase, "id" | "created_at" | "updated_at" | "is_deleted">),
    maybeItems?: any[]
): Promise<string> {
    const payload: CreatePurchasePayload = maybeItems && Array.isArray(maybeItems)
        ? {
            reference_no: (purchaseDataOrPayload as any).reference_no || generatePurchaseRefNo(),
            warehouse_id: (purchaseDataOrPayload as any).warehouse_id || "main",
            supplier_name: (purchaseDataOrPayload as any).supplier_name || "",
            supplier_phone: (purchaseDataOrPayload as any).supplier_phone || "",
            note: (purchaseDataOrPayload as any).note || "",
            date: (purchaseDataOrPayload as any).date || new Date(),
            created_by: (purchaseDataOrPayload as any).created_by || "Admin",
            created_by_name: (purchaseDataOrPayload as any).created_by_name || "Admin",
            items: maybeItems.map((item: any) => ({
                product_id: item.product_id,
                product_name: item.product_name || "Product",
                product_barcode: item.product_barcode || "",
                product_image: item.product_image || "",
                quantity: Number(item.quantity) || 1,
                cost: Number(item.cost) || 0,
                total: Number(item.total) || (Number(item.quantity) * Number(item.cost)),
            })),
        }
        : (purchaseDataOrPayload as CreatePurchasePayload);

    const { items, ...header } = payload;
    if (!items || items.length === 0) {
        throw new Error("Purchase must have at least one product item.");
    }

    const warehouseId = header.warehouse_id || "main";
    const purchaseDate = parseCambodiaInputDate(header.date);
    const createdBy = header.created_by || "Admin";
    const createdByName = header.created_by_name || "Admin";
    const refNo = header.reference_no.trim() || generatePurchaseRefNo();

    // ─── 0. PRE-READ (Fetch current total stock for movement logs) ───
    const productStockTotals = new Map<string, number>();
    for (const item of items) {
        if (!productStockTotals.has(item.product_id)) {
            const stockQ = query(
                collection(db, "stocks"),
                where("product_id", "==", item.product_id),
                where("is_archived", "==", false)
            );
            const stockSnap = await getDocs(stockQ);
            let total = 0;
            stockSnap.forEach((d) => {
                total += Number(d.data().quantity || 0);
            });
            productStockTotals.set(item.product_id, total);
        }
    }

    const subTotal = items.reduce((sum, item) => sum + Number(item.total || item.quantity * item.cost), 0);
    const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    return await runTransaction(db, async (transaction) => {
        // ─── 1. READ PHASE: Fetch product details inside transaction ───
        const productSnapshots = new Map<string, Product>();
        for (const item of items) {
            if (!productSnapshots.has(item.product_id)) {
                const pRef = doc(db, "products", item.product_id);
                const pSnap = await transaction.get(pRef);
                if (!pSnap.exists()) {
                    throw new Error(`Product "${item.product_name}" (ID: ${item.product_id}) not found.`);
                }
                productSnapshots.set(item.product_id, { ...pSnap.data(), id: pSnap.id } as Product);
            }
        }

        // ─── 2. WRITE PHASE ───
        // a. Create Purchase Document
        const purchaseRef = doc(collection(db, "purchases"));
        const purchaseData = {
            reference_no: refNo,
            warehouse_id: warehouseId,
            supplier_name: header.supplier_name?.trim() || "",
            supplier_phone: header.supplier_phone?.trim() || "",
            note: header.note?.trim() || "",
            items_count: items.length,
            total_quantity: totalQty,
            sub_total: subTotal,
            discount: 0,
            tax: 0,
            total_price: subTotal,
            status: "completed",
            date: Timestamp.fromDate(purchaseDate),
            created_by: createdBy,
            created_by_name: createdByName,
            is_deleted: false,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
        };
        transaction.set(purchaseRef, purchaseData);

        // b. Create Purchase Items & Stock Batches
        for (const item of items) {
            const productData = productSnapshots.get(item.product_id)!;
            const itemQty = Number(item.quantity);
            const itemCost = Number(item.cost) || 0;
            const itemTotal = Number(item.total) || (itemQty * itemCost);
            const prevStock = productStockTotals.get(item.product_id) || 0;
            const newStock = prevStock + itemQty;

            // i. Purchase Item record
            const itemRef = doc(collection(db, "purchase_items"));
            transaction.set(itemRef, {
                purchase_id: purchaseRef.id,
                product_id: item.product_id,
                product_name: productData.name,
                product_barcode: productData.barcode,
                product_image: productData.thumbnails?.[0] || productData.images?.[0] || "",
                quantity: itemQty,
                cost: itemCost,
                total: itemTotal,
                created_at: serverTimestamp(),
            });

            // ii. Create separate Stock batch record for this purchase (FIFO tracking by date & cost)
            const stockRef = doc(collection(db, "stocks"));
            transaction.set(stockRef, {
                product_id: item.product_id,
                product_barcode: productData.barcode,
                warehouse_id: warehouseId,
                purchase_id: purchaseRef.id,
                purchase_item_id: itemRef.id,
                initial_quantity: itemQty,
                product: { ...productData, id: item.product_id },
                cost: itemCost,
                quantity: itemQty,
                date: Timestamp.fromDate(purchaseDate),
                is_archived: false,
                created_by: createdBy,
                created_by_name: createdByName,
                created_at: serverTimestamp(),
            });

            // iii. Create Stock Movement log
            const movementRef = doc(collection(db, "stock_movements"));
            transaction.set(movementRef, {
                product_id: item.product_id,
                product_name: productData.name,
                product_barcode: productData.barcode,
                type: "stock_in",
                quantity: itemQty,
                unit_cost: itemCost,
                total_cost: itemTotal,
                to_warehouse_id: warehouseId,
                previous_stock_level: prevStock,
                new_stock_level: newStock,
                reference: refNo,
                note: `Purchase Order #${refNo}${header.supplier_name ? ` from ${header.supplier_name}` : ""}`,
                created_by: createdBy,
                created_by_name: createdByName,
                date: Timestamp.fromDate(purchaseDate),
                created_at: serverTimestamp(),
            });

            // iv. Update product recommended cost if cost > 0
            if (itemCost > 0) {
                const productRef = doc(db, "products", item.product_id);
                transaction.update(productRef, {
                    cost_recommand: itemCost,
                    cost: itemCost,
                    updated_at: serverTimestamp(),
                });
            }

            // Update in-memory stock for any duplicate product lines in same order
            productStockTotals.set(item.product_id, newStock);
        }

        return purchaseRef.id;
    });
}

export interface PurchaseCancelCheckResult {
    canCancel: boolean;
    canDelete: boolean;
    reason?: string;
    khmerReason?: string;
    violations: {
        productId: string;
        productName: string;
        purchasedQty: number;
        remainingQty: number;
        soldQty: number;
    }[];
}

export type PurchaseDeleteCheckResult = PurchaseCancelCheckResult;

/**
 * Validates whether a purchase order can be safely cancelled.
 * A purchase order CAN ONLY be cancelled if none of the items from its batch have been sold or used.
 * If any units from this purchase order's stock batches were already sold/used, cancellation is blocked.
 */
export async function canCancelPurchase(purchaseId: string): Promise<PurchaseCancelCheckResult> {
    const purchaseRef = doc(db, "purchases", purchaseId);
    const purchaseSnap = await getDoc(purchaseRef);
    if (!purchaseSnap.exists()) {
        return {
            canCancel: false,
            canDelete: false,
            reason: "Purchase record not found.",
            khmerReason: "រកមិនឃើញកំណត់ត្រាទិញចូលនេះទេ។",
            violations: [],
        };
    }
    const purchaseData = purchaseSnap.data();
    if (purchaseData.status === "cancelled" || (purchaseData.is_deleted && purchaseData.status !== "completed")) {
        return {
            canCancel: false,
            canDelete: false,
            reason: "This purchase order is already cancelled.",
            khmerReason: "ការបញ្ជាទិញនេះត្រូវបានលុបចោលរួចហើយ។",
            violations: [],
        };
    }

    const items = await getPurchaseItems(purchaseId);
    if (items.length === 0) {
        return { canCancel: true, canDelete: true, violations: [] };
    }

    const violations: {
        productId: string;
        productName: string;
        purchasedQty: number;
        remainingQty: number;
        soldQty: number;
    }[] = [];

    // Query active stock batches tagged with this purchase_id
    const stocksByPurchaseQ = query(
        collection(db, "stocks"),
        where("purchase_id", "==", purchaseId),
        where("is_archived", "==", false)
    );
    const stocksByPurchaseSnap = await getDocs(stocksByPurchaseQ);
    const purchaseStockDocs = stocksByPurchaseSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Stock)
    );

    for (const item of items) {
        const itemQty = Number(item.quantity) || 0;
        // 1. Try finding stock batch linked directly by purchase_item_id or purchase_id & product_id
        let matchedBatch = purchaseStockDocs.find(
            (s) => s.purchase_item_id === item.id || s.product_id === item.product_id
        );

        // 2. Fallback for legacy purchase records without purchase_id tag:
        if (!matchedBatch) {
            const fallbackQ = query(
                collection(db, "stocks"),
                where("product_id", "==", item.product_id),
                where("warehouse_id", "==", purchaseData.warehouse_id || "main"),
                where("is_archived", "==", false)
            );
            const fallbackSnap = await getDocs(fallbackQ);
            const candidates = fallbackSnap.docs
                .map((d) => ({ id: d.id, ...d.data() } as Stock))
                .filter((s) => Math.abs(Number(s.cost || 0) - Number(item.cost || 0)) < 0.01);
            if (candidates.length > 0) {
                matchedBatch = candidates[0];
            }
        }

        const remainingQty = matchedBatch ? Number(matchedBatch.quantity || 0) : 0;
        if (!matchedBatch || remainingQty < itemQty) {
            const soldQty = itemQty - remainingQty;
            violations.push({
                productId: item.product_id,
                productName: item.product_name || "Product",
                purchasedQty: itemQty,
                remainingQty,
                soldQty: Math.max(soldQty, 0),
            });
        }
    }

    if (violations.length > 0) {
        const englishMsg = "This purchase cannot be cancelled because some items from this purchase have already been sold or used.";
        const khmerMsg = "មិនអាចលុបការទិញនេះបានទេ ព្រោះមានទំនិញមួយចំនួនពីការទិញនេះត្រូវបានលក់ ឬប្រើប្រាស់រួចហើយ។";
        return {
            canCancel: false,
            canDelete: false,
            reason: englishMsg,
            khmerReason: khmerMsg,
            violations,
        };
    }

    return { canCancel: true, canDelete: true, violations: [] };
}

export const canDeletePurchase = canCancelPurchase;

/**
 * Atomically cancel a purchase order and reverse all stock added by it:
 * 1. Validates that no items from this purchase have been sold, transferred, or used.
 * 2. Changes purchase status to "cancelled" (saves cancelled_at, cancelled_by, cancel_reason).
 * 3. Deducts the original purchase quantity from the exact purchase batch.
 * 4. Creates a stock movement / transaction with type: "purchase_void" (NOT adjustment_out).
 */
export async function cancelPurchase(
    purchaseId: string,
    cancelReason: string,
    userContext?: { id: string; name: string }
): Promise<void> {
    if (!cancelReason || !cancelReason.trim()) {
        throw new Error("Cancellation reason is required.");
    }

    const check = await canCancelPurchase(purchaseId);
    if (!check.canCancel) {
        throw new Error(
            check.reason ||
            "This purchase cannot be cancelled because some items from this purchase have already been sold or used."
        );
    }

    const purchaseRef = doc(db, "purchases", purchaseId);
    const purchaseSnap = await getDoc(purchaseRef);
    if (!purchaseSnap.exists()) {
        throw new Error("Purchase record not found.");
    }
    const purchaseData = { id: purchaseSnap.id, ...purchaseSnap.data() } as Purchase;
    const items = await getPurchaseItems(purchaseId);

    // Pre-read total current stock levels for products to generate accurate stock movement logs
    const productCurrentTotals = new Map<string, number>();
    for (const item of items) {
        if (!productCurrentTotals.has(item.product_id)) {
            const stockQ = query(
                collection(db, "stocks"),
                where("product_id", "==", item.product_id),
                where("is_archived", "==", false)
            );
            const stockSnap = await getDocs(stockQ);
            let total = 0;
            stockSnap.forEach((d) => {
                total += Number(d.data().quantity || 0);
            });
            productCurrentTotals.set(item.product_id, total);
        }
    }

    // Locate matching stock batch documents
    const stocksByPurchaseQ = query(
        collection(db, "stocks"),
        where("purchase_id", "==", purchaseId),
        where("is_archived", "==", false)
    );
    const stocksByPurchaseSnap = await getDocs(stocksByPurchaseQ);
    const stockBatchesToArchive: { docId: string; item: PurchaseItem }[] = [];

    for (const item of items) {
        let matchedDoc = stocksByPurchaseSnap.docs.find(
            (d) => d.data().purchase_item_id === item.id || d.data().product_id === item.product_id
        );
        if (!matchedDoc) {
            // fallback
            const fallbackQ = query(
                collection(db, "stocks"),
                where("product_id", "==", item.product_id),
                where("warehouse_id", "==", purchaseData.warehouse_id || "main"),
                where("is_archived", "==", false)
            );
            const fallbackSnap = await getDocs(fallbackQ);
            const candidates = fallbackSnap.docs.filter(
                (d) =>
                    Math.abs(Number(d.data().cost || 0) - Number(item.cost || 0)) < 0.01 &&
                    Number(d.data().quantity || 0) >= item.quantity
            );
            if (candidates.length > 0) {
                matchedDoc = candidates[0];
            }
        }

        if (matchedDoc) {
            stockBatchesToArchive.push({
                docId: matchedDoc.id,
                item,
            });
        }
    }

    const now = new Date();
    const adminId = userContext?.id || "Admin";
    const adminName = userContext?.name || "Admin";
    const cleanReason = cancelReason.trim();

    await runTransaction(db, async (transaction) => {
        // 1. READ PHASE inside transaction: verify stock batches and purchase status
        const pSnap = await transaction.get(purchaseRef);
        if (!pSnap.exists()) {
            throw new Error("Purchase record not found.");
        }
        const pCurrentData = pSnap.data();
        if (pCurrentData.status === "cancelled") {
            throw new Error("Purchase is already cancelled.");
        }

        for (const entry of stockBatchesToArchive) {
            const sRef = doc(db, "stocks", entry.docId);
            const sSnap = await transaction.get(sRef);
            if (
                !sSnap.exists() ||
                sSnap.data().is_archived ||
                Number(sSnap.data().quantity || 0) < entry.item.quantity
            ) {
                throw new Error(
                    `This purchase cannot be cancelled because some items from this purchase have already been sold or used.`
                );
            }
        }

        // 2. WRITE PHASE inside transaction:
        // a. Mark purchase status as "cancelled" with cancellation metadata
        transaction.update(purchaseRef, {
            status: "cancelled",
            cancelled_at: Timestamp.fromDate(now),
            cancelled_by: adminId,
            cancelled_by_name: adminName,
            cancel_reason: cleanReason,
            is_deleted: false,
            updated_at: serverTimestamp(),
        });

        // b. Deduct original purchase quantity from stock batch and log type: "purchase_void"
        for (const entry of stockBatchesToArchive) {
            const sRef = doc(db, "stocks", entry.docId);
            transaction.update(sRef, {
                quantity: 0,
                is_archived: true,
                updated_at: serverTimestamp(),
            });

            const currentTotal = productCurrentTotals.get(entry.item.product_id) || 0;
            const newTotal = Math.max(0, currentTotal - entry.item.quantity);

            // Create Stock Movement log with type "purchase_void" (NOT adjustment_out)
            const movementRef = doc(collection(db, "stock_movements"));
            transaction.set(movementRef, {
                product_id: entry.item.product_id,
                product_name: entry.item.product_name || "Product",
                product_barcode: entry.item.product_barcode || "",
                type: "purchase_void",
                quantity: entry.item.quantity,
                unit_cost: entry.item.cost || 0,
                total_cost: (entry.item.cost || 0) * entry.item.quantity,
                from_warehouse_id: purchaseData.warehouse_id || "main",
                previous_stock_level: currentTotal,
                new_stock_level: newTotal,
                reference_id: purchaseData.id,
                reference_no: purchaseData.reference_no,
                reference: purchaseData.reference_no,
                reason: cleanReason,
                note: `Purchase cancelled: ${purchaseData.reference_no}`,
                created_by: adminId,
                created_by_name: adminName,
                date: Timestamp.fromDate(now),
                created_at: serverTimestamp(),
            });

            productCurrentTotals.set(entry.item.product_id, newTotal);
        }
    });
}

/**
 * Backward compatibility wrapper for deletePurchase -> calls cancelPurchase
 */
export async function deletePurchase(
    purchaseId: string,
    userContext?: { id: string; name: string },
    reason?: string
): Promise<void> {
    return cancelPurchase(purchaseId, reason || "Purchase cancelled by user", userContext);
}
