// =============================================================================
// ENUMS & UNION TYPES
// =============================================================================

export type Role = 'super_admin' | 'admin' | 'staff';


export type PaymentMethod = 'cash' | 'aba' | 'acleda' | 'aclida' | 'other' | 'wing';

export type StockMovementType = 'stock_in' | 'stock_out' | 'adjustment' | 'return' | 'transfer' | 'purchase_void';

export type StockTransactionType =
  | "purchase_in"
  | "sale_out"
  | "adjustment_in"
  | "adjustment_out"
  | "purchase_void";

export type PurchaseStatus = 'completed' | 'cancelled';

export type InvoiceStatus = 'paid' | 'not paid';

export type AdjustmentReason = 'Damaged' | 'Inventory Count Discrepancy' | 'Sample/Promo' | 'Other';

// =============================================================================
// STORE SETTINGS
// =============================================================================

export interface StoreSettings {
  id?: string;
  store_name: string;
  store_phone?: string;
  store_address?: string;
  store_logo?: string;
  exchange_rate_khr: number; // e.g. 4100 KHR = 1 USD
  receipt_footer?: string;
  updated_at?: Date;
}

// =============================================================================
// USER & AUTH
// =============================================================================

export interface User {
  id: string;
  uid?: string;
  name: string;
  email: string;
  username?: string;
  role: Role;
  status: 'active' | 'inactive';
  avatar_url?: string;
  created_at: Date;
  updated_at?: Date;
  is_archived: boolean;
  warehouse_id?: string;
}



// =============================================================================
// CUSTOMER & ORDER
// =============================================================================

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  location?: string;
  avatar_url?: string;
  created_at: Date;
  is_deleted: boolean;
}

export interface OrderHistory {
  id: string;
  sale_invoice_id: string;
  customer_id: string;
  price: number;
  total_price: number;
  date: Date;
  created_at: Date;
  is_archived: boolean;
}

// =============================================================================
// SALES INVOICE
// =============================================================================

export interface SaleInvoiceItem {
  stock_movement_id?: string;
  product_id: string;
  product_name: string;
  product_barcode: string;
  product_image?: string;
  quantity: number;
  cost?: number;
  price: number;
  discount: number;
  total_price: number;
}

export interface SaleInvoice {
  id: string;
  invoice_number?: string;
  customer_id: string;
  customer_name?: string;
  customer_type?: 'walk_in' | 'online' | string;
  customer_phone?: string;
  warehouse_id: string;
  items: SaleInvoiceItem[];
  sub_total: number;
  discount: number;
  tax: number;
  total_price: number;
  status: InvoiceStatus;
  payment_method: PaymentMethod;
  exchange_rate_khr?: number;
  created_by: string;
  created_by_name?: string;
  created_at: Date;
  is_archived: boolean;
}

// =============================================================================
// PRODUCT & CATEGORY
// =============================================================================

export interface Category {
  id: string;
  name: string;
  image?: string;
  status?: 'active' | 'inactive';
  created_at: Date;
  updated_at?: Date;
  archived_at?: Date;
  restored_at?: Date;
  is_archived: boolean;
}

export interface Product {
  id: string;
  name: string;
  barcode: string;
  price: number; // Stored in USD
  cost?: number;
  cost_recommand?: number;
  images: string[];
  thumbnails: string[];
  category_id?: string;
  status?: 'active' | 'inactive';
  description?: string;
  created_at: Date;
  is_archived: boolean;
}

export interface ProductWithStock extends Product {
  current_stock: number;
}

// =============================================================================
// WAREHOUSE & STOCK
// =============================================================================

export interface Warehouse {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  created_at: Date;
  is_archived: boolean;
}

export interface Stock {
  id: string;
  product_id: string;
  product_barcode?: string;
  warehouse_id: string;
  purchase_id?: string;
  purchase_item_id?: string;
  initial_quantity?: number;
  product: Product;
  cost: number;
  quantity: number;
  date: Date;
  created_by: string;
  created_by_name?: string;
  created_at: Date;
  is_archived: boolean;
}

export interface StockMovement {
  id: string;
  product_id: string;
  product_name?: string;
  product_barcode?: string;
  type: StockMovementType;
  quantity: number;
  unit_cost?: number;
  total_cost?: number;
  from_warehouse_id?: string;
  to_warehouse_id?: string;
  previous_stock_level: number;
  new_stock_level: number;
  note?: string;
  reason?: AdjustmentReason | string;
  reference?: string;
  created_by: string;
  created_by_name?: string;
  date: Date;
  created_at: Date;
}

// =============================================================================
// SUPPLIER & PURCHASE (Preserved for backward compatibility)
// =============================================================================

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  created_by: string;
  created_at: Date;
  is_deleted: boolean;
}

export interface Purchase {
  id: string;
  reference_no: string;
  warehouse_id: string;
  supplier_id?: string;
  supplier_name?: string;
  supplier_phone?: string;
  note?: string;
  items_count?: number;
  total_quantity?: number;
  sub_total: number;
  discount?: number;
  tax?: number;
  total_price: number;
  status?: PurchaseStatus;
  date: Date;
  created_by: string;
  created_by_name?: string;
  created_at: Date;
  updated_by?: string;
  updated_at?: Date;
  cancelled_by?: string;
  cancelled_by_name?: string;
  cancelled_at?: Date;
  cancel_reason?: string;
  deleted_by?: string;
  deleted_by_name?: string;
  deleted_at?: Date;
  is_deleted: boolean;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  product_name?: string;
  product_barcode?: string;
  product_image?: string;
  quantity: number;
  cost: number;
  total: number;
  created_at: Date;
}

export interface PurchasePayment {
  id: string;
  purchase_id: string;
  payment_method: string;
  amount: number;
  transaction_ref: string;
  created_at: Date;
  is_deleted: boolean;
}