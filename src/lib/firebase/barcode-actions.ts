import { db } from "./config";
import {
  doc,
  collection,
  getDocs,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Previews the next available sequential HF barcode WITHOUT incrementing the counter.
 * This prevents barcode number wastage when users click "Auto HF" multiple times without saving.
 */
export async function previewNextBarcode(): Promise<string> {
  const counterRef = doc(db, "counters", "product_barcode");
  const snap = await getDoc(counterRef);

  let nextNumber = 1;
  if (snap.exists() && typeof snap.data().last_number === "number") {
    nextNumber = snap.data().last_number + 1;
  } else {
    // Find highest existing HF-XXXXXX barcode from products
    const productsSnap = await getDocs(collection(db, "products"));
    let maxNum = 0;
    productsSnap.forEach((docSnap) => {
      const barcode = docSnap.data().barcode;
      if (typeof barcode === "string" && barcode.startsWith("HF-")) {
        const numPart = parseInt(barcode.replace("HF-", ""), 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    });
    nextNumber = maxNum + 1;
  }

  return `HF-${String(nextNumber).padStart(6, "0")}`;
}

/**
 * Non-destructive barcode generator alias for previewing sequential HF barcode.
 */
export const generateNextBarcode = previewNextBarcode;

/**
 * Atomically reserves and advances the sequential barcode counter in Firestore.
 */
export async function commitNextBarcode(): Promise<string> {
  const counterRef = doc(db, "counters", "product_barcode");

  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    let nextNumber = 1;

    if (snap.exists() && typeof snap.data().last_number === "number") {
      nextNumber = snap.data().last_number + 1;
    } else {
      const productsSnap = await getDocs(collection(db, "products"));
      let maxNum = 0;
      productsSnap.forEach((docSnap) => {
        const barcode = docSnap.data().barcode;
        if (typeof barcode === "string" && barcode.startsWith("HF-")) {
          const numPart = parseInt(barcode.replace("HF-", ""), 10);
          if (!isNaN(numPart) && numPart > maxNum) {
            maxNum = numPart;
          }
        }
      });
      nextNumber = maxNum + 1;
    }

    transaction.set(
      counterRef,
      {
        last_number: nextNumber,
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );

    return `HF-${String(nextNumber).padStart(6, "0")}`;
  });
}

