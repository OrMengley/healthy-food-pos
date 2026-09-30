"use client";

import { useEffect, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loading01Icon, Search01Icon, Package01Icon, Archive02Icon, Image01Icon, FilterIcon, PrinterIcon } from "hugeicons-react";
import Image from "next/image";
import Link from "next/link";
import { getProducts, getCategories } from "@/lib/firebase/actions";
import { getStocks } from "@/lib/firebase/stock-actions";
import { Product, Stock, Category } from "@/types";
import { getOptimizedImageUrl } from "@/lib/utils";

export default function InventoryOnHandPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string>("all");
  const [stockStatus, setStockStatus] = useState<string>("available");

  useEffect(() => {
    try {
      const authStr = localStorage.getItem("user_auth");
      if (authStr) {
        const authData = JSON.parse(authStr);
        setWarehouseId(authData?.user_info?.warehouse_id || null);
      }
    } catch (e) {
      console.error("Failed to parse user_auth", e);
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [prods, stks, cats] = await Promise.all([getProducts(), getStocks(), getCategories()]);
        setProducts(prods);
        setStocks(stks);
        setCategories(cats);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const mergedInventory = useMemo(() => {
    if (!warehouseId) return [];

    const productMap: Record<string, Product> = {};
    products.forEach((p) => (productMap[p.id] = p));

    const groups = new Map<string, any>();

    // Init groups
    products.forEach((p) => {
      const key = `${p.name.trim().toLowerCase()}_${(p.barcode || "").trim().toLowerCase()}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: p.id,
          name: p.name,
          barcode: p.barcode,
          price: p.price,
          thumbnails: p.thumbnails,
          category_id: p.category_id,
          current_stock: 0,
        });
      }
    });

    // Aggregate stocks for the specific warehouse
    stocks.forEach((s) => {
      if (s.warehouse_id !== warehouseId || s.is_archived) return;

      const p = productMap[s.product_id];
      if (!p) return;
      
      const key = `${p.name.trim().toLowerCase()}_${(p.barcode || "").trim().toLowerCase()}`;
      const item = groups.get(key);
      if (item) {
        item.current_stock += s.quantity;
      }
    });

    // Only return products that have stock in this warehouse or are simply tracked
    return Array.from(groups.values());
  }, [products, stocks, warehouseId]);

  const filteredProducts = useMemo(() => {
    let result = [...mergedInventory];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    }

    if (categoryId !== "all") {
      result = result.filter((p) => p.category_id === categoryId);
    }

    if (stockStatus === "available") {
      result = result.filter((p) => p.current_stock > 0);
    }

    return result;
  }, [mergedInventory, searchQuery, categoryId, stockStatus]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading01Icon className="animate-spin size-8 text-primary" />
      </div>
    );
  }

  if (!warehouseId) {
    return (
      <div className="flex h-[80vh] items-center justify-center p-4">
        <Card className="w-full max-w-md text-center p-8 border-dashed shadow-sm">
          <Archive02Icon className="size-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <h2 className="text-xl font-semibold mb-2">No Warehouse Assigned</h2>
          <p className="text-sm text-muted-foreground">
            Your account is not assigned to any warehouse. Please contact an administrator to assign a warehouse to your account.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center size-9 rounded-xl bg-primary/10">
            <Archive02Icon className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              Inventory On Hand
            </h1>
            <p className="text-xs text-muted-foreground hidden md:block">
              View your current stock level in your assigned warehouse
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inventory_on_hand/report">
            <Button variant="outline" size="sm" className="h-9">
              <PrinterIcon className="size-4 mr-2" />
              <span className="hidden sm:inline">Print Report</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-2 mb-2">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or barcode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-background"
          />
        </div>
        
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-full sm:w-[160px] h-9 bg-background">
            <FilterIcon className="size-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Category" />
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

        <Select value={stockStatus} onValueChange={setStockStatus}>
          <SelectTrigger className="w-full sm:w-[160px] h-9 bg-background">
            <FilterIcon className="size-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Stock Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="available">Available (&gt; 0)</SelectItem>
            <SelectItem value="all">All Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[56px] font-bold">#</TableHead>
              <TableHead className="w-[60px] font-bold">Image</TableHead>
              <TableHead className="font-bold">Product</TableHead>
              <TableHead className="font-bold">Barcode</TableHead>
              <TableHead className="font-bold text-right">Price</TableHead>
              <TableHead className="font-bold text-center">Stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-48 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Package01Icon className="size-10 text-muted-foreground/30" />
                    <span>No products found.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product, index) => (
                <TableRow key={`${product.name}-${product.barcode}`} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <div className="relative h-10 w-10 rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
                      {product.thumbnails && product.thumbnails.length > 0 ? (
                        <Image
                          src={getOptimizedImageUrl(product.thumbnails[0], 64)}
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
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{product.barcode || "-"}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    ${product.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge 
                      variant={product.current_stock > 0 ? "outline" : "destructive"}
                      className={
                        product.current_stock > 5 
                          ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" 
                          : product.current_stock > 0
                            ? "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                            : ""
                      }
                    >
                      {product.current_stock}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
