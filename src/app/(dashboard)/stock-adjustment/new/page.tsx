"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { adjustStock, getStocks } from "@/lib/firebase/stock-actions";
import { getProducts, getCategories } from "@/lib/firebase/actions";
import { getWarehouses } from "@/lib/firebase/warehouse-actions";
import { ProductWithStock, Warehouse, AdjustmentReason, Category } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import {
  Settings01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  CheckmarkCircle01Icon,
  Loading01Icon,
  Package01Icon,
  ArrowLeft01Icon,
  Calendar03Icon,
  Store01Icon,
  Search01Icon,
  Cancel01Icon,
  QrCodeIcon,
  Exchange01Icon,
  GridViewIcon,
} from "hugeicons-react";
import { formatCambodiaDate } from "@/lib/utils";

const ADJUSTMENT_REASONS: AdjustmentReason[] = [
  "Damaged",
  "Inventory Count Discrepancy",
  "Sample/Promo",
  "Other",
];

const formSchema = z.object({
  type: z.enum(["up", "down"], { message: "Select adjustment direction" }),
  product_id: z.string().min(1, "Please select a product"),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  reason: z.enum(["Damaged", "Inventory Count Discrepancy", "Sample/Promo", "Other"]),
  note: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreateStockAdjustmentPage() {
  const router = useRouter();
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("main");
  const [selectedProduct, setSelectedProduct] = useState<ProductWithStock | null>(null);

  // Product Selection Dialog Modal State
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      type: "down",
      product_id: "",
      quantity: 1,
      reason: "Inventory Count Discrepancy",
      note: "",
    },
  });

  useEffect(() => {
    async function loadData() {
      try {
        setDataLoading(true);
        const [prodData, allStocks, warehouseList, catList] = await Promise.all([
          getProducts(),
          getStocks(),
          getWarehouses(),
          getCategories(),
        ]);

        setWarehouses(warehouseList);
        setCategories(catList);

        const whId =
          role !== "super_admin" && user?.warehouse_id
            ? user.warehouse_id
            : warehouseList[0]?.id || "main";
        setSelectedWarehouseId(whId);

        const stockMap: Record<string, number> = {};
        allStocks.forEach((s) => {
          if (!whId || s.warehouse_id === whId) {
            stockMap[s.product_id] = (stockMap[s.product_id] || 0) + Number(s.quantity || 0);
          }
        });

        const prodsWithStock = prodData
          .filter((p) => p.status !== "inactive")
          .map((p) => ({
            ...p,
            current_stock: stockMap[p.id] || 0,
          }));

        setProducts(prodsWithStock);
      } catch (err) {
        console.error("Failed to load products for adjustment", err);
        toast.error("Failed to load inventory data");
      } finally {
        setDataLoading(false);
      }
    }
    loadData();
  }, [user, role]);

  const adjType = form.watch("type");
  const adjQty = Number(form.watch("quantity") || 0);

  const projectedStock = selectedProduct
    ? adjType === "up"
      ? selectedProduct.current_stock + adjQty
      : selectedProduct.current_stock - adjQty
    : 0;

  // Filtered Products in Dialog Modal
  const modalFilteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategoryFilter !== "all" && p.category_id !== selectedCategoryFilter) {
        return false;
      }
      if (productSearchTerm.trim()) {
        const term = productSearchTerm.toLowerCase().trim();
        const matchName = p.name?.toLowerCase().includes(term);
        const matchBarcode = p.barcode?.toLowerCase().includes(term);
        if (!matchName && !matchBarcode) return false;
      }
      return true;
    });
  }, [products, selectedCategoryFilter, productSearchTerm]);

  const handleSelectProduct = (prod: ProductWithStock) => {
    setSelectedProduct(prod);
    form.setValue("product_id", prod.id, { shouldValidate: true });
    setProductModalOpen(false);
    setProductSearchTerm("");
  };

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      if (values.type === "down" && selectedProduct && selectedProduct.current_stock < values.quantity) {
        toast.error(
          `Cannot deduct ${values.quantity} units. Current stock is only ${selectedProduct.current_stock}.`
        );
        setLoading(false);
        return;
      }

      await adjustStock({
        product_id: values.product_id,
        warehouse_id: selectedWarehouseId,
        type: values.type,
        quantity: values.quantity,
        reason: values.reason,
        note: values.note,
        created_by: user?.id || "Admin",
        created_by_name: user?.name || "Admin",
      });

      toast.success(
        `Stock successfully ${values.type === "up" ? "increased" : "deducted"} by ${values.quantity} units for "${selectedProduct?.name}"`
      );

      router.push("/stock-adjustment");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to adjust stock");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6 w-full">
      {/* ─── Back Button & Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-5 rounded-2xl border border-amber-500/15">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline" size="sm" className="h-10 gap-1.5 font-bold bg-background shadow-sm">
            <Link href="/stock-adjustment">
              <ArrowLeft01Icon className="size-4" />
              Back
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-500/15 px-2 py-0.5 rounded-md">
                Inventory Correction
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                <Calendar03Icon className="size-3 text-emerald-600" />
                {formatCambodiaDate(new Date(), "date")} (ICT)
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground mt-0.5">
              Create Stock Adjustment
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Correct inventory quantities for damaged food, count discrepancies, or sample giveaways.
            </p>
          </div>
        </div>
      </div>

      {dataLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <Loading01Icon className="animate-spin size-8 text-amber-600" />
          <p className="text-sm font-semibold">Loading Inventory Data...</p>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* ─── Full-Screen 2-Column Responsive Layout ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* ─── Left Column (5 Cols): Product Selection & Live Stock Visualizer ─── */}
              <div className="lg:col-span-5 space-y-5">
                <Card className="border-amber-500/20 shadow-sm overflow-hidden">
                  <CardHeader className="bg-muted/20 border-b p-4">
                    <CardTitle className="text-sm font-bold flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Package01Icon className="size-4 text-amber-600" />
                        Target Product Item
                      </span>
                      {selectedProduct && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setProductModalOpen(true)}
                          className="h-7 text-xs text-amber-700 font-bold gap-1 hover:bg-amber-100"
                        >
                          <Exchange01Icon className="size-3.5" />
                          Change
                        </Button>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    {!selectedProduct ? (
                      /* Click to Select Trigger Box */
                      <div
                        onClick={() => setProductModalOpen(true)}
                        className="group flex flex-col items-center justify-center p-8 border-2 border-dashed border-amber-300 rounded-2xl bg-amber-50/40 hover:bg-amber-50 hover:border-amber-500 cursor-pointer transition-all duration-200 text-center space-y-3"
                      >
                        <div className="size-14 rounded-2xl bg-amber-500/10 text-amber-700 group-hover:scale-110 flex items-center justify-center transition-transform shadow-sm">
                          <Search01Icon className="size-7 text-amber-600" />
                        </div>
                        <div>
                          <h3 className="font-black text-base text-foreground group-hover:text-amber-700 transition-colors">
                            Click to Select Product
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                            Search by product name or barcode to choose an item for adjustment.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="font-bold gap-1.5 bg-background border-amber-300 text-amber-800 shadow-2xs"
                        >
                          <QrCodeIcon className="size-4" />
                          Browse Products & Barcodes
                        </Button>
                      </div>
                    ) : (
                      /* Selected Product Card */
                      <div className="p-4 rounded-xl bg-muted/30 border border-primary/15 space-y-4">
                        <div className="flex items-start gap-4">
                          {/* Thumbnail */}
                          <div className="size-20 rounded-xl bg-background border flex items-center justify-center shrink-0 overflow-hidden relative shadow-2xs">
                            {selectedProduct.thumbnails?.[0] || selectedProduct.images?.[0] ? (
                              <Image
                                src={selectedProduct.thumbnails?.[0] || selectedProduct.images?.[0]}
                                alt={selectedProduct.name}
                                fill
                                className="object-cover"
                                sizes="80px"
                              />
                            ) : (
                              <Package01Icon className="size-8 text-muted-foreground" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <Badge variant="secondary" className="text-[10px] font-bold mb-1">
                              {categories.find((c) => c.id === selectedProduct.category_id)?.name || "General"}
                            </Badge>
                            <h3 className="font-black text-sm text-foreground truncate">{selectedProduct.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground bg-background px-2 py-0.5 rounded border">
                                <QrCodeIcon className="size-3 text-amber-600" />
                                {selectedProduct.barcode}
                              </span>
                              <span className="text-xs font-bold text-emerald-700">
                                ${selectedProduct.price?.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <Separator />

                        {/* Live Stock Projection 3-Box Display */}
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="p-3 bg-background rounded-xl border">
                            <span className="text-muted-foreground block text-[10px] uppercase font-bold">Current Stock</span>
                            <span className="font-black text-xl text-foreground tabular-nums">{selectedProduct.current_stock}</span>
                            <span className="text-[10px] text-muted-foreground block">units on hand</span>
                          </div>
                          <div className="p-3 bg-background rounded-xl border">
                            <span className="text-muted-foreground block text-[10px] uppercase font-bold">Adjustment</span>
                            <span className={`font-black text-xl tabular-nums ${adjType === "up" ? "text-emerald-600" : "text-rose-600"}`}>
                              {adjType === "up" ? `+${adjQty}` : `-${adjQty}`}
                            </span>
                            <span className="text-[10px] text-muted-foreground block">{adjType === "up" ? "Addition" : "Deduction"}</span>
                          </div>
                          <div className={`p-3 rounded-xl border ${projectedStock < 0 ? "bg-rose-50 border-rose-200" : "bg-primary/5 border-primary/20"}`}>
                            <span className="text-muted-foreground block text-[10px] uppercase font-bold">New Balance</span>
                            <span className={`font-black text-xl tabular-nums ${projectedStock < 0 ? "text-rose-600" : "text-primary"}`}>
                              {projectedStock}
                            </span>
                            <span className="text-[10px] text-muted-foreground block">
                              {projectedStock < 0 ? "⚠️ Negative" : "projected"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    <FormField
                      control={form.control}
                      name="product_id"
                      render={() => <FormMessage />}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* ─── Right Column (7 Cols): Adjustment Settings & Submission ─── */}
              <div className="lg:col-span-7 space-y-5">
                <Card className="border-amber-500/20 shadow-sm overflow-hidden">
                  <CardHeader className="bg-muted/20 border-b p-4">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Settings01Icon className="size-4 text-amber-600" />
                      Adjustment Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-5">
                    {/* 1. Warehouse Selection */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                        Storage Location / Warehouse *
                      </label>
                      <Select
                        value={selectedWarehouseId}
                        onValueChange={setSelectedWarehouseId}
                        disabled={role !== "super_admin" && !!user?.warehouse_id}
                      >
                        <SelectTrigger className="h-11 bg-background">
                          <SelectValue placeholder="Select warehouse..." />
                        </SelectTrigger>
                        <SelectContent>
                          {warehouses.length > 0 ? (
                            warehouses.map((w) => (
                              <SelectItem key={w.id} value={w.id}>
                                <div className="flex items-center gap-2">
                                  <Store01Icon className="size-4 text-muted-foreground" />
                                  <span className="font-semibold">{w.name}</span>
                                  {w.address && <span className="text-xs text-muted-foreground font-normal">({w.address})</span>}
                                </div>
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="main">Main Warehouse</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 2. Adjustment Direction Toggle */}
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Adjustment Direction *
                          </FormLabel>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Button
                              type="button"
                              variant={field.value === "down" ? "default" : "outline"}
                              onClick={() => field.onChange("down")}
                              className={`h-14 font-bold gap-3 text-sm justify-start px-4 ${
                                field.value === "down"
                                  ? "bg-rose-600 hover:bg-rose-700 text-white shadow-md border-transparent"
                                  : "border-rose-200 text-rose-700 hover:bg-rose-50"
                              }`}
                            >
                              <div className={`p-2 rounded-lg ${field.value === "down" ? "bg-white/20" : "bg-rose-100"}`}>
                                <ArrowDown01Icon className="size-5" />
                              </div>
                              <div className="text-left">
                                <div className="font-bold">Deduct Stock (-)</div>
                                <div className="text-[11px] font-normal opacity-90">
                                  Damaged food, spoilage, shrinkage
                                </div>
                              </div>
                            </Button>

                            <Button
                              type="button"
                              variant={field.value === "up" ? "default" : "outline"}
                              onClick={() => field.onChange("up")}
                              className={`h-14 font-bold gap-3 text-sm justify-start px-4 ${
                                field.value === "up"
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md border-transparent"
                                  : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              }`}
                            >
                              <div className={`p-2 rounded-lg ${field.value === "up" ? "bg-white/20" : "bg-emerald-100"}`}>
                                <ArrowUp01Icon className="size-5" />
                              </div>
                              <div className="text-left">
                                <div className="font-bold">Add Stock (+)</div>
                                <div className="text-[11px] font-normal opacity-90">
                                  Found stock, inventory surplus count
                                </div>
                              </div>
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* 3. Quantity Input with Quick Steppers */}
                    <FormField
                      control={form.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <div className="flex items-center justify-between">
                            <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Quantity to Adjust *
                            </FormLabel>
                            <div className="flex items-center gap-1.5">
                              {[1, 5, 10, 20, 50, 100].map((step) => (
                                <Button
                                  key={step}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => field.onChange(step)}
                                  className="h-7 text-xs font-bold px-2 bg-background"
                                >
                                  {step}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              className="h-12 bg-background font-black text-lg border-primary/20"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* 4. Reason Selector */}
                    <FormField
                      control={form.control}
                      name="reason"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Adjustment Reason *
                          </FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-11 bg-background border-primary/20 font-semibold">
                                <SelectValue placeholder="Select reason..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {ADJUSTMENT_REASONS.map((r) => (
                                <SelectItem key={r} value={r}>
                                  <span className="font-semibold">{r}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* 5. Note / Context */}
                    <FormField
                      control={form.control}
                      name="note"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Note / Remark (Optional)
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Expired batch, packaging leak during delivery, inventory physical count..."
                              className="h-11 bg-background border-primary/20 text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Separator />

                    {/* 6. Form Submission Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-1">
                      <Button asChild variant="outline" type="button" className="h-11 px-6 font-semibold">
                        <Link href="/stock-adjustment">Cancel</Link>
                      </Button>
                      <Button
                        type="submit"
                        disabled={loading || !selectedProduct}
                        className="h-11 px-8 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm tracking-wide uppercase shadow-md gap-2"
                      >
                        {loading ? (
                          <Loading01Icon className="animate-spin size-4" />
                        ) : (
                          <CheckmarkCircle01Icon className="size-4" />
                        )}
                        Confirm & Apply Adjustment
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

            </div>
          </form>
        </Form>
      )}

      {/* ─── Product Selection Dialog Modal ─── */}
      <Dialog
        open={productModalOpen}
        onOpenChange={(val) => {
          setProductModalOpen(val);
          if (!val) {
            setProductSearchTerm("");
            setSelectedCategoryFilter("all");
          }
        }}
      >
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] p-0 flex flex-col overflow-hidden rounded-2xl shadow-2xl bg-white">
          <DialogHeader className="p-5 pb-3 border-b bg-slate-50/50">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                <Package01Icon className="size-5 text-amber-600" />
                Select Product for Stock Adjustment
              </DialogTitle>
              <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[11px] font-semibold mr-4">
                {modalFilteredProducts.length} Products
              </Badge>
            </div>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Search by product name or barcode to select an item.
            </DialogDescription>

            {/* Search Input Bar */}
            <div className="relative mt-3">
              <Search01Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                autoFocus
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
                placeholder="Type product name or scan barcode..."
                className="pl-9 pr-9 bg-white border-slate-200 text-xs h-10 rounded-xl shadow-2xs"
              />
              {productSearchTerm && (
                <button
                  type="button"
                  onClick={() => setProductSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                >
                  <Cancel01Icon className="size-4" />
                </button>
              )}
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-2 pb-1 no-scrollbar">
              <Button
                type="button"
                size="sm"
                variant={selectedCategoryFilter === "all" ? "default" : "outline"}
                onClick={() => setSelectedCategoryFilter("all")}
                className={`h-7 text-[11px] font-semibold px-2.5 rounded-lg ${
                  selectedCategoryFilter === "all" ? "bg-amber-600 text-white" : "bg-white"
                }`}
              >
                All
              </Button>
              {categories.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant={selectedCategoryFilter === c.id ? "default" : "outline"}
                  onClick={() => setSelectedCategoryFilter(c.id)}
                  className={`h-7 text-[11px] font-semibold px-2.5 rounded-lg shrink-0 ${
                    selectedCategoryFilter === c.id ? "bg-amber-600 text-white" : "bg-white"
                  }`}
                >
                  {c.name}
                </Button>
              ))}
            </div>
          </DialogHeader>

          {/* Scrollable Product List */}
          <div className="overflow-y-auto max-h-[50vh] p-4 space-y-2">
            {modalFilteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Package01Icon className="size-10 opacity-30 text-amber-600" />
                <p className="text-sm font-semibold">No products found</p>
                <p className="text-xs text-muted-foreground">
                  No matching items for &quot;{productSearchTerm}&quot;
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {modalFilteredProducts.map((p) => {
                  const isSelected = selectedProduct?.id === p.id;
                  const thumbnail = p.thumbnails?.[0] || p.images?.[0];
                  const catName = categories.find((c) => c.id === p.category_id)?.name || "General";

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelectProduct(p)}
                      className={`flex items-center gap-3.5 p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-amber-50/90 border-amber-400 ring-1 ring-amber-400 shadow-2xs"
                          : "bg-white border-slate-100 hover:border-amber-300 hover:bg-amber-50/40 shadow-2xs"
                      }`}
                    >
                      {/* Image */}
                      <div className="size-12 rounded-lg bg-slate-100 border flex items-center justify-center shrink-0 overflow-hidden relative">
                        {thumbnail ? (
                          <Image
                            src={thumbnail}
                            alt={p.name}
                            fill
                            className="object-cover"
                            sizes="48px"
                          />
                        ) : (
                          <Package01Icon className="size-6 text-muted-foreground" />
                        )}
                      </div>

                      {/* Product Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-xs text-foreground truncate">{p.name}</h4>
                          <span className="text-xs font-black text-emerald-700 shrink-0">
                            ${p.price?.toFixed(2)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {p.barcode && (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded border">
                              <QrCodeIcon className="size-3 text-amber-600" />
                              {p.barcode}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            🏷️ {catName}
                          </span>
                        </div>
                      </div>

                      {/* Stock Level Badge */}
                      <div className="shrink-0 text-right">
                        <Badge
                          variant="outline"
                          className={`text-xs font-bold ${
                            p.current_stock <= 0
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : p.current_stock <= 5
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {p.current_stock} in stock
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
