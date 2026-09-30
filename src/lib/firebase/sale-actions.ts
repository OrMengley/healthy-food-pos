import { db } from "./config";
import {
    collection,
    doc,
    getDocs,
    updateDoc,
    query,
    where,
    serverTimestamp,
    runTransaction,
    Timestamp,
} from "firebase/firestore";
import { SaleInvoice, Product, Stock, PaymentMethod, CashPayment } from "@/types";
import { format } from "date-fns";
import { parseFirestoreDate, formatCambodiaDate } from "@/lib/utils";


export interface CreateSaleInput {
    customer_id?: string;
    customer_name?: string;
    customer_type?: 'walk_in' | 'online' | string;
    customer_phone?: string;
    warehouse_id?: string;
    items: {
        product_id: string;
        quantity: number;
        price: number;
        discount?: number;
    }[];
    discount?: number;
    tax?: number;
    status?: 'paid' | 'not paid';
    payment_method: PaymentMethod;
    cash_payment?: CashPayment;
    exchange_rate_khr?: number;
    created_by?: string;
    created_by_name?: string;
}

export async function createSale(data: CreateSaleInput) {
    const warehouseId = data.warehouse_id || "main";
    const discount = Number(data.discount) || 0;
    const tax = Number(data.tax) || 0;
    const exchangeRateKhr = Number(data.exchange_rate_khr) || 4100;
    const cashierId = data.created_by || "Admin";
    const cashierName = data.created_by_name || "Admin";
    const customerType = data.customer_type || "walk_in";
    const customerPhone = data.customer_phone?.trim() || "";
    const customerName = data.customer_name?.trim() || (customerType === "online" ? "Online Customer" : "Walk-in Customer");
    const now = new Date();

    const dateCode = formatCambodiaDate(now, "code");
    const invoiceNumber = `HF-${dateCode}-${Math.floor(1000 + Math.random() * 9000)}`;

    const { invoiceId } = await runTransaction(db, async (transaction) => {
        let subTotal = 0;
        const invoiceItems: any[] = [];

        // 1. READ PHASE: Gather product and stock data
        const productDatas = new Map<string, Product>();
        const availableStocksMap = new Map<string, Stock[]>();
        const productTotalStockMap = new Map<string, number>();

        for (const item of data.items) {
            const productRef = doc(db, "products", item.product_id);
            const productSnap = await transaction.get(productRef);
            if (!productSnap.exists()) {
                throw new Error(`Product ${item.product_id} not found`);
            }
            const productData = { ...productSnap.data(), id: productSnap.id } as Product;
            productDatas.set(item.product_id, productData);

            // Fetch all active stocks for product
            const allStocksQuery = query(
                collection(db, "stocks"),
                where("product_id", "==", item.product_id),
                where("is_archived", "==", false)
            );
            const allStockSnaps = await getDocs(allStocksQuery);
            let productTotalStock = 0;
            allStockSnaps.forEach((d) => {
                productTotalStock += Number(d.data().quantity || 0);
            });
            productTotalStockMap.set(item.product_id, productTotalStock);

            const availableStocks = allStockSnaps.docs
                .map((d) => {
                    const sData = d.data();
                    return {
                        id: d.id,
                        ...sData,
                        date: parseFirestoreDate(sData.date || sData.created_at),
                    } as Stock;
                })
                .filter((s) => Number(s.quantity || 0) > 0)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const totalAvailable = availableStocks.reduce((sum, s) => sum + s.quantity, 0);
            if (totalAvailable < item.quantity) {
                throw new Error(
                    `Insufficient stock for "${productData.name}". Available: ${totalAvailable}, Requested: ${item.quantity}`
                );
            }
            availableStocksMap.set(item.product_id, availableStocks);
        }

        // 2. WRITE PHASE: Deduct stocks FIFO & record stock movements
        for (const item of data.items) {
            const productData = productDatas.get(item.product_id)!;
            const availableStocks = availableStocksMap.get(item.product_id)!;
            let productTotalStock = productTotalStockMap.get(item.product_id)!;

            const itemDiscount = Number(item.discount) || 0;
            let remainingToDeduct = item.quantity;

            for (const stockRecord of availableStocks) {
                if (remainingToDeduct <= 0) break;

                const takeQty = Math.min(stockRecord.quantity, remainingToDeduct);
                const stockRef = doc(db, "stocks", stockRecord.id);

                transaction.update(stockRef, {
                    quantity: stockRecord.quantity - takeQty,
                    updated_at: serverTimestamp(),
                });

                // Create Stock Movement log
                const movementRef = doc(collection(db, "stock_movements"));
                transaction.set(movementRef, {
                    product_id: item.product_id,
                    product_name: productData.name,
                    product_barcode: productData.barcode,
                    type: "stock_out",
                    quantity: takeQty,
                    unit_cost: stockRecord.cost || 0,
                    total_cost: (stockRecord.cost || 0) * takeQty,
                    from_warehouse_id: warehouseId,
                    previous_stock_level: productTotalStock,
                    new_stock_level: productTotalStock - takeQty,
                    note: `POS Sale #${invoiceNumber} (${customerName})`,
                    created_by: cashierId,
                    created_by_name: cashierName,
                    date: Timestamp.fromDate(now),
                    created_at: serverTimestamp(),
                });

                const itemTotalPrice = (item.price * takeQty) - (itemDiscount * takeQty);
                invoiceItems.push({
                    stock_movement_id: movementRef.id,
                    cost: stockRecord.cost || 0,
                    price: item.price,
                    product_id: item.product_id,
                    product_name: productData.name,
                    product_barcode: productData.barcode,
                    product_image: productData.thumbnails?.[0] || productData.images?.[0] || "",
                    quantity: takeQty,
                    discount: itemDiscount,
                    total_price: itemTotalPrice,
                });

                subTotal += itemTotalPrice;
                remainingToDeduct -= takeQty;
                productTotalStock -= takeQty;
            }
        }

        // 3. Create Sale Invoice Document
        const finalTotalPrice = Math.max(0, (subTotal - discount) + tax);
        const invoiceRef = doc(collection(db, "sale_invoices"));
        const invoiceDoc: any = {
            invoice_number: invoiceNumber,
            customer_id: data.customer_id || "",
            customer_name: customerName,
            customer_type: customerType,
            customer_phone: customerPhone,
            warehouse_id: warehouseId,
            items: invoiceItems,
            sub_total: subTotal,
            discount: discount,
            tax: tax,
            total_price: finalTotalPrice,
            status: data.status || "paid",
            payment_method: data.payment_method,
            exchange_rate_khr: exchangeRateKhr,
            created_by: cashierId,
            created_by_name: cashierName,
            created_at: serverTimestamp(),
            is_archived: false,
        };

        if (data.payment_method === "cash" && data.cash_payment) {
            invoiceDoc.cash_payment = data.cash_payment;
        }

        transaction.set(invoiceRef, invoiceDoc);

        return { invoiceId: invoiceRef.id };
    });

    return { invoiceId, invoiceNumber };
}

// --- Read Sale Invoices ---

export async function getSaleInvoices(): Promise<SaleInvoice[]> {
    const q = query(
        collection(db, "sale_invoices"),
        where("is_archived", "==", false)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((d) => {
            const data = d.data();
            return {
                id: d.id,
                customer_id: data.customer_id || "",
                customer_name: data.customer_name || "Walk-in Customer",
                customer_type: data.customer_type || "walk_in",
                customer_phone: data.customer_phone || "",
                warehouse_id: data.warehouse_id || "main",
                ...data,
                cash_payment: data.cash_payment || data.cashPayment || undefined,
                invoice_number: data.invoice_number || `INV-${d.id.slice(0, 8).toUpperCase()}`,
                created_at: parseFirestoreDate(data.created_at),
            } as SaleInvoice;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * Safely cancel/refund a sale invoice by returning stock items and logging movements.
 */
export async function cancelSaleInvoice(invoiceId: string, cancelledBy?: string, cancelledByName?: string) {
    return await runTransaction(db, async (transaction) => {
        const invoiceRef = doc(db, "sale_invoices", invoiceId);
        const invoiceSnap = await transaction.get(invoiceRef);
        if (!invoiceSnap.exists()) throw new Error("Invoice not found");
        
        const invoiceData = invoiceSnap.data() as SaleInvoice;
        if (invoiceData.is_archived) {
            throw new Error("Invoice is already cancelled");
        }

        const now = new Date();

        // Return stock for each item
        for (const item of invoiceData.items) {
            const productRef = doc(db, "products", item.product_id);
            const productSnap = await transaction.get(productRef);
            const productData = productSnap.exists() ? (productSnap.data() as Product) : null;

            // Fetch current stock
            const allStocksQuery = query(
                collection(db, "stocks"),
                where("product_id", "==", item.product_id),
                where("is_archived", "==", false)
            );
            const allStockSnaps = await getDocs(allStocksQuery);
            let prevStock = 0;
            allStockSnaps.forEach(d => prevStock += Number(d.data().quantity || 0));

            // Create stock batch back
            const stockRef = doc(collection(db, "stocks"));
            transaction.set(stockRef, {
                product_id: item.product_id,
                product_barcode: item.product_barcode,
                warehouse_id: invoiceData.warehouse_id || "main",
                product: productData ? { ...productData, id: item.product_id } : { name: item.product_name, barcode: item.product_barcode },
                cost: item.cost || 0,
                quantity: item.quantity,
                date: Timestamp.fromDate(now),
                is_archived: false,
                created_by: cancelledBy || "Admin",
                created_at: serverTimestamp(),
            });

            // Log stock movement return
            const movementRef = doc(collection(db, "stock_movements"));
            transaction.set(movementRef, {
                product_id: item.product_id,
                product_name: item.product_name,
                product_barcode: item.product_barcode,
                type: "return",
                quantity: item.quantity,
                unit_cost: item.cost || 0,
                total_cost: (item.cost || 0) * item.quantity,
                to_warehouse_id: invoiceData.warehouse_id || "main",
                previous_stock_level: prevStock,
                new_stock_level: prevStock + item.quantity,
                note: `Sale Cancellation #${invoiceData.invoice_number || invoiceId}`,
                created_by: cancelledBy || "Admin",
                created_by_name: cancelledByName || "Admin",
                date: Timestamp.fromDate(now),
                created_at: serverTimestamp(),
            });
        }

        // Mark invoice as cancelled/archived
        transaction.update(invoiceRef, {
            is_archived: true,
            status: "not paid",
            cancelled_at: serverTimestamp(),
            cancelled_by: cancelledBy || "Admin",
        });
    });
}

// --- Delete (archive) Sale Invoice ---
export async function deleteSaleInvoice(id: string) {
    const docRef = doc(db, "sale_invoices", id);
    await updateDoc(docRef, {
        is_archived: true,
        updated_at: serverTimestamp(),
    });
}
