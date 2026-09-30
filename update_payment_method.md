Update the POS “Confirm Payment” flow for `cash` payment to support USD, Khmer Riel (KHR), and mixed-currency cash payments.

## Base rule

- System base currency is USD.
- Use a configurable exchange rate:

```ts
exchangeRate = 4000; // 1 USD = 4,000 KHR
```

- The exchange rate must be displayed in the payment dialog.
- Allow authorized users to edit the exchange rate before confirming payment.
- Save the exact exchange rate used on every sale invoice. Do not recalculate old invoices with a new rate later.

## Cash payment UI

When payment method is `cash`, show these sections:

```text
Invoice Total
- USD total: $10.00
- KHR equivalent: 40,000 ៛

Exchange Rate
- 1 USD = 4,000 KHR

Customer Paid
- Paid USD: [$        ]
- Paid KHR: [៛        ]

Payment Summary
- Total received: $...
- Remaining: $... / ...៛
- Change: $... / ...៛
```

Do NOT show these cash fields for non-cash payment methods such as bank transfer, ABA, card, or QR payment.

## Payment calculation

```ts
paidKhrInUsd = paidKhr / exchangeRate;

totalReceivedUsd = paidUsd + paidKhrInUsd;

remainingUsd = Math.max(0, invoiceGrandTotalUsd - totalReceivedUsd);

changeUsd = Math.max(0, totalReceivedUsd - invoiceGrandTotalUsd);
```

Always display both USD and KHR equivalents:

```ts
remainingKhr = remainingUsd * exchangeRate;
changeKhr = changeUsd * exchangeRate;
```

Use safe money rounding:
- USD: 2 decimal places
- KHR: whole number, rounded to nearest 100 Riel
- Avoid JavaScript floating-point display errors.

## Required examples

### Example 1: Mixed payment, customer still owes money

```text
Invoice total: $10.00 = 40,000៛
Customer pays: 20,000៛
Exchange rate: 4,000៛ per $1

Received: $5.00 = 20,000៛
Remaining: $5.00 = 20,000៛
Change: $0.00
```

The Confirm Payment button must be disabled while there is a remaining balance, unless the system has an existing “partial payment / credit” feature.

### Example 2: Customer pays USD only

```text
Invoice total: $10.00
Customer pays: $10.00

Received: $10.00
Remaining: $0.00
Change: $0.00
```

### Example 3: Customer pays KHR only and receives change

```text
Invoice total: $10.00 = 40,000៛
Customer pays: 50,000៛

Received: $12.50 = 50,000៛
Remaining: $0.00
Change: 10,000៛
```

### Example 4: Customer pays mixed USD and KHR

```text
Invoice total: $10.00 = 40,000៛
Customer pays: $6.00 + 20,000៛
Exchange rate: 4,000៛ per $1

Received: $11.00
Remaining: $0.00
Change: $1.00 = 4,000៛
```

## Change currency

When `changeUsd > 0`, show a required “Change Currency” option:

```text
- USD
- KHR
```

Default selection:
- If customer paid KHR only, default to KHR.
- If customer paid USD only, default to USD.
- If customer paid mixed currencies, default to KHR but allow cashier to change it.

Display only the selected change currency prominently:

```text
Change to give: 4,000៛
```

Save both the currency selected and the exact change amount.

## Sale model update

Update the sale/payment model with separate fields. Do not store only one combined payment value.

```ts
interface CashPayment {
  method: "cash";
  exchangeRate: number;

  invoiceTotalUsd: number;
  invoiceTotalKhr: number;

  paidUsd: number;
  paidKhr: number;
  totalReceivedUsd: number;
  totalReceivedKhr: number;

  remainingUsd: number;
  remainingKhr: number;

  changeUsd: number;
  changeKhr: number;
  changeCurrency: "USD" | "KHR" | null;
}

interface Sale {
  // keep existing fields
  paymentMethod: "cash" | "aba" | "bank_transfer" | "card" | "qr";
  cashPayment?: CashPayment;
}
```

For non-cash methods, `cashPayment` must be `undefined`.

## Receipt and reports

Receipt must clearly show:

```text
Total: $10.00 (40,000៛)
Paid USD: $6.00
Paid KHR: 20,000៛
Exchange Rate: 1 USD = 4,000៛
Change: 4,000៛
```

Do not count `change` as an expense, discount, or loss.

In cash reports:
- Report cash received in USD and KHR separately.
- Report the exchange rate stored on each sale.
- Do not mix paid amount and change as income.
- Sale income remains the invoice grand total only.

## UI and validation

- Use a clean shadcn dialog layout.
- Inputs default to `0`.
- Block negative values.
- Recalculate instantly when cashier changes invoice total, payment amounts, exchange rate, or change currency.
- Use i18n for Khmer and English labels/messages.
- Preserve all existing payment methods and do not change stock deduction logic.