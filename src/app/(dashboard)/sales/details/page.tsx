"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { getSaleInvoices } from "@/lib/firebase/sale-actions";
import { getProducts, getCategories, getUsers } from "@/lib/firebase/actions";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import { SaleInvoice, Product, Category, User, StoreSettings } from "@/types";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Package01Icon,
  Dollar01Icon,
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
  EyeIcon,
  Copy01Icon,
  InformationCircleIcon,
  GridViewIcon,
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

interface DetailedSaleItem {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  date: Date;
  dateStr: string;
  customerName: string;
  customerPhone: string;
  customerType: string;
  cashierName: string;
  paymentMethod: string;
  productId: string;
  productName: string;
  productBarcode: string;
  productImage?: string;
  categoryId?: string;
  categoryName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  unitDiscount: number;
  totalPrice: number;
  totalCost: number;
  profit: number;
  margin: number;
  rawInvoice: SaleInvoice;
}

export default function SaleDetailPage() {
  const { user, role } = useAuth();
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("this_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [cashierFilter, setCashierFilter] = useState("all");

  // Receipt Modal
  const [receiptInvoice, setReceiptInvoice] = useState<SaleInvoice | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [invs, prods, cats, usrs, storeConfig] = await Promise.all([
        getSaleInvoices(),
        getProducts(),
        getCategories(),
        getUsers(),
        getStoreSettings(),
      ]);
      setInvoices(invs);
      setProducts(prods);
      setCategories(cats);
      setUsers(usrs);
      setSettings(storeConfig);
    } catch (error) {
      console.error("Failed to load sale details data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const exchangeRate = settings.exchange_rate_khr || 4100;

  // Category mapping
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  // Product category mapping
  const productCategoryMap = useMemo(() => {
    const map = new Map<string, { categoryId?: string; categoryName: string }>();
    products.forEach((p) => {
      const catName = p.category_id ? categoryMap.get(p.category_id) || "General" : "General";
      map.set(p.id, { categoryId: p.category_id, categoryName: catName });
    });
    return map;
  }, [products, categoryMap]);

  // Flattened itemized sale line records
  const allSaleItems = useMemo(() => {
    const list: DetailedSaleItem[] = [];

    invoices.forEach((inv) => {
      if (inv.is_archived || inv.status === "not paid") return;

      const invDate = parseFirestoreDate(inv.created_at);
      const dateStr = getCambodiaDateString(invDate);

      inv.items?.forEach((item, itemIdx) => {
        const qty = Number(item.quantity || 0);
        const unitCost = Number(item.cost || 0);
        const unitPrice = Number(item.price || 0);
        const unitDisc = Number(item.discount || 0);
        const lineTotal = Number(item.total_price || 0);
        const lineCost = unitCost * qty;
        const profit = lineTotal - lineCost;
        const margin = lineTotal > 0 ? (profit / lineTotal) * 100 : 0;

        const prodCatInfo = productCategoryMap.get(item.product_id) || { categoryName: "General" };

        list.push({
          id: `${inv.id}-${itemIdx}`,
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number || inv.id,
          date: invDate,
          dateStr,
          customerName: inv.customer_name || (inv.customer_type === "online" ? "Online Customer" : "Walk-in Customer"),
          customerPhone: inv.customer_phone || "",
          customerType: inv.customer_type || "walk_in",
          cashierName: inv.created_by_name || "Admin",
          paymentMethod: inv.payment_method || "cash",
          productId: item.product_id,
          productName: item.product_name,
          productBarcode: item.product_barcode || "-",
          productImage: item.product_image,
          categoryId: prodCatInfo.categoryId,
          categoryName: prodCatInfo.categoryName,
          quantity: qty,
          unitPrice,
          unitCost,
          unitDiscount: unitDisc,
          totalPrice: lineTotal,
          totalCost: lineCost,
          profit,
          margin,
          rawInvoice: inv,
        });
      });
    });

    return list;
  }, [invoices, productCategoryMap]);

  // Filtered detailed items
  const filteredItems = useMemo(() => {
    return allSaleItems.filter((item) => {
      // Category Filter
      if (categoryFilter !== "all" && item.categoryId !== categoryFilter) {
        return false;
      }

      // Payment Filter
      if (paymentMethodFilter !== "all" && item.paymentMethod !== paymentMethodFilter) {
        return false;
      }

      // Cashier Filter
      if (cashierFilter !== "all" && item.cashierName !== cashierFilter && item.rawInvoice.created_by !== cashierFilter) {
        return false;
      }

      // Channel Filter
      if (channelFilter !== "all") {
        const ct = item.customerType.toLowerCase();
        if (channelFilter === "walk_in") {
          if (ct !== "walk_in") return false;
        } else if (channelFilter === "online") {
          if (ct === "walk_in") return false;
        } else {
          if (!ct.includes(channelFilter.toLowerCase())) return false;
        }
      }

      // Date Presets Filter (strictly in Cambodia ICT UTC+7)
      if (datePreset === "today") {
        if (!isTodayCambodia(item.date)) return false;
      } else if (datePreset === "yesterday") {
        if (!isYesterdayCambodia(item.date)) return false;
      } else if (datePreset === "this_month") {
        if (!isThisMonthCambodia(item.date)) return false;
      } else if (datePreset === "this_week") {
        const todayCambodiaStr = getCambodiaDateString(new Date());
        const curr = new Date(todayCambodiaStr);
        const firstDayOfWeek = new Date(
          curr.setDate(curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1))
        );
        const firstDayStr = getCambodiaDateString(firstDayOfWeek);
        if (item.dateStr < firstDayStr || item.dateStr > todayCambodiaStr) return false;
      } else if (datePreset === "last_month") {
        const targetParts = getCambodiaDateParts(item.date);
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
        const targetParts = getCambodiaDateParts(item.date);
        const currParts = getCambodiaDateParts(new Date());
        const currQ = Math.floor((Number(currParts.month) - 1) / 3);
        const targetQ = Math.floor((Number(targetParts.month) - 1) / 3);
        if (Number(targetParts.year) !== Number(currParts.year) || currQ !== targetQ) {
          return false;
        }
      } else if (datePreset === "this_year") {
        const targetParts = getCambodiaDateParts(item.date);
        const currParts = getCambodiaDateParts(new Date());
        if (targetParts.year !== currParts.year) return false;
      } else if (datePreset === "custom") {
        if (customStartDate && item.dateStr < customStartDate) return false;
        if (customEndDate && item.dateStr > customEndDate) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchInv = item.invoiceNumber.toLowerCase().includes(q);
        const matchCustomer = item.customerName.toLowerCase().includes(q);
        const matchPhone = item.customerPhone.toLowerCase().includes(q);
        const matchProd = item.productName.toLowerCase().includes(q);
        const matchBar = item.productBarcode.toLowerCase().includes(q);
        const matchCashier = item.cashierName.toLowerCase().includes(q);
        const matchCat = item.categoryName.toLowerCase().includes(q);

        if (!matchInv && !matchCustomer && !matchPhone && !matchProd && !matchBar && !matchCashier && !matchCat) {
          return false;
        }
      }

      return true;
    });
  }, [
    allSaleItems,
    categoryFilter,
    paymentMethodFilter,
    cashierFilter,
    channelFilter,
    datePreset,
    customStartDate,
    customEndDate,
    searchQuery,
  ]);

  // Overall Financial KPIs for filtered item rows
  const kpi = useMemo(() => {
    let totalRevenueUsd = 0;
    let totalCostUsd = 0;
    let totalUnits = 0;
    let totalDiscounts = 0;
    const uniqueInvoices = new Set<string>();

    filteredItems.forEach((item) => {
      totalRevenueUsd += item.totalPrice;
      totalCostUsd += item.totalCost;
      totalUnits += item.quantity;
      totalDiscounts += item.unitDiscount * item.quantity;
      uniqueInvoices.add(item.invoiceId);
    });

    const grossProfitUsd = totalRevenueUsd - totalCostUsd;
    const marginPct = totalRevenueUsd > 0 ? (grossProfitUsd / totalRevenueUsd) * 100 : 0;

    return {
      totalRevenueUsd,
      totalRevenueKhr: Math.round(totalRevenueUsd * exchangeRate),
      totalCostUsd,
      grossProfitUsd,
      marginPct,
      totalUnits,
      totalDiscounts,
      invoicesCount: uniqueInvoices.size,
      itemsRowCount: filteredItems.length,
    };
  }, [filteredItems, exchangeRate]);

  // Clipboard copy
  const handleCopy = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedId(val);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Excel (.xlsx) Export
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    const headers = [
      "#",
      "Date & Time (ICT)",
      "Invoice No",
      "Customer",
      "Phone",
      "Channel",
      "Cashier",
      "Product Name",
      "Barcode",
      "Category",
      "Quantity",
      "Unit Price ($)",
      "Unit Cost ($)",
      "Unit Discount ($)",
      "Line Total ($)",
      "Line Total (KHR)",
      "Line Cost ($)",
      "Gross Profit ($)",
      "Margin (%)",
      "Payment Method",
    ];

    const rows = filteredItems.map((it, idx) => [
      idx + 1,
      formatCambodiaDate(it.date, "invoice"),
      it.invoiceNumber,
      it.customerName,
      it.customerPhone || "-",
      it.customerType || "Walk-in",
      it.cashierName,
      it.productName,
      it.productBarcode,
      it.categoryName,
      it.quantity,
      Number(it.unitPrice.toFixed(2)),
      Number(it.unitCost.toFixed(2)),
      Number(it.unitDiscount.toFixed(2)),
      Number(it.totalPrice.toFixed(2)),
      Math.round(it.totalPrice * exchangeRate),
      Number(it.totalCost.toFixed(2)),
      Number(it.profit.toFixed(2)),
      `${it.margin.toFixed(1)}%`,
      it.paymentMethod.toUpperCase(),
    ]);

    // Total Row
    rows.push([
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      kpi.totalUnits,
      "",
      "",
      "",
      Number(kpi.totalRevenueUsd.toFixed(2)),
      kpi.totalRevenueKhr,
      Number(kpi.totalCostUsd.toFixed(2)),
      Number(kpi.grossProfitUsd.toFixed(2)),
      `${kpi.marginPct.toFixed(1)}%`,
      "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, "Sale Details");
    XLSX.writeFile(wb, `HealthyFood_Sale_Detail_${formatCambodiaDate(new Date(), "code")}.xlsx`);
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = [
      "Date (ICT)",
      "Invoice No",
      "Customer",
      "Phone",
      "Channel",
      "Cashier",
      "Product",
      "Barcode",
      "Category",
      "Quantity",
      "Unit Price ($)",
      "Line Total ($)",
      "Line Total (KHR)",
      "Cost ($)",
      "Profit ($)",
      "Margin (%)",
      "Payment",
    ];

    const rows = filteredItems.map((it) => [
      `"${formatCambodiaDate(it.date, "invoice")}"`,
      `"${it.invoiceNumber}"`,
      `"${it.customerName.replace(/"/g, '""')}"`,
      `"${it.customerPhone || ""}"`,
      `"${it.customerType || "Walk-in"}"`,
      `"${it.cashierName.replace(/"/g, '""')}"`,
      `"${it.productName.replace(/"/g, '""')}"`,
      `"${it.productBarcode}"`,
      `"${it.categoryName.replace(/"/g, '""')}"`,
      it.quantity,
      it.unitPrice.toFixed(2),
      it.totalPrice.toFixed(2),
      Math.round(it.totalPrice * exchangeRate),
      it.totalCost.toFixed(2),
      it.profit.toFixed(2),
      `${it.margin.toFixed(1)}%`,
      `"${it.paymentMethod.toUpperCase()}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `HealthyFood_Sale_Detail_${formatCambodiaDate(new Date(), "code")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF Export
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(5, 150, 105);
    doc.rect(0, 0, pageWidth, 18, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`${settings.store_name || "HEALTHY FOOD POS"} - SALE DETAIL REPORT`, 14, 11.5);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${formatCambodiaDate(new Date(), "invoice")} (ICT)`, pageWidth - 14, 11.5, {
      align: "right",
    });

    const head = [
      [
        "#",
        "Date & Time",
        "Invoice",
        "Customer",
        "Product",
        "Category",
        "Qty",
        "Unit Price",
        "Total ($)",
        "Profit ($)",
        "Margin",
        "Payment",
      ],
    ];

    const body = filteredItems.map((it, idx) => [
      idx + 1,
      formatCambodiaDate(it.date, "invoice"),
      it.invoiceNumber.slice(0, 14),
      it.customerName.slice(0, 16),
      it.productName.slice(0, 22),
      it.categoryName,
      it.quantity,
      `$${it.unitPrice.toFixed(2)}`,
      `$${it.totalPrice.toFixed(2)}`,
      `$${it.profit.toFixed(2)}`,
      `${it.margin.toFixed(1)}%`,
      it.paymentMethod.toUpperCase(),
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 24,
      theme: "striped",
      headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });

    doc.save(`HealthyFood_Sale_Detail_${formatCambodiaDate(new Date(), "code")}.pdf`);
  };

  const channelBadgeInfo = (type?: string) => {
    const t = (type || "").toLowerCase();
    if (!type || t === "walk_in") {
      return { label: "Walk-in", color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" };
    }
    if (t.includes("grab")) {
      return { label: "GrabFood", color: "bg-green-500/10 text-green-700 border-green-500/20" };
    }
    if (t.includes("telegram")) {
      return { label: "Telegram", color: "bg-sky-500/10 text-sky-700 border-sky-500/20" };
    }
    if (t.includes("nham24")) {
      return { label: "NHAM24", color: "bg-amber-500/10 text-amber-700 border-amber-500/20" };
    }
    if (t.includes("foodpanda")) {
      return { label: "FoodPanda", color: "bg-pink-500/10 text-pink-700 border-pink-500/20" };
    }
    return { label: type, color: "bg-blue-500/10 text-blue-700 border-blue-500/20" };
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* ─── Header & Actions ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-5 rounded-2xl border border-emerald-500/15">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-500/15 px-2 py-0.5 rounded-md">
              Itemized Line Register
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
              <Calendar03Icon className="size-3 text-emerald-600" />
              Cambodia ICT (UTC+7)
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground mt-1">
            Sale Detail Report
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Granular line-by-line breakdown of every product sold, individual profit margins, customer channels, and timestamps.
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
            onClick={loadData}
            disabled={loading}
            className="font-semibold gap-1.5"
          >
            <Loading01Icon className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ─── Top Metric Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Item Sales */}
        <Card className="border-emerald-500/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Total Item Revenue</span>
              <Dollar01Icon className="size-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-600 tabular-nums">
              ${kpi.totalRevenueUsd.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span>{kpi.totalRevenueKhr.toLocaleString()} ៛ (KHR)</span>
            <Badge variant="secondary" className="text-[10px] font-bold">
              {kpi.invoicesCount} Invoices
            </Badge>
          </CardContent>
        </Card>

        {/* Item Gross Profit */}
        <Card className="border-emerald-500/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Item Gross Profit</span>
              <ChartIncreaseIcon className="size-4 text-blue-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-blue-600 tabular-nums">
              ${kpi.grossProfitUsd.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span className="text-emerald-700 font-bold">{kpi.marginPct.toFixed(1)}% Margin</span>
            <span className="text-[11px] text-muted-foreground">Cost: ${kpi.totalCostUsd.toFixed(2)}</span>
          </CardContent>
        </Card>

        {/* Total Units Sold */}
        <Card className="border-emerald-500/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Total Units Sold</span>
              <Package01Icon className="size-4 text-purple-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-purple-600 tabular-nums">
              {kpi.totalUnits} Units
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0">
            Across {kpi.itemsRowCount} sale line item records
          </CardContent>
        </Card>

        {/* Total Discounts Given */}
        <Card className="border-emerald-500/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Discounts Applied</span>
              <MoneyReceiveSquareIcon className="size-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-amber-600 tabular-nums">
              ${kpi.totalDiscounts.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0">
            {Math.round(kpi.totalDiscounts * exchangeRate).toLocaleString()} ៛ savings given
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
                  datePreset === p.id ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                }`}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* Custom Date Inputs if Custom is selected */}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
            <div className="relative lg:col-span-1">
              <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search product, barcode, invoice..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs bg-background"
              />
            </div>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    🏷️ {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Channel Filter */}
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Order Channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="walk_in">🚶 Walk-in Store</SelectItem>
                <SelectItem value="online">🛵 All Online / Delivery</SelectItem>
                <SelectItem value="grab">🛵 GrabFood</SelectItem>
                <SelectItem value="nham24">🍲 NHAM24</SelectItem>
                <SelectItem value="telegram">📱 Telegram</SelectItem>
                <SelectItem value="foodpanda">🐼 FoodPanda</SelectItem>
              </SelectContent>
            </Select>

            {/* Payment Method Filter */}
            <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Payments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payment Methods</SelectItem>
                <SelectItem value="cash">💵 Cash (USD/៛)</SelectItem>
                <SelectItem value="aba">🔵 ABA KHQR</SelectItem>
                <SelectItem value="acleda">🔴 ACLEDA KHQR</SelectItem>
                <SelectItem value="other">🟣 Other</SelectItem>
              </SelectContent>
            </Select>

            {/* Cashier Filter */}
            <Select value={cashierFilter} onValueChange={setCashierFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Cashiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cashiers / Staff</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    👤 {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ─── Detailed Line Items Data Table ─── */}
      <Card className="border-muted shadow-sm">
        <CardHeader className="pb-3 bg-muted/20 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Package01Icon className="size-5 text-emerald-600" />
              Itemized Sale Records
            </CardTitle>
            <CardDescription className="text-xs">
              Showing {filteredItems.length} line items across {kpi.invoicesCount} invoices • Total Revenue: ${kpi.totalRevenueUsd.toFixed(2)} ({kpi.totalRevenueKhr.toLocaleString()} ៛)
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loading01Icon className="animate-spin size-7 text-emerald-600" />
              <p className="text-xs font-semibold">Loading Sale Item Details...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <InformationCircleIcon className="size-8 text-muted-foreground/50 mx-auto" />
              <p className="text-sm font-semibold">No sale item records match your filter criteria.</p>
              <p className="text-xs text-muted-foreground">Try adjusting your date range or filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3 text-left">Date (ICT)</th>
                    <th className="py-3 px-3 text-left">Invoice No</th>
                    <th className="py-3 px-3 text-left">Customer & Channel</th>
                    <th className="py-3 px-3 text-left">Product Name</th>
                    <th className="py-3 px-3 text-left">Category</th>
                    <th className="py-3 px-3 text-center">Qty</th>
                    <th className="py-3 px-3 text-right">Unit Price</th>
                    <th className="py-3 px-3 text-right">Discount</th>
                    <th className="py-3 px-3 text-right">Line Total ($)</th>
                    <th className="py-3 px-3 text-right">Gross Profit ($)</th>
                    <th className="py-3 px-3 text-right">Margin (%)</th>
                    <th className="py-3 px-3 text-left">Cashier</th>
                    <th className="py-3 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredItems.map((item) => {
                    const chInfo = channelBadgeInfo(item.customerType);

                    return (
                      <tr key={item.id} className="hover:bg-muted/40 transition-colors">
                        {/* Date (ICT) */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="font-bold text-foreground">
                            {formatCambodiaDate(item.date, "date")}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatCambodiaDate(item.date, "time")} ICT
                          </div>
                        </td>

                        {/* Invoice No */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1 font-mono font-bold text-emerald-700">
                            <span>{item.invoiceNumber}</span>
                            <button
                              onClick={() => handleCopy(item.invoiceNumber)}
                              className="text-muted-foreground hover:text-foreground"
                              title="Copy invoice"
                            >
                              <Copy01Icon className="size-3" />
                            </button>
                          </div>
                        </td>

                        {/* Customer & Channel */}
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-foreground truncate max-w-[130px]">
                            {item.customerName}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Badge variant="outline" className={`text-[9px] px-1 py-0 font-bold ${chInfo.color}`}>
                              {chInfo.label}
                            </Badge>
                            {item.customerPhone && (
                              <span className="text-[9px] font-mono text-muted-foreground">
                                {item.customerPhone}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Product */}
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-foreground">{item.productName}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{item.productBarcode}</div>
                        </td>

                        {/* Category */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <Badge variant="secondary" className="text-[10px] font-semibold">
                            {item.categoryName}
                          </Badge>
                        </td>

                        {/* Qty */}
                        <td className="py-2.5 px-3 text-center font-bold text-foreground">
                          {item.quantity}
                        </td>

                        {/* Unit Price */}
                        <td className="py-2.5 px-3 text-right font-medium">
                          ${item.unitPrice.toFixed(2)}
                        </td>

                        {/* Discount */}
                        <td className="py-2.5 px-3 text-right font-medium text-rose-600">
                          {item.unitDiscount > 0 ? `-$${(item.unitDiscount * item.quantity).toFixed(2)}` : "—"}
                        </td>

                        {/* Line Total */}
                        <td className="py-2.5 px-3 text-right font-black text-emerald-700">
                          ${item.totalPrice.toFixed(2)}
                          <span className="block text-[9px] font-normal text-muted-foreground">
                            {Math.round(item.totalPrice * exchangeRate).toLocaleString()} ៛
                          </span>
                        </td>

                        {/* Gross Profit */}
                        <td className="py-2.5 px-3 text-right font-bold text-blue-700">
                          ${item.profit.toFixed(2)}
                        </td>

                        {/* Margin */}
                        <td className="py-2.5 px-3 text-right font-bold text-foreground">
                          {item.margin.toFixed(1)}%
                        </td>

                        {/* Cashier */}
                        <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground font-medium">
                          {item.cashierName}
                        </td>

                        {/* Action: Receipt */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReceiptInvoice(item.rawInvoice);
                              setReceiptModalOpen(true);
                            }}
                            className="h-7 text-xs text-emerald-700 font-semibold gap-1"
                          >
                            <PrinterIcon className="size-3.5" />
                            Receipt
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/40 font-black text-foreground">
                    <td colSpan={5} className="py-3 px-3">
                      TOTAL ({filteredItems.length} line items)
                    </td>
                    <td className="py-3 px-3 text-center">{kpi.totalUnits}</td>
                    <td className="py-3 px-3 text-right">—</td>
                    <td className="py-3 px-3 text-right text-rose-600">-${kpi.totalDiscounts.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right text-emerald-700">${kpi.totalRevenueUsd.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right text-blue-700">${kpi.grossProfitUsd.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right">{kpi.marginPct.toFixed(1)}%</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* POS Receipt Modal */}
      <ReceiptModal
        invoice={receiptInvoice}
        open={receiptModalOpen}
        onOpenChange={setReceiptModalOpen}
      />
    </div>
  );
}
