"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { getCategories, getProducts } from "@/lib/firebase/actions";
import { getStocks } from "@/lib/firebase/stock-actions";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import { Category, Product, Stock, StoreSettings } from "@/types";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GridViewIcon,
  Package01Icon,
  Search01Icon,
  Download04Icon,
  FileExportIcon,
  PrinterIcon,
  Loading01Icon,
  BarcodeScanIcon,
  Dollar01Icon,
  SparklesIcon,
  Refresh01Icon,
  Layers01Icon,
  ChartIncreaseIcon,
  Store01Icon,
  InformationCircleIcon,
  Cancel01Icon,
  ArrowDown01Icon,
  CheckmarkCircle01Icon,
  Image01Icon,
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
  PieChart,
  Pie,
} from "recharts";

interface CategoryReportItem {
  id: string;
  name: string;
  status: "active" | "inactive";
  created_at: Date;
  product_count: number;
  active_product_count: number;
  inactive_product_count: number;
  total_stock: number;
  total_cost_value: number;
  total_retail_value: number;
  avg_price: number;
  avg_cost: number;
  avg_margin: number;
  in_stock_count: number;
  low_stock_count: number;
  out_of_stock_count: number;
  products: ProductWithStockInfo[];
}

interface ProductWithStockInfo extends Product {
  current_stock: number;
  total_cost_value: number;
  total_retail_value: number;
  unit_profit: number;
  margin_percent: number;
}

const PALETTE = [
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
  "#e11d48",
  "#0284c7",
];

export default function CategoryReportPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedVolumeFilter, setSelectedVolumeFilter] = useState<string>("all");
  const [selectedStockFilter, setSelectedStockFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("products_desc");
  const [activeTab, setActiveTab] = useState<string>("categories");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Detail Sheet
  const [selectedCategory, setSelectedCategory] = useState<CategoryReportItem | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  const exchangeRate = settings.exchange_rate_khr || 4100;

  const loadData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [cats, prods, stks, conf] = await Promise.all([
        getCategories(),
        getProducts(),
        getStocks(),
        getStoreSettings(),
      ]);

      setCategories(cats);
      setProducts(prods);
      setStocks(stks);
      setSettings(conf);
      if (isRefresh) toast.success("Category report refreshed");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to load category report data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Processed Categories with aggregated products, stock, valuations, and margins
  const processedCategories: CategoryReportItem[] = useMemo(() => {
    // 1. Map current stock per product
    const stockMap: Record<string, number> = {};
    stocks.forEach((s) => {
      if (s.is_archived) return;
      const pid = s.product_id;
      stockMap[pid] = (stockMap[pid] || 0) + (Number(s.quantity) || 0);
    });

    // 2. Map products with computed fields
    const productWithStockList: ProductWithStockInfo[] = products.map((p) => {
      const currentStock = stockMap[p.id] || 0;
      const cost = Number(p.cost || p.cost_recommand || 0);
      const price = Number(p.price || 0);
      const unitProfit = price - cost;
      const marginPercent = price > 0 ? (unitProfit / price) * 100 : 0;
      const totalCostValue = currentStock * cost;
      const totalRetailValue = currentStock * price;

      return {
        ...p,
        current_stock: currentStock,
        total_cost_value: totalCostValue,
        total_retail_value: totalRetailValue,
        unit_profit: unitProfit,
        margin_percent: marginPercent,
      };
    });

    // 3. Group products by category ID
    const catGroups: Record<string, ProductWithStockInfo[]> = {};
    productWithStockList.forEach((p) => {
      const catId = p.category_id && p.category_id !== "none" ? p.category_id : "uncategorized";
      if (!catGroups[catId]) catGroups[catId] = [];
      catGroups[catId].push(p);
    });

    // 4. Build standard category report items
    const list: CategoryReportItem[] = categories.map((cat) => {
      const catProducts = catGroups[cat.id] || [];
      const prodCount = catProducts.length;
      const activeProdCount = catProducts.filter((p) => p.status === "active").length;
      const inactiveProdCount = prodCount - activeProdCount;

      let totalStock = 0;
      let totalCostVal = 0;
      let totalRetailVal = 0;
      let sumPrice = 0;
      let sumCost = 0;
      let inStockCount = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;

      catProducts.forEach((p) => {
        totalStock += p.current_stock;
        totalCostVal += p.total_cost_value;
        totalRetailVal += p.total_retail_value;
        sumPrice += p.price;
        sumCost += Number(p.cost || p.cost_recommand || 0);

        if (p.current_stock > 5) inStockCount++;
        else if (p.current_stock > 0) lowStockCount++;
        else outOfStockCount++;
      });

      const avgPrice = prodCount > 0 ? sumPrice / prodCount : 0;
      const avgCost = prodCount > 0 ? sumCost / prodCount : 0;
      const avgMargin = sumPrice > 0 ? ((sumPrice - sumCost) / sumPrice) * 100 : 0;

      return {
        id: cat.id,
        name: cat.name,
        status: cat.status || "active",
        created_at: cat.created_at || new Date(),
        product_count: prodCount,
        active_product_count: activeProdCount,
        inactive_product_count: inactiveProdCount,
        total_stock: totalStock,
        total_cost_value: totalCostVal,
        total_retail_value: totalRetailVal,
        avg_price: avgPrice,
        avg_cost: avgCost,
        avg_margin: avgMargin,
        in_stock_count: inStockCount,
        low_stock_count: lowStockCount,
        out_of_stock_count: outOfStockCount,
        products: catProducts,
      };
    });

    // 5. Add "Uncategorized" group if it contains products
    const uncategorizedProds = catGroups["uncategorized"] || [];
    if (uncategorizedProds.length > 0) {
      let totalStock = 0;
      let totalCostVal = 0;
      let totalRetailVal = 0;
      let sumPrice = 0;
      let sumCost = 0;
      let inStockCount = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;

      uncategorizedProds.forEach((p) => {
        totalStock += p.current_stock;
        totalCostVal += p.total_cost_value;
        totalRetailVal += p.total_retail_value;
        sumPrice += p.price;
        sumCost += Number(p.cost || p.cost_recommand || 0);

        if (p.current_stock > 5) inStockCount++;
        else if (p.current_stock > 0) lowStockCount++;
        else outOfStockCount++;
      });

      const avgPrice = uncategorizedProds.length > 0 ? sumPrice / uncategorizedProds.length : 0;
      const avgCost = uncategorizedProds.length > 0 ? sumCost / uncategorizedProds.length : 0;
      const avgMargin = sumPrice > 0 ? ((sumPrice - sumCost) / sumPrice) * 100 : 0;

      list.push({
        id: "uncategorized",
        name: "Uncategorized",
        status: "active",
        created_at: new Date(),
        product_count: uncategorizedProds.length,
        active_product_count: uncategorizedProds.filter((p) => p.status === "active").length,
        inactive_product_count: uncategorizedProds.filter((p) => p.status === "inactive").length,
        total_stock: totalStock,
        total_cost_value: totalCostVal,
        total_retail_value: totalRetailVal,
        avg_price: avgPrice,
        avg_cost: avgCost,
        avg_margin: avgMargin,
        in_stock_count: inStockCount,
        low_stock_count: lowStockCount,
        out_of_stock_count: outOfStockCount,
        products: uncategorizedProds,
      });
    }

    return list;
  }, [categories, products, stocks]);

  // Filtered & Sorted Categories
  const filteredCategories = useMemo(() => {
    let result = processedCategories.filter((cat) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = cat.name.toLowerCase().includes(q);
        const matchProds = cat.products.some(
          (p) => p.name.toLowerCase().includes(q) || (p.barcode || "").toLowerCase().includes(q)
        );
        if (!matchName && !matchProds) return false;
      }

      // Status
      if (selectedStatus !== "all") {
        if (cat.status !== selectedStatus) return false;
      }

      // Volume Filter
      if (selectedVolumeFilter === "has_products" && cat.product_count === 0) return false;
      if (selectedVolumeFilter === "empty" && cat.product_count > 0) return false;

      // Stock Filter
      if (selectedStockFilter === "has_stock" && cat.total_stock === 0) return false;
      if (selectedStockFilter === "out_of_stock" && cat.total_stock > 0) return false;

      return true;
    });

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "products_desc":
          return b.product_count - a.product_count;
        case "products_asc":
          return a.product_count - b.product_count;
        case "retail_desc":
          return b.total_retail_value - a.total_retail_value;
        case "retail_asc":
          return a.total_retail_value - b.total_retail_value;
        case "stock_desc":
          return b.total_stock - a.total_stock;
        case "stock_asc":
          return a.total_stock - b.total_stock;
        case "margin_desc":
          return b.avg_margin - a.avg_margin;
        case "name_asc":
          return a.name.localeCompare(b.name);
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "created_desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return b.product_count - a.product_count;
      }
    });

    return result;
  }, [processedCategories, searchQuery, selectedStatus, selectedVolumeFilter, selectedStockFilter, sortBy]);

  // Overall KPI Metrics
  const kpis = useMemo(() => {
    const totalCount = categories.length;
    const activeCount = categories.filter((c) => c.status !== "inactive").length;
    const inactiveCount = totalCount - activeCount;

    let totalProducts = 0;
    let totalStock = 0;
    let totalRetailVal = 0;
    let totalCostVal = 0;
    let sumMargin = 0;
    let validMarginCount = 0;

    processedCategories.forEach((c) => {
      totalProducts += c.product_count;
      totalStock += c.total_stock;
      totalRetailVal += c.total_retail_value;
      totalCostVal += c.total_cost_value;
      if (c.product_count > 0) {
        sumMargin += c.avg_margin;
        validMarginCount++;
      }
    });

    const avgMargin = validMarginCount > 0 ? sumMargin / validMarginCount : 0;
    const topCategory = [...processedCategories].sort((a, b) => b.total_retail_value - a.total_retail_value)[0];

    return {
      totalCount,
      activeCount,
      inactiveCount,
      totalProducts,
      totalStock,
      totalRetailVal,
      totalCostVal,
      avgMargin,
      topCategoryName: topCategory ? topCategory.name : "—",
      topCategoryValuation: topCategory ? topCategory.total_retail_value : 0,
    };
  }, [categories, processedCategories]);

  // Chart Data: Top Categories by Product Count
  const chartDataByProducts = useMemo(() => {
    return filteredCategories
      .filter((c) => c.product_count > 0)
      .slice(0, 8)
      .map((c, i) => ({
        name: c.name.length > 14 ? c.name.slice(0, 12) + "..." : c.name,
        products: c.product_count,
        stock: c.total_stock,
        retailValue: Math.round(c.total_retail_value),
        fill: PALETTE[i % PALETTE.length],
      }));
  }, [filteredCategories]);

  // Chart Data: Top Categories by Valuation
  const chartDataByValuation = useMemo(() => {
    return filteredCategories
      .filter((c) => c.total_retail_value > 0)
      .slice(0, 6)
      .map((c, i) => ({
        name: c.name,
        value: Math.round(c.total_retail_value),
        fill: PALETTE[i % PALETTE.length],
      }));
  }, [filteredCategories]);

  // Pagination Slice
  const totalPages = Math.ceil(filteredCategories.length / pageSize) || 1;
  const paginatedCategories = useMemo(() => {
    if (pageSize === 0) return filteredCategories;
    const start = (currentPage - 1) * pageSize;
    return filteredCategories.slice(start, start + pageSize);
  }, [filteredCategories, currentPage, pageSize]);

  const handleRowClick = (cat: CategoryReportItem) => {
    setSelectedCategory(cat);
    setDetailSheetOpen(true);
  };

  // ─── Export to Excel ───────────────────────────────────────
  const handleExportExcel = () => {
    if (filteredCategories.length === 0) {
      toast.error("No category records to export");
      return;
    }

    try {
      const dataRows = filteredCategories.map((c, idx) => ({
        "No.": idx + 1,
        "Category Name": c.name,
        "Status": c.status ? c.status.toUpperCase() : "ACTIVE",
        "Total Products": c.product_count,
        "Active Products": c.active_product_count,
        "Inactive Products": c.inactive_product_count,
        "Total Stock (Units)": c.total_stock,
        "Cost Valuation ($)": Number(c.total_cost_value.toFixed(2)),
        "Cost Valuation (៛)": Math.round(c.total_cost_value * exchangeRate),
        "Retail Valuation ($)": Number(c.total_retail_value.toFixed(2)),
        "Retail Valuation (៛)": Math.round(c.total_retail_value * exchangeRate),
        "Average Price ($)": Number(c.avg_price.toFixed(2)),
        "Average Margin (%)": Number(c.avg_margin.toFixed(1)),
        "In Stock Items": c.in_stock_count,
        "Low Stock Items": c.low_stock_count,
        "Out of Stock Items": c.out_of_stock_count,
        "Created Date": formatCambodiaDate(c.created_at, "datetime"),
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Categories Report");

      const colWidths = [
        { wch: 6 },
        { wch: 25 },
        { wch: 10 },
        { wch: 16 },
        { wch: 16 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 16 },
        { wch: 18 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
        { wch: 22 },
      ];
      worksheet["!cols"] = colWidths;

      const dateStr = new Date().toISOString().split("T")[0];
      XLSX.writeFile(workbook, `Category_Report_${dateStr}.xlsx`);
      toast.success("Excel report exported successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to export Excel file");
    }
  };

  // ─── Export to PDF ─────────────────────────────────────────
  const handleExportPDF = () => {
    if (filteredCategories.length === 0) {
      toast.error("No category records to export");
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
      doc.text("CATEGORY MASTER & PERFORMANCE REPORT", 14, 22);

      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      const reportDate = formatCambodiaDate(new Date(), "datetime");
      doc.text(`Generated on: ${reportDate} (Cambodia Time / UTC+7)`, 14, 28);
      doc.text(
        `Total Categories: ${kpis.totalCount} | Total Products Assigned: ${kpis.totalProducts} | Total Stock: ${kpis.totalStock} units | Total Retail Valuation: $${kpis.totalRetailVal.toFixed(2)}`,
        14,
        33
      );

      const tableData = filteredCategories.map((c, idx) => [
        idx + 1,
        c.name,
        c.status === "active" ? "Active" : "Inactive",
        c.product_count,
        c.active_product_count,
        c.total_stock,
        `$${c.total_cost_value.toFixed(2)}`,
        `$${c.total_retail_value.toFixed(2)}`,
        `$${c.avg_price.toFixed(2)}`,
        `${c.avg_margin.toFixed(1)}%`,
        formatCambodiaDate(c.created_at, "date"),
      ]);

      autoTable(doc, {
        startY: 37,
        head: [
          [
            "#",
            "Category Name",
            "Status",
            "Products",
            "Active",
            "Stock",
            "Cost Value",
            "Retail Value",
            "Avg Price",
            "Margin",
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
          1: { cellWidth: 45, fontStyle: "bold" },
          2: { cellWidth: 16 },
          3: { cellWidth: 18, halign: "center" },
          4: { cellWidth: 16, halign: "center" },
          5: { cellWidth: 18, halign: "center" },
          6: { cellWidth: 26, halign: "right" },
          7: { cellWidth: 28, halign: "right" },
          8: { cellWidth: 22, halign: "right" },
          9: { cellWidth: 18, halign: "right" },
          10: { cellWidth: 24 },
        },
        margin: { left: 14, right: 14 },
      });

      const dateStr = new Date().toISOString().split("T")[0];
      doc.save(`Category_Report_${dateStr}.pdf`);
      toast.success("PDF report generated successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate PDF");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loading01Icon className="size-10 animate-spin text-primary" />
        <p className="text-sm font-semibold text-muted-foreground animate-pulse">
          Loading comprehensive category master records...
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
              <GridViewIcon className="size-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                Category Report
                <Badge variant="outline" className="font-mono text-xs font-semibold px-2 py-0.5 bg-muted/60">
                  {categories.length} categories
                </Badge>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Complete performance report of all categories, product distribution, on-hand stock, valuation & average margins.
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

          <Link href="/categories">
            <Button
              size="sm"
              className="h-9 px-3.5 gap-1.5 font-bold text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-sm"
            >
              <SparklesIcon className="size-3.5" />
              <span>Manage Categories</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* ─── 2. Top Summary KPI Metric Cards ────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Total Categories */}
        <Card className="rounded-2xl border-border/70 shadow-xs bg-card/80 backdrop-blur-xs p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Total Categories
            </span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600">
              <GridViewIcon className="size-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-foreground">{kpis.totalCount}</div>
            <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
              {kpis.activeCount} active · {kpis.inactiveCount} inactive
            </div>
          </div>
        </Card>

        {/* Assigned Products */}
        <Card className="rounded-2xl border-border/70 shadow-xs bg-card/80 backdrop-blur-xs p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Assigned Items
            </span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600">
              <Package01Icon className="size-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
              {kpis.totalProducts}{" "}
              <span className="text-xs font-normal text-muted-foreground">products</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
              Catalog coverage
            </div>
          </div>
        </Card>

        {/* Total Stock */}
        <Card className="rounded-2xl border-border/70 shadow-xs bg-card/80 backdrop-blur-xs p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Total Stock Qty
            </span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600">
              <Layers01Icon className="size-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
              {kpis.totalStock.toLocaleString()}{" "}
              <span className="text-xs font-normal text-muted-foreground">units</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
              Across all categories
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

        {/* Cost Valuation */}
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
              Inventory asset cost
            </div>
          </div>
        </Card>

        {/* Top Category */}
        <Card className="rounded-2xl border-border/70 shadow-xs bg-card/80 backdrop-blur-xs p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Top Category
            </span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600">
              <ChartIncreaseIcon className="size-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-sm font-black text-foreground truncate" title={kpis.topCategoryName}>
              {kpis.topCategoryName}
            </div>
            <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              ${kpis.topCategoryValuation.toFixed(2)} valuation
            </div>
          </div>
        </Card>
      </div>

      {/* ─── 3. Navigation Tabs & Filters ────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/70 pb-3">
          <TabsList className="bg-muted/60 p-1 rounded-xl h-10 border border-border/60">
            <TabsTrigger value="categories" className="text-xs font-bold rounded-lg px-4 gap-1.5 data-[state=active]:shadow-xs">
              <GridViewIcon className="size-3.5" />
              <span>Categories Matrix</span>
              <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1.5 font-mono">
                {filteredCategories.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="text-xs font-bold rounded-lg px-4 gap-1.5 data-[state=active]:shadow-xs">
              <ChartIncreaseIcon className="size-3.5" />
              <span>Visual Analytics</span>
            </TabsTrigger>
          </TabsList>

          {/* Quick Clear Filter Info */}
          {(searchQuery || selectedStatus !== "all" || selectedVolumeFilter !== "all" || selectedStockFilter !== "all") && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground font-medium">
                Filtered: <strong>{filteredCategories.length}</strong> of {processedCategories.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedStatus("all");
                  setSelectedVolumeFilter("all");
                  setSelectedStockFilter("all");
                  setSortBy("products_desc");
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {/* 1. Search Bar */}
            <div className="relative sm:col-span-2 lg:col-span-2">
              <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search category name or products within..."
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

            {/* 2. Status Filter */}
            <div>
              <Select
                value={selectedStatus}
                onValueChange={(val) => {
                  setSelectedStatus(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-10 text-xs font-semibold rounded-xl bg-background border-border/80">
                  <SelectValue placeholder="Category Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-bold">
                    All Status
                  </SelectItem>
                  <SelectItem value="active" className="text-xs text-emerald-600">
                    Active Categories
                  </SelectItem>
                  <SelectItem value="inactive" className="text-xs text-neutral-500">
                    Inactive Categories
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 3. Volume Filter */}
            <div>
              <Select
                value={selectedVolumeFilter}
                onValueChange={(val) => {
                  setSelectedVolumeFilter(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-10 text-xs font-semibold rounded-xl bg-background border-border/80">
                  <SelectValue placeholder="Product Volume" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-bold">
                    All Volume
                  </SelectItem>
                  <SelectItem value="has_products" className="text-xs text-blue-600">
                    With Products (&gt;0)
                  </SelectItem>
                  <SelectItem value="empty" className="text-xs text-muted-foreground">
                    Empty Categories (0)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 4. Sort Order */}
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
                  <SelectItem value="products_desc" className="text-xs">
                    Most Products First
                  </SelectItem>
                  <SelectItem value="products_asc" className="text-xs">
                    Least Products First
                  </SelectItem>
                  <SelectItem value="retail_desc" className="text-xs">
                    Retail Value: High to Low
                  </SelectItem>
                  <SelectItem value="retail_asc" className="text-xs">
                    Retail Value: Low to High
                  </SelectItem>
                  <SelectItem value="stock_desc" className="text-xs">
                    Stock: High to Low
                  </SelectItem>
                  <SelectItem value="margin_desc" className="text-xs">
                    Margin: High to Low
                  </SelectItem>
                  <SelectItem value="name_asc" className="text-xs">
                    Name: A to Z
                  </SelectItem>
                  <SelectItem value="created_desc" className="text-xs">
                    Newest Created
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ─── TAB 1: CATEGORIES TABLE ────────────────────────── */}
        <TabsContent value="categories" className="space-y-4 m-0">
          <div className="rounded-2xl border border-border/70 bg-card shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50 border-b border-border/80">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12 text-center text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      #
                    </TableHead>
                    <TableHead className="min-w-[180px] text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Category Name
                    </TableHead>
                    <TableHead className="text-center text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="text-center text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Total Products
                    </TableHead>
                    <TableHead className="text-center text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Total Stock
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Cost Value ($)
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Retail Value ($)
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Avg Price ($)
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Avg Margin
                    </TableHead>
                    <TableHead className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Created Date
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedCategories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-44 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <GridViewIcon className="size-10 text-muted-foreground/40" />
                          <p className="font-bold text-sm text-foreground">No categories found</p>
                          <p className="text-xs text-muted-foreground">
                            Try adjusting your search query or filters.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedCategories.map((cat, idx) => {
                      const absoluteIndex = (currentPage - 1) * (pageSize || filteredCategories.length) + idx + 1;
                      const dotColor = PALETTE[idx % PALETTE.length];

                      return (
                        <TableRow
                          key={cat.id}
                          onClick={() => handleRowClick(cat)}
                          className="cursor-pointer hover:bg-muted/40 transition-colors group"
                        >
                          {/* Index */}
                          <TableCell className="text-center font-mono text-xs text-muted-foreground font-semibold">
                            {absoluteIndex}
                          </TableCell>

                          {/* Category Name */}
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <span className="size-3 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: dotColor }} />
                              <div>
                                <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors block">
                                  {cat.name}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {cat.active_product_count} active · {cat.inactive_product_count} inactive items
                                </span>
                              </div>
                            </div>
                          </TableCell>

                          {/* Status */}
                          <TableCell className="text-center">
                            {cat.status === "active" ? (
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

                          {/* Products Count */}
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="font-mono text-xs font-bold px-2.5 py-0.5">
                              {cat.product_count} items
                            </Badge>
                          </TableCell>

                          {/* Total Stock */}
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={`text-xs font-black font-mono px-2.5 py-0.5 rounded-full ${
                                cat.total_stock > 5
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                  : cat.total_stock > 0
                                  ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                  : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                              }`}
                            >
                              {cat.total_stock}
                            </Badge>
                          </TableCell>

                          {/* Cost Value */}
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            ${cat.total_cost_value.toFixed(2)}
                          </TableCell>

                          {/* Retail Value */}
                          <TableCell className="text-right font-mono">
                            <div className="font-black text-xs text-emerald-600 dark:text-emerald-400">
                              ${cat.total_retail_value.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              ≈ {Math.round(cat.total_retail_value * exchangeRate).toLocaleString()} ៛
                            </div>
                          </TableCell>

                          {/* Avg Price */}
                          <TableCell className="text-right font-mono text-xs font-semibold text-foreground">
                            ${cat.avg_price.toFixed(2)}
                          </TableCell>

                          {/* Avg Margin */}
                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold px-1.5 py-0.5 font-mono ${
                                cat.avg_margin >= 40
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                  : cat.avg_margin >= 0
                                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
                                  : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                              }`}
                            >
                              ~{cat.avg_margin.toFixed(0)}%
                            </Badge>
                          </TableCell>

                          {/* Created Date */}
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            <div className="font-medium text-foreground">
                              {formatCambodiaDate(cat.created_at, "date")}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Footer */}
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
                <span>categories per page · Total <strong>{filteredCategories.length}</strong> categories</span>
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

        {/* ─── TAB 2: VISUAL ANALYTICS ────────────────────────── */}
        <TabsContent value="analytics" className="space-y-6 m-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Product Volume by Category */}
            <Card className="rounded-2xl border-border/70 shadow-xs bg-card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Package01Icon className="size-4 text-primary" />
                <h3 className="font-bold text-sm text-foreground">Product Distribution by Category</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Total number of products assigned per category
              </p>

              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDataByProducts} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                    <XAxis type="number" textAnchor="end" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" width={85} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        borderColor: "var(--border)",
                        borderRadius: "0.75rem",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="products" radius={[0, 6, 6, 0]}>
                      {chartDataByProducts.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Chart 2: Retail Valuation Distribution */}
            <Card className="rounded-2xl border-border/70 shadow-xs bg-card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Dollar01Icon className="size-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-foreground">Inventory Valuation Share ($)</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Retail inventory valuation breakdown across top categories
              </p>

              <div className="h-[300px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      formatter={(val: any) => [`$${Number(val).toLocaleString()}`, "Retail Value"]}
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        borderColor: "var(--border)",
                        borderRadius: "0.75rem",
                        fontSize: "12px",
                      }}
                    />
                    <Pie
                      data={chartDataByValuation}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={105}
                      innerRadius={55}
                      paddingAngle={4}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {chartDataByValuation.map((entry, index) => (
                        <Cell key={`pie-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── 4. Category Detail Drawer (Slide-over Sheet) ───── */}
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent className="w-full sm:max-w-md md:max-w-xl p-0 flex flex-col bg-card">
          <SheetHeader className="p-5 border-b border-border/70 bg-muted/20">
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
              <GridViewIcon className="size-4" />
              <span>Category Products Breakdown</span>
            </div>
            <SheetTitle className="text-lg font-black text-foreground mt-1">
              {selectedCategory?.name}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {selectedCategory?.product_count} products · {selectedCategory?.total_stock} stock units · Retail Value: ${selectedCategory?.total_retail_value.toFixed(2)}
            </SheetDescription>
          </SheetHeader>

          {selectedCategory && (
            <ScrollArea className="flex-1 p-5">
              <div className="space-y-4">
                {/* Category Metric Highlights */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-muted/30 border text-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Products</span>
                    <span className="text-lg font-black text-foreground">{selectedCategory.product_count}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/30 border text-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Stock Qty</span>
                    <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">{selectedCategory.total_stock}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/30 border text-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Avg Margin</span>
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">~{selectedCategory.avg_margin.toFixed(0)}%</span>
                  </div>
                </div>

                {/* Products List inside this Category */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Package01Icon className="size-3.5 text-primary" />
                    <span>Products in &quot;{selectedCategory.name}&quot; ({selectedCategory.products.length})</span>
                  </span>

                  {selectedCategory.products.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed text-center text-xs text-muted-foreground">
                      No products assigned to this category yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedCategory.products.map((prod) => {
                        const img = prod.thumbnails?.[0] || prod.images?.[0];
                        return (
                          <div
                            key={prod.id}
                            className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/20 border hover:bg-muted/40 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative size-11 rounded-lg overflow-hidden border bg-muted shrink-0 flex items-center justify-center">
                                {img ? (
                                  <Image
                                    src={getOptimizedImageUrl(img, 150, 150)}
                                    alt={prod.name}
                                    fill
                                    className="object-cover"
                                    sizes="44px"
                                  />
                                ) : (
                                  <Image01Icon className="size-4 text-muted-foreground/50" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-xs text-foreground truncate">{prod.name}</p>
                                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{prod.barcode}</p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="font-black text-xs text-emerald-600 font-mono">
                                ${prod.price.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-semibold">
                                {prod.current_stock} in stock
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
