"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { getSaleInvoices } from "@/lib/firebase/sale-actions";
import { getAdjustmentMovements } from "@/lib/firebase/stock-actions";
import { getProducts, getUsers } from "@/lib/firebase/actions";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import { SaleInvoice, StockMovement, Product, User, StoreSettings } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dollar01Icon,
  Package01Icon,
  ChartIncreaseIcon,
  Search01Icon,
  Download04Icon,
  FileExportIcon,
  PrinterIcon,
  Loading01Icon,
  Calendar03Icon,
  Store01Icon,
  MoneyReceiveSquareIcon,
  File02Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  InformationCircleIcon,
  Copy01Icon,
  EyeIcon,
  Settings01Icon,
  Layers01Icon,
  ShoppingCart01Icon,
} from "hugeicons-react";
import {
  formatCambodiaDate,
  getCambodiaDateString,
  getCambodiaDateParts,
  isTodayCambodia,
  isYesterdayCambodia,
  isThisMonthCambodia,
  parseFirestoreDate,
} from "@/lib/utils";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { useAuth } from "@/hooks/useAuth";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Legend,
} from "recharts";

type DateFilterPreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "all"
  | "custom";

type TabView = "all_records" | "sale_discounts" | "adjustment_losses" | "statement";

interface ProfitLossEntry {
  id: string;
  type: "sale_discount" | "adjustment_loss";
  date: Date;
  dateStr: string;
  reference: string;
  title: string;
  subtitle: string;
  reason: string;
  grossProfitBeforeDiscount?: number;
  discountLoss: number;
  adjustmentCostLoss: number;
  totalLossAmount: number;
  realizedNetProfit?: number;
  staffName: string;
  rawInvoice?: SaleInvoice;
  rawAdjustment?: StockMovement;
}

export default function ProfitLossPage() {
  const { user, role } = useAuth();
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [adjustments, setAdjustments] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeTab, setActiveTab] = useState<TabView>("all_records");
  const [searchQuery, setSearchQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("this_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [lossTypeFilter, setLossTypeFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");

  // Receipt modal
  const [receiptInvoice, setReceiptInvoice] = useState<SaleInvoice | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [invs, adjs, prods, usrs, storeConfig] = await Promise.all([
        getSaleInvoices(),
        getAdjustmentMovements(),
        getProducts(),
        getUsers(),
        getStoreSettings(),
      ]);
      setInvoices(invs);
      setAdjustments(adjs);
      setProducts(prods);
      setUsers(usrs);
      setSettings(storeConfig);
    } catch (error) {
      console.error("Failed to load Profit & Loss data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const exchangeRate = settings.exchange_rate_khr || 4100;

  // Product map
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  // Transform Sale Invoices & Stock Adjustments into Unified P&L Loss Ledger
  const rawLedgerEntries = useMemo(() => {
    const entries: ProfitLossEntry[] = [];

    // 1. Process Sale Discounts from Invoices
    invoices.forEach((inv) => {
      if (inv.is_archived || inv.status === "not paid") return;

      const invDate = parseFirestoreDate(inv.created_at);
      const dateStr = getCambodiaDateString(invDate);

      let totalItemCost = 0;
      let totalItemDiscounts = 0;
      let totalItemOriginalPrice = 0;

      inv.items?.forEach((item) => {
        const qty = Number(item.quantity || 0);
        const cost = Number(item.cost || 0);
        const price = Number(item.price || 0);
        const disc = Number(item.discount || 0);

        totalItemCost += cost * qty;
        totalItemDiscounts += disc * qty;
        totalItemOriginalPrice += price * qty;
      });

      const orderDiscount = Number(inv.discount || 0);
      const totalDiscountLoss = totalItemDiscounts + orderDiscount;

      // Base Profit if no discount was given
      const grossProfitBeforeDiscount = totalItemOriginalPrice - totalItemCost;
      // Realized profit after discount
      const realizedNetProfit = Math.max(0, Number(inv.total_price || 0) - totalItemCost);

      // If a discount was given, create a Profit Loss entry
      if (totalDiscountLoss > 0) {
        entries.push({
          id: `disc-${inv.id}`,
          type: "sale_discount",
          date: invDate,
          dateStr,
          reference: inv.invoice_number || inv.id,
          title: `Sale Discount #${inv.invoice_number || inv.id}`,
          subtitle: `Customer: ${inv.customer_name || (inv.customer_type === "online" ? "Online Customer" : "Walk-in Customer")}`,
          reason: "Sale Discount",
          grossProfitBeforeDiscount,
          discountLoss: totalDiscountLoss,
          adjustmentCostLoss: 0,
          totalLossAmount: totalDiscountLoss,
          realizedNetProfit,
          staffName: inv.created_by_name || "Admin",
          rawInvoice: inv,
        });
      }
    });

    // 2. Process Adjustment Deductions (Stock Adjustment Out)
    adjustments.forEach((adj) => {
      const isUp = (adj.new_stock_level ?? 0) >= (adj.previous_stock_level ?? 0);
      // Only process deductions (stock write-offs / loss)
      if (isUp) return;

      const adjDate = parseFirestoreDate(adj.date || adj.created_at);
      const dateStr = getCambodiaDateString(adjDate);
      const prod = productMap.get(adj.product_id);
      const qty = Number(adj.quantity || 0);

      const unitCost =
        adj.unit_cost !== undefined && adj.unit_cost > 0
          ? Number(adj.unit_cost)
          : Number(adj.total_cost || 0) > 0 && qty > 0
          ? Number(adj.total_cost) / qty
          : prod?.cost || prod?.cost_recommand || (prod?.price ? prod.price * 0.7 : 0);

      const totalCostLoss =
        adj.total_cost !== undefined && adj.total_cost > 0
          ? Number(adj.total_cost)
          : unitCost * qty;

      const reasonStr = adj.reason || "Inventory Discrepancy";

      entries.push({
        id: `adj-${adj.id}`,
        type: "adjustment_loss",
        date: adjDate,
        dateStr,
        reference: adj.product_barcode ? `${adj.product_barcode}` : `ADJ-${adj.id.slice(0, 8)}`,
        title: `Inventory Write-off: ${prod?.name || adj.product_name || "Product"} (-${qty} units)`,
        subtitle: adj.note ? `Note: ${adj.note}` : `Reason: ${reasonStr}`,
        reason: reasonStr,
        discountLoss: 0,
        adjustmentCostLoss: totalCostLoss,
        totalLossAmount: totalCostLoss,
        staffName: adj.created_by_name || adj.created_by || "Admin",
        rawAdjustment: adj,
      });
    });

    return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [invoices, adjustments, productMap]);

  // Filtered Ledger Entries
  const filteredLedgerEntries = useMemo(() => {
    return rawLedgerEntries.filter((entry) => {
      // Type Filter
      if (lossTypeFilter !== "all" && entry.type !== lossTypeFilter) {
        return false;
      }

      // Reason Filter
      if (reasonFilter !== "all") {
        const r = entry.reason.toLowerCase();
        if (!r.includes(reasonFilter.toLowerCase())) return false;
      }

      // Staff Filter
      if (staffFilter !== "all" && entry.staffName !== staffFilter) {
        return false;
      }

      // Date Filter (Cambodia ICT Timezone)
      if (datePreset === "today") {
        if (!isTodayCambodia(entry.date)) return false;
      } else if (datePreset === "yesterday") {
        if (!isYesterdayCambodia(entry.date)) return false;
      } else if (datePreset === "this_month") {
        if (!isThisMonthCambodia(entry.date)) return false;
      } else if (datePreset === "this_week") {
        const todayCambodiaStr = getCambodiaDateString(new Date());
        const curr = new Date(todayCambodiaStr);
        const firstDayOfWeek = new Date(
          curr.setDate(curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1))
        );
        const firstDayStr = getCambodiaDateString(firstDayOfWeek);
        if (entry.dateStr < firstDayStr || entry.dateStr > todayCambodiaStr) return false;
      } else if (datePreset === "last_month") {
        const targetParts = getCambodiaDateParts(entry.date);
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
      } else if (datePreset === "this_quarter") {
        const targetParts = getCambodiaDateParts(entry.date);
        const currParts = getCambodiaDateParts(new Date());
        const currQ = Math.floor((Number(currParts.month) - 1) / 3);
        const targetQ = Math.floor((Number(targetParts.month) - 1) / 3);
        if (Number(targetParts.year) !== Number(currParts.year) || currQ !== targetQ) {
          return false;
        }
      } else if (datePreset === "this_year") {
        const targetParts = getCambodiaDateParts(entry.date);
        const currParts = getCambodiaDateParts(new Date());
        if (targetParts.year !== currParts.year) return false;
      } else if (datePreset === "custom") {
        if (customStartDate && entry.dateStr < customStartDate) return false;
        if (customEndDate && entry.dateStr > customEndDate) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchRef = entry.reference.toLowerCase().includes(q);
        const matchTitle = entry.title.toLowerCase().includes(q);
        const matchSub = entry.subtitle.toLowerCase().includes(q);
        const matchReason = entry.reason.toLowerCase().includes(q);
        const matchStaff = entry.staffName.toLowerCase().includes(q);

        if (!matchRef && !matchTitle && !matchSub && !matchReason && !matchStaff) return false;
      }

      return true;
    });
  }, [
    rawLedgerEntries,
    lossTypeFilter,
    reasonFilter,
    staffFilter,
    datePreset,
    customStartDate,
    customEndDate,
    searchQuery,
  ]);

  // Overall Financial P&L Statement calculations in selected period
  const statement = useMemo(() => {
    // 1. Sales Totals in selected period
    let grossSalesRevenueUsd = 0;
    let totalCogsUsd = 0;
    let totalSalesDiscountsUsd = 0;
    let salesCount = 0;
    let discountedSalesCount = 0;

    invoices.forEach((inv) => {
      if (inv.is_archived || inv.status === "not paid") return;
      const invDate = parseFirestoreDate(inv.created_at);
      const invDateStr = getCambodiaDateString(invDate);

      // Apply date interval
      if (datePreset === "today" && !isTodayCambodia(invDate)) return;
      if (datePreset === "yesterday" && !isYesterdayCambodia(invDate)) return;
      if (datePreset === "this_month" && !isThisMonthCambodia(invDate)) return;
      if (datePreset === "custom") {
        if (customStartDate && invDateStr < customStartDate) return;
        if (customEndDate && invDateStr > customEndDate) return;
      }

      salesCount++;
      const total = Number(inv.total_price || 0);
      const orderDisc = Number(inv.discount || 0);
      grossSalesRevenueUsd += total;

      let itemDiscounts = 0;
      inv.items?.forEach((it) => {
        const qty = Number(it.quantity || 0);
        totalCogsUsd += Number(it.cost || 0) * qty;
        itemDiscounts += Number(it.discount || 0) * qty;
      });

      const totalDisc = itemDiscounts + orderDisc;
      totalSalesDiscountsUsd += totalDisc;
      if (totalDisc > 0) discountedSalesCount++;
    });

    // 2. Adjustment Out Losses in selected period
    let totalAdjustmentOutLossUsd = 0;
    let damagedFoodLossUsd = 0;
    let samplePromoLossUsd = 0;
    let discrepancyLossUsd = 0;
    let otherLossUsd = 0;
    let adjustmentsCount = 0;

    adjustments.forEach((adj) => {
      const isUp = (adj.new_stock_level ?? 0) >= (adj.previous_stock_level ?? 0);
      if (isUp) return;

      const adjDate = parseFirestoreDate(adj.date || adj.created_at);
      const adjDateStr = getCambodiaDateString(adjDate);

      if (datePreset === "today" && !isTodayCambodia(adjDate)) return;
      if (datePreset === "yesterday" && !isYesterdayCambodia(adjDate)) return;
      if (datePreset === "this_month" && !isThisMonthCambodia(adjDate)) return;
      if (datePreset === "custom") {
        if (customStartDate && adjDateStr < customStartDate) return;
        if (customEndDate && adjDateStr > customEndDate) return;
      }

      adjustmentsCount++;
      const qty = Number(adj.quantity || 0);
      const prod = productMap.get(adj.product_id);
      const unitCost =
        adj.unit_cost !== undefined && adj.unit_cost > 0
          ? Number(adj.unit_cost)
          : Number(adj.total_cost || 0) > 0 && qty > 0
          ? Number(adj.total_cost) / qty
          : prod?.cost || prod?.cost_recommand || (prod?.price ? prod.price * 0.7 : 0);

      const loss =
        adj.total_cost !== undefined && adj.total_cost > 0 ? Number(adj.total_cost) : unitCost * qty;

      totalAdjustmentOutLossUsd += loss;

      const r = (adj.reason || "").toLowerCase();
      if (r.includes("damaged")) damagedFoodLossUsd += loss;
      else if (r.includes("sample") || r.includes("promo")) samplePromoLossUsd += loss;
      else if (r.includes("discrepancy")) discrepancyLossUsd += loss;
      else otherLossUsd += loss;
    });

    // Profit & Loss Math
    const grossProfitBeforeDiscounts = grossSalesRevenueUsd + totalSalesDiscountsUsd - totalCogsUsd;
    const netSalesProfit = grossSalesRevenueUsd - totalCogsUsd;
    const totalProfitLossUsd = totalSalesDiscountsUsd + totalAdjustmentOutLossUsd;
    const finalRealizedNetProfitUsd = netSalesProfit - totalAdjustmentOutLossUsd;
    const netProfitMarginPct = grossSalesRevenueUsd > 0 ? (finalRealizedNetProfitUsd / grossSalesRevenueUsd) * 100 : 0;

    return {
      grossSalesRevenueUsd,
      grossSalesRevenueKhr: Math.round(grossSalesRevenueUsd * exchangeRate),
      totalCogsUsd,
      grossProfitBeforeDiscounts,
      totalSalesDiscountsUsd,
      totalSalesDiscountsKhr: Math.round(totalSalesDiscountsUsd * exchangeRate),
      netSalesProfit,
      totalAdjustmentOutLossUsd,
      totalAdjustmentOutLossKhr: Math.round(totalAdjustmentOutLossUsd * exchangeRate),
      damagedFoodLossUsd,
      samplePromoLossUsd,
      discrepancyLossUsd,
      otherLossUsd,
      totalProfitLossUsd,
      totalProfitLossKhr: Math.round(totalProfitLossUsd * exchangeRate),
      finalRealizedNetProfitUsd,
      finalRealizedNetProfitKhr: Math.round(finalRealizedNetProfitUsd * exchangeRate),
      netProfitMarginPct,
      salesCount,
      discountedSalesCount,
      adjustmentsCount,
    };
  }, [invoices, adjustments, productMap, datePreset, customStartDate, customEndDate, exchangeRate]);

  // Chart Breakdown Data
  const lossDistributionChartData = useMemo(() => {
    return [
      { name: "Sale Discounts", value: Number(statement.totalSalesDiscountsUsd.toFixed(2)), color: "#f59e0b" },
      { name: "Damaged Food", value: Number(statement.damagedFoodLossUsd.toFixed(2)), color: "#e11d48" },
      { name: "Sample / Promo", value: Number(statement.samplePromoLossUsd.toFixed(2)), color: "#8b5cf6" },
      { name: "Count Discrepancy", value: Number(statement.discrepancyLossUsd.toFixed(2)), color: "#0ea5e9" },
      { name: "Other Write-off", value: Number(statement.otherLossUsd.toFixed(2)), color: "#64748b" },
    ].filter((d) => d.value > 0);
  }, [statement]);

  // Clipboard copy
  const handleCopy = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedId(val);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Excel (.xlsx) Export
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Executive Statement
    const statementRows = [
      ["HEALTHY FOOD POS - PROFIT & LOSS STATEMENT"],
      [`Generated Date: ${formatCambodiaDate(new Date(), "invoice")} (ICT / Cambodia)`],
      [`Period Filter: ${datePreset.toUpperCase()}${datePreset === "custom" ? ` (${customStartDate} to ${customEndDate})` : ""}`],
      [],
      ["FINANCIAL LINE ITEM", "AMOUNT (USD)", "AMOUNT (KHR)"],
      ["Gross Sales Revenue", statement.grossSalesRevenueUsd, statement.grossSalesRevenueKhr],
      ["Less: Cost of Goods Sold (COGS)", statement.totalCogsUsd, Math.round(statement.totalCogsUsd * exchangeRate)],
      ["Gross Profit (Before Discounts)", statement.grossProfitBeforeDiscounts, Math.round(statement.grossProfitBeforeDiscounts * exchangeRate)],
      [],
      ["LESS: PROFIT LOSS EXPENSES & DEDUCTIONS", "", ""],
      ["1. Sales Discounts Given (Loss)", statement.totalSalesDiscountsUsd, statement.totalSalesDiscountsKhr],
      ["2. Inventory Write-offs (Adjustment Out Loss)", statement.totalAdjustmentOutLossUsd, statement.totalAdjustmentOutLossKhr],
      ["   - Damaged Food Spoilage", statement.damagedFoodLossUsd, Math.round(statement.damagedFoodLossUsd * exchangeRate)],
      ["   - Sample / Promo Giveaways", statement.samplePromoLossUsd, Math.round(statement.samplePromoLossUsd * exchangeRate)],
      ["   - Inventory Discrepancy / Shrinkage", statement.discrepancyLossUsd, Math.round(statement.discrepancyLossUsd * exchangeRate)],
      ["   - Other Inventory Losses", statement.otherLossUsd, Math.round(statement.otherLossUsd * exchangeRate)],
      [],
      ["TOTAL PROFIT LOSS SURRENDERED", statement.totalProfitLossUsd, statement.totalProfitLossKhr],
      ["FINAL REALIZED NET PROFIT", statement.finalRealizedNetProfitUsd, statement.finalRealizedNetProfitKhr],
      ["NET PROFIT MARGIN (%)", `${statement.netProfitMarginPct.toFixed(1)}%`, "-"],
    ];
    const wsStatement = XLSX.utils.aoa_to_sheet(statementRows);
    XLSX.utils.book_append_sheet(wb, wsStatement, "P&L Statement");

    // Sheet 2: Loss Records Ledger
    const ledgerHeaders = [
      "#",
      "Date & Time (ICT)",
      "Loss Type",
      "Reference",
      "Title / Product / Invoice",
      "Reason",
      "Loss Amount ($)",
      "Loss Amount (KHR)",
      "Staff / Cashier",
    ];

    const ledgerRows = filteredLedgerEntries.map((e, idx) => [
      idx + 1,
      formatCambodiaDate(e.date, "invoice"),
      e.type === "sale_discount" ? "Sale Discount Loss" : "Stock Adjustment Out Loss",
      e.reference,
      e.title,
      e.reason,
      Number(e.totalLossAmount.toFixed(2)),
      Math.round(e.totalLossAmount * exchangeRate),
      e.staffName,
    ]);

    const wsLedger = XLSX.utils.aoa_to_sheet([ledgerHeaders, ...ledgerRows]);
    XLSX.utils.book_append_sheet(wb, wsLedger, "Loss Ledger");

    XLSX.writeFile(wb, `HealthyFood_Profit_Loss_${formatCambodiaDate(new Date(), "code")}.xlsx`);
  };

  // PDF Export
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(225, 29, 72); // rose-600
    doc.rect(0, 0, pageWidth, 18, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`${settings.store_name || "HEALTHY FOOD POS"} - PROFIT & LOSS REPORT`, 14, 11.5);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${formatCambodiaDate(new Date(), "invoice")} (ICT)`, pageWidth - 14, 11.5, {
      align: "right",
    });

    const head = [
      [
        "#",
        "Date & Time (ICT)",
        "Type",
        "Reference",
        "Description",
        "Reason",
        "Loss ($)",
        "Loss (KHR)",
        "Staff",
      ],
    ];

    const body = filteredLedgerEntries.map((e, idx) => [
      idx + 1,
      formatCambodiaDate(e.date, "invoice"),
      e.type === "sale_discount" ? "Sale Discount" : "Adjustment Out",
      e.reference,
      e.title.slice(0, 32),
      e.reason,
      `$${e.totalLossAmount.toFixed(2)}`,
      `${Math.round(e.totalLossAmount * exchangeRate).toLocaleString()} R`,
      e.staffName,
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 24,
      theme: "striped",
      headStyles: { fillColor: [225, 29, 72], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [255, 241, 242] },
      margin: { left: 14, right: 14 },
    });

    doc.save(`HealthyFood_Profit_Loss_${formatCambodiaDate(new Date(), "code")}.pdf`);
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* ─── Page Header & Action Controls ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent p-5 rounded-2xl border border-rose-500/15">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-rose-700 bg-rose-500/15 px-2 py-0.5 rounded-md">
              Financial Audit & Loss Tracking
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
              <Calendar03Icon className="size-3 text-emerald-600" />
              Cambodia Timezone (ICT UTC+7)
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground mt-1">
            Profit & Loss Report
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Audit margin shrinkage from customer sale discounts and stock adjustment write-offs (damaged food, samples, discrepancies).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
            onClick={handleExportPDF}
            className="font-semibold gap-1.5 bg-background shadow-sm"
          >
            <File02Icon className="size-4 text-rose-600" />
            Export PDF
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={loadData}
            disabled={loading}
            className="font-semibold gap-1.5"
          >
            <Loading01Icon className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ─── Top 4 KPI Metric Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Realized Net Profit */}
        <Card className="border-emerald-500/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Realized Net Profit</span>
              <Dollar01Icon className="size-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-600 tabular-nums">
              ${statement.finalRealizedNetProfitUsd.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span>{statement.finalRealizedNetProfitKhr.toLocaleString()} ៛ (KHR)</span>
            <Badge variant="outline" className="text-[10px] font-bold bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
              {statement.netProfitMarginPct.toFixed(1)}% Margin
            </Badge>
          </CardContent>
        </Card>

        {/* Total Profit Loss */}
        <Card className="border-rose-500/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Total Profit Loss</span>
              <ArrowDown01Icon className="size-4 text-rose-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-rose-600 tabular-nums">
              -${statement.totalProfitLossUsd.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span>-{statement.totalProfitLossKhr.toLocaleString()} ៛ (KHR)</span>
            <span className="text-[11px] text-muted-foreground font-bold">{filteredLedgerEntries.length} loss events</span>
          </CardContent>
        </Card>

        {/* Sale Discounts Loss */}
        <Card className="border-amber-500/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Sale Discounts Given</span>
              <ShoppingCart01Icon className="size-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-amber-600 tabular-nums">
              -${statement.totalSalesDiscountsUsd.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span>-{statement.totalSalesDiscountsKhr.toLocaleString()} ៛</span>
            <Badge variant="secondary" className="text-[10px] font-bold">
              {statement.discountedSalesCount} sales discounted
            </Badge>
          </CardContent>
        </Card>

        {/* Adjustment Out Loss */}
        <Card className="border-rose-500/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Inventory Write-offs</span>
              <Settings01Icon className="size-4 text-purple-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-purple-600 tabular-nums">
              -${statement.totalAdjustmentOutLossUsd.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span>-{statement.totalAdjustmentOutLossKhr.toLocaleString()} ៛</span>
            <span className="text-[11px] text-muted-foreground font-bold">{statement.adjustmentsCount} write-off ops</span>
          </CardContent>
        </Card>
      </div>

      {/* ─── P&L Executive Statement Box (Financial Flow) ─── */}
      <Card className="border-primary/20 shadow-sm bg-gradient-to-r from-card via-card to-primary/5">
        <CardHeader className="pb-3 bg-muted/20 border-b">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Layers01Icon className="size-4 text-primary" />
            Profit & Loss Financial Equation (P&L Breakdown)
          </CardTitle>
          <CardDescription className="text-xs">
            How net profits are derived after deducting customer sales discounts and stock adjustments.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-center text-xs">
            {/* 1. Gross Revenue */}
            <div className="p-3 bg-background rounded-xl border space-y-1">
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">1. Gross Revenue</span>
              <span className="font-black text-base text-foreground tabular-nums">${statement.grossSalesRevenueUsd.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground block">{statement.salesCount} paid sales</span>
            </div>

            {/* 2. Less COGS */}
            <div className="p-3 bg-background rounded-xl border space-y-1">
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">2. Less COGS</span>
              <span className="font-black text-base text-muted-foreground tabular-nums">-${statement.totalCogsUsd.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground block">inventory product cost</span>
            </div>

            {/* 3. Less Sale Discounts */}
            <div className="p-3 bg-amber-50/50 border-amber-200 rounded-xl border space-y-1">
              <span className="text-amber-800 block text-[10px] uppercase font-bold">3. Less Sale Discounts</span>
              <span className="font-black text-base text-amber-600 tabular-nums">-${statement.totalSalesDiscountsUsd.toFixed(2)}</span>
              <span className="text-[10px] text-amber-700 block">customer promos given</span>
            </div>

            {/* 4. Less Inventory Write-offs */}
            <div className="p-3 bg-rose-50/50 border-rose-200 rounded-xl border space-y-1">
              <span className="text-rose-800 block text-[10px] uppercase font-bold">4. Less Write-offs</span>
              <span className="font-black text-base text-rose-600 tabular-nums">-${statement.totalAdjustmentOutLossUsd.toFixed(2)}</span>
              <span className="text-[10px] text-rose-700 block">damaged, samples, etc.</span>
            </div>

            {/* 5. Final Net Realized Profit */}
            <div className="p-3 bg-emerald-50 border-emerald-300 rounded-xl border space-y-1 shadow-2xs">
              <span className="text-emerald-800 block text-[10px] uppercase font-bold">5. Realized Net Profit</span>
              <span className="font-black text-lg text-emerald-700 tabular-nums">${statement.finalRealizedNetProfitUsd.toFixed(2)}</span>
              <span className="text-[10px] text-emerald-700 font-bold block">{statement.netProfitMarginPct.toFixed(1)}% margin</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Filters & Search Toolbar ─── */}
      <Card className="border-muted shadow-sm">
        <CardContent className="p-4 space-y-3">
          {/* Preset Buttons */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-bold text-muted-foreground uppercase text-[10px] tracking-wider mr-1">
              Time Period:
            </span>
            {[
              { id: "today", label: "Today (ICT)" },
              { id: "yesterday", label: "Yesterday" },
              { id: "this_week", label: "This Week" },
              { id: "this_month", label: "This Month" },
              { id: "last_month", label: "Last Month" },
              { id: "this_quarter", label: "This Quarter" },
              { id: "this_year", label: "This Year" },
              { id: "all", label: "All Time" },
              { id: "custom", label: "Custom" },
            ].map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={datePreset === p.id ? "default" : "outline"}
                onClick={() => setDatePreset(p.id as DateFilterPreset)}
                className={`h-8 text-xs font-semibold ${
                  datePreset === p.id ? "bg-rose-600 hover:bg-rose-700 text-white" : ""
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

          {/* Dropdown Filters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <div className="relative">
              <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search invoice, product, reason, staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs bg-background"
              />
            </div>

            <Select value={lossTypeFilter} onValueChange={setLossTypeFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Loss Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Loss Types</SelectItem>
                <SelectItem value="sale_discount">🏷️ Sale Discounts Given</SelectItem>
                <SelectItem value="adjustment_loss">📦 Stock Adjustment Write-offs</SelectItem>
              </SelectContent>
            </Select>

            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Reasons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reasons</SelectItem>
                <SelectItem value="sale discount">Sale Discount</SelectItem>
                <SelectItem value="damaged">Damaged Food</SelectItem>
                <SelectItem value="sample">Sample / Promo</SelectItem>
                <SelectItem value="discrepancy">Count Discrepancy</SelectItem>
              </SelectContent>
            </Select>

            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Staff / Cashiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff / Cashiers</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.name}>
                    👤 {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ─── Multi-Tab Data Tables ─── */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as TabView)} className="space-y-4">
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 w-full sm:w-auto h-auto p-1 bg-muted/60">
          <TabsTrigger value="all_records" className="text-xs font-bold py-2 gap-1.5">
            <Layers01Icon className="size-3.5" />
            All Profit Loss Events ({filteredLedgerEntries.length})
          </TabsTrigger>
          <TabsTrigger value="sale_discounts" className="text-xs font-bold py-2 gap-1.5">
            <ShoppingCart01Icon className="size-3.5" />
            Sale Discounts ({filteredLedgerEntries.filter((e) => e.type === "sale_discount").length})
          </TabsTrigger>
          <TabsTrigger value="adjustment_losses" className="text-xs font-bold py-2 gap-1.5">
            <Settings01Icon className="size-3.5" />
            Stock Write-offs ({filteredLedgerEntries.filter((e) => e.type === "adjustment_loss").length})
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: All Profit Loss Ledger ─── */}
        <TabsContent value="all_records" className="m-0">
          <Card className="border-muted shadow-sm">
            <CardHeader className="pb-3 bg-muted/20 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <ArrowDown01Icon className="size-4 text-rose-600" />
                  Consolidated Profit & Loss Records Ledger
                </CardTitle>
                <CardDescription className="text-xs">
                  Showing {filteredLedgerEntries.length} records • Total Loss: ${statement.totalProfitLossUsd.toFixed(2)} ({statement.totalProfitLossKhr.toLocaleString()} ៛)
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30 text-muted-foreground font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4 text-left">Date (ICT)</th>
                      <th className="py-3 px-4 text-left">Loss Category</th>
                      <th className="py-3 px-4 text-left">Reference / Source</th>
                      <th className="py-3 px-4 text-left">Description</th>
                      <th className="py-3 px-4 text-left">Reason</th>
                      <th className="py-3 px-4 text-right">Profit Loss Amount</th>
                      <th className="py-3 px-4 text-left">Staff / Cashier</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredLedgerEntries.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-muted-foreground">
                          No profit loss events recorded in the selected period.
                        </td>
                      </tr>
                    ) : (
                      filteredLedgerEntries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-muted/40 transition-colors">
                          {/* Date */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-bold text-foreground">
                              {formatCambodiaDate(entry.date, "date")}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {formatCambodiaDate(entry.date, "time")} ICT
                            </div>
                          </td>

                          {/* Category Badge */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold ${
                                entry.type === "sale_discount"
                                  ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
                                  : "bg-rose-500/10 text-rose-700 border-rose-500/20"
                              }`}
                            >
                              {entry.type === "sale_discount" ? "🏷️ Sale Discount" : "📦 Adjustment Out"}
                            </Badge>
                          </td>

                          {/* Reference */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1 font-mono font-bold text-foreground">
                              <span>{entry.reference}</span>
                              <button
                                onClick={() => handleCopy(entry.reference)}
                                className="text-muted-foreground hover:text-foreground"
                                title="Copy reference"
                              >
                                <Copy01Icon className="size-3" />
                              </button>
                            </div>
                          </td>

                          {/* Description */}
                          <td className="py-3 px-4 max-w-[220px]">
                            <div className="font-bold text-foreground truncate">{entry.title}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{entry.subtitle}</div>
                          </td>

                          {/* Reason */}
                          <td className="py-3 px-4 whitespace-nowrap font-medium text-foreground">
                            {entry.reason}
                          </td>

                          {/* Loss Amount */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="font-black text-sm text-rose-600 tabular-nums">
                              -${entry.totalLossAmount.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-muted-foreground tabular-nums">
                              -{Math.round(entry.totalLossAmount * exchangeRate).toLocaleString()} ៛
                            </div>
                          </td>

                          {/* Staff */}
                          <td className="py-3 px-4 whitespace-nowrap text-muted-foreground font-medium">
                            {entry.staffName}
                          </td>

                          {/* Action */}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {entry.rawInvoice ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setReceiptInvoice(entry.rawInvoice!);
                                  setReceiptModalOpen(true);
                                }}
                                className="h-7 text-xs text-amber-700 font-semibold gap-1"
                              >
                                <PrinterIcon className="size-3.5" />
                                Receipt
                              </Button>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                Auto-logged
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredLedgerEntries.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 bg-muted/40 font-black text-foreground">
                        <td colSpan={5} className="py-3 px-4">
                          TOTAL PROFIT LOSS ({filteredLedgerEntries.length} Records)
                        </td>
                        <td className="py-3 px-4 text-right text-rose-600 text-sm">
                          -${statement.totalProfitLossUsd.toFixed(2)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 2: Sale Discounts Only ─── */}
        <TabsContent value="sale_discounts" className="m-0">
          <Card className="border-muted shadow-sm">
            <CardHeader className="pb-3 bg-muted/20 border-b">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <ShoppingCart01Icon className="size-4 text-amber-600" />
                Customer Sale Discounts Given (Margin Loss)
              </CardTitle>
              <CardDescription className="text-xs">
                Comparing original baseline profit vs discounted realized profit per transaction.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30 text-muted-foreground font-bold uppercase text-[10px]">
                      <th className="py-3 px-4 text-left">Date (ICT)</th>
                      <th className="py-3 px-4 text-left">Invoice No</th>
                      <th className="py-3 px-4 text-left">Customer</th>
                      <th className="py-3 px-4 text-right">Original Profit ($)</th>
                      <th className="py-3 px-4 text-right">Discount Given (Loss $)</th>
                      <th className="py-3 px-4 text-right">Realized Profit ($)</th>
                      <th className="py-3 px-4 text-left">Cashier</th>
                      <th className="py-3 px-4 text-center">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredLedgerEntries
                      .filter((e) => e.type === "sale_discount")
                      .map((e) => (
                        <tr key={e.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-bold text-foreground">{formatCambodiaDate(e.date, "date")}</span>
                            <span className="block text-[10px] text-muted-foreground">{formatCambodiaDate(e.date, "time")}</span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-amber-800">{e.reference}</td>
                          <td className="py-3 px-4 font-bold text-foreground">{e.rawInvoice?.customer_name || "Customer"}</td>
                          <td className="py-3 px-4 text-right font-medium text-muted-foreground">
                            ${e.grossProfitBeforeDiscount?.toFixed(2) || "0.00"}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-rose-600">
                            -${e.discountLoss.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-emerald-700">
                            ${e.realizedNetProfit?.toFixed(2) || "0.00"}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground font-medium">{e.staffName}</td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setReceiptInvoice(e.rawInvoice!);
                                setReceiptModalOpen(true);
                              }}
                              className="h-7 text-xs text-amber-700 font-semibold gap-1"
                            >
                              <PrinterIcon className="size-3.5" />
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 3: Stock Adjustment Out Losses ─── */}
        <TabsContent value="adjustment_losses" className="m-0">
          <Card className="border-muted shadow-sm">
            <CardHeader className="pb-3 bg-muted/20 border-b">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Settings01Icon className="size-4 text-rose-600" />
                Inventory Write-off Losses (Adjustment Out)
              </CardTitle>
              <CardDescription className="text-xs">
                Cost of goods written off for damaged food, spoilage, giveaways, or count shrinkage.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30 text-muted-foreground font-bold uppercase text-[10px]">
                      <th className="py-3 px-4 text-left">Date (ICT)</th>
                      <th className="py-3 px-4 text-left">Product Item</th>
                      <th className="py-3 px-4 text-left">Reason</th>
                      <th className="py-3 px-4 text-center">Units Deducted</th>
                      <th className="py-3 px-4 text-right">Cost Loss ($)</th>
                      <th className="py-3 px-4 text-right">Cost Loss (KHR)</th>
                      <th className="py-3 px-4 text-left">Staff / Cashier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredLedgerEntries
                      .filter((e) => e.type === "adjustment_loss")
                      .map((e) => (
                        <tr key={e.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-bold text-foreground">{formatCambodiaDate(e.date, "date")}</span>
                            <span className="block text-[10px] text-muted-foreground">{formatCambodiaDate(e.date, "time")}</span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-foreground">{e.title}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{e.reference}</div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="text-[10px] font-bold bg-rose-50 text-rose-700 border-rose-200">
                              {e.reason}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-rose-600">
                            -{e.rawAdjustment?.quantity || 1}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-rose-600">
                            -${e.adjustmentCostLoss.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-muted-foreground tabular-nums">
                            -{Math.round(e.adjustmentCostLoss * exchangeRate).toLocaleString()} ៛
                          </td>
                          <td className="py-3 px-4 text-muted-foreground font-medium">{e.staffName}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* POS Receipt Modal */}
      <ReceiptModal
        invoice={receiptInvoice}
        open={receiptModalOpen}
        onOpenChange={setReceiptModalOpen}
      />
    </div>
  );
}
