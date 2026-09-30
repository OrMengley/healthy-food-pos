"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Archive02Icon,
  Loading01Icon,
  Search01Icon,
  Package01Icon,
  Alert02Icon,
  Cancel01Icon,
  DollarCircleIcon,
  ChartIncreaseIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowLeftDoubleIcon,
  ArrowRightDoubleIcon,
  FilterIcon,
  Recycle01Icon,
  ShoppingCart01Icon,
  Settings01Icon,
  ViewIcon,
  BarcodeScanIcon,
  Image01Icon,
  Home01Icon,
  Add01Icon,
  PrinterIcon,
  Invoice01Icon,
  UserIcon,
} from "hugeicons-react";
import Image from "next/image";
import { getProducts, getCategories } from "@/lib/firebase/actions";
import { getStocks, getStockMovements } from "@/lib/firebase/stock-actions";
import { getWarehouses } from "@/lib/firebase/warehouse-actions";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import { Product, Stock, StockMovement, StockMovementType, Warehouse, Category, StoreSettings } from "@/types";
import { format } from "date-fns";
import { getOptimizedImageUrl } from "@/lib/utils";

// Constants
const LOW_STOCK_THRESHOLD = 5;

// Movement type configuration
const movementTypeConfig: Record<
  StockMovementType,
  { label: string; color: string; bgColor: string; icon: React.ReactNode }
> = {
  stock_in: {
    label: "Purchase",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
    icon: <ArrowDown01Icon className="size-3.5" />,
  },
  stock_out: {
    label: "Sale",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    icon: <ShoppingCart01Icon className="size-3.5" />,
  },
  adjustment: {
    label: "Adjustment",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
    icon: <Settings01Icon className="size-3.5" />,
  },
  return: {
    label: "Return",
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-500/10 border-violet-500/20",
    icon: <Recycle01Icon className="size-3.5" />,
  },
  transfer: {
    label: "Transfer",
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-500/10 border-cyan-500/20",
    icon: <ArrowRight01Icon className="size-3.5" />,
  },
  purchase_void: {
    label: "Purchase Void",
    color: "text-rose-600 dark:text-rose-400",
    bgColor: "bg-rose-500/10 border-rose-500/20",
    icon: <Cancel01Icon className="size-3.5" />,
  },
};

function getStockStatus(stock: number) {
  if (stock <= 0)
    return {
      label: "Out of Stock",
      variant: "destructive" as const,
      dotColor: "bg-red-500",
    };
  if (stock <= LOW_STOCK_THRESHOLD)
    return {
      label: "Low Stock",
      variant: "outline" as const,
      dotColor: "bg-amber-500",
    };
  return {
    label: "In Stock",
    variant: "outline" as const,
    dotColor: "bg-emerald-500",
  };
}

// ─── Merged Inventory Type ──────────────────────────────
interface MergedInventoryItem {
  id: string; // Master ID (first one found)
  product_ids: string[];
  name: string;
  barcode: string;
  price: number;
  avg_cost: number;
  current_stock: number;
  total_value: number;
  thumbnails?: string[];
  images?: string[];
  category_id?: string;
}

export default function InventoryPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("inventory");

  // Filter states - Inventory
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Filter states - Movements
  const [movementSearch, setMovementSearch] = useState("");
  const [movementTypeFilter, setMovementTypeFilter] = useState("all");
  const [movementDateSort, setMovementDateSort] = useState<"asc" | "desc">(
    "desc"
  );

  // Filter states - Batches
  const [batchSearch, setBatchSearch] = useState("");
  const [batchWarehouseFilter, setBatchWarehouseFilter] = useState("all");
  const [batchStockFilter, setBatchStockFilter] = useState("active");
  const [batchSortBy, setBatchSortBy] = useState("date");
  const [batchSortOrder, setBatchSortOrder] = useState<"asc" | "desc">("desc");

  // Pagination
  const [invPage, setInvPage] = useState(0);
  const [movPage, setMovPage] = useState(0);
  const [batchPage, setBatchPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Detail dialog
  const [detailProduct, setDetailProduct] = useState<MergedInventoryItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Alert panel
  const [showAlerts, setShowAlerts] = useState(false);

  async function fetchData() {
    try {
      setLoading(true);
      const [prods, stks, mvts, whs, cats, storeConfig] = await Promise.all([
        getProducts(),
        getStocks(),
        getStockMovements(),
        getWarehouses(),
        getCategories(),
        getStoreSettings(),
      ]);
      setProducts(prods);
      setStocks(stks);
      setMovements(mvts);
      setWarehouses(whs);
      setCategories(cats);
      setSettings(storeConfig);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const productMap = useMemo(() => {
    const map: Record<string, Product> = {};
    products.forEach((p) => (map[p.id] = p));
    return map;
  }, [products]);

  const warehouseMap = useMemo(() => {
    const map: Record<string, Warehouse> = {};
    warehouses.forEach((w) => (map[w.id] = w));
    return map;
  }, [warehouses]);

  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => (map[c.id] = c.name));
    return map;
  }, [categories]);

  // ─── Merged Inventory Logic ─────────────────────────────
  const mergedInventory = useMemo(() => {
    const groups = new Map<string, MergedInventoryItem>();

    // 1. Initialize groups with product data
    products.forEach((p) => {
      // If filtering by category
      if (categoryFilter !== "all" && p.category_id !== categoryFilter) return;

      const key = `${p.name.trim().toLowerCase()}_${(p.barcode || "").trim().toLowerCase()}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: p.id,
          product_ids: [p.id],
          name: p.name,
          barcode: p.barcode,
          price: p.price,
          avg_cost: p.cost_recommand || 0,
          current_stock: 0, // Reset to calculate from stocks
          total_value: 0,
          thumbnails: p.thumbnails,
          images: p.images,
          category_id: p.category_id,
        });
      } else {
        const item = groups.get(key)!;
        item.product_ids.push(p.id);
        if (p.price > item.price) item.price = p.price;
        if (!item.thumbnails?.[0] && p.thumbnails?.[0]) {
          item.thumbnails = p.thumbnails;
        }
      }
    });

    // 2. Aggregate from stocks collection
    stocks.forEach((s) => {
      // Warehouse filter
      if (warehouseFilter !== "all" && s.warehouse_id !== warehouseFilter) return;

      const p = productMap[s.product_id];
      if (!p) return;
      
      const key = `${p.name.trim().toLowerCase()}_${(p.barcode || "").trim().toLowerCase()}`;
      const item = groups.get(key);
      if (item && !s.is_archived) {
        item.current_stock += Number(s.quantity || 0);
        item.total_value += (Number(s.cost || 0) * Number(s.quantity || 0));
      }
    });

    // 3. Calculate Average Cost
    groups.forEach((item) => {
      if (item.current_stock > 0) {
        item.avg_cost = item.total_value / item.current_stock;
      }
    });

    return Array.from(groups.values());
  }, [products, stocks, productMap, categoryFilter, warehouseFilter]);

  // Dashboard statistics
  const stats = useMemo(() => {
    const totalItems = mergedInventory.length;
    const outOfStock = mergedInventory.filter((p) => p.current_stock <= 0).length;
    const nearlyOutOfStock = mergedInventory.filter(
      (p) => p.current_stock > 0 && p.current_stock <= LOW_STOCK_THRESHOLD
    ).length;
    const totalCost = mergedInventory.reduce((sum, p) => sum + p.total_value, 0);
    const totalStockUnits = mergedInventory.reduce(
      (sum, p) => sum + p.current_stock,
      0
    );

    return { totalItems, outOfStock, nearlyOutOfStock, totalCost, totalStockUnits };
  }, [mergedInventory]);

  // Alert items
  const alertItems = useMemo(() => {
    const outOfStockItems = mergedInventory.filter((p) => p.current_stock <= 0);
    const lowStockItems = mergedInventory.filter(
      (p) => p.current_stock > 0 && p.current_stock <= LOW_STOCK_THRESHOLD
    );
    return { outOfStockItems, lowStockItems };
  }, [mergedInventory]);

  // Filtered & sorted inventory data
  const filteredProducts = useMemo(() => {
    let result = [...mergedInventory];

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q)
      );
    }

    // Stock status filter
    if (stockFilter === "in_stock")
      result = result.filter((p) => p.current_stock > LOW_STOCK_THRESHOLD);
    else if (stockFilter === "low_stock")
      result = result.filter(
        (p) => p.current_stock > 0 && p.current_stock <= LOW_STOCK_THRESHOLD
      );
    else if (stockFilter === "out_of_stock")
      result = result.filter((p) => p.current_stock <= 0);

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "stock") cmp = a.current_stock - b.current_stock;
      else if (sortBy === "price") cmp = a.price - b.price;
      else if (sortBy === "cost")
        cmp = a.avg_cost - b.avg_cost;
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return result;
  }, [mergedInventory, searchQuery, stockFilter, sortBy, sortOrder]);

  // Paginated inventory
  const paginatedProducts = useMemo(() => {
    const start = invPage * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, invPage, pageSize]);

  const invTotalPages = Math.ceil(filteredProducts.length / pageSize);

  // Filtered & sorted movements
  const filteredMovements = useMemo(() => {
    let result = [...movements];

    if (movementSearch) {
      const q = movementSearch.toLowerCase();
      result = result.filter((m) => {
        const prod = productMap[m.product_id];
        return (
          prod?.name.toLowerCase().includes(q) ||
          m.reference?.toLowerCase().includes(q) ||
          m.note?.toLowerCase().includes(q)
        );
      });
    }

    if (movementTypeFilter !== "all") {
      result = result.filter((m) => m.type === movementTypeFilter);
    }

    result.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return movementDateSort === "desc" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [movements, movementSearch, movementTypeFilter, movementDateSort, productMap]);

  // Paginated movements
  const paginatedMovements = useMemo(() => {
    const start = movPage * pageSize;
    return filteredMovements.slice(start, start + pageSize);
  }, [filteredMovements, movPage, pageSize]);

  const movTotalPages = Math.ceil(filteredMovements.length / pageSize);

  // Filtered & sorted batches
  const filteredBatches = useMemo(() => {
    let result = [...stocks].filter((s) => !s.is_archived);

    // Warehouse filter
    if (batchWarehouseFilter !== "all") {
      result = result.filter((s) => s.warehouse_id === batchWarehouseFilter);
    }

    // Stock availability filter
    if (batchStockFilter === "active") {
      result = result.filter((s) => s.quantity > 0);
    } else if (batchStockFilter === "out_of_stock") {
      result = result.filter((s) => s.quantity <= 0);
    }

    // Search filter
    if (batchSearch) {
      const q = batchSearch.toLowerCase();
      result = result.filter((s) => {
        const prod = productMap[s.product_id];
        const wh = warehouseMap[s.warehouse_id];
        return (
          prod?.name.toLowerCase().includes(q) ||
          prod?.barcode?.toLowerCase().includes(q) ||
          s.product_barcode?.toLowerCase().includes(q) ||
          wh?.name.toLowerCase().includes(q)
        );
      });
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (batchSortBy === "name") {
        const nameA = productMap[a.product_id]?.name || "";
        const nameB = productMap[b.product_id]?.name || "";
        cmp = nameA.localeCompare(nameB);
      } else if (batchSortBy === "cost") {
        cmp = (a.cost || 0) - (b.cost || 0);
      } else if (batchSortBy === "quantity") {
        cmp = (a.quantity || 0) - (b.quantity || 0);
      } else if (batchSortBy === "value") {
        cmp =
          (a.cost || 0) * (a.quantity || 0) - (b.cost || 0) * (b.quantity || 0);
      } else if (batchSortBy === "date") {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        cmp = dateA - dateB;
      }
      return batchSortOrder === "asc" ? cmp : -cmp;
    });

    return result;
  }, [
    stocks,
    batchWarehouseFilter,
    batchStockFilter,
    batchSearch,
    batchSortBy,
    batchSortOrder,
    productMap,
    warehouseMap,
  ]);

  // Batch summary stats
  const batchStats = useMemo(() => {
    const totalBatches = filteredBatches.length;
    const totalQuantity = filteredBatches.reduce(
      (sum, b) => sum + (b.quantity || 0),
      0
    );
    const totalValue = filteredBatches.reduce(
      (sum, b) => sum + (b.cost || 0) * (b.quantity || 0),
      0
    );
    const uniqueWarehouses = new Set(
      filteredBatches.map((b) => b.warehouse_id)
    ).size;
    return { totalBatches, totalQuantity, totalValue, uniqueWarehouses };
  }, [filteredBatches]);

  // Paginated batches
  const paginatedBatches = useMemo(() => {
    const start = batchPage * pageSize;
    return filteredBatches.slice(start, start + pageSize);
  }, [filteredBatches, batchPage, pageSize]);

  const batchTotalPages = Math.ceil(filteredBatches.length / pageSize);

  // Reset page on filter change
  useEffect(() => {
    setInvPage(0);
  }, [searchQuery, stockFilter, sortBy, sortOrder]);

  useEffect(() => {
    setMovPage(0);
  }, [movementSearch, movementTypeFilter, movementDateSort]);

  useEffect(() => {
    setBatchPage(0);
  }, [
    batchWarehouseFilter,
    batchStockFilter,
    batchSearch,
    batchSortBy,
    batchSortOrder,
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-8 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-2xl bg-primary/10 text-primary shadow-2xs">
            <Archive02Icon className="size-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight md:text-2xl text-foreground">
                Inventory & Stock Management
              </h1>
              <Badge variant="outline" className="font-mono text-xs font-bold">
                {stats.totalStockUnits.toLocaleString()} Units
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time multi-warehouse stock levels, FIFO batches, and asset valuation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="h-9 text-xs font-semibold rounded-xl border-border/80 hover:bg-muted gap-1.5"
          >
            <PrinterIcon className="size-3.5" />
            <span className="hidden md:inline">Print Report</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/stock-adjustment")}
            className="h-9 text-xs font-semibold rounded-xl border-border/80 hover:bg-muted gap-1.5"
          >
            <Settings01Icon className="size-3.5" />
            <span className="hidden md:inline">Adjustment</span>
          </Button>

          <Button
            size="sm"
            onClick={() => router.push("/stock/in")}
            className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs gap-1.5"
          >
            <Add01Icon className="size-4" />
            <span>+ Purchase Stock In</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="relative h-9 rounded-xl border-border/80"
            onClick={() => setShowAlerts(!showAlerts)}
          >
            <Alert02Icon className="size-4" />
            <span className="hidden sm:inline">Alerts</span>
            {(stats.outOfStock > 0 || stats.nearlyOutOfStock > 0) && (
              <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
                {stats.outOfStock + stats.nearlyOutOfStock}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card className="relative overflow-hidden border-primary/20 shadow-2xs rounded-2xl bg-card">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Total Inventory Value
              </span>
              <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <DollarCircleIcon className="size-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-primary tabular-nums">
              ${stats.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono font-medium mt-0.5">
              ≈ {Math.round(stats.totalCost * (settings.exchange_rate_khr || 4100)).toLocaleString()} ៛ KHR
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-blue-500/20 shadow-2xs rounded-2xl bg-card">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Stock On Hand
              </span>
              <div className="size-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Package01Icon className="size-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-blue-600 dark:text-blue-400 tabular-nums">
              {stats.totalStockUnits.toLocaleString()}{" "}
              <span className="text-xs font-semibold text-muted-foreground">Units</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Across {stats.totalItems} catalog SKUs
            </p>
          </CardContent>
        </Card>

        <Card
          className="relative overflow-hidden border-amber-500/20 shadow-2xs rounded-2xl bg-card cursor-pointer hover:border-amber-500/40 transition-colors"
          onClick={() => {
            setStockFilter("low_stock");
            setActiveTab("inventory");
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Low Stock Warning
              </span>
              <div className="size-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Alert02Icon className="size-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums">
              {stats.nearlyOutOfStock}{" "}
              <span className="text-xs font-semibold text-muted-foreground">SKUs</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Below {LOW_STOCK_THRESHOLD} units remaining
            </p>
          </CardContent>
        </Card>

        <Card
          className="relative overflow-hidden border-red-500/20 shadow-2xs rounded-2xl bg-card cursor-pointer hover:border-red-500/40 transition-colors"
          onClick={() => {
            setStockFilter("out_of_stock");
            setActiveTab("inventory");
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Out of Stock
              </span>
              <div className="size-8 rounded-xl bg-red-500/10 flex items-center justify-center text-red-600 dark:text-red-400">
                <Cancel01Icon className="size-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-red-600 dark:text-red-400 tabular-nums">
              {stats.outOfStock}{" "}
              <span className="text-xs font-semibold text-muted-foreground">SKUs</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Needs immediate restock order
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Stock Alert Panel */}
      {showAlerts && (alertItems.outOfStockItems.length > 0 || alertItems.lowStockItems.length > 0) && (
        <Card className="overflow-hidden border-amber-500/30 bg-card shadow-md animate-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-3 pt-4 px-4 border-b border-border/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Alert02Icon className="size-5 text-amber-500 shrink-0" />
                <span>Stock Alerts</span>
                <Badge variant="secondary" className="text-xs font-normal">
                  {alertItems.outOfStockItems.length + alertItems.lowStockItems.length} items
                </Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                onClick={() => setShowAlerts(false)}
              >
                <Cancel01Icon className="size-4" />
              </Button>
            </div>
            <CardDescription className="text-xs">
              Items requiring immediate attention or restocking
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Out of stock alerts */}
              {alertItems.outOfStockItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2 pb-1 border-b border-red-500/20">
                    <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
                      Out of Stock ({alertItems.outOfStockItems.length})
                    </span>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-2">
                    {alertItems.outOfStockItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 transition-colors cursor-pointer"
                        onClick={() => {
                          setDetailProduct(item);
                          setDetailOpen(true);
                        }}
                      >
                        <div className="relative h-9 w-9 rounded-md overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                          {item.thumbnails && item.thumbnails.length > 0 ? (
                            <Image
                              src={getOptimizedImageUrl(item.thumbnails[0], 64)}
                              alt={item.name}
                              fill
                              className="object-cover"
                              sizes="36px"
                            />
                          ) : (
                            <Image01Icon className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate leading-snug">{item.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{item.barcode}</p>
                        </div>
                        <Badge variant="destructive" className="text-[10px] px-2 py-0.5 h-5 shrink-0">
                          0 pcs
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Low stock alerts */}
              {alertItems.lowStockItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2 pb-1 border-b border-amber-500/20">
                    <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                      Low Stock ({alertItems.lowStockItems.length})
                    </span>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-2">
                    {alertItems.lowStockItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-colors cursor-pointer"
                        onClick={() => {
                          setDetailProduct(item);
                          setDetailOpen(true);
                        }}
                      >
                        <div className="relative h-9 w-9 rounded-md overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                          {item.thumbnails && item.thumbnails.length > 0 ? (
                            <Image
                              src={getOptimizedImageUrl(item.thumbnails[0], 64)}
                              alt={item.name}
                              fill
                              className="object-cover"
                              sizes="36px"
                            />
                          ) : (
                            <Image01Icon className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate leading-snug">{item.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{item.barcode}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5 h-5 shrink-0 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-bold">
                          {item.current_stock} pcs
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Inventory & Stock Movements */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
          <TabsList className="w-fit">
            <TabsTrigger value="inventory" className="gap-1.5">
              <Package01Icon className="size-3.5" />
              <span>Inventory</span>
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {products.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="movements" className="gap-1.5">
              <ChartIncreaseIcon className="size-3.5" />
              <span>Stock Movement</span>
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {movements.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="batches" className="gap-1.5">
              <Archive02Icon className="size-3.5" />
              <span>Stock Batches</span>
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {stocks.filter((s) => !s.is_archived && s.quantity > 0).length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ===== INVENTORY TAB ===== */}
        <TabsContent value="inventory" className="space-y-3 mt-0">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by product name or barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl"
                id="inventory-search"
              />
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {/* Warehouse Filter */}
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger className="w-[150px] h-9 text-xs rounded-xl" id="warehouse-filter">
                  <Home01Icon className="size-3.5 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="All Warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Warehouses</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id} className="text-xs">
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Category Filter */}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[140px] h-9 text-xs rounded-xl" id="category-filter">
                  <FilterIcon className="size-3.5 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Stock Status Filter */}
              <Select value={stockFilter} onValueChange={setStockFilter}>
                <SelectTrigger className="w-[130px] h-9 text-xs rounded-xl" id="stock-filter">
                  <SelectValue placeholder="Stock Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Stock</SelectItem>
                  <SelectItem value="in_stock" className="text-xs">In Stock</SelectItem>
                  <SelectItem value="low_stock" className="text-xs">Low Stock</SelectItem>
                  <SelectItem value="out_of_stock" className="text-xs">Out of Stock</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort By */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[110px] h-9 text-xs rounded-xl" id="sort-by">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name" className="text-xs">Name</SelectItem>
                  <SelectItem value="stock" className="text-xs">Stock Qty</SelectItem>
                  <SelectItem value="price" className="text-xs">Price</SelectItem>
                  <SelectItem value="cost" className="text-xs">Cost</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0 rounded-xl"
                onClick={() =>
                  setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
                }
                id="sort-order-toggle"
              >
                {sortOrder === "asc" ? (
                  <ArrowUp01Icon className="size-4" />
                ) : (
                  <ArrowDown01Icon className="size-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Inventory Table */}
          <div className="rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[50px] font-bold text-center">#</TableHead>
                  <TableHead className="w-[60px] font-bold">Image</TableHead>
                  <TableHead className="font-bold">Product & Category</TableHead>
                  <TableHead className="font-bold hidden md:table-cell">
                    Barcode
                  </TableHead>
                  <TableHead className="font-bold text-right">
                    Unit Cost
                  </TableHead>
                  <TableHead className="font-bold text-right">
                    Selling Price
                  </TableHead>
                  <TableHead className="font-bold text-center">
                    Stock On Hand
                  </TableHead>
                  <TableHead className="font-bold text-right hidden md:table-cell">
                    Total Value ($ / ៛)
                  </TableHead>
                  <TableHead className="font-bold text-center">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center h-48">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loading01Icon className="animate-spin size-6 text-primary" />
                        <span>Loading inventory...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginatedProducts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center h-48 text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Package01Icon className="size-10 text-muted-foreground/30" />
                        <span>No products match your filters.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                    paginatedProducts.map((product, index) => {
                      const status = getStockStatus(product.current_stock);
                      const unitCost = product.avg_cost;
                      const totalValue = product.total_value;
                      const totalValueKhr = Math.round(totalValue * (settings.exchange_rate_khr || 4100));
                      const catName = product.category_id ? categoryMap[product.category_id] : null;

                      return (
                        <TableRow
                          key={`${product.name}-${product.barcode}`}
                          className="cursor-pointer hover:bg-muted/30 transition-colors group"
                          onClick={() => {
                            setDetailProduct(product);
                            setDetailOpen(true);
                          }}
                        >
                        <TableCell className="text-xs text-muted-foreground tabular-nums text-center font-mono">
                          {invPage * pageSize + index + 1}
                        </TableCell>
                        <TableCell>
                          <div className="relative h-10 w-10 rounded-xl overflow-hidden border bg-muted flex items-center justify-center group-hover:scale-105 transition-transform">
                            {product.thumbnails &&
                            product.thumbnails.length > 0 ? (
                              <Image
                                src={getOptimizedImageUrl(
                                  product.thumbnails[0],
                                  80
                                )}
                                alt={product.name}
                                fill
                                className="object-cover"
                                sizes="40px"
                              />
                            ) : (
                              <Image01Icon className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-foreground truncate max-w-[220px]">
                              {product.name}
                            </p>
                            {catName && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-0.5 font-medium text-muted-foreground">
                                {catName}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
                            {product.barcode}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-semibold">
                          ${unitCost.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-extrabold text-primary">
                          ${product.price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            className={`font-mono font-bold text-xs px-2.5 py-0.5 ${
                              product.current_stock <= 0
                                ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30"
                                : product.current_stock <= LOW_STOCK_THRESHOLD
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                            }`}
                          >
                            {product.current_stock} Units
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          <span className="font-extrabold text-sm tabular-nums font-mono text-foreground block">
                            ${totalValue.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            ≈ {totalValueKhr.toLocaleString()} ៛
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={status.variant}
                            className={`text-[10px] px-2 py-0.5 gap-1 font-bold ${
                              product.current_stock <= 0
                                ? "border-red-500/40 text-red-600 bg-red-500/10"
                                : product.current_stock <= LOW_STOCK_THRESHOLD
                                ? "border-amber-500/40 text-amber-600 bg-amber-500/10"
                                : "border-emerald-500/40 text-emerald-600 bg-emerald-500/10"
                            }`}
                          >
                            <span className={`size-1.5 rounded-full ${status.dotColor}`} />
                            {status.label}
                          </Badge>
                        </TableCell>
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Inventory Pagination */}
          {!loading && filteredProducts.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground hidden sm:block">
                Showing {invPage * pageSize + 1} -{" "}
                {Math.min((invPage + 1) * pageSize, filteredProducts.length)} of{" "}
                {filteredProducts.length} products
              </p>
              <div className="flex items-center gap-2 ml-auto">
                <Select
                  value={`${pageSize}`}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setInvPage(0);
                  }}
                >
                  <SelectTrigger className="h-8 w-[70px]" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30, 50].map((s) => (
                      <SelectItem key={s} value={`${s}`}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Page {invPage + 1} of {invTotalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => setInvPage(0)}
                    disabled={invPage === 0}
                  >
                    <ArrowLeftDoubleIcon className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => setInvPage((p) => Math.max(0, p - 1))}
                    disabled={invPage === 0}
                  >
                    <ArrowLeft01Icon className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() =>
                      setInvPage((p) => Math.min(invTotalPages - 1, p + 1))
                    }
                    disabled={invPage >= invTotalPages - 1}
                  >
                    <ArrowRight01Icon className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => setInvPage(invTotalPages - 1)}
                    disabled={invPage >= invTotalPages - 1}
                  >
                    <ArrowRightDoubleIcon className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===== STOCK MOVEMENT TAB ===== */}
        <TabsContent value="movements" className="space-y-3 mt-0">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search product, reference..."
                value={movementSearch}
                onChange={(e) => setMovementSearch(e.target.value)}
                className="pl-9 h-9"
                id="movement-search"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select
                value={movementTypeFilter}
                onValueChange={setMovementTypeFilter}
              >
                <SelectTrigger className="w-[150px] h-9" id="movement-type-filter">
                  <FilterIcon className="size-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Movement Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="stock_in">Purchase (In)</SelectItem>
                  <SelectItem value="stock_out">Sale (Out)</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="return">Return</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={() =>
                  setMovementDateSort((prev) =>
                    prev === "desc" ? "asc" : "desc"
                  )
                }
                id="movement-date-sort"
              >
                {movementDateSort === "desc" ? (
                  <ArrowDown01Icon className="size-3.5" />
                ) : (
                  <ArrowUp01Icon className="size-3.5" />
                )}
                Date
              </Button>
            </div>
          </div>

          {/* Movement Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(
              [
                "stock_in",
                "stock_out",
                "adjustment",
                "return",
              ] as StockMovementType[]
            ).map((type) => {
              const config = movementTypeConfig[type];
              const count = movements.filter((m) => m.type === type).length;
              return (
                <button
                  key={type}
                  className={`flex items-center gap-2.5 p-3 rounded-lg border ${config.bgColor} hover:opacity-80 transition-opacity text-left ${
                    movementTypeFilter === type
                      ? "ring-2 ring-primary/30"
                      : ""
                  }`}
                  onClick={() =>
                    setMovementTypeFilter(
                      movementTypeFilter === type ? "all" : type
                    )
                  }
                >
                  <div className={`${config.color}`}>{config.icon}</div>
                  <div>
                    <p className={`text-xs font-bold ${config.color}`}>
                      {config.label}
                    </p>
                    <p className="text-lg font-black tabular-nums">{count}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Movements Table */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[56px] font-bold">#</TableHead>
                  <TableHead className="font-bold">Type</TableHead>
                  <TableHead className="font-bold">Product</TableHead>
                  <TableHead className="font-bold text-center">Qty</TableHead>
                  <TableHead className="font-bold text-right hidden md:table-cell">
                    Unit Cost
                  </TableHead>
                  <TableHead className="font-bold text-center hidden lg:table-cell">
                    Stock Change
                  </TableHead>
                  <TableHead className="font-bold hidden md:table-cell">
                    Reference
                  </TableHead>
                  <TableHead className="font-bold">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-48">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loading01Icon className="animate-spin size-6" />
                        <span>Loading movements...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginatedMovements.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center h-48 text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <ChartIncreaseIcon className="size-10 text-muted-foreground/30" />
                        <span>No stock movements found.</span>
                        <p className="text-xs">
                          Movements will appear here when stock changes are recorded.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedMovements.map((movement, index) => {
                    const config = movementTypeConfig[movement.type];
                    const prod = productMap[movement.product_id];

                    return (
                      <TableRow
                        key={movement.id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {movPage * pageSize + index + 1}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`gap-1 text-[10px] px-2 py-0.5 font-semibold ${config.color} ${config.bgColor}`}
                          >
                            {config.icon}
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-semibold truncate max-w-[180px]">
                            {prod?.name || movement.product_id}
                          </p>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`font-bold tabular-nums text-sm ${
                              movement.type === "stock_in" ||
                              movement.type === "return"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : movement.type === "stock_out"
                                ? "text-red-600 dark:text-red-400"
                                : ""
                            }`}
                          >
                            {movement.type === "stock_in" ||
                            movement.type === "return"
                              ? "+"
                              : movement.type === "stock_out"
                              ? "-"
                              : ""}
                            {movement.quantity}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">
                          {movement.unit_cost
                            ? `$${movement.unit_cost.toFixed(2)}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-center hidden lg:table-cell">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {movement.previous_stock_level} →{" "}
                            <span className="font-bold text-foreground">
                              {movement.new_stock_level}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {movement.reference ? (
                            <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[120px] inline-block">
                              {movement.reference}
                            </code>
                          ) : movement.note ? (
                            <span className="text-xs text-muted-foreground truncate max-w-[120px] inline-block">
                              {movement.note}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {format(new Date(movement.date), "dd MMM yyyy")}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Movement Pagination */}
          {!loading && filteredMovements.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground hidden sm:block">
                Showing {movPage * pageSize + 1} -{" "}
                {Math.min((movPage + 1) * pageSize, filteredMovements.length)}{" "}
                of {filteredMovements.length} movements
              </p>
              <div className="flex items-center gap-2 ml-auto">
                <Select
                  value={`${pageSize}`}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setMovPage(0);
                  }}
                >
                  <SelectTrigger className="h-8 w-[70px]" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30, 50].map((s) => (
                      <SelectItem key={s} value={`${s}`}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Page {movPage + 1} of {movTotalPages || 1}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => setMovPage(0)}
                    disabled={movPage === 0}
                  >
                    <ArrowLeftDoubleIcon className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => setMovPage((p) => Math.max(0, p - 1))}
                    disabled={movPage === 0}
                  >
                    <ArrowLeft01Icon className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() =>
                      setMovPage((p) =>
                        Math.min((movTotalPages || 1) - 1, p + 1)
                      )
                    }
                    disabled={movPage >= (movTotalPages || 1) - 1}
                  >
                    <ArrowRight01Icon className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => setMovPage((movTotalPages || 1) - 1)}
                    disabled={movPage >= (movTotalPages || 1) - 1}
                  >
                    <ArrowRightDoubleIcon className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===== BATCHES TAB ===== */}
        <TabsContent value="batches" className="space-y-3 mt-0">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search product, barcode, warehouse..."
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
                className="pl-9 h-9"
                id="batch-search"
              />
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {/* Warehouse Filter */}
              <Select
                value={batchWarehouseFilter}
                onValueChange={setBatchWarehouseFilter}
              >
                <SelectTrigger className="w-[160px] h-9" id="batch-warehouse-filter">
                  <Home01Icon className="size-3.5 mr-1.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="All Warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {warehouses.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Stock Status Filter */}
              <Select
                value={batchStockFilter}
                onValueChange={setBatchStockFilter}
              >
                <SelectTrigger className="w-[140px] h-9" id="batch-stock-filter">
                  <FilterIcon className="size-3.5 mr-1.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Stock Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">In Stock (&gt;0)</SelectItem>
                  <SelectItem value="all">All Batches</SelectItem>
                  <SelectItem value="out_of_stock">Out of Stock (=0)</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort By */}
              <Select value={batchSortBy} onValueChange={setBatchSortBy}>
                <SelectTrigger className="w-[130px] h-9" id="batch-sort-by">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="name">Product Name</SelectItem>
                  <SelectItem value="cost">Unit Cost</SelectItem>
                  <SelectItem value="quantity">Quantity</SelectItem>
                  <SelectItem value="value">Total Value</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort Order Toggle */}
              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                onClick={() =>
                  setBatchSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
                }
                id="batch-sort-order-toggle"
                title={
                  batchSortOrder === "asc" ? "Sort Ascending" : "Sort Descending"
                }
              >
                {batchSortOrder === "asc" ? (
                  <ArrowUp01Icon className="size-4" />
                ) : (
                  <ArrowDown01Icon className="size-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Quick Metrics Bar for Batches */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-card/60">
              <div className="size-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <Archive02Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Batches
                </p>
                <p className="text-base font-black tabular-nums">
                  {batchStats.totalBatches}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-card/60">
              <div className="size-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <Package01Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Total Units
                </p>
                <p className="text-base font-black tabular-nums">
                  {batchStats.totalQuantity}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-card/60">
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <DollarCircleIcon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Batch Value
                </p>
                <p className="text-base font-black tabular-nums text-primary">
                  $
                  {batchStats.totalValue.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-card/60">
              <div className="size-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-600 dark:text-violet-400 shrink-0">
                <Home01Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Warehouses
                </p>
                <p className="text-base font-black tabular-nums">
                  {batchWarehouseFilter !== "all"
                    ? 1
                    : batchStats.uniqueWarehouses}
                </p>
              </div>
            </div>
          </div>

          {/* Batches Table */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[56px] font-bold">#</TableHead>
                  <TableHead className="w-[60px] font-bold hidden sm:table-cell">
                    Image
                  </TableHead>
                  <TableHead className="font-bold">Product</TableHead>
                  <TableHead className="font-bold">Warehouse</TableHead>
                  <TableHead className="font-bold text-right">Cost</TableHead>
                  <TableHead className="font-bold text-center">Qty</TableHead>
                  <TableHead className="font-bold text-right hidden md:table-cell">
                    Value
                  </TableHead>
                  <TableHead className="font-bold text-right">
                    Created At
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-48">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loading01Icon className="animate-spin size-6 text-primary" />
                        <span>Loading stock batches...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginatedBatches.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center h-48 text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Archive02Icon className="size-10 text-muted-foreground/30" />
                        <span>No stock batches match your filters.</span>
                        {(batchSearch ||
                          batchWarehouseFilter !== "all" ||
                          batchStockFilter !== "active") && (
                          <Button
                            variant="link"
                            size="sm"
                            className="text-xs text-primary"
                            onClick={() => {
                              setBatchSearch("");
                              setBatchWarehouseFilter("all");
                              setBatchStockFilter("active");
                            }}
                          >
                            Clear filters
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedBatches.map((stock, idx) => {
                    const product = productMap[stock.product_id];
                    const whName =
                      warehouseMap[stock.warehouse_id]?.name || "Main";
                    const mergedItem = mergedInventory.find(
                      (m) =>
                        m.product_ids.includes(stock.product_id) ||
                        (product &&
                          m.name.toLowerCase() === product.name.toLowerCase())
                    );
                    const thumbnails =
                      product?.thumbnails || mergedItem?.thumbnails;

                    return (
                      <TableRow
                        key={stock.id}
                        className="hover:bg-muted/30 transition-colors cursor-pointer group"
                        onClick={() => {
                          if (mergedItem) {
                            setDetailProduct(mergedItem);
                            setDetailOpen(true);
                          }
                        }}
                      >
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {batchPage * pageSize + idx + 1}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="relative h-9 w-9 rounded-lg overflow-hidden border bg-muted flex items-center justify-center group-hover:scale-105 transition-transform">
                            {thumbnails && thumbnails.length > 0 ? (
                              <Image
                                src={getOptimizedImageUrl(thumbnails[0], 64)}
                                alt={product?.name || "Product"}
                                fill
                                className="object-cover"
                                sizes="36px"
                              />
                            ) : (
                              <Image01Icon className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col max-w-[200px] sm:max-w-[260px]">
                            <span className="font-semibold text-sm truncate">
                              {product?.name || stock.product_id}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {product?.barcode ||
                                stock.product_barcode ||
                                "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 font-medium inline-flex items-center gap-1"
                          >
                            <Home01Icon className="size-2.5 shrink-0" />
                            <span>{whName}</span>
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-semibold">
                          ${stock.cost.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={`text-xs px-2 py-0.5 font-bold tabular-nums ${
                              stock.quantity <= 0
                                ? "border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/10"
                                : stock.quantity <= 5
                                ? "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                                : "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                            }`}
                          >
                            {stock.quantity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-semibold text-primary hidden md:table-cell">
                          $
                          {(stock.cost * stock.quantity).toLocaleString(
                            "en-US",
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {stock.created_at
                            ? format(new Date(stock.created_at), "dd MMM yyyy")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Batches Pagination */}
          {!loading && filteredBatches.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground hidden sm:block">
                Showing {batchPage * pageSize + 1} -{" "}
                {Math.min((batchPage + 1) * pageSize, filteredBatches.length)} of{" "}
                {filteredBatches.length} batches
              </p>
              <div className="flex items-center gap-2 ml-auto">
                <Select
                  value={`${pageSize}`}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setBatchPage(0);
                  }}
                >
                  <SelectTrigger className="h-8 w-[70px]" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30, 50].map((s) => (
                      <SelectItem key={s} value={`${s}`}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Page {batchPage + 1} of {batchTotalPages || 1}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => setBatchPage(0)}
                    disabled={batchPage === 0}
                  >
                    <ArrowLeftDoubleIcon className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => setBatchPage((p) => Math.max(0, p - 1))}
                    disabled={batchPage === 0}
                  >
                    <ArrowLeft01Icon className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() =>
                      setBatchPage((p) =>
                        Math.min((batchTotalPages || 1) - 1, p + 1)
                      )
                    }
                    disabled={batchPage >= (batchTotalPages || 1) - 1}
                  >
                    <ArrowRight01Icon className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => setBatchPage((batchTotalPages || 1) - 1)}
                    disabled={batchPage >= (batchTotalPages || 1) - 1}
                  >
                    <ArrowRightDoubleIcon className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Product Detail Dialog (Full Screen / Expansive Modal) */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="fixed inset-0 sm:inset-2 md:inset-4 lg:inset-6 !top-0 sm:!top-2 md:!top-4 lg:!top-6 !left-0 sm:!left-2 md:!left-4 lg:!left-6 !translate-x-0 !translate-y-0 !max-w-none sm:!max-w-none md:!max-w-none !w-auto !h-auto p-0 flex flex-col gap-0 rounded-none sm:rounded-2xl md:rounded-3xl overflow-hidden border border-border/80 bg-background shadow-2xl z-50 outline-none">
          <DialogHeader className="p-4 sm:p-6 border-b bg-card shrink-0 flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-xl overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                {detailProduct?.thumbnails && detailProduct.thumbnails.length > 0 ? (
                  <Image
                    src={getOptimizedImageUrl(detailProduct.thumbnails[0], 200)}
                    alt={detailProduct.name}
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                ) : (
                  <Image01Icon className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-base sm:text-xl font-bold truncate">
                    {detailProduct?.name}
                  </DialogTitle>
                  {detailProduct?.category_id && categoryMap[detailProduct.category_id] && (
                    <Badge variant="outline" className="text-[10px] font-semibold">
                      {categoryMap[detailProduct.category_id]}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                    <BarcodeScanIcon className="size-3" />
                    <span>{detailProduct?.barcode || "No Barcode"}</span>
                  </div>
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setDetailOpen(false)}
              className="rounded-xl border-border/70 text-xs font-semibold gap-1.5 shrink-0"
            >
              <Cancel01Icon className="size-3.5" />
              <span>Close</span>
            </Button>
          </DialogHeader>

          {detailProduct && (
            <ScrollArea className="flex-1 p-4 sm:p-6">
              <div className="space-y-6 max-w-6xl mx-auto">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                  {/* Stock on Hand */}
                  <div className="p-4 rounded-2xl bg-card border shadow-xs space-y-1">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      Stock on Hand
                    </p>
                    <p
                      className={`text-2xl sm:text-3xl font-black tabular-nums ${
                        detailProduct.current_stock <= 0
                          ? "text-red-600 dark:text-red-400"
                          : detailProduct.current_stock <= LOW_STOCK_THRESHOLD
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {detailProduct.current_stock.toLocaleString()}
                    </p>
                    <Badge
                      variant={getStockStatus(detailProduct.current_stock).variant}
                      className={`text-[10px] px-2 py-0.5 gap-1.5 ${
                        detailProduct.current_stock <= 0
                          ? ""
                          : detailProduct.current_stock <= LOW_STOCK_THRESHOLD
                          ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                          : "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          getStockStatus(detailProduct.current_stock).dotColor
                        }`}
                      />
                      {getStockStatus(detailProduct.current_stock).label}
                    </Badge>
                  </div>

                  {/* Avg Unit Cost */}
                  <div className="p-4 rounded-2xl bg-card border shadow-xs space-y-1">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      Avg. Unit Cost
                    </p>
                    <p className="text-2xl sm:text-3xl font-black tabular-nums text-foreground">
                      ${(detailProduct.avg_cost || 0).toFixed(2)}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      ៛{Math.round((detailProduct.avg_cost || 0) * (settings.exchange_rate_khr || 4100)).toLocaleString()} KHR
                    </p>
                  </div>

                  {/* Selling Price */}
                  <div className="p-4 rounded-2xl bg-card border shadow-xs space-y-1">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      Retail Price
                    </p>
                    <p className="text-2xl sm:text-3xl font-black tabular-nums text-foreground">
                      ${detailProduct.price.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      ៛{Math.round(detailProduct.price * (settings.exchange_rate_khr || 4100)).toLocaleString()} KHR
                    </p>
                  </div>

                  {/* Total Asset Valuation */}
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shadow-xs space-y-1">
                    <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                      Inventory Asset Value
                    </p>
                    <p className="text-2xl sm:text-3xl font-black tabular-nums text-emerald-700 dark:text-emerald-400">
                      ${detailProduct.total_value.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 tabular-nums">
                      ៛{Math.round(detailProduct.total_value * (settings.exchange_rate_khr || 4100)).toLocaleString()} KHR
                    </p>
                  </div>
                </div>

                {/* Grid: Batches Breakdown & Movement History */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Active Batches / Lots */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package01Icon className="size-4 text-primary" />
                        <h4 className="text-sm font-bold text-foreground">
                          Active FIFO Stock Batches
                        </h4>
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-bold">
                        {stocks.filter((s) => detailProduct.product_ids.includes(s.product_id) && s.quantity > 0).length} Lots
                      </Badge>
                    </div>

                    <div className="border rounded-2xl overflow-hidden bg-card divide-y">
                      {stocks.filter((s) => detailProduct.product_ids.includes(s.product_id) && s.quantity > 0).length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                          <Package01Icon className="size-8 mx-auto mb-2 opacity-30" />
                          <p className="text-xs font-semibold">No active stock lots found</p>
                          <p className="text-[11px] mt-0.5">Record a purchase or stock-in to add inventory.</p>
                        </div>
                      ) : (
                        stocks
                          .filter((s) => detailProduct.product_ids.includes(s.product_id) && s.quantity > 0)
                          .map((batch) => (
                            <div key={batch.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors">
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 font-semibold gap-1">
                                    <Home01Icon className="size-3" />
                                    {warehouseMap[batch.warehouse_id]?.name || "Main Warehouse"}
                                  </Badge>
                                  {batch.created_at && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {format(new Date(batch.created_at), "dd MMM yyyy")}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-muted-foreground">Cost:</span>
                                  <span className="font-bold font-mono text-foreground">${batch.cost.toFixed(2)}</span>
                                  <span className="text-muted-foreground text-[11px]">(៛{Math.round(batch.cost * (settings.exchange_rate_khr || 4100)).toLocaleString()})</span>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <p className="text-base font-black tabular-nums text-foreground">
                                  {batch.quantity.toLocaleString()} units
                                </p>
                                <p className="text-[11px] text-muted-foreground font-mono tabular-nums">
                                  ${(batch.quantity * batch.cost).toFixed(2)} total
                                </p>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                  {/* Right: Stock Movements Log */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ChartIncreaseIcon className="size-4 text-primary" />
                        <h4 className="text-sm font-bold text-foreground">
                          Recent Stock Movements
                        </h4>
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-bold">
                        {movements.filter((m) => detailProduct.product_ids.includes(m.product_id)).length} Records
                      </Badge>
                    </div>

                    <div className="border rounded-2xl overflow-hidden bg-card divide-y">
                      {movements.filter((m) => detailProduct.product_ids.includes(m.product_id)).length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                          <ChartIncreaseIcon className="size-8 mx-auto mb-2 opacity-30" />
                          <p className="text-xs font-semibold">No stock movements recorded yet</p>
                        </div>
                      ) : (
                        movements
                          .filter((m) => detailProduct.product_ids.includes(m.product_id))
                          .slice(0, 10)
                          .map((m) => {
                            const cfg = movementTypeConfig[m.type] || {
                              label: m.type,
                              color: "text-muted-foreground",
                              bgColor: "bg-muted",
                              icon: <ArrowRight01Icon className="size-3.5" />,
                            };
                            return (
                              <div key={m.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`size-8 rounded-xl flex items-center justify-center shrink-0 border ${cfg.bgColor} ${cfg.color}`}>
                                    {cfg.icon}
                                  </div>
                                  <div className="min-w-0">
                                    <p className={`text-xs font-bold ${cfg.color}`}>
                                      {cfg.label}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {format(new Date(m.date), "dd MMM yyyy, HH:mm")}
                                      {m.reason ? ` • ${m.reason}` : ""}
                                    </p>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <p
                                    className={`text-sm font-black tabular-nums ${
                                      m.type === "stock_in" || m.type === "return"
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : m.type === "stock_out"
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-foreground"
                                    }`}
                                  >
                                    {m.type === "stock_in" || m.type === "return"
                                      ? "+"
                                      : m.type === "stock_out"
                                      ? "-"
                                      : ""}
                                    {m.quantity}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground tabular-nums">
                                    {m.previous_stock_level} → {m.new_stock_level}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
