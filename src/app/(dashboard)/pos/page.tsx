"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  ShoppingCart01Icon,
  Search01Icon,
  BarcodeScanIcon,
  Delete01Icon,
  Add01Icon,
  Remove01Icon,
  Loading01Icon,
  PrinterIcon,
  TagsIcon,
  Cash01Icon,
  CreditCardIcon,
  QrCodeIcon,
  CheckmarkCircle01Icon,
  Invoice01Icon,
  Cancel01Icon,
  RotateLeft01Icon,
  UserIcon,
  Call02Icon,
  Store01Icon,
  Globe02Icon,
  ShoppingBag01Icon,
  DeliveryTruck01Icon,
  Edit02Icon,
} from "hugeicons-react";
import Image from "next/image";
import { getProducts, getCategories } from "@/lib/firebase/actions";
import { getStocks } from "@/lib/firebase/stock-actions";
import { getCustomers } from "@/lib/firebase/customer-actions";
import {
  createSale,
  getSaleInvoices,
  cancelSaleInvoice,
} from "@/lib/firebase/sale-actions";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import {
  Product,
  Category,
  SaleInvoice,
  StoreSettings,
  PaymentMethod,
  ProductWithStock,
  Customer,
} from "@/types";
import { getOptimizedImageUrl, formatCambodiaDate } from "@/lib/utils";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

interface CartItem {
  product: ProductWithStock;
  quantity: number;
  price: number;
  discount: number;
}

export default function POSPage() {
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState<"pos" | "history">("pos");
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);

  // POS State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderDiscount, setOrderDiscount] = useState<number | "">("");

  // Payment Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customerType, setCustomerType] = useState<"walk_in" | "online">("walk_in");
  const [customerName, setCustomerName] = useState<string>("Walk-in Customer");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [onlinePlatform, setOnlinePlatform] = useState<string>("Telegram");
  const [submittingSale, setSubmittingSale] = useState(false);

  // Receipt Modal State
  const [receiptInvoice, setReceiptInvoice] = useState<SaleInvoice | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  // History Search
  const [historySearch, setHistorySearch] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Scanner Keyboard Buffer
  const barcodeBufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [prods, cats, allStocks, invs, storeConfig, custList] = await Promise.all([
        getProducts(),
        getCategories(),
        getStocks(),
        getSaleInvoices(),
        getStoreSettings(),
        getCustomers(),
      ]);

      setCustomers(custList);

      const isSuperAdmin = role === "super_admin";
      const userWarehouseId = user?.warehouse_id;

      const stockMap: Record<string, number> = {};
      allStocks.forEach((s) => {
        if (isSuperAdmin || !userWarehouseId || s.warehouse_id === userWarehouseId) {
          stockMap[s.product_id] = (stockMap[s.product_id] || 0) + Number(s.quantity || 0);
        }
      });

      const prodsWithStock = prods.map((p) => ({
        ...p,
        current_stock: stockMap[p.id] || 0,
      }));

      // Filter invoices for non-super_admin
      let visibleInvoices = invs;
      if (!isSuperAdmin && userWarehouseId) {
        visibleInvoices = invs.filter((inv) => inv.warehouse_id === userWarehouseId);
      }
      if (role === "staff") {
        visibleInvoices = visibleInvoices.filter(
          (inv) => inv.created_by === user?.id || (userWarehouseId && inv.warehouse_id === userWarehouseId)
        );
      }

      setProducts(prodsWithStock);
      setCategories(cats);
      setInvoices(visibleInvoices);
      setSettings(storeConfig);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load POS catalog");
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addToCart = (product: ProductWithStock) => {
    if (product.current_stock <= 0) {
      toast.error(`"${product.name}" is out of stock!`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.current_stock) {
          toast.error(`Cannot add more. Only ${product.current_stock} in stock.`);
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        return [
          ...prev,
          {
            product,
            quantity: 1,
            price: product.price,
            discount: 0,
          },
        ];
      }
    });
  };

  const handleScanBarcode = (barcode: string) => {
    const clean = barcode.toLowerCase().trim();
    const product = products.find(
      (p) => p.barcode?.toLowerCase().trim() === clean || p.id === clean
    );

    if (product) {
      addToCart(product);
      toast.success(`Scanned: ${product.name}`, { duration: 1500 });
    } else {
      toast.error(`Barcode not found: ${barcode}`);
    }
  };

  // Handle Barcode Scanner hardware listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input other than global barcode scan
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA";
      
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      // Reset buffer if key interval is too long (human typing)
      if (timeDiff > 100) {
        barcodeBufferRef.current = "";
      }

      if (e.key === "Enter") {
        const scannedCode = barcodeBufferRef.current.trim();
        if (scannedCode.length >= 3) {
          e.preventDefault();
          handleScanBarcode(scannedCode);
          barcodeBufferRef.current = "";
        }
      } else if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [products, cart]);


  // Update item selling price flexibly
  const updateItemPrice = (productId: string, newPrice: number) => {
    const priceVal = isNaN(newPrice) ? 0 : Math.max(0, newPrice);
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, price: priceVal } : item
      )
    );
  };

  const updateQuantity = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }

    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id === productId) {
          if (newQty > item.product.current_stock) {
            toast.error(`Max available stock is ${item.product.current_stock}`);
            return { ...item, quantity: item.product.current_stock };
          }
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  };

  const updateItemDiscount = (productId: string, discount: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, discount: Math.max(0, discount) } : item
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setOrderDiscount("");
  };

  // Cart Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const itemTotal = (item.price - item.discount) * item.quantity;
      return sum + Math.max(0, itemTotal);
    }, 0);
  }, [cart]);

  const totalDiscount = Number(orderDiscount) || 0;
  const grandTotalUsd = Math.max(0, subtotal - totalDiscount);
  const grandTotalKhr = Math.round(grandTotalUsd * (settings.exchange_rate_khr || 4100));

  // Product Filter
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (p.status === "inactive") return false;
      if (selectedCategory !== "all" && p.category_id !== selectedCategory) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name?.toLowerCase().includes(q);
        const matchBarcode = p.barcode?.toLowerCase().includes(q);
        return matchName || matchBarcode;
      }

      return true;
    });
  }, [products, selectedCategory, searchQuery]);

  // Checkout Handlers
  const handleOpenPayment = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    // Set default customer name if empty
    if (!customerName.trim()) {
      setCustomerName(customerType === "online" ? "Online Customer" : "Walk-in Customer");
    }
    setPaymentModalOpen(true);
  };

  // Switch customer type with smart defaults
  const handleCustomerTypeChange = (type: "walk_in" | "online") => {
    setCustomerType(type);
    setSelectedCustomerId("");
    if (type === "walk_in") {
      if (customerName === "Online Customer" || customerName.includes("Online") || !customerName.trim()) {
        setCustomerName("Walk-in Customer");
      }
    } else {
      if (customerName === "Walk-in Customer" || !customerName.trim()) {
        setCustomerName("Online Customer");
      }
    }
  };

  const handleSelectExistingCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const found = customers.find((c) => c.id === customerId);
    if (found) {
      setCustomerName(found.name);
      if (found.phone) setCustomerPhone(found.phone);
    }
  };

  const handleConfirmCheckout = async () => {
    try {
      setSubmittingSale(true);

      const items = cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount,
      }));

      const finalCustomerName = customerName.trim() || (customerType === "online" ? "Online Customer" : "Walk-in Customer");
      const targetWarehouseId = user?.warehouse_id || "main";

      const { invoiceId, invoiceNumber } = await createSale({
        items,
        discount: totalDiscount,
        payment_method: paymentMethod,
        exchange_rate_khr: settings.exchange_rate_khr || 4100,
        warehouse_id: targetWarehouseId,
        created_by: user?.id || "Staff",
        created_by_name: user?.name || "Staff",
        customer_id: selectedCustomerId,
        customer_name: finalCustomerName,
        customer_type: customerType,
        customer_phone: customerPhone.trim(),
      });

      toast.success(`Sale completed! Invoice #${invoiceNumber}`);

      // Set up receipt for modal
      const newInvoice: SaleInvoice = {
        id: invoiceId,
        invoice_number: invoiceNumber,
        customer_id: selectedCustomerId,
        customer_name: finalCustomerName,
        customer_type: customerType,
        customer_phone: customerPhone.trim(),
        warehouse_id: targetWarehouseId,
        items: cart.map((item) => ({
          product_id: item.product.id,
          product_name: item.product.name,
          product_barcode: item.product.barcode,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount,
          total_price: (item.price - item.discount) * item.quantity,
        })),
        sub_total: subtotal,
        discount: totalDiscount,
        tax: 0,
        total_price: grandTotalUsd,
        status: "paid",
        payment_method: paymentMethod,
        exchange_rate_khr: settings.exchange_rate_khr || 4100,
        created_by: user?.id || "Staff",
        created_by_name: user?.name || "Staff",
        created_at: new Date(),
        is_archived: false,
      };

      setReceiptInvoice(newInvoice);
      setReceiptModalOpen(true);

      // Reset cart and modal
      clearCart();
      setCustomerName("Walk-in Customer");
      setCustomerPhone("");
      setSelectedCustomerId("");
      setCustomerType("walk_in");
      setPaymentModalOpen(false);

      // Reload products to reflect deducted stock
      loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to complete checkout");
    } finally {
      setSubmittingSale(false);
    }
  };

  // Cancel Sale in History
  const handleCancelInvoice = async (invoice: SaleInvoice) => {
    if (
      !confirm(
        `Are you sure you want to cancel Invoice #${invoice.invoice_number || invoice.id}? Stock will be safely returned.`
      )
    ) {
      return;
    }

    try {
      setCancellingId(invoice.id);
      await cancelSaleInvoice(invoice.id, "Admin", "Admin");
      toast.success("Invoice cancelled and stock safely restored!");
      loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to cancel invoice");
    } finally {
      setCancellingId(null);
    }
  };

  // Filtered Invoices for History
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (!historySearch.trim()) return true;
      const q = historySearch.toLowerCase().trim();
      const numMatch = inv.invoice_number?.toLowerCase().includes(q) || inv.id.toLowerCase().includes(q);
      const custMatch = inv.customer_name?.toLowerCase().includes(q);
      const phoneMatch = inv.customer_phone?.toLowerCase().includes(q);
      const methodMatch = inv.payment_method?.toLowerCase().includes(q);
      const userMatch = inv.created_by_name?.toLowerCase().includes(q);
      return numMatch || custMatch || phoneMatch || methodMatch || userMatch;
    });
  }, [invoices, historySearch]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Top Bar with Tabs */}
      <div className="flex items-center justify-between px-4 lg:px-6 py-2.5 bg-background border-b shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <ShoppingCart01Icon className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-foreground">
              {settings.store_name || "Healthy Food POS"}
            </h1>
            <p className="text-[11px] text-muted-foreground font-medium">
              Rate: 1 USD = {settings.exchange_rate_khr?.toLocaleString() || "4,100"} ៛
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="h-9">
            <TabsTrigger value="pos" className="gap-1.5 text-xs font-bold">
              <ShoppingCart01Icon className="size-3.5" />
              Counter POS
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs font-bold">
              <Invoice01Icon className="size-3.5" />
              Sales History ({invoices.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === "pos" ? (
        /* POS Layout: Left Product Catalog (65%), Right Cart (35%) */
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden">
          {/* Left Column: Search, Categories, Product Cards */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col min-h-0 border-r overflow-hidden bg-muted/10">
            {/* Search & Category Header */}
            <div className="p-3 lg:p-4 bg-background border-b space-y-2.5 shrink-0">
              <div className="relative">
                <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Scan barcode (HF-...) or type product name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 h-10 bg-background text-sm font-medium border-primary/20"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <Cancel01Icon className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <Button
                  size="sm"
                  variant={selectedCategory === "all" ? "default" : "outline"}
                  onClick={() => setSelectedCategory("all")}
                  className="h-7 text-xs rounded-full px-3 font-semibold shrink-0"
                >
                  All ({products.filter((p) => p.status !== "inactive").length})
                </Button>
                {categories.map((cat) => {
                  if (cat.status === "inactive") return null;
                  const count = products.filter((p) => p.category_id === cat.id && p.status !== "inactive").length;
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <Button
                      key={cat.id}
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => setSelectedCategory(isSelected ? "all" : cat.id)}
                      className="h-7 text-xs rounded-full px-3 font-semibold shrink-0 gap-1.5"
                    >
                      {cat.name}
                      <span className="text-[10px] opacity-70">({count})</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Product Cards Grid */}
            <ScrollArea className="flex-1 p-3 lg:p-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                  <Loading01Icon className="animate-spin size-8 text-primary" />
                  <p className="text-sm font-semibold">Loading healthy menu...</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                  <BarcodeScanIcon className="size-10 text-muted-foreground/40" />
                  <p className="font-bold text-sm">No products found</p>
                  <p className="text-xs">Scan a barcode or adjust search filters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pb-8">
                  {filteredProducts.map((product) => {
                    const isOutOfStock = product.current_stock <= 0;
                    const priceKhr = Math.round(product.price * (settings.exchange_rate_khr || 4100)).toLocaleString();

                    return (
                      <Card
                        key={product.id}
                        onClick={() => !isOutOfStock && addToCart(product)}
                        className={`cursor-pointer overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/50 group flex flex-col justify-between ${
                          isOutOfStock ? "opacity-50 cursor-not-allowed bg-muted/40" : "bg-card"
                        }`}
                      >
                        {/* Image */}
                        <div className="relative aspect-4/3 w-full bg-muted/40 overflow-hidden flex items-center justify-center border-b">
                          {product.thumbnails?.[0] || product.images?.[0] ? (
                            <Image
                              src={getOptimizedImageUrl(product.thumbnails?.[0] || product.images?.[0], 300)}
                              alt={product.name}
                              fill
                              className="object-cover group-hover:scale-105 transition-transform"
                              sizes="180px"
                            />
                          ) : (
                            <div className="p-4 text-muted-foreground/40">
                              <ShoppingCart01Icon className="size-8" />
                            </div>
                          )}

                          {/* Stock badge overlay */}
                          <div className="absolute top-2 right-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-black px-1.5 py-0 shadow-xs ${
                                isOutOfStock
                                  ? "bg-rose-500 text-white border-none"
                                  : product.current_stock <= 5
                                  ? "bg-amber-500 text-white border-none"
                                  : "bg-white/95 text-neutral-800 border-neutral-200 backdrop-blur"
                              }`}
                            >
                              {isOutOfStock ? "Out of stock" : `${product.current_stock} left`}
                            </Badge>
                          </div>
                        </div>

                        {/* Card Info */}
                        <div className="p-3 flex flex-col gap-1 flex-1 justify-between">
                          <div>
                            <p className="font-bold text-sm text-foreground line-clamp-1 leading-snug">
                              {product.name}
                            </p>
                            <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-1 mt-0.5">
                              <BarcodeScanIcon className="size-3" />
                              {product.barcode}
                            </p>
                          </div>

                          <div className="pt-2 flex items-baseline justify-between border-t border-muted/60 mt-2">
                            <div className="font-black text-base text-primary">
                              ${product.price.toFixed(2)}
                            </div>
                            <div className="text-[10px] font-semibold text-muted-foreground">
                              {priceKhr} ៛
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Right Column: Active Cart & Checkout */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col min-h-0 bg-card border-t lg:border-t-0">
            {/* Cart Header */}
            <div className="p-4 border-b flex items-center justify-between bg-primary/5 shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart01Icon className="size-5 text-primary" />
                <h2 className="font-bold text-sm text-foreground">Current Order</h2>
                <Badge variant="secondary" className="text-xs font-bold px-2 py-0">
                  {cart.reduce((s, i) => s + i.quantity, 0)} items
                </Badge>
              </div>

              {cart.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCart}
                  className="h-7 text-xs text-destructive hover:bg-destructive/10 px-2"
                >
                  <Delete01Icon className="size-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            {/* Cart Items List */}
            <ScrollArea className="flex-1 p-3">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3 text-center">
                  <div className="p-4 rounded-full bg-muted/60">
                    <ShoppingCart01Icon className="size-8 text-muted-foreground/50" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">Your cart is empty</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Click items or scan barcodes to begin a sale.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {cart.map((item) => {
                    const lineTotal = (item.price - item.discount) * item.quantity;
                    const isCustomPrice = item.price !== item.product.price;

                    return (
                      <div
                        key={item.product.id}
                        className="p-3 rounded-2xl border border-border/80 bg-background shadow-2xs space-y-2.5 transition-all"
                      >
                        {/* Header: Product Name, Base Price, Line Total */}
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-xs text-foreground truncate">
                              {item.product.name}
                            </p>
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                              <span className="font-mono">
                                Base: ${item.product.price.toFixed(2)}
                              </span>
                              <span>•</span>
                              <span>Stock: {item.product.current_stock}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-black text-sm text-foreground tabular-nums">
                              ${lineTotal.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              ≈ {Math.round(lineTotal * (settings.exchange_rate_khr || 4100)).toLocaleString()} ៛
                            </div>
                          </div>
                        </div>

                        {/* Flexible Selling Price & Line Discount Controls */}
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/60">
                          {/* Flexible Selling Price Input */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                                <Edit02Icon className="size-2.5 text-primary" />
                                <span>Sell Price ($):</span>
                              </Label>
                              {isCustomPrice && (
                                <button
                                  type="button"
                                  onClick={() => updateItemPrice(item.product.id, item.product.price)}
                                  className="text-[9px] text-primary hover:underline font-semibold"
                                  title="Reset to original product price"
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                            <div className="relative flex items-center">
                              <span className="absolute left-2 text-[11px] font-bold text-muted-foreground pointer-events-none">$</span>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.price}
                                onChange={(e) =>
                                  updateItemPrice(item.product.id, parseFloat(e.target.value) || 0)
                                }
                                className={`h-7 pl-5 pr-1 text-xs font-bold rounded-lg ${
                                  isCustomPrice
                                    ? "bg-amber-500/10 border-amber-500/40 text-amber-900 dark:text-amber-200"
                                    : "bg-muted/30 font-semibold"
                                }`}
                              />
                            </div>
                          </div>

                          {/* Line Discount Input */}
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-muted-foreground">
                              Discount ($):
                            </Label>
                            <div className="relative flex items-center">
                              <span className="absolute left-2 text-[11px] font-bold text-muted-foreground pointer-events-none">$</span>
                              <Input
                                type="number"
                                min="0"
                                step="0.1"
                                placeholder="0.00"
                                value={item.discount || ""}
                                onChange={(e) =>
                                  updateItemDiscount(item.product.id, parseFloat(e.target.value) || 0)
                                }
                                className="h-7 pl-5 pr-1 text-xs font-semibold bg-muted/30 rounded-lg text-center"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Quantity Controls & Remove */}
                        <div className="flex items-center justify-between pt-1 border-t border-border/40">
                          <span className="text-[10px] text-muted-foreground font-medium font-mono">
                            {item.quantity} × ${(item.price - item.discount).toFixed(2)}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                              className="size-7 rounded-lg hover:bg-muted"
                            >
                              <Remove01Icon className="size-3" />
                            </Button>
                            <span className="w-7 text-center font-black text-xs tabular-nums">
                              {item.quantity}
                            </span>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                              className="size-7 rounded-lg hover:bg-muted"
                            >
                              <Add01Icon className="size-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeFromCart(item.product.id)}
                              className="size-7 text-destructive hover:bg-destructive/10 ml-0.5 rounded-lg"
                              title="Remove item"
                            >
                              <Delete01Icon className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* Cart Footer: Totals & Checkout */}
            <div className="p-4 border-t bg-muted/20 space-y-3 shrink-0">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal:</span>
                  <span className="font-semibold text-foreground">${subtotal.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Order Discount ($):</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="0.00"
                    value={orderDiscount}
                    onChange={(e) => setOrderDiscount(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                    className="h-7 w-24 text-right text-xs font-semibold"
                  />
                </div>

                <Separator />

                <div className="flex justify-between items-center text-base font-black text-foreground pt-1">
                  <span>Total (USD):</span>
                  <span className="text-xl text-primary font-black tabular-nums">
                    ${grandTotalUsd.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs font-bold text-muted-foreground">
                  <span>Total (KHR):</span>
                  <span className="text-sm font-black text-foreground tabular-nums">
                    {grandTotalKhr.toLocaleString()} ៛
                  </span>
                </div>
              </div>

              <Button
                size="lg"
                disabled={cart.length === 0}
                onClick={handleOpenPayment}
                className="w-full h-12 bg-primary hover:bg-primary/90 font-black text-base shadow-lg tracking-wide uppercase gap-2"
              >
                <Cash01Icon className="size-5" />
                Pay ${grandTotalUsd.toFixed(2)}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Sales History View */
        <div className="flex-1 p-4 lg:p-6 overflow-y-auto space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search invoice #, payment method, cashier..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="pl-9 h-10 text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Total Invoices: <strong>{filteredInvoices.length}</strong>
            </p>
          </div>

          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-bold">Invoice #</TableHead>
                  <TableHead className="font-bold">Date & Time</TableHead>
                  <TableHead className="font-bold">Customer</TableHead>
                  <TableHead className="font-bold">Items</TableHead>
                  <TableHead className="font-bold">Payment</TableHead>
                  <TableHead className="font-bold">Total (USD / KHR)</TableHead>
                  <TableHead className="font-bold">Cashier</TableHead>
                  <TableHead className="text-right font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-48 text-muted-foreground">
                      No sales history found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((inv) => {
                    const rate = inv.exchange_rate_khr || 4100;
                    const khr = Math.round(Number(inv.total_price || 0) * rate).toLocaleString();
                    const isCancelled = inv.is_archived || inv.status === "not paid";

                    return (
                      <TableRow key={inv.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono font-bold text-sm text-primary">
                          {inv.invoice_number || inv.id}
                          {isCancelled && (
                            <Badge variant="destructive" className="ml-2 text-[10px]">Cancelled</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {inv.created_at ? formatCambodiaDate(inv.created_at, "datetime") : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-bold text-xs text-foreground">
                              {inv.customer_name || "Walk-in Customer"}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge
                                variant="outline"
                                className={`text-[9px] font-bold px-1.5 py-0 ${
                                  inv.customer_type === "online"
                                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-300"
                                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300"
                                }`}
                              >
                                {inv.customer_type === "online" ? "Online" : "Walk-in"}
                              </Badge>
                              {inv.customer_phone && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {inv.customer_phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-semibold">
                          {inv.items?.reduce((s, i) => s + i.quantity, 0) || 0} items
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="uppercase font-bold text-[10px]">
                            {inv.payment_method}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-sm text-foreground">${Number(inv.total_price || 0).toFixed(2)}</div>
                          <div className="text-[10px] text-muted-foreground">{khr} ៛</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {inv.created_by_name || "Admin"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setReceiptInvoice(inv);
                                setReceiptModalOpen(true);
                              }}
                              className="h-8 text-xs font-semibold gap-1"
                            >
                              <PrinterIcon className="size-3.5" />
                              Receipt
                            </Button>
                            {!isCancelled && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={cancellingId === inv.id}
                                onClick={() => handleCancelInvoice(inv)}
                                className="h-8 text-xs text-destructive hover:bg-destructive/10"
                                title="Cancel and return stock"
                              >
                                {cancellingId === inv.id ? (
                                  <Loading01Icon className="size-3.5 animate-spin" />
                                ) : (
                                  <RotateLeft01Icon className="size-3.5" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border border-border/80 bg-background shadow-2xl rounded-2xl">
          <DialogHeader className="p-5 pb-3 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
            <DialogTitle className="flex items-center gap-2 font-black text-lg text-foreground">
              <div className="p-1.5 rounded-xl bg-primary/10 text-primary">
                <Cash01Icon className="size-5 text-primary" />
              </div>
              Confirm Payment & Customer
            </DialogTitle>
          </DialogHeader>

          <div className="p-5 space-y-4 max-h-[calc(85vh-8rem)] overflow-y-auto">
            {/* Amount Summary Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/25 text-center space-y-1">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Total Amount Due
              </p>
              <p className="text-3xl font-black text-primary font-mono tabular-nums">
                ${grandTotalUsd.toFixed(2)}
              </p>
              <p className="text-sm font-black text-foreground font-mono">
                ≈ {grandTotalKhr.toLocaleString()} ៛ KHR
              </p>
            </div>

            {/* 1. Customer Type Selector (Walk-in vs Online) */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <UserIcon className="size-3.5 text-primary" />
                <span>Customer / Order Channel <span className="text-destructive">*</span></span>
              </Label>
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  type="button"
                  variant={customerType === "walk_in" ? "default" : "outline"}
                  onClick={() => handleCustomerTypeChange("walk_in")}
                  className={`h-12 flex items-center justify-start gap-2.5 rounded-xl font-bold text-xs ${
                    customerType === "walk_in"
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs border-emerald-600"
                      : "border-border/80 hover:bg-muted"
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${customerType === "walk_in" ? "bg-white/20" : "bg-muted"}`}>
                    <Store01Icon className="size-4" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-xs">Walk-in Customer</div>
                    <div className={`text-[10px] font-normal ${customerType === "walk_in" ? "text-emerald-100" : "text-muted-foreground"}`}>
                      In-store pos purchase
                    </div>
                  </div>
                </Button>

                <Button
                  type="button"
                  variant={customerType === "online" ? "default" : "outline"}
                  onClick={() => handleCustomerTypeChange("online")}
                  className={`h-12 flex items-center justify-start gap-2.5 rounded-xl font-bold text-xs ${
                    customerType === "online"
                      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs border-blue-600"
                      : "border-border/80 hover:bg-muted"
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${customerType === "online" ? "bg-white/20" : "bg-muted"}`}>
                    <Globe02Icon className="size-4" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-xs">Online / Delivery</div>
                    <div className={`text-[10px] font-normal ${customerType === "online" ? "text-blue-100" : "text-muted-foreground"}`}>
                      Grab, Telegram, Social
                    </div>
                  </div>
                </Button>
              </div>
            </div>

            {/* Quick Online Channels Selector if Online is chosen */}
            {customerType === "online" && (
              <div className="space-y-1.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <span className="text-[10px] font-bold text-blue-900 dark:text-blue-300 uppercase block">
                  Quick Online Channel:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {["Telegram", "GrabFood", "FoodPanda", "NHAM24", "Facebook", "Phone Call", "Other"].map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => {
                        setOnlinePlatform(ch);
                        setCustomerName(`${ch} Customer`);
                      }}
                      className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold border transition-all ${
                        customerName.includes(ch) || onlinePlatform === ch
                          ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                          : "bg-background text-foreground border-border/80 hover:bg-muted"
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Customer Name & Saved Profile Selection */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="cust-name" className="text-xs font-bold text-foreground">
                  Customer Name <span className="text-destructive">*</span>
                </Label>
                {customers.length > 0 && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span>Registered:</span>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => handleSelectExistingCustomer(e.target.value)}
                      className="text-[11px] bg-muted/60 border border-border/80 rounded-lg px-2 py-0.5 font-semibold text-foreground"
                    >
                      <option value="">-- Pick registered --</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="cust-name"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (selectedCustomerId) setSelectedCustomerId("");
                  }}
                  placeholder={customerType === "online" ? "e.g. Online Customer / Telegram" : "e.g. Walk-in Customer"}
                  className="pl-9 h-10 bg-background text-sm rounded-xl font-medium border-border/80"
                  required
                />
              </div>
            </div>

            {/* 3. Customer Phone Number (Optional) */}
            <div className="space-y-1.5">
              <Label htmlFor="cust-phone" className="text-xs font-bold text-foreground flex items-center justify-between">
                <span>Customer Phone Number</span>
                <span className="text-muted-foreground font-normal text-[11px]">(Optional)</span>
              </Label>
              <div className="relative">
                <Call02Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="cust-phone"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g. 012 345 678 (optional)"
                  className="pl-9 h-10 bg-background text-sm font-mono rounded-xl border-border/80 font-medium"
                />
              </div>
            </div>

            {/* 4. Payment Method Selector */}
            <div className="space-y-2 pt-1">
              <p className="text-xs font-bold text-foreground uppercase tracking-wider">Choose Payment Method</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "cash", label: "Cash (USD / ៛)", icon: Cash01Icon },
                  { id: "aba", label: "ABA KHQR", icon: QrCodeIcon },
                  { id: "acleda", label: "ACLEDA KHQR", icon: QrCodeIcon },
                  { id: "other", label: "Other", icon: CreditCardIcon },
                ].map((m) => {
                  const Icon = m.icon;
                  const isSelected = paymentMethod === m.id;
                  return (
                    <Button
                      key={m.id}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => setPaymentMethod(m.id as PaymentMethod)}
                      className={`h-11 flex items-center justify-start gap-2 rounded-xl font-bold text-xs ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "hover:bg-primary/5 hover:border-primary/40 border-border/80"
                      }`}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{m.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="p-4 border-t bg-muted/20 gap-2 sm:gap-0">
            <Button
              variant="outline"
              type="button"
              onClick={() => setPaymentModalOpen(false)}
              className="rounded-xl text-xs font-semibold"
            >
              Back to Cart
            </Button>
            <Button
              type="button"
              disabled={submittingSale}
              onClick={handleConfirmCheckout}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl gap-2 shadow-xs"
            >
              {submittingSale ? (
                <>
                  <Loading01Icon className="size-4 animate-spin" />
                  <span>Recording Sale...</span>
                </>
              ) : (
                <>
                  <CheckmarkCircle01Icon className="size-4" />
                  <span>Complete Sale & Print</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
      <ReceiptModal
        invoice={receiptInvoice}
        open={receiptModalOpen}
        onOpenChange={setReceiptModalOpen}
      />
    </div>
  );
}
