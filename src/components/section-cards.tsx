import {
  ChartDecreaseIcon,
  ChartIncreaseIcon,
  MoneyReceiveSquareIcon,
  ShoppingCart01Icon,
  Package01Icon,
  CheckmarkCircle01Icon,
} from "hugeicons-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export interface SectionCardsProps {
  totalRevenue?: number;
  revenueGrowth?: number;
  totalOrders?: number;
  paidOrders?: number;
  unpaidOrders?: number;
  unpaidAmount?: number;
  totalStockUnits?: number;
  totalProducts?: number;
  inventoryValue?: number;
  lowStockCount?: number;
  outOfStockCount?: number;
  loading?: boolean;
}

export function SectionCards({
  totalRevenue = 0,
  revenueGrowth = 0,
  totalOrders = 0,
  paidOrders = 0,
  unpaidOrders = 0,
  unpaidAmount = 0,
  totalStockUnits = 0,
  totalProducts = 0,
  inventoryValue = 0,
  lowStockCount = 0,
  outOfStockCount = 0,
  loading = false,
}: SectionCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-6 space-y-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-4 w-44" />
          </Card>
        ))}
      </div>
    );
  }

  const isGrowthPositive = revenueGrowth >= 0;

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {/* 1. Total Revenue */}
      <Card className="@container/card relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <MoneyReceiveSquareIcon className="size-16 text-primary" />
        </div>
        <CardHeader>
          <CardDescription className="text-muted-foreground/80 font-medium">
            Total Revenue
          </CardDescription>
          <CardTitle className="text-primary text-2xl font-bold tabular-nums @[250px]/card:text-3xl">
            ${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </CardTitle>
          <CardAction>
            <Badge
              variant="outline"
              className={`flex items-center gap-1 px-1.5 py-0.5 ${
                isGrowthPositive
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400"
                  : "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400"
              }`}
            >
              {isGrowthPositive ? (
                <ChartIncreaseIcon className="size-3.5" />
              ) : (
                <ChartDecreaseIcon className="size-3.5" />
              )}
              {isGrowthPositive ? `+${revenueGrowth.toFixed(1)}%` : `${revenueGrowth.toFixed(1)}%`}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div
            className={`line-clamp-1 flex items-center gap-1.5 font-medium ${
              isGrowthPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {isGrowthPositive ? (
              <ChartIncreaseIcon className="size-4" />
            ) : (
              <ChartDecreaseIcon className="size-4" />
            )}
            <span>{isGrowthPositive ? "Month-over-month increase" : "Month-over-month decrease"}</span>
          </div>
          <div className="text-muted-foreground/70">
            From {paidOrders} completed sales orders
          </div>
        </CardFooter>
      </Card>

      {/* 2. Total Orders */}
      <Card className="@container/card relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <ShoppingCart01Icon className="size-16 text-primary" />
        </div>
        <CardHeader>
          <CardDescription className="text-muted-foreground/80 font-medium">
            Total Sales Orders
          </CardDescription>
          <CardTitle className="text-primary text-2xl font-bold tabular-nums @[250px]/card:text-3xl">
            {totalOrders.toLocaleString()}
          </CardTitle>
          <CardAction>
            {unpaidOrders > 0 ? (
              <Badge
                variant="outline"
                className="bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400 flex items-center gap-1 px-1.5 py-0.5"
              >
                {unpaidOrders} unpaid
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center gap-1 px-1.5 py-0.5"
              >
                <CheckmarkCircle01Icon className="size-3.5" />
                All settled
              </Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex items-center gap-1.5 font-medium text-foreground">
            {unpaidOrders > 0 ? (
              <span className="text-amber-600 dark:text-amber-400">
                ${unpaidAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pending collection
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400">
                100% invoices fully paid
              </span>
            )}
          </div>
          <div className="text-muted-foreground/70">
            {paidOrders} paid out of {totalOrders} total
          </div>
        </CardFooter>
      </Card>

      {/* 3. Stock on Hand */}
      <Card className="@container/card relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <Package01Icon className="size-16 text-primary" />
        </div>
        <CardHeader>
          <CardDescription className="text-muted-foreground/80 font-medium">
            Stock on Hand
          </CardDescription>
          <CardTitle className="text-primary text-2xl font-bold tabular-nums @[250px]/card:text-3xl">
            {totalStockUnits.toLocaleString()} <span className="text-sm font-medium text-muted-foreground">units</span>
          </CardTitle>
          <CardAction>
            <Badge
              variant="outline"
              className="bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400 flex items-center gap-1 px-1.5 py-0.5"
            >
              {totalProducts} products
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400">
            <Package01Icon className="size-4" />
            <span>Active catalog inventory</span>
          </div>
          <div className="text-muted-foreground/70">
            Est. value: ${inventoryValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </CardFooter>
      </Card>

      {/* 4. Low Stock Alerts */}
      <Card className="@container/card relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <ChartDecreaseIcon className="size-16 text-destructive" />
        </div>
        <CardHeader>
          <CardDescription className="text-muted-foreground/80 font-medium">
            Low Stock Alerts
          </CardDescription>
          <CardTitle className="text-destructive text-2xl font-bold tabular-nums @[250px]/card:text-3xl">
            {lowStockCount} <span className="text-sm font-medium text-muted-foreground">items</span>
          </CardTitle>
          <CardAction>
            {lowStockCount > 0 ? (
              <Badge
                variant="outline"
                className="bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400 flex items-center gap-1 px-1.5 py-0.5"
              >
                Needs Restock
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center gap-1 px-1.5 py-0.5"
              >
                <CheckmarkCircle01Icon className="size-3.5" />
                Optimal
              </Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div
            className={`line-clamp-1 flex items-center gap-1.5 font-medium ${
              lowStockCount > 0
                ? "text-rose-600 dark:text-rose-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {lowStockCount > 0 ? (
              <span>{outOfStockCount > 0 ? `${outOfStockCount} critical out of stock` : "Stock level below threshold (≤5)"}</span>
            ) : (
              <span>All items above safe threshold</span>
            )}
          </div>
          <div className="text-muted-foreground/70">
            {lowStockCount > 0 ? "Review stock adjustment or purchase" : "Healthy stock inventory"}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
