"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Invoice01Icon,
  MoneyReceiveSquareIcon,
  EyeIcon,
  FileExportIcon,
} from "hugeicons-react";
import { getSaleInvoices } from "@/lib/firebase/sale-actions";
import { getCustomers } from "@/lib/firebase/customer-actions";
import { getWarehouses } from "@/lib/firebase/warehouse-actions";
import { getUsers, getProducts } from "@/lib/firebase/actions";
import { SaleInvoice, Customer, Warehouse, User, Product } from "@/types";
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

type DatePreset = "all" | "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "custom";
type ActiveTab = "invoices" | "products" | "items";

export default function SalesReportPage() {
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // User auth & role
  const [role, setRole] = useState<string | null>(null);
  const [userWarehouseId, setUserWarehouseId] = useState<string | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState<ActiveTab>("invoices");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("all");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Viewing detail modal
  const [viewingInvoice, setViewingInvoice] = useState<SaleInvoice | null>(null);

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
        const [invData, custData, whData, userData, prodData] = await Promise.all([
          getSaleInvoices(),
          getCustomers(),
          getWarehouses(),
          getUsers(),
          getProducts(),
        ]);
        setInvoices(invData);
        setCustomers(custData);
        setWarehouses(whData);
        setUsers(userData);
        setProducts(prodData);
      } catch (error) {
        console.error("Error fetching sales report data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Maps
  const customerMap = useMemo(() => {
    const map: Record<string, Customer> = {};
    customers.forEach((c) => (map[c.id] = c));
    return map;
  }, [customers]);

  const warehouseMap = useMemo(() => {
    const map: Record<string, Warehouse> = {};
    warehouses.forEach((w) => (map[w.id] = w));
    return map;
  }, [warehouses]);

  const userMap = useMemo(() => {
    const map: Record<string, User> = {};
    users.forEach((u) => (map[u.id] = u));
    return map;
  }, [users]);

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

      // Warehouse filter
      if (selectedWarehouseId !== "all" && inv.warehouse_id !== selectedWarehouseId) {
        return false;
      }

      // Customer filter
      if (selectedCustomerId !== "all" && inv.customer_id !== selectedCustomerId) {
        return false;
      }

      // Status filter
      if (statusFilter !== "all" && inv.status !== statusFilter) {
        return false;
      }

      // Payment method filter
      if (paymentMethodFilter !== "all" && inv.payment_method !== paymentMethodFilter) {
        return false;
      }

      // Date interval filter
      if (dateInterval) {
        const invDate = new Date(inv.created_at);
        if (!isWithinInterval(invDate, dateInterval)) {
          return false;
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const invId = inv.id.toLowerCase();
        const customerName = (customerMap[inv.customer_id]?.name || "").toLowerCase();
        const cashierName = (userMap[inv.created_by]?.name || "").toLowerCase();
        const warehouseName = (warehouseMap[inv.warehouse_id]?.name || "").toLowerCase();
        const hasMatchingProduct = inv.items?.some(
          (item) =>
            item.product_name?.toLowerCase().includes(q) ||
            item.product_barcode?.toLowerCase().includes(q)
        );

        if (
          !invId.includes(q) &&
          !customerName.includes(q) &&
          !cashierName.includes(q) &&
          !warehouseName.includes(q) &&
          !hasMatchingProduct
        ) {
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
    selectedCustomerId,
    statusFilter,
    paymentMethodFilter,
    dateInterval,
    searchQuery,
    customerMap,
    userMap,
    warehouseMap,
  ]);

  // Executive KPI Totals
  const kpiData = useMemo(() => {
    let subTotal = 0;
    let discount = 0;
    let tax = 0;
    let totalRevenue = 0;
    let totalCost = 0;
    let totalUnits = 0;
    let paidCount = 0;
    let notPaidCount = 0;

    filteredInvoices.forEach((inv) => {
      subTotal += inv.sub_total || 0;
      discount += inv.discount || 0;
      tax += inv.tax || 0;
      totalRevenue += inv.total_price || 0;

      if (inv.status === "paid") paidCount++;
      else notPaidCount++;

      inv.items?.forEach((item) => {
        totalUnits += item.quantity || 0;
        totalCost += (item.cost || 0) * (item.quantity || 0);
      });
    });

    const grossProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return {
      subTotal,
      discount,
      tax,
      totalRevenue,
      totalCost,
      grossProfit,
      profitMargin,
      totalUnits,
      invoicesCount: filteredInvoices.length,
      paidCount,
      notPaidCount,
    };
  }, [filteredInvoices]);

  // Aggregated Products Sold Breakdown
  const aggregatedProducts = useMemo(() => {
    const map = new Map<string, {
      product_id: string;
      name: string;
      barcode: string;
      image?: string;
      total_qty: number;
      total_cost: number;
      total_revenue: number;
      invoices_count: number;
    }>();

    filteredInvoices.forEach((inv) => {
      inv.items?.forEach((item) => {
        const key = item.product_id || item.product_name;
        if (!map.has(key)) {
          map.set(key, {
            product_id: item.product_id,
            name: item.product_name || "Unknown Product",
            barcode: item.product_barcode || "-",
            image: item.product_image,
            total_qty: 0,
            total_cost: 0,
            total_revenue: 0,
            invoices_count: 0,
          });
        }
        const prod = map.get(key)!;
        prod.total_qty += item.quantity || 0;
        prod.total_cost += (item.cost || 0) * (item.quantity || 0);
        prod.total_revenue += item.total_price || 0;
        prod.invoices_count += 1;
      });
    });

    return Array.from(map.values()).sort((a, b) => b.total_revenue - a.total_revenue);
  }, [filteredInvoices]);

  // Detailed Line Items
  const detailedLineItems = useMemo(() => {
    const list: any[] = [];
    filteredInvoices.forEach((inv) => {
      inv.items?.forEach((item, itemIdx) => {
        const itemCost = (item.cost || 0) * item.quantity;
        const itemRevenue = item.total_price || 0;
        const itemProfit = itemRevenue - itemCost;
        list.push({
          invoice_id: inv.id,
          date: inv.created_at,
          customer_name: customerMap[inv.customer_id]?.name || "Online / Walk-in",
          warehouse_name: warehouseMap[inv.warehouse_id]?.name || "Main Warehouse",
          cashier_name: userMap[inv.created_by]?.name || inv.created_by || "-",
          product_name: item.product_name,
          barcode: item.product_barcode,
          quantity: item.quantity,
          unit_cost: item.cost || 0,
          unit_price: item.price || 0,
          unit_discount: item.discount || 0,
          total_price: itemRevenue,
          total_cost: itemCost,
          profit: itemProfit,
          payment_method: inv.payment_method,
          status: inv.status,
          key: `${inv.id}-${itemIdx}`,
        });
      });
    });
    return list;
  }, [filteredInvoices, customerMap, warehouseMap, userMap]);

  // ─── Genuine Excel (.xlsx) Export Handler ───
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // 1. Executive Summary Sheet
    const summaryData = [
      ["CAR ACCESSORIES - EXECUTIVE SALES REPORT"],
      [`Generated Date: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}`],
      [`Period: ${datePreset.toUpperCase()}${dateInterval ? ` (${format(dateInterval.start, "yyyy-MM-dd")} to ${format(dateInterval.end, "yyyy-MM-dd")})` : ""}`],
      [`Warehouse: ${selectedWarehouseId === "all" ? "All Warehouses" : warehouseMap[selectedWarehouseId]?.name || selectedWarehouseId}`],
      [`Customer: ${selectedCustomerId === "all" ? "All Customers" : customerMap[selectedCustomerId]?.name || selectedCustomerId}`],
      [`Payment Status: ${statusFilter.toUpperCase()}`],
      [`Payment Method: ${paymentMethodFilter.toUpperCase()}`],
      [],
      ["EXECUTIVE METRICS", "VALUE"],
      ["Total Gross Revenue", Number(kpiData.totalRevenue.toFixed(2))],
      ["Total Product Cost", Number(kpiData.totalCost.toFixed(2))],
      ["Gross Profit", Number(kpiData.grossProfit.toFixed(2))],
      ["Profit Margin (%)", `${kpiData.profitMargin.toFixed(2)}%`],
      ["Total Invoices", kpiData.invoicesCount],
      ["Paid Invoices", kpiData.paidCount],
      ["Unpaid Invoices", kpiData.notPaidCount],
      ["Total Units Sold", kpiData.totalUnits],
      ["Total Subtotal", Number(kpiData.subTotal.toFixed(2))],
      ["Total Discounts Given", Number(kpiData.discount.toFixed(2))],
      ["Total Tax Collected", Number(kpiData.tax.toFixed(2))],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Executive Summary");

    // 2. Invoices Summary Sheet
    const invoiceHeaders = [
      "#",
      "Invoice ID",
      "Date & Time",
      "Customer",
      "Warehouse",
      "Cashier",
      "Items Count",
      "Subtotal ($)",
      "Discount ($)",
      "Tax ($)",
      "Total Revenue ($)",
      "Est. Cost ($)",
      "Gross Profit ($)",
      "Profit Margin (%)",
      "Payment Method",
      "Payment Status",
    ];
    const invoiceRows: any[] = filteredInvoices.map((inv, idx) => {
      const invCost = inv.items?.reduce((s, it) => s + (it.cost || 0) * it.quantity, 0) || 0;
      const invProfit = inv.total_price - invCost;
      const invMargin = inv.total_price > 0 ? (invProfit / inv.total_price) * 100 : 0;
      const totalItems = inv.items?.reduce((s, it) => s + it.quantity, 0) || 0;
      return [
        idx + 1,
        inv.id,
        format(new Date(inv.created_at), "yyyy-MM-dd HH:mm"),
        customerMap[inv.customer_id]?.name || "Online / Walk-in",
        warehouseMap[inv.warehouse_id]?.name || "-",
        userMap[inv.created_by]?.name || inv.created_by || "-",
        totalItems,
        Number(inv.sub_total.toFixed(2)),
        Number(inv.discount.toFixed(2)),
        Number(inv.tax.toFixed(2)),
        Number(inv.total_price.toFixed(2)),
        Number(invCost.toFixed(2)),
        Number(invProfit.toFixed(2)),
        `${invMargin.toFixed(1)}%`,
        inv.payment_method?.toUpperCase() || "CASH",
        inv.status?.toUpperCase() || "PAID",
      ];
    });
    // Add Total Row
    invoiceRows.push([
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      kpiData.totalUnits,
      Number(kpiData.subTotal.toFixed(2)),
      Number(kpiData.discount.toFixed(2)),
      Number(kpiData.tax.toFixed(2)),
      Number(kpiData.totalRevenue.toFixed(2)),
      Number(kpiData.totalCost.toFixed(2)),
      Number(kpiData.grossProfit.toFixed(2)),
      `${kpiData.profitMargin.toFixed(1)}%`,
      "",
      "",
    ]);
    const wsInvoices = XLSX.utils.aoa_to_sheet([invoiceHeaders, ...invoiceRows]);
    XLSX.utils.book_append_sheet(wb, wsInvoices, "Invoices Summary");

    // 3. Products Breakdown Sheet
    const productHeaders = [
      "#",
      "Product Name",
      "Barcode",
      "Units Sold",
      "Avg Selling Price ($)",
      "Total Cost ($)",
      "Total Revenue ($)",
      "Gross Profit ($)",
      "Margin (%)",
    ];
    const productRows: any[] = aggregatedProducts.map((p, idx) => {
      const profit = p.total_revenue - p.total_cost;
      const margin = p.total_revenue > 0 ? (profit / p.total_revenue) * 100 : 0;
      const avgPrice = p.total_qty > 0 ? p.total_revenue / p.total_qty : 0;
      return [
        idx + 1,
        p.name,
        p.barcode || "-",
        p.total_qty,
        Number(avgPrice.toFixed(2)),
        Number(p.total_cost.toFixed(2)),
        Number(p.total_revenue.toFixed(2)),
        Number(profit.toFixed(2)),
        `${margin.toFixed(1)}%`,
      ];
    });
    productRows.push([
      "TOTAL",
      "",
      "",
      kpiData.totalUnits,
      "-",
      Number(kpiData.totalCost.toFixed(2)),
      Number(kpiData.totalRevenue.toFixed(2)),
      Number(kpiData.grossProfit.toFixed(2)),
      `${kpiData.profitMargin.toFixed(1)}%`,
    ]);
    const wsProducts = XLSX.utils.aoa_to_sheet([productHeaders, ...productRows]);
    XLSX.utils.book_append_sheet(wb, wsProducts, "Products Breakdown");

    // 4. Itemized Details Sheet
    const itemHeaders = [
      "#",
      "Date & Time",
      "Invoice ID",
      "Customer",
      "Warehouse",
      "Cashier",
      "Product Name",
      "Barcode",
      "Quantity",
      "Unit Cost ($)",
      "Unit Price ($)",
      "Line Total ($)",
      "Line Cost ($)",
      "Profit ($)",
      "Payment Method",
      "Status",
    ];
    const itemRows = detailedLineItems.map((it, idx) => [
      idx + 1,
      format(new Date(it.date), "yyyy-MM-dd HH:mm"),
      it.invoice_id,
      it.customer_name,
      it.warehouse_name,
      it.cashier_name,
      it.product_name,
      it.barcode || "-",
      it.quantity,
      Number(it.unit_cost.toFixed(2)),
      Number(it.unit_price.toFixed(2)),
      Number(it.total_price.toFixed(2)),
      Number(it.total_cost.toFixed(2)),
      Number(it.profit.toFixed(2)),
      it.payment_method?.toUpperCase() || "CASH",
      it.status?.toUpperCase() || "PAID",
    ]);
    const wsItems = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]);
    XLSX.utils.book_append_sheet(wb, wsItems, "Itemized Details");

    // Save genuine .xlsx file
    XLSX.writeFile(wb, `sales_report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  // ─── CSV Export with UTF-8 BOM ───
  const handleExportCSV = () => {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];
    const filename = `sales_report_${activeTab}_${format(new Date(), "yyyy-MM-dd")}.csv`;

    if (activeTab === "invoices") {
      headers = [
        "#",
        "Invoice ID",
        "Date",
        "Customer",
        "Warehouse",
        "Cashier",
        "Items Count",
        "Subtotal ($)",
        "Discount ($)",
        "Tax ($)",
        "Total Revenue ($)",
        "Est. Cost ($)",
        "Gross Profit ($)",
        "Payment Method",
        "Status",
      ];
      rows = filteredInvoices.map((inv, idx) => {
        const invCost = inv.items?.reduce((s, it) => s + (it.cost || 0) * it.quantity, 0) || 0;
        const invProfit = inv.total_price - invCost;
        const totalItems = inv.items?.reduce((s, it) => s + it.quantity, 0) || 0;
        return [
          idx + 1,
          `"${inv.id}"`,
          format(new Date(inv.created_at), "yyyy-MM-dd HH:mm"),
          `"${(customerMap[inv.customer_id]?.name || "Walk-in").replace(/"/g, '""')}"`,
          `"${(warehouseMap[inv.warehouse_id]?.name || "-").replace(/"/g, '""')}"`,
          `"${(userMap[inv.created_by]?.name || inv.created_by || "-").replace(/"/g, '""')}"`,
          totalItems,
          inv.sub_total.toFixed(2),
          inv.discount.toFixed(2),
          inv.tax.toFixed(2),
          inv.total_price.toFixed(2),
          invCost.toFixed(2),
          invProfit.toFixed(2),
          inv.payment_method?.toUpperCase() || "CASH",
          inv.status?.toUpperCase() || "PAID",
        ];
      });
    } else if (activeTab === "products") {
      headers = [
        "#",
        "Product Name",
        "Barcode",
        "Units Sold",
        "Avg Price ($)",
        "Total Cost ($)",
        "Total Revenue ($)",
        "Gross Profit ($)",
        "Margin (%)",
      ];
      rows = aggregatedProducts.map((p, idx) => {
        const profit = p.total_revenue - p.total_cost;
        const margin = p.total_revenue > 0 ? (profit / p.total_revenue) * 100 : 0;
        const avgPrice = p.total_qty > 0 ? p.total_revenue / p.total_qty : 0;
        return [
          idx + 1,
          `"${p.name.replace(/"/g, '""')}"`,
          `"${p.barcode || "-"}"`,
          p.total_qty,
          avgPrice.toFixed(2),
          p.total_cost.toFixed(2),
          p.total_revenue.toFixed(2),
          profit.toFixed(2),
          `${margin.toFixed(1)}%`,
        ];
      });
    } else {
      headers = [
        "#",
        "Date",
        "Invoice ID",
        "Customer",
        "Warehouse",
        "Product Name",
        "Barcode",
        "Quantity",
        "Unit Cost ($)",
        "Unit Price ($)",
        "Line Total ($)",
        "Line Cost ($)",
        "Profit ($)",
        "Payment",
        "Status",
      ];
      rows = detailedLineItems.map((item, idx) => [
        idx + 1,
        format(new Date(item.date), "yyyy-MM-dd HH:mm"),
        `"${item.invoice_id}"`,
        `"${item.customer_name.replace(/"/g, '""')}"`,
        `"${item.warehouse_name.replace(/"/g, '""')}"`,
        `"${item.product_name.replace(/"/g, '""')}"`,
        `"${item.barcode || "-"}"`,
        item.quantity,
        item.unit_cost.toFixed(2),
        item.unit_price.toFixed(2),
        item.total_price.toFixed(2),
        item.total_cost.toFixed(2),
        item.profit.toFixed(2),
        item.payment_method?.toUpperCase() || "CASH",
        item.status?.toUpperCase() || "PAID",
      ]);
    }

    // Prepend UTF-8 BOM \uFEFF to preserve Khmer/non-ASCII characters in Excel
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ─── High-Resolution Vector PDF Export with jspdf-autotable ───
  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 1. Header Banner
    doc.setFillColor(16, 185, 129); // Emerald-500
    doc.rect(0, 0, pageWidth, 18, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("CAR ACCESSORIES - EXECUTIVE SALES REPORT", 14, 11.5);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")}`, pageWidth - 14, 11.5, { align: "right" });

    // 2. Report Subheader & Filters
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const tabTitle = activeTab === "invoices" ? "Invoices Summary" : activeTab === "products" ? "Products Sold Breakdown" : "Itemized Line Items";
    doc.text(`Report View: ${tabTitle}`, 14, 25);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    const filterDesc = [
      `Period: ${datePreset.toUpperCase()}${dateInterval ? ` (${format(dateInterval.start, "yyyy-MM-dd")} to ${format(dateInterval.end, "yyyy-MM-dd")})` : ""}`,
      `Warehouse: ${selectedWarehouseId === "all" ? "All Warehouses" : warehouseMap[selectedWarehouseId]?.name || selectedWarehouseId}`,
      `Customer: ${selectedCustomerId === "all" ? "All Customers" : customerMap[selectedCustomerId]?.name || selectedCustomerId}`,
      `Status: ${statusFilter.toUpperCase()}`,
      `Payment: ${paymentMethodFilter.toUpperCase()}`,
    ].join("  |  ");
    doc.text(filterDesc, 14, 30);

    // 3. KPI Summary Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(14, 34, pageWidth - 28, 12, 1.5, 1.5, "FD");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    const kpiText = `Total Revenue: $${kpiData.totalRevenue.toFixed(2)}   |   Est. Cost: $${kpiData.totalCost.toFixed(2)}   |   Gross Profit: $${kpiData.grossProfit.toFixed(2)} (${kpiData.profitMargin.toFixed(1)}%)   |   Invoices: ${kpiData.invoicesCount} (${kpiData.paidCount} Paid)   |   Units Sold: ${kpiData.totalUnits}`;
    doc.text(kpiText, pageWidth / 2, 41.5, { align: "center" });

    // 4. Data Tables
    let head: string[][] = [];
    let body: (string | number)[][] = [];
    let foot: (string | number)[][] = [];

    if (activeTab === "invoices") {
      head = [[
        "#",
        "Date & Time",
        "Invoice ID",
        "Customer",
        "Warehouse",
        "Qty",
        "Subtotal",
        "Disc",
        "Tax",
        "Revenue",
        "Est. Cost",
        "Profit",
        "Payment",
        "Status",
      ]];
      body = filteredInvoices.map((inv, idx) => {
        const invCost = inv.items?.reduce((s, it) => s + (it.cost || 0) * it.quantity, 0) || 0;
        const invProfit = inv.total_price - invCost;
        const totalQty = inv.items?.reduce((s, it) => s + it.quantity, 0) || 0;
        return [
          idx + 1,
          format(new Date(inv.created_at), "yyyy-MM-dd HH:mm"),
          inv.id.slice(0, 10),
          customerMap[inv.customer_id]?.name || "Walk-in",
          warehouseMap[inv.warehouse_id]?.name || "-",
          totalQty,
          `$${inv.sub_total.toFixed(2)}`,
          inv.discount > 0 ? `-$${inv.discount.toFixed(2)}` : "-",
          inv.tax > 0 ? `+$${inv.tax.toFixed(2)}` : "-",
          `$${inv.total_price.toFixed(2)}`,
          `$${invCost.toFixed(2)}`,
          `$${invProfit.toFixed(2)}`,
          inv.payment_method?.toUpperCase() || "CASH",
          inv.status?.toUpperCase() || "PAID",
        ];
      });
      foot = [[
        "TOTAL",
        "",
        "",
        "",
        "",
        kpiData.totalUnits,
        `$${kpiData.subTotal.toFixed(2)}`,
        `-$${kpiData.discount.toFixed(2)}`,
        `+$${kpiData.tax.toFixed(2)}`,
        `$${kpiData.totalRevenue.toFixed(2)}`,
        `$${kpiData.totalCost.toFixed(2)}`,
        `$${kpiData.grossProfit.toFixed(2)}`,
        "",
        "",
      ]];
    } else if (activeTab === "products") {
      head = [[
        "#",
        "Product Name",
        "Barcode",
        "Units Sold",
        "Avg Selling Price",
        "Total Cost",
        "Total Revenue",
        "Gross Profit",
        "Margin (%)",
      ]];
      body = aggregatedProducts.map((p, idx) => {
        const profit = p.total_revenue - p.total_cost;
        const margin = p.total_revenue > 0 ? (profit / p.total_revenue) * 100 : 0;
        const avgPrice = p.total_qty > 0 ? p.total_revenue / p.total_qty : 0;
        return [
          idx + 1,
          p.name,
          p.barcode || "-",
          p.total_qty,
          `$${avgPrice.toFixed(2)}`,
          `$${p.total_cost.toFixed(2)}`,
          `$${p.total_revenue.toFixed(2)}`,
          `$${profit.toFixed(2)}`,
          `${margin.toFixed(1)}%`,
        ];
      });
      foot = [[
        "TOTAL",
        "",
        "",
        kpiData.totalUnits,
        "-",
        `$${kpiData.totalCost.toFixed(2)}`,
        `$${kpiData.totalRevenue.toFixed(2)}`,
        `$${kpiData.grossProfit.toFixed(2)}`,
        `${kpiData.profitMargin.toFixed(1)}%`,
      ]];
    } else {
      head = [[
        "#",
        "Date",
        "Invoice ID",
        "Customer",
        "Warehouse",
        "Product",
        "Barcode",
        "Qty",
        "Unit Cost",
        "Unit Price",
        "Line Total",
        "Line Cost",
        "Profit",
      ]];
      body = detailedLineItems.map((it, idx) => [
        idx + 1,
        format(new Date(it.date), "yyyy-MM-dd HH:mm"),
        it.invoice_id.slice(0, 10),
        it.customer_name,
        it.warehouse_name,
        it.product_name,
        it.barcode || "-",
        it.quantity,
        `$${it.unit_cost.toFixed(2)}`,
        `$${it.unit_price.toFixed(2)}`,
        `$${it.total_price.toFixed(2)}`,
        `$${it.total_cost.toFixed(2)}`,
        `$${it.profit.toFixed(2)}`,
      ]);
      foot = [[
        "TOTAL",
        "",
        "",
        "",
        "",
        "",
        "",
        kpiData.totalUnits,
        "",
        "",
        `$${kpiData.totalRevenue.toFixed(2)}`,
        `$${kpiData.totalCost.toFixed(2)}`,
        `$${kpiData.grossProfit.toFixed(2)}`,
      ]];
    }

    autoTable(doc, {
      startY: 49,
      head,
      body,
      foot,
      theme: "striped",
      headStyles: {
        fillColor: [5, 150, 105], // emerald-600
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: "bold",
        halign: "left",
      },
      footStyles: {
        fillColor: [209, 250, 229], // emerald-100
        textColor: [6, 78, 59], // emerald-900
        fontSize: 8,
        fontStyle: "bold",
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [30, 41, 59],
        cellPadding: 1.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      styles: {
        overflow: "linebreak",
        cellWidth: "auto",
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

    doc.save(`sales_report_${activeTab}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
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
              <MoneyReceiveSquareIcon className="size-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Executive Sales Report</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time revenue analysis, gross profit valuation, and invoice audit
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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

      {/* ─── Filter & KPI Toolbar ─── */}
      <div className="p-4 bg-muted/20 border-b space-y-3 shrink-0">
        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative min-w-[220px] flex-1">
            <Search01Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by invoice, product, customer, barcode..."
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

          {/* Custom Date Inputs if 'custom' */}
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

          {/* Customer Filter */}
          <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
            <SelectTrigger className="h-8 text-xs w-[140px] bg-background">
              <SelectValue placeholder="Customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Customers</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
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
        </div>

        {/* KPI Cards Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
          {/* Revenue */}
          <div className="bg-background border rounded-lg p-2.5 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total Revenue</span>
            <p className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              ${kpiData.totalRevenue.toFixed(2)}
            </p>
          </div>

          {/* Estimated Cost */}
          <div className="bg-background border rounded-lg p-2.5 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total Cost</span>
            <p className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">
              ${kpiData.totalCost.toFixed(2)}
            </p>
          </div>

          {/* Gross Profit */}
          <div className="bg-background border rounded-lg p-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Gross Profit</span>
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1 rounded">
                {kpiData.profitMargin.toFixed(1)}%
              </span>
            </div>
            <p className={`text-base font-black font-mono mt-0.5 ${kpiData.grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              ${kpiData.grossProfit.toFixed(2)}
            </p>
          </div>

          {/* Invoices */}
          <div className="bg-background border rounded-lg p-2.5 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Invoices</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-base font-bold font-mono">{kpiData.invoicesCount}</p>
              <span className="text-[10px] text-muted-foreground">
                ({kpiData.paidCount} paid, {kpiData.notPaidCount} unpaid)
              </span>
            </div>
          </div>

          {/* Units Sold */}
          <div className="bg-background border rounded-lg p-2.5 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Units Sold</span>
            <p className="text-base font-bold font-mono mt-0.5">{kpiData.totalUnits} items</p>
          </div>

          {/* Discounts */}
          <div className="bg-background border rounded-lg p-2.5 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Discounts Given</span>
            <p className="text-base font-bold text-orange-500 font-mono mt-0.5">
              -${kpiData.discount.toFixed(2)}
            </p>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex items-center justify-between pt-1 border-t border-border/40">
          <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border">
            <button
              onClick={() => setActiveTab("invoices")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                activeTab === "invoices"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Invoices Summary ({filteredInvoices.length})
            </button>
            <button
              onClick={() => setActiveTab("products")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                activeTab === "products"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Products Breakdown ({aggregatedProducts.length})
            </button>
            <button
              onClick={() => setActiveTab("items")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                activeTab === "items"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Itemized Line Items ({detailedLineItems.length})
            </button>
          </div>

          <span className="text-xs text-muted-foreground hidden sm:inline-block">
            Showing {activeTab === "invoices" ? filteredInvoices.length : activeTab === "products" ? aggregatedProducts.length : detailedLineItems.length} records
          </span>
        </div>
      </div>

      {/* ─── Table Container (Excel Style) ─── */}
      <div className="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900 p-4 sm:p-6" id="pdf-sales-report-content">
        <div className="bg-white dark:bg-black border rounded-sm shadow-sm overflow-x-auto">
          {activeTab === "invoices" && (
            <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-neutral-100 dark:bg-neutral-800 border-b-2 border-neutral-300 dark:border-neutral-700">
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 w-12 text-center">#</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Date & Time</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Invoice ID</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Customer</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Warehouse</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-center">Items Qty</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Subtotal</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Disc</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Tax</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right bg-emerald-50/70 dark:bg-emerald-950/30">Total Revenue</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Est. Cost</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Profit</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-center">Payment</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-center">Status</th>
                  <th className="px-3 py-2 font-semibold text-neutral-600 dark:text-neutral-300 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-12 text-center text-muted-foreground">
                      No sale invoices found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv, idx) => {
                    const invCost = inv.items?.reduce((s, it) => s + (it.cost || 0) * it.quantity, 0) || 0;
                    const invProfit = inv.total_price - invCost;
                    const totalQty = inv.items?.reduce((s, it) => s + it.quantity, 0) || 0;
                    return (
                      <tr key={inv.id} className="border-b hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                        <td className="px-3 py-1.5 border-r text-center text-neutral-500 bg-neutral-50 dark:bg-neutral-900/50">{idx + 1}</td>
                        <td className="px-3 py-1.5 border-r text-neutral-700 dark:text-neutral-300 font-mono">
                          {format(new Date(inv.created_at), "yyyy-MM-dd HH:mm")}
                        </td>
                        <td className="px-3 py-1.5 border-r font-mono text-emerald-700 dark:text-emerald-400 font-medium">
                          {inv.id.slice(0, 8)}...
                        </td>
                        <td className="px-3 py-1.5 border-r font-medium text-neutral-800 dark:text-neutral-200">
                          {customerMap[inv.customer_id]?.name || "Online / Walk-in"}
                        </td>
                        <td className="px-3 py-1.5 border-r text-neutral-600 dark:text-neutral-400">
                          {warehouseMap[inv.warehouse_id]?.name || "-"}
                        </td>
                        <td className="px-3 py-1.5 border-r text-center font-bold font-mono text-neutral-700 dark:text-neutral-300">
                          {totalQty}
                        </td>
                        <td className="px-3 py-1.5 border-r text-right font-mono text-neutral-600 dark:text-neutral-400">
                          ${inv.sub_total.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 border-r text-right font-mono text-orange-500">
                          {inv.discount > 0 ? `-$${inv.discount.toFixed(2)}` : "-"}
                        </td>
                        <td className="px-3 py-1.5 border-r text-right font-mono text-blue-500">
                          {inv.tax > 0 ? `+$${inv.tax.toFixed(2)}` : "-"}
                        </td>
                        <td className="px-3 py-1.5 border-r text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20">
                          ${inv.total_price.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 border-r text-right font-mono text-blue-600 dark:text-blue-400">
                          ${invCost.toFixed(2)}
                        </td>
                        <td className={`px-3 py-1.5 border-r text-right font-mono font-semibold ${invProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                          ${invProfit.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 border-r text-center">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                            {inv.payment_method || "cash"}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 border-r text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              inv.status === "paid"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400"
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingInvoice(inv)}
                            className="h-6 px-2 text-[11px] gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                          >
                            <EyeIcon className="size-3" />
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-100 dark:bg-neutral-800 border-t-2 border-neutral-300 dark:border-neutral-700 font-bold">
                  <td colSpan={5} className="px-3 py-2.5 border-r text-right uppercase tracking-wider text-[10px]">
                    Grand Total ({filteredInvoices.length} Invoices)
                  </td>
                  <td className="px-3 py-2.5 border-r text-center font-mono">{kpiData.totalUnits}</td>
                  <td className="px-3 py-2.5 border-r text-right font-mono">${kpiData.subTotal.toFixed(2)}</td>
                  <td className="px-3 py-2.5 border-r text-right font-mono text-orange-500">-${kpiData.discount.toFixed(2)}</td>
                  <td className="px-3 py-2.5 border-r text-right font-mono text-blue-500">+${kpiData.tax.toFixed(2)}</td>
                  <td className="px-3 py-2.5 border-r text-right font-mono text-emerald-700 dark:text-emerald-400 text-sm bg-emerald-100/60 dark:bg-emerald-950/40">
                    ${kpiData.totalRevenue.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 border-r text-right font-mono text-blue-600 dark:text-blue-400">${kpiData.totalCost.toFixed(2)}</td>
                  <td className="px-3 py-2.5 border-r text-right font-mono text-emerald-600 dark:text-emerald-400">${kpiData.grossProfit.toFixed(2)}</td>
                  <td colSpan={3} className="px-3 py-2.5"></td>
                </tr>
              </tfoot>
            </table>
          )}

          {activeTab === "products" && (
            <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-neutral-100 dark:bg-neutral-800 border-b-2 border-neutral-300 dark:border-neutral-700">
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 w-12 text-center">#</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Product Name</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Barcode</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-center">Units Sold</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Avg Selling Price</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Total Cost</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right bg-emerald-50/70 dark:bg-emerald-950/30">Total Revenue</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Gross Profit</th>
                  <th className="px-3 py-2 font-semibold text-neutral-600 dark:text-neutral-300 text-right">Margin (%)</th>
                </tr>
              </thead>
              <tbody>
                {aggregatedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      No products sold in this period.
                    </td>
                  </tr>
                ) : (
                  aggregatedProducts.map((prod, idx) => {
                    const profit = prod.total_revenue - prod.total_cost;
                    const margin = prod.total_revenue > 0 ? (profit / prod.total_revenue) * 100 : 0;
                    const avgPrice = prod.total_qty > 0 ? prod.total_revenue / prod.total_qty : 0;
                    return (
                      <tr key={idx} className="border-b hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                        <td className="px-3 py-1.5 border-r text-center text-neutral-500 bg-neutral-50 dark:bg-neutral-900/50">{idx + 1}</td>
                        <td className="px-3 py-1.5 border-r font-medium text-neutral-800 dark:text-neutral-200">{prod.name}</td>
                        <td className="px-3 py-1.5 border-r font-mono text-neutral-500">{prod.barcode || "-"}</td>
                        <td className="px-3 py-1.5 border-r text-center font-bold font-mono text-neutral-800 dark:text-neutral-200">{prod.total_qty}</td>
                        <td className="px-3 py-1.5 border-r text-right font-mono text-neutral-700 dark:text-neutral-300">${avgPrice.toFixed(2)}</td>
                        <td className="px-3 py-1.5 border-r text-right font-mono text-blue-600 dark:text-blue-400">${prod.total_cost.toFixed(2)}</td>
                        <td className="px-3 py-1.5 border-r text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20">
                          ${prod.total_revenue.toFixed(2)}
                        </td>
                        <td className={`px-3 py-1.5 border-r text-right font-mono font-semibold ${profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                          ${profit.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold text-neutral-700 dark:text-neutral-300">
                          {margin.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-100 dark:bg-neutral-800 border-t-2 border-neutral-300 dark:border-neutral-700 font-bold">
                  <td colSpan={3} className="px-3 py-2.5 border-r text-right uppercase tracking-wider text-[10px]">Grand Total</td>
                  <td className="px-3 py-2.5 border-r text-center font-mono">{kpiData.totalUnits}</td>
                  <td className="px-3 py-2.5 border-r text-right font-mono">-</td>
                  <td className="px-3 py-2.5 border-r text-right font-mono text-blue-600 dark:text-blue-400">${kpiData.totalCost.toFixed(2)}</td>
                  <td className="px-3 py-2.5 border-r text-right font-mono text-emerald-700 dark:text-emerald-400 text-sm bg-emerald-100/60 dark:bg-emerald-950/40">
                    ${kpiData.totalRevenue.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 border-r text-right font-mono text-emerald-600 dark:text-emerald-400">${kpiData.grossProfit.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{kpiData.profitMargin.toFixed(1)}%</td>
                </tr>
              </tfoot>
            </table>
          )}

          {activeTab === "items" && (
            <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-neutral-100 dark:bg-neutral-800 border-b-2 border-neutral-300 dark:border-neutral-700">
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 w-12 text-center">#</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Date</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Invoice ID</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Customer</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Warehouse</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Product</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300">Barcode</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-center">Qty</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Unit Cost</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Unit Price</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right bg-emerald-50/70 dark:bg-emerald-950/30">Line Total</th>
                  <th className="px-3 py-2 border-r font-semibold text-neutral-600 dark:text-neutral-300 text-right">Line Cost</th>
                  <th className="px-3 py-2 font-semibold text-neutral-600 dark:text-neutral-300 text-right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {detailedLineItems.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-muted-foreground">
                      No line items found matching criteria.
                    </td>
                  </tr>
                ) : (
                  detailedLineItems.map((it, idx) => (
                    <tr key={it.key} className="border-b hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                      <td className="px-3 py-1.5 border-r text-center text-neutral-500 bg-neutral-50 dark:bg-neutral-900/50">{idx + 1}</td>
                      <td className="px-3 py-1.5 border-r text-neutral-700 dark:text-neutral-300 font-mono">
                        {format(new Date(it.date), "yyyy-MM-dd HH:mm")}
                      </td>
                      <td className="px-3 py-1.5 border-r font-mono text-emerald-700 dark:text-emerald-400">
                        {it.invoice_id.slice(0, 8)}...
                      </td>
                      <td className="px-3 py-1.5 border-r font-medium text-neutral-800 dark:text-neutral-200">{it.customer_name}</td>
                      <td className="px-3 py-1.5 border-r text-neutral-600 dark:text-neutral-400">{it.warehouse_name}</td>
                      <td className="px-3 py-1.5 border-r font-medium text-neutral-800 dark:text-neutral-200">{it.product_name}</td>
                      <td className="px-3 py-1.5 border-r font-mono text-neutral-500">{it.barcode || "-"}</td>
                      <td className="px-3 py-1.5 border-r text-center font-bold font-mono">{it.quantity}</td>
                      <td className="px-3 py-1.5 border-r text-right font-mono text-blue-600 dark:text-blue-400">${it.unit_cost.toFixed(2)}</td>
                      <td className="px-3 py-1.5 border-r text-right font-mono text-neutral-700 dark:text-neutral-300">${it.unit_price.toFixed(2)}</td>
                      <td className="px-3 py-1.5 border-r text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20">
                        ${it.total_price.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 border-r text-right font-mono text-blue-600 dark:text-blue-400">${it.total_cost.toFixed(2)}</td>
                      <td className={`px-3 py-1.5 text-right font-mono font-semibold ${it.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                        ${it.profit.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-100 dark:bg-neutral-800 border-t-2 border-neutral-300 dark:border-neutral-700 font-bold">
                  <td colSpan={7} className="px-3 py-2.5 border-r text-right uppercase tracking-wider text-[10px]">Grand Total</td>
                  <td className="px-3 py-2.5 border-r text-center font-mono">{kpiData.totalUnits}</td>
                  <td colSpan={2} className="px-3 py-2.5 border-r"></td>
                  <td className="px-3 py-2.5 border-r text-right font-mono text-emerald-700 dark:text-emerald-400 text-sm bg-emerald-100/60 dark:bg-emerald-950/40">
                    ${kpiData.totalRevenue.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 border-r text-right font-mono text-blue-600 dark:text-blue-400">${kpiData.totalCost.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">${kpiData.grossProfit.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* ─── View Invoice Detail Dialog ─── */}
      <Dialog open={!!viewingInvoice} onOpenChange={(open) => !open && setViewingInvoice(null)}>
        <DialogContent className="!max-w-3xl !w-[min(95vw,850px)] p-0 overflow-hidden sm:!max-w-3xl rounded-xl">
          {viewingInvoice && (
            <div>
              <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 pr-12">
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                    <Invoice01Icon className="size-5 text-emerald-500" />
                    Invoice #{viewingInvoice.id}
                  </DialogTitle>
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                      viewingInvoice.status === "paid"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400"
                    }`}
                  >
                    {viewingInvoice.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Issued on {format(new Date(viewingInvoice.created_at), "yyyy-MM-dd HH:mm")} &bull; Cashier: {userMap[viewingInvoice.created_by]?.name || viewingInvoice.created_by}
                </p>
              </DialogHeader>

              <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* Meta info */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg text-xs">
                  <div>
                    <span className="text-muted-foreground">Customer:</span>{" "}
                    <span className="font-bold text-foreground">
                      {customerMap[viewingInvoice.customer_id]?.name || "Walk-in Customer"}
                    </span>
                    {customerMap[viewingInvoice.customer_id]?.phone && (
                      <p className="text-[11px] text-muted-foreground">
                        Phone: {customerMap[viewingInvoice.customer_id]?.phone}
                      </p>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Warehouse:</span>{" "}
                    <span className="font-bold text-foreground">
                      {warehouseMap[viewingInvoice.warehouse_id]?.name || "Main Warehouse"}
                    </span>
                    <p className="text-[11px] text-muted-foreground uppercase">
                      Payment: {viewingInvoice.payment_method || "CASH"}
                    </p>
                  </div>
                </div>

                {/* Items Table */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="p-2 font-semibold">Product</th>
                        <th className="p-2 font-semibold text-center">Qty</th>
                        <th className="p-2 font-semibold text-right">Unit Price</th>
                        <th className="p-2 font-semibold text-right">Disc</th>
                        <th className="p-2 font-semibold text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {viewingInvoice.items?.map((it, idx) => (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="p-2">
                            <p className="font-medium">{it.product_name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{it.product_barcode || "-"}</p>
                          </td>
                          <td className="p-2 text-center font-bold font-mono">{it.quantity}</td>
                          <td className="p-2 text-right font-mono">${it.price.toFixed(2)}</td>
                          <td className="p-2 text-right font-mono text-orange-500">
                            {it.discount > 0 ? `-$${(it.discount * it.quantity).toFixed(2)}` : "-"}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-emerald-600">
                            ${it.total_price.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Financial Summary */}
                <div className="bg-muted/20 p-3 rounded-lg space-y-1.5 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal:</span>
                    <span className="font-mono font-medium">${viewingInvoice.sub_total.toFixed(2)}</span>
                  </div>
                  {viewingInvoice.discount > 0 && (
                    <div className="flex justify-between text-orange-500">
                      <span>Overall Discount:</span>
                      <span className="font-mono font-medium">-${viewingInvoice.discount.toFixed(2)}</span>
                    </div>
                  )}
                  {viewingInvoice.tax > 0 && (
                    <div className="flex justify-between text-blue-500">
                      <span>Tax:</span>
                      <span className="font-mono font-medium">+${viewingInvoice.tax.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t flex justify-between items-center text-base font-bold">
                    <span>Total Amount:</span>
                    <span className="text-emerald-600 font-mono">${viewingInvoice.total_price.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
