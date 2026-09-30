"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Loading01Icon, Download04Icon } from "hugeicons-react";
import { getAllStockMovements } from "@/lib/firebase/stock-transfer-actions";
import { getProducts } from "@/lib/firebase/actions";
import { getWarehouses } from "@/lib/firebase/warehouse-actions";
import { StockMovement, Product, Warehouse } from "@/types";
import { format } from "date-fns";

export default function StockMovementReportPage() {
  const [movements, setMovements] = useState<StockMovement[] | any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [movementData, productData, warehouseData] = await Promise.all([
          getAllStockMovements(),
          getProducts(),
          getWarehouses()
        ]);
        let role = null;
        let wId = null;
        try {
          const authStr = localStorage.getItem("user_auth");
          if (authStr) {
            const authData = JSON.parse(authStr);
            role = authData?.user_info?.role;
            wId = authData?.user_info?.warehouse_id;
          }
        } catch (e) {
          console.error("Failed to parse user_auth", e);
        }

        let filteredMovements = movementData;
        if (role !== "admin" && role !== "super_admin") {
          if (wId) {
            filteredMovements = movementData.filter((m: any) => 
              m.from_warehouse_id === wId || m.to_warehouse_id === wId
            );
          } else {
            filteredMovements = [];
          }
        }

        setMovements(filteredMovements);
        setProducts(productData);
        setWarehouses(warehouseData);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const productMap = useMemo(() => {
    const map: Record<string, Product> = {};
    products.forEach(p => map[p.id] = p);
    return map;
  }, [products]);

  const warehouseMap = useMemo(() => {
    const map: Record<string, Warehouse> = {};
    warehouses.forEach(w => map[w.id] = w);
    return map;
  }, [warehouses]);

  const handleExportCSV = () => {
    const headers = ["Date", "Product Name", "Barcode", "Movement Type", "Quantity", "From Location", "To Location", "Note"];
    const rows = movements.map((m) => {
      const prod = productMap[m.product_id];
      const fromW = m.from_warehouse_id ? warehouseMap[m.from_warehouse_id]?.name : "-";
      const toW = m.to_warehouse_id ? warehouseMap[m.to_warehouse_id]?.name : "-";
      
      return [
        m.date ? format(m.date, "yyyy-MM-dd HH:mm") : "-",
        `"${(prod?.name || "Unknown").replace(/"/g, '""')}"`,
        `"${prod?.barcode || "-"}"`,
        m.type,
        m.quantity,
        `"${(fromW || "-").replace(/"/g, '""')}"`,
        `"${(toW || "-").replace(/"/g, '""')}"`,
        `"${(m.note || m.reference || "-").replace(/"/g, '""')}"`
      ];
    });
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `stock_movement_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTypeName = (type: string) => {
    return type.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
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
          <h1 className="text-xl font-bold tracking-tight">Stock Movement Report</h1>
          <p className="text-xs text-muted-foreground">Comprehensive log of all inventory changes</p>
        </div>
        <Button onClick={handleExportCSV} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
          <Download04Icon className="size-4" />
          Export to CSV
        </Button>
      </div>

      <div className="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900 p-4 sm:p-6">
        <div className="bg-white dark:bg-black border rounded-sm shadow-sm overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-neutral-100 dark:bg-neutral-800 border-b-2 border-neutral-300 dark:border-neutral-700">
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Date</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Product Name</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Barcode</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Movement Type</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Quantity</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">From</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">To</th>
                <th className="px-3 py-2 font-semibold text-neutral-600 dark:text-neutral-300">Note / Ref</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement, idx) => {
                const prod = productMap[movement.product_id];
                const fromW = movement.from_warehouse_id ? warehouseMap[movement.from_warehouse_id]?.name : "—";
                const toW = movement.to_warehouse_id ? warehouseMap[movement.to_warehouse_id]?.name : "—";
                return (
                  <tr key={movement.id || idx} className="border-b hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-none">
                    <td className="px-3 py-1.5 border-r text-neutral-600 dark:text-neutral-400">
                      {movement.date ? format(movement.date, "dd MMM yyyy, HH:mm") : "—"}
                    </td>
                    <td className="px-3 py-1.5 border-r font-medium text-neutral-800 dark:text-neutral-200">
                      {prod?.name || "Unknown"}
                    </td>
                    <td className="px-3 py-1.5 border-r font-mono text-[11px] text-neutral-500">
                      {prod?.barcode || "—"}
                    </td>
                    <td className="px-3 py-1.5 border-r text-neutral-600 dark:text-neutral-400 font-medium">
                      {getTypeName(movement.type)}
                    </td>
                    <td className="px-3 py-1.5 border-r text-right font-bold text-neutral-800 dark:text-neutral-200">
                      {movement.quantity}
                    </td>
                    <td className="px-3 py-1.5 border-r text-neutral-600 dark:text-neutral-400">
                      {fromW}
                    </td>
                    <td className="px-3 py-1.5 border-r text-neutral-600 dark:text-neutral-400">
                      {toW}
                    </td>
                    <td className="px-3 py-1.5 text-neutral-500 italic max-w-[200px] truncate">
                      {movement.note || movement.reference || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
