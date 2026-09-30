import { db } from "./config";
import { runTransaction, doc, collection, serverTimestamp } from "firebase/firestore";
import { StockMovement, StockMovementType, Product } from "@/types";

/**
 * Creates a stock movement (in, out, adjustment) and updates the product stock/cost.
 * This runs in a transaction to ensure data integrity.
 */
export async function createStockMovement(
    movement: Omit<StockMovement, "id" | "created_at" | "previous_stock_level" | "new_stock_level">
) {
    /*
      TODO: Implement transaction logic
      1. specific reference to product doc
      2. runTransaction(db, async (transaction) => {
          const productDoc = await transaction.get(productRef);
          ... logic for calculating weighted average cost ...
          transaction.set(movementRef, ...);
          transaction.update(productRef, ...);
      });
    */
    throw new Error("Not implemented");
}
