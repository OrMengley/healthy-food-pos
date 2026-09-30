"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { getSaleInvoices } from "@/lib/firebase/sale-actions";
import { getProducts, getCategories } from "@/lib/firebase/actions";
import { getStocks } from "@/lib/firebase/stock-actions";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import { Product, Stock, SaleInvoice, Category, StoreSettings } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart01Icon,
  Dollar01Icon,
  Package01Icon,
  Alert02Icon,
  ChartIncreaseIcon,
  Add01Icon,
  ArrowDown01Icon,
  Settings01Icon,
  Loading01Icon,
  BarcodeScanIcon,
  PrinterIcon,
} from "hugeicons-react";
import { format, isToday } from "date-fns";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { useAuth } from "@/hooks/useAuth";

export default function DashboardPage() {
  const { user, role } = useAuth();
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);

  const [receiptInvoice, setReceiptInvoice] = useState<SaleInvoice | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        const [invs, prods, stks, cats, storeConfig] = await Promise.all([
          getSaleInvoices(),
          getProducts(),
          getStocks(),
          getCategories(),
          getStoreSettings(),
        ]);

        const isSuperAdmin = role === "super_admin";
        const userWhId = user?.warehouse_id;

        const filteredInvs = (!isSuperAdmin && userWhId) 
          ? invs.filter(i => i.warehouse_id === userWhId) 
          : invs;

        const filteredStks = (!isSuperAdmin && userWhId)
          ? stks.filter(s => s.warehouse_id === userWhId)
          : stks;

        setInvoices(filteredInvs);
        setProducts(prods);
        setStocks(filteredStks);
        setCategories(cats);
        setSettings(storeConfig);
      } catch (err) {
        console.error("Failed to load dashboard live data", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [user, role]);

  const metrics = useMemo(() => {
    let todaySalesUsd = 0;
    let todayOrdersCount = 0;
    let allTimeSalesUsd = 0;

    const productSalesMap: Record<string, { product_id: string; name: string; quantity: number; revenue: number }> = {};

    invoices.forEach((inv) => {
      const isArchived = inv.is_archived || inv.status === "not paid";
      if (isArchived) return;

      const total = Number(inv.total_price || 0);
      allTimeSalesUsd += total;

      const createdAt = inv.created_at ? new Date(inv.created_at) : new Date();
      if (isToday(createdAt)) {
        todaySalesUsd += total;
        todayOrdersCount += 1;
      }

      // Track item sales
      inv.items?.forEach((item) => {
        if (!productSalesMap[item.product_id]) {
          productSalesMap[item.product_id] = {
            product_id: item.product_id,
            name: item.product_name,
            quantity: 0,
            revenue: 0,
          };
        }
        productSalesMap[item.product_id].quantity += item.quantity;
        productSalesMap[item.product_id].revenue += Number(item.total_price || 0);
      });
    });

    const bestSellers = Object.values(productSalesMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Stock & Inventory Calculations
    const productStockMap = new Map<string, number>();
    let totalStockUnits = 0;

    stocks.forEach((s) => {
      const qty = Number(s.quantity || 0);
      totalStockUnits += qty;
      const current = productStockMap.get(s.product_id) || 0;
      productStockMap.set(s.product_id, current + qty);
    });

    const lowStockItems: { product: Product; current_stock: number }[] = [];
    products.forEach((p) => {
      if (p.status === "inactive") return;
      const stock = productStockMap.get(p.id) ?? 0;
      if (stock <= 5) {
        lowStockItems.push({ product: p, current_stock: stock });
      }
    });

    const rate = settings.exchange_rate_khr || 4100;
    const todaySalesKhr = Math.round(todaySalesUsd * rate);

    return {
      todaySalesUsd,
      todaySalesKhr,
      todayOrdersCount,
      allTimeSalesUsd,
      totalStockUnits,
      totalProducts: products.filter((p) => p.status !== "inactive").length,
      lowStockItems,
      bestSellers,
      productStockMap,
    };
  }, [invoices, products, stocks, settings]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loading01Icon className="animate-spin size-8 text-primary" />
        <p className="text-sm font-semibold">Loading Healthy Food Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Welcome & Quick Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 rounded-2xl border border-primary/15">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">
            Store Management Overview
          </span>
          <h1 className="text-2xl font-black tracking-tight text-foreground mt-0.5">
            {settings.store_name || "Healthy Food POS"}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Single-store cashier counter & stock tracking. Exchange rate: 1 USD = {settings.exchange_rate_khr?.toLocaleString() || "4,100"} ៛
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <Button asChild size="sm" className="bg-primary hover:bg-primary/90 font-bold gap-1.5 shadow-md">
            <Link href="/pos">
              <ShoppingCart01Icon className="size-4" />
              Open POS
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="font-semibold gap-1.5 bg-background">
            <Link href="/stock/in">
              <ArrowDown01Icon className="size-4 text-emerald-600" />
              Stock In
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="font-semibold gap-1.5 bg-background">
            <Link href="/products">
              <Add01Icon className="size-4 text-primary" />
              Products
            </Link>
          </Button>
        </div>
      </div>

      {/* Top 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Today Sales */}
        <Card className="border-primary/15 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Today&apos;s Sales</span>
              <Dollar01Icon className="size-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-600 tabular-nums">
              ${metrics.todaySalesUsd.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-semibold text-muted-foreground pt-0">
            {metrics.todaySalesKhr.toLocaleString()} ៛ (KHR)
          </CardContent>
        </Card>

        {/* 2. Today Orders */}
        <Card className="border-primary/15 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Today&apos;s Orders</span>
              <ShoppingCart01Icon className="size-4 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-foreground tabular-nums">
              {metrics.todayOrdersCount} {metrics.todayOrdersCount === 1 ? "Sale" : "Sales"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-medium text-muted-foreground pt-0">
            Across counter register
          </CardContent>
        </Card>

        {/* 3. Low Stock Alert */}
        <Card className="border-primary/15 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Low Stock Alert (≤5)</span>
              <Alert02Icon className="size-4 text-amber-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-amber-600 tabular-nums">
              {metrics.lowStockItems.length} {metrics.lowStockItems.length === 1 ? "Item" : "Items"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-medium text-muted-foreground pt-0">
            {metrics.lowStockItems.filter(i => i.current_stock <= 0).length} items out of stock
          </CardContent>
        </Card>

        {/* 4. Total Current Stock */}
        <Card className="border-primary/15 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Total Current Stock</span>
              <Package01Icon className="size-4 text-blue-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-blue-600 tabular-nums">
              {metrics.totalStockUnits} Units
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-medium text-muted-foreground pt-0">
            Across {metrics.totalProducts} active products
          </CardContent>
        </Card>
      </div>

      {/* Middle Grid: Best Sellers & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Best Selling Healthy Food Products */}
        <Card className="border-primary/15 shadow-sm">
          <CardHeader className="pb-3 bg-muted/20 border-b">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <ChartIncreaseIcon className="size-5 text-primary" />
              Best Selling Products
            </CardTitle>
            <CardDescription className="text-xs">
              Top items ranked by units sold in counter sales.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {metrics.bestSellers.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No completed sales recorded yet.
              </div>
            ) : (
              <div className="divide-y">
                {metrics.bestSellers.map((item, idx) => (
                  <div key={item.product_id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary font-black text-xs">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-bold text-sm text-foreground">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground">${item.revenue.toFixed(2)} total revenue</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="font-bold text-xs">
                      {item.quantity} units sold
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Items Attention List */}
        <Card className="border-primary/15 shadow-sm">
          <CardHeader className="pb-3 bg-muted/20 border-b">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-amber-700">
              <Alert02Icon className="size-5 text-amber-500" />
              Low Stock Items (Restock Needed)
            </CardTitle>
            <CardDescription className="text-xs">
              Items with current stock at or below 5 units.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {metrics.lowStockItems.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                All products have healthy stock levels (&gt; 5 units).
              </div>
            ) : (
              <div className="divide-y max-h-[300px] overflow-y-auto">
                {metrics.lowStockItems.map(({ product, current_stock }) => (
                  <div key={product.id} className="flex items-center justify-between p-3.5 hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="font-bold text-sm text-foreground">{product.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{product.barcode}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs font-bold ${
                          current_stock <= 0
                            ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        }`}
                      >
                        {current_stock <= 0 ? "Out of Stock" : `${current_stock} left`}
                      </Badge>
                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs text-primary font-bold">
                        <Link href="/stock/in">Restock</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section: Recent Counter Sales */}
      <Card className="border-primary/15 shadow-sm">
        <CardHeader className="pb-3 bg-muted/20 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <ShoppingCart01Icon className="size-5 text-primary" />
              Recent Counter Sales
            </CardTitle>
            <CardDescription className="text-xs">
              Latest invoices processed from the POS register.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm" className="text-xs font-semibold">
            <Link href="/pos">View All Sales</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No sales invoices generated yet.
            </div>
          ) : (
            <div className="divide-y">
              {invoices.slice(0, 5).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-xs">
                  <div>
                    <div className="font-mono font-bold text-sm text-primary">{inv.invoice_number || inv.id}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {inv.created_at ? format(new Date(inv.created_at), "dd MMM yyyy, HH:mm") : "—"} • Cashier: {inv.created_by_name || "Admin"}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="uppercase font-bold text-[10px]">
                      {inv.payment_method}
                    </Badge>
                    <div className="text-right">
                      <div className="font-black text-sm text-foreground">${Number(inv.total_price || 0).toFixed(2)}</div>
                      <div className="text-[10px] text-muted-foreground font-medium">
                        {Math.round(Number(inv.total_price || 0) * (inv.exchange_rate_khr || 4100)).toLocaleString()} ៛
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setReceiptInvoice(inv);
                        setReceiptModalOpen(true);
                      }}
                      className="h-8 text-xs text-primary font-semibold"
                    >
                      <PrinterIcon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receipt Modal */}
      <ReceiptModal
        invoice={receiptInvoice}
        open={receiptModalOpen}
        onOpenChange={setReceiptModalOpen}
      />
    </div>
  );
}
