"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { getSaleInvoices } from "@/lib/firebase/sale-actions";
import { getCategories, getProducts, getUsers } from "@/lib/firebase/actions";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import { SaleInvoice, Category, Product, User, StoreSettings } from "@/types";
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
  GridViewIcon,
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
  EyeIcon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  InformationCircleIcon,
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
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

type SortField = "revenue" | "units" | "profit" | "margin" | "name";

interface CategoryProductItem {
  productId: string;
  name: string;
  barcode: string;
  image?: string;
  quantity: number;
  cost: number;
  price: number;
  revenue: number;
  totalCost: number;
  profit: number;
  margin: number;
}

interface CategorySalesRecord {
  categoryId: string;
  categoryName: string;
  totalQty: number;
  totalCost: number;
  totalRevenue: number;
  grossProfit: number;
  profitMargin: number;
  revenueShare: number;
  invoicesCount: number;
  products: CategoryProductItem[];
}

const CATEGORY_CHART_COLORS = [
  "#10b981", // Emerald
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#14b8a6", // Teal
  "#6366f1", // Indigo
  "#f97316", // Orange
  "#84cc16", // Lime
];

export default function SaleByCategoryReportPage() {
  const { user, role } = useAuth();
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("this_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [cashierFilter, setCashierFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortField>("revenue");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Category Drill-Down Modal
  const [viewingCategory, setViewingCategory] = useState<CategorySalesRecord | null>(null);
  const [drillDownModalOpen, setDrillDownModalOpen] = useState(false);

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
      console.error("Failed to load sale by category data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const exchangeRate = settings.exchange_rate_khr || 4100;

  // Category & Product Maps
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
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
        const ct = (inv.customer_type || "walk_in").toLowerCase();
        if (channelFilter === "walk_in") {
          if (ct !== "walk_in") return false;
        } else if (channelFilter === "online") {
          if (ct === "walk_in") return false;
        } else {
          if (!ct.includes(channelFilter.toLowerCase())) return false;
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
        const curr = new Date(todayCambodiaStr);
        const firstDayOfWeek = new Date(
          curr.setDate(curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1))
        );
        const firstDayStr = getCambodiaDateString(firstDayOfWeek);
        const invDateStr = getCambodiaDateString(invDate);
        if (invDateStr < firstDayStr || invDateStr > todayCambodiaStr) return false;
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
  ]);

  // Overall Total Revenue for Share calculation
  const totalPeriodRevenue = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_price || 0), 0);
  }, [filteredInvoices]);

  // Aggregation by Category
  const categorySalesList = useMemo(() => {
    const catMap = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        totalQty: number;
        totalCost: number;
        totalRevenue: number;
        invoicesSet: Set<string>;
        productsMap: Map<string, CategoryProductItem>;
      }
    >();

    // Pre-initialize all active categories
    categories.forEach((cat) => {
      catMap.set(cat.id, {
        categoryId: cat.id,
        categoryName: cat.name,
        totalQty: 0,
        totalCost: 0,
        totalRevenue: 0,
        invoicesSet: new Set<string>(),
        productsMap: new Map<string, CategoryProductItem>(),
      });
    });

    // Add unassigned / general
    catMap.set("uncategorized", {
      categoryId: "uncategorized",
      categoryName: "Uncategorized / General",
      totalQty: 0,
      totalCost: 0,
      totalRevenue: 0,
      invoicesSet: new Set<string>(),
      productsMap: new Map<string, CategoryProductItem>(),
    });

    filteredInvoices.forEach((inv) => {
      inv.items?.forEach((item) => {
        const prod = productMap.get(item.product_id);
        const catId = prod?.category_id || "uncategorized";

        if (!catMap.has(catId)) {
          const cat = categoryMap.get(catId);
          catMap.set(catId, {
            categoryId: catId,
            categoryName: cat?.name || "General",
            totalQty: 0,
            totalCost: 0,
            totalRevenue: 0,
            invoicesSet: new Set<string>(),
            productsMap: new Map<string, CategoryProductItem>(),
          });
        }

        const catData = catMap.get(catId)!;
        const qty = Number(item.quantity || 0);
        const itemRevenue = Number(item.total_price || 0);
        const itemCost = Number(item.cost || 0) * qty;

        catData.totalQty += qty;
        catData.totalRevenue += itemRevenue;
        catData.totalCost += itemCost;
        catData.invoicesSet.add(inv.id);

        const prodKey = item.product_id || item.product_name;
        if (!catData.productsMap.has(prodKey)) {
          catData.productsMap.set(prodKey, {
            productId: item.product_id,
            name: item.product_name,
            barcode: item.product_barcode || "-",
            image: item.product_image,
            quantity: 0,
            cost: Number(item.cost || 0),
            price: Number(item.price || 0),
            revenue: 0,
            totalCost: 0,
            profit: 0,
            margin: 0,
          });
        }

        const prodItem = catData.productsMap.get(prodKey)!;
        prodItem.quantity += qty;
        prodItem.revenue += itemRevenue;
        prodItem.totalCost += itemCost;
        prodItem.profit = prodItem.revenue - prodItem.totalCost;
        prodItem.margin = prodItem.revenue > 0 ? (prodItem.profit / prodItem.revenue) * 100 : 0;
      });
    });

    let list: CategorySalesRecord[] = Array.from(catMap.values())
      .map((c) => {
        const profit = c.totalRevenue - c.totalCost;
        const margin = c.totalRevenue > 0 ? (profit / c.totalRevenue) * 100 : 0;
        const share = totalPeriodRevenue > 0 ? (c.totalRevenue / totalPeriodRevenue) * 100 : 0;
        const productList = Array.from(c.productsMap.values()).sort((a, b) => b.revenue - a.revenue);

        return {
          categoryId: c.categoryId,
          categoryName: c.categoryName,
          totalQty: c.totalQty,
          totalCost: c.totalCost,
          totalRevenue: c.totalRevenue,
          grossProfit: profit,
          profitMargin: margin,
          revenueShare: share,
          invoicesCount: c.invoicesSet.size,
          products: productList,
        };
      })
      .filter((c) => c.totalQty > 0 || c.categoryId !== "uncategorized");

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.categoryName.toLowerCase().includes(q) ||
          c.products.some(
            (p) => p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q)
          )
      );
    }

    // Sorting
    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortBy === "revenue") {
        valA = a.totalRevenue;
        valB = b.totalRevenue;
      } else if (sortBy === "units") {
        valA = a.totalQty;
        valB = b.totalQty;
      } else if (sortBy === "profit") {
        valA = a.grossProfit;
        valB = b.grossProfit;
      } else if (sortBy === "margin") {
        valA = a.profitMargin;
        valB = b.profitMargin;
      } else {
        return sortOrder === "asc"
          ? a.categoryName.localeCompare(b.categoryName)
          : b.categoryName.localeCompare(a.categoryName);
      }
      return sortOrder === "desc" ? valB - valA : valA - valB;
    });

    return list;
  }, [
    categories,
    filteredInvoices,
    productMap,
    categoryMap,
    totalPeriodRevenue,
    searchQuery,
    sortBy,
    sortOrder,
  ]);

  // Overall Financial KPIs
  const kpi = useMemo(() => {
    let totalRevenueUsd = 0;
    let totalCostUsd = 0;
    let totalUnits = 0;
    let activeCategoriesCount = 0;

    categorySalesList.forEach((c) => {
      totalRevenueUsd += c.totalRevenue;
      totalCostUsd += c.totalCost;
      totalUnits += c.totalQty;
      if (c.totalQty > 0) activeCategoriesCount++;
    });

    const grossProfitUsd = totalRevenueUsd - totalCostUsd;
    const marginPct = totalRevenueUsd > 0 ? (grossProfitUsd / totalRevenueUsd) * 100 : 0;
    const topCategory = categorySalesList.length > 0 ? categorySalesList[0] : null;

    return {
      totalRevenueUsd,
      totalRevenueKhr: Math.round(totalRevenueUsd * exchangeRate),
      totalCostUsd,
      grossProfitUsd,
      marginPct,
      totalUnits,
      activeCategoriesCount,
      topCategory,
    };
  }, [categorySalesList, exchangeRate]);

  // Chart Data
  const chartData = useMemo(() => {
    return categorySalesList
      .filter((c) => c.totalRevenue > 0)
      .slice(0, 8)
      .map((c, idx) => ({
        name: c.categoryName.length > 14 ? `${c.categoryName.slice(0, 12)}...` : c.categoryName,
        revenue: Number(c.totalRevenue.toFixed(2)),
        profit: Number(c.grossProfit.toFixed(2)),
        color: CATEGORY_CHART_COLORS[idx % CATEGORY_CHART_COLORS.length],
      }));
  }, [categorySalesList]);

  // Excel (.xlsx) Export
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Categories Summary
    const catHeaders = [
      "#",
      "Category Name",
      "Units Sold",
      "Products Sold Count",
      "Gross Sales ($)",
      "Gross Sales (KHR)",
      "Product Cost ($)",
      "Gross Profit ($)",
      "Margin (%)",
      "Revenue Share (%)",
      "Orders Count",
    ];

    const catRows = categorySalesList.map((c, idx) => [
      idx + 1,
      c.categoryName,
      c.totalQty,
      c.products.length,
      Number(c.totalRevenue.toFixed(2)),
      Math.round(c.totalRevenue * exchangeRate),
      Number(c.totalCost.toFixed(2)),
      Number(c.grossProfit.toFixed(2)),
      `${c.profitMargin.toFixed(1)}%`,
      `${c.revenueShare.toFixed(1)}%`,
      c.invoicesCount,
    ]);

    // Total Row
    catRows.push([
      "TOTAL",
      "",
      kpi.totalUnits,
      "",
      Number(kpi.totalRevenueUsd.toFixed(2)),
      kpi.totalRevenueKhr,
      Number(kpi.totalCostUsd.toFixed(2)),
      Number(kpi.grossProfitUsd.toFixed(2)),
      `${kpi.marginPct.toFixed(1)}%`,
      "100%",
      filteredInvoices.length,
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet([catHeaders, ...catRows]);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Category Summary");

    // Sheet 2: Category Item Details
    const itemHeaders = [
      "#",
      "Category Name",
      "Product Name",
      "Barcode",
      "Quantity Sold",
      "Selling Price ($)",
      "Unit Cost ($)",
      "Total Revenue ($)",
      "Total Cost ($)",
      "Gross Profit ($)",
      "Margin (%)",
    ];

    const itemRows: any[] = [];
    let counter = 1;
    categorySalesList.forEach((c) => {
      c.products.forEach((p) => {
        itemRows.push([
          counter++,
          c.categoryName,
          p.name,
          p.barcode,
          p.quantity,
          Number(p.price.toFixed(2)),
          Number(p.cost.toFixed(2)),
          Number(p.revenue.toFixed(2)),
          Number(p.totalCost.toFixed(2)),
          Number(p.profit.toFixed(2)),
          `${p.margin.toFixed(1)}%`,
        ]);
      });
    });

    const wsItems = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]);
    XLSX.utils.book_append_sheet(wb, wsItems, "Category Products Breakdown");

    XLSX.writeFile(wb, `HealthyFood_Sale_By_Category_${formatCambodiaDate(new Date(), "code")}.xlsx`);
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
    doc.text(`${settings.store_name || "HEALTHY FOOD POS"} - SALE BY CATEGORY REPORT`, 14, 11.5);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${formatCambodiaDate(new Date(), "invoice")} (ICT)`, pageWidth - 14, 11.5, {
      align: "right",
    });

    const head = [
      [
        "#",
        "Category Name",
        "Units Sold",
        "Revenue ($)",
        "Revenue (KHR)",
        "Product Cost ($)",
        "Gross Profit ($)",
        "Margin (%)",
        "Share (%)",
        "Orders",
      ],
    ];

    const body = categorySalesList.map((c, idx) => [
      idx + 1,
      c.categoryName,
      c.totalQty,
      `$${c.totalRevenue.toFixed(2)}`,
      `${Math.round(c.totalRevenue * exchangeRate).toLocaleString()} R`,
      `$${c.totalCost.toFixed(2)}`,
      `$${c.grossProfit.toFixed(2)}`,
      `${c.profitMargin.toFixed(1)}%`,
      `${c.revenueShare.toFixed(1)}%`,
      c.invoicesCount,
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 24,
      theme: "striped",
      headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });

    doc.save(`HealthyFood_Sale_By_Category_${formatCambodiaDate(new Date(), "code")}.pdf`);
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = [
      "Category Name",
      "Units Sold",
      "Gross Sales ($)",
      "Gross Sales (KHR)",
      "Cost ($)",
      "Gross Profit ($)",
      "Margin (%)",
      "Share (%)",
      "Orders",
    ];

    const rows = categorySalesList.map((c) => [
      `"${c.categoryName.replace(/"/g, '""')}"`,
      c.totalQty,
      c.totalRevenue.toFixed(2),
      Math.round(c.totalRevenue * exchangeRate),
      c.totalCost.toFixed(2),
      c.grossProfit.toFixed(2),
      `${c.profitMargin.toFixed(1)}%`,
      `${c.revenueShare.toFixed(1)}%`,
      c.invoicesCount,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `HealthyFood_Sale_By_Category_${formatCambodiaDate(new Date(), "code")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* ─── Header & Actions ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-5 rounded-2xl border border-emerald-500/15">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-500/15 px-2 py-0.5 rounded-md">
              Category Analytics
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
              <Calendar03Icon className="size-3 text-emerald-600" />
              Cambodia Timezone (ICT UTC+7)
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground mt-1">
            Sale by Category Report
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Evaluate category product velocity, gross revenue contribution, profit margins, and itemized subcategory drills.
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

      {/* ─── Top KPI Metric Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <Card className="border-emerald-500/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Category Gross Revenue</span>
              <Dollar01Icon className="size-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-600 tabular-nums">
              ${kpi.totalRevenueUsd.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span>{kpi.totalRevenueKhr.toLocaleString()} ៛ (KHR)</span>
            <Badge variant="secondary" className="text-[10px] font-bold">
              {kpi.activeCategoriesCount} Active Categories
            </Badge>
          </CardContent>
        </Card>

        {/* Category Gross Profit */}
        <Card className="border-emerald-500/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Category Gross Profit</span>
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
            Across all categories in selected range
          </CardContent>
        </Card>

        {/* Top Category Leader */}
        <Card className="border-emerald-500/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Top Category Leader</span>
              <GridViewIcon className="size-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-lg font-black text-foreground truncate mt-1">
              {kpi.topCategory?.categoryName || "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span className="text-emerald-700 font-bold">${kpi.topCategory?.totalRevenue.toFixed(2) || "0.00"}</span>
            <span>{kpi.topCategory?.totalQty || 0} units ({kpi.topCategory?.revenueShare.toFixed(0) || 0}% share)</span>
          </CardContent>
        </Card>
      </div>

      {/* ─── Visual Chart: Revenue by Category ─── */}
      {chartData.length > 0 && (
        <Card className="border-muted shadow-sm">
          <CardHeader className="pb-2 bg-muted/20 border-b">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <GridViewIcon className="size-4 text-emerald-600" />
                Category Revenue Distribution ($)
              </span>
              <span className="text-[11px] text-muted-foreground font-normal">Top categories in period</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-6">
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(val: any, name: any) => [
                      `$${Number(val).toFixed(2)}`,
                      name === "revenue" ? "Revenue" : "Profit",
                    ]}
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
            <div className="relative lg:col-span-1">
              <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search category, product..."
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
                <SelectItem value="cash">💵 Cash (USD/៛)</SelectItem>
                <SelectItem value="aba">🔵 ABA KHQR</SelectItem>
                <SelectItem value="acleda">🔴 ACLEDA KHQR</SelectItem>
                <SelectItem value="other">🟣 Other</SelectItem>
              </SelectContent>
            </Select>

            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="walk_in">🚶 Walk-in Counter</SelectItem>
                <SelectItem value="online">🛵 All Online / Delivery</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort Field */}
            <Select value={sortBy} onValueChange={(val) => setSortBy(val as SortField)}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">Sort by Revenue ($)</SelectItem>
                <SelectItem value="units">Sort by Units Sold</SelectItem>
                <SelectItem value="profit">Sort by Gross Profit</SelectItem>
                <SelectItem value="margin">Sort by Margin (%)</SelectItem>
                <SelectItem value="name">Sort by Name</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort Order Toggle */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
              className="h-9 text-xs font-semibold gap-1.5 justify-center bg-background"
            >
              {sortOrder === "desc" ? (
                <>
                  <ArrowDown01Icon className="size-4 text-emerald-600" />
                  Descending
                </>
              ) : (
                <>
                  <ArrowUp01Icon className="size-4 text-blue-600" />
                  Ascending
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Category Breakdown Data Table ─── */}
      <Card className="border-muted shadow-sm">
        <CardHeader className="pb-3 bg-muted/20 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <GridViewIcon className="size-5 text-emerald-600" />
              Categories Performance Register
            </CardTitle>
            <CardDescription className="text-xs">
              Showing {categorySalesList.length} categories • Total Revenue: ${kpi.totalRevenueUsd.toFixed(2)} ({kpi.totalRevenueKhr.toLocaleString()} ៛)
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loading01Icon className="animate-spin size-7 text-emerald-600" />
              <p className="text-xs font-semibold">Loading Category Sales...</p>
            </div>
          ) : categorySalesList.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <InformationCircleIcon className="size-8 text-muted-foreground/50 mx-auto" />
              <p className="text-sm font-semibold">No category sales recorded in this period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4 text-left">Category</th>
                    <th className="py-3 px-4 text-center">Units Sold</th>
                    <th className="py-3 px-4 text-center">Products Count</th>
                    <th className="py-3 px-4 text-right">Gross Sales ($)</th>
                    <th className="py-3 px-4 text-right">Gross Sales (KHR)</th>
                    <th className="py-3 px-4 text-right">Product Cost ($)</th>
                    <th className="py-3 px-4 text-right">Gross Profit ($)</th>
                    <th className="py-3 px-4 text-right">Margin (%)</th>
                    <th className="py-3 px-4 text-left">Revenue Share</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {categorySalesList.map((c, idx) => (
                    <tr key={c.categoryId || idx} className="hover:bg-muted/40 transition-colors">
                      {/* Category Name */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-foreground flex items-center gap-2">
                          <span className="flex items-center justify-center size-6 rounded-lg bg-emerald-500/10 text-emerald-700 font-black text-xs">
                            🏷️
                          </span>
                          <span>{c.categoryName}</span>
                        </div>
                      </td>

                      {/* Units Sold */}
                      <td className="py-3 px-4 text-center font-bold text-foreground">
                        <Badge variant="secondary" className="font-bold">
                          {c.totalQty} {c.totalQty === 1 ? "unit" : "units"}
                        </Badge>
                      </td>

                      {/* Products Count */}
                      <td className="py-3 px-4 text-center font-semibold text-muted-foreground">
                        {c.products.length} {c.products.length === 1 ? "item" : "items"}
                      </td>

                      {/* Gross Revenue */}
                      <td className="py-3 px-4 text-right font-black text-emerald-700">
                        ${c.totalRevenue.toFixed(2)}
                      </td>

                      {/* Revenue KHR */}
                      <td className="py-3 px-4 text-right font-semibold text-muted-foreground tabular-nums">
                        {Math.round(c.totalRevenue * exchangeRate).toLocaleString()} ៛
                      </td>

                      {/* Product Cost */}
                      <td className="py-3 px-4 text-right font-medium text-muted-foreground">
                        ${c.totalCost.toFixed(2)}
                      </td>

                      {/* Gross Profit */}
                      <td className="py-3 px-4 text-right font-bold text-blue-700">
                        ${c.grossProfit.toFixed(2)}
                      </td>

                      {/* Margin % */}
                      <td className="py-3 px-4 text-right font-bold text-foreground">
                        {c.profitMargin.toFixed(1)}%
                      </td>

                      {/* Share % Progress */}
                      <td className="py-3 px-4 min-w-[120px]">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
                            <span>{c.revenueShare.toFixed(1)}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min(100, c.revenueShare)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Drill-down Action */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setViewingCategory(c);
                            setDrillDownModalOpen(true);
                          }}
                          className="h-7 text-xs text-primary font-bold gap-1"
                        >
                          <EyeIcon className="size-3.5" />
                          View Items
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/40 font-black text-foreground">
                    <td className="py-3 px-4">TOTAL ({categorySalesList.length} Categories)</td>
                    <td className="py-3 px-4 text-center">{kpi.totalUnits}</td>
                    <td className="py-3 px-4 text-center">—</td>
                    <td className="py-3 px-4 text-right text-emerald-700">${kpi.totalRevenueUsd.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right">{kpi.totalRevenueKhr.toLocaleString()} ៛</td>
                    <td className="py-3 px-4 text-right">${kpi.totalCostUsd.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right text-blue-700">${kpi.grossProfitUsd.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right">{kpi.marginPct.toFixed(1)}%</td>
                    <td className="py-3 px-4">100%</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Category Drill-Down Modal ─── */}
      <Dialog open={drillDownModalOpen} onOpenChange={setDrillDownModalOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          {viewingCategory && (
            <div>
              <DialogHeader className="p-5 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                      Category Products Breakdown
                    </span>
                    <DialogTitle className="text-xl font-black text-foreground flex items-center gap-2 mt-0.5">
                      🏷️ {viewingCategory.categoryName}
                      <Badge variant="secondary" className="text-xs">
                        {viewingCategory.products.length} Products Sold
                      </Badge>
                    </DialogTitle>
                  </div>
                </div>
              </DialogHeader>

              <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto text-xs">
                {/* Category KPI Mini-Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/30 p-3.5 rounded-xl border">
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Gross Revenue</span>
                    <span className="font-black text-emerald-700 text-sm">
                      ${viewingCategory.totalRevenue.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Gross Profit</span>
                    <span className="font-bold text-blue-700 text-sm">
                      ${viewingCategory.grossProfit.toFixed(2)} ({viewingCategory.profitMargin.toFixed(1)}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Units Sold</span>
                    <span className="font-bold text-foreground text-sm">
                      {viewingCategory.totalQty} Units
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Orders Count</span>
                    <span className="font-bold text-foreground text-sm">
                      {viewingCategory.invoicesCount} Invoices
                    </span>
                  </div>
                </div>

                {/* Items Table */}
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-muted-foreground font-bold uppercase text-[10px]">
                        <th className="py-2.5 px-3 text-left">Product Name</th>
                        <th className="py-2.5 px-3 text-center">Qty</th>
                        <th className="py-2.5 px-3 text-right">Avg Price</th>
                        <th className="py-2.5 px-3 text-right">Revenue ($)</th>
                        <th className="py-2.5 px-3 text-right">Cost ($)</th>
                        <th className="py-2.5 px-3 text-right">Profit ($)</th>
                        <th className="py-2.5 px-3 text-right">Margin (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {viewingCategory.products.map((p, idx) => (
                        <tr key={p.productId || idx} className="hover:bg-muted/20">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-foreground">{p.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{p.barcode}</div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold">{p.quantity}</td>
                          <td className="py-2.5 px-3 text-right font-medium">${p.price.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-black text-emerald-700">
                            ${p.revenue.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-muted-foreground">
                            ${p.totalCost.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-blue-700">
                            ${p.profit.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-foreground">
                            {p.margin.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <DialogFooter className="p-4 bg-muted/40 border-t">
                <Button size="sm" onClick={() => setDrillDownModalOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
