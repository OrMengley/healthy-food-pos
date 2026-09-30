"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { getSaleInvoices, cancelSaleInvoice } from "@/lib/firebase/sale-actions";
import { getProducts, getCategories } from "@/lib/firebase/actions";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import { SaleInvoice, Product, StoreSettings } from "@/types";
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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ShoppingCart01Icon,
  Dollar01Icon,
  Package01Icon,
  ChartIncreaseIcon,
  Search01Icon,
  Download04Icon,
  FileExportIcon,
  PrinterIcon,
  EyeIcon,
  Loading01Icon,
  CheckmarkCircle01Icon,
  Cancel01Icon,
  Calendar03Icon,
  Store01Icon,
  Copy01Icon,
  InformationCircleIcon,
  MoneyReceiveSquareIcon,
  ArrowDown01Icon,
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

type DateFilterPreset = "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "all" | "custom";

export default function SalesManagementPage() {
  const { user, role } = useAuth();
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modals
  const [receiptInvoice, setReceiptInvoice] = useState<SaleInvoice | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SaleInvoice | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [cancellingInvoice, setCancellingInvoice] = useState<SaleInvoice | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellingLoading, setCancellingLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [invs, prods, storeConfig] = await Promise.all([
        getSaleInvoices(),
        getProducts(),
        getStoreSettings(),
      ]);
      setInvoices(invs);
      setProducts(prods);
      setSettings(storeConfig);
    } catch (error) {
      console.error("Failed to load sales invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const exchangeRate = settings.exchange_rate_khr || 4100;

  // Filtered invoices based on search, presets, and selections
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // 1. Status filter
      if (statusFilter === "paid" && (inv.status === "not paid" || inv.is_archived)) return false;
      if (statusFilter === "cancelled" && (!inv.is_archived && inv.status !== "not paid")) return false;

      // 2. Payment Method filter
      if (paymentMethodFilter !== "all" && inv.payment_method !== paymentMethodFilter) {
        return false;
      }

      // 3. Customer / Channel filter
      if (channelFilter !== "all") {
        if (channelFilter === "walk_in") {
          if (inv.customer_type && inv.customer_type !== "walk_in") return false;
        } else if (channelFilter === "online") {
          if (inv.customer_type === "walk_in" || !inv.customer_type) return false;
        } else {
          // Specific channel tag
          const cType = (inv.customer_type || "").toLowerCase();
          const cName = (inv.customer_name || "").toLowerCase();
          if (!cType.includes(channelFilter.toLowerCase()) && !cName.includes(channelFilter.toLowerCase())) {
            return false;
          }
        }
      }

      // 4. Date Preset Filter (strictly in Cambodia Timezone ICT UTC+7)
      const invDate = parseFirestoreDate(inv.created_at);
      if (datePreset === "today") {
        if (!isTodayCambodia(invDate)) return false;
      } else if (datePreset === "yesterday") {
        if (!isYesterdayCambodia(invDate)) return false;
      } else if (datePreset === "this_month") {
        if (!isThisMonthCambodia(invDate)) return false;
      } else if (datePreset === "this_week") {
        // Current week in Cambodia
        const todayCambodiaStr = getCambodiaDateString(new Date());
        const invCambodiaStr = getCambodiaDateString(invDate);
        const curr = new Date(todayCambodiaStr);
        const firstDayOfWeek = new Date(curr.setDate(curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1)));
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
      } else if (datePreset === "custom") {
        const invDateStr = getCambodiaDateString(invDate);
        if (customStartDate && invDateStr < customStartDate) return false;
        if (customEndDate && invDateStr > customEndDate) return false;
      }

      // 5. Search query (Invoice #, Customer, Phone, Cashier, Item name, Barcode)
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
    statusFilter,
    paymentMethodFilter,
    channelFilter,
    datePreset,
    customStartDate,
    customEndDate,
    searchQuery,
  ]);

  // Dashboard & KPI Summary calculations
  const summary = useMemo(() => {
    let totalRevenueUsd = 0;
    let totalDiscountUsd = 0;
    let totalTaxUsd = 0;
    let totalCostUsd = 0;
    let totalUnitsSold = 0;
    let activeInvoicesCount = 0;
    let cancelledInvoicesCount = 0;

    // Today metrics
    let todaySalesUsd = 0;
    let todayOrdersCount = 0;

    // Breakdown maps
    const paymentBreakdown: Record<string, { count: number; total: number }> = {
      cash: { count: 0, total: 0 },
      aba: { count: 0, total: 0 },
      acleda: { count: 0, total: 0 },
      other: { count: 0, total: 0 },
    };

    const channelBreakdown: Record<string, { count: number; total: number }> = {
      walk_in: { count: 0, total: 0 },
      online: { count: 0, total: 0 },
    };

    const productStats: Record<string, { id: string; name: string; barcode: string; image?: string; qty: number; revenue: number; cost: number }> = {};

    filteredInvoices.forEach((inv) => {
      const isCancelled = inv.is_archived || inv.status === "not paid";
      if (isCancelled) {
        cancelledInvoicesCount++;
        return;
      }

      activeInvoicesCount++;
      const totalPrice = Number(inv.total_price || 0);
      const discount = Number(inv.discount || 0);
      const tax = Number(inv.tax || 0);

      totalRevenueUsd += totalPrice;
      totalDiscountUsd += discount;
      totalTaxUsd += tax;

      // Today Cambodia check
      if (isTodayCambodia(inv.created_at)) {
        todaySalesUsd += totalPrice;
        todayOrdersCount++;
      }

      // Payment Breakdown
      const pMethod = (inv.payment_method || "cash").toLowerCase();
      const normMethod = pMethod.includes("aba")
        ? "aba"
        : pMethod.includes("acleda") || pMethod.includes("aclida")
        ? "acleda"
        : pMethod.includes("cash")
        ? "cash"
        : "other";

      if (paymentBreakdown[normMethod]) {
        paymentBreakdown[normMethod].count += 1;
        paymentBreakdown[normMethod].total += totalPrice;
      } else {
        paymentBreakdown.other.count += 1;
        paymentBreakdown.other.total += totalPrice;
      }

      // Channel Breakdown
      const isOnline = inv.customer_type && inv.customer_type !== "walk_in";
      if (isOnline) {
        channelBreakdown.online.count += 1;
        channelBreakdown.online.total += totalPrice;
      } else {
        channelBreakdown.walk_in.count += 1;
        channelBreakdown.walk_in.total += totalPrice;
      }

      // Items & Cost Breakdown
      inv.items?.forEach((item) => {
        const qty = Number(item.quantity || 0);
        const itemCost = Number(item.cost || 0) * qty;
        const itemRevenue = Number(item.total_price || 0);

        totalUnitsSold += qty;
        totalCostUsd += itemCost;

        const prodKey = item.product_id || item.product_name;
        if (!productStats[prodKey]) {
          productStats[prodKey] = {
            id: item.product_id,
            name: item.product_name,
            barcode: item.product_barcode || "",
            image: item.product_image,
            qty: 0,
            revenue: 0,
            cost: 0,
          };
        }
        productStats[prodKey].qty += qty;
        productStats[prodKey].revenue += itemRevenue;
        productStats[prodKey].cost += itemCost;
      });
    });

    const grossProfitUsd = totalRevenueUsd - totalCostUsd;
    const profitMarginPct = totalRevenueUsd > 0 ? (grossProfitUsd / totalRevenueUsd) * 100 : 0;
    const averageOrderValue = activeInvoicesCount > 0 ? totalRevenueUsd / activeInvoicesCount : 0;

    const topSellingProducts = Object.values(productStats)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return {
      totalRevenueUsd,
      totalRevenueKhr: Math.round(totalRevenueUsd * exchangeRate),
      todaySalesUsd,
      todaySalesKhr: Math.round(todaySalesUsd * exchangeRate),
      todayOrdersCount,
      grossProfitUsd,
      profitMarginPct,
      totalCostUsd,
      totalUnitsSold,
      activeInvoicesCount,
      cancelledInvoicesCount,
      totalInvoicesCount: filteredInvoices.length,
      averageOrderValue,
      totalDiscountUsd,
      totalTaxUsd,
      paymentBreakdown,
      channelBreakdown,
      topSellingProducts,
    };
  }, [filteredInvoices, exchangeRate]);

  // Copy invoice # to clipboard
  const handleCopyInvoiceNumber = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopiedId(num);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Safe Cancel Invoice Handler
  const handleConfirmCancelInvoice = async () => {
    if (!cancellingInvoice) return;
    try {
      setCancellingLoading(true);
      await cancelSaleInvoice(
        cancellingInvoice.id,
        user?.uid || "Admin",
        user?.name || "Admin"
      );
      setCancelModalOpen(false);
      setCancellingInvoice(null);
      await loadData();
    } catch (err: any) {
      alert("Failed to cancel invoice: " + (err.message || "Unknown error"));
    } finally {
      setCancellingLoading(false);
    }
  };

  // High-Resolution Excel Export
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // 1. Executive Summary Sheet
    const summaryRows = [
      ["HEALTHY FOOD POS - SALES REPORT & SUMMARY"],
      [`Generated Date: ${formatCambodiaDate(new Date(), "invoice")} (ICT / Cambodia)`],
      [`Period Filter: ${datePreset.toUpperCase()}${datePreset === "custom" ? ` (${customStartDate} to ${customEndDate})` : ""}`],
      [`Payment Filter: ${paymentMethodFilter.toUpperCase()}`],
      [`Channel Filter: ${channelFilter.toUpperCase()}`],
      [],
      ["KEY FINANCIAL METRICS", "VALUE (USD)", "VALUE (KHR)"],
      ["Total Gross Sales", summary.totalRevenueUsd, summary.totalRevenueKhr],
      ["Estimated Net Profit", summary.grossProfitUsd, Math.round(summary.grossProfitUsd * exchangeRate)],
      ["Profit Margin (%)", `${summary.profitMarginPct.toFixed(1)}%`, "-"],
      ["Total Completed Orders", summary.activeInvoicesCount, "-"],
      ["Average Order Value (AOV)", Number(summary.averageOrderValue.toFixed(2)), Math.round(summary.averageOrderValue * exchangeRate)],
      ["Total Units Sold", summary.totalUnitsSold, "-"],
      ["Total Discounts Given", summary.totalDiscountUsd, Math.round(summary.totalDiscountUsd * exchangeRate)],
      ["Cancelled / Refunded Invoices", summary.cancelledInvoicesCount, "-"],
      [],
      ["PAYMENT METHOD DISTRIBUTION", "ORDERS COUNT", "AMOUNT (USD)"],
      ["Cash", summary.paymentBreakdown.cash.count, summary.paymentBreakdown.cash.total],
      ["ABA KHQR", summary.paymentBreakdown.aba.count, summary.paymentBreakdown.aba.total],
      ["ACLEDA KHQR", summary.paymentBreakdown.acleda.count, summary.paymentBreakdown.acleda.total],
      ["Other", summary.paymentBreakdown.other.count, summary.paymentBreakdown.other.total],
      [],
      ["ORDER CHANNELS", "ORDERS COUNT", "AMOUNT (USD)"],
      ["Walk-in Register", summary.channelBreakdown.walk_in.count, summary.channelBreakdown.walk_in.total],
      ["Online / Delivery Orders", summary.channelBreakdown.online.count, summary.channelBreakdown.online.total],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Executive Summary");

    // 2. Invoices List Sheet
    const invoiceHeaders = [
      "#",
      "Invoice Number",
      "Date & Time (Cambodia ICT)",
      "Customer Name",
      "Customer Phone",
      "Order Channel",
      "Payment Method",
      "Items Count",
      "Subtotal ($)",
      "Discount ($)",
      "Total (USD)",
      "Total (KHR)",
      "Cashier",
      "Status",
    ];

    const invoiceRows = filteredInvoices.map((inv, idx) => {
      const isOnline = inv.customer_type && inv.customer_type !== "walk_in";
      const totalKhr = Math.round(Number(inv.total_price || 0) * (inv.exchange_rate_khr || exchangeRate));
      return [
        idx + 1,
        inv.invoice_number || inv.id,
        formatCambodiaDate(inv.created_at, "invoice"),
        inv.customer_name || (isOnline ? "Online Customer" : "Walk-in Customer"),
        inv.customer_phone || "-",
        isOnline ? (inv.customer_type || "Online") : "Walk-in",
        inv.payment_method?.toUpperCase() || "CASH",
        inv.items?.reduce((sum, it) => sum + (it.quantity || 0), 0) || 0,
        Number(inv.sub_total || 0).toFixed(2),
        Number(inv.discount || 0).toFixed(2),
        Number(inv.total_price || 0).toFixed(2),
        totalKhr,
        inv.created_by_name || "Admin",
        inv.is_archived || inv.status === "not paid" ? "CANCELLED" : "PAID",
      ];
    });

    const wsInvoices = XLSX.utils.aoa_to_sheet([invoiceHeaders, ...invoiceRows]);
    XLSX.utils.book_append_sheet(wb, wsInvoices, "Sales Invoices");

    XLSX.writeFile(wb, `HealthyFood_Sales_${formatCambodiaDate(new Date(), "code")}.xlsx`);
  };

  // CSV Export with UTF-8 BOM
  const handleExportCSV = () => {
    const headers = [
      "Invoice No",
      "Date & Time (ICT)",
      "Customer",
      "Phone",
      "Channel",
      "Payment Method",
      "Items Count",
      "Subtotal ($)",
      "Discount ($)",
      "Total (USD)",
      "Total (KHR)",
      "Cashier",
      "Status",
    ];

    const rows = filteredInvoices.map((inv) => {
      const isOnline = inv.customer_type && inv.customer_type !== "walk_in";
      const totalKhr = Math.round(Number(inv.total_price || 0) * (inv.exchange_rate_khr || exchangeRate));
      return [
        `"${inv.invoice_number || inv.id}"`,
        `"${formatCambodiaDate(inv.created_at, "invoice")}"`,
        `"${(inv.customer_name || (isOnline ? "Online Customer" : "Walk-in Customer")).replace(/"/g, '""')}"`,
        `"${inv.customer_phone || ""}"`,
        `"${isOnline ? (inv.customer_type || "Online") : "Walk-in"}"`,
        `"${inv.payment_method?.toUpperCase() || "CASH"}"`,
        inv.items?.reduce((sum, it) => sum + (it.quantity || 0), 0) || 0,
        Number(inv.sub_total || 0).toFixed(2),
        Number(inv.discount || 0).toFixed(2),
        Number(inv.total_price || 0).toFixed(2),
        totalKhr,
        `"${(inv.created_by_name || "Admin").replace(/"/g, '""')}"`,
        `"${inv.is_archived || inv.status === "not paid" ? "CANCELLED" : "PAID"}"`,
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `HealthyFood_Sales_${formatCambodiaDate(new Date(), "code")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print A4 Clean Sale Invoice
  const handlePrintA4Invoice = (inv: SaleInvoice) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rate = inv.exchange_rate_khr || exchangeRate;
    const totalUsd = Number(inv.total_price || 0).toFixed(2);
    const totalKhr = Math.round(Number(inv.total_price || 0) * rate).toLocaleString();
    const subTotalUsd = Number(inv.sub_total || 0).toFixed(2);
    const discountUsd = Number(inv.discount || 0).toFixed(2);

    const itemsHtml = inv.items
      .map(
        (it, idx) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 12px; text-align: center; color: #64748b;">${idx + 1}</td>
          <td style="padding: 8px 12px;">
            <div style="font-weight: 700; color: #0f172a;">${it.product_name}</div>
            <div style="font-size: 11px; font-family: monospace; color: #94a3b8;">${it.product_barcode || ""}</div>
          </td>
          <td style="padding: 8px 12px; text-align: right; font-weight: 600;">$${Number(it.price).toFixed(2)}</td>
          <td style="padding: 8px 12px; text-align: center; font-weight: 700;">${it.quantity}</td>
          <td style="padding: 8px 12px; text-align: right; color: #e11d48;">${it.discount ? `-$${Number(it.discount).toFixed(2)}` : "—"}</td>
          <td style="padding: 8px 12px; text-align: right; font-weight: 800; color: #0f172a;">$${Number(it.total_price).toFixed(2)}</td>
        </tr>
      `
      )
      .join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Sale Invoice #${inv.invoice_number || inv.id}</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Khmer OS", sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 10px;
              font-size: 13px;
              line-height: 1.5;
            }
            .header-table { width: 100%; margin-bottom: 24px; border-bottom: 2px solid #10b981; padding-bottom: 16px; }
            .store-name { font-size: 22px; font-weight: 900; color: #059669; text-transform: uppercase; margin: 0; }
            .invoice-title { font-size: 20px; font-weight: 900; color: #0f172a; text-align: right; text-transform: uppercase; margin: 0; }
            .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 24px; }
            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
            table.items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            table.items-table th { background: #059669; color: #ffffff; padding: 10px 12px; font-size: 12px; text-transform: uppercase; text-align: left; }
            .totals-table { width: 340px; margin-left: auto; border-collapse: collapse; }
            .totals-table td { padding: 6px 12px; }
            .grand-total-row { background: #ecfdf5; border-top: 2px solid #059669; border-bottom: 2px solid #059669; font-weight: 900; font-size: 16px; color: #059669; }
            .footer-notes { margin-top: 40px; border-top: 1px dashed #cbd5e1; padding-top: 14px; text-align: center; font-size: 11px; color: #64748b; }
          </style>
        </head>
        <body>
          <table class="header-table">
            <tr>
              <td>
                <div class="store-name">${settings.store_name || "HEALTHY FOOD STORE"}</div>
                <div style="font-size: 12px; color: #475569; margin-top: 3px;">${settings.store_address || "Phnom Penh, Cambodia"}</div>
                ${settings.store_phone ? `<div style="font-size: 12px; color: #475569;">Tel: ${settings.store_phone}</div>` : ""}
              </td>
              <td style="text-align: right; vertical-align: top;">
                <div class="invoice-title">Official Sale Invoice</div>
                <div style="font-size: 13px; font-family: monospace; font-weight: 800; color: #059669; margin-top: 4px;">${inv.invoice_number || inv.id}</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Issue Date: ${formatCambodiaDate(inv.created_at, "invoice")} (ICT)</div>
              </td>
            </tr>
          </table>

          <div class="meta-box">
            <div class="grid-2">
              <div>
                <div style="font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Billed To Customer:</div>
                <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-top: 2px;">
                  ${inv.customer_name || (inv.customer_type === "online" ? "Online Customer" : "Walk-in Customer")}
                </div>
                ${inv.customer_phone ? `<div style="font-size: 12px; color: #334155; margin-top: 2px;">Phone: <strong>${inv.customer_phone}</strong></div>` : ""}
                <div style="font-size: 12px; color: #334155; margin-top: 2px;">
                  Channel: <strong style="text-transform: uppercase;">${inv.customer_type || "Walk-in"}</strong>
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Payment & Counter Info:</div>
                <div style="font-size: 13px; font-weight: 700; color: #059669; text-transform: uppercase; margin-top: 2px;">
                  Payment: ${inv.payment_method}
                </div>
                <div style="font-size: 12px; color: #475569; margin-top: 2px;">Cashier: <strong>${inv.created_by_name || "Admin"}</strong></div>
                <div style="font-size: 12px; color: #475569; margin-top: 2px;">Status: <strong style="color: #059669;">COMPLETED</strong></div>
              </div>
            </div>
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">#</th>
                <th>Item Description</th>
                <th style="width: 100px; text-align: right;">Unit Price</th>
                <th style="width: 60px; text-align: center;">Qty</th>
                <th style="width: 80px; text-align: right;">Discount</th>
                <th style="width: 110px; text-align: right;">Amount ($)</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <table class="totals-table">
            <tr>
              <td style="color: #64748b;">Subtotal:</td>
              <td style="text-align: right; font-weight: 700;">$${subTotalUsd}</td>
            </tr>
            ${Number(inv.discount || 0) > 0 ? `
            <tr>
              <td style="color: #e11d48;">Discount:</td>
              <td style="text-align: right; font-weight: 700; color: #e11d48;">-$${discountUsd}</td>
            </tr>` : ""}
            <tr class="grand-total-row">
              <td>Total Due (USD):</td>
              <td style="text-align: right;">$${totalUsd}</td>
            </tr>
            <tr>
              <td style="font-weight: 700; color: #334155;">Total (KHR):</td>
              <td style="text-align: right; font-weight: 800; color: #334155;">${totalKhr} ៛</td>
            </tr>
          </table>

          <div class="footer-notes">
            <div style="font-weight: 700; color: #0f172a;">${settings.receipt_footer || "Thank you for choosing Healthy Food Store!"}</div>
            <div style="margin-top: 4px;">Exchange Rate: 1 USD = ${rate.toLocaleString()} KHR | Cambodia Standard Time (UTC+7)</div>
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 400);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
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
    if (t.includes("facebook")) {
      return { label: "Facebook", color: "bg-blue-500/10 text-blue-700 border-blue-500/20" };
    }
    return { label: type, color: "bg-blue-500/10 text-blue-700 border-blue-500/20" };
  };

  const paymentBadgeInfo = (method: string) => {
    const m = (method || "").toLowerCase();
    if (m.includes("aba")) {
      return { label: "ABA KHQR", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" };
    }
    if (m.includes("acleda") || m.includes("aclida")) {
      return { label: "ACLEDA KHQR", color: "bg-rose-500/10 text-rose-600 border-rose-500/20" };
    }
    if (m.includes("cash")) {
      return { label: "Cash (USD/៛)", color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" };
    }
    return { label: method.toUpperCase(), color: "bg-purple-500/10 text-purple-700 border-purple-500/20" };
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* ─── Page Header & Quick Actions ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-5 rounded-2xl border border-emerald-500/15">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-500/15 px-2 py-0.5 rounded-md">
              POS Invoices & Sales Analytics
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
              <Calendar03Icon className="size-3 text-emerald-600" />
              Cambodia ICT (UTC+7)
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground mt-1">
            Sales Management & Invoices
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitor real-time counter sales, customer channel analytics, revenue summaries, and print customer receipts.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            asChild
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 shadow-sm"
          >
            <Link href="/pos">
              <ShoppingCart01Icon className="size-4" />
              Open POS Counter
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
            onClick={loadData}
            disabled={loading}
            className="font-semibold gap-1.5"
          >
            <Loading01Icon className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ─── Top 4 Metric KPI Dashboard Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Gross Sales */}
        <Card className="border-emerald-500/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Total Sales Revenue</span>
              <Dollar01Icon className="size-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-600 tabular-nums">
              ${summary.totalRevenueUsd.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span>{summary.totalRevenueKhr.toLocaleString()} ៛ (KHR)</span>
            <Badge variant="secondary" className="text-[10px] font-bold">
              {summary.activeInvoicesCount} Orders
            </Badge>
          </CardContent>
        </Card>

        {/* 2. Today's Cambodia Sales */}
        <Card className="border-emerald-500/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Today&apos;s Cambodia Sales</span>
              <MoneyReceiveSquareIcon className="size-4 text-blue-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-blue-600 tabular-nums">
              ${summary.todaySalesUsd.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span>{summary.todaySalesKhr.toLocaleString()} ៛ (KHR)</span>
            <Badge variant="outline" className="text-[10px] font-bold bg-blue-500/10 text-blue-700 border-blue-500/20">
              {summary.todayOrdersCount} today
            </Badge>
          </CardContent>
        </Card>

        {/* 3. Estimated Gross Profit */}
        <Card className="border-emerald-500/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Est. Gross Profit</span>
              <ChartIncreaseIcon className="size-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-foreground tabular-nums">
              ${summary.grossProfitUsd.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span className="text-emerald-600 font-bold">{summary.profitMarginPct.toFixed(1)}% Margin</span>
            <span className="text-[11px] text-muted-foreground">Cost: ${summary.totalCostUsd.toFixed(2)}</span>
          </CardContent>
        </Card>

        {/* 4. Units Sold & Average Ticket */}
        <Card className="border-emerald-500/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Units Sold & AOV</span>
              <Package01Icon className="size-4 text-purple-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-purple-600 tabular-nums">
              {summary.totalUnitsSold} Units
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0 flex items-center justify-between">
            <span>Avg: ${summary.averageOrderValue.toFixed(2)} / sale</span>
            {summary.cancelledInvoicesCount > 0 && (
              <Badge variant="outline" className="text-[10px] text-rose-600 bg-rose-500/10 border-rose-500/20">
                {summary.cancelledInvoicesCount} Cancelled
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Visual Breakdown Widgets (Payment & Channels & Top Items) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Payment Methods Breakdown */}
        <Card className="border-muted shadow-sm">
          <CardHeader className="pb-3 bg-muted/20 border-b">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Dollar01Icon className="size-4 text-emerald-600" />
                Payment Methods Distribution
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                {summary.activeInvoicesCount} sales
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {[
              { key: "cash", label: "Cash (USD / ៛)", color: "bg-emerald-500", text: "text-emerald-700", data: summary.paymentBreakdown.cash },
              { key: "aba", label: "ABA KHQR", color: "bg-blue-500", text: "text-blue-700", data: summary.paymentBreakdown.aba },
              { key: "acleda", label: "ACLEDA KHQR", color: "bg-rose-500", text: "text-rose-700", data: summary.paymentBreakdown.acleda },
              { key: "other", label: "Other / Wing", color: "bg-purple-500", text: "text-purple-700", data: summary.paymentBreakdown.other },
            ].map((pm) => {
              const pct = summary.totalRevenueUsd > 0 ? (pm.data.total / summary.totalRevenueUsd) * 100 : 0;
              return (
                <div key={pm.key} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${pm.color}`} />
                      {pm.label}
                    </span>
                    <span className="tabular-nums">
                      <strong className={pm.text}>${pm.data.total.toFixed(2)}</strong> ({pm.data.count})
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${pm.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Order Channel Breakdown */}
        <Card className="border-muted shadow-sm">
          <CardHeader className="pb-3 bg-muted/20 border-b">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Store01Icon className="size-4 text-primary" />
                Customer Channels (Walk-in vs Online)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {[
              {
                label: "Walk-in Store Customers",
                color: "bg-emerald-500",
                text: "text-emerald-700",
                data: summary.channelBreakdown.walk_in,
              },
              {
                label: "Online & Delivery (Grab, NHAM24, Telegram, etc.)",
                color: "bg-blue-500",
                text: "text-blue-700",
                data: summary.channelBreakdown.online,
              },
            ].map((ch, idx) => {
              const pct = summary.totalRevenueUsd > 0 ? (ch.data.total / summary.totalRevenueUsd) * 100 : 0;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 truncate max-w-[200px]">
                      <span className={`size-2 rounded-full ${ch.color}`} />
                      {ch.label}
                    </span>
                    <span className="tabular-nums">
                      <strong className={ch.text}>${ch.data.total.toFixed(2)}</strong> ({ch.data.count})
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${ch.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}

            <div className="pt-2 border-t mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Walk-in Share: {summary.totalRevenueUsd > 0 ? ((summary.channelBreakdown.walk_in.total / summary.totalRevenueUsd) * 100).toFixed(0) : 0}%</span>
              <span>Online Share: {summary.totalRevenueUsd > 0 ? ((summary.channelBreakdown.online.total / summary.totalRevenueUsd) * 100).toFixed(0) : 0}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Top 5 Best Selling Products in Filtered Range */}
        <Card className="border-muted shadow-sm">
          <CardHeader className="pb-3 bg-muted/20 border-b">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ChartIncreaseIcon className="size-4 text-emerald-600" />
                Top Items in Period
              </span>
              <span className="text-xs text-muted-foreground font-normal">Ranked by Qty</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {summary.topSellingProducts.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No items sold in selected period.
              </div>
            ) : (
              <div className="divide-y max-h-[220px] overflow-y-auto">
                {summary.topSellingProducts.map((prod, idx) => (
                  <div key={prod.id || idx} className="flex items-center justify-between p-3 hover:bg-muted/30 text-xs">
                    <div className="flex items-center gap-2.5 truncate max-w-[180px]">
                      <span className="flex items-center justify-center size-5 rounded-full bg-emerald-500/10 text-emerald-700 font-bold text-[10px]">
                        {idx + 1}
                      </span>
                      <div className="truncate">
                        <p className="font-bold text-foreground truncate">{prod.name}</p>
                        <p className="text-[10px] text-muted-foreground">${prod.revenue.toFixed(2)} rev</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="font-bold text-[11px]">
                      {prod.qty} sold
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Search & Date Filter Bar ─── */}
      <Card className="border-muted shadow-sm">
        <CardContent className="p-4 space-y-3">
          {/* Top Row: Presets */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-bold text-muted-foreground uppercase text-[10px] tracking-wider mr-1">
              Date Period:
            </span>
            {[
              { id: "all", label: "All Time" },
              { id: "today", label: "Today (ICT)" },
              { id: "yesterday", label: "Yesterday" },
              { id: "this_week", label: "This Week" },
              { id: "this_month", label: "This Month" },
              { id: "last_month", label: "Last Month" },
              { id: "custom", label: "Custom Range" },
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

          {/* Custom Date Pickers if 'custom' is active */}
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
                Reset Dates
              </Button>
            </div>
          )}

          {/* Search and Dropdowns Filter Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {/* Search Input */}
            <div className="relative">
              <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search invoice #, customer, phone, item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs bg-background"
              />
            </div>

            {/* Customer Channel Filter */}
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Order Channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels (Walk-in & Online)</SelectItem>
                <SelectItem value="walk_in">🚶 Walk-in Counter</SelectItem>
                <SelectItem value="online">🛵 All Online / Delivery</SelectItem>
                <SelectItem value="grab">🛵 GrabFood</SelectItem>
                <SelectItem value="nham24">🍲 NHAM24</SelectItem>
                <SelectItem value="telegram">📱 Telegram</SelectItem>
                <SelectItem value="foodpanda">🐼 FoodPanda</SelectItem>
                <SelectItem value="facebook">💬 Facebook</SelectItem>
              </SelectContent>
            </Select>

            {/* Payment Method Filter */}
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

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="All Invoices" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Invoice Statuses</SelectItem>
                <SelectItem value="paid">✅ Completed / Paid</SelectItem>
                <SelectItem value="cancelled">❌ Cancelled / Refunded</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ─── Sales Invoices Data Table ─── */}
      <Card className="border-muted shadow-sm">
        <CardHeader className="pb-3 bg-muted/20 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <ShoppingCart01Icon className="size-5 text-emerald-600" />
              Sales Invoices Register
            </CardTitle>
            <CardDescription className="text-xs">
              Showing {filteredInvoices.length} of {invoices.length} invoices • Total: ${summary.totalRevenueUsd.toFixed(2)} ({summary.totalRevenueKhr.toLocaleString()} ៛)
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loading01Icon className="animate-spin size-7 text-emerald-600" />
              <p className="text-xs font-semibold">Loading Sales Invoices...</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <InformationCircleIcon className="size-8 text-muted-foreground/50 mx-auto" />
              <p className="text-sm font-semibold">No sales invoices match your filters.</p>
              <p className="text-xs text-muted-foreground">Try adjusting your date range or search keywords.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4 text-left">Invoice No</th>
                    <th className="py-3 px-4 text-left">Date & Time (ICT)</th>
                    <th className="py-3 px-4 text-left">Customer & Channel</th>
                    <th className="py-3 px-4 text-left">Items Preview</th>
                    <th className="py-3 px-4 text-left">Payment</th>
                    <th className="py-3 px-4 text-right">Total Amount</th>
                    <th className="py-3 px-4 text-left">Cashier</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredInvoices.map((inv) => {
                    const isCancelled = inv.is_archived || inv.status === "not paid";
                    const chInfo = channelBadgeInfo(inv.customer_type);
                    const payInfo = paymentBadgeInfo(inv.payment_method);
                    const totalKhr = Math.round(Number(inv.total_price || 0) * (inv.exchange_rate_khr || exchangeRate));
                    const totalQty = inv.items?.reduce((s, it) => s + (it.quantity || 0), 0) || 0;

                    return (
                      <tr
                        key={inv.id}
                        className={`hover:bg-muted/40 transition-colors ${
                          isCancelled ? "bg-rose-500/5 opacity-70" : ""
                        }`}
                      >
                        {/* Invoice # */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 font-mono font-bold text-foreground">
                            <span className="text-emerald-700">{inv.invoice_number || inv.id}</span>
                            <button
                              onClick={() => handleCopyInvoiceNumber(inv.invoice_number || inv.id)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title="Copy invoice number"
                            >
                              <Copy01Icon className="size-3.5" />
                            </button>
                            {copiedId === (inv.invoice_number || inv.id) && (
                              <span className="text-[9px] text-emerald-600 font-sans font-bold">Copied!</span>
                            )}
                          </div>
                        </td>

                        {/* Date & Time in Cambodia ICT */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-medium text-foreground">
                            {formatCambodiaDate(inv.created_at, "datetime")}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatCambodiaDate(inv.created_at, "time")} ICT
                          </div>
                        </td>

                        {/* Customer & Channel */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground truncate max-w-[160px]">
                            {inv.customer_name || (inv.customer_type === "online" ? "Online Customer" : "Walk-in Customer")}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 font-bold ${chInfo.color}`}>
                              {chInfo.label}
                            </Badge>
                            {inv.customer_phone && (
                              <span className="text-[10px] font-mono text-muted-foreground">
                                📞 {inv.customer_phone}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Items Sold Preview */}
                        <td className="py-3 px-4 max-w-[200px]">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px] font-bold shrink-0">
                              {totalQty} {totalQty === 1 ? "item" : "items"}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground truncate block">
                              {inv.items?.map((it) => `${it.product_name} (${it.quantity})`).join(", ")}
                            </span>
                          </div>
                        </td>

                        {/* Payment Method */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Badge variant="outline" className={`text-[10px] font-bold ${payInfo.color}`}>
                            {payInfo.label}
                          </Badge>
                        </td>

                        {/* Total Amount */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="font-black text-sm text-foreground tabular-nums">
                            ${Number(inv.total_price || 0).toFixed(2)}
                          </div>
                          <div className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                            {totalKhr.toLocaleString()} ៛
                          </div>
                          {Number(inv.discount || 0) > 0 && (
                            <span className="text-[9px] text-rose-600 font-bold block">
                              -${Number(inv.discount).toFixed(2)} disc
                            </span>
                          )}
                        </td>

                        {/* Cashier */}
                        <td className="py-3 px-4 whitespace-nowrap text-muted-foreground font-medium">
                          {inv.created_by_name || "Admin"}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-bold ${
                              isCancelled
                                ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                : "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                            }`}
                          >
                            {isCancelled ? "Cancelled" : "Paid"}
                          </Badge>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {/* View Detail */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedInvoice(inv);
                                setDetailsModalOpen(true);
                              }}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                              title="View Invoice Details"
                            >
                              <EyeIcon className="size-4" />
                            </Button>

                            {/* Thermal Receipt Print */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setReceiptInvoice(inv);
                                setReceiptModalOpen(true);
                              }}
                              className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              title="Print Thermal Receipt (80mm)"
                            >
                              <PrinterIcon className="size-4" />
                            </Button>

                            {/* A4 Invoice Print */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handlePrintA4Invoice(inv)}
                              className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="Print A4 Sale Invoice"
                            >
                              <FileExportIcon className="size-4" />
                            </Button>

                            {/* Cancel Invoice (If not already cancelled) */}
                            {!isCancelled && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setCancellingInvoice(inv);
                                  setCancelModalOpen(true);
                                }}
                                className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                title="Cancel & Return Stock"
                              >
                                <Cancel01Icon className="size-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Detailed Invoice Modal / Slide-Over ─── */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          {selectedInvoice && (
            <div>
              <DialogHeader className="p-5 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                      Invoice Breakdown
                    </span>
                    <DialogTitle className="text-xl font-black text-foreground flex items-center gap-2 mt-0.5">
                      {selectedInvoice.invoice_number || selectedInvoice.id}
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          selectedInvoice.is_archived || selectedInvoice.status === "not paid"
                            ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                            : "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                        }`}
                      >
                        {selectedInvoice.is_archived || selectedInvoice.status === "not paid" ? "Cancelled" : "Completed"}
                      </Badge>
                    </DialogTitle>
                  </div>
                </div>
              </DialogHeader>

              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
                {/* Meta Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/30 p-3.5 rounded-xl border">
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Issue Date (ICT)</span>
                    <span className="font-semibold text-foreground">
                      {formatCambodiaDate(selectedInvoice.created_at, "datetime")}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Customer</span>
                    <span className="font-semibold text-foreground">
                      {selectedInvoice.customer_name || "Walk-in Customer"}
                    </span>
                    {selectedInvoice.customer_phone && (
                      <span className="text-[10px] text-muted-foreground block">{selectedInvoice.customer_phone}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Channel</span>
                    <Badge variant="outline" className={`text-[10px] font-bold ${channelBadgeInfo(selectedInvoice.customer_type).color}`}>
                      {channelBadgeInfo(selectedInvoice.customer_type).label}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Payment Method</span>
                    <Badge variant="outline" className={`text-[10px] font-bold ${paymentBadgeInfo(selectedInvoice.payment_method).color}`}>
                      {paymentBadgeInfo(selectedInvoice.payment_method).label}
                    </Badge>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-muted-foreground font-bold uppercase text-[10px]">
                        <th className="py-2.5 px-3 text-left">Product</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-center">Qty</th>
                        <th className="py-2.5 px-3 text-right">Discount</th>
                        <th className="py-2.5 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedInvoice.items?.map((item, idx) => (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-foreground">{item.product_name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{item.product_barcode || "-"}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium">
                            ${Number(item.price).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold">
                            {item.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-right text-rose-600 font-semibold">
                            {item.discount ? `-$${Number(item.discount).toFixed(2)}` : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-foreground">
                            ${Number(item.total_price).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals Summary */}
                <div className="bg-muted/30 p-4 rounded-xl border space-y-1.5 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal:</span>
                    <span className="font-semibold">${Number(selectedInvoice.sub_total || 0).toFixed(2)}</span>
                  </div>
                  {Number(selectedInvoice.discount || 0) > 0 && (
                    <div className="flex justify-between text-rose-600 font-semibold">
                      <span>Order Discount:</span>
                      <span>-${Number(selectedInvoice.discount).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(selectedInvoice.tax || 0) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax:</span>
                      <span>+${Number(selectedInvoice.tax).toFixed(2)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between items-center text-sm font-black text-foreground pt-1">
                    <span>Grand Total (USD):</span>
                    <span className="text-emerald-700 text-base font-black">
                      ${Number(selectedInvoice.total_price || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-muted-foreground">
                    <span>Grand Total (KHR):</span>
                    <span>
                      {Math.round(
                        Number(selectedInvoice.total_price || 0) * (selectedInvoice.exchange_rate_khr || exchangeRate)
                      ).toLocaleString()}{" "}
                      ៛
                    </span>
                  </div>
                </div>
              </div>

              <DialogFooter className="p-4 bg-muted/40 border-t flex items-center justify-between sm:justify-between">
                <Button variant="outline" size="sm" onClick={() => setDetailsModalOpen(false)}>
                  Close
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReceiptInvoice(selectedInvoice);
                      setReceiptModalOpen(true);
                    }}
                    className="gap-1.5 font-bold"
                  >
                    <PrinterIcon className="size-4 text-emerald-600" />
                    Thermal Receipt
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handlePrintA4Invoice(selectedInvoice)}
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  >
                    <FileExportIcon className="size-4" />
                    Print A4 Invoice
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Cancel Invoice Confirmation Dialog ─── */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-rose-600 flex items-center gap-2 text-base font-bold">
              <Cancel01Icon className="size-5" />
              Cancel & Return Stock?
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to cancel Invoice{" "}
              <strong className="text-foreground">{cancellingInvoice?.invoice_number || cancellingInvoice?.id}</strong>?
              All {cancellingInvoice?.items?.reduce((s, it) => s + (it.quantity || 0), 0)} items will be automatically returned to inventory stock with a return movement log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelModalOpen(false)}
              disabled={cancellingLoading}
            >
              No, Keep Sale
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmCancelInvoice}
              disabled={cancellingLoading}
              className="gap-1.5 font-bold"
            >
              {cancellingLoading ? <Loading01Icon className="animate-spin size-4" /> : <CheckmarkCircle01Icon className="size-4" />}
              Yes, Cancel Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── POS Receipt Modal ─── */}
      <ReceiptModal
        invoice={receiptInvoice}
        open={receiptModalOpen}
        onOpenChange={setReceiptModalOpen}
      />
    </div>
  );
}
