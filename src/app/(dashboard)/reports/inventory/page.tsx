"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Loading01Icon, Download04Icon } from "hugeicons-react";
import { getProducts, getCategories } from "@/lib/firebase/actions";
import { getStocks } from "@/lib/firebase/stock-actions";
import { Product, Stock, Category } from "@/types";

export default function ExcelInventoryReportPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);

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
        const [prods, stks, cats] = await Promise.all([getProducts(), getStocks(), getCategories()]);
        setProducts(prods);
        setStocks(stks);
        setCategories(cats);
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
          cost: 0,
          total_cost: 0,
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
        item.total_cost += (s.quantity * (s.cost || 0));
      }
    });

    // Compute average cost and return products with stock > 0
    return Array.from(groups.values())
      .map(p => ({ ...p, cost: p.current_stock > 0 ? p.total_cost / p.current_stock : 0 }))
      .filter(p => p.current_stock > 0);
  }, [products, stocks, warehouseId]);

  const getCategoryName = (id: string) => {
    return categories.find(c => c.id === id)?.name || "Unknown";
  };

  const handleExportCSV = () => {
    const headers = ["#", "Product Name", "Barcode", "Category", "Unit Cost", "Stock On Hand", "Total Value"];
    const rows = mergedInventory.map((item, index) => [
      index + 1,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.barcode || "-"}"`,
      `"${getCategoryName(item.category_id)}"`,
      item.cost,
      item.current_stock,
      item.total_cost
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `inventory_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const grandTotalValue = mergedInventory.reduce((acc, item) => acc + item.total_cost, 0);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading01Icon className="animate-spin size-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))]">
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Executive Inventory Report</h1>
          <p className="text-xs text-muted-foreground">Comprehensive real-time stock and valuation</p>
        </div>
        <Button onClick={handleExportCSV} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
          <Download04Icon className="size-4" />
          Export to CSV
        </Button>
      </div>

      <div className="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900 p-4 sm:p-6">
        <div className="bg-white dark:bg-black border rounded-sm shadow-sm overflow-x-auto">
          {/* Excel-style table */}
          <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-neutral-100 dark:bg-neutral-800 border-b-2 border-neutral-300 dark:border-neutral-700">
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 w-12 text-center">#</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Product Name</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Barcode</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Category</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Unit Cost</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Stock On Hand</th>
                <th className="px-3 py-2 font-semibold text-neutral-600 dark:text-neutral-300 text-right bg-emerald-50 dark:bg-emerald-950/30">Total Value</th>
              </tr>
            </thead>
            <tbody>
              {mergedInventory.map((item, idx) => {
                const totalValue = item.total_cost;
                return (
                  <tr key={idx} className="border-b hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-none">
                    <td className="px-3 py-1.5 border-r text-center text-neutral-500 bg-neutral-50 dark:bg-neutral-900/50">{idx + 1}</td>
                    <td className="px-3 py-1.5 border-r font-medium text-neutral-800 dark:text-neutral-200">{item.name}</td>
                    <td className="px-3 py-1.5 border-r font-mono text-[11px] text-neutral-500">{item.barcode || "-"}</td>
                    <td className="px-3 py-1.5 border-r text-neutral-600 dark:text-neutral-400">{getCategoryName(item.category_id)}</td>
                    <td className="px-3 py-1.5 border-r text-right font-mono text-neutral-700 dark:text-neutral-300">${item.cost.toFixed(2)}</td>
                    <td className="px-3 py-1.5 border-r text-right font-bold text-neutral-800 dark:text-neutral-200">{item.current_stock}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/10">
                      ${totalValue.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-neutral-100 dark:bg-neutral-800 border-t-2 border-neutral-300 dark:border-neutral-700 font-bold">
                <td colSpan={5} className="px-3 py-3 border-r text-right uppercase tracking-wider text-[10px]">Grand Total</td>
                <td className="px-3 py-3 border-r text-right">{mergedInventory.reduce((acc, item) => acc + item.current_stock, 0)}</td>
                <td className="px-3 py-3 text-right text-emerald-700 dark:text-emerald-400 text-sm">${grandTotalValue.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
