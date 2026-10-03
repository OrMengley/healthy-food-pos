"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  getProducts,
  getCategories,
} from "@/lib/firebase/actions";
import { getStocks } from "@/lib/firebase/stock-actions";
import { getWarehouses } from "@/lib/firebase/warehouse-actions";
import { Product, Category, Stock, Warehouse, ProductWithStock } from "@/types";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search01Icon,
  Package01Icon,
  ViewIcon,
  Loading01Icon,
  LayoutGridIcon,
  ListViewIcon,
  FilterIcon,
  Cancel01Icon,
} from "hugeicons-react";
import Image from "next/image";
import { getOptimizedImageUrl } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";

export default function ProductMenuPage() {
  const router = useRouter();

  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [filterOpen, setFilterOpen] = useState(false);

  async function fetchData() {
    try {
      setLoading(true);
      const [p, c, s, w] = await Promise.all([
        getProducts(),
        getCategories(),
        getStocks(),
        getWarehouses(),
      ]);

      const stockMap: Record<string, number> = {};
      s.forEach((stock) => {
        stockMap[stock.product_id] = (stockMap[stock.product_id] || 0) + stock.quantity;
      });

      const productsWithStock = p.map((prod) => ({
        ...prod,
        current_stock: stockMap[prod.id] || 0,
      }));

      setProducts(productsWithStock);
      setCategories(c);
      setStocks(s);
      setWarehouses(w);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => p.current_stock > 0);
    if (selectedCategoryId !== "all") {
      result = result.filter((p) => p.category_id === selectedCategoryId);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q)
      );
    }
    return result;
  }, [products, selectedCategoryId, searchQuery]);

  const categoryName =
    selectedCategoryId === "all"
      ? "All Products"
      : categories.find((c) => c.id === selectedCategoryId)?.name || "Products";

  const renderCategoryList = () => (
    <div className="space-y-0.5">
      <button
        onClick={() => {
          setSelectedCategoryId("all");
          setFilterOpen(false);
        }}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
          selectedCategoryId === "all"
            ? "bg-blue-600 text-white shadow-sm"
            : "text-muted-foreground hover:bg-blue-50 hover:text-blue-700"
        }`}
      >
        <span>All Products</span>
        <span className={`text-xs tabular-nums px-1.5 py-0.5 rounded-md ${
          selectedCategoryId === "all" ? "bg-white/20 text-white" : "bg-muted"
        }`}>
          {products.filter((p) => p.current_stock > 0).length}
        </span>
      </button>
      {categories.map((cat) => {
        const count = products.filter(
          (p) => p.category_id === cat.id && p.current_stock > 0
        ).length;
        return (
          <button
            key={cat.id}
            onClick={() => {
              setSelectedCategoryId(cat.id);
              setFilterOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              selectedCategoryId === cat.id
                ? "bg-blue-600 text-white shadow-sm"
                : "text-muted-foreground hover:bg-blue-50 hover:text-blue-700"
            }`}
          >
            <span className="truncate mr-2">{cat.name}</span>
            <span className={`text-xs tabular-nums shrink-0 px-1.5 py-0.5 rounded-md ${
              selectedCategoryId === cat.id ? "bg-white/20 text-white" : "bg-muted"
            }`}>{count}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* ─── STICKY TOOLBAR ─────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-blue-100">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          {/* Mobile: filter button */}
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden shrink-0 h-9 w-9 border-blue-200 text-blue-600 hover:bg-blue-50"
            onClick={() => setFilterOpen(true)}
          >
            <FilterIcon className="h-4 w-4" />
          </Button>

          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400" />
            <Input
              placeholder="Search products..."
              className="pl-9 h-9 text-sm border-blue-200 focus-visible:ring-blue-400 focus-visible:border-blue-400"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-600"
              >
                <Cancel01Icon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* View toggle */}
          <div className="flex items-center border border-blue-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`h-9 w-9 flex items-center justify-center transition-colors ${
                viewMode === "grid"
                  ? "bg-blue-600 text-white"
                  : "hover:bg-blue-50 text-blue-400"
              }`}
            >
              <LayoutGridIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`h-9 w-9 flex items-center justify-center transition-colors ${
                viewMode === "list"
                  ? "bg-blue-600 text-white"
                  : "hover:bg-blue-50 text-blue-400"
              }`}
            >
              <ListViewIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── BODY ───────────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 flex gap-6">
        {/* ─── SIDEBAR (desktop only) ─────────────────────── */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-[80px]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-400 px-3 mb-2">
              Categories
            </p>
            {renderCategoryList()}
          </div>
        </aside>

        {/* ─── MAIN CONTENT ───────────────────────────────── */}
        <main className="flex-1 min-w-0 space-y-5">
          {/* Breadcrumb / Path */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-blue-900">{categoryName}</h1>
              <p className="text-sm text-blue-400 mt-0.5">
                {loading ? "Loading..." : `${filteredProducts.length} items in stock`}
              </p>
            </div>
          </div>

          {/* ─── LOADING ─────────────────────────────────── */}
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-blue-400 gap-3">
              <Loading01Icon className="h-8 w-8 animate-spin" />
              <p className="text-sm font-medium">Loading products...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 rounded-xl border-2 border-dashed border-blue-200 text-blue-400 gap-3">
              <Package01Icon className="h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">No products matched your criteria</p>
              {(searchQuery || selectedCategoryId !== "all") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-blue-200 text-blue-600 hover:bg-blue-50"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategoryId("all");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : viewMode === "grid" ? (
            /* ─── GRID VIEW ───────────────────────────────── */
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className="group bg-card border border-blue-100 rounded-xl overflow-hidden hover:shadow-lg hover:shadow-blue-100 hover:border-blue-300 transition-all duration-200 cursor-pointer flex flex-col"
                  onClick={() => router.push(`/menu/${p.id}`)}
                >
                  {/* Image */}
                  <div className="bg-blue-50/40 aspect-[4/3] relative flex items-center justify-center overflow-hidden">
                    {p.thumbnails?.[0] || p.images?.[0] ? (
                      <Image
                        src={getOptimizedImageUrl(p.thumbnails?.[0] || p.images?.[0], 250, 250)}
                        alt={p.name}
                        fill
                        className="object-contain p-4 transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <Package01Icon className="h-14 w-14 text-blue-200" />
                    )}
                    {/* Stock badge overlay */}
                    <div className="absolute top-3 right-3">
                      <span
                        className={`text-[10px] font-semibold px-2 py-1 rounded-md ${
                          p.current_stock > 10
                            ? "bg-blue-600 text-white"
                            : p.current_stock > 0
                            ? "bg-amber-500 text-white"
                            : "bg-red-500 text-white"
                        }`}
                      >
                        {p.current_stock} in stock
                      </span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-400 mb-1">
                        {categories.find((c) => c.id === p.category_id)?.name || "Uncategorized"}
                      </p>
                      <h3 className="font-semibold text-sm leading-snug line-clamp-2 text-foreground group-hover:text-blue-700 transition-colors">
                        {p.name}
                      </h3>
                      <p className="text-[11px] text-blue-300 font-mono mt-0.5">
                        {p.barcode}
                      </p>
                    </div>

                    <Separator className="bg-blue-100" />

                    <div className="flex items-center justify-between">
                      <span className="text-xl font-bold tabular-nums text-blue-700">${p.price.toFixed(2)}</span>
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white border-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/menu/${p.id}`);
                        }}
                      >
                        <ViewIcon className="h-3.5 w-3.5" />
                        Details
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ─── LIST VIEW ───────────────────────────────── */
            <div className="rounded-xl border border-blue-100 overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-[10px] font-semibold uppercase tracking-widest text-blue-400">
                <span className="w-12">Image</span>
                <span>Product</span>
                <span className="text-right w-20">Price</span>
                <span className="text-right w-20 hidden sm:block">Stock</span>
                <span className="w-20 text-center">Action</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-blue-50">
                {filteredProducts.map((p) => (
                  <div
                    key={p.id}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-3 items-center hover:bg-blue-50/60 transition-colors cursor-pointer group"
                    onClick={() => router.push(`/menu/${p.id}`)}
                  >
                    {/* Thumbnail */}
                    <div className="h-12 w-12 rounded-lg border border-blue-100 bg-blue-50/40 flex items-center justify-center overflow-hidden shrink-0">
                      {p.thumbnails?.[0] || p.images?.[0] ? (
                        <Image
                          src={getOptimizedImageUrl(p.thumbnails?.[0] || p.images?.[0], 150, 150)}
                          alt={p.name}
                          width={48}
                          height={48}
                          className="object-contain h-full w-full p-1"
                        />
                      ) : (
                        <Package01Icon className="h-5 w-5 text-blue-200" />
                      )}
                    </div>

                    {/* Name + barcode */}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate group-hover:text-blue-700 transition-colors">{p.name}</p>
                      <p className="text-[11px] text-blue-300 font-mono">
                        {p.barcode}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="text-right w-20">
                      <p className="text-sm font-semibold tabular-nums text-blue-700">${p.price.toFixed(2)}</p>
                    </div>

                    {/* Stock */}
                    <div className="text-right w-20 hidden sm:block">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                          p.current_stock > 10
                            ? "bg-blue-100 text-blue-700"
                            : p.current_stock > 0
                            ? "bg-amber-50 border border-amber-200 text-amber-700"
                            : "bg-red-50 border border-red-200 text-red-600"
                        }`}
                      >
                        {p.current_stock}
                      </span>
                    </div>

                    {/* Action */}
                    <div className="w-20 flex justify-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-blue-400 hover:text-blue-600 hover:bg-blue-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/menu/${p.id}`);
                        }}
                      >
                        <ViewIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ─── MOBILE FILTER SHEET ─────────────────────────── */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-blue-100 bg-blue-50/50">
            <SheetTitle className="text-base font-semibold text-blue-800">Categories</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 h-[calc(100vh-80px)]">
            <div className="p-4">
              {renderCategoryList()}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
