"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Archive01Icon,
  ArrowLeft01Icon,
  Loading01Icon,
  RefreshIcon,
  Delete01Icon,
  GridViewIcon,
  CheckmarkCircle01Icon,
} from "hugeicons-react";
import {
  getArchivedCategories,
  restoreCategory,
  deleteCategoryPermanent,
} from "@/lib/firebase/actions";
import { Category } from "@/types";
import { useAuth } from "@/hooks/useAuth";
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

export default function ArchivedCategoriesPage() {
  const router = useRouter();
  const { role, loading: authLoading } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryToPermanentDelete, setCategoryToPermanentDelete] = useState<Category | null>(null);

  const isSuperAdmin = role === "super_admin";

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      toast.error("Only Super Admin has access to archived categories.");
      router.replace("/categories");
    }
  }, [authLoading, isSuperAdmin, router]);

  async function fetchArchived() {
    try {
      setLoading(true);
      const data = await getArchivedCategories();
      setCategories(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load archived categories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isSuperAdmin) {
      fetchArchived();
    }
  }, [isSuperAdmin]);

  const handleRestore = async (category: Category) => {
    try {
      await restoreCategory(category.id);
      toast.success(`Category "${category.name}" restored successfully`);
      fetchArchived();
    } catch (error) {
      console.error(error);
      toast.error("Failed to restore category");
    }
  };

  const handlePermanentDelete = async () => {
    if (!categoryToPermanentDelete) return;
    try {
      await deleteCategoryPermanent(categoryToPermanentDelete.id);
      toast.success(`Category "${categoryToPermanentDelete.name}" permanently deleted`);
      setCategoryToPermanentDelete(null);
      fetchArchived();
    } catch (error) {
      console.error(error);
      toast.error("Failed to permanently delete category");
    }
  };

  if (authLoading || (!isSuperAdmin && !loading)) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loading01Icon className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="size-9 rounded-xl" asChild>
            <Link href="/categories">
              <ArrowLeft01Icon className="size-5" />
            </Link>
          </Button>
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Archive01Icon className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight md:text-2xl">
                Archived Categories
              </h1>
              <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold">
                Super Admin Only
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Categories archived by store administrators. You can restore them back to the active menu.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchArchived}
            disabled={loading}
            className="h-9 gap-1.5 text-xs font-semibold"
          >
            <RefreshIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button variant="default" size="sm" asChild className="h-9 font-semibold text-xs">
            <Link href="/categories">
              <GridViewIcon className="size-4 mr-1.5" />
              Active Categories
            </Link>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="font-bold">Category Name</TableHead>
              <TableHead className="font-bold">Original Status</TableHead>
              <TableHead className="font-bold">Archived Date</TableHead>
              <TableHead className="text-right font-bold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center h-48">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loading01Icon className="animate-spin size-6 text-primary" />
                    <span>Loading archived categories...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center h-48 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Archive01Icon className="size-8 opacity-20" />
                    <p className="font-medium text-sm">No archived categories found.</p>
                    <p className="text-xs text-muted-foreground">
                      Categories archived from the main categories list will appear here.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              categories.map((category) => (
                <TableRow key={category.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-bold text-foreground">
                    <div className="flex items-center gap-2">
                      <span>{category.name}</span>
                      <Badge variant="outline" className="text-[10px] bg-neutral-100 text-neutral-600 dark:bg-neutral-800">
                        Archived
                      </Badge>
                    </div>
                  </TableCell>
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
                  <TableCell className="text-muted-foreground text-xs font-medium">
                    {(category as any).archived_at
                      ? format(new Date((category as any).archived_at), "MMM dd, yyyy HH:mm")
                      : category.created_at
                      ? format(new Date(category.created_at), "MMM dd, yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        onClick={() => handleRestore(category)}
                      >
                        <CheckmarkCircle01Icon className="size-3.5 mr-1" />
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs font-semibold text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setCategoryToPermanentDelete(category)}
                      >
                        <Delete01Icon className="size-3.5 mr-1" />
                        Delete Permanently
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Permanent Delete Confirmation Dialog */}
      <AlertDialog
        open={!!categoryToPermanentDelete}
        onOpenChange={(open) => !open && setCategoryToPermanentDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Delete01Icon className="size-5" />
              Permanently Delete Category?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete category <strong>{categoryToPermanentDelete?.name}</strong>? This action cannot be undone and will permanently remove this record from Firestore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePermanentDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
