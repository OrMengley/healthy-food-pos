"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { 
  Add01Icon, 
  Image01Icon, 
  PencilEdit01Icon, 
  Delete01Icon, 
  Package01Icon, 
  BarcodeScanIcon, 
  Loading01Icon, 
  ViewIcon, 
  Cancel01Icon, 
  Search01Icon, 
  TagsIcon,
  PrinterIcon,
  Refresh01Icon,
} from "hugeicons-react";
import Image from "next/image";
import { getProducts, getCategories, archiveProduct } from "@/lib/firebase/actions";
import { getStocks } from "@/lib/firebase/stock-actions";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import { Product, Category, ProductWithStock, StoreSettings } from "@/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProductForm } from "@/components/forms/ProductForm";
import { PrintBarcodeModal } from "@/components/modals/PrintBarcodeModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getOptimizedImageUrl } from "@/lib/utils";
import { toast } from "sonner";

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<ProductWithStock | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Barcode Printing State
  const [barcodeModalProduct, setBarcodeModalProduct] = useState<Product | null>(null);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);

  async function fetchData() {
    try {
      setLoading(true);
      const [prods, cats, allStocks, storeConfig] = await Promise.all([
        getProducts(),
        getCategories(),
        getStocks(),
        getStoreSettings(),
      ]);
      
      const catMap: Record<string, string> = {};
      cats.forEach((c) => (catMap[c.id] = c.name));
      setCategories(catMap);
      setCategoriesList(cats);
      setSettings(storeConfig);

      // Dynamically compute current_stock from active stock records
      const stockMap: Record<string, number> = {};
      allStocks.forEach(s => {
        stockMap[s.product_id] = (stockMap[s.product_id] || 0) + Number(s.quantity || 0);
      });

      const productsWithStock = prods.map(p => ({
        ...p,
        current_stock: stockMap[p.id] || 0
      }));

      setProducts(productsWithStock);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: products.length, uncategorized: 0 };
    products.forEach((p) => {
      if (!p.category_id) {
        counts.uncategorized = (counts.uncategorized || 0) + 1;
      } else {
        counts[p.category_id] = (counts[p.category_id] || 0) + 1;
      }
    });
    return counts;
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (selectedCategoryId !== "all") {
        if (selectedCategoryId === "uncategorized") {
          if (product.category_id && product.category_id !== "") return false;
        } else if (product.category_id !== selectedCategoryId) {
          return false;
        }
      }

      if (stockFilter === "in_stock" && product.current_stock <= 0) return false;
      if (stockFilter === "low_stock" && (product.current_stock <= 0 || product.current_stock > 5)) return false;
      if (stockFilter === "out_of_stock" && product.current_stock > 0) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = product.name?.toLowerCase().includes(q);
        const matchBarcode = product.barcode?.toLowerCase().includes(q);
        const catName = (categories[product.category_id || ""] || "Uncategorized").toLowerCase();
        const matchCat = catName.includes(q);

        if (!matchName && !matchBarcode && !matchCat) return false;
      }

      return true;
    });
  }, [products, selectedCategoryId, stockFilter, searchQuery, categories]);

  const hasActiveFilters = selectedCategoryId !== "all" || stockFilter !== "all" || searchQuery.trim() !== "";

  const resetFilters = () => {
    setSelectedCategoryId("all");
    setStockFilter("all");
    setSearchQuery("");
  };

  const handleEdit = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    setEditingProduct(product);
    setSheetOpen(true);
  };

  const handleOpenPrintBarcode = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    setBarcodeModalProduct(product);
    setBarcodeModalOpen(true);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to archive this healthy food product?")) {
      try {
        await archiveProduct(id);
        toast.success("Product archived");
        fetchData();
      } catch (error) {
        toast.error("Failed to archive product");
      }
    }
  };

  const handleRowClick = (product: ProductWithStock) => {
    setViewingProduct(product);
    setSelectedImageIndex(0);
    setDetailOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Package01Icon className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight md:text-2xl text-foreground">Healthy Food Products</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Manage menus, salads, juices, bowls, Code 128 barcodes, and inventory pricing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="h-9 gap-1.5 text-xs font-semibold rounded-xl border-border/80 hover:bg-muted"
          >
            <Refresh01Icon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button 
            size="sm" 
            className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm font-bold text-xs rounded-xl"
            onClick={() => {
              setEditingProduct(null);
              setSheetOpen(true);
            }}
          >
            <Add01Icon className="mr-1.5 size-4" />
            Add Product
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[440px_1fr] lg:grid-cols-[400px_1fr] gap-6 items-start">
        {/* Left Column: Create / Edit Form (Sticky on Desktop) */}
        <Card className="hidden lg:flex flex-col shadow-sm border-border/70 rounded-2xl overflow-hidden bg-card sticky top-4 max-h-[calc(100vh-90px)]">
          <CardHeader className="shrink-0 py-3.5 px-5 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-border/60">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 font-bold text-foreground">
                <div className="size-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-2xs">
                  {editingProduct ? <PencilEdit01Icon className="size-4" /> : <Add01Icon className="size-4" />}
                </div>
                {editingProduct ? "Edit Product Details" : "Add New Product"}
              </CardTitle>
              {editingProduct && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingProduct(null)}
                  className="h-6 px-2 text-[11px] font-bold text-primary hover:bg-primary/10 rounded-lg"
                >
                  + New
                </Button>
              )}
            </div>
            <CardDescription className="text-xs">
              {editingProduct 
                ? `Updating product info for ${editingProduct.name}.`
                : "Provision a healthy food item with recommended pricing, barcode, and photos."}
            </CardDescription>
          </CardHeader>
         
          <div className="flex-1 overflow-y-auto">
            <ProductForm 
              initialData={editingProduct || undefined}
              exchangeRateKhr={settings.exchange_rate_khr || 4100}
              onSuccess={() => {
                fetchData();
                setEditingProduct(null);
              }} 
              onCancel={() => setEditingProduct(null)}
            />
          </div>
        </Card>

        {/* Right Column: Data Table & Filters */}
        <div className="flex flex-col gap-4">
          {/* Filter Bar */}
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
              <div className="relative flex-1 min-w-[200px]">
                <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by product name, barcode (HF-...), or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 h-9 text-sm w-full bg-background"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  >
                    <Cancel01Icon className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                  <SelectTrigger className="h-9 w-[170px] sm:w-[190px] text-xs sm:text-sm bg-background font-medium">
                    <div className="flex items-center gap-1.5 truncate max-w-[130px] sm:max-w-[150px]">
                      <TagsIcon className="size-3.5 text-muted-foreground shrink-0" />
                      <SelectValue placeholder="All Categories" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="all">
                      All Categories ({products.length})
                    </SelectItem>
                    {categoriesList.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name} ({categoryCounts[cat.id] || 0})
                      </SelectItem>
                    ))}
                    {(categoryCounts.uncategorized || 0) > 0 && (
                      <SelectItem value="uncategorized">
                        Uncategorized ({categoryCounts.uncategorized})
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>

                <Select value={stockFilter} onValueChange={setStockFilter}>
                  <SelectTrigger className="h-9 w-[120px] sm:w-[130px] text-xs sm:text-sm bg-background font-medium">
                    <SelectValue placeholder="All Stock" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stock</SelectItem>
                    <SelectItem value="in_stock">In Stock ({products.filter(p => p.current_stock > 0).length})</SelectItem>
                    <SelectItem value="low_stock">Low Stock ≤5 ({products.filter(p => p.current_stock > 0 && p.current_stock <= 5).length})</SelectItem>
                    <SelectItem value="out_of_stock">Out of Stock ({products.filter(p => p.current_stock <= 0).length})</SelectItem>
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetFilters}
                    className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground shrink-0 border-dashed"
                    title="Reset all filters"
                  >
                    <Cancel01Icon className="size-3.5 mr-1 text-destructive" />
                    Reset
                  </Button>
                )}
              </div>
            </div>

            {/* Category Quick Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-none">
              <Button
                type="button"
                size="sm"
                variant={selectedCategoryId === "all" ? "default" : "outline"}
                onClick={() => setSelectedCategoryId("all")}
                className="h-7 text-xs rounded-full px-3 shrink-0 font-medium"
              >
                All ({products.length})
              </Button>
              {categoriesList.map((cat) => {
                const count = categoryCounts[cat.id] || 0;
                const isSelected = selectedCategoryId === cat.id;
                return (
                  <Button
                    key={cat.id}
                    type="button"
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                    onClick={() => setSelectedCategoryId(isSelected ? "all" : cat.id)}
                    className="h-7 text-xs rounded-full px-3 shrink-0 gap-1.5 font-medium"
                  >
                    <span>{cat.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {count}
                    </span>
                  </Button>
                );
              })}
            </div>

            {/* Filter Summary */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
              <span>
                Showing <strong className="text-foreground">{filteredProducts.length}</strong> of{" "}
                <strong className="text-foreground">{products.length}</strong> items
              </span>
              <span className="text-[11px]">
                Exchange Rate: <strong>1 USD = {settings.exchange_rate_khr?.toLocaleString() || "4,100"} ៛</strong>
              </span>
            </div>
          </div>

          {/* Products Table */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[70px] font-bold">Image</TableHead>
                  <TableHead className="font-bold">Product & Barcode</TableHead>
                  <TableHead className="font-bold">Category</TableHead>
                  <TableHead className="font-bold">Price (USD / KHR)</TableHead>
                  <TableHead className="font-bold">Stock</TableHead>
                  <TableHead className="text-right font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-48">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loading01Icon className="animate-spin size-6 text-primary" />
                        <span>Loading healthy food products...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-48 text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2 py-6">
                        <Package01Icon className="size-8 text-muted-foreground/50" />
                        <p className="font-semibold text-sm">No products found</p>
                        <p className="text-xs text-muted-foreground">
                          {hasActiveFilters ? "Try adjusting your search or category filters." : "Create your first healthy food product."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => {
                    const priceKhr = Math.round(product.price * (settings.exchange_rate_khr || 4100)).toLocaleString();
                    return (
                      <TableRow 
                        key={product.id} 
                        className="cursor-pointer hover:bg-muted/30 transition-colors group"
                        onClick={() => handleRowClick(product)}
                      >
                        <TableCell>
                          <div className="relative h-12 w-12 rounded-xl overflow-hidden border bg-muted flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
                            {product.thumbnails && product.thumbnails.length > 0 ? (
                              <Image
                                src={getOptimizedImageUrl(product.thumbnails[0], 100)}
                                alt={product.name}
                                fill
                                className="object-cover"
                                sizes="48px"
                              />
                            ) : product.images && product.images.length > 0 ? (
                              <Image
                                src={getOptimizedImageUrl(product.images[0], 100)}
                                alt={product.name}
                                fill
                                className="object-cover"
                                sizes="48px"
                              />
                            ) : (
                              <Image01Icon className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-sm text-foreground">{product.name}</div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono mt-0.5">
                            <BarcodeScanIcon className="size-3.5 text-primary" />
                            <span>{product.barcode}</span>
                            {product.status === "inactive" && (
                              <Badge variant="outline" className="text-[10px] text-neutral-400 py-0 px-1">Inactive</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-semibold bg-primary/10 text-primary border-primary/20 text-xs">
                            {categories[product.category_id || ""] || "Uncategorized"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-extrabold text-foreground text-sm">${product.price.toFixed(2)}</div>
                          <div className="text-[11px] text-muted-foreground font-medium">{priceKhr} ៛</div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={product.current_stock > 5 ? "outline" : product.current_stock > 0 ? "outline" : "destructive"} 
                            className={`px-2.5 py-0.5 font-bold tabular-nums text-xs ${
                              product.current_stock <= 0
                                ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                : product.current_stock <= 5
                                ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                            }`}
                          >
                            {product.current_stock} {product.current_stock === 1 ? "unit" : "units"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="size-8 text-primary hover:bg-primary/10" 
                              onClick={(e) => handleOpenPrintBarcode(e, product)}
                              title="Print Barcode Label"
                            >
                              <PrinterIcon className="size-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="size-8 text-muted-foreground hover:text-foreground hover:bg-muted" 
                              onClick={(e) => handleEdit(e, product)}
                              title="Edit Product"
                            >
                              <PencilEdit01Icon className="size-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="size-8 text-destructive hover:bg-destructive/10" 
                              onClick={(e) => handleDelete(e, product.id)}
                              title="Archive Product"
                            >
                              <Delete01Icon className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Edit/Create Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(val) => {
        setSheetOpen(val);
        if (!val) setEditingProduct(null);
      }}>
        <SheetContent 
          side="right" 
          className="sm:max-w-[560px] p-0 flex flex-col overflow-hidden bg-background"
        >
          <SheetHeader className="p-5 shrink-0 bg-primary/5 border-b border-border/60">
            <SheetTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              {editingProduct ? (
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
                  <PencilEdit01Icon className="size-5" />
                </div>
              ) : (
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Add01Icon className="size-5" />
                </div>
              )}
              {editingProduct ? "Edit Product Details" : "Add Healthy Food Product"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {editingProduct ? "Update product details, recommended pricing, and barcode." : "Add a new product with barcode, recommended pricing, and photos."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <ProductForm 
              initialData={editingProduct || undefined}
              exchangeRateKhr={settings.exchange_rate_khr || 4100}
              onSuccess={() => {
                setSheetOpen(false);
                setEditingProduct(null);
                fetchData();
              }} 
              onCancel={() => {
                setSheetOpen(false);
                setEditingProduct(null);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Product Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="sm:max-w-[560px] p-0 flex flex-col overflow-y-auto">
          <SheetHeader className="p-6 border-b shrink-0 bg-primary/5">
            <SheetTitle className="text-xl font-black flex items-center gap-2">
              <ViewIcon className="size-6 text-primary" />
              Product Details
            </SheetTitle>
            <SheetDescription>
              Detailed view and barcode label printing.
            </SheetDescription>
          </SheetHeader>
          
          {viewingProduct && (
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Images */}
                {(viewingProduct.images?.length > 0 || viewingProduct.thumbnails?.length > 0) && (
                  <div className="space-y-3">
                    <div className="relative rounded-2xl overflow-hidden border bg-muted aspect-square flex items-center justify-center shadow-sm">
                      <Image
                        src={getOptimizedImageUrl(
                          (viewingProduct.images && viewingProduct.images[selectedImageIndex]) || 
                          (viewingProduct.thumbnails && viewingProduct.thumbnails[selectedImageIndex]) || 
                          "", 
                          800
                        )}
                        alt={viewingProduct.name}
                        fill
                        className="object-contain p-4"
                        sizes="(max-width: 768px) 100vw, 500px"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Product Name</h3>
                    <p className="text-xl font-bold text-foreground">{viewingProduct.name}</p>
                    {viewingProduct.description && (
                      <p className="text-xs text-muted-foreground mt-1">{viewingProduct.description}</p>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="p-3.5 rounded-xl bg-muted/40 border">
                      <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Barcode</h3>
                      <div className="flex items-center gap-1.5 font-mono font-bold text-primary text-sm">
                        <BarcodeScanIcon className="size-4 text-primary" />
                        {viewingProduct.barcode}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-muted/40 border">
                      <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Selling Price</h3>
                      <p className="text-lg font-black text-emerald-600">
                        ${viewingProduct.price.toFixed(2)}{" "}
                        <span className="text-xs font-medium text-muted-foreground">
                          ({Math.round(viewingProduct.price * (settings.exchange_rate_khr || 4100)).toLocaleString()} ៛)
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-xl bg-muted/40 border">
                      <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Current Stock</h3>
                      <Badge className="font-bold text-xs" variant={viewingProduct.current_stock > 0 ? "outline" : "destructive"}>
                        {viewingProduct.current_stock} Units
                      </Badge>
                    </div>
                    <div className="p-3.5 rounded-xl bg-muted/40 border">
                      <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Category</h3>
                      <p className="text-sm font-semibold text-foreground">
                        {categories[viewingProduct.category_id || ""] || "Uncategorized"}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex gap-2">
                    <Button 
                      className="flex-1 font-bold gap-2 bg-primary hover:bg-primary/90"
                      onClick={() => {
                        setBarcodeModalProduct(viewingProduct);
                        setBarcodeModalOpen(true);
                      }}
                    >
                      <PrinterIcon className="size-4" />
                      Print Barcode Label
                    </Button>
                    <Button 
                      variant="outline"
                      className="font-semibold gap-1.5"
                      onClick={(e) => {
                        setDetailOpen(false);
                        handleEdit(e, viewingProduct);
                      }}
                    >
                      <PencilEdit01Icon className="size-4" />
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>

      {/* Barcode Print Modal */}
      <PrintBarcodeModal
        product={barcodeModalProduct}
        open={barcodeModalOpen}
        onOpenChange={setBarcodeModalOpen}
      />
    </div>
  );
}
