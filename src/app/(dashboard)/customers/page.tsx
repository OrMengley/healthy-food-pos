"use client";

import { useEffect, useState, useMemo, useRef } from "react";
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
  ImageAdd01Icon,
} from "hugeicons-react";
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/firebase/customer-actions";
import { Customer } from "@/types";
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
import Image from "next/image";
import imageCompression from "browser-image-compression";

const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "il9ikkuq";
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "ml_default";

export default function CustomersPage() {
  // Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Detail sheet
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // ─── Fetch ──────────────────────────────────────────────
  async function fetchData() {
    setLoading(true);
    try {
      const data = await getCustomers();
      setCustomers(data);
    } catch (error) {
      console.error("Failed to load customers:", error);
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  // ─── Stats ──────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = customers.length;
    const withPhone = customers.filter((c) => c.phone).length;
    const withLocation = customers.filter((c) => c.location).length;
    const thisMonth = customers.filter((c) => {
      const now = new Date();
      const d = new Date(c.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    return { total, withPhone, withLocation, thisMonth };
  }, [customers]);

  // ─── Filtering & pagination ─────────────────────────────
  const filteredCustomers = useMemo(() => {
    let result = [...customers];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.toLowerCase().includes(q)) ||
          (c.location && c.location.toLowerCase().includes(q))
      );
    }
    result.sort((a, b) =>
      sortOrder === "desc"
        ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return result;
  }, [customers, searchQuery, sortOrder]);

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const paginatedCustomers = useMemo(
    () => filteredCustomers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filteredCustomers, currentPage]
  );

  // ─── Form helpers ───────────────────────────────────────
  // ─── Avatar upload ──────────────────────────────────────
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      let processedFile: File = file;

      // Compress if > 1MB
      if (file.size > 1024 * 1024) {
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 512,
          useWebWorker: true,
        });
        processedFile = new File([compressed], file.name, { type: file.type });
      }

      const formData = new FormData();
      formData.append("file", processedFile);
      formData.append("upload_preset", UPLOAD_PRESET);
      formData.append("folder", "customers");

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || "Upload failed");
      }

      const data = await response.json();
      setAvatarUrl(data.secure_url);
      toast.success("Avatar uploaded!");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to upload avatar");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function resetForm() {
    setName("");
    setPhone("");
    setLocation("");
    setAvatarUrl("");
    setEditingCustomer(null);
  }

  function openEdit(c: Customer) {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone || "");
    setLocation(c.location || "");
    setAvatarUrl(c.avatar_url || "");
  }

  // ─── Save (create/update) ──────────────────────────────
  async function handleSave() {
    if (!name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    setSaving(true);
    try {
      const payload: Omit<Customer, "id" | "created_at" | "is_deleted"> = {
        name: name.trim(),
        ...(phone.trim() && { phone: phone.trim() }),
        ...(location.trim() && { location: location.trim() }),
        ...(avatarUrl.trim() && { avatar_url: avatarUrl.trim() }),
      };

      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, payload);
        toast.success("Customer updated successfully");
      } else {
        await createCustomer(payload);
        toast.success("Customer created successfully");
      }
      resetForm();
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(editingCustomer ? "Failed to update customer" : "Failed to create customer");
    } finally {
      setSaving(false);
    }
  }

  // ─── Delete ─────────────────────────────────────────────
  async function handleDelete(id: string) {
    try {
      await deleteCustomer(id);
      toast.success("Customer deleted");
      fetchData();
    } catch (error) {
      toast.error("Failed to delete customer");
    }
  }

  // ─── Loading state ─────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loading01Icon className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium">Loading customers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 py-4">
      {/* ─── Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <UserMultipleIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Customers</h1>
            <p className="text-sm text-muted-foreground">Manage your customers and contacts</p>
          </div>
        </div>
      </div>

      {/* ─── Dashboard Cards ───────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-indigo-200/50 dark:border-indigo-800/30">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Total Customers</p>
              <UserMultipleIcon className="h-4 w-4 text-indigo-500" />
            </div>
            <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{stats.total}</p>
            <p className="text-xs text-muted-foreground mt-1">Active customers</p>
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
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">With Location</p>
              <Location01Icon className="h-4 w-4 text-violet-500" />
            </div>
            <p className="text-2xl font-black text-violet-700 dark:text-violet-300">{stats.withLocation}</p>
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
            <div className="px-5 py-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    {editingCustomer ? (
                      <PencilEdit01Icon className="h-4 w-4 text-white" />
                    ) : (
                      <Add01Icon className="h-4 w-4 text-white" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">
                      {editingCustomer ? "Edit Customer" : "New Customer"}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {editingCustomer ? "Update customer details" : "Add a new customer"}
                    </p>
                  </div>
                </div>
                {editingCustomer && (
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
                  Customer Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter customer name..."
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Call02Icon className="h-3.5 w-3.5" />
                  Phone Number <span className="text-xs font-normal text-muted-foreground/60">(optional)</span>
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
                  Location <span className="text-xs font-normal text-muted-foreground/60">(optional)</span>
                </Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Enter customer location..."
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <ImageAdd01Icon className="h-3.5 w-3.5" />
                  Avatar <span className="text-xs font-normal text-muted-foreground/60">(optional)</span>
                </Label>
                <div
                  className="relative h-24 w-24 rounded-xl border-2 border-dashed border-indigo-200 dark:border-indigo-800/50 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors overflow-hidden group"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {uploading ? (
                    <div className="h-full w-full flex items-center justify-center bg-muted/50">
                      <Loading01Icon className="h-6 w-6 animate-spin text-indigo-500" />
                    </div>
                  ) : avatarUrl ? (
                    <>
                      <Image
                        src={avatarUrl}
                        alt="Avatar preview"
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ImageAdd01Icon className="h-5 w-5 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center gap-1">
                      <ImageAdd01Icon className="h-6 w-6 text-indigo-400/60" />
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-indigo-400/60">
                        Upload
                      </span>
                    </div>
                  )}
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={handleAvatarUpload}
                  />
                </div>
                {avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 px-2"
                    onClick={() => setAvatarUrl("")}
                  >
                    <Delete01Icon className="h-3 w-3 mr-1" />
                    Remove avatar
                  </Button>
                )}
              </div>

              <Button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="w-full h-11 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/25 gap-2 mt-2"
              >
                {saving ? (
                  <Loading01Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckmarkCircle01Icon className="h-4 w-4" />
                )}
                <span className="font-semibold text-sm">
                  {saving
                    ? "Saving..."
                    : editingCustomer
                    ? "Update Customer"
                    : "Create Customer"}
                </span>
              </Button>

              {editingCustomer && (
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
                placeholder="Search by name, phone, or location..."
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
                  <TableHead className="font-semibold text-xs">Customer</TableHead>
                  <TableHead className="font-semibold text-xs">Phone</TableHead>
                  <TableHead className="font-semibold text-xs">Location</TableHead>
                  <TableHead className="font-semibold text-xs">Created</TableHead>
                  <TableHead className="font-semibold text-xs text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-40">
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <UserMultipleIcon className="h-10 w-10 opacity-30" />
                        <p className="font-medium">No customers found.</p>
                        <p className="text-sm">Add a customer using the form.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedCustomers.map((c, idx) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setViewingCustomer(c)}
                    >
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {c.avatar_url ? (
                            <Image
                              src={c.avatar_url}
                              alt={c.name}
                              width={36}
                              height={36}
                              className="h-9 w-9 rounded-full object-cover shrink-0 shadow-sm"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shrink-0 shadow-sm">
                              <span className="text-white font-bold text-sm">
                                {c.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <span className="font-medium text-sm">{c.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.phone ? (
                          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                            <Call02Icon className="h-3.5 w-3.5" />
                            {c.phone}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px]">
                        {c.location ? (
                          <span className="truncate block">{c.location}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(c.created_at), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-center">
                        <div
                          className="flex items-center justify-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/50"
                            onClick={() => setViewingCustomer(c)}
                          >
                            <ViewIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/50"
                            onClick={() => openEdit(c)}
                          >
                            <PencilEdit01Icon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                            onClick={() => handleDelete(c.id)}
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
                  {Math.min(currentPage * itemsPerPage, filteredCustomers.length)} of{" "}
                  {filteredCustomers.length}
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

      {/* ─── VIEW CUSTOMER DETAIL SHEET ────────────────── */}
      <Sheet open={!!viewingCustomer} onOpenChange={(open) => !open && setViewingCustomer(null)}>
        <SheetContent side="right" className="!w-full sm:!max-w-md p-0 flex flex-col">
          {viewingCustomer && (
            <>
              <SheetHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 shrink-0">
                <SheetTitle className="flex items-center gap-2 text-lg">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <UserIcon className="h-4 w-4 text-white" />
                  </div>
                  Customer Details
                </SheetTitle>
                <SheetDescription>View customer contact information</SheetDescription>
              </SheetHeader>

              <ScrollArea className="flex-1 min-h-0">
                <div className="p-6 space-y-6">
                  {/* Avatar & Name */}
                  <div className="flex flex-col items-center gap-4 py-4">
                    {viewingCustomer.avatar_url ? (
                      <Image
                        src={viewingCustomer.avatar_url}
                        alt={viewingCustomer.name}
                        width={80}
                        height={80}
                        className="h-20 w-20 rounded-2xl object-cover shadow-xl shadow-indigo-500/20"
                      />
                    ) : (
                      <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-xl shadow-indigo-500/20">
                        <span className="text-white font-black text-3xl">
                          {viewingCustomer.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="text-center">
                      <h2 className="text-xl font-bold">{viewingCustomer.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        Added {format(new Date(viewingCustomer.created_at), "dd MMM yyyy")}
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
                          {viewingCustomer.phone || "Not provided"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-muted/40 p-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                        <Location01Icon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Location
                        </p>
                        <p className="text-sm font-semibold">
                          {viewingCustomer.location || "Not provided"}
                        </p>
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
                    const c = viewingCustomer;
                    setViewingCustomer(null);
                    openEdit(c);
                  }}
                >
                  <PencilEdit01Icon className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-11 gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 dark:border-red-800 dark:hover:bg-red-950/50"
                  onClick={() => {
                    handleDelete(viewingCustomer.id);
                    setViewingCustomer(null);
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
