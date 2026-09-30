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
  Clock01Icon,
  UserIcon,
  InformationCircleIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
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

type ReportTab = "daily" | "products" | "cashiers" | "payments";

export default function SaleSummaryReportPage() {
  const { user, role } = useAuth();
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeTab, setActiveTab] = useState<ReportTab>("daily");
  const [searchQuery, setSearchQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("this_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [cashierFilter, setCashierFilter] = useState("all");

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
      console.error("Failed to load sale summary report data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const exchangeRate = settings.exchange_rate_khr || 4100;

  // Filtered invoices according to presets & dropdowns
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Exclude cancelled / archived
      if (inv.is_archived || inv.status === "not paid") return false;

      // Payment Filter
      if (paymentMethodFilter !== "all" && inv.payment_method !== paymentMethodFilter) {
        return false;
      }

      // Cashier Filter
      if (cashierFilter !== "all") {
        if (inv.created_by !== cashierFilter && inv.created_by_name !== cashierFilter) {
          return false;
        }
      }

      // Channel Filter
      if (channelFilter !== "all") {
        const cType = (inv.customer_type || "walk_in").toLowerCase();
        if (channelFilter === "walk_in") {
          if (cType !== "walk_in") return false;
        } else if (channelFilter === "online") {
          if (cType === "walk_in") return false;
        } else {
          if (!cType.includes(channelFilter.toLowerCase())) return false;
        }
      }

      // Date Presets Filter (Cambodia ICT Timezone)
      const invDate = parseFirestoreDate(inv.created_at);
      if (datePreset === "today") {
        if (!isTodayCambodia(invDate)) return false;
      } else if (datePreset === "yesterday") {
        if (!isYesterdayCambodia(invDate)) return false;
      } else if (datePreset === "this_month") {
        if (!isThisMonthCambodia(invDate)) return false;
      } else if (datePreset === "this_week") {
        const todayCambodiaStr = getCambodiaDateString(new Date());
        const invCambodiaStr = getCambodiaDateString(invDate);
        const curr = new Date(todayCambodiaStr);
        const firstDayOfWeek = new Date(
          curr.setDate(curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1))
        );
        const firstDayStr = getCambodiaDateString(firstDayOfWeek);
        if (invCambodiaStr < firstDayStr || invCambodiaStr > todayCambodiaStr) return false;
      } else if (datePreset === "last_month") {
        const targetParts = getCambodiaDateParts(invDate);
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
        const targetParts = getCambodiaDateParts(invDate);
        const currParts = getCambodiaDateParts(new Date());
        const currQ = Math.floor((Number(currParts.month) - 1) / 3);
        const targetQ = Math.floor((Number(targetParts.month) - 1) / 3);
        if (Number(targetParts.year) !== Number(currParts.year) || currQ !== targetQ) {
          return false;
        }
      } else if (datePreset === "this_year") {
        const targetParts = getCambodiaDateParts(invDate);
        const currParts = getCambodiaDateParts(new Date());
        if (targetParts.year !== currParts.year) return false;
      } else if (datePreset === "custom") {
        const invDateStr = getCambodiaDateString(invDate);
        if (customStartDate && invDateStr < customStartDate) return false;
        if (customEndDate && invDateStr > customEndDate) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const num = (inv.invoice_number || inv.id || "").toLowerCase();
        const cName = (inv.customer_name || "").toLowerCase();
        const cPhone = (inv.customer_phone || "").toLowerCase();
        const cashier = (inv.created_by_name || inv.created_by || "").toLowerCase();
        const hasItem = inv.items?.some(
          (it) =>
            (it.product_name || "").toLowerCase().includes(q) ||
            (it.product_barcode || "").toLowerCase().includes(q)
        );

        if (!num.includes(q) && !cName.includes(q) && !cPhone.includes(q) && !cashier.includes(q) && !hasItem) {
          return false;
        }
      }

      return true;
    });
  }, [
    invoices,
    paymentMethodFilter,
    cashierFilter,
    channelFilter,
    datePreset,
    customStartDate,
    customEndDate,
    searchQuery,
  ]);

  // Overall KPI Financial Summary
  const kpi = useMemo(() => {
    let grossRevenueUsd = 0;
    let totalDiscountUsd = 0;
    let totalTaxUsd = 0;
    let totalCostUsd = 0;
    let totalUnitsSold = 0;
    let cashRevenueUsd = 0;
    let qrRevenueUsd = 0;

    filteredInvoices.forEach((inv) => {
      const total = Number(inv.total_price || 0);
      grossRevenueUsd += total;
      totalDiscountUsd += Number(inv.discount || 0);
      totalTaxUsd += Number(inv.tax || 0);

      const pMethod = (inv.payment_method || "cash").toLowerCase();
      if (pMethod.includes("cash")) {
        cashRevenueUsd += total;
      } else {
        qrRevenueUsd += total;
      }

      inv.items?.forEach((item) => {
        const qty = Number(item.quantity || 0);
        totalUnitsSold += qty;
        totalCostUsd += Number(item.cost || 0) * qty;
      });
    });

    const grossProfitUsd = grossRevenueUsd - totalCostUsd;
    const profitMarginPct = grossRevenueUsd > 0 ? (grossProfitUsd / grossRevenueUsd) * 100 : 0;
    const avgOrderValue = filteredInvoices.length > 0 ? grossRevenueUsd / filteredInvoices.length : 0;

    return {
      grossRevenueUsd,
      grossRevenueKhr: Math.round(grossRevenueUsd * exchangeRate),
      grossProfitUsd,
      profitMarginPct,
      totalCostUsd,
      totalUnitsSold,
      invoicesCount: filteredInvoices.length,
      avgOrderValue,
      totalDiscountUsd,
      totalTaxUsd,
      cashRevenueUsd,
      qrRevenueUsd,
    };
  }, [filteredInvoices, exchangeRate]);

  // 1. Daily Aggregated Sales Summary
  const dailySummary = useMemo(() => {
    const map = new Map<
      string,
      {
        dateStr: string;
        displayDate: string;
        ordersCount: number;
        unitsSold: number;
        revenueUsd: number;
        costUsd: number;
        discountUsd: number;
        cashUsd: number;
        qrUsd: number;
      }
    >();

    filteredInvoices.forEach((inv) => {
      const invDate = parseFirestoreDate(inv.created_at);
      const dateStr = getCambodiaDateString(invDate);
      const displayDate = formatCambodiaDate(invDate, "date");

      if (!map.has(dateStr)) {
        map.set(dateStr, {
          dateStr,
          displayDate,
          ordersCount: 0,
          unitsSold: 0,
          revenueUsd: 0,
          costUsd: 0,
          discountUsd: 0,
          cashUsd: 0,
          qrUsd: 0,
        });
      }

      const day = map.get(dateStr)!;
      day.ordersCount += 1;
      const total = Number(inv.total_price || 0);
      day.revenueUsd += total;
      day.discountUsd += Number(inv.discount || 0);

      const pMethod = (inv.payment_method || "cash").toLowerCase();
      if (pMethod.includes("cash")) day.cashUsd += total;
      else day.qrUsd += total;

      inv.items?.forEach((item) => {
        const qty = Number(item.quantity || 0);
        day.unitsSold += qty;
        day.costUsd += Number(item.cost || 0) * qty;
      });
    });

    return Array.from(map.values())
      .map((d) => {
        const profit = d.revenueUsd - d.costUsd;
        const margin = d.revenueUsd > 0 ? (profit / d.revenueUsd) * 100 : 0;
        const aov = d.ordersCount > 0 ? d.revenueUsd / d.ordersCount : 0;
        return {
          ...d,
          profitUsd: profit,
          marginPct: margin,
          aovUsd: aov,
          revenueKhr: Math.round(d.revenueUsd * exchangeRate),
        };
      })
      .sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }, [filteredInvoices, exchangeRate]);

  // Daily Chart Trend Data (sorted chronologically for Recharts)
  const chartTrendData = useMemo(() => {
    return [...dailySummary]
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
      .map((d) => ({
        date: d.displayDate.slice(0, 6),
        revenue: Number(d.revenueUsd.toFixed(2)),
        profit: Number(d.profitUsd.toFixed(2)),
        orders: d.ordersCount,
      }));
  }, [dailySummary]);

  // 2. Product Sales Summary
  const productSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        barcode: string;
        unitsSold: number;
        revenueUsd: number;
        costUsd: number;
        invoicesCount: number;
      }
    >();

    filteredInvoices.forEach((inv) => {
      inv.items?.forEach((it) => {
        const key = it.product_id || it.product_name;
        if (!map.has(key)) {
          map.set(key, {
            id: it.product_id,
            name: it.product_name,
            barcode: it.product_barcode || "-",
            unitsSold: 0,
            revenueUsd: 0,
            costUsd: 0,
            invoicesCount: 0,
          });
        }
        const prod = map.get(key)!;
        const qty = Number(it.quantity || 0);
        prod.unitsSold += qty;
        prod.revenueUsd += Number(it.total_price || 0);
        prod.costUsd += Number(it.cost || 0) * qty;
        prod.invoicesCount += 1;
      });
    });

    return Array.from(map.values())
      .map((p) => {
        const profit = p.revenueUsd - p.costUsd;
        const margin = p.revenueUsd > 0 ? (profit / p.revenueUsd) * 100 : 0;
        const avgPrice = p.unitsSold > 0 ? p.revenueUsd / p.unitsSold : 0;
        const revShare = kpi.grossRevenueUsd > 0 ? (p.revenueUsd / kpi.grossRevenueUsd) * 100 : 0;
        return {
          ...p,
          profitUsd: profit,
          marginPct: margin,
          avgPriceUsd: avgPrice,
          revSharePct: revShare,
          revenueKhr: Math.round(p.revenueUsd * exchangeRate),
        };
      })
      .sort((a, b) => b.revenueUsd - a.revenueUsd);
  }, [filteredInvoices, kpi.grossRevenueUsd, exchangeRate]);

  // 3. Cashier & Staff Performance Summary
  const cashierSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        cashierId: string;
        cashierName: string;
        invoicesCount: number;
        unitsSold: number;
        revenueUsd: number;
        cashUsd: number;
        qrUsd: number;
        discountUsd: number;
      }
    >();

    filteredInvoices.forEach((inv) => {
      const cId = inv.created_by || "admin";
      const cName = inv.created_by_name || "Admin Cashier";

      if (!map.has(cId)) {
        map.set(cId, {
          cashierId: cId,
          cashierName: cName,
          invoicesCount: 0,
          unitsSold: 0,
          revenueUsd: 0,
          cashUsd: 0,
          qrUsd: 0,
          discountUsd: 0,
        });
      }

      const cashier = map.get(cId)!;
      cashier.invoicesCount += 1;
      const total = Number(inv.total_price || 0);
      cashier.revenueUsd += total;
      cashier.discountUsd += Number(inv.discount || 0);

      const pMethod = (inv.payment_method || "cash").toLowerCase();
      if (pMethod.includes("cash")) cashier.cashUsd += total;
      else cashier.qrUsd += total;

      inv.items?.forEach((it) => {
        cashier.unitsSold += Number(it.quantity || 0);
      });
    });

    return Array.from(map.values())
      .map((c) => {
        const aov = c.invoicesCount > 0 ? c.revenueUsd / c.invoicesCount : 0;
        const share = kpi.grossRevenueUsd > 0 ? (c.revenueUsd / kpi.grossRevenueUsd) * 100 : 0;
        return {
          ...c,
          aovUsd: aov,
          sharePct: share,
          revenueKhr: Math.round(c.revenueUsd * exchangeRate),
        };
      })
      .sort((a, b) => b.revenueUsd - a.revenueUsd);
  }, [filteredInvoices, kpi.grossRevenueUsd, exchangeRate]);

  // 4. Payment & Channel Breakdown
  const paymentChannelSummary = useMemo(() => {
    const payments: Record<string, { count: number; revenue: number }> = {
      cash: { count: 0, revenue: 0 },
      aba: { count: 0, revenue: 0 },
      acleda: { count: 0, revenue: 0 },
      other: { count: 0, revenue: 0 },
    };

    const channels: Record<string, { count: number; revenue: number }> = {
      walk_in: { count: 0, revenue: 0 },
      grab: { count: 0, revenue: 0 },
      nham24: { count: 0, revenue: 0 },
      telegram: { count: 0, revenue: 0 },
      foodpanda: { count: 0, revenue: 0 },
      facebook: { count: 0, revenue: 0 },
      other_online: { count: 0, revenue: 0 },
    };

    filteredInvoices.forEach((inv) => {
      const total = Number(inv.total_price || 0);
      const pm = (inv.payment_method || "cash").toLowerCase();
      const normPm = pm.includes("aba")
        ? "aba"
        : pm.includes("acleda") || pm.includes("aclida")
        ? "acleda"
        : pm.includes("cash")
        ? "cash"
        : "other";

      payments[normPm].count += 1;
      payments[normPm].revenue += total;

      const ct = (inv.customer_type || "walk_in").toLowerCase();
      if (ct === "walk_in") {
        channels.walk_in.count += 1;
        channels.walk_in.revenue += total;
      } else if (ct.includes("grab")) {
        channels.grab.count += 1;
        channels.grab.revenue += total;
      } else if (ct.includes("nham24")) {
        channels.nham24.count += 1;
        channels.nham24.revenue += total;
      } else if (ct.includes("telegram")) {
        channels.telegram.count += 1;
        channels.telegram.revenue += total;
      } else if (ct.includes("foodpanda")) {
        channels.foodpanda.count += 1;
        channels.foodpanda.revenue += total;
      } else if (ct.includes("facebook")) {
        channels.facebook.count += 1;
        channels.facebook.revenue += total;
      } else {
        channels.other_online.count += 1;
        channels.other_online.revenue += total;
      }
    });

    return {
      payments: [
        { label: "Cash (USD / ៛)", key: "cash", ...payments.cash, color: "#10b981" },
        { label: "ABA KHQR", key: "aba", ...payments.aba, color: "#3b82f6" },
        { label: "ACLEDA KHQR", key: "acleda", ...payments.acleda, color: "#e11d48" },
        { label: "Other / Wing", key: "other", ...payments.other, color: "#8b5cf6" },
      ],
      channels: [
        { label: "Walk-in Counter", key: "walk_in", ...channels.walk_in, color: "#10b981" },
        { label: "GrabFood", key: "grab", ...channels.grab, color: "#22c55e" },
        { label: "NHAM24", key: "nham24", ...channels.nham24, color: "#f59e0b" },
        { label: "Telegram Order", key: "telegram", ...channels.telegram, color: "#0ea5e9" },
        { label: "FoodPanda", key: "foodpanda", ...channels.foodpanda, color: "#ec4899" },
        { label: "Facebook Messenger", key: "facebook", ...channels.facebook, color: "#2563eb" },
        { label: "Other Delivery", key: "other_online", ...channels.other_online, color: "#64748b" },
      ].filter((ch) => ch.count > 0 || ch.key === "walk_in"),
    };
  }, [filteredInvoices]);

  // Hourly Sales Distribution (Peak Hours in Cambodia ICT)
  const hourlyData = useMemo(() => {
    const hoursMap = Array.from({ length: 15 }, (_, i) => ({
      hour: i + 8, // 8 AM to 10 PM
      label: `${i + 8 > 12 ? i + 8 - 12 : i + 8} ${i + 8 >= 12 ? "PM" : "AM"}`,
      revenue: 0,
      orders: 0,
    }));

    filteredInvoices.forEach((inv) => {
      const invDate = parseFirestoreDate(inv.created_at);
      const { hour } = getCambodiaDateParts(invDate);
      const hourNum = parseInt(hour, 10);
      const match = hoursMap.find((h) => h.hour === hourNum);
      if (match) {
        match.revenue += Number(inv.total_price || 0);
        match.orders += 1;
      }
    });

    return hoursMap;
  }, [filteredInvoices]);

  // ─── Excel Export ───
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Executive Summary
    const summaryRows = [
      ["HEALTHY FOOD POS - EXECUTIVE SALES SUMMARY REPORT"],
      [`Generated Date: ${formatCambodiaDate(new Date(), "invoice")} (ICT / Cambodia)`],
      [`Period Filter: ${datePreset.toUpperCase()}${datePreset === "custom" ? ` (${customStartDate} to ${customEndDate})` : ""}`],
      [],
      ["FINANCIAL KPI", "VALUE (USD)", "VALUE (KHR)"],
      ["Total Gross Sales", kpi.grossRevenueUsd, kpi.grossRevenueKhr],
      ["Total Product Cost", kpi.totalCostUsd, Math.round(kpi.totalCostUsd * exchangeRate)],
      ["Gross Profit", kpi.grossProfitUsd, Math.round(kpi.grossProfitUsd * exchangeRate)],
      ["Profit Margin (%)", `${kpi.profitMarginPct.toFixed(1)}%`, "-"],
      ["Completed Orders", kpi.invoicesCount, "-"],
      ["Total Units Sold", kpi.totalUnitsSold, "-"],
      ["Average Order Value (AOV)", Number(kpi.avgOrderValue.toFixed(2)), Math.round(kpi.avgOrderValue * exchangeRate)],
      ["Total Discounts Given", kpi.totalDiscountUsd, Math.round(kpi.totalDiscountUsd * exchangeRate)],
      ["Cash Revenue", kpi.cashRevenueUsd, Math.round(kpi.cashRevenueUsd * exchangeRate)],
      ["KHQR Digital Revenue", kpi.qrRevenueUsd, Math.round(kpi.qrRevenueUsd * exchangeRate)],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Executive Summary");

    // Sheet 2: Daily Sales Breakdown
    const dailyHeaders = [
      "#",
      "Date (Cambodia ICT)",
      "Orders Count",
      "Units Sold",
      "Gross Sales ($)",
      "Gross Sales (KHR)",
      "Product Cost ($)",
      "Gross Profit ($)",
      "Margin (%)",
      "AOV ($)",
      "Cash ($)",
      "KHQR ($)",
    ];
    const dailyRows = dailySummary.map((d, idx) => [
      idx + 1,
      d.dateStr,
      d.ordersCount,
      d.unitsSold,
      Number(d.revenueUsd.toFixed(2)),
      d.revenueKhr,
      Number(d.costUsd.toFixed(2)),
      Number(d.profitUsd.toFixed(2)),
      `${d.marginPct.toFixed(1)}%`,
      Number(d.aovUsd.toFixed(2)),
      Number(d.cashUsd.toFixed(2)),
      Number(d.qrUsd.toFixed(2)),
    ]);
    const wsDaily = XLSX.utils.aoa_to_sheet([dailyHeaders, ...dailyRows]);
    XLSX.utils.book_append_sheet(wb, wsDaily, "Daily Breakdown");

    // Sheet 3: Product Summary
    const prodHeaders = [
      "#",
      "Product Name",
      "Barcode",
      "Units Sold",
      "Avg Price ($)",
      "Revenue ($)",
      "Revenue (KHR)",
      "Cost ($)",
      "Profit ($)",
      "Margin (%)",
      "Rev Share (%)",
    ];
    const prodRows = productSummary.map((p, idx) => [
      idx + 1,
      p.name,
      p.barcode,
      p.unitsSold,
      Number(p.avgPriceUsd.toFixed(2)),
      Number(p.revenueUsd.toFixed(2)),
      p.revenueKhr,
      Number(p.costUsd.toFixed(2)),
      Number(p.profitUsd.toFixed(2)),
      `${p.marginPct.toFixed(1)}%`,
      `${p.revSharePct.toFixed(1)}%`,
    ]);
    const wsProd = XLSX.utils.aoa_to_sheet([prodHeaders, ...prodRows]);
    XLSX.utils.book_append_sheet(wb, wsProd, "Product Sales");

    // Sheet 4: Cashiers
    const cashierHeaders = [
      "#",
      "Cashier Name",
      "Invoices Processed",
      "Units Sold",
      "Revenue ($)",
      "Revenue (KHR)",
      "AOV ($)",
      "Cash ($)",
      "KHQR ($)",
      "Rev Share (%)",
    ];
    const cashierRows = cashierSummary.map((c, idx) => [
      idx + 1,
      c.cashierName,
      c.invoicesCount,
      c.unitsSold,
      Number(c.revenueUsd.toFixed(2)),
      c.revenueKhr,
      Number(c.aovUsd.toFixed(2)),
      Number(c.cashUsd.toFixed(2)),
      Number(c.qrUsd.toFixed(2)),
      `${c.sharePct.toFixed(1)}%`,
    ]);
    const wsCashier = XLSX.utils.aoa_to_sheet([cashierHeaders, ...cashierRows]);
    XLSX.utils.book_append_sheet(wb, wsCashier, "Cashier Performance");

    XLSX.writeFile(wb, `HealthyFood_Sale_Summary_${formatCambodiaDate(new Date(), "code")}.xlsx`);
  };

  // ─── PDF Export ───
  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();

    // Banner Header
    doc.setFillColor(5, 150, 105); // emerald-600
    doc.rect(0, 0, pageWidth, 18, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`${settings.store_name || "HEALTHY FOOD POS"} - SALE SUMMARY REPORT`, 14, 11.5);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Generated: ${formatCambodiaDate(new Date(), "invoice")} (ICT UTC+7)`,
      pageWidth - 14,
      11.5,
      { align: "right" }
    );

    // Filter subtitle
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(
      `Period: ${datePreset.toUpperCase()}  |  Total Revenue: $${kpi.grossRevenueUsd.toFixed(2)} (${kpi.grossRevenueKhr.toLocaleString()} KHR)  |  Gross Profit: $${kpi.grossProfitUsd.toFixed(2)} (${kpi.profitMarginPct.toFixed(1)}%)  |  Orders: ${kpi.invoicesCount}`,
      14,
      25
    );

    // Table Data depending on active tab
    let head: string[][] = [];
    let body: (string | number)[][] = [];

    if (activeTab === "daily") {
      head = [
        [
          "#",
          "Date (ICT)",
          "Orders",
          "Units Sold",
          "Revenue ($)",
          "Revenue (KHR)",
          "Cost ($)",
          "Profit ($)",
          "Margin (%)",
          "AOV ($)",
          "Cash ($)",
          "KHQR ($)",
        ],
      ];
      body = dailySummary.map((d, idx) => [
        idx + 1,
        d.dateStr,
        d.ordersCount,
        d.unitsSold,
        `$${d.revenueUsd.toFixed(2)}`,
        `${d.revenueKhr.toLocaleString()} R`,
        `$${d.costUsd.toFixed(2)}`,
        `$${d.profitUsd.toFixed(2)}`,
        `${d.marginPct.toFixed(1)}%`,
        `$${d.aovUsd.toFixed(2)}`,
        `$${d.cashUsd.toFixed(2)}`,
        `$${d.qrUsd.toFixed(2)}`,
      ]);
    } else if (activeTab === "products") {
      head = [
        [
          "#",
          "Product Name",
          "Barcode",
          "Units Sold",
          "Avg Price ($)",
          "Revenue ($)",
          "Revenue (KHR)",
          "Cost ($)",
          "Profit ($)",
          "Margin (%)",
          "Share (%)",
        ],
      ];
      body = productSummary.map((p, idx) => [
        idx + 1,
        p.name,
        p.barcode,
        p.unitsSold,
        `$${p.avgPriceUsd.toFixed(2)}`,
        `$${p.revenueUsd.toFixed(2)}`,
        `${p.revenueKhr.toLocaleString()} R`,
        `$${p.costUsd.toFixed(2)}`,
        `$${p.profitUsd.toFixed(2)}`,
        `${p.marginPct.toFixed(1)}%`,
        `${p.revSharePct.toFixed(1)}%`,
      ]);
    } else if (activeTab === "cashiers") {
      head = [
        [
          "#",
          "Cashier Name",
          "Orders",
          "Units",
          "Revenue ($)",
          "Revenue (KHR)",
          "AOV ($)",
          "Cash ($)",
          "KHQR ($)",
          "Share (%)",
        ],
      ];
      body = cashierSummary.map((c, idx) => [
        idx + 1,
        c.cashierName,
        c.invoicesCount,
        c.unitsSold,
        `$${c.revenueUsd.toFixed(2)}`,
        `${c.revenueKhr.toLocaleString()} R`,
        `$${c.aovUsd.toFixed(2)}`,
        `$${c.cashUsd.toFixed(2)}`,
        `$${c.qrUsd.toFixed(2)}`,
        `${c.sharePct.toFixed(1)}%`,
      ]);
    } else {
      head = [["#", "Payment / Channel", "Orders Count", "Revenue ($)", "Revenue (KHR)", "Share (%)"]];
      body = [
        ...paymentChannelSummary.payments.map((p, idx) => [
          idx + 1,
          `Payment: ${p.label}`,
          p.count,
          `$${p.revenue.toFixed(2)}`,
          `${Math.round(p.revenue * exchangeRate).toLocaleString()} R`,
          `${kpi.grossRevenueUsd > 0 ? ((p.revenue / kpi.grossRevenueUsd) * 100).toFixed(1) : 0}%`,
        ]),
        ...paymentChannelSummary.channels.map((c, idx) => [
          idx + 1 + paymentChannelSummary.payments.length,
          `Channel: ${c.label}`,
          c.count,
          `$${c.revenue.toFixed(2)}`,
          `${Math.round(c.revenue * exchangeRate).toLocaleString()} R`,
          `${kpi.grossRevenueUsd > 0 ? ((c.revenue / kpi.grossRevenueUsd) * 100).toFixed(1) : 0}%`,
        ]),
      ];
    }

    autoTable(doc, {
      head,
      body,
      startY: 32,
      theme: "striped",
      headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });

    doc.save(`HealthyFood_Sale_Summary_${formatCambodiaDate(new Date(), "code")}.pdf`);
  };

  // ─── CSV Export ───
  const handleExportCSV = () => {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];

    if (activeTab === "daily") {
      headers = [
        "Date (ICT)",
        "Orders",
        "Units Sold",
        "Gross Sales ($)",
        "Gross Sales (KHR)",
        "Product Cost ($)",
        "Gross Profit ($)",
        "Margin (%)",
        "AOV ($)",
        "Cash ($)",
        "KHQR ($)",
      ];
      rows = dailySummary.map((d) => [
        `"${d.dateStr}"`,
        d.ordersCount,
        d.unitsSold,
        d.revenueUsd.toFixed(2),
        d.revenueKhr,
        d.costUsd.toFixed(2),
        d.profitUsd.toFixed(2),
        `${d.marginPct.toFixed(1)}%`,
        d.aovUsd.toFixed(2),
        d.cashUsd.toFixed(2),
        d.qrUsd.toFixed(2),
      ]);
    } else if (activeTab === "products") {
      headers = [
        "Product Name",
        "Barcode",
        "Units Sold",
        "Avg Price ($)",
        "Revenue ($)",
        "Revenue (KHR)",
        "Cost ($)",
        "Profit ($)",
        "Margin (%)",
        "Rev Share (%)",
      ];
      rows = productSummary.map((p) => [
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.barcode}"`,
        p.unitsSold,
        p.avgPriceUsd.toFixed(2),
        p.revenueUsd.toFixed(2),
        p.revenueKhr,
        p.costUsd.toFixed(2),
        p.profitUsd.toFixed(2),
        `${p.marginPct.toFixed(1)}%`,
        `${p.revSharePct.toFixed(1)}%`,
      ]);
    } else {
      headers = [
        "Cashier Name",
        "Orders",
        "Units",
        "Revenue ($)",
        "Revenue (KHR)",
        "AOV ($)",
        "Cash ($)",
        "KHQR ($)",
        "Share (%)",
      ];
      rows = cashierSummary.map((c) => [
        `"${c.cashierName.replace(/"/g, '""')}"`,
        c.invoicesCount,
        c.unitsSold,
        c.revenueUsd.toFixed(2),
        c.revenueKhr,
        c.aovUsd.toFixed(2),
        c.cashUsd.toFixed(2),
        c.qrUsd.toFixed(2),
        `${c.sharePct.toFixed(1)}%`,
      ]);
    }

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `HealthyFood_Sale_Summary_${activeTab}_${formatCambodiaDate(new Date(), "code")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* ─── Page Header & Action Controls ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-5 rounded-2xl border border-emerald-500/15">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-500/15 px-2 py-0.5 rounded-md">
              Executive Reports
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
              <Calendar03Icon className="size-3 text-emerald-600" />
              Cambodia Timezone (ICT UTC+7)
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground mt-1">
            Sale Summary Report
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Comprehensive financial analytics, gross margin breakdown, daily performance trends, and cashier audits.
          </p>
        </div>

        {/* Action Buttons */}
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

      {/* ─── Top KPI Metric Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gross Sales */}
        <Card className="border-emerald-500/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Gross Sales Revenue</span>
              <Dollar01Icon className="size-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-600 tabular-nums">
              ${kpi.grossRevenueUsd.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span>{kpi.grossRevenueKhr.toLocaleString()} ៛ (KHR)</span>
            <Badge variant="secondary" className="text-[10px] font-bold">
              {kpi.invoicesCount} Orders
            </Badge>
          </CardContent>
        </Card>

        {/* Gross Profit & Margin */}
        <Card className="border-emerald-500/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Est. Gross Profit</span>
              <ChartIncreaseIcon className="size-4 text-blue-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-blue-600 tabular-nums">
              ${kpi.grossProfitUsd.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span className="text-emerald-700 font-bold">{kpi.profitMarginPct.toFixed(1)}% Margin</span>
            <span className="text-[11px] text-muted-foreground">Cost: ${kpi.totalCostUsd.toFixed(2)}</span>
          </CardContent>
        </Card>

        {/* Units Sold & AOV */}
        <Card className="border-emerald-500/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Units Sold & AOV</span>
              <Package01Icon className="size-4 text-purple-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-purple-600 tabular-nums">
              {kpi.totalUnitsSold} Units
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span>AOV: ${kpi.avgOrderValue.toFixed(2)} / sale</span>
            {kpi.totalDiscountUsd > 0 && (
              <span className="text-[10px] text-rose-600 font-bold">-${kpi.totalDiscountUsd.toFixed(2)} disc</span>
            )}
          </CardContent>
        </Card>

        {/* Cash vs Digital Ratio */}
        <Card className="border-emerald-500/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Cash vs KHQR Digital</span>
              <MoneyReceiveSquareIcon className="size-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-amber-600 tabular-nums">
              ${kpi.cashRevenueUsd.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">Cash</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span>${kpi.qrRevenueUsd.toFixed(2)} KHQR</span>
            <span className="text-[10px] text-muted-foreground font-bold">
              {kpi.grossRevenueUsd > 0 ? ((kpi.cashRevenueUsd / kpi.grossRevenueUsd) * 100).toFixed(0) : 0}% Cash /{" "}
              {kpi.grossRevenueUsd > 0 ? ((kpi.qrRevenueUsd / kpi.grossRevenueUsd) * 100).toFixed(0) : 0}% QR
            </span>
          </CardContent>
        </Card>
      </div>

      {/* ─── Visual Analytics Charts (Sales Trend & Hourly Peak) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales & Profit Trend Area Chart */}
        <Card className="lg:col-span-2 border-muted shadow-sm">
          <CardHeader className="pb-2 bg-muted/20 border-b">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ChartIncreaseIcon className="size-4 text-emerald-600" />
                Sales & Gross Profit Trend
              </span>
              <span className="text-[11px] text-muted-foreground font-normal">
                Chronological Revenue ($)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-6">
            {chartTrendData.length === 0 ? (
              <div className="py-16 text-center text-xs text-muted-foreground">
                No sales data recorded in the selected period.
              </div>
            ) : (
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartTrendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip
                      formatter={(val: any, name: any) => [
                        `$${Number(val).toFixed(2)}`,
                        name === "revenue" ? "Revenue" : "Gross Profit",
                      ]}
                      contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: "#cbd5e1" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#059669"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorRev)"
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      stroke="#2563eb"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorProfit)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hourly Sales Distribution Chart */}
        <Card className="border-muted shadow-sm">
          <CardHeader className="pb-2 bg-muted/20 border-b">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Clock01Icon className="size-4 text-primary" />
                Hourly Peak Sales (ICT)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-6">
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                  <XAxis dataKey="label" tick={{ fontSize: 8 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(val: any) => [`$${Number(val).toFixed(2)}`, "Sales"]}
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  />
                  <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

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

          {/* Dropdown Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <div className="relative">
              <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search product, customer, cashier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs bg-background"
              />
            </div>

            <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Payment Methods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payment Methods</SelectItem>
                <SelectItem value="cash">💵 Cash (USD / ៛)</SelectItem>
                <SelectItem value="aba">🔵 ABA KHQR</SelectItem>
                <SelectItem value="acleda">🔴 ACLEDA KHQR</SelectItem>
                <SelectItem value="other">🟣 Other</SelectItem>
              </SelectContent>
            </Select>

            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Order Channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Order Channels</SelectItem>
                <SelectItem value="walk_in">🚶 Walk-in Counter</SelectItem>
                <SelectItem value="online">🛵 All Online / Delivery</SelectItem>
                <SelectItem value="grab">🛵 GrabFood</SelectItem>
                <SelectItem value="nham24">🍲 NHAM24</SelectItem>
                <SelectItem value="telegram">📱 Telegram</SelectItem>
                <SelectItem value="foodpanda">🐼 FoodPanda</SelectItem>
              </SelectContent>
            </Select>

            <Select value={cashierFilter} onValueChange={setCashierFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Cashiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cashiers / Staff</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    👤 {u.name} ({u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ─── Multi-Tab Data Tables ─── */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as ReportTab)} className="space-y-4">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full sm:w-auto h-auto p-1 bg-muted/60">
          <TabsTrigger value="daily" className="text-xs font-bold py-2 gap-1.5">
            <Calendar03Icon className="size-3.5" />
            Daily Breakdown ({dailySummary.length})
          </TabsTrigger>
          <TabsTrigger value="products" className="text-xs font-bold py-2 gap-1.5">
            <Package01Icon className="size-3.5" />
            Product Sales ({productSummary.length})
          </TabsTrigger>
          <TabsTrigger value="cashiers" className="text-xs font-bold py-2 gap-1.5">
            <UserIcon className="size-3.5" />
            Cashier Performance ({cashierSummary.length})
          </TabsTrigger>
          <TabsTrigger value="payments" className="text-xs font-bold py-2 gap-1.5">
            <MoneyReceiveSquareIcon className="size-3.5" />
            Payments & Channels
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Daily Breakdown Table ─── */}
        <TabsContent value="daily" className="m-0">
          <Card className="border-muted shadow-sm">
            <CardHeader className="pb-3 bg-muted/20 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Calendar03Icon className="size-4 text-emerald-600" />
                  Daily Sales & Gross Profit Summary
                </CardTitle>
                <CardDescription className="text-xs">
                  Aggregated performance by Cambodia local calendar date.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30 text-muted-foreground font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4 text-left">Date (ICT)</th>
                      <th className="py-3 px-4 text-center">Orders</th>
                      <th className="py-3 px-4 text-center">Units Sold</th>
                      <th className="py-3 px-4 text-right">Gross Sales ($)</th>
                      <th className="py-3 px-4 text-right">Gross Sales (KHR)</th>
                      <th className="py-3 px-4 text-right">Product Cost ($)</th>
                      <th className="py-3 px-4 text-right">Gross Profit ($)</th>
                      <th className="py-3 px-4 text-right">Margin (%)</th>
                      <th className="py-3 px-4 text-right">Avg Ticket</th>
                      <th className="py-3 px-4 text-right">Cash / QR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dailySummary.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-muted-foreground">
                          No sales recorded in the selected period.
                        </td>
                      </tr>
                    ) : (
                      dailySummary.map((d) => (
                        <tr key={d.dateStr} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 px-4 font-bold text-foreground">
                            {d.displayDate}
                            <span className="block text-[10px] font-mono text-muted-foreground font-normal">
                              {d.dateStr}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold">{d.ordersCount}</td>
                          <td className="py-3 px-4 text-center font-semibold text-muted-foreground">{d.unitsSold}</td>
                          <td className="py-3 px-4 text-right font-black text-emerald-700">
                            ${d.revenueUsd.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-muted-foreground tabular-nums">
                            {d.revenueKhr.toLocaleString()} ៛
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-muted-foreground">
                            ${d.costUsd.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-blue-700">
                            ${d.profitUsd.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-foreground">
                            {d.marginPct.toFixed(1)}%
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-muted-foreground">
                            ${d.aovUsd.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right text-[11px] text-muted-foreground">
                            <span className="text-emerald-700 font-bold">${d.cashUsd.toFixed(0)}</span> /{" "}
                            <span className="text-blue-700 font-bold">${d.qrUsd.toFixed(0)}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {dailySummary.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 bg-muted/40 font-black text-foreground">
                        <td className="py-3 px-4">TOTAL</td>
                        <td className="py-3 px-4 text-center">{kpi.invoicesCount}</td>
                        <td className="py-3 px-4 text-center">{kpi.totalUnitsSold}</td>
                        <td className="py-3 px-4 text-right text-emerald-700">${kpi.grossRevenueUsd.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right">{kpi.grossRevenueKhr.toLocaleString()} ៛</td>
                        <td className="py-3 px-4 text-right">${kpi.totalCostUsd.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-blue-700">${kpi.grossProfitUsd.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right">{kpi.profitMarginPct.toFixed(1)}%</td>
                        <td className="py-3 px-4 text-right">${kpi.avgOrderValue.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right">
                          ${kpi.cashRevenueUsd.toFixed(0)} / ${kpi.qrRevenueUsd.toFixed(0)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 2: Product Performance Table ─── */}
        <TabsContent value="products" className="m-0">
          <Card className="border-muted shadow-sm">
            <CardHeader className="pb-3 bg-muted/20 border-b">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Package01Icon className="size-4 text-emerald-600" />
                Product Sales & Profitability Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30 text-muted-foreground font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4 text-left">Product</th>
                      <th className="py-3 px-4 text-center">Units Sold</th>
                      <th className="py-3 px-4 text-right">Avg Price ($)</th>
                      <th className="py-3 px-4 text-right">Total Revenue ($)</th>
                      <th className="py-3 px-4 text-right">Total Revenue (KHR)</th>
                      <th className="py-3 px-4 text-right">Total Cost ($)</th>
                      <th className="py-3 px-4 text-right">Gross Profit ($)</th>
                      <th className="py-3 px-4 text-right">Margin (%)</th>
                      <th className="py-3 px-4 text-right">Share (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {productSummary.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-muted-foreground">
                          No product sales recorded in the selected period.
                        </td>
                      </tr>
                    ) : (
                      productSummary.map((p, idx) => (
                        <tr key={p.id || idx} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-foreground">{p.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{p.barcode}</div>
                          </td>
                          <td className="py-3 px-4 text-center font-bold">
                            <Badge variant="secondary" className="font-bold">
                              {p.unitsSold}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right font-medium">${p.avgPriceUsd.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right font-black text-emerald-700">
                            ${p.revenueUsd.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-muted-foreground tabular-nums">
                            {p.revenueKhr.toLocaleString()} ៛
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-muted-foreground">
                            ${p.costUsd.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-blue-700">
                            ${p.profitUsd.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-foreground">
                            {p.marginPct.toFixed(1)}%
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-700">
                            {p.revSharePct.toFixed(1)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 3: Cashier Performance Table ─── */}
        <TabsContent value="cashiers" className="m-0">
          <Card className="border-muted shadow-sm">
            <CardHeader className="pb-3 bg-muted/20 border-b">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <UserIcon className="size-4 text-emerald-600" />
                Cashier & Staff Sales Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30 text-muted-foreground font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4 text-left">Cashier</th>
                      <th className="py-3 px-4 text-center">Orders Handled</th>
                      <th className="py-3 px-4 text-center">Units Sold</th>
                      <th className="py-3 px-4 text-right">Total Revenue ($)</th>
                      <th className="py-3 px-4 text-right">Total Revenue (KHR)</th>
                      <th className="py-3 px-4 text-right">Avg Ticket (AOV)</th>
                      <th className="py-3 px-4 text-right">Cash Collected</th>
                      <th className="py-3 px-4 text-right">KHQR Collected</th>
                      <th className="py-3 px-4 text-right">Share (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {cashierSummary.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-muted-foreground">
                          No cashier activity found.
                        </td>
                      </tr>
                    ) : (
                      cashierSummary.map((c) => (
                        <tr key={c.cashierId} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 px-4 font-bold text-foreground">{c.cashierName}</td>
                          <td className="py-3 px-4 text-center font-bold">{c.invoicesCount}</td>
                          <td className="py-3 px-4 text-center font-semibold text-muted-foreground">{c.unitsSold}</td>
                          <td className="py-3 px-4 text-right font-black text-emerald-700">
                            ${c.revenueUsd.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-muted-foreground tabular-nums">
                            {c.revenueKhr.toLocaleString()} ៛
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-muted-foreground">
                            ${c.aovUsd.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-700">
                            ${c.cashUsd.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-blue-700">
                            ${c.qrUsd.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-foreground">{c.sharePct.toFixed(1)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 4: Payments & Channels Table ─── */}
        <TabsContent value="payments" className="m-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Payment Methods */}
            <Card className="border-muted shadow-sm">
              <CardHeader className="pb-3 bg-muted/20 border-b">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <MoneyReceiveSquareIcon className="size-4 text-emerald-600" />
                  Payment Methods
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30 text-muted-foreground font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-3 text-left">Method</th>
                      <th className="py-2.5 px-3 text-center">Orders</th>
                      <th className="py-2.5 px-3 text-right">Amount ($)</th>
                      <th className="py-2.5 px-3 text-right">Share (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paymentChannelSummary.payments.map((p) => {
                      const share = kpi.grossRevenueUsd > 0 ? (p.revenue / kpi.grossRevenueUsd) * 100 : 0;
                      return (
                        <tr key={p.key} className="hover:bg-muted/30">
                          <td className="py-2.5 px-3 font-bold flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
                            {p.label}
                          </td>
                          <td className="py-2.5 px-3 text-center font-semibold">{p.count}</td>
                          <td className="py-2.5 px-3 text-right font-black text-foreground">
                            ${p.revenue.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                            {share.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Order Channels */}
            <Card className="border-muted shadow-sm">
              <CardHeader className="pb-3 bg-muted/20 border-b">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Store01Icon className="size-4 text-primary" />
                  Customer Order Channels
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30 text-muted-foreground font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-3 text-left">Channel</th>
                      <th className="py-2.5 px-3 text-center">Orders</th>
                      <th className="py-2.5 px-3 text-right">Amount ($)</th>
                      <th className="py-2.5 px-3 text-right">Share (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paymentChannelSummary.channels.map((c) => {
                      const share = kpi.grossRevenueUsd > 0 ? (c.revenue / kpi.grossRevenueUsd) * 100 : 0;
                      return (
                        <tr key={c.key} className="hover:bg-muted/30">
                          <td className="py-2.5 px-3 font-bold flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
                            {c.label}
                          </td>
                          <td className="py-2.5 px-3 text-center font-semibold">{c.count}</td>
                          <td className="py-2.5 px-3 text-right font-black text-foreground">
                            ${c.revenue.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                            {share.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
