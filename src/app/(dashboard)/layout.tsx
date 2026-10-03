"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { useAuth } from "@/hooks/useAuth"

// Pages accessible by staff role
const STAFF_ALLOWED_PATHS = [
  "/pos",
];

// Pages accessible only by super_admin
const SUPER_ADMIN_ONLY_PATHS = [
  "/warehouses",
  "/settings",
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    // 1. Staff role restrictions
    if (role === "staff") {
      const isAllowed = STAFF_ALLOWED_PATHS.some(
        (path) => pathname === path || pathname.startsWith(path + "/")
      );
      if (!isAllowed) {
        router.replace("/pos");
        return;
      }
    }

    // 2. Super Admin only path restrictions
    if (role !== "super_admin") {
      const isSuperAdminOnly = SUPER_ADMIN_ONLY_PATHS.some(
        (path) => pathname === path || pathname.startsWith(path + "/")
      );
      if (isSuperAdminOnly) {
        router.replace(role === "staff" ? "/pos" : "/");
        return;
      }
    }

    setAuthorized(true);
  }, [user, role, loading, pathname, router]);


  // Show loading state while checking auth
  if (loading || !authorized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="min-h-0 flex flex-col">
        <SiteHeader />
        <div className="flex flex-1 flex-col min-h-0">
          <div className="@container/main flex flex-1 flex-col min-h-0">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

