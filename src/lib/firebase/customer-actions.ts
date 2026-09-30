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
import { Customer } from "@/types";
import { parseFirestoreDate } from "@/lib/utils";

// --- Customers ---

export async function getCustomers() {
    const q = query(collection(db, "customers"));
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((d) => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                created_at: parseFirestoreDate(data.created_at),
            } as Customer;
        })
        .filter((c) => !c.is_deleted)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function createCustomer(data: Omit<Customer, "id" | "created_at" | "is_deleted">) {
    const cleanData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined)
    );
    const docRef = await addDoc(collection(db, "customers"), {
        ...cleanData,
        is_deleted: false,
        created_at: serverTimestamp(),
    });
    return docRef.id;
}

export async function updateCustomer(id: string, data: Partial<Customer>) {
    const cleanData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined)
    );
    const docRef = doc(db, "customers", id);
    await updateDoc(docRef, {
        ...cleanData,
        updated_at: serverTimestamp(),
    });
}

export async function deleteCustomer(id: string) {
    const docRef = doc(db, "customers", id);
    await updateDoc(docRef, {
        is_deleted: true,
        updated_at: serverTimestamp(),
    });
}
