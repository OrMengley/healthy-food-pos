"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getProducts } from "@/lib/firebase/actions";
import { getStocks } from "@/lib/firebase/stock-actions";
import { getWarehouses } from "@/lib/firebase/warehouse-actions";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import { createPurchase, generatePurchaseRefNo } from "@/lib/firebase/purchase-actions";
import { ProductWithStock, Warehouse, StoreSettings } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  Package01Icon,
  BarcodeScanIcon,
  Dollar01Icon,
  Loading01Icon,
  CheckmarkCircle01Icon,
  Calendar01Icon,
  StickyNote02Icon,
  Add01Icon,
  Delete01Icon,
  Refresh01Icon,
  UserIcon,
  Call02Icon,
  Store01Icon,
  Invoice01Icon,
  Layers01Icon,
  SparklesIcon,
} from "hugeicons-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import Image from "next/image";
import {
  getOptimizedImageUrl,
  getCambodiaDateTimeLocalString,
  parseCambodiaInputDate,
  formatCambodiaDate
} from "@/lib/utils";
import { SelectProductModal } from "@/components/modals/SelectProductModal";
import { getCategories } from "@/lib/firebase/actions";
import { Category } from "@/types";

interface PurchaseRowItem {
  product_id: string;
  product_name: string;
  product_barcode: string;
  product_image?: string;
  current_stock: number;
  quantity: number;
  cost: number;
}

export default function PurchaseStockInPage() {
  const router = useRouter();
  const { user, role } = useAuth();

  // Data state
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [referenceNo, setReferenceNo] = useState<string>("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("main");
  const [dateTimeStr, setDateTimeStr] = useState<string>(getCambodiaDateTimeLocalString(new Date()));
  const [supplierName, setSupplierName] = useState<string>("");
  const [supplierPhone, setSupplierPhone] = useState<string>("");
  const [note, setNote] = useState<string>("");

  // Purchase items table
  const [items, setItems] = useState<PurchaseRowItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState<string>("");
  const [selectModalOpen, setSelectModalOpen] = useState(false);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [prods, allStocks, warehouseList, storeConfig, catList] = await Promise.all([
          getProducts(),
          getStocks(),
          getWarehouses(),
          getStoreSettings(),
          getCategories(),
        ]);

        setWarehouses(warehouseList);
        setSettings(storeConfig);
        setCategories(catList);

        const initialWhId =
          role !== "super_admin" && user?.warehouse_id
            ? user.warehouse_id
            : warehouseList[0]?.id || "main";
        setSelectedWarehouseId(initialWhId);

        const stockMap: Record<string, number> = {};
        allStocks.forEach((s) => {
          if (!initialWhId || s.warehouse_id === initialWhId) {
            stockMap[s.product_id] = (stockMap[s.product_id] || 0) + Number(s.quantity || 0);
          }
        });

        const prodsWithStock = prods
          .filter((p) => p.status !== "inactive")
          .map((p) => ({
            ...p,
            current_stock: stockMap[p.id] || 0,
          }));

        setProducts(prodsWithStock);
        setReferenceNo(generatePurchaseRefNo());
      } catch (err) {
        console.error(err);
        toast.error("Failed to load initial data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user, role]);

  // Recalculate stock mapping when warehouse changes
  useEffect(() => {
    if (products.length === 0) return;
    getStocks().then((allStocks) => {
      const stockMap: Record<string, number> = {};
      allStocks.forEach((s) => {
        if (!selectedWarehouseId || s.warehouse_id === selectedWarehouseId) {
          stockMap[s.product_id] = (stockMap[s.product_id] || 0) + Number(s.quantity || 0);
        }
      });

      setProducts((prev) =>
        prev.map((p) => ({
          ...p,
          current_stock: stockMap[p.id] || 0,
        }))
      );

      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          current_stock: stockMap[item.product_id] || 0,
        }))
      );
    });
  }, [selectedWarehouseId]);

  // Add product to purchase items list
  const handleAddProduct = (product: ProductWithStock) => {
    setItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.product_id === product.id);
      if (existingIndex >= 0) {
        // Increment quantity of existing item
        const updated = [...prev];
        updated[existingIndex].quantity += 1;
        return updated;
      }

      // Add new row with recommended cost as default
      const defaultCost = Number(product.cost || product.cost_recommand || 0);
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          product_barcode: product.barcode,
          product_image: product.thumbnails?.[0] || product.images?.[0] || "",
          current_stock: product.current_stock || 0,
          quantity: 1,
          cost: defaultCost,
        },
      ];
    });
    toast.success(`Added "${product.name}" to purchase`);
  };

  // Quick Barcode scanning / Enter key
  const handleBarcodeSubmit = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!barcodeInput.trim()) return;

    const clean = barcodeInput.trim().toLowerCase();
    const found = products.find(
      (p) => p.barcode?.toLowerCase() === clean || p.name?.toLowerCase().includes(clean)
    );

    if (found) {
      handleAddProduct(found);
      setBarcodeInput("");
    } else {
      toast.error(`No product found matching "${barcodeInput}"`);
    }
  };

  // Update item quantity
  const handleQuantityChange = (productId: string, val: number | string) => {
    const num = Math.max(1, Number(val) || 1);
    setItems((prev) =>
      prev.map((item) => (item.product_id === productId ? { ...item, quantity: num } : item))
    );
  };

  // Update item cost (Flexible cost per unit)
  const handleCostChange = (productId: string, val: number | string) => {
    const costNum = Math.max(0, Number(val) || 0);
    setItems((prev) =>
      prev.map((item) => (item.product_id === productId ? { ...item, cost: costNum } : item))
    );
  };

  // Remove item row
  const handleRemoveItem = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.product_id !== productId));
  };

  // Totals calculations
  const totalItemsCount = items.length;
  const totalQuantity = useMemo(() => items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0), [items]);
  const subTotalUsd = useMemo(() => items.reduce((sum, item) => sum + (item.quantity * item.cost), 0), [items]);
  const totalKhr = Math.round(subTotalUsd * (settings.exchange_rate_khr || 4100));

  // Submit Purchase Order
  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) {
      toast.error("Please add at least one product to purchase.");
      return;
    }

    // Verify all items have quantity > 0
    for (const item of items) {
      if (!item.quantity || item.quantity <= 0) {
        toast.error(`Please enter a valid quantity for "${item.product_name}"`);
        return;
      }
    }

    try {
      setSubmitting(true);
      const purchaseDate = parseCambodiaInputDate(dateTimeStr);
      const currentUserName = user?.name || user?.username || "Admin";

      const payload = {
        reference_no: referenceNo.trim() || generatePurchaseRefNo(),
        warehouse_id: selectedWarehouseId,
        supplier_name: supplierName.trim(),
        supplier_phone: supplierPhone.trim(),
        note: note.trim(),
        date: purchaseDate,
        created_by: user?.id || "Admin",
        created_by_name: currentUserName,
        items: items.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          product_barcode: item.product_barcode,
          product_image: item.product_image,
          quantity: item.quantity,
          cost: item.cost,
          total: item.quantity * item.cost,
        })),
      };

      await createPurchase(payload);

      toast.success(`Purchase Order #${payload.reference_no} recorded successfully!`, {
        description: `Restocked ${totalQuantity} units across ${totalItemsCount} items at ${formatCambodiaDate(purchaseDate, "datetime")}.`,
        action: {
          label: "View Purchases",
          onClick: () => router.push("/purchases"),
        },
      });

      // Reset Form
      setItems([]);
      setSupplierName("");
      setSupplierPhone("");
      setNote("");
      setReferenceNo(generatePurchaseRefNo());
      setDateTimeStr(getCambodiaDateTimeLocalString(new Date()));

      // Refresh product stocks
      const [prods, allStocks] = await Promise.all([getProducts(), getStocks()]);
      const stockMap: Record<string, number> = {};
      allStocks.forEach((s) => {
        if (!selectedWarehouseId || s.warehouse_id === selectedWarehouseId) {
          stockMap[s.product_id] = (stockMap[s.product_id] || 0) + Number(s.quantity || 0);
        }
      });
      setProducts(
        prods
          .filter((p) => p.status !== "inactive")
          .map((p) => ({
            ...p,
            current_stock: stockMap[p.id] || 0,
          }))
      );
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to record purchase stock in");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-8 max-w-6xl mx-auto w-full">
      {/* ─── Page Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-2xs">
            <ArrowDown01Icon className="size-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight md:text-2xl text-foreground">
                Stock In (Purchase)
              </h1>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold border-emerald-300 text-xs">
                FIFO Batching
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Multi-product purchase restock with flexible unit costs, supplier info, and FIFO stock batching.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push("/purchases")}
            className="text-xs font-semibold rounded-xl border-border/80 hover:bg-muted gap-1.5"
          >
            <ArrowLeft01Icon className="size-4" />
            <span>Purchases List</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push("/stock-movement")}
            className="text-xs font-semibold rounded-xl border-border/80 hover:bg-muted"
          >
            View Stock History
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmitPurchase} className="space-y-6">
        {/* ─── 1. Purchase Header & Supplier Information Card ─── */}
        <Card className="border border-border/80 shadow-xs rounded-2xl overflow-hidden bg-card">
          <CardHeader className="py-3.5 px-5 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-b border-border/60">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Invoice01Icon className="size-4" />
                </div>
                Purchase Details & Supplier
              </CardTitle>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                <span>Created by:</span>
                <Badge variant="secondary" className="font-bold text-[11px] bg-muted text-foreground">
                  {user?.name || user?.username || "Admin"}
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Purchase Ref # */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                    <span>PO Reference # <span className="text-destructive">*</span></span>
                  </Label>
                  <button
                    type="button"
                    onClick={() => setReferenceNo(generatePurchaseRefNo())}
                    className="text-[11px] text-primary hover:underline font-bold flex items-center gap-1"
                    title="Generate new PO reference code"
                  >
                    <Refresh01Icon className="size-3" /> Auto
                  </button>
                </div>
                <Input
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  className="h-10 bg-background font-mono font-bold tracking-wider text-sm rounded-xl uppercase border-border/80"
                  required
                />
              </div>

              {/* Purchase Date & Time (Cambodia Timezone) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="purchase-date" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span>Purchase Date & Time <span className="text-destructive">*</span></span>
                    <Badge variant="outline" className="text-[10px] font-mono font-bold bg-primary/5 text-primary border-primary/20 px-1.5 py-0">
                      ICT (UTC+7)
                    </Badge>
                  </Label>
                  <button
                    type="button"
                    onClick={() => setDateTimeStr(getCambodiaDateTimeLocalString(new Date()))}
                    className="text-[11px] text-primary hover:underline font-bold flex items-center gap-1"
                    title="Set to current Cambodia time"
                  >
                    <Refresh01Icon className="size-3" /> Now
                  </button>
                </div>
                <div className="relative">
                  <Calendar01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="purchase-date"
                    type="datetime-local"
                    value={dateTimeStr}
                    onChange={(e) => setDateTimeStr(e.target.value)}
                    className="pl-9 h-10 bg-background text-sm rounded-xl border-border/80 font-medium"
                    required
                  />
                </div>
              </div>

              {/* Target Warehouse */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">
                  Target Warehouse <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={selectedWarehouseId}
                  onValueChange={setSelectedWarehouseId}
                  disabled={loading || (role !== "super_admin" && Boolean(user?.warehouse_id))}
                >
                  <SelectTrigger className="h-10 bg-background text-xs font-semibold rounded-xl border-border/80">
                    <SelectValue placeholder="Select warehouse..." />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.length > 0 ? (
                      warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id} className="text-xs font-medium">
                          {w.name} {w.address ? `(${w.address})` : ""}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="main">Main Warehouse</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Optional Supplier Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              {/* Supplier Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                  <Store01Icon className="size-3.5" />
                  Supplier / Vendor Name
                </Label>
                <Input
                  placeholder="e.g. Green Valley Farm Wholesale"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="h-10 bg-background text-sm rounded-xl border-border/80"
                />
              </div>

              {/* Supplier Phone */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                  <Call02Icon className="size-3.5" />
                  Supplier Phone
                </Label>
                <Input
                  placeholder="e.g. +855 12 345 678"
                  value={supplierPhone}
                  onChange={(e) => setSupplierPhone(e.target.value)}
                  className="h-10 bg-background text-sm rounded-xl border-border/80 font-mono"
                />
              </div>

              {/* Note / Memo */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                  <StickyNote02Icon className="size-3.5" />
                  Order Note / Reference
                </Label>
                <Input
                  placeholder="e.g. Weekly organic restock batch"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-10 bg-background text-sm rounded-xl border-border/80"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── 2. Multi-Product Purchase Items Table ─── */}
        <Card className="border border-border/80 shadow-xs rounded-2xl overflow-hidden bg-card">
          <CardHeader className="py-3.5 px-5 bg-muted/20 border-b border-border/60">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Package01Icon className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-foreground">
                    Purchase Line Items
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Add multiple products, adjust restock quantities, and customize purchase cost per unit.
                  </CardDescription>
                </div>
              </div>

              {/* Action Buttons: Add Product & Barcode Quick Input */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative hidden md:block">
                  <BarcodeScanIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Scan barcode or type..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleBarcodeSubmit(e);
                      }
                    }}
                    className="h-9 pl-9 pr-3 w-48 text-xs bg-background rounded-xl font-mono uppercase"
                  />
                </div>

                <Button
                  type="button"
                  onClick={() => setSelectModalOpen(true)}
                  className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-xs gap-1.5"
                >
                  <Add01Icon className="size-4" />
                  <span> Add Product</span>
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="size-14 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground/60 mb-3 border border-border/70">
                  <Package01Icon className="size-7" />
                </div>
                <h3 className="font-bold text-base text-foreground">No Products Added Yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  Click the <strong>&ldquo;+ Add Product&rdquo;</strong> button to search and select healthy food items for this purchase order.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectModalOpen(true)}
                  className="mt-4 font-bold text-xs gap-1.5 rounded-xl border-primary/30 text-primary hover:bg-primary/10"
                >
                  <Add01Icon className="size-4" />
                  Select Products to Purchase
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="w-12 text-center font-bold">#</TableHead>
                      <TableHead className="min-w-[200px] font-bold">Product & Barcode</TableHead>
                      <TableHead className="w-28 text-center font-bold">Stock Before</TableHead>
                      <TableHead className="w-36 text-center font-bold">Quantity (Units)</TableHead>
                      <TableHead className="w-40 font-bold">Unit Cost ($)</TableHead>
                      <TableHead className="w-36 text-right font-bold">Line Total</TableHead>
                      <TableHead className="w-12 text-center font-bold"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => {
                      const lineTotal = item.quantity * item.cost;
                      const lineTotalKhr = Math.round(lineTotal * (settings.exchange_rate_khr || 4100));

                      return (
                        <TableRow key={item.product_id} className="hover:bg-muted/20 transition-colors">
                          {/* Row Index */}
                          <TableCell className="text-center font-bold text-xs text-muted-foreground">
                            {idx + 1}
                          </TableCell>

                          {/* Product Info */}
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="relative size-10 rounded-xl overflow-hidden border border-border/80 bg-muted shrink-0 flex items-center justify-center shadow-2xs">
                                {item.product_image ? (
                                  <Image
                                    src={getOptimizedImageUrl(item.product_image, 150, 150)}
                                    alt={item.product_name}
                                    fill
                                    className="object-cover"
                                    sizes="40px"
                                  />
                                ) : (
                                  <Package01Icon className="size-4 text-muted-foreground" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-sm text-foreground truncate">
                                  {item.product_name}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono mt-0.5">
                                  <BarcodeScanIcon className="size-3 text-primary" />
                                  <span>{item.product_barcode}</span>
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          {/* Stock Before */}
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-bold text-xs px-2 py-0.5">
                              {item.current_stock} units
                            </Badge>
                          </TableCell>

                          {/* Quantity Input */}
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center">
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                value={item.quantity}
                                onChange={(e) => handleQuantityChange(item.product_id, e.target.value)}
                                className="h-9 w-24 text-center font-bold text-sm bg-background rounded-xl border-border/80 focus-visible:ring-emerald-500/20"
                                required
                              />
                            </div>
                          </TableCell>

                          {/* Unit Cost Input (Flexible) */}
                          <TableCell>
                            <div className="flex items-center h-9 rounded-xl border border-border/80 bg-background overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all shadow-2xs">
                              <div className="h-full px-2.5 flex items-center justify-center bg-muted/40 border-r border-border/70 text-muted-foreground font-bold text-xs select-none shrink-0">
                                $
                              </div>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={item.cost}
                                onChange={(e) => handleCostChange(item.product_id, e.target.value)}
                                className="h-full border-0 bg-transparent rounded-none px-2.5 text-sm font-bold text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          </TableCell>

                          {/* Line Total */}
                          <TableCell className="text-right">
                            <div className="font-extrabold text-sm text-foreground">
                              ${lineTotal.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-medium">
                              ≈ {lineTotalKhr.toLocaleString()} ៛
                            </div>
                          </TableCell>

                          {/* Delete Action */}
                          <TableCell className="text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveItem(item.product_id)}
                              className="size-8 text-destructive hover:bg-destructive/10 rounded-lg"
                              title="Remove item"
                            >
                              <Delete01Icon className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── 3. Grand Totals Summary & Submit Card ─── */}
        {items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
            {/* Left Note / Guidance */}
            <div className="p-4 rounded-2xl bg-muted/30 border border-border/70 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-foreground">
                <SparklesIcon className="size-4 text-emerald-600" />
                <span>FIFO Inventory Accounting</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Stock batches created by this purchase will be tracked with cost <strong>${subTotalUsd.toFixed(2)}</strong>. When sold at the POS counter, the oldest batches are deducted first to maintain accurate profit and margin tracking.
              </p>
            </div>

            {/* Right: Grand Summary & Confirmation Button */}
            <Card className="border border-emerald-500/30 shadow-md rounded-2xl bg-gradient-to-br from-card via-card to-emerald-500/5 overflow-hidden">
              <CardContent className="p-5 space-y-4">
                <div className="space-y-2 border-b border-border/60 pb-3 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Total Products:</span>
                    <strong className="text-foreground">{totalItemsCount} items</strong>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Total Units to Restock:</span>
                    <strong className="text-foreground font-bold">{totalQuantity} units</strong>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-bold text-base text-foreground">Grand Total Cost:</span>
                    <div className="text-right">
                      <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                        ${subTotalUsd.toFixed(2)}
                      </span>
                      <span className="block text-xs text-muted-foreground font-medium">
                        ≈ {totalKhr.toLocaleString()} ៛
                      </span>
                    </div>
                  </div>
                </div>

                {/* Submit Confirmation Button */}
                <Button
                  type="submit"
                  disabled={submitting || items.length === 0}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm uppercase tracking-wider rounded-xl shadow-md transition-all gap-2"
                >
                  {submitting ? (
                    <Loading01Icon className="animate-spin size-5" />
                  ) : (
                    <CheckmarkCircle01Icon className="size-5" />
                  )}
                  <span>Confirm & Record Purchase Stock In</span>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </form>

      {/* ─── Product Selection Dialog ─── */}
      <SelectProductModal
        open={selectModalOpen}
        onOpenChange={setSelectModalOpen}
        products={products}
        categories={categories}
        selectedProductIds={items.map((i) => i.product_id)}
        onSelectProduct={handleAddProduct}
      />
    </div>
  );
}
