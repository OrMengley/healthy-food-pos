import { db } from "./config";
import {
    collection,
    addDoc,
    updateDoc,
    doc,
    getDocs,
    query,
    serverTimestamp,
} from "firebase/firestore";
import { Supplier } from "@/types";
import { parseFirestoreDate } from "@/lib/utils";

// --- Suppliers ---

export async function getSuppliers() {
    const q = query(collection(db, "suppliers"));
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((d) => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                created_at: parseFirestoreDate(data.created_at),
            } as Supplier;
        })
        .filter((s) => !s.is_deleted)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function createSupplier(data: Omit<Supplier, "id" | "created_at" | "is_deleted">) {
    // Filter out undefined values — Firestore rejects them
    const cleanData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined)
    );
    const docRef = await addDoc(collection(db, "suppliers"), {
        ...cleanData,
        is_deleted: false,
        created_at: serverTimestamp(),
    });
    return docRef.id;
}

export async function updateSupplier(id: string, data: Partial<Supplier>) {
    const cleanData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined)
    );
    const docRef = doc(db, "suppliers", id);
    await updateDoc(docRef, {
        ...cleanData,
        updated_at: serverTimestamp(),
    });
}

export async function deleteSupplier(id: string) {
    const docRef = doc(db, "suppliers", id);
    await updateDoc(docRef, {
        is_deleted: true,
        updated_at: serverTimestamp(),
    });
}
