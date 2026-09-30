"use client";

import { useState, useMemo } from "react";
import { ProductWithStock, Category } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Search01Icon, 
  Cancel01Icon, 
  Package01Icon, 
  BarcodeScanIcon, 
  CheckmarkCircle01Icon, 
  Add01Icon,
  Dollar01Icon,
} from "hugeicons-react";
import Image from "next/image";
import { getOptimizedImageUrl } from "@/lib/utils";

interface SelectProductModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductWithStock[];
  categories: Category[];
  selectedProductIds: string[];
  onSelectProduct: (product: ProductWithStock) => void;
}

export function SelectProductModal({
  open,
  onOpenChange,
  products,
  categories,
  selectedProductIds,
  onSelectProduct,
}: SelectProductModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Category filter
      if (selectedCategory !== "all" && p.category_id !== selectedCategory) {
        return false;
      }

      // Search query (name or barcode)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name?.toLowerCase().includes(q);
        const matchBarcode = p.barcode?.toLowerCase().includes(q);
        if (!matchName && !matchBarcode) return false;
      }

      return true;
    });
  }, [products, selectedCategory, searchQuery]);

  const selectedSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="p-5 pb-3 border-b border-border/70 bg-primary/5 shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-foreground font-bold text-lg">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Package01Icon className="size-5" />
              </div>
              <span>Select Product to Purchase</span>
            </DialogTitle>
            <Badge variant="outline" className="font-mono text-xs px-2.5 py-0.5">
              {products.length} Products
            </Badge>
          </div>
        </DialogHeader>

        {/* Search & Category Filter Bar */}
        <div className="p-4 border-b border-border/60 bg-muted/20 space-y-3 shrink-0">
          <div className="relative">
            <Search01Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by product name or scan barcode (HF-...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-9 h-10 text-sm bg-background rounded-xl border-border/80 focus-visible:ring-primary/20"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              >
                <Cancel01Icon className="size-4" />
              </button>
            )}
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <Button
              type="button"
              size="sm"
              variant={selectedCategory === "all" ? "default" : "outline"}
              onClick={() => setSelectedCategory("all")}
              className="h-7 text-xs rounded-full px-3 shrink-0 font-medium"
            >
              All
            </Button>
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <Button
                  key={cat.id}
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => setSelectedCategory(isSelected ? "all" : cat.id)}
                  className="h-7 text-xs rounded-full px-3 shrink-0 font-medium"
                >
                  {cat.name}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Product Items List */}
        <div className="flex-1 overflow-y-auto p-4 divide-y divide-border/40">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Package01Icon className="size-10 text-muted-foreground/40 mb-2" />
              <p className="font-semibold text-sm">No products found</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Try searching by different keywords or clear the category filter.
              </p>
            </div>
          ) : (
            filteredProducts.map((product) => {
              const isAdded = selectedSet.has(product.id);
              const recommendCost = Number(product.cost || product.cost_recommand || 0);

              return (
                <div
                  key={product.id}
                  onClick={() => onSelectProduct(product)}
                  className={`flex items-center justify-between gap-3 p-3 rounded-xl transition-all cursor-pointer group ${
                    isAdded
                      ? "bg-primary/5 hover:bg-primary/10"
                      : "hover:bg-muted/40"
                  }`}
                >
                  {/* Left: Thumbnail & Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative size-12 rounded-xl overflow-hidden border border-border/80 bg-muted/40 shrink-0 shadow-2xs flex items-center justify-center group-hover:scale-105 transition-transform">
                      {product.thumbnails?.[0] || product.images?.[0] ? (
                        <Image
                          src={getOptimizedImageUrl(product.thumbnails?.[0] || product.images?.[0], 100)}
                          alt={product.name}
                          fill
                          className="object-cover"
                          sizes="48px"
                        />
                      ) : (
                        <Package01Icon className="size-5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                        {product.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground font-mono">
                        <span className="flex items-center gap-1 font-semibold text-primary">
                          <BarcodeScanIcon className="size-3.5" />
                          {product.barcode}
                        </span>
                        <span>•</span>
                        <span className="text-[11px] font-sans">
                          Stock: <strong className="text-foreground">{product.current_stock}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Recommend Cost & Action */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                        Recommend Cost
                      </span>
                      <span className="font-bold text-sm text-foreground">
                        ${recommendCost.toFixed(2)}
                      </span>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant={isAdded ? "default" : "outline"}
                      className={`h-9 px-3 rounded-xl font-bold text-xs gap-1.5 transition-all ${
                        isAdded
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                          : "border-primary/30 text-primary hover:bg-primary/10"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProduct(product);
                      }}
                    >
                      {isAdded ? (
                        <>
                          <CheckmarkCircle01Icon className="size-3.5" />
                          <span>Added</span>
                        </>
                      ) : (
                        <>
                          <Add01Icon className="size-3.5" />
                          <span>Select</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Dialog Footer */}
        <DialogFooter className="p-4 border-t border-border/70 bg-muted/20 shrink-0 flex items-center justify-between sm:justify-between">
          <span className="text-xs text-muted-foreground font-medium">
            <strong className="text-foreground">{selectedProductIds.length}</strong> product{selectedProductIds.length === 1 ? "" : "s"} in purchase list
          </span>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-xs"
          >
            Done Selecting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
