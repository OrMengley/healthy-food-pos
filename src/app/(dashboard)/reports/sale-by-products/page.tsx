"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { getSaleInvoices } from "@/lib/firebase/sale-actions";
import { getProducts, getCategories, getUsers } from "@/lib/firebase/actions";
import { getStocks } from "@/lib/firebase/stock-actions";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import { SaleInvoice, Product, Category, User, Stock, StoreSettings } from "@/types";
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
  GridViewIcon,
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
  ArrowUp01Icon,
  ArrowDown01Icon,
  InformationCircleIcon,
  Layers01Icon,
  SparklesIcon,
  Invoice01Icon,
  Alert02Icon,
  CheckmarkCircle01Icon,
} from "hugeicons-react";
import {
  formatCambodiaDate,
  getCambodiaDateString,
  getCambodiaDateParts,
  isTodayCambodia,
  isYesterdayCambodia,
  isThisMonthCambodia,
  parseFirestoreDate,
  getOptimizedImageUrl,
} from "@/lib/utils";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
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

type SortField = "revenue" | "units" | "profit" | "margin" | "stock" | "name";
type ChartMetric = "revenue" | "units" | "profit";
type ViewFilter = "all" | "top20" | "high_margin" | "low_margin" | "unsold";

interface ProductSaleTransaction {
  invoiceId: string;
  invoiceNumber: string;
  date: Date;
  customerName: string;
  customerPhone?: string;
  customerType: string;
  cashierName: string;
  quantity: number;
  price: number;
  cost: number;
  discount: number;
  itemTotal: number;
  itemCost: number;
  profit: number;
  margin: number;
  paymentMethod: string;
  totalInvoiceAmount: number;
  totalInvoiceItemsCount: number;
  invoice: SaleInvoice;
}

interface ProductSalesRecord {
  productId: string;
  name: string;
  barcode: string;
  image?: string;
  categoryId: string;
  categoryName: string;
  currentStock: number;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock";
  unitsSold: number;
  cost: number;
  avgPrice: number;
  totalCost: number;
  totalRevenue: number;
  grossProfit: number;
  profitMargin: number;
  revenueShare: number;
  invoicesCount: number;
  transactions: ProductSaleTransaction[];
}

const PRODUCT_CHART_COLORS = [
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

export default function SaleByProductsReportPage() {
  const { user, role } = useAuth();
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Filters & State
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("this_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [cashierFilter, setCashierFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortField>("revenue");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("revenue");

  // Product Drill-Down Modal State & Filters
  const [viewingProduct, setViewingProduct] = useState<ProductSalesRecord | null>(null);
  const [drillDownModalOpen, setDrillDownModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const [modalPaymentFilter, setModalPaymentFilter] = useState("all");
  const [modalChannelFilter, setModalChannelFilter] = useState("all");
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  // Receipt Modal for individual invoice preview
  const [receiptInvoice, setReceiptInvoice] = useState<SaleInvoice | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [invs, prods, cats, stks, usrs, storeConfig] = await Promise.all([
        getSaleInvoices(),
        getProducts(),
        getCategories(),
        getStocks(),
        getUsers(),
        getStoreSettings(),
      ]);
      setInvoices(invs);
      setProducts(prods);
      setCategories(cats);
      setStocks(stks);
      setUsers(usrs);
      setSettings(storeConfig);
    } catch (error) {
      console.error("Failed to load sale by products data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const exchangeRate = settings.exchange_rate_khr || 4100;

  // Category Map
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  // Product Map
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  // Stock on Hand Map (sum quantity across non-archived stocks per product)
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    stocks.forEach((s) => {
      if (s.is_archived) return;
      const pid = s.product_id;
      if (!pid) return;
      const current = map.get(pid) || 0;
      map.set(pid, current + Number(s.quantity || 0));
    });
    return map;
  }, [stocks]);

  // Filtered Invoices by Date, Payment Method, Cashier, and Sales Channel
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (inv.is_archived || inv.status === "not paid") return false;

      // Payment Method Filter
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

  // Total Period Product Revenue
  const totalPeriodRevenue = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => {
      const itemsRev = inv.items?.reduce((s, it) => s + Number(it.total_price || 0), 0) || 0;
      return sum + itemsRev;
    }, 0);
  }, [filteredInvoices]);

  // Aggregation by Product
  const productSalesList = useMemo(() => {
    const prodMap = new Map<
      string,
      {
        productId: string;
        name: string;
        barcode: string;
        image?: string;
        categoryId: string;
        categoryName: string;
        currentStock: number;
        stockStatus: "in_stock" | "low_stock" | "out_of_stock";
        unitsSold: number;
        cost: number;
        totalCost: number;
        totalRevenue: number;
        invoicesSet: Set<string>;
        transactions: ProductSaleTransaction[];
      }
    >();

    // 1. Initialize all active catalog products
    products.forEach((p) => {
      if (p.is_archived) return;
      const cat = p.category_id ? categoryMap.get(p.category_id) : undefined;
      const currentStock = stockMap.get(p.id) || 0;
      const stockStatus: "in_stock" | "low_stock" | "out_of_stock" =
        currentStock <= 0 ? "out_of_stock" : currentStock <= 5 ? "low_stock" : "in_stock";

      const defaultCost = Number(p.cost || p.cost_recommand || 0);

      prodMap.set(p.id, {
        productId: p.id,
        name: p.name,
        barcode: p.barcode || "-",
        image: p.thumbnails?.[0] || p.images?.[0] || "",
        categoryId: p.category_id || "uncategorized",
        categoryName: cat?.name || "General",
        currentStock,
        stockStatus,
        unitsSold: 0,
        cost: defaultCost,
        totalCost: 0,
        totalRevenue: 0,
        invoicesSet: new Set<string>(),
        transactions: [],
      });
    });

    // 2. Accumulate sales from filtered invoices
    filteredInvoices.forEach((inv) => {
      inv.items?.forEach((item) => {
        const prodId = item.product_id;
        const catalogProd = prodId ? productMap.get(prodId) : undefined;
        const key = prodId || item.product_name;

        if (!prodMap.has(key)) {
          const cat = catalogProd?.category_id ? categoryMap.get(catalogProd.category_id) : undefined;
          const currentStock = prodId ? stockMap.get(prodId) || 0 : 0;
          const stockStatus: "in_stock" | "low_stock" | "out_of_stock" =
            currentStock <= 0 ? "out_of_stock" : currentStock <= 5 ? "low_stock" : "in_stock";

          prodMap.set(key, {
            productId: prodId || key,
            name: item.product_name || catalogProd?.name || "Unknown Product",
            barcode: item.product_barcode || catalogProd?.barcode || "-",
            image: item.product_image || catalogProd?.thumbnails?.[0] || catalogProd?.images?.[0] || "",
            categoryId: catalogProd?.category_id || "uncategorized",
            categoryName: cat?.name || "General",
            currentStock,
            stockStatus,
            unitsSold: 0,
            cost: Number(item.cost || catalogProd?.cost || catalogProd?.cost_recommand || 0),
            totalCost: 0,
            totalRevenue: 0,
            invoicesSet: new Set<string>(),
            transactions: [],
          });
        }

        const data = prodMap.get(key)!;
        const qty = Number(item.quantity || 0);
        const itemRevenue = Number(item.total_price || (item.price * qty) || 0);
        // Cost: prioritize item.cost if available & positive, otherwise catalog cost
        const unitCost = Number(item.cost || data.cost || catalogProd?.cost || catalogProd?.cost_recommand || 0);
        const itemCost = unitCost * qty;
        const profit = itemRevenue - itemCost;
        const margin = itemRevenue > 0 ? (profit / itemRevenue) * 100 : 0;

        data.unitsSold += qty;
        data.totalRevenue += itemRevenue;
        data.totalCost += itemCost;
        data.cost = unitCost;
        data.invoicesSet.add(inv.id);

        data.transactions.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number || inv.id.slice(-6).toUpperCase(),
          date: parseFirestoreDate(inv.created_at),
          customerName: inv.customer_name || (inv.customer_type === "online" ? "Online Customer" : "Walk-in Customer"),
          customerPhone: inv.customer_phone || "",
          customerType: inv.customer_type || "walk_in",
          cashierName: inv.created_by_name || "Admin",
          quantity: qty,
          price: Number(item.price || 0),
          cost: unitCost,
          discount: Number(item.discount || 0),
          itemTotal: itemRevenue,
          itemCost: itemCost,
          profit,
          margin,
          paymentMethod: inv.payment_method,
          totalInvoiceAmount: Number(inv.total_price || 0),
          totalInvoiceItemsCount: inv.items?.length || 1,
          invoice: inv,
        });
      });
    });

    // 3. Compute derived financial metrics
    let list: ProductSalesRecord[] = Array.from(prodMap.values()).map((p) => {
      const profit = p.totalRevenue - p.totalCost;
      const margin = p.totalRevenue > 0 ? (profit / p.totalRevenue) * 100 : 0;
      const avgPrice = p.unitsSold > 0 ? p.totalRevenue / p.unitsSold : 0;
      const share = totalPeriodRevenue > 0 ? (p.totalRevenue / totalPeriodRevenue) * 100 : 0;

      // Sort individual product transactions descending by date
      const sortedTransactions = [...p.transactions].sort((a, b) => b.date.getTime() - a.date.getTime());

      return {
        productId: p.productId,
        name: p.name,
        barcode: p.barcode,
        image: p.image,
        categoryId: p.categoryId,
        categoryName: p.categoryName,
        currentStock: p.currentStock,
        stockStatus: p.stockStatus,
        unitsSold: p.unitsSold,
        cost: p.cost,
        avgPrice,
        totalCost: p.totalCost,
        totalRevenue: p.totalRevenue,
        grossProfit: profit,
        profitMargin: margin,
        revenueShare: share,
        invoicesCount: p.invoicesSet.size,
        transactions: sortedTransactions,
      };
    });

    // Filter by Category Dropdown
    if (categoryFilter !== "all") {
      list = list.filter((p) => p.categoryId === categoryFilter);
    }

    // Filter by Stock Status Dropdown
    if (stockStatusFilter !== "all") {
      list = list.filter((p) => p.stockStatus === stockStatusFilter);
    }

    // Quick View Filter
    if (viewFilter === "unsold") {
      list = list.filter((p) => p.unitsSold === 0);
    } else {
      // By default for all sold tabs, filter to products with sales
      list = list.filter((p) => p.unitsSold > 0);

      if (viewFilter === "high_margin") {
        list = list.filter((p) => p.profitMargin >= 40);
      } else if (viewFilter === "low_margin") {
        list = list.filter((p) => p.profitMargin < 20);
      }
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q)
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
        valA = a.unitsSold;
        valB = b.unitsSold;
      } else if (sortBy === "profit") {
        valA = a.grossProfit;
        valB = b.grossProfit;
      } else if (sortBy === "margin") {
        valA = a.profitMargin;
        valB = b.profitMargin;
      } else if (sortBy === "stock") {
        valA = a.currentStock;
        valB = b.currentStock;
      } else {
        return sortOrder === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      return sortOrder === "desc" ? valB - valA : valA - valB;
    });

    // If Top 20 is selected
    if (viewFilter === "top20") {
      list = list.slice(0, 20);
    }

    return list;
  }, [
    products,
    filteredInvoices,
    productMap,
    categoryMap,
    stockMap,
    totalPeriodRevenue,
    categoryFilter,
    stockStatusFilter,
    viewFilter,
    searchQuery,
    sortBy,
    sortOrder,
  ]);

  // Overall Financial KPIs
  const kpi = useMemo(() => {
    let totalRevenueUsd = 0;
    let totalCostUsd = 0;
    let totalUnits = 0;
    let totalStockOnHand = 0;
    let activeProductsCount = 0;

    productSalesList.forEach((p) => {
      totalRevenueUsd += p.totalRevenue;
      totalCostUsd += p.totalCost;
      totalUnits += p.unitsSold;
      totalStockOnHand += p.currentStock;
      if (p.unitsSold > 0) activeProductsCount++;
    });

    const grossProfitUsd = totalRevenueUsd - totalCostUsd;
    const marginPct = totalRevenueUsd > 0 ? (grossProfitUsd / totalRevenueUsd) * 100 : 0;
    const avgSellingPriceUsd = totalUnits > 0 ? totalRevenueUsd / totalUnits : 0;
    const topProduct = productSalesList.length > 0 ? productSalesList[0] : null;

    return {
      totalRevenueUsd,
      totalRevenueKhr: Math.round(totalRevenueUsd * exchangeRate),
      totalCostUsd,
      grossProfitUsd,
      marginPct,
      totalUnits,
      avgSellingPriceUsd,
      activeProductsCount,
      totalStockOnHand,
      topProduct,
    };
  }, [productSalesList, exchangeRate]);

  // Chart Data: Top 10 Products by Selected Metric
  const chartData = useMemo(() => {
    const listToChart = [...productSalesList].filter((p) => p.unitsSold > 0);

    listToChart.sort((a, b) => {
      if (chartMetric === "revenue") return b.totalRevenue - a.totalRevenue;
      if (chartMetric === "units") return b.unitsSold - a.unitsSold;
      return b.grossProfit - a.grossProfit;
    });

    return listToChart.slice(0, 10).map((p, idx) => ({
      name: p.name.length > 15 ? `${p.name.slice(0, 13)}...` : p.name,
      fullName: p.name,
      value:
        chartMetric === "revenue"
          ? Number(p.totalRevenue.toFixed(2))
          : chartMetric === "units"
          ? p.unitsSold
          : Number(p.grossProfit.toFixed(2)),
      revenue: Number(p.totalRevenue.toFixed(2)),
      units: p.unitsSold,
      profit: Number(p.grossProfit.toFixed(2)),
      color: PRODUCT_CHART_COLORS[idx % PRODUCT_CHART_COLORS.length],
    }));
  }, [productSalesList, chartMetric]);

  // Excel (.xlsx) Export
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Product Sales Summary
    const prodHeaders = [
      "#",
      "Product Name",
      "Barcode",
      "Category",
      "Stock on Hand",
      "Stock Status",
      "Units Sold",
      "Orders Count",
      "Avg Selling Price ($)",
      "Unit Cost ($)",
      "Gross Sales ($)",
      "Gross Sales (KHR)",
      "Total Cost ($)",
      "Gross Profit ($)",
      "Margin (%)",
      "Revenue Share (%)",
    ];

    const prodRows = productSalesList.map((p, idx) => [
      idx + 1,
      p.name,
      p.barcode,
      p.categoryName,
      p.currentStock,
      p.stockStatus === "in_stock" ? "In Stock" : p.stockStatus === "low_stock" ? "Low Stock" : "Out of Stock",
      p.unitsSold,
      p.invoicesCount,
      Number(p.avgPrice.toFixed(2)),
      Number(p.cost.toFixed(2)),
      Number(p.totalRevenue.toFixed(2)),
      Math.round(p.totalRevenue * exchangeRate),
      Number(p.totalCost.toFixed(2)),
      Number(p.grossProfit.toFixed(2)),
      `${p.profitMargin.toFixed(1)}%`,
      `${p.revenueShare.toFixed(1)}%`,
    ]);

    // Grand Totals Row
    prodRows.push([
      "TOTAL",
      `${productSalesList.length} Products`,
      "",
      "",
      kpi.totalStockOnHand,
      "",
      kpi.totalUnits,
      filteredInvoices.length,
      Number(kpi.avgSellingPriceUsd.toFixed(2)),
      "",
      Number(kpi.totalRevenueUsd.toFixed(2)),
      kpi.totalRevenueKhr,
      Number(kpi.totalCostUsd.toFixed(2)),
      Number(kpi.grossProfitUsd.toFixed(2)),
      `${kpi.marginPct.toFixed(1)}%`,
      "100%",
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet([prodHeaders, ...prodRows]);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Product Sales Summary");

    // Sheet 2: Itemized Transactions Log
    const itemHeaders = [
      "#",
      "Invoice #",
      "Date (Cambodia ICT)",
      "Product Name",
      "Barcode",
      "Category",
      "Customer",
      "Channel",
      "Cashier",
      "Qty Sold",
      "Unit Price ($)",
      "Discount ($)",
      "Line Total ($)",
      "Line Cost ($)",
      "Line Profit ($)",
      "Payment Method",
    ];

    const itemRows: any[] = [];
    let counter = 1;
    productSalesList.forEach((p) => {
      p.transactions.forEach((tx) => {
        const lineProfit = tx.itemTotal - tx.itemCost;
        itemRows.push([
          counter++,
          tx.invoiceNumber,
          formatCambodiaDate(tx.date, "invoice"),
          p.name,
          p.barcode,
          p.categoryName,
          tx.customerName,
          tx.customerType === "online" ? "Online / Delivery" : "Walk-in Counter",
          tx.cashierName,
          tx.quantity,
          Number(tx.price.toFixed(2)),
          Number(tx.discount.toFixed(2)),
          Number(tx.itemTotal.toFixed(2)),
          Number(tx.itemCost.toFixed(2)),
          Number(lineProfit.toFixed(2)),
          tx.paymentMethod.toUpperCase(),
        ]);
      });
    });

    const wsTransactions = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]);
    XLSX.utils.book_append_sheet(wb, wsTransactions, "Itemized Sales Log");

    XLSX.writeFile(
      wb,
      `HealthyFood_Sale_By_Products_${formatCambodiaDate(new Date(), "code")}.xlsx`
    );
  };

  // PDF Export
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Emerald Header Banner
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 0, pageWidth, 18, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`${settings.store_name || "HEALTHY FOOD POS"} - SALE BY PRODUCTS REPORT`, 14, 11.5);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${formatCambodiaDate(new Date(), "invoice")} (ICT)`, pageWidth - 14, 11.5, {
      align: "right",
    });

    const head = [
      [
        "#",
        "Product Name",
        "Barcode",
        "Category",
        "Stock",
        "Units Sold",
        "Avg Price",
        "Gross Sales ($)",
        "Gross Sales (KHR)",
        "Cost ($)",
        "Profit ($)",
        "Margin (%)",
        "Share (%)",
      ],
    ];

    const body = productSalesList.map((p, idx) => [
      idx + 1,
      p.name,
      p.barcode,
      p.categoryName,
      p.currentStock,
      p.unitsSold,
      `$${p.avgPrice.toFixed(2)}`,
      `$${p.totalRevenue.toFixed(2)}`,
      `${Math.round(p.totalRevenue * exchangeRate).toLocaleString()} R`,
      `$${p.totalCost.toFixed(2)}`,
      `$${p.grossProfit.toFixed(2)}`,
      `${p.profitMargin.toFixed(1)}%`,
      `${p.revenueShare.toFixed(1)}%`,
    ]);

    // Summary row
    body.push([
      "TOTAL",
      `${productSalesList.length} Products`,
      "",
      "",
      kpi.totalStockOnHand,
      kpi.totalUnits,
      `$${kpi.avgSellingPriceUsd.toFixed(2)}`,
      `$${kpi.totalRevenueUsd.toFixed(2)}`,
      `${kpi.totalRevenueKhr.toLocaleString()} R`,
      `$${kpi.totalCostUsd.toFixed(2)}`,
      `$${kpi.grossProfitUsd.toFixed(2)}`,
      `${kpi.marginPct.toFixed(1)}%`,
      "100%",
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 24,
      theme: "striped",
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.5,
      },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 12, right: 12 },
    });

    doc.save(`HealthyFood_Sale_By_Products_${formatCambodiaDate(new Date(), "code")}.pdf`);
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = [
      "Product Name",
      "Barcode",
      "Category",
      "Stock on Hand",
      "Units Sold",
      "Invoices Count",
      "Avg Price ($)",
      "Unit Cost ($)",
      "Gross Sales ($)",
      "Gross Sales (KHR)",
      "Total Cost ($)",
      "Gross Profit ($)",
      "Margin (%)",
      "Revenue Share (%)",
    ];

    const rows = productSalesList.map((p) => [
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.barcode}"`,
      `"${p.categoryName.replace(/"/g, '""')}"`,
      p.currentStock,
      p.unitsSold,
      p.invoicesCount,
      p.avgPrice.toFixed(2),
      p.cost.toFixed(2),
      p.totalRevenue.toFixed(2),
      Math.round(p.totalRevenue * exchangeRate),
      p.totalCost.toFixed(2),
      p.grossProfit.toFixed(2),
      `${p.profitMargin.toFixed(1)}%`,
      `${p.revenueShare.toFixed(1)}%`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `HealthyFood_Sale_By_Products_${formatCambodiaDate(new Date(), "code")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered transactions for the Product Drill-Down Modal
  const filteredModalTransactions = useMemo(() => {
    if (!viewingProduct) return [];
    return viewingProduct.transactions.filter((tx) => {
      // Payment Filter
      if (modalPaymentFilter !== "all" && tx.paymentMethod !== modalPaymentFilter) {
        return false;
      }
      // Channel Filter
      if (modalChannelFilter !== "all") {
        const ct = (tx.customerType || "walk_in").toLowerCase();
        if (modalChannelFilter === "walk_in" && ct !== "walk_in") return false;
        if (modalChannelFilter === "online" && ct !== "online") return false;
      }
      // Search
      if (modalSearch.trim()) {
        const q = modalSearch.toLowerCase().trim();
        const matchesInvoice = tx.invoiceNumber.toLowerCase().includes(q);
        const matchesCustomer = tx.customerName.toLowerCase().includes(q);
        const matchesPhone = tx.customerPhone && tx.customerPhone.toLowerCase().includes(q);
        const matchesCashier = tx.cashierName.toLowerCase().includes(q);
        return matchesInvoice || matchesCustomer || matchesPhone || matchesCashier;
      }
      return true;
    });
  }, [viewingProduct, modalSearch, modalPaymentFilter, modalChannelFilter]);

  // Modal Totals across filtered transactions
  const modalTotals = useMemo(() => {
    let totalQty = 0;
    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalDiscount = 0;
    filteredModalTransactions.forEach((tx) => {
      totalQty += tx.quantity;
      totalRevenue += tx.itemTotal;
      totalCost += tx.itemCost;
      totalProfit += tx.profit;
      totalDiscount += tx.discount;
    });
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    return { totalQty, totalRevenue, totalCost, totalProfit, totalDiscount, avgMargin };
  }, [filteredModalTransactions]);

  // Export individual product transactions to Excel (.xlsx)
  const handleExportSingleProductExcel = (record: ProductSalesRecord) => {
    const wb = XLSX.utils.book_new();
    const headers = [
      "#",
      "Invoice #",
      "Date (Cambodia ICT)",
      "Customer",
      "Phone",
      "Channel",
      "Cashier",
      "Qty Sold",
      "Selling Price ($)",
      "Discount ($)",
      "Line Total ($)",
      "Unit Cost ($)",
      "Line Cost ($)",
      "Line Profit ($)",
      "Margin (%)",
      "Payment Method",
      "Bill Total ($)",
    ];
    const rows = record.transactions.map((tx, idx) => [
      idx + 1,
      tx.invoiceNumber,
      formatCambodiaDate(tx.date, "invoice"),
      tx.customerName,
      tx.customerPhone || "—",
      tx.customerType === "online" ? "Online Delivery" : "Walk-in Counter",
      tx.cashierName,
      tx.quantity,
      Number(tx.price.toFixed(2)),
      Number(tx.discount.toFixed(2)),
      Number(tx.itemTotal.toFixed(2)),
      Number(tx.cost.toFixed(2)),
      Number(tx.itemCost.toFixed(2)),
      Number(tx.profit.toFixed(2)),
      `${tx.margin.toFixed(1)}%`,
      tx.paymentMethod.toUpperCase(),
      Number(tx.totalInvoiceAmount.toFixed(2)),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, "Sales Audit Log");
    XLSX.writeFile(
      wb,
      `HealthyFood_${record.name.replace(/\s+/g, "_")}_SalesAudit_${formatCambodiaDate(new Date(), "code")}.xlsx`
    );
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* ─── Header Banner ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-5 rounded-2xl border border-emerald-500/15">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-500/15 px-2 py-0.5 rounded-md">
              Product Analytics
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
              <Calendar03Icon className="size-3 text-emerald-600" />
              Cambodia Timezone (ICT UTC+7)
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground mt-1">
            Sale by Products Report
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Analyze individual product performance, sales velocity, profit margins, inventory levels, and transaction details.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportExcel}
            className="font-semibold gap-1.5 bg-background shadow-sm hover:border-emerald-500"
          >
            <FileExportIcon className="size-4 text-emerald-600" />
            Export Excel
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportPDF}
            className="font-semibold gap-1.5 bg-background shadow-sm hover:border-rose-500"
          >
            <File02Icon className="size-4 text-rose-600" />
            Export PDF
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCSV}
            className="font-semibold gap-1.5 bg-background shadow-sm hover:border-blue-500"
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
        {/* Total Product Revenue */}
        <Card className="border-emerald-500/20 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Product Gross Sales</span>
              <Dollar01Icon className="size-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-600 tabular-nums">
              ${kpi.totalRevenueUsd.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span>{kpi.totalRevenueKhr.toLocaleString()} ៛ (KHR)</span>
            <Badge variant="secondary" className="text-[10px] font-bold">
              {kpi.activeProductsCount} Products Sold
            </Badge>
          </CardContent>
        </Card>

        {/* Product Gross Profit & Margin */}
        <Card className="border-emerald-500/20 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Gross Profit & Margin</span>
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
        <Card className="border-emerald-500/20 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Units Sold & Avg Price</span>
              <Package01Icon className="size-4 text-purple-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-purple-600 tabular-nums">
              {kpi.totalUnits.toLocaleString()} Units
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span>Avg ${kpi.avgSellingPriceUsd.toFixed(2)} / unit</span>
            <span className="text-[11px] text-muted-foreground">{filteredInvoices.length} Orders</span>
          </CardContent>
        </Card>

        {/* Top Product Star */}
        <Card className="border-emerald-500/20 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Top Seller Product</span>
              <SparklesIcon className="size-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-base font-black text-foreground truncate mt-1">
              {kpi.topProduct?.name || "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span className="text-emerald-700 font-bold">
              ${kpi.topProduct?.totalRevenue.toFixed(2) || "0.00"}
            </span>
            <span>
              {kpi.topProduct?.unitsSold || 0} sold ({kpi.topProduct?.revenueShare.toFixed(0) || 0}% share)
            </span>
          </CardContent>
        </Card>
      </div>

      {/* ─── Top 10 Product Visual Bar Chart ─── */}
      {chartData.length > 0 && (
        <Card className="border-muted shadow-sm">
          <CardHeader className="pb-2 bg-muted/20 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <ChartIncreaseIcon className="size-4 text-emerald-600" />
                Top Performing Products Chart
              </CardTitle>
              <CardDescription className="text-[11px]">
                Visual comparison of top selling products in selected range
              </CardDescription>
            </div>
            {/* Metric Switcher */}
            <div className="flex items-center gap-1 bg-background border p-0.5 rounded-lg text-xs">
              <Button
                size="sm"
                variant={chartMetric === "revenue" ? "default" : "ghost"}
                onClick={() => setChartMetric("revenue")}
                className={`h-7 text-xs px-2.5 ${chartMetric === "revenue" ? "bg-emerald-600 text-white" : ""}`}
              >
                By Revenue ($)
              </Button>
              <Button
                size="sm"
                variant={chartMetric === "units" ? "default" : "ghost"}
                onClick={() => setChartMetric("units")}
                className={`h-7 text-xs px-2.5 ${chartMetric === "units" ? "bg-emerald-600 text-white" : ""}`}
              >
                By Units Sold
              </Button>
              <Button
                size="sm"
                variant={chartMetric === "profit" ? "default" : "ghost"}
                onClick={() => setChartMetric("profit")}
                className={`h-7 text-xs px-2.5 ${chartMetric === "profit" ? "bg-emerald-600 text-white" : ""}`}
              >
                By Profit ($)
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-6">
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    stroke="#94a3b8"
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(val: any) => [
                      chartMetric === "units" ? `${val} Units` : `$${Number(val).toFixed(2)}`,
                      chartMetric === "revenue"
                        ? "Revenue ($)"
                        : chartMetric === "units"
                        ? "Units Sold"
                        : "Gross Profit ($)",
                    ]}
                    labelFormatter={(label, payload) => {
                      if (payload && payload[0]?.payload?.fullName) {
                        return payload[0].payload.fullName;
                      }
                      return label;
                    }}
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
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

          {/* Quick View Segment Filter */}
          <div className="flex items-center gap-2 flex-wrap border-t pt-3">
            <span className="font-bold text-muted-foreground uppercase text-[10px] tracking-wider mr-1">
              View Segment:
            </span>
            {[
              { id: "all", label: "All Sold Products" },
              { id: "top20", label: "Top 20 Best Sellers" },
              { id: "high_margin", label: "High Margin (≥40%)" },
              { id: "low_margin", label: "Low Margin (<20%)" },
              { id: "unsold", label: "Unsold Products (0 Sales)" },
            ].map((v) => (
              <Button
                key={v.id}
                size="sm"
                variant={viewFilter === v.id ? "secondary" : "ghost"}
                onClick={() => setViewFilter(v.id as ViewFilter)}
                className={`h-7 text-xs font-semibold ${
                  viewFilter === v.id ? "bg-emerald-500/15 text-emerald-800 font-bold border border-emerald-500/30" : ""
                }`}
              >
                {v.label}
              </Button>
            ))}
          </div>

          {/* Filters Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-1">
            {/* Search Input */}
            <div className="relative lg:col-span-2">
              <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search product name, barcode, category..."
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
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Stock Status Filter */}
            <Select value={stockStatusFilter} onValueChange={setStockStatusFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Stock Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stock Levels</SelectItem>
                <SelectItem value="in_stock">🟢 In Stock (&gt;5)</SelectItem>
                <SelectItem value="low_stock">🟡 Low Stock (1–5)</SelectItem>
                <SelectItem value="out_of_stock">🔴 Out of Stock (0)</SelectItem>
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
                <SelectItem value="profit">Sort by Gross Profit ($)</SelectItem>
                <SelectItem value="margin">Sort by Margin (%)</SelectItem>
                <SelectItem value="stock">Sort by Stock on Hand</SelectItem>
                <SelectItem value="name">Sort by Product Name</SelectItem>
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

          {/* Secondary Filters: Payment, Channel, Cashier */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase min-w-[60px]">Payment:</span>
              <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                <SelectTrigger className="h-8 text-xs bg-background flex-1">
                  <SelectValue placeholder="Payment Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payment Methods</SelectItem>
                  <SelectItem value="cash">💵 Cash (USD/៛)</SelectItem>
                  <SelectItem value="aba">🔵 ABA KHQR</SelectItem>
                  <SelectItem value="acleda">🔴 ACLEDA KHQR</SelectItem>
                  <SelectItem value="other">🟣 Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase min-w-[60px]">Channel:</span>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="h-8 text-xs bg-background flex-1">
                  <SelectValue placeholder="All Channels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  <SelectItem value="walk_in">🚶 Walk-in Counter</SelectItem>
                  <SelectItem value="online">🛵 Online / Delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase min-w-[60px]">Cashier:</span>
              <Select value={cashierFilter} onValueChange={setCashierFilter}>
                <SelectTrigger className="h-8 text-xs bg-background flex-1">
                  <SelectValue placeholder="All Staff / Cashiers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.name || u.id}>
                      {u.name} ({u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Product Performance Data Table ─── */}
      <Card className="border-muted shadow-sm">
        <CardHeader className="pb-3 bg-muted/20 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Package01Icon className="size-5 text-emerald-600" />
              Products Sales Register
            </CardTitle>
            <CardDescription className="text-xs">
              Showing {productSalesList.length} products • Total Revenue: ${kpi.totalRevenueUsd.toFixed(2)} ({kpi.totalRevenueKhr.toLocaleString()} ៛)
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loading01Icon className="animate-spin size-7 text-emerald-600" />
              <p className="text-xs font-semibold">Loading Product Sales...</p>
            </div>
          ) : productSalesList.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <InformationCircleIcon className="size-8 text-muted-foreground/50 mx-auto" />
              <p className="text-sm font-semibold">No product sales found matching the current filters.</p>
              <p className="text-xs text-muted-foreground">Try adjusting your date range, search query, or category filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3 text-center w-10">#</th>
                    <th className="py-3 px-3 text-left">Product</th>
                    <th className="py-3 px-3 text-center">Category</th>
                    <th className="py-3 px-3 text-center">Stock</th>
                    <th className="py-3 px-3 text-center">Units Sold</th>
                    <th className="py-3 px-3 text-center">Orders</th>
                    <th className="py-3 px-3 text-right">Avg Price</th>
                    <th className="py-3 px-3 text-right">Cost ($)</th>
                    <th className="py-3 px-3 text-right">Gross Sales ($)</th>
                    <th className="py-3 px-3 text-right">Gross Sales (KHR)</th>
                    <th className="py-3 px-3 text-right">Profit ($)</th>
                    <th className="py-3 px-3 text-right">Margin (%)</th>
                    <th className="py-3 px-3 text-left min-w-[100px]">Revenue Share</th>
                    <th className="py-3 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {productSalesList.map((p, idx) => (
                    <tr key={p.productId || idx} className="hover:bg-muted/40 transition-colors">
                      {/* Index */}
                      <td className="py-3 px-3 text-center font-bold text-muted-foreground">
                        {idx + 1}
                      </td>

                      {/* Product Name & Image */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          {p.image ? (
                            <img
                              src={getOptimizedImageUrl(p.image, 48, 48) || p.image}
                              alt={p.name}
                              className="size-9 rounded-lg object-cover border bg-muted shrink-0"
                            />
                          ) : (
                            <div className="size-9 rounded-lg bg-emerald-500/10 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-500/20">
                              <Package01Icon className="size-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-foreground truncate max-w-[190px]" title={p.name}>
                              {p.name}
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground">
                              {p.barcode}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <Badge variant="outline" className="text-[10px] font-medium border-muted-foreground/30">
                          {p.categoryName}
                        </Badge>
                      </td>

                      {/* Stock Level */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-bold ${
                            p.stockStatus === "in_stock"
                              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                              : p.stockStatus === "low_stock"
                              ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
                              : "bg-rose-500/10 text-rose-700 border-rose-500/20"
                          }`}
                        >
                          {p.currentStock} in stock
                        </Badge>
                      </td>

                      {/* Units Sold */}
                      <td className="py-3 px-3 text-center font-black text-foreground whitespace-nowrap">
                        <span className="bg-muted px-2 py-0.5 rounded-md">
                          {p.unitsSold}
                        </span>
                      </td>

                      {/* Orders Count */}
                      <td className="py-3 px-3 text-center font-medium text-muted-foreground">
                        {p.invoicesCount}
                      </td>

                      {/* Avg Price */}
                      <td className="py-3 px-3 text-right font-medium text-foreground">
                        ${p.avgPrice.toFixed(2)}
                      </td>

                      {/* Unit Cost */}
                      <td className="py-3 px-3 text-right font-medium text-muted-foreground">
                        ${p.cost.toFixed(2)}
                      </td>

                      {/* Gross Revenue ($) */}
                      <td className="py-3 px-3 text-right font-black text-emerald-700 whitespace-nowrap">
                        ${p.totalRevenue.toFixed(2)}
                      </td>

                      {/* Revenue KHR */}
                      <td className="py-3 px-3 text-right font-semibold text-muted-foreground tabular-nums whitespace-nowrap">
                        {Math.round(p.totalRevenue * exchangeRate).toLocaleString()} ៛
                      </td>

                      {/* Gross Profit ($) */}
                      <td className="py-3 px-3 text-right font-bold text-blue-700 whitespace-nowrap">
                        ${p.grossProfit.toFixed(2)}
                      </td>

                      {/* Margin % */}
                      <td className="py-3 px-3 text-right font-bold whitespace-nowrap">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] ${
                            p.profitMargin >= 40
                              ? "text-emerald-700 bg-emerald-50 font-bold"
                              : p.profitMargin >= 20
                              ? "text-blue-700 bg-blue-50 font-semibold"
                              : "text-amber-700 bg-amber-50 font-semibold"
                          }`}
                        >
                          {p.profitMargin.toFixed(1)}%
                        </span>
                      </td>

                      {/* Revenue Share % Progress */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
                            <span>{p.revenueShare.toFixed(1)}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min(100, p.revenueShare)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Drill-down Action */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setViewingProduct(p);
                            setDrillDownModalOpen(true);
                          }}
                          className="h-7 text-xs text-primary font-bold gap-1 hover:bg-primary/10"
                        >
                          <EyeIcon className="size-3.5" />
                          Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/40 font-black text-foreground">
                    <td className="py-3 px-3 text-center">∑</td>
                    <td className="py-3 px-3">TOTAL ({productSalesList.length} Products)</td>
                    <td className="py-3 px-3 text-center">—</td>
                    <td className="py-3 px-3 text-center font-bold">{kpi.totalStockOnHand}</td>
                    <td className="py-3 px-3 text-center">{kpi.totalUnits}</td>
                    <td className="py-3 px-3 text-center">{filteredInvoices.length}</td>
                    <td className="py-3 px-3 text-right">${kpi.avgSellingPriceUsd.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right">${kpi.totalCostUsd.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right text-emerald-700">${kpi.totalRevenueUsd.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right">{kpi.totalRevenueKhr.toLocaleString()} ៛</td>
                    <td className="py-3 px-3 text-right text-blue-700">${kpi.grossProfitUsd.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right">{kpi.marginPct.toFixed(1)}%</td>
                    <td className="py-3 px-3">100%</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Product Drill-Down Modal ─── */}
      <Dialog
        open={drillDownModalOpen}
        onOpenChange={(open) => {
          setDrillDownModalOpen(open);
          if (!open) {
            setExpandedInvoiceId(null);
            setModalSearch("");
            setModalPaymentFilter("all");
            setModalChannelFilter("all");
          }
        }}
      >
        <DialogContent className="!max-w-6xl sm:!max-w-6xl md:!max-w-6xl lg:!max-w-6xl xl:!max-w-7xl w-[96vw] max-h-[92vh] p-0 flex flex-col overflow-hidden rounded-2xl shadow-2xl border border-emerald-500/20">
          {viewingProduct && (
            <div className="flex flex-col h-full max-h-[92vh]">
              {/* Header */}
              <DialogHeader className="p-4 sm:p-5 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-b shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {viewingProduct.image ? (
                      <img
                        src={getOptimizedImageUrl(viewingProduct.image, 80, 80) || viewingProduct.image}
                        alt={viewingProduct.name}
                        className="size-14 rounded-xl object-cover border bg-muted shrink-0 shadow-xs"
                      />
                    ) : (
                      <div className="size-14 rounded-xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center font-bold text-lg shrink-0 border border-emerald-500/20">
                        <Package01Icon className="size-7" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-500/15 px-2 py-0.5 rounded">
                          Product Sales Audit & History
                        </span>
                        <Badge variant="outline" className="text-xs font-mono font-normal">
                          {viewingProduct.barcode}
                        </Badge>
                        <Badge variant="secondary" className="text-xs font-medium">
                          {viewingProduct.categoryName}
                        </Badge>
                      </div>
                      <DialogTitle className="text-xl sm:text-2xl font-black text-foreground mt-1">
                        {viewingProduct.name}
                      </DialogTitle>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <span>
                          Current Stock:{" "}
                          <strong className={viewingProduct.currentStock > 0 ? "text-emerald-700" : "text-rose-600"}>
                            {viewingProduct.currentStock} units
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Unit Cost: <strong>${viewingProduct.cost.toFixed(2)}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Avg Realized Price: <strong>${viewingProduct.avgPrice.toFixed(2)}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Header Actions */}
                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleExportSingleProductExcel(viewingProduct)}
                      className="text-xs font-semibold gap-1.5 bg-background shadow-xs hover:border-emerald-500"
                    >
                      <FileExportIcon className="size-3.5 text-emerald-600" />
                      Export Product Log
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              {/* Scrollable Modal Body */}
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
                {/* 5-Card Mini-Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-muted/30 p-3.5 rounded-xl border">
                  <div className="bg-card p-2.5 rounded-lg border shadow-2xs">
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Gross Sales</span>
                    <span className="font-black text-emerald-700 text-base">
                      ${viewingProduct.totalRevenue.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      {Math.round(viewingProduct.totalRevenue * exchangeRate).toLocaleString()} ៛ (KHR)
                    </span>
                  </div>

                  <div className="bg-card p-2.5 rounded-lg border shadow-2xs">
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Gross Profit</span>
                    <span className="font-bold text-blue-700 text-base">
                      ${viewingProduct.grossProfit.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-emerald-700 font-bold block">
                      {viewingProduct.profitMargin.toFixed(1)}% margin
                    </span>
                  </div>

                  <div className="bg-card p-2.5 rounded-lg border shadow-2xs">
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Total Sold</span>
                    <span className="font-bold text-purple-700 text-base">
                      {viewingProduct.unitsSold} Units
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      Avg ${viewingProduct.avgPrice.toFixed(2)} / unit
                    </span>
                  </div>

                  <div className="bg-card p-2.5 rounded-lg border shadow-2xs">
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Total Cost (COGS)</span>
                    <span className="font-bold text-foreground text-base">
                      ${viewingProduct.totalCost.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      ${viewingProduct.cost.toFixed(2)} / unit
                    </span>
                  </div>

                  <div className="bg-card p-2.5 rounded-lg border shadow-2xs col-span-2 sm:col-span-1">
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Orders & Share</span>
                    <span className="font-bold text-amber-700 text-base">
                      {viewingProduct.invoicesCount} Invoices
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      {viewingProduct.revenueShare.toFixed(1)}% revenue share
                    </span>
                  </div>
                </div>

                {/* Search & Filter Toolbar inside Modal */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1 max-w-sm">
                      <Search01Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Filter transactions by invoice #, customer, cashier..."
                        value={modalSearch}
                        onChange={(e) => setModalSearch(e.target.value)}
                        className="pl-8 h-8 text-xs bg-background"
                      />
                    </div>

                    <Select value={modalPaymentFilter} onValueChange={setModalPaymentFilter}>
                      <SelectTrigger className="h-8 text-xs bg-background w-36">
                        <SelectValue placeholder="Payment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Payments</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="aba">ABA</SelectItem>
                        <SelectItem value="acleda">ACLEDA</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={modalChannelFilter} onValueChange={setModalChannelFilter}>
                      <SelectTrigger className="h-8 text-xs bg-background w-32">
                        <SelectValue placeholder="Channel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Channels</SelectItem>
                        <SelectItem value="walk_in">Walk-in</SelectItem>
                        <SelectItem value="online">Delivery</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="text-xs text-muted-foreground font-semibold shrink-0">
                    Showing {filteredModalTransactions.length} of {viewingProduct.transactions.length} sales
                  </div>
                </div>

                {/* Transactions Table */}
                {filteredModalTransactions.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground border rounded-xl bg-muted/10 space-y-1">
                    <InformationCircleIcon className="size-7 mx-auto text-muted-foreground/60" />
                    <p className="font-semibold text-xs">No transactions match the selected modal filters.</p>
                  </div>
                ) : (
                  <div className="border rounded-xl overflow-x-auto bg-card shadow-2xs">
                    <table className="w-full text-xs min-w-[1050px]">
                      <thead>
                        <tr className="border-b bg-muted/40 text-muted-foreground font-bold uppercase text-[10px] tracking-wider">
                          <th className="py-2.5 px-3 text-center w-10">#</th>
                          <th className="py-2.5 px-3 text-left">Date / Time (ICT)</th>
                          <th className="py-2.5 px-3 text-left">Invoice #</th>
                          <th className="py-2.5 px-3 text-left">Customer & Channel</th>
                          <th className="py-2.5 px-3 text-left">Cashier</th>
                          <th className="py-2.5 px-3 text-center">Qty Sold</th>
                          <th className="py-2.5 px-3 text-right">Unit Price</th>
                          <th className="py-2.5 px-3 text-right">Discount</th>
                          <th className="py-2.5 px-3 text-right">Line Total ($)</th>
                          <th className="py-2.5 px-3 text-right">Unit Cost ($)</th>
                          <th className="py-2.5 px-3 text-right">Line Cost ($)</th>
                          <th className="py-2.5 px-3 text-right">Line Profit ($)</th>
                          <th className="py-2.5 px-3 text-right">Margin (%)</th>
                          <th className="py-2.5 px-3 text-center">Payment</th>
                          <th className="py-2.5 px-3 text-right">Bill Total</th>
                          <th className="py-2.5 px-3 text-center">Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredModalTransactions.map((tx, idx) => {
                          const isExpanded = expandedInvoiceId === tx.invoiceId;
                          return (
                            <React.Fragment key={tx.invoiceId + idx}>
                              <tr
                                onClick={() => setExpandedInvoiceId(isExpanded ? null : tx.invoiceId)}
                                className={`hover:bg-muted/30 cursor-pointer transition-colors ${
                                  isExpanded ? "bg-emerald-500/5 font-semibold" : ""
                                }`}
                              >
                                {/* Index */}
                                <td className="py-2.5 px-3 text-center font-bold text-muted-foreground">
                                  {idx + 1}
                                </td>

                                {/* Date/Time */}
                                <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">
                                  {formatCambodiaDate(tx.date, "invoice")}
                                </td>

                                {/* Invoice # */}
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <Badge variant="outline" className="font-mono font-bold text-foreground">
                                    {tx.invoiceNumber}
                                  </Badge>
                                </td>

                                {/* Customer & Channel */}
                                <td className="py-2.5 px-3">
                                  <div className="font-bold text-foreground truncate max-w-[150px]">
                                    {tx.customerName}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <span>{tx.customerType === "online" ? "🛵 Delivery" : "🚶 Walk-in"}</span>
                                    {tx.customerPhone && <span>• {tx.customerPhone}</span>}
                                  </div>
                                </td>

                                {/* Cashier */}
                                <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                                  {tx.cashierName}
                                </td>

                                {/* Qty */}
                                <td className="py-2.5 px-3 text-center font-black text-foreground whitespace-nowrap">
                                  <span className="bg-muted px-2 py-0.5 rounded">
                                    {tx.quantity}
                                  </span>
                                </td>

                                {/* Unit Price */}
                                <td className="py-2.5 px-3 text-right font-medium">
                                  ${tx.price.toFixed(2)}
                                </td>

                                {/* Discount */}
                                <td className="py-2.5 px-3 text-right font-medium text-muted-foreground">
                                  {tx.discount > 0 ? `-$${tx.discount.toFixed(2)}` : "$0.00"}
                                </td>

                                {/* Line Total */}
                                <td className="py-2.5 px-3 text-right font-black text-emerald-700 whitespace-nowrap">
                                  ${tx.itemTotal.toFixed(2)}
                                </td>

                                {/* Unit Cost */}
                                <td className="py-2.5 px-3 text-right font-medium text-muted-foreground">
                                  ${tx.cost.toFixed(2)}
                                </td>

                                {/* Line Cost */}
                                <td className="py-2.5 px-3 text-right font-medium text-muted-foreground">
                                  ${tx.itemCost.toFixed(2)}
                                </td>

                                {/* Line Profit */}
                                <td className="py-2.5 px-3 text-right font-bold text-blue-700 whitespace-nowrap">
                                  ${tx.profit.toFixed(2)}
                                </td>

                                {/* Margin */}
                                <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                                      tx.margin >= 40
                                        ? "text-emerald-700 bg-emerald-50 font-bold"
                                        : tx.margin >= 20
                                        ? "text-blue-700 bg-blue-50 font-semibold"
                                        : "text-amber-700 bg-amber-50 font-semibold"
                                    }`}
                                  >
                                    {tx.margin.toFixed(1)}%
                                  </span>
                                </td>

                                {/* Payment */}
                                <td className="py-2.5 px-3 text-center uppercase whitespace-nowrap">
                                  <Badge
                                    variant="secondary"
                                    className={`text-[9px] uppercase font-bold ${
                                      tx.paymentMethod === "aba"
                                        ? "bg-blue-500/15 text-blue-700"
                                        : tx.paymentMethod === "acleda"
                                        ? "bg-rose-500/15 text-rose-700"
                                        : "bg-emerald-500/15 text-emerald-700"
                                    }`}
                                  >
                                    {tx.paymentMethod}
                                  </Badge>
                                </td>

                                {/* Bill Total */}
                                <td className="py-2.5 px-3 text-right font-semibold text-muted-foreground whitespace-nowrap">
                                  ${tx.totalInvoiceAmount.toFixed(2)}
                                </td>

                                {/* Action */}
                                <td
                                  className="py-2.5 px-3 text-center whitespace-nowrap"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setReceiptInvoice(tx.invoice);
                                      setReceiptModalOpen(true);
                                    }}
                                    className="h-7 px-2 text-xs font-semibold gap-1 text-primary hover:bg-primary/10"
                                    title="View & Print Full Receipt"
                                  >
                                    <Invoice01Icon className="size-3.5" />
                                    <span>Slip</span>
                                  </Button>
                                </td>
                              </tr>

                              {/* Expandable Order Breakdown Row */}
                              {isExpanded && (
                                <tr className="bg-muted/20">
                                  <td colSpan={16} className="p-3 sm:p-4">
                                    <div className="bg-background rounded-xl p-3 border shadow-2xs space-y-3">
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                                        <div className="flex items-center gap-2">
                                          <Invoice01Icon className="size-4 text-emerald-600" />
                                          <span className="font-bold text-foreground">
                                            Invoice #{tx.invoiceNumber} — Full Bill Summary
                                          </span>
                                          <Badge variant="outline" className="text-[10px]">
                                            {tx.invoice.items?.length || 1} Total Items
                                          </Badge>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              setReceiptInvoice(tx.invoice);
                                              setReceiptModalOpen(true);
                                            }}
                                            className="h-7 text-xs font-bold gap-1 text-emerald-700 border-emerald-500/30 hover:bg-emerald-50"
                                          >
                                            <PrinterIcon className="size-3.5" />
                                            Print Receipt
                                          </Button>
                                        </div>
                                      </div>

                                      {/* Order Items List */}
                                      <div className="border rounded-lg overflow-hidden">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="bg-muted/40 text-muted-foreground font-semibold text-[10px]">
                                              <th className="py-1.5 px-3 text-left">Item Name</th>
                                              <th className="py-1.5 px-3 text-center">Qty</th>
                                              <th className="py-1.5 px-3 text-right">Unit Price</th>
                                              <th className="py-1.5 px-3 text-right">Discount</th>
                                              <th className="py-1.5 px-3 text-right">Total Price</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y">
                                            {tx.invoice.items?.map((it, itemIdx) => {
                                              const isCurrentProduct =
                                                it.product_id === viewingProduct.productId ||
                                                it.product_name === viewingProduct.name;
                                              return (
                                                <tr
                                                  key={itemIdx}
                                                  className={isCurrentProduct ? "bg-emerald-500/10 font-bold" : ""}
                                                >
                                                  <td className="py-1.5 px-3">
                                                    <span>{it.product_name}</span>
                                                    {isCurrentProduct && (
                                                      <span className="ml-2 text-[9px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-bold">
                                                        This Product
                                                      </span>
                                                    )}
                                                  </td>
                                                  <td className="py-1.5 px-3 text-center">{it.quantity}</td>
                                                  <td className="py-1.5 px-3 text-right">${Number(it.price || 0).toFixed(2)}</td>
                                                  <td className="py-1.5 px-3 text-right text-muted-foreground">
                                                    ${Number(it.discount || 0).toFixed(2)}
                                                  </td>
                                                  <td className="py-1.5 px-3 text-right font-black text-emerald-700">
                                                    ${Number(it.total_price || 0).toFixed(2)}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                          <tfoot>
                                            <tr className="bg-muted/30 border-t font-bold">
                                              <td colSpan={4} className="py-1.5 px-3 text-right">
                                                Invoice Grand Total:
                                              </td>
                                              <td className="py-1.5 px-3 text-right text-emerald-700 font-black">
                                                ${Number(tx.invoice.total_price || 0).toFixed(2)} (
                                                {Math.round(Number(tx.invoice.total_price || 0) * exchangeRate).toLocaleString()} ៛)
                                              </td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 bg-muted/40 font-black text-foreground">
                          <td className="py-2.5 px-3 text-center">∑</td>
                          <td className="py-2.5 px-3" colSpan={4}>
                            TOTAL ({filteredModalTransactions.length} Sales)
                          </td>
                          <td className="py-2.5 px-3 text-center font-black">{modalTotals.totalQty}</td>
                          <td className="py-2.5 px-3 text-right">—</td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">
                            ${modalTotals.totalDiscount.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-700 font-black">
                            ${modalTotals.totalRevenue.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">—</td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">
                            ${modalTotals.totalCost.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-blue-700 font-black">
                            ${modalTotals.totalProfit.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black">
                            {modalTotals.avgMargin.toFixed(1)}%
                          </td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <DialogFooter className="p-3.5 sm:p-4 bg-muted/40 border-t flex flex-row items-center justify-between shrink-0">
                <span className="text-xs text-muted-foreground">
                  Click any transaction row to expand full order items, or click <strong>Slip</strong> for receipt preview.
                </span>
                <Button size="sm" onClick={() => setDrillDownModalOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Receipt Modal ─── */}
      <ReceiptModal
        invoice={receiptInvoice}
        open={receiptModalOpen}
        onOpenChange={setReceiptModalOpen}
      />
    </div>
  );
}
