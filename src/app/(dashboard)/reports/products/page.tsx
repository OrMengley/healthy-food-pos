"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { getProducts, getCategories } from "@/lib/firebase/actions";
import { getStocks } from "@/lib/firebase/stock-actions";
import { getWarehouses } from "@/lib/firebase/warehouse-actions";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import { Product, Category, Stock, Warehouse, StoreSettings } from "@/types";
import { Card } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Package01Icon,
  GridViewIcon,
  Search01Icon,
  Download04Icon,
  FileExportIcon,
  PrinterIcon,
  Loading01Icon,
  BarcodeScanIcon,
  Dollar01Icon,
  Image01Icon,
  SparklesIcon,
  Refresh01Icon,
  Layers01Icon,
  Copy01Icon,
  ChartIncreaseIcon,
  Store01Icon,
  InformationCircleIcon,
  Cancel01Icon,
  ArrowDown01Icon,
} from "hugeicons-react";
import { formatCambodiaDate, getOptimizedImageUrl } from "@/lib/utils";
import { toast } from "sonner";
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

interface ProductReportItem extends Product {
  current_stock: number;
  total_cost_value: number;
  total_retail_value: number;
  unit_profit: number;
  margin_percent: number;
  warehouse_stocks: { warehouse_id: string; warehouse_name: string; quantity: number }[];
}

const CATEGORY_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#14b8a6",
  "#6366f1",
  "#84cc16",
];

export default function ProductReportPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedStockFilter, setSelectedStockFilter] = useState<string>("all");
  const [selectedMarginFilter, setSelectedMarginFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("created_desc");
  const [activeTab, setActiveTab] = useState<string>("catalog");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Detail Sheet
  const [selectedProduct, setSelectedProduct] = useState<ProductReportItem | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const exchangeRate = settings.exchange_rate_khr || 4100;

  const loadData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [prods, cats, stks, whs, conf] = await Promise.all([
        getProducts(),
        getCategories(),
        getStocks(),
        getWarehouses(),
        getStoreSettings(),
      ]);

      setProducts(prods);
      setCategories(cats);
      setStocks(stks);
      setWarehouses(whs);
      setSettings(conf);
      if (isRefresh) toast.success("Product report refreshed");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to load product report data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Category Map
  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => (map[c.id] = c.name));
    return map;
  }, [categories]);

  // Processed Products with stock, valuation, and profit calculations
  const processedProducts: ProductReportItem[] = useMemo(() => {
    const stockMap: Record<string, number> = {};
    const stockByWhMap: Record<string, Record<string, number>> = {};

    stocks.forEach((s) => {
      if (s.is_archived) return;
      const pid = s.product_id;
      const qty = Number(s.quantity) || 0;
      stockMap[pid] = (stockMap[pid] || 0) + qty;

      if (!stockByWhMap[pid]) stockByWhMap[pid] = {};
      const wid = s.warehouse_id || "main";
      stockByWhMap[pid][wid] = (stockByWhMap[pid][wid] || 0) + qty;
    });

    return products.map((p) => {
      const currentStock = stockMap[p.id] || 0;
      const cost = Number(p.cost || p.cost_recommand || 0);
      const price = Number(p.price || 0);
      const unitProfit = price - cost;
      const marginPercent = price > 0 ? (unitProfit / price) * 100 : 0;
      const totalCostValue = currentStock * cost;
      const totalRetailValue = currentStock * price;

      const whStocks = warehouses.map((wh) => ({
        warehouse_id: wh.id,
        warehouse_name: wh.name,
        quantity: stockByWhMap[p.id]?.[wh.id] || 0,
      }));

      return {
        ...p,
        current_stock: currentStock,
        total_cost_value: totalCostValue,
        total_retail_value: totalRetailValue,
        unit_profit: unitProfit,
        margin_percent: marginPercent,
        warehouse_stocks: whStocks,
      };
    });
  }, [products, stocks, warehouses]);

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    let result = processedProducts.filter((p) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(q);
        const matchBarcode = (p.barcode || "").toLowerCase().includes(q);
        const matchDesc = (p.description || "").toLowerCase().includes(q);
        const matchCat = (categoryMap[p.category_id || ""] || "").toLowerCase().includes(q);
        if (!matchName && !matchBarcode && !matchDesc && !matchCat) return false;
      }

      // Category
      if (selectedCategoryId !== "all") {
        if (selectedCategoryId === "uncategorized") {
          if (p.category_id && p.category_id !== "none") return false;
        } else if (p.category_id !== selectedCategoryId) {
          return false;
        }
      }

      // Status
      if (selectedStatus !== "all") {
        if (p.status !== selectedStatus) return false;
      }

      // Stock Status
      if (selectedStockFilter !== "all") {
        if (selectedStockFilter === "in_stock" && p.current_stock <= 0) return false;
        if (selectedStockFilter === "low_stock" && (p.current_stock <= 0 || p.current_stock > 5)) return false;
        if (selectedStockFilter === "out_of_stock" && p.current_stock > 0) return false;
      }

      // Margin
      if (selectedMarginFilter !== "all") {
        if (selectedMarginFilter === "high" && p.margin_percent < 50) return false;
        if (selectedMarginFilter === "medium" && (p.margin_percent < 20 || p.margin_percent >= 50)) return false;
        if (selectedMarginFilter === "low" && (p.margin_percent < 0 || p.margin_percent >= 20)) return false;
        if (selectedMarginFilter === "loss" && p.margin_percent >= 0) return false;
      }

      return true;
    });

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "created_desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "created_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name_asc":
          return a.name.localeCompare(b.name);
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "price_desc":
          return b.price - a.price;
        case "price_asc":
          return a.price - b.price;
        case "cost_desc":
          return (b.cost || 0) - (a.cost || 0);
        case "cost_asc":
          return (a.cost || 0) - (b.cost || 0);
        case "stock_desc":
          return b.current_stock - a.current_stock;
        case "stock_asc":
          return a.current_stock - b.current_stock;
        case "margin_desc":
          return b.margin_percent - a.margin_percent;
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return result;
  }, [
    processedProducts,
    searchQuery,
    selectedCategoryId,
    selectedStatus,
    selectedStockFilter,
    selectedMarginFilter,
    sortBy,
    categoryMap,
  ]);

  // Overall Catalog KPI Summary
  const kpis = useMemo(() => {
    const totalCount = processedProducts.length;
    const activeCount = processedProducts.filter((p) => p.status === "active").length;
    const inactiveCount = totalCount - activeCount;

    let totalStock = 0;
    let totalRetailVal = 0;
    let totalCostVal = 0;
    let inStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let sumPrice = 0;
    let sumCost = 0;

    processedProducts.forEach((p) => {
      totalStock += p.current_stock;
      totalRetailVal += p.total_retail_value;
      totalCostVal += p.total_cost_value;
      sumPrice += p.price;
      sumCost += p.cost || 0;

      if (p.current_stock > 5) inStockCount++;
      else if (p.current_stock > 0) lowStockCount++;
      else outOfStockCount++;
    });

    const avgPrice = totalCount > 0 ? sumPrice / totalCount : 0;
    const avgMargin = sumPrice > 0 ? ((sumPrice - sumCost) / sumPrice) * 100 : 0;
    const potentialGrossProfit = totalRetailVal - totalCostVal;

    return {
      totalCount,
      activeCount,
      inactiveCount,
      totalStock,
      totalRetailVal,
      totalCostVal,
      potentialGrossProfit,
      avgPrice,
      avgMargin,
      inStockCount,
      lowStockCount,
      outOfStockCount,
      categoriesCount: categories.length,
    };
  }, [processedProducts, categories]);

  // Category Analytics Breakdown
  const categoryAnalytics = useMemo(() => {
    const map: Record<
      string,
      {
        id: string;
        name: string;
        product_count: number;
        active_count: number;
        total_stock: number;
        total_retail_value: number;
        total_cost_value: number;
        sum_price: number;
      }
    > = {};

    categories.forEach((cat) => {
      map[cat.id] = {
        id: cat.id,
        name: cat.name,
        product_count: 0,
        active_count: 0,
        total_stock: 0,
        total_retail_value: 0,
        total_cost_value: 0,
        sum_price: 0,
      };
    });

    map["uncategorized"] = {
      id: "uncategorized",
      name: "Uncategorized",
      product_count: 0,
      active_count: 0,
      total_stock: 0,
      total_retail_value: 0,
      total_cost_value: 0,
      sum_price: 0,
    };

    processedProducts.forEach((p) => {
      const key = p.category_id && map[p.category_id] ? p.category_id : "uncategorized";
      const item = map[key];
      item.product_count += 1;
      if (p.status === "active") item.active_count += 1;
      item.total_stock += p.current_stock;
      item.total_retail_value += p.total_retail_value;
      item.total_cost_value += p.total_cost_value;
      item.sum_price += p.price;
    });

    return Object.values(map)
      .filter((c) => c.product_count > 0 || c.id !== "uncategorized")
      .sort((a, b) => b.product_count - a.product_count);
  }, [processedProducts, categories]);

  // Chart Data for Category Breakdown
  const categoryChartData = useMemo(() => {
    return categoryAnalytics
      .filter((c) => c.product_count > 0)
      .slice(0, 8)
      .map((c, i) => ({
        name: c.name.length > 14 ? c.name.slice(0, 12) + "..." : c.name,
        products: c.product_count,
        stock: c.total_stock,
        retailValue: Math.round(c.total_retail_value),
        fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      }));
  }, [categoryAnalytics]);

  // Pagination Slice
  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;
  const paginatedProducts = useMemo(() => {
    if (pageSize === 0) return filteredProducts;
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  const handleRowClick = (prod: ProductReportItem) => {
    setSelectedProduct(prod);
    setSelectedImageIndex(0);
    setDetailSheetOpen(true);
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard!`);
  };

  // ─── Export to Excel ───────────────────────────────────────
  const handleExportExcel = () => {
    if (filteredProducts.length === 0) {
      toast.error("No product records to export");
      return;
    }

    try {
      const dataRows = filteredProducts.map((p, idx) => ({
        "No.": idx + 1,
        "Product Name": p.name,
        "Barcode": p.barcode,
        "Category": categoryMap[p.category_id || ""] || "Uncategorized",
        "Status": p.status ? p.status.toUpperCase() : "ACTIVE",
        "Cost Price ($)": Number((p.cost || 0).toFixed(2)),
        "Cost Price (៛)": Math.round((p.cost || 0) * exchangeRate),
        "Selling Price ($)": Number(p.price.toFixed(2)),
        "Selling Price (៛)": Math.round(p.price * exchangeRate),
        "Unit Profit ($)": Number(p.unit_profit.toFixed(2)),
        "Margin (%)": Number(p.margin_percent.toFixed(1)),
        "Current Stock": p.current_stock,
        "Total Cost Value ($)": Number(p.total_cost_value.toFixed(2)),
        "Total Retail Value ($)": Number(p.total_retail_value.toFixed(2)),
        "Created Date": formatCambodiaDate(p.created_at, "datetime"),
        "Description": p.description || "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "All Products");

      const colWidths = [
        { wch: 6 },
        { wch: 30 },
        { wch: 16 },
        { wch: 18 },
        { wch: 10 },
        { wch: 14 },
        { wch: 16 },
        { wch: 16 },
        { wch: 18 },
        { wch: 14 },
        { wch: 12 },
        { wch: 14 },
        { wch: 18 },
        { wch: 20 },
        { wch: 22 },
        { wch: 35 },
      ];
      worksheet["!cols"] = colWidths;

      const dateStr = new Date().toISOString().split("T")[0];
      XLSX.writeFile(workbook, `Product_Report_${dateStr}.xlsx`);
      toast.success("Excel report exported successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to export Excel file");
    }
  };

  // ─── Export to PDF ─────────────────────────────────────────
  const handleExportPDF = () => {
    if (filteredProducts.length === 0) {
      toast.error("No product records to export");
      return;
    }

    try {
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      // Header
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text(settings.store_name || "HEALTHY FOOD POS", 14, 15);

      doc.setFontSize(11);
      doc.setTextColor(71, 85, 105);
      doc.text("PRODUCT MASTER REPORT — ALL CREATED PRODUCTS", 14, 22);

      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      const reportDate = formatCambodiaDate(new Date(), "datetime");
      doc.text(`Generated on: ${reportDate} (Cambodia Time / UTC+7)`, 14, 28);
      doc.text(
        `Total Products: ${kpis.totalCount} | Active: ${kpis.activeCount} | Total Stock: ${kpis.totalStock} units | Total Retail Valuation: $${kpis.totalRetailVal.toFixed(2)}`,
        14,
        33
      );

      const tableData = filteredProducts.map((p, idx) => [
        idx + 1,
        p.barcode || "—",
        p.name,
        categoryMap[p.category_id || ""] || "Uncategorized",
        p.status === "active" ? "Active" : "Inactive",
        `$${(p.cost || 0).toFixed(2)}`,
        `$${p.price.toFixed(2)}`,
        `${p.margin_percent.toFixed(1)}%`,
        p.current_stock,
        `$${p.total_retail_value.toFixed(2)}`,
        formatCambodiaDate(p.created_at, "date"),
      ]);

      autoTable(doc, {
        startY: 37,
        head: [
          [
            "#",
            "Barcode",
            "Product Name",
            "Category",
            "Status",
            "Cost ($)",
            "Price ($)",
            "Margin",
            "Stock",
            "Retail Value",
            "Created",
          ],
        ],
        body: tableData,
        theme: "striped",
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: "bold",
        },
        bodyStyles: {
          fontSize: 7.5,
          textColor: [51, 65, 85],
        },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 26, fontStyle: "bold" },
          2: { cellWidth: 55 },
          3: { cellWidth: 30 },
          4: { cellWidth: 16 },
          5: { cellWidth: 20, halign: "right" },
          6: { cellWidth: 20, halign: "right" },
          7: { cellWidth: 18, halign: "right" },
          8: { cellWidth: 16, halign: "center" },
          9: { cellWidth: 24, halign: "right" },
          10: { cellWidth: 24 },
        },
        margin: { left: 14, right: 14 },
      });

      const dateStr = new Date().toISOString().split("T")[0];
      doc.save(`Product_Report_${dateStr}.pdf`);
      toast.success("PDF report generated successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate PDF");
    }
  };

  // ─── Print Report ──────────────────────────────────────────
  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loading01Icon className="size-10 animate-spin text-primary" />
        <p className="text-sm font-semibold text-muted-foreground animate-pulse">
          Loading comprehensive product master records...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
      {/* ─── 1. Header & Quick Actions ──────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Package01Icon className="size-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                Product Report
                <Badge variant="outline" className="font-mono text-xs font-semibold px-2 py-0.5 bg-muted/60">
                  {processedProducts.length} created
                </Badge>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Complete catalog report of all products created in the system, pricing, margins, stock status & valuation.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="h-9 px-3 gap-1.5 font-bold text-xs rounded-xl border-border/80 shadow-2xs"
          >
            <Refresh01Icon className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>

          {/* Download Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3.5 gap-2 font-bold text-xs bg-card border-border/80 rounded-xl shadow-2xs hover:bg-muted/50 transition-all text-primary"
              >
                <Download04Icon className="size-4" />
                <span>Download Report</span>
                <ArrowDown01Icon className="size-3 opacity-60 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5 shadow-lg border-border/80">
              <DropdownMenuItem
                onClick={handleExportExcel}
                className="gap-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 cursor-pointer rounded-lg hover:bg-emerald-500/10 focus:bg-emerald-500/10 p-2"
              >
                <FileExportIcon className="size-4 text-emerald-600" />
                <div className="flex flex-col">
                  <span>Export to Excel</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Spreadsheet (.xlsx)</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportPDF}
                className="gap-2.5 text-xs font-semibold text-rose-700 dark:text-rose-400 cursor-pointer rounded-lg hover:bg-rose-500/10 focus:bg-rose-500/10 p-2"
              >
                <Download04Icon className="size-4 text-rose-600" />
                <div className="flex flex-col">
                  <span>Export to PDF</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Printable Document (.pdf)</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handlePrint}
                className="gap-2.5 text-xs font-semibold text-foreground cursor-pointer rounded-lg hover:bg-muted focus:bg-muted p-2"
              >
                <PrinterIcon className="size-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span>Print Document</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Direct Browser Print</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link href="/products">
            <Button
              size="sm"
              className="h-9 px-3.5 gap-1.5 font-bold text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-sm"
            >
              <SparklesIcon className="size-3.5" />
              <span>Manage Products</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* ─── 2. Top Summary KPI Metric Cards ────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Total Products */}
        <Card className="rounded-2xl border-border/70 shadow-xs bg-card/80 backdrop-blur-xs p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Total Products
            </span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600">
              <Package01Icon className="size-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-foreground">{kpis.totalCount}</div>
            <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
              {kpis.activeCount} active · {kpis.inactiveCount} inactive
            </div>
          </div>
        </Card>

        {/* Total Stock On-Hand */}
        <Card className="rounded-2xl border-border/70 shadow-xs bg-card/80 backdrop-blur-xs p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Total Stock Qty
            </span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600">
              <Layers01Icon className="size-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
              {kpis.totalStock.toLocaleString()}{" "}
              <span className="text-xs font-normal text-muted-foreground">units</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
              Across all warehouses
            </div>
          </div>
        </Card>

        {/* Total Retail Valuation */}
        <Card className="rounded-2xl border-border/70 shadow-xs bg-card/80 backdrop-blur-xs p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Retail Valuation
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
              <Dollar01Icon className="size-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              ${kpis.totalRetailVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
              ≈ {(kpis.totalRetailVal * exchangeRate).toLocaleString()} ៛
            </div>
          </div>
        </Card>

        {/* Total Cost Valuation */}
        <Card className="rounded-2xl border-border/70 shadow-xs bg-card/80 backdrop-blur-xs p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Cost Valuation
            </span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
              <Store01Icon className="size-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-foreground">
              ${kpis.totalCostVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
              Cost asset on-hand
            </div>
          </div>
        </Card>

        {/* Avg Profit Margin */}
        <Card className="rounded-2xl border-border/70 shadow-xs bg-card/80 backdrop-blur-xs p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Avg Margin
            </span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600">
              <ChartIncreaseIcon className="size-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
              ~{kpis.avgMargin.toFixed(1)}%
            </div>
            <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
              Potential profit: ${kpis.potentialGrossProfit.toFixed(2)}
            </div>
          </div>
        </Card>

        {/* Stock Health */}
        <Card className="rounded-2xl border-border/70 shadow-xs bg-card/80 backdrop-blur-xs p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Stock Status
            </span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600">
              <InformationCircleIcon className="size-4" />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-1 text-[11px]">
            <span className="font-bold text-emerald-600" title="In Stock (>5)">
              {kpis.inStockCount} In
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-bold text-amber-600" title="Low Stock (1-5)">
              {kpis.lowStockCount} Low
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-bold text-rose-600" title="Out of Stock (0)">
              {kpis.outOfStockCount} Out
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 mt-2 flex overflow-hidden">
            <div
              className="bg-emerald-500 h-full"
              style={{ width: `${kpis.totalCount > 0 ? (kpis.inStockCount / kpis.totalCount) * 100 : 0}%` }}
            />
            <div
              className="bg-amber-500 h-full"
              style={{ width: `${kpis.totalCount > 0 ? (kpis.lowStockCount / kpis.totalCount) * 100 : 0}%` }}
            />
            <div
              className="bg-rose-500 h-full"
              style={{ width: `${kpis.totalCount > 0 ? (kpis.outOfStockCount / kpis.totalCount) * 100 : 0}%` }}
            />
          </div>
        </Card>
      </div>

      {/* ─── 3. Navigation Tabs & Filters ────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/70 pb-3">
          <TabsList className="bg-muted/60 p-1 rounded-xl h-10 border border-border/60">
            <TabsTrigger value="catalog" className="text-xs font-bold rounded-lg px-4 gap-1.5 data-[state=active]:shadow-xs">
              <Package01Icon className="size-3.5" />
              <span>All Products List</span>
              <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1.5 font-mono">
                {filteredProducts.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="categories" className="text-xs font-bold rounded-lg px-4 gap-1.5 data-[state=active]:shadow-xs">
              <GridViewIcon className="size-3.5" />
              <span>Category Breakdown</span>
            </TabsTrigger>
          </TabsList>

          {/* Quick Clear Filter Info */}
          {(searchQuery || selectedCategoryId !== "all" || selectedStatus !== "all" || selectedStockFilter !== "all" || selectedMarginFilter !== "all") && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground font-medium">Filtered: <strong>{filteredProducts.length}</strong> of {processedProducts.length}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategoryId("all");
                  setSelectedStatus("all");
                  setSelectedStockFilter("all");
                  setSelectedMarginFilter("all");
                  setSortBy("created_desc");
                }}
                className="h-7 text-[11px] font-bold text-destructive hover:bg-destructive/10 px-2 rounded-lg"
              >
                Reset Filters
              </Button>
            </div>
          )}
        </div>

        {/* ─── Filters Toolbar ──────────────────────────────── */}
        <div className="p-3.5 rounded-2xl bg-card border border-border/70 shadow-2xs space-y-3 print:hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* 1. Search Bar */}
            <div className="relative sm:col-span-2 lg:col-span-2">
              <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, barcode, description..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 h-10 text-xs rounded-xl bg-background border-border/80"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                >
                  <Cancel01Icon className="size-3.5" />
                </button>
              )}
            </div>

            {/* 2. Category Filter */}
            <div>
              <Select
                value={selectedCategoryId}
                onValueChange={(val) => {
                  setSelectedCategoryId(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-10 text-xs font-semibold rounded-xl bg-background border-border/80">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="all" className="text-xs font-bold">
                    All Categories ({categories.length})
                  </SelectItem>
                  <SelectItem value="uncategorized" className="text-xs">
                    Uncategorized
                  </SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 3. Status Filter */}
            <div>
              <Select
                value={selectedStatus}
                onValueChange={(val) => {
                  setSelectedStatus(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-10 text-xs font-semibold rounded-xl bg-background border-border/80">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-bold">
                    All Status ({processedProducts.length})
                  </SelectItem>
                  <SelectItem value="active" className="text-xs text-emerald-600">
                    Active Only ({kpis.activeCount})
                  </SelectItem>
                  <SelectItem value="inactive" className="text-xs text-neutral-500">
                    Inactive Only ({kpis.inactiveCount})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 4. Stock Filter */}
            <div>
              <Select
                value={selectedStockFilter}
                onValueChange={(val) => {
                  setSelectedStockFilter(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-10 text-xs font-semibold rounded-xl bg-background border-border/80">
                  <SelectValue placeholder="Stock Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-bold">
                    All Stock Levels
                  </SelectItem>
                  <SelectItem value="in_stock" className="text-xs text-emerald-600">
                    In Stock (&gt;0) ({kpis.inStockCount + kpis.lowStockCount})
                  </SelectItem>
                  <SelectItem value="low_stock" className="text-xs text-amber-600">
                    Low Stock (1-5) ({kpis.lowStockCount})
                  </SelectItem>
                  <SelectItem value="out_of_stock" className="text-xs text-rose-600">
                    Out of Stock (0) ({kpis.outOfStockCount})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 5. Sort Order */}
            <div>
              <Select
                value={sortBy}
                onValueChange={(val) => {
                  setSortBy(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-10 text-xs font-semibold rounded-xl bg-background border-border/80">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_desc" className="text-xs">
                    Newest Created First
                  </SelectItem>
                  <SelectItem value="created_asc" className="text-xs">
                    Oldest Created First
                  </SelectItem>
                  <SelectItem value="name_asc" className="text-xs">
                    Name: A to Z
                  </SelectItem>
                  <SelectItem value="name_desc" className="text-xs">
                    Name: Z to A
                  </SelectItem>
                  <SelectItem value="price_desc" className="text-xs">
                    Price: High to Low
                  </SelectItem>
                  <SelectItem value="price_asc" className="text-xs">
                    Price: Low to High
                  </SelectItem>
                  <SelectItem value="stock_desc" className="text-xs">
                    Stock: High to Low
                  </SelectItem>
                  <SelectItem value="stock_asc" className="text-xs">
                    Stock: Low to High
                  </SelectItem>
                  <SelectItem value="margin_desc" className="text-xs">
                    Margin: High to Low
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ─── TAB 1: ALL PRODUCTS CATALOG TABLE ──────────────── */}
        <TabsContent value="catalog" className="space-y-4 m-0">
          <div className="rounded-2xl border border-border/70 bg-card shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50 border-b border-border/80">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12 text-center text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      #
                    </TableHead>
                    <TableHead className="w-16 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Photo
                    </TableHead>
                    <TableHead className="min-w-[220px] text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Product Name & Barcode
                    </TableHead>
                    <TableHead className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Category
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Cost ($)
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Selling Price ($)
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Margin
                    </TableHead>
                    <TableHead className="text-center text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Stock
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Total Valuation
                    </TableHead>
                    <TableHead className="text-center text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Created Date
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="h-44 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Package01Icon className="size-10 text-muted-foreground/40" />
                          <p className="font-bold text-sm text-foreground">No created products found</p>
                          <p className="text-xs text-muted-foreground">
                            Try adjusting your search query or filters.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedProducts.map((product, idx) => {
                      const absoluteIndex = (currentPage - 1) * (pageSize || filteredProducts.length) + idx + 1;
                      const imageSrc = product.thumbnails?.[0] || product.images?.[0];
                      const costVal = Number(product.cost || product.cost_recommand || 0);
                      const priceVal = Number(product.price || 0);
                      const isLowStock = product.current_stock > 0 && product.current_stock <= 5;
                      const isOutOfStock = product.current_stock <= 0;

                      return (
                        <TableRow
                          key={product.id}
                          onClick={() => handleRowClick(product)}
                          className="cursor-pointer hover:bg-muted/40 transition-colors group"
                        >
                          {/* Index */}
                          <TableCell className="text-center font-mono text-xs text-muted-foreground font-semibold">
                            {absoluteIndex}
                          </TableCell>

                          {/* Image Thumbnail (Optimized 150x150) */}
                          <TableCell>
                            <div className="relative size-12 rounded-xl overflow-hidden border border-border/80 bg-muted shrink-0 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                              {imageSrc ? (
                                <Image
                                  src={getOptimizedImageUrl(imageSrc, 150, 150)}
                                  alt={product.name}
                                  fill
                                  className="object-cover"
                                  sizes="48px"
                                />
                              ) : (
                                <Image01Icon className="size-5 text-muted-foreground/50" />
                              )}
                            </div>
                          </TableCell>

                          {/* Product Name & Barcode */}
                          <TableCell>
                            <div className="min-w-0">
                              <div className="font-bold text-sm text-foreground group-hover:text-primary transition-colors line-clamp-1">
                                {product.name}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-muted/70 text-primary border border-primary/20">
                                  <BarcodeScanIcon className="size-3" />
                                  {product.barcode}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(product.barcode, "barcode");
                                  }}
                                  className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Copy barcode"
                                >
                                  <Copy01Icon className="size-3" />
                                </button>
                              </div>
                            </div>
                          </TableCell>

                          {/* Category */}
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className="font-semibold text-[11px] bg-primary/10 text-primary border-primary/20"
                            >
                              {categoryMap[product.category_id || ""] || "Uncategorized"}
                            </Badge>
                          </TableCell>

                          {/* Cost Price */}
                          <TableCell className="text-right">
                            <div className="font-semibold text-xs text-foreground font-mono">
                              ${costVal.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {Math.round(costVal * exchangeRate).toLocaleString()} ៛
                            </div>
                          </TableCell>

                          {/* Selling Price */}
                          <TableCell className="text-right">
                            <div className="font-black text-xs text-emerald-600 dark:text-emerald-400 font-mono">
                              ${priceVal.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {Math.round(priceVal * exchangeRate).toLocaleString()} ៛
                            </div>
                          </TableCell>

                          {/* Profit Margin */}
                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold px-1.5 py-0.5 font-mono ${
                                product.unit_profit >= 0
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                  : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                              }`}
                            >
                              {product.unit_profit >= 0 ? "+" : ""}${product.unit_profit.toFixed(2)} ({product.margin_percent.toFixed(0)}%)
                            </Badge>
                          </TableCell>

                          {/* Stock */}
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                                isOutOfStock
                                  ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                                  : isLowStock
                                  ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                  : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                              }`}
                            >
                              {product.current_stock}
                            </Badge>
                          </TableCell>

                          {/* Valuation */}
                          <TableCell className="text-right">
                            <div className="font-bold text-xs text-foreground font-mono">
                              ${product.total_retail_value.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              Cost: ${product.total_cost_value.toFixed(2)}
                            </div>
                          </TableCell>

                          {/* Status */}
                          <TableCell className="text-center">
                            {product.status === "active" ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                <span className="size-2 rounded-full bg-emerald-500" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                                <span className="size-2 rounded-full bg-neutral-400" />
                                Inactive
                              </span>
                            )}
                          </TableCell>

                          {/* Created Date */}
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            <div className="font-medium text-foreground">
                              {formatCambodiaDate(product.created_at, "date")}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {formatCambodiaDate(product.created_at, "time")}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* ─── Pagination Footer ──────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 border-t border-border/70 bg-muted/30 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>Show</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(val) => {
                    setPageSize(Number(val));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-20 text-xs font-semibold rounded-lg bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="0">All</SelectItem>
                  </SelectContent>
                </Select>
                <span>items per page · Total <strong>{filteredProducts.length}</strong> products</span>
              </div>

              {pageSize > 0 && totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="h-8 px-2.5 text-xs font-bold rounded-lg"
                  >
                    Previous
                  </Button>
                  <span className="px-2 text-xs font-bold text-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="h-8 px-2.5 text-xs font-bold rounded-lg"
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ─── TAB 2: CATEGORY BREAKDOWN ──────────────────────── */}
        <TabsContent value="categories" className="space-y-6 m-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Category Breakdown Table */}
            <div className="lg:col-span-2 rounded-2xl border border-border/70 bg-card shadow-xs overflow-hidden">
              <div className="p-4 border-b border-border/80 bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GridViewIcon className="size-4 text-primary" />
                  <h3 className="font-bold text-sm text-foreground">Category Distribution Matrix</h3>
                </div>
                <Badge variant="outline" className="text-xs font-semibold">
                  {categoryAnalytics.length} Categories
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="text-[11px] font-black uppercase text-muted-foreground">Category</TableHead>
                      <TableHead className="text-center text-[11px] font-black uppercase text-muted-foreground">Products</TableHead>
                      <TableHead className="text-center text-[11px] font-black uppercase text-muted-foreground">Total Stock</TableHead>
                      <TableHead className="text-right text-[11px] font-black uppercase text-muted-foreground">Cost Value ($)</TableHead>
                      <TableHead className="text-right text-[11px] font-black uppercase text-muted-foreground">Retail Value ($)</TableHead>
                      <TableHead className="text-right text-[11px] font-black uppercase text-muted-foreground">Avg Price ($)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryAnalytics.map((cat, idx) => {
                      const avgPrice = cat.product_count > 0 ? cat.sum_price / cat.product_count : 0;
                      return (
                        <TableRow key={cat.id} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="font-bold text-xs text-foreground flex items-center gap-2">
                            <span
                              className="size-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                            />
                            <span>{cat.name}</span>
                          </TableCell>
                          <TableCell className="text-center font-bold text-xs">
                            <Badge variant="secondary" className="font-mono text-xs">
                              {cat.product_count}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-semibold text-xs font-mono">
                            {cat.total_stock}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono text-muted-foreground">
                            ${cat.total_cost_value.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-black text-xs font-mono text-emerald-600 dark:text-emerald-400">
                            ${cat.total_retail_value.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-xs font-mono">
                            ${avgPrice.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Right Col: Category Chart */}
            <Card className="rounded-2xl border-border/70 shadow-xs bg-card p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ChartIncreaseIcon className="size-4 text-primary" />
                  <h3 className="font-bold text-sm text-foreground">Top Categories by Product Count</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Visual distribution of products per category
                </p>

                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryChartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                      <XAxis type="number" textAnchor="end" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          borderColor: "var(--border)",
                          borderRadius: "0.75rem",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="products" radius={[0, 6, 6, 0]}>
                        {categoryChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-muted/40 border border-border/60 text-xs text-muted-foreground mt-4">
                <strong>Tip:</strong> Categorizing all products accurately improves stock tracking, sales reporting, and customer checkout speed on the POS Counter.
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── 4. Product Quick Detail Slide-over Sheet ────────── */}
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col bg-card">
          <SheetHeader className="p-5 border-b border-border/70 bg-muted/20">
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
              <Package01Icon className="size-4" />
              <span>Product Master Details</span>
            </div>
            <SheetTitle className="text-lg font-black text-foreground mt-1">
              {selectedProduct?.name}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Barcode: <span className="font-mono font-bold text-foreground">{selectedProduct?.barcode}</span>
            </SheetDescription>
          </SheetHeader>

          {selectedProduct && (
            <ScrollArea className="flex-1 p-5">
              <div className="space-y-5">
                {/* Image Showcase */}
                {(selectedProduct.images?.length > 0 || selectedProduct.thumbnails?.length > 0) && (
                  <div className="space-y-2.5">
                    <div className="relative rounded-2xl overflow-hidden border bg-muted aspect-square flex items-center justify-center shadow-xs">
                      <Image
                        src={getOptimizedImageUrl(
                          (selectedProduct.images && selectedProduct.images[selectedImageIndex]) ||
                            (selectedProduct.thumbnails && selectedProduct.thumbnails[selectedImageIndex]) ||
                            "",
                          500,
                          500
                        )}
                        alt={selectedProduct.name}
                        fill
                        className="object-contain p-4"
                        sizes="400px"
                      />
                    </div>

                    {/* Thumbnail strip */}
                    {(selectedProduct.images?.length > 1 || selectedProduct.thumbnails?.length > 1) && (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {(selectedProduct.images?.length > 0 ? selectedProduct.images : selectedProduct.thumbnails).map(
                          (url, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setSelectedImageIndex(idx)}
                              className={`relative size-14 rounded-xl overflow-hidden border-2 transition-all ${
                                selectedImageIndex === idx
                                  ? "border-primary ring-2 ring-primary/30"
                                  : "border-border/80 opacity-60 hover:opacity-100"
                              }`}
                            >
                              <Image
                                src={getOptimizedImageUrl(url, 150, 150)}
                                alt={`Thumb ${idx + 1}`}
                                fill
                                className="object-cover"
                              />
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Status & Category */}
                <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-muted/40 border">
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Category
                    </span>
                    <span className="font-bold text-xs text-foreground">
                      {categoryMap[selectedProduct.category_id || ""] || "Uncategorized"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block text-right">
                      Status
                    </span>
                    <Badge
                      variant={selectedProduct.status === "active" ? "default" : "secondary"}
                      className="text-[10px] font-bold"
                    >
                      {selectedProduct.status ? selectedProduct.status.toUpperCase() : "ACTIVE"}
                    </Badge>
                  </div>
                </div>

                {/* Pricing & Margins */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Dollar01Icon className="size-3.5 text-primary" />
                    <span>Pricing & Unit Profitability</span>
                  </span>

                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Cost */}
                    <div className="p-3 rounded-xl bg-muted/30 border">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Recommend Cost
                      </span>
                      <div className="text-base font-bold text-foreground mt-0.5">
                        ${(selectedProduct.cost || 0).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        ≈ {Math.round((selectedProduct.cost || 0) * exchangeRate).toLocaleString()} ៛
                      </div>
                    </div>

                    {/* Price */}
                    <div className="p-3 rounded-xl bg-muted/30 border">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Selling Price
                      </span>
                      <div className="text-base font-black text-emerald-600 mt-0.5">
                        ${selectedProduct.price.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        ≈ {Math.round(selectedProduct.price * exchangeRate).toLocaleString()} ៛
                      </div>
                    </div>
                  </div>

                  {/* Profit Margin Preview */}
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      Unit Margin / Gross Profit
                    </span>
                    <div className="text-right">
                      <div className="text-sm font-black text-emerald-700 dark:text-emerald-300 font-mono">
                        +${selectedProduct.unit_profit.toFixed(2)} ({selectedProduct.margin_percent.toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stock Across Warehouses */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Layers01Icon className="size-3.5 text-primary" />
                      <span>Current Inventory On-Hand</span>
                    </span>
                    <Badge variant="outline" className="font-bold text-xs font-mono">
                      {selectedProduct.current_stock} Total Units
                    </Badge>
                  </div>

                  <div className="space-y-1.5">
                    {selectedProduct.warehouse_stocks.map((wh) => (
                      <div
                        key={wh.warehouse_id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border text-xs"
                      >
                        <span className="font-medium text-muted-foreground">{wh.warehouse_name}</span>
                        <span className="font-bold text-foreground font-mono">
                          {wh.quantity} units
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Description if any */}
                {selectedProduct.description && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                      Description & Notes
                    </span>
                    <p className="text-xs text-foreground bg-muted/30 p-3 rounded-xl border leading-relaxed">
                      {selectedProduct.description}
                    </p>
                  </div>
                )}

                {/* Created Information */}
                <div className="p-3 rounded-xl bg-muted/20 border text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center justify-between">
                    <span>Created Date:</span>
                    <strong className="text-foreground">
                      {formatCambodiaDate(selectedProduct.created_at, "datetime")}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Product ID:</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {selectedProduct.id}
                    </span>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
