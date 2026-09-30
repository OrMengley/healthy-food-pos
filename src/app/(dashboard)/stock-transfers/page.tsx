"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  Sorting01Icon, 
  Add01Icon, 
  Loading01Icon,
  Package01Icon,
  Home01Icon,
  Calendar01Icon,
  Search01Icon,
  Cancel01Icon,
  FilterIcon
} from "hugeicons-react";
import { getStockMovements } from "@/lib/firebase/stock-transfer-actions";
import { getProducts } from "@/lib/firebase/actions";
import { getWarehouses } from "@/lib/firebase/warehouse-actions";
import { StockMovement, Product, Warehouse } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StockTransferForm } from "@/components/forms/StockTransferForm";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export default function StockTransfersPage() {
  const [transfers, setTransfers] = useState<StockMovement[] | any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Filters state
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

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

  async function fetchData() {
    try {
      setLoading(true);
      const [transferData, productData, warehouseData] = await Promise.all([
        getStockMovements(),
        getProducts(),
        getWarehouses()
      ]);
      setTransfers(transferData);
      setProducts(productData);
      setWarehouses(warehouseData);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load transfer data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  // Filter & sort (newest first descending)
  const filteredTransfers = useMemo(() => {
    let result = [...transfers];

    // Date range filter
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      result = result.filter(t => {
        const tDate = t.date ? new Date(t.date) : new Date();
        return tDate >= start;
      });
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(t => {
        const tDate = t.date ? new Date(t.date) : new Date();
        return tDate <= end;
      });
    }

    // Search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(t => {
        const prod = productMap[t.product_id];
        const matchProdName = prod?.name?.toLowerCase().includes(query);
        const matchBarcode = prod?.barcode?.toLowerCase().includes(query);
        const matchFromW = warehouseMap[t.from_warehouse_id!]?.name?.toLowerCase().includes(query);
        const matchToW = warehouseMap[t.to_warehouse_id!]?.name?.toLowerCase().includes(query);
        const matchNote = t.note?.toLowerCase().includes(query);
        return matchProdName || matchBarcode || matchFromW || matchToW || matchNote;
      });
    }

    // Always sort descending by date (newest first at top)
    return result.sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      return timeB - timeA;
    });
  }, [transfers, startDate, endDate, searchQuery, productMap, warehouseMap]);

  const hasActiveFilters = Boolean(startDate || endDate || searchQuery);

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setSearchQuery("");
  };

  return (
    <div className="flex flex-col px-4 lg:px-6 py-4">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-4 pt-2 -mt-2 flex flex-col gap-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Sorting01Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Stock Transfers</h1>
            <p className="text-sm text-muted-foreground">Move inventory between warehouses</p>
          </div>
        </div>
        <Button 
          size="sm" 
          className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
          onClick={() => setSheetOpen(true)}
        >
          <Add01Icon className="mr-2 size-4" />
          New Transfer
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="p-3.5 rounded-xl border bg-card shadow-2xs flex flex-wrap items-center gap-3 justify-between">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[180px]">
                <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by product, barcode, warehouse..."
                  className="pl-8 text-xs h-9 bg-background/50 border-slate-200"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <Cancel01Icon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Start Date */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar01Icon className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                <span className="hidden sm:inline font-medium text-[11px]">From:</span>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-xs h-9 w-[130px] bg-background/50 border-slate-200"
                />
              </div>

              {/* End Date */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="hidden sm:inline font-medium text-[11px]">To:</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-xs h-9 w-[130px] bg-background/50 border-slate-200"
                />
              </div>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-9 px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 font-medium"
                >
                  <Cancel01Icon className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            <Badge variant="outline" className="text-[11px] font-semibold text-slate-600 border-slate-200 px-2.5 py-1 shrink-0">
              Showing {filteredTransfers.length} of {transfers.length}
            </Badge>
          </div>
      </div>

      {/* Data Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
            <Table wrapperClassName="max-h-[calc(100vh-240px)]">
              <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/70 shadow-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Product</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">From</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">To</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-center">Qty</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Date</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-48">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loading01Icon className="animate-spin size-6 text-primary" />
                        <span className="text-sm font-medium">Fetching transfers...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredTransfers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-48 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Package01Icon className="size-8 opacity-20" />
                        <p>{hasActiveFilters ? "No transfers match the selected filters." : "No transfers recorded yet."}</p>
                        {hasActiveFilters && (
                          <Button variant="outline" size="sm" onClick={clearFilters} className="text-xs mt-1">
                            Reset Filters
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransfers.map((transfer) => (
                    <TableRow key={transfer.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm tracking-tight">{productMap[transfer.product_id]?.name || "Unknown Product"}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{productMap[transfer.product_id]?.barcode}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 font-medium">
                          {warehouseMap[transfer.from_warehouse_id!]?.name || "Unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-medium">
                          {warehouseMap[transfer.to_warehouse_id!]?.name || "Unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                         <span className="font-black text-primary text-sm">{transfer.quantity}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {transfer.date
                          ? format(transfer.date, "dd MMM yyyy, HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate italic">
                        {transfer.note || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-[550px] p-0 flex flex-col overflow-hidden">
          <SheetHeader className="p-6 bg-muted/20 border-b">
            <SheetTitle>New Stock Transfer</SheetTitle>
            <SheetDescription>Move stock between locations.</SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="p-6">
              <StockTransferForm onSuccess={() => {
                setSheetOpen(false);
                fetchData();
              }} />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
