Update the Purchase cancellation flow.

Current problem:
When an admin deletes/cancels a purchase, the system creates a stock transaction with type `adjustment_out` / `adjustment (-)`. This is incorrect because stock adjustment represents damaged, lost, expired, or stock count difference. It may incorrectly affect expense, stock-loss reports, and Profit & Loss.

## Required change

Do NOT create `adjustment_out` when cancelling a purchase.

Create a new stock transaction type:

```ts
type StockTransactionType =
  | "purchase_in"
  | "sale_out"
  | "adjustment_in"
  | "adjustment_out"
  | "purchase_void";
```

`purchase_void` means the original purchase was entered incorrectly and has been cancelled.

## Purchase cancellation rules

1. Do not permanently delete the purchase document/record.
2. Change its status from `completed` to:

```ts
status: "cancelled"
```

3. Save cancellation information:

```ts
cancelled_at: string
cancelled_by: string
cancel_reason: string
```

4. For every purchase item:
   - Find the exact inventory/batch created by that purchase.
   - Check if the available quantity of that purchase batch is enough to reverse.

```ts
availableQty >= purchaseItem.quantity
```

5. If every purchase item has sufficient available quantity:
   - Deduct the original purchase quantity from the exact purchase batch.
   - Create a `stock_transactions` record with:

```ts
type: "purchase_void"
quantity: -purchaseItem.quantity
reference_id: purchase.id
reference_no: purchase.purchase_no
note: `Purchase cancelled: ${purchase.purchase_no}`
```

6. If any item quantity has already been sold, transferred, adjusted, or used:
   - Block the cancellation of the purchase.
   - Do not change inventory.
   - Do not create any transaction.
   - Return a clear error message showing the affected product/batch.

Example Khmer error:

```text
មិនអាចលុបការទិញនេះបានទេ ព្រោះមានទំនិញមួយចំនួនពីការទិញនេះត្រូវបានលក់ ឬប្រើប្រាស់រួចហើយ។
```

Example English error:

```text
This purchase cannot be cancelled because some items from this purchase have already been sold or used.
```

## Accounting / Report rule

`purchase_void` must NOT be treated as:

- Stock adjustment expense
- Stock loss
- Damage expense
- COGS
- Profit & Loss expense

For purchase reports:

```text
Net Purchase = Total Purchase In - Total Purchase Void
```

For inventory quantity:

```text
Inventory Qty = Purchase In - Purchase Void - Sale Out ± Adjustment
```

Only `adjustment_out` should appear in stock loss/adjustment reports.

## UI changes

Replace “Delete Purchase” with:

```text
Cancel Purchase
```

Use a confirmation dialog with:
- Cancellation reason textarea, required
- Warning that the action is only allowed if stock from this purchase has not been used
- Confirm button: `Cancel Purchase`
- Cancel button

After successful cancellation:
- Update purchase status badge to `Cancelled`
- Disable Edit and Cancel buttons for that purchase
- Show the purchase record in history for audit purposes
- Refresh purchase list, inventory, and stock transaction list

Use a database transaction / atomic operation so purchase status, inventory quantity, batch quantity, and `purchase_void` stock transaction are updated together. If any operation fails, roll back all changes.

Do not change the existing `adjustment_in` and `adjustment_out` functionality.