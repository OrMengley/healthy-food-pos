"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  UserIcon, 
  Loading01Icon,
  Archive01Icon,
  Edit01Icon,
  UserAdd01Icon,
  RefreshIcon,
  Store01Icon,
  LockPasswordIcon,
} from "hugeicons-react";
import { getUsers, archiveUser } from "@/lib/firebase/actions";
import { getWarehouses } from "@/lib/firebase/warehouse-actions";
import { User, Warehouse } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { UserForm } from "@/components/forms/UserForm";
import { ChangePasswordDialog } from "@/components/forms/ChangePasswordDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function UsersPage() {
  const { user: currentUser, role: currentUserRole } = useAuth();
  const isCurrentSuperAdmin = currentUserRole === "super_admin";
  const isCurrentAdmin = currentUserRole === "admin";

  const [users, setUsers] = useState<User[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog States
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);

  // Change Password Dialog
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [userForPassword, setUserForPassword] = useState<User | null>(null);

  // Archive Confirmation
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [userToProcess, setUserToProcess] = useState<User | null>(null);

  async function loadData() {
    try {
      setLoading(true);
      const [usersData, warehousesData] = await Promise.all([
        getUsers(),
        getWarehouses().catch(() => [] as Warehouse[]),
      ]);
      setUsers(usersData);
      setWarehouses(warehousesData);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load staff accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const handleArchive = async () => {
    if (!userToProcess) return;
    try {
      await archiveUser(userToProcess.id);
      toast.success(`User ${userToProcess.name} archived successfully`);
      setArchiveDialogOpen(false);
      loadData();
    } catch (error) {
      console.error(error);
      toast.error("Failed to archive user");
    }
  };

  const getWarehouseName = (warehouseId?: string) => {
    if (!warehouseId || warehouseId === "None" || warehouseId === "") {
      return "All Warehouses";
    }
    const found = warehouses.find((w) => w.id === warehouseId);
    return found ? found.name : warehouseId;
  };

  const displayedUsers = users.filter((u) => {
    if (isCurrentSuperAdmin) return true;
    return u.role !== "super_admin";
  });

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 py-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-sm">
            <UserIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">
              {isCurrentSuperAdmin ? "Staff & Roles Management" : "Staff Management"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isCurrentSuperAdmin
                ? "Manage super_admin, admin, and staff accounts"
                : "Manage and create staff accounts for your store"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-9 gap-1.5 text-xs font-semibold"
          >
            <RefreshIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
            className="h-9 gap-1.5 text-xs font-bold bg-primary hover:bg-primary/90 shadow-sm"
          >
            <UserAdd01Icon className="size-4" />
            Add Staff Member
          </Button>
        </div>
      </div>

      {/* Staff Data Table */}
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden flex flex-col">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-bold text-xs uppercase tracking-wider">Staff Member</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider">Role</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider">Assigned Warehouse</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider">Status</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider">Created At</TableHead>
              <TableHead className="text-right font-bold text-xs uppercase tracking-wider">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-48">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loading01Icon className="animate-spin size-6 text-primary" />
                    <span className="text-sm font-medium">Fetching staff accounts...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : displayedUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-48 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <UserIcon className="size-8 opacity-20" />
                    <p className="font-medium text-sm">No staff accounts found.</p>
                    <Button 
                      size="sm" 
                      onClick={() => setCreateDialogOpen(true)}
                      className="mt-2 text-xs"
                    >
                      <UserAdd01Icon className="size-3.5 mr-1" />
                      Add First Staff Member
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              displayedUsers.map((user) => {
                const isSuperAdmin = user.role === "super_admin";
                const isAdmin = user.role === "admin";
                const isStaff = user.role === "staff";
                const isActive = user.status !== "inactive";
                const warehouseName = getWarehouseName(user.warehouse_id);
                
                const isSelf = !!currentUser && (
                  currentUser.id === user.id || 
                  currentUser.uid === user.id || 
                  (!!user.uid && currentUser.uid === user.uid)
                );

                const canEdit = isCurrentSuperAdmin || isSelf || (isCurrentAdmin && isStaff);
                const canChangePassword = isCurrentSuperAdmin || isSelf || (isCurrentAdmin && isStaff);
                const canArchive = !isSelf && (isCurrentSuperAdmin || (isCurrentAdmin && isStaff));
                const hasAnyAction = canEdit || canChangePassword || canArchive;

                return (
                  <TableRow key={user.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {user.avatar_url ? (
                          <Image
                            src={user.avatar_url}
                            alt={user.name}
                            width={32}
                            height={32}
                            className="size-8 rounded-full object-cover shrink-0 shadow-sm"
                          />
                        ) : (
                          <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm tracking-tight">{user.name}</span>
                            {isSelf && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20 font-semibold">
                                You
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {user.username ? `@${user.username}` : user.id}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="secondary" 
                        className={`font-semibold text-[10px] px-2 py-0.5 ${
                          isSuperAdmin 
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200" 
                          : isAdmin
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200"
                        }`}
                      >
                        {isSuperAdmin ? "Super Admin" : isAdmin ? "Admin" : "Staff"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <Store01Icon className="size-3.5 text-primary/70 shrink-0" />
                        <span>{warehouseName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={`font-bold text-[10px] px-2 py-0.5 ${
                          isActive 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-neutral-100 text-neutral-600 border-neutral-300 dark:bg-neutral-900 dark:text-neutral-400"
                        }`}
                      >
                        {isActive ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.created_at
                        ? format(user.created_at, "dd MMM yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {hasAnyAction ? (
                        <div className="flex justify-end gap-1.5">
                          {canEdit && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-xs h-8 px-2.5 font-semibold"
                              onClick={() => {
                                setUserToEdit(user);
                                setEditDialogOpen(true);
                              }}
                            >
                              <Edit01Icon className="size-3.5 mr-1" />
                              Edit
                            </Button>
                          )}
                          {canChangePassword && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-xs h-8 px-2.5 font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950/40"
                              onClick={() => {
                                setUserForPassword(user);
                                setPasswordDialogOpen(true);
                              }}
                            >
                              <LockPasswordIcon className="size-3.5 mr-1" />
                              Password
                            </Button>
                          )}
                          {canArchive && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-xs h-8 px-2.5 font-semibold text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setUserToProcess(user);
                                setArchiveDialogOpen(true);
                              }}
                            >
                              <Archive01Icon className="size-3.5 mr-1" />
                              Archive
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic pr-2">Protected</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <UserAdd01Icon className="size-5 text-primary" />
              Create Staff Account
            </DialogTitle>
            <DialogDescription className="text-xs">
              Fill in the staff information below. An account and login profile will be created automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            <UserForm 
              onSuccess={() => {
                setCreateDialogOpen(false);
                loadData();
              }} 
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Edit01Icon className="size-5 text-primary" />
              Edit Staff Account
            </DialogTitle>
            <DialogDescription className="text-xs">
              Update staff details, username, role permissions, or assigned warehouse.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            {userToEdit && (
              <UserForm 
                initialData={userToEdit}
                onSuccess={() => {
                  setEditDialogOpen(false);
                  setUserToEdit(null);
                  loadData();
                }} 
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <ChangePasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        user={userForPassword}
        onSuccess={loadData}
      />

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Archive01Icon className="size-5 text-amber-600" />
              Archive User account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will set <strong>{userToProcess?.name}</strong> as archived. They will no longer be able to access the system, but their historical data will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleArchive}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Archive User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

