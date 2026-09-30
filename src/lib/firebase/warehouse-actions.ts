import { db } from "./config";
import {
    collection,
    addDoc,
    updateDoc,
    doc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
} from "firebase/firestore";
import { Warehouse } from "@/types";
import { parseFirestoreDate } from "@/lib/utils";

export async function getWarehouses() {
    const q = query(
        collection(db, "warehouses"),
        where("is_archived", "==", false)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                created_at: parseFirestoreDate(data.created_at),
            } as Warehouse;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function createWarehouse(data: Omit<Warehouse, "id" | "created_at" | "is_archived">) {
    await addDoc(collection(db, "warehouses"), {
        ...data,
        created_at: serverTimestamp(),
        is_archived: false,
    });
}

export async function updateWarehouse(id: string, data: Partial<Warehouse>) {
    const docRef = doc(db, "warehouses", id);
    await updateDoc(docRef, {
        ...data,
        updated_at: serverTimestamp(),
    });
}

export async function archiveWarehouse(id: string) {
    const docRef = doc(db, "warehouses", id);
    await updateDoc(docRef, {
        is_archived: true,
        archived_at: serverTimestamp(),
    });
}
