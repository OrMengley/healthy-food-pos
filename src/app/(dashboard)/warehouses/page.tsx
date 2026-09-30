"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  Home01Icon, 
  Add01Icon, 
  PencilEdit01Icon, 
  Delete01Icon, 
  Loading01Icon,
  Location01Icon,
  CallIcon
} from "hugeicons-react";
import { getWarehouses, archiveWarehouse } from "@/lib/firebase/warehouse-actions";
import { Warehouse } from "@/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WarehouseForm } from "@/components/forms/WarehouseForm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);

  async function fetchWarehouses() {
    try {
      setLoading(true);
      const data = await getWarehouses();
      setWarehouses(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load warehouses");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const handleEdit = (warehouse: Warehouse) => {
    setEditingWarehouse(warehouse);
    setSheetOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to archive this warehouse?")) {
      try {
        await archiveWarehouse(id);
        toast.success("Warehouse archived successfully");
        fetchWarehouses();
      } catch (error) {
        console.error(error);
        toast.error("Failed to archive warehouse");
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 py-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Home01Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Warehouse Management</h1>
            <p className="text-sm text-muted-foreground">Manage your storage locations</p>
          </div>
        </div>
        <Button 
          size="sm" 
          className="lg:hidden bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
          onClick={() => {
            setEditingWarehouse(null);
            setSheetOpen(true);
          }}
        >
          <Add01Icon className="mr-2 size-4" />
          Add Warehouse
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* Left Column: Quick Create Form */}
        <Card className="hidden lg:flex flex-col shadow-sm border-primary/10 max-h-[calc(100vh-160px)] overflow-hidden">
          <CardHeader className="shrink-0 bg-muted/30 pb-4 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Add01Icon className="size-5 text-primary" />
              Quick Create
            </CardTitle>
            <CardDescription>
              Add a new warehouse location.
            </CardDescription>
          </CardHeader>
          
          <ScrollArea className="flex-1 overflow-y-auto">
            <CardContent className="pt-6">
              <WarehouseForm onSuccess={() => {
                fetchWarehouses();
              }} />
            </CardContent>
          </ScrollArea>
        </Card>

        {/* Right Column: Data Table */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold text-xs uppercase tracking-wider">Name</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider">Address</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider">Phone</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider">Created At</TableHead>
                <TableHead className="text-right font-bold text-xs uppercase tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-48">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loading01Icon className="animate-spin size-6 text-primary" />
                      <span className="text-sm font-medium">Fetching warehouses...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : warehouses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-48 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Home01Icon className="size-8 opacity-20" />
                      <p>No warehouses found.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                warehouses.map((warehouse) => (
                  <TableRow key={warehouse.id} className="hover:bg-muted/30 transition-colors group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-lg bg-indigo-50 flex items-center justify-center font-bold text-indigo-600 text-xs shadow-sm">
                          <Home01Icon size={14} />
                        </div>
                        <span className="font-bold text-sm tracking-tight">{warehouse.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate font-medium">
                      <div className="flex items-center gap-1">
                        <Location01Icon size={14} className="shrink-0" />
                        {warehouse.address || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-medium">
                       <div className="flex items-center gap-1">
                        <CallIcon size={14} className="shrink-0" />
                        {warehouse.phone || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {warehouse.created_at
                        ? format(warehouse.created_at, "dd MMM yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="size-8 text-primary hover:bg-primary/10" onClick={() => handleEdit(warehouse)}>
                          <PencilEdit01Icon className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(warehouse.id)}>
                          <Delete01Icon className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit Sheet (and Mobile Create) */}
      <Sheet open={sheetOpen} onOpenChange={(val) => {
        setSheetOpen(val);
        if (!val) setEditingWarehouse(null);
      }}>
        <SheetContent side="right" className="sm:max-w-[500px] p-0 flex flex-col overflow-hidden">
          <SheetHeader className="p-6 pb-2 shrink-0 bg-muted/20 border-b">
            <SheetTitle className="text-xl font-bold flex items-center gap-2">
              {editingWarehouse ? <PencilEdit01Icon className="size-6 text-primary" /> : <Add01Icon className="size-6 text-primary" />}
              {editingWarehouse ? "Edit Warehouse" : "Add Warehouse"}
            </SheetTitle>
            <SheetDescription>
              {editingWarehouse ? "Update warehouse location details." : "Create a new storage location for your inventory."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-hidden flex flex-col">
            <WarehouseForm 
              initialData={editingWarehouse || undefined}
              onSuccess={() => {
                setSheetOpen(false);
                setEditingWarehouse(null);
                fetchWarehouses();
              }} 
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
