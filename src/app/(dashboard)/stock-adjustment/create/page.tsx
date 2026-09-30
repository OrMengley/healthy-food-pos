import { redirect } from "next/navigation";

export default function CreateStockAdjustmentRedirect() {
  redirect("/stock-adjustment/new");
}
