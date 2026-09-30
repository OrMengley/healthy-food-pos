"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import {
  AlertCircleIcon,
  Package01Icon,
  ArrowRight01Icon,
  ChartIncreaseIcon,
  Archive02Icon,
} from "hugeicons-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Product, Stock, SaleInvoice } from "@/types"
import { getOptimizedImageUrl } from "@/lib/utils"

export interface DashboardInventoryHighlightsProps {
  products?: Product[];
  stocks?: Stock[];
  invoices?: SaleInvoice[];
  loading?: boolean;
}

export function DashboardInventoryHighlights({
  products = [],
  stocks = [],
  invoices = [],
  loading = false,
}: DashboardInventoryHighlightsProps) {
  // Aggregate stock by product_id
  const productStockMap = React.useMemo(() => {
    const map = new Map<string, number>()
    stocks.forEach((s) => {
      const cur = map.get(s.product_id) || 0
      map.set(s.product_id, cur + (s.quantity || 0))
    })
    return map
  }, [stocks])

  // Low stock products (stock <= 5)
  const lowStockProducts = React.useMemo(() => {
    return products
      .map((p) => {
        const stockQty = productStockMap.get(p.id) ?? 0
        return {
          ...p,
          current_stock: stockQty,
        }
      })
      .filter((p) => p.current_stock <= 5)
      .sort((a, b) => a.current_stock - b.current_stock)
      .slice(0, 5)
  }, [products, productStockMap])

  // Top selling products from invoices
  const topSellingProducts = React.useMemo(() => {
    const salesMap = new Map<string, { qty: number; revenue: number; name: string; image?: string }>()

    invoices.forEach((inv) => {
      inv.items?.forEach((it) => {
        const key = it.product_id || it.product_name
        const existing = salesMap.get(key) || {
          qty: 0,
          revenue: 0,
          name: it.product_name,
          image: it.product_image,
        }
        existing.qty += it.quantity || 1
        existing.revenue += it.total_price || (it.price * (it.quantity || 1))
        salesMap.set(key, existing)
      })
    })

    return Array.from(salesMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
  }, [invoices])

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-52" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Low Stock Alerts Card */}
      <Card className="flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <div className="flex items-center gap-2">
              <AlertCircleIcon className="size-5 text-destructive" />
              <CardTitle className="text-base font-bold">Low Stock Alerts</CardTitle>
            </div>
            <CardDescription className="text-xs mt-1">
              Items requiring immediate restock (≤ 5 units)
            </CardDescription>
          </div>
          <CardAction>
            <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-xs text-primary">
              <Link href="/stock-adjustment" className="flex items-center gap-1 font-semibold">
                Adjust
                <ArrowRight01Icon className="size-3" />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {lowStockProducts.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              ✨ All products have healthy stock levels!
            </div>
          ) : (
            lowStockProducts.map((p) => {
              const imgUrl = p.thumbnails?.[0] || p.images?.[0]
              const isOut = p.current_stock <= 0

              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border bg-card/60 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-md border bg-muted flex items-center justify-center">
                      {imgUrl ? (
                        <Image
                          src={getOptimizedImageUrl(imgUrl, 100)}
                          alt={p.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <Package01Icon className="size-5 text-muted-foreground/60" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate text-foreground">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {p.barcode || "No Barcode"}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <Badge
                      variant="outline"
                      className={`text-xs font-bold px-2 py-0.5 ${
                        isOut
                          ? "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400"
                      }`}
                    >
                      {isOut ? "0 left" : `${p.current_stock} left`}
                    </Badge>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* 2. Top Fast Movers Card */}
      <Card className="flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <div className="flex items-center gap-2">
              <ChartIncreaseIcon className="size-5 text-primary" />
              <CardTitle className="text-base font-bold">Top Selling Products</CardTitle>
            </div>
            <CardDescription className="text-xs mt-1">
              Best performing inventory by sales volume
            </CardDescription>
          </div>
          <CardAction>
            <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-xs text-primary">
              <Link href="/reports/inventory" className="flex items-center gap-1 font-semibold">
                Report
                <ArrowRight01Icon className="size-3" />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {topSellingProducts.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No sales recorded yet.
            </div>
          ) : (
            topSellingProducts.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg border bg-card/60 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-6 shrink-0 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate text-foreground">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.qty} units sold
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span className="font-bold text-sm tabular-nums text-foreground">
                    ${item.revenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
