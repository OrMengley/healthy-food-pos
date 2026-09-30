"use client";

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { 
  BarChartIcon, 
  Loading01Icon,
  Package01Icon,
  Search01Icon,
  Cancel01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  ShoppingCart01Icon,
  Settings01Icon,
  RotateLeft01Icon,
} from "hugeicons-react";
import { getStockMovements } from "@/lib/firebase/stock-actions";
import { getProducts } from "@/lib/firebase/actions";
import { StockMovement, Product } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { formatCambodiaDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export default function StockMovementPage() {
  const { user, role } = useAuth();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const productMap = useMemo(() => {
    const map: Record<string, Product> = {};
    products.forEach(p => map[p.id] = p);
    return map;
  }, [products]);

  async function fetchData() {
    try {
      setLoading(true);
      const [movementData, productData] = await Promise.all([
        getStockMovements(),
        getProducts(),
      ]);
      setMovements(movementData);
      setProducts(productData);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load stock movements");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const filteredMovements = useMemo(() => {
    const isSuperAdmin = role === "super_admin";
    const userWhId = user?.warehouse_id;

    return movements.filter((m) => {
      // Warehouse scoping
      if (!isSuperAdmin && userWhId) {
        const matchesWarehouse = 
          (m as any).warehouse_id === userWhId || 
          m.from_warehouse_id === userWhId || 
          m.to_warehouse_id === userWhId;
        if (!matchesWarehouse) return false;
      }

      if (typeFilter !== "all" && m.type !== typeFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const p = productMap[m.product_id];
        const matchName = p?.name?.toLowerCase().includes(q) || m.product_name?.toLowerCase().includes(q);
        const matchBarcode = p?.barcode?.toLowerCase().includes(q) || m.product_barcode?.toLowerCase().includes(q);
        const matchNote = m.note?.toLowerCase().includes(q) || m.reason?.toLowerCase().includes(q);

        if (!matchName && !matchBarcode && !matchNote) return false;
      }

      return true;
    });
  }, [movements, typeFilter, searchQuery, productMap]);

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "stock_in":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 shadow-none font-bold gap-1 text-xs">
            <ArrowDown01Icon className="size-3" />
            Stock In
          </Badge>
        );
      case "stock_out":
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 shadow-none font-bold gap-1 text-xs">
            <ShoppingCart01Icon className="size-3" />
            POS Sale
          </Badge>
        );
      case "adjustment":
        return (
          <Badge className="bg-purple-100 text-purple-800 border-purple-200 shadow-none font-bold gap-1 text-xs">
            <Settings01Icon className="size-3" />
            Adjustment
          </Badge>
        );
      case "return":
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 shadow-none font-bold gap-1 text-xs">
            <RotateLeft01Icon className="size-3" />
            Sale Return
          </Badge>
        );
      case "purchase_void":
        return (
          <Badge className="bg-rose-100 text-rose-800 border-rose-200 shadow-none font-bold gap-1 text-xs">
            <Cancel01Icon className="size-3" />
            Purchase Void
          </Badge>
        );
      default:
        return <Badge variant="outline" className="capitalize font-medium">{type.replace("_", " ")}</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <BarChartIcon className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight md:text-2xl">Stock Movement History</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Full audit trail of stock ins, POS sales deductions, manual adjustments, and cancellations.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by product, barcode (HF-...), or note..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-9 text-sm w-full bg-background"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              >
                <Cancel01Icon className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-[160px] text-xs sm:text-sm bg-background font-medium">
              <SelectValue placeholder="All Movements" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Movements ({movements.length})</SelectItem>
              <SelectItem value="stock_in">Stock In</SelectItem>
              <SelectItem value="stock_out">POS Sales</SelectItem>
              <SelectItem value="adjustment">Adjustments</SelectItem>
              <SelectItem value="return">Returns / Refunds</SelectItem>
              <SelectItem value="purchase_void">Purchase Void</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Movements Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="font-bold text-xs uppercase tracking-wider">Date & Time</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider">Product</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider">Movement Type</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider text-center">Qty</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider">Stock Levels</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider">Note / Reason</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider">User</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-48">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loading01Icon className="animate-spin size-6 text-primary" />
                    <span className="text-sm font-medium">Loading stock audit trail...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredMovements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-48 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Package01Icon className="size-8 opacity-20" />
                    <p className="font-medium text-sm">No stock movements found.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredMovements.map((movement) => {
                const prod = productMap[movement.product_id];
                const prodName = prod?.name || movement.product_name || "Product";
                const prodBarcode = prod?.barcode || movement.product_barcode || "";

                return (
                  <TableRow key={movement.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {movement.date ? formatCambodiaDate(movement.date, "datetime") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm tracking-tight text-foreground">{prodName}</span>
                        {prodBarcode && (
                          <span className="text-[11px] text-muted-foreground font-mono">{prodBarcode}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getTypeBadge(movement.type)}
                    </TableCell>
                    <TableCell className="text-center font-black text-sm tabular-nums">
                      {movement.type === "stock_out" || movement.type === "purchase_void" ? (
                        <span className="text-rose-600">-{movement.quantity}</span>
                      ) : movement.type === "stock_in" || movement.type === "return" ? (
                        <span className="text-emerald-600">+{movement.quantity}</span>
                      ) : (
                        <span className="text-foreground">{movement.quantity}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {movement.previous_stock_level} → <strong className="text-foreground">{movement.new_stock_level}</strong>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {movement.reason ? `[${movement.reason}] ` : ""}
                      {movement.note || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {movement.created_by_name || movement.created_by || "Admin"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
