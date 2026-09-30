I have copied an existing Car Accessories Stock + POS project into a new project folder.

I want to transform this copied project into a simple single-store Healthy Food POS and Stock Management system. This is a free system for a small physical shop with only around 20–30 products.

Important working rules:
1. First inspect the current frontend, backend, MongoDB models, routes, and existing features.
2. Reuse the current project architecture, authentication, POS, products, inventory, sales, and barcode logic wherever possible.
3. Do not rewrite the entire project or change its tech stack.
4. Do not modify the original TK Custom project; only work in this copied project folder.
5. Before implementing, provide a short list of files/features that should be kept, removed from UI, renamed, or simplified. Then implement after that plan is approved.

Target system scope:

Business setup:
- One company/store only
- One branch only
- One warehouse/inventory only
- Admin user only at first
- Products: around 20–30 healthy food items
- Physical counter sales only
- No customer website ordering
- No multi-branch, stock transfer, borrow stock, company switching, or complicated permissions
- No expiry date, batch/lot tracking, supplier management, accounting, income/expense, quotation, vehicle compatibility, warranty, or serial number features

Required modules:

1. Dashboard
- Today sales total
- Total orders today
- Low stock products
- Current total stock
- Best selling products

2. Categories
- Simple CRUD: name, image optional, status

3. Products
- Product image
- Product name
- Category
- Selling price
- Cost price optional
- Current stock quantity
- Barcode
- Status
- Description optional
- Search products by name or barcode
- Automatically generate a unique internal barcode for a product when needed.
- Suggested barcode format: HF-000001, HF-000002, etc.
- Use Code 128 barcode format.

4. Barcode label printing
- Add a “Print Barcode” action on product list and product detail.
- User can select label quantity before printing.
- Each label should show:
  - Shop name from settings
  - Product name
  - Code 128 barcode image
  - Barcode text
  - Selling price
- Ensure print layout is suitable for small barcode label printers.
- Build a print-friendly page/component so the browser print dialog can print the labels.
- Make label size configurable later, but use a sensible default now.

5. POS / Counter Sale
- Large, clean POS page for cashier/admin use
- Find product by typing name, clicking product card, or scanning barcode
- Barcode scanner behaves like keyboard input
- Add product to cart after scan
- Change quantity and remove cart item
- Optional item/order discount
- Payment methods: Cash, ABA, ACLEDA, Other
- Confirm sale
- Deduct product stock automatically after successful sale
- Generate invoice number
- Show a simple receipt after sale and enable reprint
- Prevent sale when stock is insufficient

6. Stock
- Simple Stock In page:
  - choose product
  - add quantity
  - optional cost
  - note
  - date
  - increase product stock
- Stock Adjustment page:
  - choose product
  - adjustment type: add or deduct
  - quantity
  - reason/note
  - date
  - update product stock
- Keep stock transaction history for every stock in, sale deduction, and adjustment.

7. Sales History
- List invoices with date, invoice number, total, payment method, and user
- View sale detail
- Reprint receipt
- Do not allow direct editing of completed sales. If cancellation exists in the old project, keep it only if it safely returns stock.

8. Settings
- Store name
- Store logo optional
- Currency display: USD and Khmer Riel
- Receipt footer text optional

UI direction:
- Remove or hide car-accessory-specific text and pages.
- Rename all relevant labels to generic Product, Category, Stock, POS, Sales.
- Keep the UI very simple, fast, and Khmer-friendly.
- Prioritize desktop/laptop counter usage, while remaining responsive on tablet.
- Do not expose unused advanced features in the navigation.

Deliverables:
- A concise refactoring plan first.
- Then implement the simplified Healthy Food POS version.
- List all changed files.
- Explain how to run and test:
  1. create a product
  2. generate/print barcode labels
  3. scan/sell product in POS
  4. check stock deduction
  5. stock in and adjustment