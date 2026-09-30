"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import {
  Loading01Icon,
  Download04Icon,
  File02Icon,
  Search01Icon,
  Calendar03Icon,
  MoneyReceiveSquareIcon,
  EyeIcon,
  FileExportIcon,
  Package01Icon,
  ChartBarLineIcon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Layers01Icon,
  Cancel01Icon,
} from "hugeicons-react";
import { getSaleInvoices } from "@/lib/firebase/sale-actions";
import { getCategories, getProducts } from "@/lib/firebase/actions";
import { getWarehouses } from "@/lib/firebase/warehouse-actions";
import { SaleInvoice, Category, Product, Warehouse } from "@/types";
import {
  format,
  startOfDay,
  endOfDay,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  isWithinInterval,
} from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";

type DatePreset = "all" | "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "custom";
type SortField = "revenue" | "profit" | "units" | "margin" | "name";

interface CategorySalesData {
  categoryId: string;
  categoryName: string;
  totalQty: number;
  totalCost: number;
  totalRevenue: number;
  grossProfit: number;
  profitMargin: number;
  revenueShare: number;
  invoicesCount: number;
  products: {
    productId: string;
    productName: string;
    barcode: string;
    quantity: number;
    cost: number;
    price: number;
    totalRevenue: number;
    totalCost: number;
    profit: number;
    margin: number;
  }[];
}

const CATEGORY_COLORS = [
  "#10b981", // emerald
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#f59e0b", // amber
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#14b8a6", // teal
  "#6366f1", // indigo
  "#f97316", // orange
  "#84cc16", // lime
];

export default function SalesByCategoryReportPage() {
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  // User auth & role
  const [role, setRole] = useState<string | null>(null);
  const [userWarehouseId, setUserWarehouseId] = useState<string | null>(null);

  // Filters
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortField>("revenue");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showChart, setShowChart] = useState<boolean>(true);

  // Detail Modal for Category Products
  const [viewingCategory, setViewingCategory] = useState<CategorySalesData | null>(null);

  useEffect(() => {
    try {
      const authStr = localStorage.getItem("user_auth");
      if (authStr) {
        const authData = JSON.parse(authStr);
        const userRole = authData?.user_info?.role || null;
        const wId = authData?.user_info?.warehouse_id || null;
        setRole(userRole);
        setUserWarehouseId(wId);
        if (userRole === "staff" && wId) {
          setSelectedWarehouseId(wId);
        }
      }
    } catch (e) {
      console.error("Failed to parse user_auth", e);
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [invData, catData, prodData, whData] = await Promise.all([
          getSaleInvoices(),
          getCategories(),
          getProducts(),
          getWarehouses(),
        ]);
        setInvoices(invData);
        setCategories(catData);
        setProducts(prodData);
        setWarehouses(whData);
      } catch (error) {
        console.error("Error fetching category sales report data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Maps
  const categoryMap = useMemo(() => {
    const map: Record<string, Category> = {};
    categories.forEach((c) => (map[c.id] = c));
    return map;
  }, [categories]);

  const productMap = useMemo(() => {
    const map: Record<string, Product> = {};
    products.forEach((p) => (map[p.id] = p));
    return map;
  }, [products]);

  const warehouseMap = useMemo(() => {
    const map: Record<string, Warehouse> = {};
    warehouses.forEach((w) => (map[w.id] = w));
    return map;
  }, [warehouses]);

  // Date Range calculation
  const dateInterval = useMemo<{ start: Date; end: Date } | null>(() => {
    const now = new Date();
    if (datePreset === "all") return null;
    if (datePreset === "today") {
      return { start: startOfDay(now), end: endOfDay(now) };
    }
    if (datePreset === "yesterday") {
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    if (datePreset === "this_week") {
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    }
    if (datePreset === "this_month") {
      return { start: startOfMonth(now), end: endOfMonth(now) };
    }
    if (datePreset === "last_month") {
      const prevMonth = subMonths(now, 1);
      return { start: startOfMonth(prevMonth), end: endOfMonth(prevMonth) };
    }
    if (datePreset === "custom") {
      if (!customStartDate && !customEndDate) return null;
      const start = customStartDate ? startOfDay(new Date(customStartDate)) : new Date(0);
      const end = customEndDate ? endOfDay(new Date(customEndDate)) : endOfDay(new Date());
      return { start, end };
    }
    return null;
  }, [datePreset, customStartDate, customEndDate]);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (role === "staff" && userWarehouseId && inv.warehouse_id !== userWarehouseId) {
        return false;
      }
      if (selectedWarehouseId !== "all" && inv.warehouse_id !== selectedWarehouseId) {
        return false;
      }
      if (statusFilter !== "all" && inv.status !== statusFilter) {
        return false;
      }
      if (paymentMethodFilter !== "all" && inv.payment_method !== paymentMethodFilter) {
        return false;
      }
      if (dateInterval) {
        const invDate = new Date(inv.created_at);
        if (!isWithinInterval(invDate, dateInterval)) {
          return false;
        }
      }
      return true;
    });
  }, [
    invoices,
    role,
    userWarehouseId,
    selectedWarehouseId,
    statusFilter,
    paymentMethodFilter,
    dateInterval,
  ]);

  // Aggregation By Category
  const categorySalesList = useMemo<CategorySalesData[]>(() => {
    let grandTotalRevenue = 0;
    const catMap = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        totalQty: number;
        totalCost: number;
        totalRevenue: number;
        invoicesSet: Set<string>;
        productsMap: Map<string, any>;
      }
    >();

    filteredInvoices.forEach((inv) => {
      inv.items?.forEach((item) => {
        const prod = productMap[item.product_id];
        const catId = prod?.category_id || "uncategorized";
        const catName =
          catId === "uncategorized"
            ? "Uncategorized"
            : categoryMap[catId]?.name || "Other / Unknown";

        if (!catMap.has(catId)) {
          catMap.set(catId, {
            categoryId: catId,
            categoryName: catName,
            totalQty: 0,
            totalCost: 0,
            totalRevenue: 0,
            invoicesSet: new Set(),
            productsMap: new Map(),
          });
        }

        const catData = catMap.get(catId)!;
        const itemQty = item.quantity || 0;
        const itemCost = (item.cost || 0) * itemQty;
        const itemRevenue = item.total_price || 0;

        catData.totalQty += itemQty;
        catData.totalCost += itemCost;
        catData.totalRevenue += itemRevenue;
        catData.invoicesSet.add(inv.id);
        grandTotalRevenue += itemRevenue;

        // Product level accumulation
        const prodKey = item.product_id || item.product_name;
        if (!catData.productsMap.has(prodKey)) {
          catData.productsMap.set(prodKey, {
            productId: item.product_id,
            productName: item.product_name || "Unknown Product",
            barcode: item.product_barcode || "-",
            quantity: 0,
            totalCost: 0,
            totalRevenue: 0,
            price: item.price || 0,
            cost: item.cost || 0,
          });
        }
        const pItem = catData.productsMap.get(prodKey)!;
        pItem.quantity += itemQty;
        pItem.totalCost += itemCost;
        pItem.totalRevenue += itemRevenue;
      });
    });

    const result: CategorySalesData[] = Array.from(catMap.values()).map((cat) => {
      const grossProfit = cat.totalRevenue - cat.totalCost;
      const profitMargin = cat.totalRevenue > 0 ? (grossProfit / cat.totalRevenue) * 100 : 0;
      const revenueShare = grandTotalRevenue > 0 ? (cat.totalRevenue / grandTotalRevenue) * 100 : 0;

      const productsArray = Array.from(cat.productsMap.values()).map((p) => {
        const pProfit = p.totalRevenue - p.totalCost;
        const pMargin = p.totalRevenue > 0 ? (pProfit / p.totalRevenue) * 100 : 0;
        return {
          productId: p.productId,
          productName: p.productName,
          barcode: p.barcode,
          quantity: p.quantity,
          cost: p.cost,
          price: p.price,
          totalRevenue: p.totalRevenue,
          totalCost: p.totalCost,
          profit: pProfit,
          margin: pMargin,
        };
      }).sort((a, b) => b.totalRevenue - a.totalRevenue);

      return {
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        totalQty: cat.totalQty,
        totalCost: cat.totalCost,
        totalRevenue: cat.totalRevenue,
        grossProfit,
        profitMargin,
        revenueShare,
        invoicesCount: cat.invoicesSet.size,
        products: productsArray,
      };
    });

    // Filter by search query if any
    let filtered = result;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = result.filter(
        (c) =>
          c.categoryName.toLowerCase().includes(q) ||
          c.products.some((p) =>
            p.productName.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q)
          )
      );
    }

    // Sort
    return filtered.sort((a, b) => {
      let diff = 0;
      if (sortBy === "revenue") diff = b.totalRevenue - a.totalRevenue;
      else if (sortBy === "profit") diff = b.grossProfit - a.grossProfit;
      else if (sortBy === "units") diff = b.totalQty - a.totalQty;
      else if (sortBy === "margin") diff = b.profitMargin - a.profitMargin;
      else if (sortBy === "name") diff = a.categoryName.localeCompare(b.categoryName);

      return sortOrder === "asc" ? -diff : diff;
    });
  }, [
    filteredInvoices,
    productMap,
    categoryMap,
    searchQuery,
    sortBy,
    sortOrder,
  ]);

  // Overall KPIs
  const overallKPI = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalUnits = 0;

    categorySalesList.forEach((c) => {
      totalRevenue += c.totalRevenue;
      totalCost += c.totalCost;
      totalUnits += c.totalQty;
    });

    const totalProfit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const topCategory = categorySalesList.length > 0 ? categorySalesList[0] : null;

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      margin,
      totalUnits,
      activeCategories: categorySalesList.length,
      topCategoryName: topCategory?.categoryName || "N/A",
      topCategoryRevenue: topCategory?.totalRevenue || 0,
    };
  }, [categorySalesList]);

  // Chart Data
  const chartData = useMemo(() => {
    return categorySalesList.slice(0, 8).map((c, i) => ({
      name: c.categoryName.length > 15 ? `${c.categoryName.slice(0, 15)}...` : c.categoryName,
      fullName: c.categoryName,
      revenue: Number(c.totalRevenue.toFixed(2)),
      profit: Number(c.grossProfit.toFixed(2)),
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));
  }, [categorySalesList]);

  // ─── Export Excel (.xlsx) ───
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Executive Summary
    const summaryRows = [
      ["CAR ACCESSORIES - SALES REPORT BY CATEGORY"],
      [`Generated Date: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}`],
      [`Period: ${datePreset.toUpperCase()}${dateInterval ? ` (${format(dateInterval.start, "yyyy-MM-dd")} to ${format(dateInterval.end, "yyyy-MM-dd")})` : ""}`],
      [`Warehouse: ${selectedWarehouseId === "all" ? "All Warehouses" : warehouseMap[selectedWarehouseId]?.name || selectedWarehouseId}`],
      [`Payment Status: ${statusFilter.toUpperCase()}`],
      [`Payment Method: ${paymentMethodFilter.toUpperCase()}`],
      [],
      ["METRICS OVERVIEW", "VALUE"],
      ["Total Categories with Sales", overallKPI.activeCategories],
      ["Total Category Revenue", Number(overallKPI.totalRevenue.toFixed(2))],
      ["Total Product Cost", Number(overallKPI.totalCost.toFixed(2))],
      ["Total Gross Profit", Number(overallKPI.totalProfit.toFixed(2))],
      ["Overall Profit Margin", `${overallKPI.margin.toFixed(2)}%`],
      ["Total Units Sold", overallKPI.totalUnits],
      ["Top Selling Category", overallKPI.topCategoryName],
      ["Top Category Sales", Number(overallKPI.topCategoryRevenue.toFixed(2))],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Category Overview");

    // Sheet 2: Category Summary Table
    const catHeaders = [
      "#",
      "Category Name",
      "Units Sold",
      "Unique Products Count",
      "Total Cost ($)",
      "Total Revenue ($)",
      "Revenue Share (%)",
      "Gross Profit ($)",
      "Profit Margin (%)",
      "Invoices Involved",
    ];
    const catRows: any[] = categorySalesList.map((c, idx) => [
      idx + 1,
      c.categoryName,
      c.totalQty,
      c.products.length,
      Number(c.totalCost.toFixed(2)),
      Number(c.totalRevenue.toFixed(2)),
      `${c.revenueShare.toFixed(1)}%`,
      Number(c.grossProfit.toFixed(2)),
      `${c.profitMargin.toFixed(1)}%`,
      c.invoicesCount,
    ]);
    catRows.push([
      "TOTAL",
      "",
      overallKPI.totalUnits,
      "",
      Number(overallKPI.totalCost.toFixed(2)),
      Number(overallKPI.totalRevenue.toFixed(2)),
      "100.0%",
      Number(overallKPI.totalProfit.toFixed(2)),
      `${overallKPI.margin.toFixed(1)}%`,
      "",
    ]);
    const wsCat = XLSX.utils.aoa_to_sheet([catHeaders, ...catRows]);
    XLSX.utils.book_append_sheet(wb, wsCat, "Categories Summary");

    // Sheet 3: Product Breakdown by Category
    const prodHeaders = [
      "#",
      "Category",
      "Product Name",
      "Barcode",
      "Units Sold",
      "Unit Cost ($)",
      "Unit Price ($)",
      "Total Cost ($)",
      "Total Revenue ($)",
      "Profit ($)",
      "Margin (%)",
    ];
    const prodRows: any[] = [];
    let pIdx = 1;
    categorySalesList.forEach((c) => {
      c.products.forEach((p) => {
        prodRows.push([
          pIdx++,
          c.categoryName,
          p.productName,
          p.barcode,
          p.quantity,
          Number(p.cost.toFixed(2)),
          Number(p.price.toFixed(2)),
          Number(p.totalCost.toFixed(2)),
          Number(p.totalRevenue.toFixed(2)),
          Number(p.profit.toFixed(2)),
          `${p.margin.toFixed(1)}%`,
        ]);
      });
    });
    const wsProd = XLSX.utils.aoa_to_sheet([prodHeaders, ...prodRows]);
    XLSX.utils.book_append_sheet(wb, wsProd, "Products by Category");

    XLSX.writeFile(wb, `sales_by_category_report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  // ─── Export CSV ───
  const handleExportCSV = () => {
    const headers = [
      "#",
      "Category Name",
      "Units Sold",
      "Unique Products",
      "Total Cost ($)",
      "Total Revenue ($)",
      "Revenue Share (%)",
      "Gross Profit ($)",
      "Profit Margin (%)",
      "Invoices Involved",
    ];
    const rows = categorySalesList.map((c, idx) => [
      idx + 1,
      `"${c.categoryName.replace(/"/g, '""')}"`,
      c.totalQty,
      c.products.length,
      c.totalCost.toFixed(2),
      c.totalRevenue.toFixed(2),
      `${c.revenueShare.toFixed(1)}%`,
      c.grossProfit.toFixed(2),
      `${c.profitMargin.toFixed(1)}%`,
      c.invoicesCount,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `sales_by_category_${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ─── Export PDF (jspdf-autotable) ───
  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Banner
    doc.setFillColor(16, 185, 129); // emerald-500
    doc.rect(0, 0, pageWidth, 18, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("CAR ACCESSORIES - SALES REPORT BY CATEGORY", 14, 11.5);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")}`, pageWidth - 14, 11.5, { align: "right" });

    // Subtitle & Filters
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Category Performance & Valuation Audit", 14, 25);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    const filterDesc = [
      `Period: ${datePreset.toUpperCase()}${dateInterval ? ` (${format(dateInterval.start, "yyyy-MM-dd")} to ${format(dateInterval.end, "yyyy-MM-dd")})` : ""}`,
      `Warehouse: ${selectedWarehouseId === "all" ? "All Warehouses" : warehouseMap[selectedWarehouseId]?.name || selectedWarehouseId}`,
      `Status: ${statusFilter.toUpperCase()}`,
      `Payment: ${paymentMethodFilter.toUpperCase()}`,
    ].join("  |  ");
    doc.text(filterDesc, 14, 30);

    // KPI Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(14, 34, pageWidth - 28, 12, 1.5, 1.5, "FD");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    const kpiText = `Total Revenue: $${overallKPI.totalRevenue.toFixed(2)}   |   Total Cost: $${overallKPI.totalCost.toFixed(2)}   |   Gross Profit: $${overallKPI.totalProfit.toFixed(2)} (${overallKPI.margin.toFixed(1)}%)   |   Units Sold: ${overallKPI.totalUnits}   |   Top Category: ${overallKPI.topCategoryName}`;
    doc.text(kpiText, pageWidth / 2, 41.5, { align: "center" });

    // Table
    const head = [[
      "#",
      "Category Name",
      "Units Sold",
      "Unique Products",
      "Total Cost",
      "Total Revenue",
      "Revenue Share",
      "Gross Profit",
      "Profit Margin (%)",
      "Invoices",
    ]];

    const body = categorySalesList.map((c, idx) => [
      idx + 1,
      c.categoryName,
      c.totalQty,
      c.products.length,
      `$${c.totalCost.toFixed(2)}`,
      `$${c.totalRevenue.toFixed(2)}`,
      `${c.revenueShare.toFixed(1)}%`,
      `$${c.grossProfit.toFixed(2)}`,
      `${c.profitMargin.toFixed(1)}%`,
      c.invoicesCount,
    ]);

    const foot = [[
      "TOTAL",
      "",
      overallKPI.totalUnits,
      "",
      `$${overallKPI.totalCost.toFixed(2)}`,
      `$${overallKPI.totalRevenue.toFixed(2)}`,
      "100.0%",
      `$${overallKPI.totalProfit.toFixed(2)}`,
      `${overallKPI.margin.toFixed(1)}%`,
      "",
    ]];

    autoTable(doc, {
      startY: 49,
      head,
      body,
      foot,
      theme: "striped",
      headStyles: {
        fillColor: [5, 150, 105],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: "bold",
        halign: "left",
      },
      footStyles: {
        fillColor: [209, 250, 229],
        textColor: [6, 78, 59],
        fontSize: 8,
        fontStyle: "bold",
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [30, 41, 59],
        cellPadding: 2,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 14, right: 14, bottom: 15 },
      didDrawPage: () => {
        const pageCount = (doc.internal as any).getNumberOfPages ? (doc.internal as any).getNumberOfPages() : doc.internal.pages.length - 1;
        const pageCurrent = (doc.internal as any).getCurrentPageInfo ? (doc.internal as any).getCurrentPageInfo().pageNumber : pageCount;
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(`Page ${pageCurrent} of ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: "right" });
        doc.text("Confidential - Car Accessories POS & Inventory System", 14, pageHeight - 8);
      },
    });

    doc.save(`sales_by_category_${format(new Date(), "yyyy-MM-dd")}.pdf`);
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
      {/* ─── Top Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b bg-background gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <Layers01Icon className="size-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Sales Report by Category</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Category revenue distribution, product profitability, and volume audit
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setShowChart(!showChart)}
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs font-semibold bg-background hover:bg-muted"
          >
            <ChartBarLineIcon className="size-3.5 text-emerald-600" />
            {showChart ? "Hide Chart" : "Show Chart"}
          </Button>

          <Button
            onClick={handleExportExcel}
            size="sm"
            className="gap-1.5 h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
          >
            <FileExportIcon className="size-3.5" />
            Export Excel (.xlsx)
          </Button>

          <Button
            onClick={handleExportCSV}
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs font-semibold bg-background hover:bg-muted"
          >
            <Download04Icon className="size-3.5 text-emerald-600" />
            Export CSV
          </Button>

          <Button
            onClick={handleExportPDF}
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs font-semibold bg-background hover:bg-muted border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
          >
            <File02Icon className="size-3.5" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* ─── Filters & KPI Strip ─── */}
      <div className="p-4 bg-muted/20 border-b space-y-3 shrink-0">
        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative min-w-[220px] flex-1">
            <Search01Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search category or product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-background"
            />
          </div>

          {/* Date Presets */}
          <Select value={datePreset} onValueChange={(val: any) => setDatePreset(val)}>
            <SelectTrigger className="h-8 text-xs w-[130px] bg-background">
              <Calendar03Icon className="size-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Time</SelectItem>
              <SelectItem value="today" className="text-xs">Today</SelectItem>
              <SelectItem value="yesterday" className="text-xs">Yesterday</SelectItem>
              <SelectItem value="this_week" className="text-xs">This Week</SelectItem>
              <SelectItem value="this_month" className="text-xs">This Month</SelectItem>
              <SelectItem value="last_month" className="text-xs">Last Month</SelectItem>
              <SelectItem value="custom" className="text-xs">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {/* Custom Date Inputs */}
          {datePreset === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-8 text-xs w-[125px] bg-background"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-8 text-xs w-[125px] bg-background"
              />
            </div>
          )}

          {/* Warehouse Selector */}
          <Select
            value={selectedWarehouseId}
            onValueChange={setSelectedWarehouseId}
            disabled={role === "staff" && !!userWarehouseId}
          >
            <SelectTrigger className="h-8 text-xs w-[150px] bg-background">
              <SelectValue placeholder="Warehouse" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Warehouses</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id} className="text-xs">{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Payment Status */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs w-[115px] bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Status</SelectItem>
              <SelectItem value="paid" className="text-xs">Paid</SelectItem>
              <SelectItem value="not paid" className="text-xs">Not Paid</SelectItem>
            </SelectContent>
          </Select>

          {/* Payment Method */}
          <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
            <SelectTrigger className="h-8 text-xs w-[125px] bg-background">
              <SelectValue placeholder="Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Methods</SelectItem>
              <SelectItem value="cash" className="text-xs">Cash</SelectItem>
              <SelectItem value="aba" className="text-xs">ABA Pay</SelectItem>
              <SelectItem value="aclida" className="text-xs">Acleda</SelectItem>
              <SelectItem value="wing" className="text-xs">Wing</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort By */}
          <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
            <SelectTrigger className="h-8 text-xs w-[130px] bg-background">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue" className="text-xs">Revenue</SelectItem>
              <SelectItem value="profit" className="text-xs">Gross Profit</SelectItem>
              <SelectItem value="units" className="text-xs">Units Sold</SelectItem>
              <SelectItem value="margin" className="text-xs">Margin %</SelectItem>
              <SelectItem value="name" className="text-xs">Name</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
            className="h-8 w-8 p-0"
            title="Toggle Sort Order"
          >
            {sortOrder === "desc" ? <ArrowDown01Icon className="size-4" /> : <ArrowUp01Icon className="size-4" />}
          </Button>
        </div>

        {/* KPI Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
          {/* Total Revenue */}
          <div className="bg-background border rounded-lg p-2.5 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total Sales</span>
            <p className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              ${overallKPI.totalRevenue.toFixed(2)}
            </p>
          </div>

          {/* Total Cost */}
          <div className="bg-background border rounded-lg p-2.5 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total Cost</span>
            <p className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">
              ${overallKPI.totalCost.toFixed(2)}
            </p>
          </div>

          {/* Gross Profit */}
          <div className="bg-background border rounded-lg p-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Gross Profit</span>
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1 rounded">
                {overallKPI.margin.toFixed(1)}%
              </span>
            </div>
            <p className={`text-base font-black font-mono mt-0.5 ${overallKPI.totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              ${overallKPI.totalProfit.toFixed(2)}
            </p>
          </div>

          {/* Top Category */}
          <div className="bg-background border rounded-lg p-2.5 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Top Category</span>
            <p className="text-xs font-bold truncate text-foreground mt-1" title={overallKPI.topCategoryName}>
              {overallKPI.topCategoryName}
            </p>
            <p className="text-[11px] font-mono text-emerald-600 font-semibold">
              ${overallKPI.topCategoryRevenue.toFixed(2)}
            </p>
          </div>

          {/* Total Units */}
          <div className="bg-background border rounded-lg p-2.5 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Units Sold</span>
            <p className="text-base font-bold font-mono mt-0.5">{overallKPI.totalUnits} units</p>
          </div>

          {/* Active Categories */}
          <div className="bg-background border rounded-lg p-2.5 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Active Categories</span>
            <p className="text-base font-bold font-mono mt-0.5">{overallKPI.activeCategories} categories</p>
          </div>
        </div>
      </div>

      {/* ─── Main Content Area ─── */}
      <div className="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900 p-4 sm:p-6 space-y-4">
        {/* Optional Visual Chart */}
        {showChart && chartData.length > 0 && (
          <div className="bg-white dark:bg-black border rounded-lg p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold tracking-tight flex items-center gap-1.5">
                <ChartBarLineIcon className="size-4 text-emerald-500" />
                Revenue & Profit by Top Categories ($)
              </h3>
              <span className="text-[11px] text-muted-foreground">Top {chartData.length} Categories</span>
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-background border p-2 rounded-lg shadow-lg text-xs space-y-1">
                            <p className="font-bold">{data.fullName}</p>
                            <p className="text-emerald-600 font-semibold font-mono">Revenue: ${data.revenue.toFixed(2)}</p>
                            <p className="text-blue-600 font-semibold font-mono">Profit: ${data.profit.toFixed(2)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Excel-Style Category Table */}
        <div className="bg-white dark:bg-black border rounded-sm shadow-sm overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-neutral-100 dark:bg-neutral-800 border-b-2 border-neutral-300 dark:border-neutral-700">
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 w-12 text-center">#</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Category Name</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-center">Units Sold</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-center">Unique Products</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Total Cost</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right bg-emerald-50/70 dark:bg-emerald-950/30">Total Revenue</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Revenue Share</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Gross Profit</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Margin (%)</th>
                <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-center">Invoices</th>
                <th className="px-3 py-2 font-semibold text-neutral-600 dark:text-neutral-300 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {categorySalesList.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted-foreground">
                    No sales data found for any category in this period.
                  </td>
                </tr>
              ) : (
                categorySalesList.map((cat, idx) => (
                  <tr key={cat.categoryId} className="border-b hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                    <td className="px-3 py-2 border-r text-center text-neutral-500 bg-neutral-50 dark:bg-neutral-900/50">{idx + 1}</td>
                    <td className="px-3 py-2 border-r font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                      />
                      {cat.categoryName}
                    </td>
                    <td className="px-3 py-2 border-r text-center font-bold font-mono text-neutral-800 dark:text-neutral-200">
                      {cat.totalQty}
                    </td>
                    <td className="px-3 py-2 border-r text-center font-mono text-neutral-600 dark:text-neutral-400">
                      {cat.products.length} products
                    </td>
                    <td className="px-3 py-2 border-r text-right font-mono text-blue-600 dark:text-blue-400">
                      ${cat.totalCost.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 border-r text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20">
                      ${cat.totalRevenue.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 border-r text-right font-mono font-semibold text-neutral-700 dark:text-neutral-300">
                      {cat.revenueShare.toFixed(1)}%
                    </td>
                    <td className={`px-3 py-2 border-r text-right font-mono font-bold ${cat.grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                      ${cat.grossProfit.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 border-r text-right font-mono font-semibold text-neutral-700 dark:text-neutral-300">
                      {cat.profitMargin.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 border-r text-center font-mono text-neutral-600 dark:text-neutral-400">
                      {cat.invoicesCount}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewingCategory(cat)}
                        className="h-6 px-2 text-[11px] gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-semibold"
                      >
                        <EyeIcon className="size-3" />
                        Products ({cat.products.length})
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-neutral-100 dark:bg-neutral-800 border-t-2 border-neutral-300 dark:border-neutral-700 font-bold">
                <td colSpan={2} className="px-3 py-2.5 border-r text-right uppercase tracking-wider text-[10px]">
                  Grand Total ({categorySalesList.length} Categories)
                </td>
                <td className="px-3 py-2.5 border-r text-center font-mono">{overallKPI.totalUnits}</td>
                <td className="px-3 py-2.5 border-r text-center font-mono">-</td>
                <td className="px-3 py-2.5 border-r text-right font-mono text-blue-600 dark:text-blue-400">${overallKPI.totalCost.toFixed(2)}</td>
                <td className="px-3 py-2.5 border-r text-right font-mono text-emerald-700 dark:text-emerald-400 text-sm bg-emerald-100/60 dark:bg-emerald-950/40">
                  ${overallKPI.totalRevenue.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 border-r text-right font-mono">100.0%</td>
                <td className="px-3 py-2.5 border-r text-right font-mono text-emerald-600 dark:text-emerald-400">${overallKPI.totalProfit.toFixed(2)}</td>
                <td className="px-3 py-2.5 border-r text-right font-mono">{overallKPI.margin.toFixed(1)}%</td>
                <td colSpan={2} className="px-3 py-2.5"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ─── Category Products Drill-Down Modal ─── */}
      <Dialog open={!!viewingCategory} onOpenChange={(open) => !open && setViewingCategory(null)}>
        <DialogContent
          showCloseButton={false}
          className="!max-w-[1200px] !w-[min(96vw,1200px)] sm:!max-w-[1200px] md:!max-w-[1200px] lg:!max-w-[1200px] xl:!max-w-[1200px] p-0 overflow-hidden rounded-xl shadow-2xl bg-background border"
        >
          {viewingCategory && (
            <div>
              <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shrink-0">
                      <Layers01Icon className="size-5" />
                    </div>
                    <div>
                      <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                        Category: {viewingCategory.categoryName}
                      </DialogTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {viewingCategory.products.length} products sold &bull; {viewingCategory.totalQty} total units sold &bull; {viewingCategory.invoicesCount} invoices
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="bg-background border rounded-lg px-3 py-1.5 text-right shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block leading-tight">Total Revenue</span>
                      <span className="text-sm sm:text-base font-mono font-black text-emerald-600 dark:text-emerald-400">
                        ${viewingCategory.totalRevenue.toFixed(2)}
                      </span>
                    </div>

                    <div className="bg-background border rounded-lg px-3 py-1.5 text-right shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block leading-tight">Gross Profit</span>
                      <span className="text-sm sm:text-base font-mono font-black text-emerald-600 dark:text-emerald-400">
                        ${viewingCategory.grossProfit.toFixed(2)}{" "}
                        <span className="text-xs font-semibold text-muted-foreground font-sans">({viewingCategory.profitMargin.toFixed(1)}%)</span>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setViewingCategory(null)}
                      className="h-9 w-9 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors shrink-0 shadow-2xs ml-1"
                      title="Close dialog"
                    >
                      <Cancel01Icon className="size-4" />
                    </button>
                  </div>
                </div>
              </DialogHeader>

              <div className="p-4 sm:p-6 max-h-[70vh] overflow-y-auto">
                <div className="bg-card border rounded-lg overflow-x-auto shadow-2xs">
                  <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="bg-muted/60 border-b">
                        <th className="px-3.5 py-2.5 font-semibold text-muted-foreground w-12 text-center">#</th>
                        <th className="px-3.5 py-2.5 font-semibold text-muted-foreground min-w-[200px]">Product Name</th>
                        <th className="px-3.5 py-2.5 font-semibold text-muted-foreground">Barcode</th>
                        <th className="px-3.5 py-2.5 font-semibold text-muted-foreground text-center">Qty Sold</th>
                        <th className="px-3.5 py-2.5 font-semibold text-muted-foreground text-right">Avg Unit Cost</th>
                        <th className="px-3.5 py-2.5 font-semibold text-muted-foreground text-right">Selling Price</th>
                        <th className="px-3.5 py-2.5 font-semibold text-muted-foreground text-right">Total Cost</th>
                        <th className="px-3.5 py-2.5 font-semibold text-muted-foreground text-right bg-emerald-50/60 dark:bg-emerald-950/20">Total Revenue</th>
                        <th className="px-3.5 py-2.5 font-semibold text-muted-foreground text-right">Profit</th>
                        <th className="px-3.5 py-2.5 font-semibold text-muted-foreground text-right">Margin (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {viewingCategory.products.map((p, pIdx) => (
                        <tr key={p.productId || pIdx} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3.5 py-2 text-center text-muted-foreground font-mono">{pIdx + 1}</td>
                          <td className="px-3.5 py-2 font-bold text-foreground">{p.productName}</td>
                          <td className="px-3.5 py-2 font-mono text-muted-foreground">{p.barcode || "-"}</td>
                          <td className="px-3.5 py-2 text-center font-black font-mono text-foreground">{p.quantity}</td>
                          <td className="px-3.5 py-2 text-right font-mono text-blue-600 dark:text-blue-400">${p.cost.toFixed(2)}</td>
                          <td className="px-3.5 py-2 text-right font-mono text-foreground">${p.price.toFixed(2)}</td>
                          <td className="px-3.5 py-2 text-right font-mono text-blue-600 dark:text-blue-400 font-semibold">${p.totalCost.toFixed(2)}</td>
                          <td className="px-3.5 py-2 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/10">
                            ${p.totalRevenue.toFixed(2)}
                          </td>
                          <td className={`px-3.5 py-2 text-right font-mono font-bold ${p.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                            ${p.profit.toFixed(2)}
                          </td>
                          <td className="px-3.5 py-2 text-right font-mono">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${p.margin >= 30 ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-muted text-foreground"}`}>
                              {p.margin.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/70 border-t-2 font-bold">
                        <td colSpan={3} className="px-3.5 py-2.5 text-right uppercase tracking-wider text-[10px] text-muted-foreground">
                          Total ({viewingCategory.products.length} Products)
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono font-black">{viewingCategory.totalQty}</td>
                        <td colSpan={2} className="px-3.5 py-2.5"></td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-blue-600 dark:text-blue-400">${viewingCategory.totalCost.toFixed(2)}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 font-black text-sm bg-emerald-100/50 dark:bg-emerald-950/30">
                          ${viewingCategory.totalRevenue.toFixed(2)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 font-black">${viewingCategory.grossProfit.toFixed(2)}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono">{viewingCategory.profitMargin.toFixed(1)}%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
