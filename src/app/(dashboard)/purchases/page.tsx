"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Add01Icon,
  Delete01Icon,
  Loading01Icon,
  ViewIcon,
  Cancel01Icon,
  Invoice01Icon,
  Calendar01Icon,
  Search01Icon,
  Package01Icon,
  Dollar01Icon,
  Refresh01Icon,
  Layers01Icon,
  Store01Icon,
  Call02Icon,
  StickyNote02Icon,
  BarcodeScanIcon,
  PrinterIcon,
  UserIcon,
  Home01Icon,
  CheckmarkCircle01Icon,
  Alert02Icon,
  InformationCircleIcon,
  Alert01Icon,
} from "hugeicons-react";
import Image from "next/image";
import {
  getPurchases,
  getPurchaseItems,
  cancelPurchase,
  canCancelPurchase,
  PurchaseCancelCheckResult,
} from "@/lib/firebase/purchase-actions";
import { getWarehouses } from "@/lib/firebase/warehouse-actions";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import { useAuth } from "@/hooks/useAuth";
import { Purchase, PurchaseItem, Warehouse, StoreSettings } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getOptimizedImageUrl,
  formatCambodiaDate,
  parseCambodiaInputDate,
  getCambodiaDateString,
  isTodayCambodia,
  isYesterdayCambodia,
  isThisMonthCambodia
} from "@/lib/utils";
import { toast } from "sonner";
import { subDays } from "date-fns";

type DateRangePreset = "today" | "yesterday" | "last7days" | "thisMonth" | "all" | "custom";
type StatusFilter = "all" | "completed" | "cancelled";

export default function PurchasesPage() {
  const router = useRouter();
  const { user, role } = useAuth();
  const canManagePurchases = role === "admin" || role === "super_admin";

  // Data state
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Filters state (Default Date Filter: TODAY in Cambodia)
  const [datePreset, setDatePreset] = useState<DateRangePreset>("today");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [customStartDate, setCustomStartDate] = useState(getCambodiaDateString(new Date()));
  const [customEndDate, setCustomEndDate] = useState(getCambodiaDateString(new Date()));
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("all");

  // Detail Sheet state
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);
  const [viewingItems, setViewingItems] = useState<PurchaseItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // Cancel modal state
  const [purchaseToCancel, setPurchaseToCancel] = useState<Purchase | null>(null);
  const [cancelCheck, setCancelCheck] = useState<PurchaseCancelCheckResult | null>(null);
  const [isCheckingCancel, setIsCheckingCancel] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelReasonError, setCancelReasonError] = useState("");

  // Fetch all purchases and dependencies
  async function fetchData() {
    try {
      setLoading(true);
      const [purchasesList, warehouseList, storeConfig] = await Promise.all([
        getPurchases(),
        getWarehouses(),
        getStoreSettings(),
      ]);

      setPurchases(purchasesList);
      setWarehouses(warehouseList);
      setSettings(storeConfig);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load purchase records");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const warehouseMap = useMemo(() => {
    const map: Record<string, string> = { main: "Main Warehouse" };
    warehouses.forEach((w) => {
      map[w.id] = w.name;
    });
    return map;
  }, [warehouses]);

  // ─── Filter Purchases by Cambodia Date Range, Status, Warehouse, and Search Query ───
  const filteredPurchases = useMemo(() => {
    const now = new Date();

    return purchases.filter((p) => {
      const pDate = new Date(p.date || p.created_at);

      // 1. Date Range Filter in Cambodia Timezone (UTC+7)
      if (datePreset === "today") {
        if (!isTodayCambodia(pDate)) return false;
      } else if (datePreset === "yesterday") {
        if (!isYesterdayCambodia(pDate)) return false;
      } else if (datePreset === "last7days") {
        const sevenDaysAgo = subDays(now, 7);
        if (pDate < sevenDaysAgo || pDate > now) return false;
      } else if (datePreset === "thisMonth") {
        if (!isThisMonthCambodia(pDate)) return false;
      } else if (datePreset === "custom") {
        if (customStartDate && customEndDate) {
          const s = parseCambodiaInputDate(`${customStartDate}T00:00:00`);
          const e = parseCambodiaInputDate(`${customEndDate}T23:59:59`);
          if (pDate < s || pDate > e) return false;
        }
      }

      // 2. Status Filter
      const pStatus = p.status || (p.is_deleted ? "cancelled" : "completed");
      if (statusFilter !== "all" && pStatus !== statusFilter) {
        return false;
      }

      // 3. Warehouse Filter
      if (selectedWarehouseId !== "all") {
        if ((p.warehouse_id || "main") !== selectedWarehouseId) return false;
      }

      // 4. Search Query (PO # or Supplier)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchRef = p.reference_no?.toLowerCase().includes(q);
        const matchSupplier = p.supplier_name?.toLowerCase().includes(q);
        const matchPhone = p.supplier_phone?.includes(q);
        const matchCreator = p.created_by_name?.toLowerCase().includes(q);
        if (!matchRef && !matchSupplier && !matchPhone && !matchCreator) return false;
      }

      return true;
    });
  }, [purchases, datePreset, statusFilter, customStartDate, customEndDate, selectedWarehouseId, searchQuery]);

  // ─── Dashboard Summary Net Spend & Active KPIs ───
  const summaryKpis = useMemo(() => {
    const activePurchases = filteredPurchases.filter((p) => p.status !== "cancelled");
    const cancelledPurchases = filteredPurchases.filter((p) => p.status === "cancelled");

    const activeCount = activePurchases.length;
    const cancelledCount = cancelledPurchases.length;
    const totalUnits = activePurchases.reduce((sum, p) => sum + (Number(p.total_quantity) || 0), 0);
    const totalCostUsd = activePurchases.reduce((sum, p) => sum + (Number(p.total_price) || 0), 0);
    const totalCostKhr = Math.round(totalCostUsd * (settings.exchange_rate_khr || 4100));

    return {
      activeCount,
      cancelledCount,
      totalUnits,
      totalCostUsd,
      totalCostKhr,
    };
  }, [filteredPurchases, settings]);

  // ─── Open Purchase Detail Sheet ───
  const handleViewPurchase = async (purchase: Purchase) => {
    setViewingPurchase(purchase);
    setDetailOpen(true);
    setLoadingDetail(true);

    try {
      const items = await getPurchaseItems(purchase.id);
      setViewingItems(items);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load purchase items details");
    } finally {
      setLoadingDetail(false);
    }
  };

  // ─── Print Clean Purchase Order Invoice (with Cambodia Timezone) ───
  const handlePrintPurchaseInvoice = (purchase: Purchase, items: PurchaseItem[]) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to print invoices");
      return;
    }

    const costUsd = Number(purchase.total_price || 0);
    const exchangeRate = settings.exchange_rate_khr || 4100;
    const costKhr = Math.round(costUsd * exchangeRate);
    const targetWhName = warehouseMap[purchase.warehouse_id || "main"] || "Main Warehouse";
    const cambodiaDateStr = formatCambodiaDate(purchase.date || purchase.created_at, "invoice");
    const isCancelled = purchase.status === "cancelled";

    const itemsRowsHtml = items
      .map(
        (item, idx) => {
          const unitCost = Number(item.cost || 0);
          const unitKhr = Math.round(unitCost * exchangeRate);
          const lineTotal = Number(item.total || item.quantity * unitCost);
          const lineKhr = Math.round(lineTotal * exchangeRate);

          return `
          <tr>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 11px;">${idx + 1}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb;">
              <div style="font-weight: 700; color: #111827; font-size: 12px;">${item.product_name || item.product_id}</div>
              ${item.product_barcode ? `<div style="font-size: 10px; color: #6b7280; font-family: monospace;">Barcode: ${item.product_barcode}</div>` : ""}
            </td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: center; font-weight: 700; font-size: 12px; color: #111827;">${item.quantity}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 12px; font-family: monospace;">
              <div>$${unitCost.toFixed(2)}</div>
              <div style="font-size: 10px; color: #6b7280;">${unitKhr.toLocaleString()} ៛</div>
            </td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 700; font-size: 12px; font-family: monospace; color: #059669;">
              <div>$${lineTotal.toFixed(2)}</div>
              <div style="font-size: 10px; color: #6b7280; font-weight: normal;">${lineKhr.toLocaleString()} ៛</div>
            </td>
          </tr>
        `;
        }
      )
      .join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Purchase Invoice #${purchase.reference_no}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              color: #1f2937;
              background: #fff;
              padding: 20px;
              font-size: 12px;
              line-height: 1.4;
            }
            .invoice-box {
              max-width: 800px;
              margin: 0 auto;
            }
            .header-table {
              width: 100%;
              margin-bottom: 24px;
              border-bottom: 2px solid ${isCancelled ? "#e11d48" : "#10b981"};
              padding-bottom: 16px;
            }
            .store-name {
              font-size: 22px;
              font-weight: 900;
              color: #065f46;
              text-transform: uppercase;
              letter-spacing: -0.5px;
            }
            .store-meta {
              font-size: 11px;
              color: #4b5563;
              margin-top: 4px;
              line-height: 1.4;
            }
            .invoice-badge {
              text-align: right;
            }
            .invoice-title {
              font-size: 20px;
              font-weight: 900;
              color: #111827;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .po-number {
              font-size: 14px;
              font-weight: 700;
              color: #059669;
              font-family: monospace;
              margin-top: 2px;
            }
            .cancel-stamp {
              color: #e11d48;
              border: 2px solid #e11d48;
              display: inline-block;
              padding: 4px 10px;
              font-weight: 900;
              text-transform: uppercase;
              font-size: 12px;
              border-radius: 6px;
              margin-top: 4px;
            }
            .meta-grid {
              width: 100%;
              margin-bottom: 24px;
              background: #f9fafb;
              border-radius: 8px;
              border: 1px solid #e5e7eb;
              padding: 12px 16px;
            }
            .meta-col {
              vertical-align: top;
              width: 50%;
            }
            .meta-label {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              color: #6b7280;
              letter-spacing: 0.5px;
              margin-bottom: 2px;
            }
            .meta-val {
              font-size: 12px;
              font-weight: 600;
              color: #111827;
              margin-bottom: 8px;
            }
            .items-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            .items-table th {
              background: #f3f4f6;
              color: #374151;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              padding: 10px;
              border-bottom: 2px solid #e5e7eb;
            }
            .summary-table {
              width: 100%;
              margin-top: 10px;
              margin-bottom: 30px;
            }
            .grand-total-box {
              background: #ecfdf5;
              border: 1px solid #a7f3d0;
              border-radius: 8px;
              padding: 12px 16px;
              text-align: right;
            }
            .signatures {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px dashed #d1d5db;
              width: 100%;
            }
            .sign-col {
              width: 50%;
              text-align: center;
              padding: 0 20px;
            }
            .sign-line {
              border-top: 1px solid #374151;
              margin-top: 50px;
              padding-top: 6px;
              font-size: 11px;
              font-weight: 600;
              color: #4b5563;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="invoice-box">
            <table class="header-table">
              <tr>
                <td>
                  <div class="store-name">${settings.store_name || "Healthy Food Store"}</div>
                  <div class="store-meta">
                    <div>📍 ${settings.store_address || "Phnom Penh, Cambodia"}</div>
                    <div>📞 ${settings.store_phone || "+855 12 345 678"}</div>
                  </div>
                </td>
                <td class="invoice-badge">
                  <div class="invoice-title">PURCHASE INVOICE</div>
                  <div class="po-number">${purchase.reference_no}</div>
                  ${isCancelled ? '<div class="cancel-stamp">CANCELLED / VOIDED</div>' : '<div style="font-size: 10px; color: #059669; font-weight: bold; margin-top: 4px;">INVENTORY STOCK-IN</div>'}
                </td>
              </tr>
            </table>

            <table class="meta-grid">
              <tr>
                <td class="meta-col">
                  <div class="meta-label">Purchase Date & Time (Cambodia Timezone)</div>
                  <div class="meta-val">${cambodiaDateStr} (ICT / UTC+7)</div>

                  <div class="meta-label">Receiving Warehouse</div>
                  <div class="meta-val">${targetWhName}</div>
                </td>
                <td class="meta-col" style="padding-left: 20px;">
                  <div class="meta-label">Supplier / Vendor</div>
                  <div class="meta-val">
                    <strong>${purchase.supplier_name || "Direct Vendor / Walk-in"}</strong>
                    ${purchase.supplier_phone ? `<span style="color: #6b7280; font-size: 11px;"> (${purchase.supplier_phone})</span>` : ""}
                  </div>

                  <div class="meta-label">Recorded By</div>
                  <div class="meta-val">${purchase.created_by_name || purchase.created_by || "Admin"}</div>
                </td>
              </tr>
              ${purchase.note ? `
              <tr>
                <td colspan="2" style="padding-top: 8px; border-top: 1px dashed #e5e7eb;">
                  <span class="meta-label">Order Reference Note: </span>
                  <span style="font-size: 11px; color: #374151;">${purchase.note}</span>
                </td>
              </tr>` : ""}
              ${isCancelled ? `
              <tr>
                <td colspan="2" style="padding-top: 8px; border-top: 1px dashed #fecdd3; color: #e11d48;">
                  <span class="meta-label" style="color: #e11d48;">Cancellation Details: </span>
                  <span style="font-size: 11px; font-weight: 600;">Cancelled by ${purchase.cancelled_by_name || purchase.cancelled_by || "Admin"} — Reason: ${purchase.cancel_reason || "Voided"}</span>
                </td>
              </tr>` : ""}
            </table>

            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 40px; text-align: center;">#</th>
                  <th style="text-align: left;">Product Item</th>
                  <th style="width: 90px; text-align: center;">Qty (Units)</th>
                  <th style="width: 140px; text-align: right;">Unit Cost ($ / ៛)</th>
                  <th style="width: 150px; text-align: right;">Line Total ($ / ៛)</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRowsHtml}
              </tbody>
            </table>

            <table class="summary-table">
              <tr>
                <td style="width: 50%; vertical-align: top;">
                  <div style="font-size: 11px; color: #6b7280;">
                    <div>• Total SKUs: <strong>${items.length}</strong></div>
                    <div>• Total Restocked Units: <strong>${purchase.total_quantity || 0} units</strong></div>
                    <div>• Status: <strong>${isCancelled ? "Cancelled / Voided" : "Completed"}</strong></div>
                    <div>• Exchange Rate: <strong>1 USD = ${exchangeRate.toLocaleString()} KHR</strong></div>
                  </div>
                </td>
                <td style="width: 50%;">
                  <div class="grand-total-box">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #065f46; letter-spacing: 0.5px;">Grand Total Cost</div>
                    <div style="font-size: 24px; font-weight: 900; color: #059669; font-family: monospace;">$${costUsd.toFixed(2)} USD</div>
                    <div style="font-size: 12px; font-weight: 700; color: #374151; font-family: monospace; margin-top: 2px;">≈ ${costKhr.toLocaleString()} ៛ KHR</div>
                  </div>
                </td>
              </tr>
            </table>

            <table class="signatures">
              <tr>
                <td class="sign-col">
                  <div class="sign-line">Received & Inspected By</div>
                </td>
                <td class="sign-col">
                  <div class="sign-line">Authorized Manager Signature</div>
                </td>
              </tr>
            </table>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ─── Initiate Cancel with Real-time Batch Check ───
  const handleInitiateCancel = async (e: React.MouseEvent | null, purchase: Purchase) => {
    if (e) e.stopPropagation();
    setPurchaseToCancel(purchase);
    setCancelReason("");
    setCancelReasonError("");
    setCancelDialogOpen(true);
    setIsCheckingCancel(true);
    setCancelCheck(null);

    try {
      const checkResult = await canCancelPurchase(purchase.id);
      setCancelCheck(checkResult);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to verify purchase cancellation eligibility");
      setCancelCheck({
        canCancel: false,
        canDelete: false,
        reason: err.message || "Failed to verify stock batch integrity.",
        khmerReason: "មិនអាចពិនិត្យស្ថានភាពស្តុកបានទេ។",
        violations: [],
      });
    } finally {
      setIsCheckingCancel(false);
    }
  };

  // ─── Confirm Cancel & Void Stock Transaction ───
  const handleConfirmCancel = async () => {
    if (!purchaseToCancel) return;

    if (!cancelReason.trim()) {
      setCancelReasonError("Please enter a reason for cancelling this purchase order.");
      return;
    }

    setIsCancelling(true);

    try {
      await cancelPurchase(purchaseToCancel.id, cancelReason.trim(), {
        id: user?.id || user?.uid || "admin",
        name: user?.name || user?.email || "Admin",
      });
      toast.success(`Purchase Order #${purchaseToCancel.reference_no} cancelled successfully!`);
      setCancelDialogOpen(false);
      setDetailOpen(false);
      setPurchaseToCancel(null);
      setCancelReason("");
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to cancel purchase record");
    } finally {
      setIsCancelling(false);
    }
  };

  const hasActiveFilters =
    datePreset !== "today" ||
    statusFilter !== "all" ||
    selectedWarehouseId !== "all" ||
    searchQuery.trim() !== "";

  const handleResetFilters = () => {
    setDatePreset("today");
    setStatusFilter("all");
    setSelectedWarehouseId("all");
    setSearchQuery("");
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-8 max-w-7xl mx-auto w-full">
      {/* ─── Page Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-2xs">
            <Invoice01Icon className="size-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight md:text-2xl text-foreground">
                Purchases & Stock In
              </h1>
              <Badge variant="outline" className="font-mono text-xs font-bold">
                {purchases.length} Total
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Track vendor purchase invoices, inventory restock batches, and cost expenditures.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="h-9 text-xs font-semibold rounded-xl border-border/80 hover:bg-muted"
          >
            <Refresh01Icon className={`size-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => router.push("/stock/in")}
            className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs gap-1.5"
          >
            <Add01Icon className="size-4" />
            <span>Create Purchase</span>
          </Button>
        </div>
      </div>

      {/* ─── 1. Dashboard Summary Cost KPI Cards (Net Purchases) ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Active Orders */}
        <Card className="rounded-2xl border border-border/80 shadow-2xs bg-card overflow-hidden">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                Completed Orders ({datePreset === "today" ? "Today" : datePreset === "all" ? "All Time" : "Filtered"})
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-foreground">
                  {summaryKpis.activeCount}
                </span>
                {summaryKpis.cancelledCount > 0 && (
                  <span className="text-[11px] font-semibold text-rose-500 font-mono">
                    ({summaryKpis.cancelledCount} voided)
                  </span>
                )}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Invoice01Icon className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* Total Units Restocked */}
        <Card className="rounded-2xl border border-border/80 shadow-2xs bg-card overflow-hidden">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                Active Restocked Units
              </span>
              <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                {summaryKpis.totalUnits.toLocaleString()}{" "}
                <span className="text-xs font-semibold text-muted-foreground">Units</span>
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Layers01Icon className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* Total Net Spend ($ USD) */}
        <Card className="rounded-2xl border border-border/80 shadow-2xs bg-card overflow-hidden">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                Net Spend (USD)
              </span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                ${summaryKpis.totalCostUsd.toFixed(2)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Dollar01Icon className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* Total Net Spend (KHR ៛) */}
        <Card className="rounded-2xl border border-border/80 shadow-2xs bg-card overflow-hidden">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                Net Spend (KHR)
              </span>
              <span className="text-xl font-black text-foreground font-mono">
                {summaryKpis.totalCostKhr.toLocaleString()} ៛
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-muted text-muted-foreground font-black text-xs">
              ៛
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── 2. Filters Bar & Date Range Presets ─── */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search01Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by PO Ref # (PO-...), supplier, phone, or creator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-8 h-10 text-sm bg-background rounded-xl border-border/80"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              >
                <Cancel01Icon className="size-4" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={(val: StatusFilter) => setStatusFilter(val)}>
            <SelectTrigger className="h-10 w-[150px] bg-background text-xs font-semibold rounded-xl border-border/80">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed Only</SelectItem>
              <SelectItem value="cancelled">Cancelled Only</SelectItem>
            </SelectContent>
          </Select>

          {/* Warehouse Filter */}
          <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
            <SelectTrigger className="h-10 w-[170px] bg-background text-xs font-semibold rounded-xl border-border/80">
              <SelectValue placeholder="All Warehouses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Warehouses</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id} className="text-xs">
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="h-10 px-3 text-xs text-muted-foreground hover:text-foreground shrink-0 border-dashed rounded-xl"
            >
              <Cancel01Icon className="size-3.5 mr-1 text-destructive" />
              Reset
            </Button>
          )}
        </div>

        {/* Date Range Quick Filter Pills (Default: TODAY) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-border/60 scrollbar-none">
          <span className="text-xs text-muted-foreground font-bold mr-1 shrink-0 flex items-center gap-1">
            <Calendar01Icon className="size-3.5" /> Date:
          </span>

          <Button
            type="button"
            size="sm"
            variant={datePreset === "today" ? "default" : "outline"}
            onClick={() => setDatePreset("today")}
            className="h-7 text-xs rounded-full px-3 shrink-0 font-bold"
          >
            Today
          </Button>

          <Button
            type="button"
            size="sm"
            variant={datePreset === "yesterday" ? "default" : "outline"}
            onClick={() => setDatePreset("yesterday")}
            className="h-7 text-xs rounded-full px-3 shrink-0 font-medium"
          >
            Yesterday
          </Button>

          <Button
            type="button"
            size="sm"
            variant={datePreset === "last7days" ? "default" : "outline"}
            onClick={() => setDatePreset("last7days")}
            className="h-7 text-xs rounded-full px-3 shrink-0 font-medium"
          >
            Last 7 Days
          </Button>

          <Button
            type="button"
            size="sm"
            variant={datePreset === "thisMonth" ? "default" : "outline"}
            onClick={() => setDatePreset("thisMonth")}
            className="h-7 text-xs rounded-full px-3 shrink-0 font-medium"
          >
            This Month
          </Button>

          <Button
            type="button"
            size="sm"
            variant={datePreset === "all" ? "default" : "outline"}
            onClick={() => setDatePreset("all")}
            className="h-7 text-xs rounded-full px-3 shrink-0 font-medium"
          >
            All Time
          </Button>

          <Button
            type="button"
            size="sm"
            variant={datePreset === "custom" ? "default" : "outline"}
            onClick={() => setDatePreset("custom")}
            className="h-7 text-xs rounded-full px-3 shrink-0 font-medium"
          >
            Custom Range
          </Button>

          {/* Custom Date Pickers */}
          {datePreset === "custom" && (
            <div className="flex items-center gap-2 pl-2">
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-7 text-xs bg-background w-32 rounded-lg"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-7 text-xs bg-background w-32 rounded-lg"
              />
            </div>
          )}
        </div>
      </div>

      {/* ─── 3. Purchases Data Table ─── */}
      <Card className="rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="font-bold">PO Reference #</TableHead>
              <TableHead className="font-bold">Status</TableHead>
              <TableHead className="font-bold">Purchase Date</TableHead>
              <TableHead className="font-bold">Supplier / Vendor</TableHead>
              <TableHead className="font-bold">Warehouse</TableHead>
              <TableHead className="text-center font-bold">Items & Units</TableHead>
              <TableHead className="font-bold">Total Cost ($ / KHR)</TableHead>
              <TableHead className="font-bold">Created By</TableHead>
              <TableHead className="text-right font-bold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center h-48">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loading01Icon className="animate-spin size-6 text-primary" />
                    <span>Loading purchase orders...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredPurchases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center h-48 text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2 py-6">
                    <Invoice01Icon className="size-8 text-muted-foreground/50" />
                    <p className="font-semibold text-sm">No purchase records found</p>
                    <p className="text-xs text-muted-foreground">
                      {hasActiveFilters
                        ? "Try changing your date filter or search criteria."
                        : "Create your first purchase stock in order."}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => router.push("/stock/in")}
                      className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl"
                    >
                      + Create Purchase Stock In
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredPurchases.map((purchase) => {
                const pDate = new Date(purchase.date || purchase.created_at);
                const costUsd = Number(purchase.total_price || 0);
                const costKhr = Math.round(costUsd * (settings.exchange_rate_khr || 4100));
                const isCancelled = purchase.status === "cancelled";

                return (
                  <TableRow
                    key={purchase.id}
                    onClick={() => handleViewPurchase(purchase)}
                    className={`cursor-pointer transition-colors group ${
                      isCancelled ? "bg-muted/20 opacity-75 hover:bg-muted/40" : "hover:bg-muted/30"
                    }`}
                  >
                    {/* PO Reference Number */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={`font-mono font-bold text-xs px-2 py-0.5 ${
                            isCancelled
                              ? "bg-muted text-muted-foreground border-border line-through"
                              : "bg-primary/5 text-primary border-primary/20"
                          }`}
                        >
                          {purchase.reference_no}
                        </Badge>
                      </div>
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell>
                      {isCancelled ? (
                        <Badge
                          variant="outline"
                          className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[11px] font-bold gap-1 px-2 py-0.5"
                        >
                          <Cancel01Icon className="size-3" />
                          Cancelled
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] font-bold gap-1 px-2 py-0.5"
                        >
                          <CheckmarkCircle01Icon className="size-3" />
                          Completed
                        </Badge>
                      )}
                    </TableCell>

                    {/* Purchase Date & Time (Cambodia Timezone) */}
                    <TableCell>
                      <div className="text-sm font-semibold text-foreground">
                        {formatCambodiaDate(pDate, "date")}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {formatCambodiaDate(pDate, "time")}
                      </div>
                    </TableCell>

                    {/* Supplier */}
                    <TableCell>
                      {purchase.supplier_name ? (
                        <div>
                          <div className="font-bold text-sm text-foreground">
                            {purchase.supplier_name}
                          </div>
                          {purchase.supplier_phone && (
                            <div className="text-[11px] text-muted-foreground font-mono">
                              {purchase.supplier_phone}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Direct / Walk-in</span>
                      )}
                    </TableCell>

                    {/* Warehouse */}
                    <TableCell>
                      <Badge variant="secondary" className="font-medium text-xs">
                        {warehouseMap[purchase.warehouse_id || "main"] || "Main Warehouse"}
                      </Badge>
                    </TableCell>

                    {/* Items & Units */}
                    <TableCell className="text-center">
                      <div className="font-bold text-sm text-foreground">
                        {purchase.items_count || 1} {purchase.items_count === 1 ? "item" : "items"}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-medium">
                        {purchase.total_quantity || 0} units
                      </div>
                    </TableCell>

                    {/* Total Cost */}
                    <TableCell>
                      <div
                        className={`font-extrabold text-sm ${
                          isCancelled
                            ? "text-muted-foreground line-through"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        ${costUsd.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-medium font-mono">
                        ≈ {costKhr.toLocaleString()} ៛
                      </div>
                    </TableCell>

                    {/* Created By */}
                    <TableCell>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {purchase.created_by_name || purchase.created_by || "Admin"}
                      </span>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleViewPurchase(purchase)}
                          className="size-8 text-primary hover:bg-primary/10 rounded-lg"
                          title="View Purchase Details"
                        >
                          <ViewIcon className="size-4" />
                        </Button>
                        {canManagePurchases && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => handleInitiateCancel(e, purchase)}
                            disabled={isCancelled}
                            className={`size-8 rounded-lg ${
                              isCancelled
                                ? "text-muted-foreground/40 cursor-not-allowed"
                                : "text-destructive hover:bg-destructive/10"
                            }`}
                            title={isCancelled ? "Purchase already cancelled" : "Cancel Purchase Order"}
                          >
                            <Cancel01Icon className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ─── 4. Purchase Details Full Screen Dialog Modal ─── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent
          showCloseButton={false}
          className="fixed inset-0 sm:inset-2 md:inset-4 lg:inset-6 !top-0 sm:!top-2 md:!top-4 lg:!top-6 !left-0 sm:!left-2 md:!left-4 lg:!left-6 !translate-x-0 !translate-y-0 !max-w-none sm:!max-w-none md:!max-w-none !w-auto !h-auto p-0 flex flex-col gap-0 rounded-none sm:rounded-2xl md:rounded-3xl overflow-hidden border border-border/80 bg-background shadow-2xl z-50 outline-none"
        >
          {/* Header Bar */}
          <DialogHeader className="p-4 sm:px-6 py-4 border-b border-border/70 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent shrink-0 flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-primary text-primary-foreground shadow-xs">
                <Invoice01Icon className="size-5" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-lg sm:text-xl font-black tracking-tight text-foreground">
                    Purchase Order Details
                  </DialogTitle>
                  {viewingPurchase && (
                    <>
                      <Badge className="font-mono font-bold text-xs bg-primary/15 text-primary border-primary/30 px-2 py-0.5">
                        {viewingPurchase.reference_no}
                      </Badge>
                      {viewingPurchase.status === "cancelled" ? (
                        <Badge
                          variant="outline"
                          className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-xs font-bold gap-1"
                        >
                          <Cancel01Icon className="size-3" />
                          Cancelled / Voided
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-bold gap-1"
                        >
                          <CheckmarkCircle01Icon className="size-3" />
                          Restocked & Completed
                        </Badge>
                      )}
                    </>
                  )}
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Full vendor restock invoice, item breakdown, and inventory audit trail.
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => viewingPurchase && handlePrintPurchaseInvoice(viewingPurchase, viewingItems)}
                disabled={!viewingPurchase}
                className="h-8 text-xs font-semibold rounded-xl border-border/80 hover:bg-muted gap-1.5"
              >
                <PrinterIcon className="size-3.5" />
                <span className="hidden sm:inline">Print Invoice</span>
              </Button>
              {canManagePurchases && viewingPurchase && viewingPurchase.status !== "cancelled" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => handleInitiateCancel(e, viewingPurchase)}
                  className="h-8 text-xs font-semibold rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 gap-1.5"
                >
                  <Cancel01Icon className="size-3.5" />
                  <span className="hidden sm:inline">Cancel Purchase</span>
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setDetailOpen(false)}
                className="size-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <Cancel01Icon className="size-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </DialogHeader>

          {viewingPurchase && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* Cancellation Audit Banner if Cancelled */}
              {viewingPurchase.status === "cancelled" && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3.5">
                  <div className="p-2 rounded-xl bg-rose-500/20 text-rose-700 dark:text-rose-400 shrink-0">
                    <Alert02Icon className="size-5" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-sm font-black text-rose-900 dark:text-rose-200">
                        Purchase Order Cancelled & Stock Voided
                      </span>
                      <Badge variant="outline" className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40 text-[11px] font-mono">
                        purchase_void transaction logged
                      </Badge>
                    </div>
                    <p className="text-xs text-rose-800/90 dark:text-rose-300/90">
                      <strong>Reason:</strong> {viewingPurchase.cancel_reason || "No cancellation reason provided."}
                    </p>
                    <div className="text-[11px] text-muted-foreground pt-1 flex items-center gap-4 flex-wrap">
                      <span>
                        Cancelled By: <strong>{viewingPurchase.cancelled_by_name || viewingPurchase.cancelled_by || "Admin"}</strong>
                      </span>
                      {viewingPurchase.cancelled_at && (
                        <span>
                          Cancelled At: <strong>{formatCambodiaDate(viewingPurchase.cancelled_at, "datetime")} (ICT / UTC+7)</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 1. Meta Details 4-Column Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* Purchase Date */}
                <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/70 flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                    <Calendar01Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Purchase Date & Time
                      </span>
                      <Badge variant="outline" className="text-[9px] font-mono font-bold bg-primary/5 text-primary border-primary/20 px-1 py-0">
                        ICT (UTC+7)
                      </Badge>
                    </div>
                    <span className="text-xs font-bold text-foreground block truncate">
                      {formatCambodiaDate(viewingPurchase.date || viewingPurchase.created_at, "date")}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {formatCambodiaDate(viewingPurchase.date || viewingPurchase.created_at, "time")}
                    </span>
                  </div>
                </div>

                {/* Target Warehouse */}
                <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/70 flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                    <Home01Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Target Warehouse
                    </span>
                    <span className="text-xs font-bold text-foreground block truncate">
                      {warehouseMap[viewingPurchase.warehouse_id || "main"] || "Main Warehouse"}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-medium">
                      Inventory Location
                    </span>
                  </div>
                </div>

                {/* Supplier / Vendor */}
                <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/70 flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Store01Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Supplier / Vendor
                    </span>
                    <span className="text-xs font-bold text-foreground block truncate">
                      {viewingPurchase.supplier_name || "Direct / Walk-in"}
                    </span>
                    {viewingPurchase.supplier_phone ? (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono block truncate">
                        {viewingPurchase.supplier_phone}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">No phone provided</span>
                    )}
                  </div>
                </div>

                {/* Created By */}
                <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/70 flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
                    <UserIcon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Recorded By
                    </span>
                    <span className="text-xs font-bold text-foreground block truncate">
                      {viewingPurchase.created_by_name || viewingPurchase.created_by || "Admin"}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Staff / Register
                    </span>
                  </div>
                </div>
              </div>

              {/* Order Note Banner if present */}
              {viewingPurchase.note && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs">
                  <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-400 shrink-0">
                    <StickyNote02Icon className="size-4" />
                  </div>
                  <div>
                    <span className="font-bold text-amber-900 dark:text-amber-200 block mb-0.5">
                      Order Reference & Note
                    </span>
                    <p className="text-amber-800 dark:text-amber-300/90">{viewingPurchase.note}</p>
                  </div>
                </div>
              )}

              {/* 2. Full Products Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                    <Package01Icon className="size-4 text-primary" />
                    <span>Purchased Products ({viewingItems.length} SKUs)</span>
                  </h3>
                  <Badge variant="outline" className="text-xs font-mono font-bold px-2.5 py-0.5">
                    Total Units: {viewingPurchase.total_quantity || 0} Units
                  </Badge>
                </div>

                {loadingDetail ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Loading01Icon className="size-7 animate-spin text-primary" />
                    <span className="text-xs">Loading purchased items breakdown...</span>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border/80 overflow-hidden bg-card shadow-xs">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="w-12 text-center font-bold text-xs">#</TableHead>
                          <TableHead className="font-bold text-xs">Product</TableHead>
                          <TableHead className="font-bold text-xs">Barcode</TableHead>
                          <TableHead className="text-center font-bold text-xs">Restocked Qty</TableHead>
                          <TableHead className="text-right font-bold text-xs">Unit Cost (USD)</TableHead>
                          <TableHead className="text-right font-bold text-xs">Unit Cost (KHR)</TableHead>
                          <TableHead className="text-right font-bold text-xs">Line Total (USD)</TableHead>
                          <TableHead className="text-right font-bold text-xs">Line Total (KHR)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewingItems.map((item, idx) => {
                          const unitCostUsd = Number(item.cost || 0);
                          const unitCostKhr = Math.round(unitCostUsd * (settings.exchange_rate_khr || 4100));
                          const lineTotalUsd = Number(item.total || item.quantity * unitCostUsd);
                          const lineTotalKhr = Math.round(lineTotalUsd * (settings.exchange_rate_khr || 4100));

                          return (
                            <TableRow key={item.id || idx} className="hover:bg-muted/30">
                              <TableCell className="text-center font-mono text-xs text-muted-foreground font-semibold">
                                {idx + 1}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="relative size-10 rounded-xl overflow-hidden border bg-muted shrink-0 flex items-center justify-center">
                                    {item.product_image ? (
                                      <Image
                                        src={getOptimizedImageUrl(item.product_image, 150, 150)}
                                        alt={item.product_name || "Product"}
                                        fill
                                        className="object-cover"
                                        sizes="40px"
                                      />
                                    ) : (
                                      <Package01Icon className="size-5 text-muted-foreground" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-bold text-sm text-foreground">
                                      {item.product_name || item.product_id}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">
                                      ID: {item.product_id}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {item.product_barcode ? (
                                  <Badge variant="outline" className="font-mono text-[11px] px-2 py-0.5">
                                    {item.product_barcode}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">No barcode</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge className="font-bold text-xs font-mono px-2.5 py-0.5 bg-primary/10 text-primary border-primary/20">
                                  {item.quantity} Units
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-bold text-xs font-mono text-foreground">
                                ${unitCostUsd.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right text-xs font-mono text-muted-foreground">
                                ≈ {unitCostKhr.toLocaleString()} ៛
                              </TableCell>
                              <TableCell className="text-right font-extrabold text-sm font-mono text-emerald-600 dark:text-emerald-400">
                                ${lineTotalUsd.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs text-muted-foreground font-medium">
                                ≈ {lineTotalKhr.toLocaleString()} ៛
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* 3. Summary & Grand Total Banner */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                {/* Left: Summary Metrics */}
                <div className="p-4 rounded-2xl bg-muted/40 border border-border/70 flex flex-col justify-between gap-3">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Order Metrics Summary
                  </span>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-background border border-border/60">
                      <span className="text-[10px] font-bold text-muted-foreground block">Unique SKUs</span>
                      <span className="text-base font-black text-foreground">
                        {viewingItems.length}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-background border border-border/60">
                      <span className="text-[10px] font-bold text-muted-foreground block">Total Units</span>
                      <span className="text-base font-black text-blue-600 dark:text-blue-400">
                        {viewingPurchase.total_quantity || 0}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-background border border-border/60">
                      <span className="text-[10px] font-bold text-muted-foreground block">Avg Unit Cost</span>
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                        ${viewingPurchase.total_quantity ? (Number(viewingPurchase.total_price || 0) / viewingPurchase.total_quantity).toFixed(2) : "0.00"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Grand Total Box */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/30 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block mb-1">
                      Grand Total Purchase Spend
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Calculated across all line items in this restock order.
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                      ${Number(viewingPurchase.total_price || 0).toFixed(2)}
                    </div>
                    <div className="text-xs font-bold text-muted-foreground font-mono mt-0.5">
                      ≈ {Math.round(Number(viewingPurchase.total_price || 0) * (settings.exchange_rate_khr || 4100)).toLocaleString()} ៛ KHR
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── 5. Cancel Purchase Order Confirmation Modal ─── */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden border border-border/80 bg-background shadow-2xl rounded-2xl">
          <DialogHeader className="p-5 pb-3 border-b bg-muted/40">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl ${
                  cancelCheck && !cancelCheck.canCancel
                    ? "bg-red-500/15 text-red-600 dark:text-red-400"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {cancelCheck && !cancelCheck.canCancel ? (
                  <Alert02Icon className="size-5" />
                ) : (
                  <Cancel01Icon className="size-5" />
                )}
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  {cancelCheck && !cancelCheck.canCancel
                    ? "Cannot Cancel Purchase Order"
                    : "Cancel Purchase Order"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {purchaseToCancel ? `PO Reference: ${purchaseToCancel.reference_no}` : ""}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-5 space-y-4">
            {isCheckingCancel ? (
              <div className="py-8 text-center space-y-3">
                <Loading01Icon className="size-8 animate-spin mx-auto text-primary" />
                <p className="text-xs text-muted-foreground font-medium">
                  Checking inventory batches and sales history...
                </p>
              </div>
            ) : cancelCheck && !cancelCheck.canCancel ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-bold text-xs">
                    <Alert02Icon className="size-4 shrink-0" />
                    <span>Inventory From This Purchase Has Already Been Sold Or Used</span>
                  </div>
                  <p className="text-xs text-red-600/95 dark:text-red-400/95 leading-relaxed font-medium">
                    {cancelCheck.khmerReason || "មិនអាចលុបការទិញនេះបានទេ ព្រោះមានទំនិញមួយចំនួនពីការទិញនេះត្រូវបានលក់ ឬប្រើប្រាស់រួចហើយ។"}
                  </p>
                  <p className="text-xs text-red-600/80 dark:text-red-400/80 leading-relaxed">
                    {cancelCheck.reason || "This purchase cannot be cancelled because some items from this purchase have already been sold or used."}
                  </p>
                </div>

                {cancelCheck.violations.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Affected Line Items Breakdown
                    </span>
                    <div className="border rounded-xl divide-y bg-muted/20 overflow-hidden">
                      {cancelCheck.violations.map((v) => (
                        <div key={v.productId} className="p-3 text-xs flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="font-bold text-foreground block truncate">
                              {v.productName}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              Purchased: {v.purchasedQty} units
                            </span>
                          </div>
                          <div className="text-right shrink-0 space-y-0.5">
                            <span className="font-black text-red-600 dark:text-red-400 font-mono block">
                              {v.soldQty} units sold/used
                            </span>
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 block font-medium">
                              {v.remainingQty} remaining in batch
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-muted/40 border text-[11px] text-muted-foreground leading-relaxed">
                  <strong>Batch Protection Rule:</strong> A purchase order can only be cancelled if <strong>100% of the purchased units remain in warehouse stock</strong>. This prevents inventory discrepancies and maintains sales integrity.
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCancelDialogOpen(false)}
                    className="rounded-xl px-4 text-xs font-semibold"
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-xs">
                    <CheckmarkCircle01Icon className="size-4 shrink-0 text-amber-600" />
                    <span>Eligible For Cancellation (All Units Unsold)</span>
                  </div>
                  <p className="text-xs text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                    All <strong>{purchaseToCancel?.total_quantity || 0} units</strong> from Purchase Order <strong>#{purchaseToCancel?.reference_no}</strong> are currently unsold in stock batches.
                  </p>
                </div>

                {/* Required Cancellation Reason */}
                <div className="space-y-1.5">
                  <Label htmlFor="cancel-reason" className="text-xs font-bold text-foreground">
                    Reason for Cancellation <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="cancel-reason"
                    placeholder="Enter reason for cancelling this purchase (e.g. entered wrong quantities, wrong supplier, duplicate restock record)..."
                    value={cancelReason}
                    onChange={(e) => {
                      setCancelReason(e.target.value);
                      if (cancelReasonError) setCancelReasonError("");
                    }}
                    rows={3}
                    className={`text-xs rounded-xl ${cancelReasonError ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
                  />
                  {cancelReasonError && (
                    <p className="text-[11px] text-destructive font-medium flex items-center gap-1">
                      <Alert01Icon className="size-3" />
                      <span>{cancelReasonError}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-2 text-xs text-muted-foreground">
                  <span className="font-bold text-foreground block">
                    What happens when you confirm:
                  </span>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Purchase status will be marked as <strong>Cancelled</strong> (kept in history for audit).</li>
                    <li>
                      <strong>{purchaseToCancel?.total_quantity || 0} units</strong> will be deducted from warehouse inventory batches.
                    </li>
                    <li>
                      A <strong>purchase_void</strong> stock transaction will be recorded (does NOT affect Profit & Loss or stock loss reports).
                    </li>
                  </ul>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCancelDialogOpen(false)}
                    disabled={isCancelling}
                    className="rounded-xl text-xs font-semibold"
                  >
                    Keep Purchase
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleConfirmCancel}
                    disabled={isCancelling}
                    className="rounded-xl text-xs font-semibold gap-1.5"
                  >
                    {isCancelling ? (
                      <>
                        <Loading01Icon className="size-3.5 animate-spin" />
                        <span>Cancelling Order...</span>
                      </>
                    ) : (
                      <>
                        <Cancel01Icon className="size-3.5" />
                        <span>Cancel Purchase</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
