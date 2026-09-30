"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { getProducts, getCategories } from "@/lib/firebase/actions";
import { getStocks } from "@/lib/firebase/stock-actions";
import { getWarehouses } from "@/lib/firebase/warehouse-actions";
import { Product, Category, Stock, Warehouse } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft01Icon,
  Package01Icon,
  Loading01Icon,
  Location01Icon,
  Calendar01Icon,
  DollarCircleIcon,
  BarCode01Icon,
  Tag01Icon,
} from "hugeicons-react";
import Image from "next/image";
import { getOptimizedImageUrl } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const [product, setProduct] = useState<(Product & { current_stock: number }) | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [batches, setBatches] = useState<Stock[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [products, categories, stocks, warehouseList] = await Promise.all([
          getProducts(),
          getCategories(),
          getStocks(),
          getWarehouses(),
        ]);

        const found = products.find((p) => p.id === productId);
        if (!found) {
          toast.error("Product not found");
          router.back();
          return;
        }

        const stockMap: Record<string, number> = {};
        stocks.forEach((s) => {
          stockMap[s.product_id] = (stockMap[s.product_id] || 0) + s.quantity;
        });

        setProduct({ ...found, current_stock: stockMap[found.id] || 0 });
        setCategory(categories.find((c) => c.id === found.category_id) || null);
        setBatches(
          stocks
            .filter((s) => s.product_id === productId && s.quantity > 0)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        );
        setWarehouses(warehouseList);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load product details");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [productId, router]);

  const warehouseMap = useMemo(() => {
    const map: Record<string, string> = {};
    warehouses.forEach((w) => { map[w.id] = w.name; });
    return map;
  }, [warehouses]);

  const totals = useMemo(() => ({
    qty: batches.reduce((sum, b) => sum + b.quantity, 0),
    value: batches.reduce((sum, b) => sum + b.quantity * b.cost, 0),
  }), [batches]);

  // ─── Loading ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loading01Icon className="h-10 w-10 animate-spin text-blue-500" />
          <p className="text-sm font-medium text-blue-400">Loading product details...</p>
        </div>
      </div>
    );
  }

  if (!product) return null;

  const images = product.images?.length ? product.images : product.thumbnails || [];
  const currentImage = images[selectedImageIndex];

  return (
    <div className="min-h-screen bg-background">
      {/* ─── STICKY TOP BAR ──────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-blue-100">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="gap-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 -ml-2"
          >
            <ArrowLeft01Icon className="h-4 w-4" />
            Back
          </Button>

          <Separator orientation="vertical" className="h-5 bg-blue-100" />

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 shrink-0">
              {category?.name || "Product"}
            </span>
            <span className="text-blue-200 shrink-0">/</span>
            <span className="text-sm font-semibold text-blue-900 truncate">{product.name}</span>
          </div>
        </div>
      </div>

      {/* ─── PAGE BODY ───────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-8">

          {/* ─── LEFT COLUMN: IMAGE + KEY STATS ────────────── */}
          <div className="flex flex-col gap-5">

            {/* Hero image */}
            <div className="rounded-2xl border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50/40 overflow-hidden aspect-square relative flex items-center justify-center shadow-sm">
              {currentImage ? (
                <Image
                  src={getOptimizedImageUrl(currentImage, 800)}
                  alt={product.name}
                  fill
                  className="object-contain p-6"
                  sizes="(max-width: 1024px) 100vw, 420px"
                  priority
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-blue-200">
                  <Package01Icon className="h-20 w-20" />
                  <span className="text-sm font-medium">No Image</span>
                </div>
              )}

              {/* Stock badge */}
              <div className="absolute top-4 right-4">
                <span className={`text-xs font-bold px-3 py-1.5 rounded-xl shadow-sm ${
                  product.current_stock > 10
                    ? "bg-emerald-500 text-white"
                    : product.current_stock > 0
                    ? "bg-amber-500 text-white"
                    : "bg-red-500 text-white"
                }`}>
                  {product.current_stock} in stock
                </span>
              </div>
            </div>

            {/* Thumbnail strip */}
            {images.length > 1 && (
              <ScrollArea orientation="horizontal" className="w-full">
                <div className="flex gap-2 pb-1">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImageIndex(idx)}
                      className={`relative h-16 w-16 rounded-xl border-2 overflow-hidden shrink-0 transition-all ${
                        selectedImageIndex === idx
                          ? "border-blue-500 shadow-md shadow-blue-200 scale-105"
                          : "border-blue-100 opacity-50 hover:opacity-100 hover:border-blue-300"
                      }`}
                    >
                      <Image src={getOptimizedImageUrl(img, 150)} alt={`Image ${idx + 1}`} fill className="object-cover" />
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* Key info cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-blue-100 bg-card p-4 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <DollarCircleIcon className="h-3.5 w-3.5 text-blue-400" />
                  <p className="text-[10px] font-black uppercase tracking-wider text-blue-400">Unit Price</p>
                </div>
                <p className="text-2xl font-black text-blue-700 tabular-nums">${product.price.toFixed(2)}</p>
                <p className="text-[10px] text-blue-300 font-medium mt-0.5">USD</p>
              </div>

              <div className="rounded-xl border border-blue-100 bg-card p-4 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Package01Icon className="h-3.5 w-3.5 text-blue-400" />
                  <p className="text-[10px] font-black uppercase tracking-wider text-blue-400">Total Stock</p>
                </div>
                <p className={`text-2xl font-black tabular-nums ${
                  product.current_stock > 10 ? "text-emerald-600" : product.current_stock > 0 ? "text-amber-600" : "text-red-500"
                }`}>
                  {product.current_stock}
                </p>
                <p className="text-[10px] text-blue-300 font-medium mt-0.5">UNITS</p>
              </div>
            </div>

            {/* Meta info */}
            <div className="rounded-xl border border-blue-100 bg-card p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <BarCode01Icon className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-blue-400">Barcode / SKU</p>
                  <code className="text-sm font-bold font-mono text-blue-800">{product.barcode}</code>
                </div>
              </div>

              <Separator className="bg-blue-50" />

              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Tag01Icon className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-blue-400">Category</p>
                  <p className="text-sm font-bold text-blue-800">{category?.name || "Uncategorized"}</p>
                </div>
              </div>

              <Separator className="bg-blue-50" />

              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Calendar01Icon className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-blue-400">Added</p>
                  <p className="text-sm font-bold text-blue-800">
                    {format(new Date(product.created_at), "dd MMM yyyy")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ─── RIGHT COLUMN: STOCK DETAILS ──────────────── */}
          <div className="flex flex-col gap-5">

            {/* Product name section */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="h-0.5 w-5 bg-blue-400 rounded-full" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">
                  {category?.name || "Product Detail"}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-blue-900 leading-tight">
                {product.name}
              </h1>
              <p className="text-sm text-blue-400 mt-1 font-mono">SKU: {product.barcode}</p>
            </div>

            {/* Summary totals */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 p-4 text-white shadow-lg shadow-blue-200">
                <p className="text-[10px] font-black uppercase tracking-wider opacity-70 mb-1">Total Units</p>
                <p className="text-3xl font-black tabular-nums">{totals.qty}</p>
                <p className="text-[10px] opacity-60 mt-0.5">across all batches</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 p-4 text-white shadow-lg shadow-indigo-200">
                <p className="text-[10px] font-black uppercase tracking-wider opacity-70 mb-1">Stock Value</p>
                <p className="text-3xl font-black tabular-nums">${totals.value.toFixed(0)}</p>
                <p className="text-[10px] opacity-60 mt-0.5">USD cost basis</p>
              </div>
              <div className="rounded-xl border border-blue-100 bg-card p-4 shadow-sm col-span-2 sm:col-span-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-blue-400 mb-1">Batches</p>
                <p className="text-3xl font-black text-blue-700 tabular-nums">{batches.length}</p>
                <p className="text-[10px] text-blue-300 mt-0.5">stock batches</p>
              </div>
            </div>

            {/* Stock distribution table */}
            <div className="rounded-2xl border border-blue-100 bg-card shadow-sm overflow-hidden flex flex-col flex-1">
              {/* Table header bar */}
              <div className="px-5 py-3.5 border-b border-blue-100 bg-blue-50/60 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Location01Icon className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">
                    Stock Distribution by Batch
                  </span>
                </div>
                <Badge className="bg-blue-100 text-blue-700 border-blue-200 font-bold text-[9px] h-5 tabular-nums hover:bg-blue-100">
                  {batches.length} BATCHES
                </Badge>
              </div>

              {/* Column headers */}
              {batches.length > 0 && (
                <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-2.5 border-b border-blue-50 bg-blue-50/30 text-[9px] font-black uppercase tracking-widest text-blue-300 shrink-0">
                  <span>Warehouse</span>
                  <span className="hidden sm:block">Arrival Date</span>
                  <span className="text-right">Unit Cost</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Batch Value</span>
                </div>
              )}

              {/* Rows */}
              <div className="flex-1 overflow-auto">
                {batches.length === 0 ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-3 text-blue-200">
                    <Package01Icon className="h-12 w-12" />
                    <div className="text-center">
                      <p className="text-sm font-black">No Stock Available</p>
                      <p className="text-xs text-blue-300 mt-0.5">This product has no active stock batches.</p>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-blue-50">
                    {batches.map((batch, idx) => (
                      <div
                        key={batch.id}
                        className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-4 items-center hover:bg-blue-50/40 transition-colors group"
                      >
                        {/* Warehouse */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                            idx % 3 === 0 ? "bg-blue-100 text-blue-500"
                            : idx % 3 === 1 ? "bg-indigo-100 text-indigo-500"
                            : "bg-purple-100 text-purple-500"
                          }`}>
                            <Location01Icon className="h-4 w-4" />
                          </div>
                          <span className="font-bold text-sm text-blue-800 uppercase tracking-tight truncate">
                            {warehouseMap[batch.warehouse_id] || "Warehouse"}
                          </span>
                        </div>

                        {/* Date */}
                        <div className="hidden sm:block">
                          <p className="text-[11px] font-bold text-blue-400">
                            {format(new Date(batch.date), "dd MMM yyyy")}
                          </p>
                        </div>

                        {/* Unit cost */}
                        <div className="text-right">
                          <p className="text-sm font-semibold text-blue-500 tabular-nums">
                            ${batch.cost.toFixed(2)}
                          </p>
                        </div>

                        {/* Qty */}
                        <div className="text-right">
                          <span className={`inline-flex text-xs font-black px-2.5 py-1 rounded-lg tabular-nums ${
                            batch.quantity > 10
                              ? "bg-blue-100 text-blue-700"
                              : batch.quantity > 5
                              ? "bg-amber-50 border border-amber-200 text-amber-700"
                              : "bg-red-50 border border-red-200 text-red-600"
                          }`}>
                            {batch.quantity}
                          </span>
                        </div>

                        {/* Batch value */}
                        <div className="text-right">
                          <p className="text-sm font-black text-blue-700 tabular-nums">
                            ${(batch.cost * batch.quantity).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer totals */}
              {batches.length > 0 && (
                <div className="px-5 py-4 border-t border-blue-100 bg-gradient-to-r from-blue-600 to-blue-700 text-white shrink-0">
                  <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-4 items-center">
                    <span className="text-[10px] font-black uppercase tracking-wider opacity-70">Total</span>
                    <span className="hidden sm:block" />
                    <span className="text-right text-[10px] font-black opacity-70 uppercase tracking-wider">—</span>
                    <span className="text-right text-base font-black tabular-nums">{totals.qty}</span>
                    <span className="text-right text-base font-black tabular-nums">${totals.value.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
