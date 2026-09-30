"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Add01Icon,
  Loading01Icon,
  Package01Icon,
  Search01Icon,
  Cancel01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Settings01Icon,
  Calendar03Icon,
  FileExportIcon,
  Download04Icon,
  InformationCircleIcon,
} from "hugeicons-react";
import { getAdjustmentMovements } from "@/lib/firebase/stock-actions";
import { getProducts } from "@/lib/firebase/actions";
import { StockMovement, Product } from "@/types";
import {
  formatCambodiaDate,
  getCambodiaDateString,
  getCambodiaDateParts,
  isTodayCambodia,
  isYesterdayCambodia,
  isThisMonthCambodia,
  parseFirestoreDate,
} from "@/lib/utils";
import * as XLSX from "xlsx";

type DateFilterPreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_month"
  | "all"
  | "custom";

export default function StockAdjustmentPage() {
  const [adjustments, setAdjustments] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const productMap = useMemo(() => {
    const map: Record<string, Product> = {};
    products.forEach((p) => (map[p.id] = p));
    return map;
  }, [products]);

  async function fetchData() {
    try {
      setLoading(true);
      const [adjData, productData] = await Promise.all([
        getAdjustmentMovements(),
        getProducts(),
      ]);
      setAdjustments(adjData);
      setProducts(productData);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load stock adjustment history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered Adjustments
  const filteredAdjustments = useMemo(() => {
    return adjustments.filter((adj) => {
      const isUp = (adj.new_stock_level ?? 0) >= (adj.previous_stock_level ?? 0);

      // Direction Filter
      if (directionFilter === "up" && !isUp) return false;
      if (directionFilter === "down" && isUp) return false;

      // Reason Filter
      if (reasonFilter !== "all") {
        const r = (adj.reason || adj.note || "").toLowerCase();
        if (!r.includes(reasonFilter.toLowerCase())) return false;
      }

      // Date Filter (Cambodia ICT Timezone)
      const adjDate = parseFirestoreDate(adj.date || adj.created_at);
      if (datePreset === "today") {
        if (!isTodayCambodia(adjDate)) return false;
      } else if (datePreset === "yesterday") {
        if (!isYesterdayCambodia(adjDate)) return false;
      } else if (datePreset === "this_month") {
        if (!isThisMonthCambodia(adjDate)) return false;
      } else if (datePreset === "this_week") {
        const todayCambodiaStr = getCambodiaDateString(new Date());
        const curr = new Date(todayCambodiaStr);
        const firstDayOfWeek = new Date(
          curr.setDate(curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1))
        );
        const firstDayStr = getCambodiaDateString(firstDayOfWeek);
        const adjDateStr = getCambodiaDateString(adjDate);
        if (adjDateStr < firstDayStr || adjDateStr > todayCambodiaStr) return false;
      } else if (datePreset === "last_month") {
        const targetParts = getCambodiaDateParts(adjDate);
        const currParts = getCambodiaDateParts(new Date());
        let targetMonth = Number(currParts.month) - 1;
        let targetYear = Number(currParts.year);
        if (targetMonth === 0) {
          targetMonth = 12;
          targetYear -= 1;
        }
        if (Number(targetParts.year) !== targetYear || Number(targetParts.month) !== targetMonth) {
          return false;
        }
      } else if (datePreset === "custom") {
        const adjDateStr = getCambodiaDateString(adjDate);
        if (customStartDate && adjDateStr < customStartDate) return false;
        if (customEndDate && adjDateStr > customEndDate) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const p = productMap[adj.product_id];
        const matchName =
          p?.name?.toLowerCase().includes(q) || adj.product_name?.toLowerCase().includes(q);
        const matchBarcode =
          p?.barcode?.toLowerCase().includes(q) || adj.product_barcode?.toLowerCase().includes(q);
        const matchReason =
          adj.reason?.toLowerCase().includes(q) || adj.note?.toLowerCase().includes(q);
        const matchUser =
          adj.created_by_name?.toLowerCase().includes(q) ||
          adj.created_by?.toLowerCase().includes(q);

        if (!matchName && !matchBarcode && !matchReason && !matchUser) return false;
      }

      return true;
    });
  }, [
    adjustments,
    directionFilter,
    reasonFilter,
    datePreset,
    customStartDate,
    customEndDate,
    searchQuery,
    productMap,
  ]);

  // KPI Metrics
  const metrics = useMemo(() => {
    let totalDeductions = 0;
    let totalAdditions = 0;
    let totalDeductedUnits = 0;
    let totalAddedUnits = 0;

    filteredAdjustments.forEach((adj) => {
      const isUp = (adj.new_stock_level ?? 0) >= (adj.previous_stock_level ?? 0);
      const qty = Number(adj.quantity || 0);
      if (isUp) {
        totalAdditions++;
        totalAddedUnits += qty;
      } else {
        totalDeductions++;
        totalDeductedUnits += qty;
      }
    });

    const netUnitsImpact = totalAddedUnits - totalDeductedUnits;

    return {
      totalCount: filteredAdjustments.length,
      totalDeductions,
      totalAdditions,
      totalDeductedUnits,
      totalAddedUnits,
      netUnitsImpact,
    };
  }, [filteredAdjustments]);

  // Export to Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    const headers = [
      "#",
      "Date & Time (Cambodia ICT)",
      "Product Name",
      "Barcode",
      "Adjustment Type",
      "Quantity Changed",
      "Previous Stock",
      "New Stock",
      "Reason",
      "Note / Remark",
      "Adjusted By",
    ];

    const rows = filteredAdjustments.map((adj, idx) => {
      const isUp = (adj.new_stock_level ?? 0) >= (adj.previous_stock_level ?? 0);
      const prod = productMap[adj.product_id];
      return [
        idx + 1,
        formatCambodiaDate(adj.date || adj.created_at, "invoice"),
        prod?.name || adj.product_name || "Unknown Product",
        prod?.barcode || adj.product_barcode || "-",
        isUp ? "Add Stock (+)" : "Deduct Stock (-)",
        isUp ? `+${adj.quantity}` : `-${adj.quantity}`,
        adj.previous_stock_level,
        adj.new_stock_level,
        adj.reason || "Adjustment",
        adj.note || "-",
        adj.created_by_name || adj.created_by || "Admin",
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, "Stock Adjustments");
    XLSX.writeFile(wb, `HealthyFood_Stock_Adjustments_${formatCambodiaDate(new Date(), "code")}.xlsx`);
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      "Date (ICT)",
      "Product",
      "Barcode",
      "Type",
      "Quantity",
      "Previous Stock",
      "New Stock",
      "Reason",
      "Note",
      "Adjusted By",
    ];

    const rows = filteredAdjustments.map((adj) => {
      const isUp = (adj.new_stock_level ?? 0) >= (adj.previous_stock_level ?? 0);
      const prod = productMap[adj.product_id];
      return [
        `"${formatCambodiaDate(adj.date || adj.created_at, "invoice")}"`,
        `"${(prod?.name || adj.product_name || "Unknown").replace(/"/g, '""')}"`,
        `"${prod?.barcode || adj.product_barcode || "-"}"`,
        isUp ? "Add Stock (+)" : "Deduct Stock (-)",
        isUp ? `+${adj.quantity}` : `-${adj.quantity}`,
        adj.previous_stock_level,
        adj.new_stock_level,
        `"${(adj.reason || "Adjustment").replace(/"/g, '""')}"`,
        `"${(adj.note || "").replace(/"/g, '""')}"`,
        `"${(adj.created_by_name || "Admin").replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `HealthyFood_Stock_Adjustments_${formatCambodiaDate(new Date(), "code")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* ─── Page Header & Action Controls ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-5 rounded-2xl border border-amber-500/15">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-500/15 px-2 py-0.5 rounded-md">
              Inventory Controls
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
              <Calendar03Icon className="size-3 text-emerald-600" />
              Cambodia ICT (UTC+7)
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground mt-1">
            Stock Adjustments
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Correct inventory quantities for damaged food, count discrepancies, or sample giveaways.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            asChild
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1.5 shadow-sm"
          >
            <Link href="/stock-adjustment/new">
              <Add01Icon className="size-4" />
              Create Adjustment
            </Link>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportExcel}
            className="font-semibold gap-1.5 bg-background shadow-sm"
          >
            <FileExportIcon className="size-4 text-emerald-600" />
            Export Excel
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCSV}
            className="font-semibold gap-1.5 bg-background shadow-sm"
          >
            <Download04Icon className="size-4 text-blue-600" />
            CSV
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={fetchData}
            disabled={loading}
            className="font-semibold gap-1.5"
          >
            <Loading01Icon className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ─── Top KPI Metric Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Adjustments */}
        <Card className="border-amber-500/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Total Adjustments</span>
              <Settings01Icon className="size-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-foreground tabular-nums">
              {metrics.totalCount} Logs
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-medium text-muted-foreground pt-0">
            Across selected date period
          </CardContent>
        </Card>

        {/* Total Deductions */}
        <Card className="border-amber-500/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Stock Deductions (-)</span>
              <ArrowDown01Icon className="size-4 text-rose-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-rose-600 tabular-nums">
              -{metrics.totalDeductedUnits} Units
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-medium text-muted-foreground pt-0">
            {metrics.totalDeductions} deduction operations
          </CardContent>
        </Card>

        {/* Total Additions */}
        <Card className="border-amber-500/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Stock Additions (+)</span>
              <ArrowUp01Icon className="size-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-600 tabular-nums">
              +{metrics.totalAddedUnits} Units
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-medium text-muted-foreground pt-0">
            {metrics.totalAdditions} addition operations
          </CardContent>
        </Card>

        {/* Net Units Impact */}
        <Card className="border-amber-500/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Net Stock Impact</span>
              <Package01Icon className="size-4 text-blue-600" />
            </CardDescription>
            <CardTitle
              className={`text-2xl font-black tabular-nums ${
                metrics.netUnitsImpact >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {metrics.netUnitsImpact >= 0 ? `+${metrics.netUnitsImpact}` : metrics.netUnitsImpact} Units
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-medium text-muted-foreground pt-0">
            Overall inventory variance
          </CardContent>
        </Card>
      </div>

      {/* ─── Search & Toolbar ─── */}
      <Card className="border-muted shadow-sm">
        <CardContent className="p-4 space-y-3">
          {/* Preset Buttons */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-bold text-muted-foreground uppercase text-[10px] tracking-wider mr-1">
              Time Period:
            </span>
            {[
              { id: "all", label: "All Time" },
              { id: "today", label: "Today (ICT)" },
              { id: "yesterday", label: "Yesterday" },
              { id: "this_week", label: "This Week" },
              { id: "this_month", label: "This Month" },
              { id: "last_month", label: "Last Month" },
              { id: "custom", label: "Custom" },
            ].map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={datePreset === p.id ? "default" : "outline"}
                onClick={() => setDatePreset(p.id as DateFilterPreset)}
                className={`h-8 text-xs font-semibold ${
                  datePreset === p.id ? "bg-amber-600 hover:bg-amber-700 text-white" : ""
                }`}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* Custom Date Inputs */}
          {datePreset === "custom" && (
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border flex-wrap">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-muted-foreground">From:</span>
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="h-8 w-40 text-xs bg-background"
                />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-muted-foreground">To:</span>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="h-8 w-40 text-xs bg-background"
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCustomStartDate("");
                  setCustomEndDate("");
                }}
                className="h-8 text-xs"
              >
                Reset
              </Button>
            </div>
          )}

          {/* Filters Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <div className="relative">
              <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search product, barcode, reason, staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9 text-xs bg-background"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <Cancel01Icon className="size-3.5" />
                </button>
              )}
            </div>

            {/* Direction Filter */}
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Adjustment Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Adjustment Directions</SelectItem>
                <SelectItem value="down">📉 Deductions (-)</SelectItem>
                <SelectItem value="up">📈 Additions (+)</SelectItem>
              </SelectContent>
            </Select>

            {/* Reason Filter */}
            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Reasons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reasons</SelectItem>
                <SelectItem value="damaged">Damaged Food</SelectItem>
                <SelectItem value="discrepancy">Count Discrepancy</SelectItem>
                <SelectItem value="sample">Sample / Promo</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ─── Full-Width Adjustment History Table ─── */}
      <Card className="border-muted shadow-sm">
        <CardHeader className="pb-3 bg-muted/20 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Settings01Icon className="size-5 text-amber-600" />
              Adjustment Movement Audit Log
            </CardTitle>
            <CardDescription className="text-xs">
              Showing {filteredAdjustments.length} adjustment records
            </CardDescription>
          </div>
          <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1">
            <Link href="/stock-adjustment/new">
              <Add01Icon className="size-4" />
              New Adjustment
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="text-muted-foreground font-bold uppercase text-[10px] tracking-wider">
                  <TableHead className="py-3 px-4">Date & Time (ICT)</TableHead>
                  <TableHead className="py-3 px-4">Product Name</TableHead>
                  <TableHead className="py-3 px-4 text-center">Direction</TableHead>
                  <TableHead className="py-3 px-4 text-center">Quantity Change</TableHead>
                  <TableHead className="py-3 px-4 text-center">Stock Before → After</TableHead>
                  <TableHead className="py-3 px-4">Reason & Note</TableHead>
                  <TableHead className="py-3 px-4 text-left">Adjusted By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-48">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loading01Icon className="animate-spin size-6 text-amber-600" />
                        <span className="text-xs font-semibold">Loading stock adjustments...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredAdjustments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-48 text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2 py-6">
                        <InformationCircleIcon className="size-8 text-muted-foreground/50" />
                        <p className="font-semibold text-sm">No adjustments found matching your filters.</p>
                        <Button asChild size="sm" variant="outline" className="mt-2 text-xs">
                          <Link href="/stock-adjustment/new">Create First Adjustment</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAdjustments.map((adj) => {
                    const prod = productMap[adj.product_id];
                    const isUp = (adj.new_stock_level ?? 0) >= (adj.previous_stock_level ?? 0);
                    const prodName = prod?.name || adj.product_name || "Unknown Product";
                    const prodBarcode = prod?.barcode || adj.product_barcode || "";

                    return (
                      <TableRow key={adj.id} className="hover:bg-muted/30 transition-colors text-xs">
                        {/* Date */}
                        <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                          <div className="font-bold text-foreground">
                            {formatCambodiaDate(adj.date || adj.created_at, "date")}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatCambodiaDate(adj.date || adj.created_at, "time")} ICT
                          </div>
                        </td>

                        {/* Product */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-sm text-foreground">{prodName}</div>
                          {prodBarcode && (
                            <div className="text-[11px] font-mono text-muted-foreground">{prodBarcode}</div>
                          )}
                        </td>

                        {/* Direction */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-bold gap-1 ${
                              isUp
                                ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-700 border-rose-500/20"
                            }`}
                          >
                            {isUp ? <ArrowUp01Icon className="size-3" /> : <ArrowDown01Icon className="size-3" />}
                            {isUp ? "Add Stock" : "Deduct Stock"}
                          </Badge>
                        </td>

                        {/* Quantity Changed */}
                        <td className="py-3 px-4 text-center font-black tabular-nums text-sm">
                          <span className={isUp ? "text-emerald-600" : "text-rose-600"}>
                            {isUp ? `+${adj.quantity}` : `-${adj.quantity}`}
                          </span>
                        </td>

                        {/* Stock Before -> After */}
                        <td className="py-3 px-4 text-center text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                          <span className="font-semibold">{adj.previous_stock_level}</span>
                          <span className="mx-1.5 text-muted-foreground">→</span>
                          <strong className="text-foreground font-black text-sm">{adj.new_stock_level}</strong>
                        </td>

                        {/* Reason & Note */}
                        <td className="py-3 px-4">
                          <span className="font-bold text-foreground block">
                            {adj.reason || "Adjustment"}
                          </span>
                          {adj.note && adj.note !== adj.reason && (
                            <span className="text-muted-foreground block text-[11px] mt-0.5">{adj.note}</span>
                          )}
                        </td>

                        {/* Adjusted By */}
                        <td className="py-3 px-4 whitespace-nowrap text-muted-foreground font-medium">
                          {adj.created_by_name || adj.created_by || "Admin"}
                        </td>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
