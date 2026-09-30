"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Loading01Icon, Download04Icon, File02Icon } from "hugeicons-react";
import { getProducts, getCategories } from "@/lib/firebase/actions";
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";
import { getStocks } from "@/lib/firebase/stock-actions";
import { Product, Stock, Category } from "@/types";

export default function ProductStockReportPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

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

    // Aggregate stocks across ALL warehouses
    stocks.forEach((s) => {
      if (s.is_archived) return;

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
  }, [products, stocks]);

  const getCategoryName = (id: string) => {
    return categories.find(c => c.id === id)?.name || "Unknown";
  };

  const handleExportPDF = async () => {
    const element = document.getElementById("pdf-report-content");
    if (!element) return;

    // Temporarily expand element to capture full table width
    const originalOverflow = element.style.overflow;
    const originalWidth = element.style.width;
    element.style.overflow = "visible";
    element.style.width = element.scrollWidth + "px";

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: element.scrollWidth,
        windowWidth: element.scrollWidth,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdfWidth = canvas.width / 2;
      const pdfHeight = canvas.height / 2;

      const pdf = new jsPDF({
        orientation: pdfWidth > pdfHeight ? "landscape" : "portrait",
        unit: "px",
        format: [pdfWidth, pdfHeight],
      });

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`product_stock_report_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      // Restore original styles
      element.style.overflow = originalOverflow;
      element.style.width = originalWidth;
    }
  };

  const handleExportCSV = () => {
    const headers = ["#", "Product Name", "Barcode", "Category", "Total Stock (All Warehouses)"];
    const rows = mergedInventory.map((item, index) => [
      index + 1,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.barcode || "-"}"`,
      `"${getCategoryName(item.category_id)}"`,
      item.current_stock
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `product_stock_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
          <h1 className="text-xl font-bold tracking-tight">Product Stock Report (All Warehouses)</h1>
          <p className="text-xs text-muted-foreground">Comprehensive real-time stock across all locations</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportPDF} className="gap-2 bg-red-600 hover:bg-red-700 text-white">
            <File02Icon className="size-4" />
            Export to PDF
          </Button>
          <Button onClick={handleExportCSV} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Download04Icon className="size-4" />
            Export to CSV
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900 p-4 sm:p-6">
        <div id="pdf-report-content" className="bg-white dark:bg-black border rounded-sm shadow-sm overflow-hidden flex flex-col p-4">
          <div className="mb-6 flex justify-between items-end border-b pb-4">
             <div>
               <h2 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">Product Stock Report</h2>
               <p className="text-sm text-neutral-500">All Warehouses</p>
             </div>
             <div className="text-right">
               <p className="text-xs text-neutral-400">Generated on</p>
               <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">{new Date().toLocaleDateString()}</p>
             </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-neutral-100 dark:bg-neutral-800 border-b-2 border-neutral-300 dark:border-neutral-700">
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 w-12 text-center">#</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Product Name</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Barcode</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Category</th>
                <th className="px-3 py-2 font-semibold text-blue-700 dark:text-blue-400 text-right bg-blue-50 dark:bg-blue-950/30">Total Stock</th>
              </tr>
            </thead>
            <tbody>
              {mergedInventory.map((item, idx) => {
                return (
                  <tr key={idx} className="border-b hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-none">
                    <td className="px-3 py-1.5 border-r text-center text-neutral-500 bg-neutral-50 dark:bg-neutral-900/50">{idx + 1}</td>
                    <td className="px-3 py-1.5 border-r font-medium text-neutral-800 dark:text-neutral-200">{item.name}</td>
                    <td className="px-3 py-1.5 border-r font-mono text-[11px] text-neutral-500">{item.barcode || "-"}</td>
                    <td className="px-3 py-1.5 border-r text-neutral-600 dark:text-neutral-400">{getCategoryName(item.category_id)}</td>
                    <td className="px-3 py-1.5 text-right font-bold text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/10">{item.current_stock}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-neutral-100 dark:bg-neutral-800 border-t-2 border-neutral-300 dark:border-neutral-700 font-bold">
                <td colSpan={4} className="px-3 py-3 border-r text-right uppercase tracking-wider text-[10px]">Grand Total</td>
                <td className="px-3 py-3 text-right font-bold text-blue-700 dark:text-blue-400 text-sm">{mergedInventory.reduce((acc, item) => acc + item.current_stock, 0)}</td>
              </tr>
            </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
