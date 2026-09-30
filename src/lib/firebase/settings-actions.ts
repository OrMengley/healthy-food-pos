import { db } from "./config";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { StoreSettings } from "@/types";
import { parseFirestoreDate } from "@/lib/utils";

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  store_name: "Healthy Food Store",
  store_phone: "+855 12 345 678",
  store_address: "Phnom Penh, Cambodia",
  store_logo: "",
  exchange_rate_khr: 4100,
  receipt_footer: "Thank you for choosing healthy food! Wishing you good health.",
};

const SETTINGS_DOC_ID = "store_config";

export async function getStoreSettings(): Promise<StoreSettings> {
  try {
    const docRef = doc(db, "settings", SETTINGS_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        ...DEFAULT_STORE_SETTINGS,
        ...data,
        id: snap.id,
        updated_at: parseFirestoreDate(data.updated_at),
      };
    }
  } catch (error) {
    console.error("Failed to load store settings, using defaults:", error);
  }
  return DEFAULT_STORE_SETTINGS;
}

export async function updateStoreSettings(settings: Partial<StoreSettings>): Promise<void> {
  const docRef = doc(db, "settings", SETTINGS_DOC_ID);
  await setDoc(
    docRef,
    {
      ...settings,
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}
