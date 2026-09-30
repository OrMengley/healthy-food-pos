"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search01Icon,
  Package01Icon,
  Tick01Icon,
  Cancel01Icon,
  QrCodeIcon
} from "hugeicons-react";
import { Product } from "@/types";
import Image from "next/image";

interface ProductSelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  selectedProductIds?: string[];
  onSelectProduct: (product: Product) => void;
}

export function ProductSelectModal({
  open,
  onOpenChange,
  products,
  selectedProductIds = [],
  onSelectProduct,
}: ProductSelectModalProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase().trim();
    return products.filter((p) => {
      const matchName = p.name?.toLowerCase().includes(term);
      const matchBarcode = p.barcode?.toLowerCase().includes(term);
      return matchName || matchBarcode;
    });
  }, [products, searchTerm]);

  const handleSelect = (product: Product) => {
    onSelectProduct(product);
    onOpenChange(false);
    setSearchTerm("");
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) setSearchTerm("");
    }}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] p-0 flex flex-col overflow-hidden rounded-2xl border-none shadow-2xl bg-white">
        <DialogHeader className="p-5 pb-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
              <Package01Icon className="h-5 w-5 text-violet-600" />
              Select Product
            </DialogTitle>
            <Badge variant="secondary" className="bg-violet-100 text-violet-800 text-[11px] font-semibold mr-3">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-slate-500 mt-1">
            Search products by name or barcode for stock transfer.
          </DialogDescription>

          {/* Search Bar */}
          <div className="relative mt-3">
            <Search01Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type product name or barcode..."
              className="pl-9 pr-9 bg-white border-slate-200 focus-visible:ring-2 focus-visible:ring-violet-500 text-xs h-10 rounded-xl shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5"
              >
                <Cancel01Icon className="h-4 w-4" />
              </button>
            )}
          </div>
        </DialogHeader>

        {/* Scrollable Product List Container */}
        <div className="overflow-y-auto max-h-[60vh] sm:max-h-[400px] p-4 space-y-2">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <Package01Icon className="h-10 w-10 opacity-30 text-violet-400" />
              <p className="text-sm font-semibold text-slate-600">No products found</p>
              <p className="text-xs text-slate-400">No product matching &quot;{searchTerm}&quot;</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filteredProducts.map((p) => {
                const isSelected = selectedProductIds.includes(p.id);
                const thumbnail = p.thumbnails?.[0] || p.images?.[0];

                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelect(p)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${isSelected
                        ? "bg-violet-50/80 border-violet-300 ring-1 ring-violet-400/40 shadow-2xs"
                        : "bg-white border-slate-100 hover:border-violet-200 hover:bg-violet-50/30 shadow-2xs"
                      }`}
                  >
                    {/* Thumbnail / Image */}
                    <div className="h-12 w-12 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0 overflow-hidden relative">
                      {thumbnail ? (
                        <Image
                          src={thumbnail}
                          alt={p.name}
                          fill
                          className="object-cover"
                          sizes="48px"
                        />
                      ) : (
                        <Package01Icon className="h-6 w-6 text-slate-400" />
                      )}
                    </div>

                    {/* Product Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-xs text-slate-900 truncate">{p.name}</h4>
                        {isSelected && (
                          <Badge variant="secondary" className="bg-violet-200/80 text-violet-900 font-bold text-[10px] shrink-0 gap-1 rounded-full px-2">
                            <Tick01Icon className="h-3 w-3 text-violet-700" /> Selected
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {p.barcode && (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">
                            <QrCodeIcon className="h-3 w-3 text-violet-500" />
                            {p.barcode}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
