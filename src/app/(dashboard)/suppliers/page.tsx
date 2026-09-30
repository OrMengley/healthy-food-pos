"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Add01Icon,
  Delete01Icon,
  Loading01Icon,
  PencilEdit01Icon,
  Cancel01Icon,
  UserMultipleIcon,
  Call02Icon,
  Location01Icon,
  Search01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  UserIcon,
  Calendar01Icon,
  CheckmarkCircle01Icon,
  ViewIcon,
} from "hugeicons-react";
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from "@/lib/firebase/supplier-actions";
import { Supplier } from "@/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";

export default function SuppliersPage() {
  // Data
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);

  // Detail sheet
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // ─── Fetch ──────────────────────────────────────────────
  async function fetchData() {
    setLoading(true);
    try {
      const data = await getSuppliers();
      setSuppliers(data);
    } catch (error) {
      console.error("Failed to load suppliers:", error);
      toast.error("Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  // ─── Stats ──────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = suppliers.length;
    const withPhone = suppliers.filter((s) => s.phone).length;
    const withAddress = suppliers.filter((s) => s.address).length;
    const thisMonth = suppliers.filter((s) => {
      const now = new Date();
      const d = new Date(s.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    return { total, withPhone, withAddress, thisMonth };
  }, [suppliers]);

  // ─── Filtering & pagination ─────────────────────────────
  const filteredSuppliers = useMemo(() => {
    let result = [...suppliers];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.phone && s.phone.toLowerCase().includes(q)) ||
          (s.address && s.address.toLowerCase().includes(q))
      );
    }
    result.sort((a, b) =>
      sortOrder === "desc"
        ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return result;
  }, [suppliers, searchQuery, sortOrder]);

  const totalPages = Math.ceil(filteredSuppliers.length / itemsPerPage);
  const paginatedSuppliers = useMemo(
    () => filteredSuppliers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filteredSuppliers, currentPage]
  );

  // ─── Form helpers ───────────────────────────────────────
  function resetForm() {
    setName("");
    setPhone("");
    setAddress("");
    setEditingSupplier(null);
  }

  function openEdit(s: Supplier) {
    setEditingSupplier(s);
    setName(s.name);
    setPhone(s.phone || "");
    setAddress(s.address || "");
  }

  // ─── Save (create/update) ──────────────────────────────
  async function handleSave() {
    if (!name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    setSaving(true);
    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, {
          name: name.trim(),
          phone: phone.trim() || "",
          address: address.trim() || "",
        });
        toast.success("Supplier updated successfully");
      } else {
        await createSupplier({
          name: name.trim(),
          phone: phone.trim() || "",
          address: address.trim() || "",
          created_by: "admin",
        });
        toast.success("Supplier created successfully");
      }
      resetForm();
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(editingSupplier ? "Failed to update supplier" : "Failed to create supplier");
    } finally {
      setSaving(false);
    }
  }

  // ─── Delete ─────────────────────────────────────────────
  async function handleDelete(id: string) {
    try {
      await deleteSupplier(id);
      toast.success("Supplier deleted");
      fetchData();
    } catch (error) {
      toast.error("Failed to delete supplier");
    }
  }

  // ─── Loading state ─────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loading01Icon className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium">Loading suppliers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 py-4">
      {/* ─── Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <UserMultipleIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Suppliers</h1>
            <p className="text-sm text-muted-foreground">Manage your product suppliers and contacts</p>
          </div>
        </div>
      </div>

      {/* ─── Dashboard Cards ───────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/30 border-teal-200/50 dark:border-teal-800/30">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">Total Suppliers</p>
              <UserMultipleIcon className="h-4 w-4 text-teal-500" />
            </div>
            <p className="text-2xl font-black text-teal-700 dark:text-teal-300">{stats.total}</p>
            <p className="text-xs text-muted-foreground mt-1">Active suppliers</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30 border-blue-200/50 dark:border-blue-800/30">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">With Phone</p>
              <Call02Icon className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-black text-blue-700 dark:text-blue-300">{stats.withPhone}</p>
            <p className="text-xs text-muted-foreground mt-1">Have contact number</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 border-violet-200/50 dark:border-violet-800/30">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">With Address</p>
              <Location01Icon className="h-4 w-4 text-violet-500" />
            </div>
            <p className="text-2xl font-black text-violet-700 dark:text-violet-300">{stats.withAddress}</p>
            <p className="text-xs text-muted-foreground mt-1">Have location info</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200/50 dark:border-amber-800/30">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">New This Month</p>
              <Calendar01Icon className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-2xl font-black text-amber-700 dark:text-amber-300">{stats.thisMonth}</p>
            <p className="text-xs text-muted-foreground mt-1">{format(new Date(), "MMMM yyyy")}</p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Main Content: Form (Left) + Table (Right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* ─── LEFT: Create / Edit Form ──────────────── */}
        <div className="order-2 lg:order-1">
          <div className="rounded-xl border bg-card shadow-sm sticky top-4">
            {/* Form header */}
            <div className="px-5 py-4 border-b bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/20 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                    {editingSupplier ? (
                      <PencilEdit01Icon className="h-4 w-4 text-white" />
                    ) : (
                      <Add01Icon className="h-4 w-4 text-white" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">
                      {editingSupplier ? "Edit Supplier" : "New Supplier"}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {editingSupplier ? "Update supplier details" : "Add a new supplier"}
                    </p>
                  </div>
                </div>
                {editingSupplier && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={resetForm}
                  >
                    <Cancel01Icon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Form body */}
            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Supplier Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter supplier name..."
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Call02Icon className="h-3.5 w-3.5" />
                  Phone Number
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +855 12 345 678"
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Location01Icon className="h-3.5 w-3.5" />
                  Address
                </Label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter supplier address..."
                  className="h-10"
                />
              </div>

              <Button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="w-full h-11 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white shadow-lg shadow-teal-500/25 gap-2 mt-2"
              >
                {saving ? (
                  <Loading01Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckmarkCircle01Icon className="h-4 w-4" />
                )}
                <span className="font-semibold text-sm">
                  {saving
                    ? "Saving..."
                    : editingSupplier
                    ? "Update Supplier"
                    : "Create Supplier"}
                </span>
              </Button>

              {editingSupplier && (
                <Button
                  variant="outline"
                  onClick={resetForm}
                  className="w-full h-10 text-sm"
                >
                  Cancel Edit
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ─── RIGHT: Table ──────────────────────────── */}
        <div className="order-1 lg:order-2 flex flex-col gap-4">
          {/* Search & Sort */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search01Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or address..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 h-10 bg-background border-border/60"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
              className="h-10 w-10 shrink-0"
              title={sortOrder === "desc" ? "Newest first" : "Oldest first"}
            >
              {sortOrder === "desc" ? (
                <ArrowDown01Icon className="h-4 w-4" />
              ) : (
                <ArrowUp01Icon className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Table */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10 font-semibold text-xs">#</TableHead>
                  <TableHead className="font-semibold text-xs">Name</TableHead>
                  <TableHead className="font-semibold text-xs">Phone</TableHead>
                  <TableHead className="font-semibold text-xs">Address</TableHead>
                  <TableHead className="font-semibold text-xs">Created</TableHead>
                  <TableHead className="font-semibold text-xs text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-40">
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <UserMultipleIcon className="h-10 w-10 opacity-30" />
                        <p className="font-medium">No suppliers found.</p>
                        <p className="text-sm">Add a supplier using the form.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedSuppliers.map((s, idx) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setViewingSupplier(s)}
                    >
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
                            <span className="text-white font-bold text-sm">
                              {s.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-sm">{s.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.phone ? (
                          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                            <Call02Icon className="h-3.5 w-3.5" />
                            {s.phone}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px]">
                        {s.address ? (
                          <span className="truncate block">{s.address}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(s.created_at), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-center">
                        <div
                          className="flex items-center justify-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-950/50"
                            onClick={() => setViewingSupplier(s)}
                          >
                            <ViewIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/50"
                            onClick={() => openEdit(s)}
                          >
                            <PencilEdit01Icon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                            onClick={() => handleDelete(s.id)}
                          >
                            <Delete01Icon className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  Showing {(currentPage - 1) * itemsPerPage + 1}–
                  {Math.min(currentPage * itemsPerPage, filteredSuppliers.length)} of{" "}
                  {filteredSuppliers.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                    className="h-8 text-xs"
                  >
                    Previous
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const page = i + 1;
                    return (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                        className="h-8 w-8 text-xs"
                      >
                        {page}
                      </Button>
                    );
                  })}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(currentPage + 1)}
                    className="h-8 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── VIEW SUPPLIER DETAIL SHEET ────────────────── */}
      <Sheet open={!!viewingSupplier} onOpenChange={(open) => !open && setViewingSupplier(null)}>
        <SheetContent side="right" className="!w-full sm:!max-w-md p-0 flex flex-col">
          {viewingSupplier && (
            <>
              <SheetHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/30 shrink-0">
                <SheetTitle className="flex items-center gap-2 text-lg">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                    <UserIcon className="h-4 w-4 text-white" />
                  </div>
                  Supplier Details
                </SheetTitle>
                <SheetDescription>View supplier contact information</SheetDescription>
              </SheetHeader>

              <ScrollArea className="flex-1 min-h-0">
                <div className="p-6 space-y-6">
                  {/* Avatar & Name */}
                  <div className="flex flex-col items-center gap-4 py-4">
                    <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shadow-xl shadow-teal-500/20">
                      <span className="text-white font-black text-3xl">
                        {viewingSupplier.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="text-center">
                      <h2 className="text-xl font-bold">{viewingSupplier.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        Added {format(new Date(viewingSupplier.created_at), "dd MMM yyyy")}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Info Cards */}
                  <div className="space-y-3">
                    <div className="rounded-xl bg-muted/40 p-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <Call02Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Phone
                        </p>
                        <p className="text-sm font-semibold truncate">
                          {viewingSupplier.phone || "Not provided"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-muted/40 p-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                        <Location01Icon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Address
                        </p>
                        <p className="text-sm font-semibold">
                          {viewingSupplier.address || "Not provided"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-muted/40 p-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                        <UserIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Created By
                        </p>
                        <p className="text-sm font-semibold">{viewingSupplier.created_by}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              {/* Bottom actions */}
              <div className="p-6 border-t bg-muted/30 shrink-0 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 h-11 gap-2"
                  onClick={() => {
                    const s = viewingSupplier;
                    setViewingSupplier(null);
                    openEdit(s);
                  }}
                >
                  <PencilEdit01Icon className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-11 gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 dark:border-red-800 dark:hover:bg-red-950/50"
                  onClick={() => {
                    handleDelete(viewingSupplier.id);
                    setViewingSupplier(null);
                  }}
                >
                  <Delete01Icon className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
