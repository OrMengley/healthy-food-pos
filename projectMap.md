# ANTIGRAVITY – Inventory & Stock Management System

Modern, lightweight inventory management application with role-based access, soft deletion, and detailed stock movement history supporting variable purchase costs.

**Project Codename:** ANTIGRAVITY  
**Goal:** Build a clean, fast, maintainable inventory system that feels effortless to use (hence "anti-gravity").

## Tech Stack

- **Frontend / Framework**     : Next.js 14+ (App Router) + TypeScript  
- **Styling**                  : Tailwind CSS + shadcn/ui  
- **Backend / Database**       : Firebase Firestore  
- **Authentication**           : Firebase Authentication (email/password)  
- **Deployment**               : Vercel  
- **Other libraries**          : lucide-react, date-fns, zod, @tanstack/react-table  

## Core Entities & Collections

| Collection         | Key Fields                                      | Soft Delete | Notes                                                                 |
|--------------------|-------------------------------------------------|-------------|-----------------------------------------------------------------------|
| `categories`       | id, name, created_at, is_archived               | Yes         | Soft delete via `is_archived: true`                                   |
| `products`         | id, name, barcode, price, images[], thumbnails[], category_id?, current_stock?, average_cost?, last_purchase_cost?, created_at, is_archived | Yes | Selling price + denormalized stock & cost fields                     |
| `stock_movements`  | id, product_id, type, quantity, unit_cost?, total_cost?, previous_stock_level?, new_stock_level?, note?, reference?, created_by?, created_at | No          | History / audit trail — never archived                                |
| `users`            | id, name, username, role, created_at, is_archived | Yes       | Roles: admin, sale, logistic                                          |

### Stock Movement Types

```text
stock_in      → new purchase / restock (has unit_cost)
stock_out     → sale / consumption
adjustment    → manual correction (positive or negative)
return        → returned to stock
transfer      → moved between locations (future)

Folder Structure Highlights
app/
├── (auth)/login/page.tsx
├── (dashboard)/
│   ├── layout.tsx
│   ├── page.tsx                  # Dashboard home
│   ├── categories/
│   ├── products/
│   │   ├── [id]/
│   │   │   ├── page.tsx
│   │   │   └── stock-history/page.tsx
│   ├── inventory/
│   │   ├── page.tsx              # Movements list
│   │   └── new/page.tsx          # Create movement (in/out/adjust)
│   └── users/
components/
├── ui/                           # shadcn
├── layout/
│   ├── Navbar.tsx
│   └── Sidebar.tsx
├── forms/
│   ├── StockMovementForm.tsx
│   └── ProductForm.tsx
├── DataTable/
lib/
├── firebase/
│   ├── config.ts
│   └── transactions.ts           # receiveStock, etc.
├── types/
│   └── index.ts
hooks/
└── useAuth.ts


Cost Handling Strategy

Variable purchase costs are stored per stock_in movement (unit_cost)
Weighted average cost is calculated and stored on product document (average_cost)
Current stock level is denormalized on product (current_stock)
All updates happen in transactions to prevent inconsistencies


Naming Convention (Important!)

Firestore fields → snake_caseproduct_id, unit_cost, created_by, current_stock, average_cost, stock_movements, is_archived
TypeScript / JS variables & properties → camelCaseproductId, unitCost, createdBy, currentStock

Features Implemented / Planned
Implemented / In Progress

Role-based access (admin, sale, logistic)
Categories CRUD (create, list, soft archive)
Products list + soft delete
Stock movements log with variable purchase cost support
Weighted average cost calculation (denormalized on product)
Transactional stock receive (stock_in) with average cost update

Planned / Next Steps

Stock out / sale flow with COGS calculation
Product detail page with stock history table
Search/filter products & movements
Image upload for products (Firebase Storage)
Low-stock alerts / dashboard widgets
User management (admin only)
Basic reports (stock value, movement summary)
Zod validation + form libraries (react-hook-form)
Firestore security rules

Cost Handling Strategy

Variable purchase costs are stored per stock_in movement (unit_cost)
Weighted average cost is calculated and stored on product document (average_cost)
Current stock level is denormalized on product (current_stock)
All updates happen in transactions to prevent inconsistencies

Philosophy
"Make inventory management feel weightless."
Keep it simple, fast, auditable, and correct — even when costs change, stock moves, or people make mistakes.
Last updated: 2025
Happy coding! 🚀