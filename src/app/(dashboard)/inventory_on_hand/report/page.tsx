"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Loading01Icon, ArrowLeft01Icon, PrinterIcon } from "hugeicons-react";
import Link from "next/link";
import { getProducts } from "@/lib/firebase/actions";
import { getStocks } from "@/lib/firebase/stock-actions";
import { Product, Stock } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

type PrintLayout = "a4" | "a5" | "pos";

export default function InventoryReportPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [layout, setLayout] = useState<PrintLayout>("a4");

  useEffect(() => {
    try {
      const authStr = localStorage.getItem("user_auth");
      if (authStr) {
        const authData = JSON.parse(authStr);
        setWarehouseId(authData?.user_info?.warehouse_id || null);
      }
    } catch (e) {
      console.error("Failed to parse user_auth", e);
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [prods, stks] = await Promise.all([getProducts(), getStocks()]);
        setProducts(prods);
        setStocks(stks);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const mergedInventory = useMemo(() => {
    if (!warehouseId) return [];

    const productMap: Record<string, Product> = {};
    products.forEach((p) => (productMap[p.id] = p));

    const groups = new Map<string, any>();

    // Init groups
    products.forEach((p) => {
      const key = `${p.name.trim().toLowerCase()}_${(p.barcode || "").trim().toLowerCase()}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: p.id,
          name: p.name,
          barcode: p.barcode,
          price: p.price,
          category_id: p.category_id,
          current_stock: 0,
        });
      }
    });

    // Aggregate stocks for the specific warehouse
    stocks.forEach((s) => {
      if (s.warehouse_id !== warehouseId || s.is_archived) return;

      const p = productMap[s.product_id];
      if (!p) return;
      
      const key = `${p.name.trim().toLowerCase()}_${(p.barcode || "").trim().toLowerCase()}`;
      const item = groups.get(key);
      if (item) {
        item.current_stock += s.quantity;
      }
    });

    // Only return products that have stock > 0
    return Array.from(groups.values()).filter(p => p.current_stock > 0);
  }, [products, stocks, warehouseId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading01Icon className="animate-spin size-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 pb-12">
      {/* Dynamic Print Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
          
          /* Page Sizes */
          ${layout === 'a4' ? '@page { size: A4 portrait; margin: 15mm; }' : ''}
          ${layout === 'a5' ? '@page { size: A5 portrait; margin: 10mm; }' : ''}
          ${layout === 'pos' ? '@page { size: 80mm auto; margin: 0; }' : ''}
        }
      `}} />

      {/* Screen Controls (Hidden in Print) */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 shadow-sm no-print flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <Link href="/inventory_on_hand">
            <Button variant="ghost" size="icon">
              <ArrowLeft01Icon className="size-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-bold">Inventory Report Setup</h1>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={layout} onValueChange={(v: PrintLayout) => setLayout(v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Layout" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a4">A4 Layout</SelectItem>
              <SelectItem value="a5">A5 Layout</SelectItem>
              <SelectItem value="pos">POS (Receipt)</SelectItem>
            </SelectContent>
          </Select>
          
          <Button onClick={() => window.print()} className="gap-2">
            <PrinterIcon className="size-4" />
            Print Report
          </Button>
        </div>
      </div>

      {/* Print Area */}
      <div className="flex justify-center p-4 sm:p-8 no-print">
        {/* Preview Container */}
        <div 
          id="print-area" 
          className={`bg-white text-black print:shadow-none shadow-lg print:mx-0 mx-auto transition-all ${
            layout === 'a4' ? 'w-[210mm] min-h-[297mm] p-[15mm]' : 
            layout === 'a5' ? 'w-[148mm] min-h-[210mm] p-[10mm]' : 
            'w-[80mm] p-[4mm] text-[12px]' // POS
          }`}
        >
          {/* Header */}
          <div className={`mb-6 ${layout === 'pos' ? 'text-center mb-4' : 'flex justify-between items-end border-b pb-4'}`}>
            <div>
              <h1 className={`${layout === 'pos' ? 'text-lg font-bold' : 'text-2xl font-bold uppercase tracking-wider'}`}>
                Inventory Report
              </h1>
              <p className={`text-neutral-500 mt-1 ${layout === 'pos' ? 'text-[10px]' : 'text-sm'}`}>
                Generated on: {format(new Date(), "PPpp")}
              </p>
            </div>
          </div>

          {/* Table for A4/A5 */}
          {layout !== 'pos' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-neutral-800">
                  <th className="py-2 font-semibold w-12">#</th>
                  <th className="py-2 font-semibold">Product Name</th>
                  <th className="py-2 font-semibold">Barcode</th>
                  <th className="py-2 font-semibold text-right">Price</th>
                  <th className="py-2 font-semibold text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {mergedInventory.map((item, idx) => (
                  <tr key={idx} className="border-b border-neutral-200">
                    <td className="py-2 text-neutral-600">{idx + 1}</td>
                    <td className="py-2 font-medium">{item.name}</td>
                    <td className="py-2 text-neutral-500">{item.barcode || "-"}</td>
                    <td className="py-2 text-right">${item.price.toFixed(2)}</td>
                    <td className="py-2 text-right font-bold">{item.current_stock}</td>
                  </tr>
                ))}
                {mergedInventory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-neutral-500">
                      No stock available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* List for POS */}
          {layout === 'pos' && (
            <div className="flex flex-col gap-3 font-mono text-[11px]">
              <div className="flex justify-between font-bold border-y border-dashed border-neutral-400 py-1 mb-1">
                <span>ITEM</span>
                <span>QTY</span>
              </div>
              
              {mergedInventory.map((item, idx) => (
                <div key={idx} className="flex flex-col">
                  <span className="font-bold truncate">{item.name}</span>
                  <div className="flex justify-between text-neutral-600">
                    <span>{item.barcode || "-"}</span>
                    <span className="font-bold text-black text-[13px]">{item.current_stock}</span>
                  </div>
                </div>
              ))}

              <div className="border-t border-dashed border-neutral-400 pt-2 mt-2 text-center">
                <span className="font-bold">TOTAL ITEMS: {mergedInventory.length}</span>
                <br />
                <span className="font-bold">TOTAL QTY: {mergedInventory.reduce((acc, item) => acc + item.current_stock, 0)}</span>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
