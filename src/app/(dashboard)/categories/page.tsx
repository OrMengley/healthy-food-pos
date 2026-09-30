"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  Add01Icon, 
  PencilEdit01Icon, 
  Delete01Icon, 
  GridViewIcon,
  Loading01Icon,
  Archive01Icon,
  RefreshIcon
} from "hugeicons-react";
import { getCategories, archiveCategory } from "@/lib/firebase/actions";
import { toast } from "sonner";
import { Category } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CategoryForm } from "@/components/forms/CategoryForm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function CategoriesPage() {
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin" || isSuperAdmin;

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryToArchive, setCategoryToArchive] = useState<Category | null>(null);
  const [archiving, setArchiving] = useState(false);

  async function fetchCategories() {
    try {
      setLoading(true);
      const data = await getCategories();
      setCategories(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setSheetOpen(true);
  };

  const handleConfirmArchive = async () => {
    if (!categoryToArchive) return;
    setArchiving(true);
    try {
      await archiveCategory(categoryToArchive.id);
      toast.success(`Category "${categoryToArchive.name}" deleted successfully`);
      setCategoryToArchive(null);
      fetchCategories();
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete category");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <GridViewIcon className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight md:text-2xl">Menu Categories</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Organize food products into categories like Bowls, Smoothies, Drinks, and Snacks.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCategories}
            disabled={loading}
            className="h-9 gap-1.5 text-xs font-semibold"
          >
            <RefreshIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-9 gap-1.5 font-semibold text-xs border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
            >
              <Link href="/categories/archived">
                <Archive01Icon className="size-4" />
                Archived Categories
              </Link>
            </Button>
          )}

          {isAdmin && (
            <Button 
              size="sm" 
              className="lg:hidden bg-primary hover:bg-primary/90 shadow-md font-semibold h-9"
              onClick={() => {
                setEditingCategory(null);
                setSheetOpen(true);
              }}
            >
              <Add01Icon className="mr-1.5 size-4" />
              Add Category
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* Left Column: Create Form (Hidden on Mobile) */}
        {isAdmin && (
          <Card className="hidden lg:block shadow-sm border-primary/10">
            <CardHeader className="bg-muted/20 border-b pb-3">
              <CardTitle className="text-base flex items-center gap-2 font-bold">
                <Add01Icon className="size-5 text-primary" />
                Add Category
              </CardTitle>
              <CardDescription className="text-xs">
                Create a category for healthy food items.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <CategoryForm 
                onSuccess={() => {
                  fetchCategories();
                }} 
              />
            </CardContent>
          </Card>
        )}

        {/* Right Column: Data Table */}
        <div className={`rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col ${!isAdmin ? "lg:col-span-2" : ""}`}>
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-bold">Category Name</TableHead>
                <TableHead className="font-bold">Status</TableHead>
                <TableHead className="font-bold">Created Date</TableHead>
                <TableHead className="text-right font-bold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center h-48">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loading01Icon className="animate-spin size-6 text-primary" />
                      <span>Loading categories...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : categories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center h-48 text-muted-foreground">
                    No categories found. Create your first category above.
                  </TableCell>
                </TableRow>
              ) : (
                categories.map((category) => (
                  <TableRow key={category.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-bold text-foreground">{category.name}</TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={`text-xs font-semibold ${
                          category.status === "inactive" 
                            ? "bg-neutral-100 text-neutral-500 border-neutral-200" 
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {category.status === "inactive" ? "Inactive" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {category.created_at
                        ? format(new Date(category.created_at), "MMM dd, yyyy")
                        : "Just now"}
                    </TableCell>
                    <TableCell className="text-right">
                      {isAdmin ? (
                        <div className="flex justify-end gap-1">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="size-8 text-primary hover:text-primary hover:bg-primary/10" 
                            onClick={() => handleEdit(category)}
                            title="Edit"
                          >
                            <PencilEdit01Icon className="size-4" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10" 
                            onClick={() => setCategoryToArchive(category)}
                            title="Delete / Archive Category"
                          >
                            <Delete01Icon className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic pr-2">Read only</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(val) => {
        setSheetOpen(val);
        if (!val) setEditingCategory(null);
      }}>
        <SheetContent 
          side="right" 
          className="sm:max-w-[450px] bg-background p-0 flex flex-col overflow-hidden"
        >
          <SheetHeader className="p-6 bg-primary/5 border-b shrink-0">
            <SheetTitle className="text-xl font-bold flex items-center gap-2">
              {editingCategory ? (
                <PencilEdit01Icon className="size-5 text-primary" />
              ) : (
                <Add01Icon className="size-5 text-primary" />
              )}
              {editingCategory ? "Edit Category" : "Create Category"}
            </SheetTitle>
            <SheetDescription>
              {editingCategory ? "Update the category details." : "Add a category to organize food products."}
            </SheetDescription>
          </SheetHeader>
          <div className="p-6 flex-1 overflow-y-auto">
            <CategoryForm 
              initialData={editingCategory || undefined}
              onSuccess={() => {
                setSheetOpen(false);
                setEditingCategory(null);
                fetchCategories();
              }} 
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog 
        open={!!categoryToArchive} 
        onOpenChange={(open) => !open && setCategoryToArchive(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Delete01Icon className="size-5" />
              Delete Category?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure to delete this category <strong>{categoryToArchive?.name}</strong>? It cannot be returned back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmArchive}
              disabled={archiving}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              {archiving ? "Deleting..." : "Delete Category"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
