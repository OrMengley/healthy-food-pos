"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { Skeleton } from "@/components/ui/skeleton"
import { SaleInvoice } from "@/types"

export const description = "An interactive sales and revenue area chart"

const chartConfig = {
  revenue: {
    label: "Revenue ($)",
    color: "var(--primary)",
  },
  orders: {
    label: "Orders Count",
    color: "hsl(217 91% 60%)",
  },
} satisfies ChartConfig

export interface ChartAreaInteractiveProps {
  invoices?: SaleInvoice[];
  loading?: boolean;
}

export function ChartAreaInteractive({
  invoices = [],
  loading = false,
}: ChartAreaInteractiveProps) {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("30d")

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d")
    }
  }, [isMobile])

  // Build daily data series based on the selected time range
  const { chartData, totalRangeRevenue, totalRangeOrders } = React.useMemo(() => {
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90
    const points: { date: string; revenue: number; orders: number }[] = []
    const now = new Date()

    // Initialize day slots
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(now.getDate() - i)
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, "0")
      const day = String(d.getDate()).padStart(2, "0")
      const dateStr = `${year}-${month}-${day}`

      points.push({
        date: dateStr,
        revenue: 0,
        orders: 0,
      })
    }

    const dateMap = new Map<string, { revenue: number; orders: number }>()
    points.forEach((p) => dateMap.set(p.date, p))

    let rangeRevenue = 0
    let rangeOrders = 0

    // Aggregate from invoices
    invoices.forEach((inv) => {
      if (!inv.created_at) return
      const invDate = new Date(inv.created_at)
      if (isNaN(invDate.getTime())) return

      const year = invDate.getFullYear()
      const month = String(invDate.getMonth() + 1).padStart(2, "0")
      const day = String(invDate.getDate()).padStart(2, "0")
      const dateStr = `${year}-${month}-${day}`

      const point = dateMap.get(dateStr)
      if (point) {
        const amt = Number(inv.total_price || 0)
        point.revenue += amt
        point.orders += 1
        rangeRevenue += amt
        rangeOrders += 1
      }
    })

    return {
      chartData: points,
      totalRangeRevenue: rangeRevenue,
      totalRangeOrders: rangeOrders,
    }
  }, [invoices, timeRange])

  if (loading) {
    return (
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
          <Skeleton className="h-[250px] w-full rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  const rangeLabel =
    timeRange === "7d"
      ? "Last 7 days"
      : timeRange === "30d"
      ? "Last 30 days"
      : "Last 3 months"

  return (
    <Card className="@container/card">
      <CardHeader>
        <div>
          <CardTitle>Sales & Revenue Activity</CardTitle>
          <CardDescription className="mt-1">
            <span className="font-semibold text-foreground">
              ${totalRangeRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>{" "}
            total revenue across{" "}
            <span className="font-semibold text-foreground">{totalRangeOrders}</span> orders in the {rangeLabel.toLowerCase()}
          </CardDescription>
        </div>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(v) => v && setTimeRange(v)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
            <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a timeframe"
            >
              <SelectValue placeholder="Last 30 days" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                Last 3 months
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                Last 30 days
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Last 7 days
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[260px] w-full"
        >
          <AreaChart data={chartData} margin={{ left: 12, right: 12, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--primary)"
                  stopOpacity={0.85}
                />
                <stop
                  offset="95%"
                  stopColor="var(--primary)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted/40" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--primary)", strokeWidth: 1, strokeDasharray: "4 4" }}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  }}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="revenue"
              name="Revenue ($)"
              type="monotone"
              fill="url(#fillRevenue)"
              stroke="var(--primary)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

