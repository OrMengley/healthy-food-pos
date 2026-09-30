"use client"

import * as React from "react"
import Link from "next/link"
import {
  Search01Icon,
  Invoice01Icon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  Cancel01Icon,
} from "hugeicons-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Customer, SaleInvoice } from "@/types"

export interface DashboardRecentInvoicesProps {
  invoices?: SaleInvoice[];
  customers?: Customer[];
  loading?: boolean;
}

export function DashboardRecentInvoices({
  invoices = [],
  customers = [],
  loading = false,
}: DashboardRecentInvoicesProps) {
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<"all" | "paid" | "not paid">("all")

  // Customer ID to Customer name mapping
  const customerMap = React.useMemo(() => {
    const map = new Map<string, string>()
    customers.forEach((c) => map.set(c.id, c.name))
    return map
  }, [customers])

  // Filtered invoices
  const filteredInvoices = React.useMemo(() => {
    return invoices
      .filter((inv) => {
        if (statusFilter !== "all" && inv.status !== statusFilter) return false
        if (!search.trim()) return true

        const q = search.toLowerCase().trim()
        const customerName = (customerMap.get(inv.customer_id) || inv.customer_id || "").toLowerCase()
        const invoiceId = (inv.id || "").toLowerCase()
        const paymentMethod = (inv.payment_method || "").toLowerCase()

        return (
          invoiceId.includes(q) ||
          customerName.includes(q) ||
          paymentMethod.includes(q)
        )
      })
      .slice(0, 10)
  }, [invoices, customerMap, search, statusFilter])

  const getPaymentBadge = (method: string) => {
    switch (method?.toLowerCase()) {
      case "aba":
        return (
          <Badge variant="outline" className="bg-sky-500/10 text-sky-600 border-sky-500/20 dark:bg-sky-500/20 dark:text-sky-400 font-semibold uppercase text-[10px]">
            ABA
          </Badge>
        )
      case "aclida":
        return (
          <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-400 font-semibold uppercase text-[10px]">
            ACLEDA
          </Badge>
        )
      case "wing":
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400 font-semibold uppercase text-[10px]">
            WING
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400 font-semibold uppercase text-[10px]">
            CASH
          </Badge>
        )
    }
  }

  if (loading) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Invoice01Icon className="size-5 text-primary" />
            <CardTitle>Recent Sales Invoices</CardTitle>
          </div>
          <CardDescription className="mt-1">
            Latest transactions and customer orders
          </CardDescription>
        </div>
        <CardAction className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="text-primary hover:text-primary">
            <Link href="/sales" className="flex items-center gap-1 text-xs font-semibold">
              View All in Sales
              <ArrowRight01Icon className="size-3.5" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search invoice or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <Button
              size="sm"
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
              className="h-8 text-xs"
            >
              All ({invoices.length})
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "paid" ? "default" : "outline"}
              onClick={() => setStatusFilter("paid")}
              className="h-8 text-xs"
            >
              Paid
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "not paid" ? "default" : "outline"}
              onClick={() => setStatusFilter("not paid")}
              className="h-8 text-xs"
            >
              Unpaid
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[120px]">Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden md:table-cell">Items</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No sales invoices found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((inv) => {
                  const customerName = customerMap.get(inv.customer_id) || "Walk-in Customer"
                  const totalItems = inv.items?.reduce((sum, it) => sum + (it.quantity || 1), 0) || inv.items?.length || 0
                  const dateStr = inv.created_at
                    ? new Date(inv.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"

                  return (
                    <TableRow key={inv.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs font-semibold">
                        #{inv.id.slice(-6).toUpperCase()}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {customerName}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {totalItems} {totalItems === 1 ? "unit" : "units"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {dateStr}
                      </TableCell>
                      <TableCell>
                        {getPaymentBadge(inv.payment_method)}
                      </TableCell>
                      <TableCell>
                        {inv.status === "paid" ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400 gap-1 text-[11px]">
                            <CheckmarkCircle01Icon className="size-3" />
                            Paid
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400 gap-1 text-[11px]">
                            <Cancel01Icon className="size-3" />
                            Unpaid
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold text-sm tabular-nums text-foreground">
                        ${Number(inv.total_price || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
