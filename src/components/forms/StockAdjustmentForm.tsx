"use client";

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
import { toast } from "sonner";
import { adjustStock, getStocks } from "@/lib/firebase/stock-actions";
import { getProducts } from "@/lib/firebase/actions";
import { getWarehouses } from "@/lib/firebase/warehouse-actions";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  Package01Icon,
  Loading01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  CheckmarkCircle01Icon,
  BarcodeScanIcon,
} from "hugeicons-react";
import { Product, AdjustmentReason, ProductWithStock, Warehouse } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const ADJUSTMENT_REASONS: AdjustmentReason[] = [
  "Damaged",
  "Inventory Count Discrepancy",
  "Sample/Promo",
  "Other",
];

const formSchema = z.object({
  type: z.enum(["up", "down"], { message: "Select adjustment type" }),
  product_id: z.string().min(1, "Please select a product"),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  reason: z.enum(["Damaged", "Inventory Count Discrepancy", "Sample/Promo", "Other"]),
  note: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface StockAdjustmentFormProps {
  onSuccess?: () => void;
}

export function StockAdjustmentForm({ onSuccess }: StockAdjustmentFormProps) {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("main");
  const [selectedProductId, setSelectedProductId] = useState<string>("" );

  useEffect(() => {
    async function fetchData() {
      const [prodData, allStocks, warehouseList] = await Promise.all([
        getProducts(),
        getStocks(),
        getWarehouses(),
      ]);

      setWarehouses(warehouseList);
      const whId = (role !== "super_admin" && user?.warehouse_id) 
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
    }
    fetchData();
  }, [user, role]);

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

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const adjType = form.watch("type");
  const adjQty = Number(form.watch("quantity") || 0);

  const projectedStock = selectedProduct
    ? adjType === "up"
      ? selectedProduct.current_stock + adjQty
      : selectedProduct.current_stock - adjQty
    : 0;

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      if (values.type === "down" && selectedProduct && selectedProduct.current_stock < values.quantity) {
        toast.error(`Cannot deduct ${values.quantity} units. Current stock is only ${selectedProduct.current_stock}.`);
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
        `Stock successfully ${values.type === "up" ? "increased" : "deducted"} by ${values.quantity} units`
      );

      form.reset({
        type: "down",
        product_id: "",
        quantity: 1,
        reason: "Inventory Count Discrepancy",
        note: "",
      });
      setSelectedProductId("");
      onSuccess?.();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to adjust stock");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Warehouse Selector */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Target Warehouse *</label>
          <Select
            value={selectedWarehouseId}
            onValueChange={setSelectedWarehouseId}
            disabled={role !== "super_admin" && !!user?.warehouse_id}
          >
            <SelectTrigger className="h-11 bg-background border-primary/20">
              <SelectValue placeholder="Select warehouse..." />
            </SelectTrigger>
            <SelectContent>
              {warehouses.length > 0 ? (
                warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} {w.address ? `(${w.address})` : ""}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="main">Main Warehouse</SelectItem>
              )}
            </SelectContent>
          </Select>
          {role !== "super_admin" && user?.warehouse_id && (
            <p className="text-[10px] text-muted-foreground">
              Your account is assigned to this storage location.
            </p>
          )}
        </div>

        {/* Adjustment Type Toggle */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold text-foreground">Adjustment Direction *</FormLabel>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={field.value === "down" ? "default" : "outline"}
                  onClick={() => field.onChange("down")}
                  className={`h-11 font-bold gap-2 ${
                    field.value === "down"
                      ? "bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
                      : "border-rose-200 text-rose-700 hover:bg-rose-50"
                  }`}
                >
                  <ArrowDown01Icon className="size-4" />
                  Deduct Stock (-)
                </Button>
                <Button
                  type="button"
                  variant={field.value === "up" ? "default" : "outline"}
                  onClick={() => field.onChange("up")}
                  className={`h-11 font-bold gap-2 ${
                    field.value === "up"
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                      : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  <ArrowUp01Icon className="size-4" />
                  Add Stock (+)
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Product Selector */}
        <FormField
          control={form.control}
          name="product_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold text-foreground">Select Product *</FormLabel>
              <Select
                value={field.value}
                onValueChange={(val) => {
                  field.onChange(val);
                  setSelectedProductId(val);
                }}
              >
                <FormControl>
                  <SelectTrigger className="h-11 bg-background border-primary/20">
                    <SelectValue placeholder="Choose healthy food item..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="max-h-[280px]">
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-semibold">{p.name}</span>{" "}
                      <span className="text-xs text-muted-foreground font-mono">
                        ({p.barcode}) • Stock: {p.current_stock}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Selected Product Stock Card */}
        {selectedProduct && (
          <div className="p-3.5 rounded-xl bg-muted/40 border grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Current</span>
              <span className="font-bold text-foreground">{selectedProduct.current_stock}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Adjust</span>
              <span className={`font-black ${adjType === "up" ? "text-emerald-600" : "text-rose-600"}`}>
                {adjType === "up" ? `+${adjQty}` : `-${adjQty}`}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">New Total</span>
              <span className={`font-black ${projectedStock < 0 ? "text-rose-600" : "text-primary"}`}>
                {projectedStock}
              </span>
            </div>
          </div>
        )}

        {/* Quantity */}
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold text-foreground">Quantity to Adjust *</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  className="h-11 bg-background font-bold text-base border-primary/20"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Reason */}
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold text-foreground">Adjustment Reason *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="h-11 bg-background border-primary/20 font-medium">
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ADJUSTMENT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Note */}
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold text-foreground">Note / Remark (Optional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="Additional context or count details..."
                  className="h-11 bg-background border-primary/20 text-sm"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={loading || !selectedProductId}
          className="w-full h-11 bg-primary hover:bg-primary/90 font-bold text-sm tracking-wide uppercase shadow-md mt-2"
        >
          {loading ? (
            <Loading01Icon className="animate-spin size-4 mr-2" />
          ) : (
            <CheckmarkCircle01Icon className="size-4 mr-2" />
          )}
          Confirm Stock Adjustment
        </Button>
      </form>
    </Form>
  );
}
