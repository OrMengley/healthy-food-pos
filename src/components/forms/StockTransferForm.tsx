"use client";

import { useForm, useFieldArray } from "react-hook-form";
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
import { createMultipleStockTransfers } from "@/lib/firebase/stock-transfer-actions";
import { getProducts } from "@/lib/firebase/actions";
import { getWarehouses } from "@/lib/firebase/warehouse-actions";
import { useState, useEffect } from "react";
import { 
  Package01Icon, 
  Home01Icon, 
  Sorting01Icon, 
  Loading01Icon,
  Add01Icon,
  Delete02Icon,
  Search01Icon,
  QrCodeIcon,
  ArrowRight01Icon,
  NoteIcon
} from "hugeicons-react";
import { Product, Warehouse } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ProductSelectModal } from "@/components/modals/ProductSelectModal";
import Image from "next/image";

const itemSchema = z.object({
  product_id: z.string().min(1, "Please select a product"),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
});

const formSchema = z.object({
  from_warehouse_id: z.string().min(1, "Please select origin warehouse"),
  to_warehouse_id: z.string().min(1, "Please select destination warehouse"),
  items: z.array(itemSchema).min(1, "At least one product item is required"),
  note: z.string().optional(),
}).refine((data) => data.from_warehouse_id !== data.to_warehouse_id, {
  message: "Origin and destination warehouses must be different",
  path: ["to_warehouse_id"],
}).refine((data) => {
  const selectedProductIds = data.items.map(item => item.product_id).filter(Boolean);
  return new Set(selectedProductIds).size === selectedProductIds.length;
}, {
  message: "Duplicate products are not allowed in the same transfer",
  path: ["items"],
});

type FormValues = z.infer<typeof formSchema>;

interface StockTransferFormProps {
  onSuccess?: () => void;
}

export function StockTransferForm({ onSuccess }: StockTransferFormProps) {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);

  useEffect(() => {
    async function fetchData() {
      const [prodData, whData] = await Promise.all([
        getProducts(),
        getWarehouses()
      ]);
      setProducts(prodData);
      setWarehouses(whData);
    }
    fetchData();
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      from_warehouse_id: "",
      to_warehouse_id: "",
      items: [
        { product_id: "", quantity: 1 }
      ],
      note: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchItems = form.watch("items");
  const selectedProductIds = watchItems.map(i => i.product_id).filter(Boolean);

  const currentProductMap = products.reduce<Record<string, Product>>((acc, p) => {
    acc[p.id] = p;
    return acc;
  }, {});

  const handleOpenProductModal = (index: number | null) => {
    setActiveItemIndex(index);
    setModalOpen(true);
  };

  const handleSelectProduct = (product: Product) => {
    if (activeItemIndex !== null) {
      form.setValue(`items.${activeItemIndex}.product_id`, product.id, {
        shouldValidate: true,
      });
    } else {
      append({ product_id: product.id, quantity: 1 });
    }
  };

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      await createMultipleStockTransfers({
        ...values,
        created_by: "admin",
      });
      toast.success(`Successfully transferred ${values.items.length} product(s)`);
      form.reset({
        from_warehouse_id: "",
        to_warehouse_id: "",
        items: [{ product_id: "", quantity: 1 }],
        note: "",
      });
      onSuccess?.();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to record stock transfer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {/* Warehouses Card */}
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 text-slate-700 font-semibold text-xs tracking-wider uppercase">
              <Home01Icon className="h-4 w-4 text-blue-600" />
              Origin & Destination
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="from_warehouse_id"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[11px] font-medium text-slate-500">From Warehouse</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10 bg-white border-slate-200 focus:ring-2 focus:ring-blue-500 text-xs font-medium rounded-xl">
                          <SelectValue placeholder="Select Origin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        {warehouses.map((w) => (
                          <SelectItem key={w.id} value={w.id} className="text-xs">{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="to_warehouse_id"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[11px] font-medium text-slate-500">To Warehouse</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10 bg-white border-slate-200 focus:ring-2 focus:ring-blue-500 text-xs font-medium rounded-xl">
                          <SelectValue placeholder="Select Destination" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        {warehouses.map((w) => (
                          <SelectItem key={w.id} value={w.id} className="text-xs">{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Multi-Products Section */}
          <div className="p-4 rounded-2xl bg-violet-50/60 border border-violet-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-violet-900 font-bold text-sm">
                <Package01Icon className="h-4 w-4 text-violet-600" />
                Transfer Items
                <Badge variant="secondary" className="bg-violet-200/60 text-violet-900 font-extrabold text-xs px-2 py-0.5 rounded-full ml-1">
                  {fields.length}
                </Badge>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenProductModal(null)}
                className="h-8 border-violet-200 bg-white text-violet-700 hover:bg-violet-100 hover:text-violet-900 text-xs font-medium rounded-xl gap-1 shadow-2xs"
              >
                <Add01Icon className="h-3.5 w-3.5" />
                Add Product
              </Button>
            </div>

            {form.formState.errors.items?.root && (
              <p className="text-xs font-medium text-destructive bg-red-50 p-2.5 rounded-lg border border-red-100">
                {form.formState.errors.items.root.message}
              </p>
            )}

            <div className="space-y-3">
              {fields.map((itemField, index) => {
                const productId = watchItems[index]?.product_id;
                const selectedProduct = productId ? currentProductMap[productId] : null;
                const thumbnail = selectedProduct?.thumbnails?.[0] || selectedProduct?.images?.[0];

                return (
                  <div 
                    key={itemField.id} 
                    className="p-3.5 rounded-xl bg-white border border-violet-100 shadow-2xs space-y-3 transition-all hover:border-violet-200"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-400 text-[10px] tracking-wider uppercase">
                        Item #{index + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                        className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <Delete02Icon className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Product Selection Display */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.product_id`}
                      render={() => (
                        <FormItem className="space-y-0">
                          <FormControl>
                            {selectedProduct ? (
                              <div 
                                onClick={() => handleOpenProductModal(index)}
                                className="flex items-center gap-3 p-2.5 rounded-xl border border-violet-100 bg-violet-50/30 hover:bg-violet-50/70 hover:border-violet-300 cursor-pointer transition-all group"
                              >
                                <div className="h-10 w-10 rounded-lg bg-white border border-slate-200/70 flex items-center justify-center shrink-0 overflow-hidden relative shadow-2xs">
                                  {thumbnail ? (
                                    <Image
                                      src={thumbnail}
                                      alt={selectedProduct.name}
                                      fill
                                      className="object-cover"
                                      sizes="40px"
                                    />
                                  ) : (
                                    <Package01Icon className="h-5 w-5 text-slate-400" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-slate-900 truncate group-hover:text-violet-700 transition-colors">
                                    {selectedProduct.name}
                                  </p>
                                  {selectedProduct.barcode && (
                                    <p className="text-[10px] font-mono text-slate-500 flex items-center gap-1 mt-0.5">
                                      <QrCodeIcon className="h-2.5 w-2.5 text-violet-500" />
                                      {selectedProduct.barcode}
                                    </p>
                                  )}
                                </div>
                                <Badge variant="outline" className="text-[10px] text-violet-600 border-violet-200 bg-white group-hover:bg-violet-100 shrink-0 font-medium">
                                  Change
                                </Badge>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleOpenProductModal(index)}
                                className="w-full h-11 border-dashed border-violet-300 text-violet-600 hover:bg-violet-50/80 hover:border-violet-400 justify-center text-xs gap-2 font-semibold rounded-xl bg-violet-50/30"
                              >
                                <Search01Icon className="h-4 w-4 text-violet-500" />
                                Search & Select Product...
                              </Button>
                            )}
                          </FormControl>
                          <FormMessage className="text-[11px] mt-1" />
                        </FormItem>
                      )}
                    />

                    {/* Quantity Stepper & Control */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <span className="text-[11px] font-semibold text-slate-500">Transfer Quantity</span>
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem className="space-y-0">
                            <FormControl>
                              <div className="flex items-center border border-violet-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => field.onChange(Math.max(1, (Number(field.value) || 1) - 1))}
                                  className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-700 font-bold border-r border-violet-100 transition-colors text-sm"
                                >
                                  -
                                </button>
                                <Input
                                  type="number"
                                  min={1}
                                  className="w-14 h-8 text-center text-xs font-bold text-slate-900 border-none focus-visible:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  {...field}
                                />
                                <button
                                  type="button"
                                  onClick={() => field.onChange((Number(field.value) || 0) + 1)}
                                  className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-700 font-bold border-l border-violet-100 transition-colors text-sm"
                                >
                                  +
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage className="text-[11px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Note Field */}
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                  <NoteIcon className="h-3.5 w-3.5 text-slate-400" />
                  Note
                </FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Optional transfer note..." 
                    className="bg-white border-slate-200 focus-visible:ring-2 focus-visible:ring-violet-500 text-xs h-10 rounded-xl" 
                    {...field} 
                  />
                </FormControl>
                <FormMessage className="text-[11px]" />
              </FormItem>
            )}
          />

          {/* Confirm Button */}
          <Button 
            type="submit" 
            disabled={loading} 
            className="w-full h-12 bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-700 hover:from-violet-700 hover:to-indigo-800 text-white rounded-xl shadow-md shadow-violet-500/25 transition-all font-bold tracking-wide uppercase text-xs gap-2"
          >
            {loading ? (
              <Loading01Icon className="animate-spin h-5 w-5" />
            ) : (
              <Sorting01Icon className="h-5 w-5" />
            )}
            <span>
              Confirm Transfer ({fields.length} {fields.length === 1 ? 'item' : 'items'})
            </span>
          </Button>
        </form>
      </Form>

      {/* Product Search Selection Modal */}
      <ProductSelectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        products={products}
        selectedProductIds={selectedProductIds}
        onSelectProduct={handleSelectProduct}
      />
    </>
  );
}
