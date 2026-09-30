"use client";

import * as React from "react";
import Link from "next/link";
import {
  BarChartIcon,
  DashboardSquare01Icon,
  GridViewIcon,
  Package01Icon,
  ShoppingCart01Icon,
  Settings01Icon,
  ArrowDown01Icon,
  Store01Icon,
  Home01Icon,
  Invoice01Icon,
  Archive02Icon,
  MoneyReceiveSquareIcon,
  ChartIncreaseIcon,
  Dollar01Icon,
} from "hugeicons-react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { auth } from "@/lib/firebase/config";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import { StoreSettings } from "@/types";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const superAdminNavItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: DashboardSquare01Icon,
  },
  {
    title: "POS Counter",
    url: "/pos",
    icon: ShoppingCart01Icon,
  },
  {
    title: "Sales Invoices",
    url: "/sales",
    icon: MoneyReceiveSquareIcon,
  },
  {
    title: "Sale Detail",
    url: "/sales/details",
    icon: Invoice01Icon,
  },
  {
    title: "Sale Summary",
    url: "/reports/sale-summary",
    icon: ChartIncreaseIcon,
  },
  {
    title: "Sale by Category",
    url: "/reports/sale-by-category",
    icon: GridViewIcon,
  },
  {
    title: "Profit & Loss",
    url: "/reports/profit-loss",
    icon: Dollar01Icon,
  },
  {
    title: "Products",
    url: "/products",
    icon: Package01Icon,
  },
  {
    title: "Categories",
    url: "/categories",
    icon: GridViewIcon,
  },
  {
    title: "Inventory",
    url: "/inventory",
    icon: Archive02Icon,
  },
  {
    title: "Purchases",
    url: "/purchases",
    icon: Invoice01Icon,
  },
  {
    title: "Warehouses",
    url: "/warehouses",
    icon: Home01Icon,
  },
  {
    title: "Stock Adjustment",
    url: "/stock-adjustment",
    icon: Settings01Icon,
  },
  {
    title: "Stock History",
    url: "/stock-movement",
    icon: BarChartIcon,
  },
  {
    title: "Staff & Users",
    url: "/users",
    icon: Store01Icon,
  },
  {
    title: "Store Settings",
    url: "/settings",
    icon: Settings01Icon,
  },
];

const adminNavItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: DashboardSquare01Icon,
  },
  {
    title: "POS Counter",
    url: "/pos",
    icon: ShoppingCart01Icon,
  },
  {
    title: "Sales Invoices",
    url: "/sales",
    icon: MoneyReceiveSquareIcon,
  },
  {
    title: "Sale Detail",
    url: "/sales/details",
    icon: Invoice01Icon,
  },
  {
    title: "Sale Summary",
    url: "/reports/sale-summary",
    icon: ChartIncreaseIcon,
  },
  {
    title: "Sale by Category",
    url: "/reports/sale-by-category",
    icon: GridViewIcon,
  },
  {
    title: "Profit & Loss",
    url: "/reports/profit-loss",
    icon: Dollar01Icon,
  },
  {
    title: "Products",
    url: "/products",
    icon: Package01Icon,
  },
  {
    title: "Categories",
    url: "/categories",
    icon: GridViewIcon,
  },
  {
    title: "Inventory",
    url: "/inventory",
    icon: Archive02Icon,
  },
  {
    title: "Purchases",
    url: "/purchases",
    icon: Invoice01Icon,
  },
  {
    title: "Stock Adjustment",
    url: "/stock-adjustment",
    icon: Settings01Icon,
  },
  {
    title: "Stock History",
    url: "/stock-movement",
    icon: BarChartIcon,
  },
  {
    title: "Staff & Users",
    url: "/users",
    icon: Store01Icon,
  },
];

const staffNavItems = [
  {
    title: "POS Counter",
    url: "/pos",
    icon: ShoppingCart01Icon,
  },
  {
    title: "Sales Invoices",
    url: "/sales",
    icon: MoneyReceiveSquareIcon,
  },
  {
    title: "Sale Detail",
    url: "/sales/details",
    icon: Invoice01Icon,
  },
  {
    title: "Sale Summary",
    url: "/reports/sale-summary",
    icon: ChartIncreaseIcon,
  },
  {
    title: "Sale by Category",
    url: "/reports/sale-by-category",
    icon: GridViewIcon,
  },
  {
    title: "Profit & Loss",
    url: "/reports/profit-loss",
    icon: Dollar01Icon,
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [mounted, setMounted] = React.useState(false);
  const [settings, setSettings] = React.useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [user, setUser] = React.useState({
    name: "Admin",
    email: "admin@healthyfood.com",
    avatar: "",
  });
  const router = useRouter();
  const { role, user: authUser } = useAuth();

  React.useEffect(() => {
    setMounted(true);
    getStoreSettings().then(setSettings);

    const storedAuth = localStorage.getItem("user_auth");
    if (storedAuth) {
      try {
        const authData = JSON.parse(storedAuth);
        if (authData.user_info) {
          setUser({
            name: authData.user_info.name || "Staff",
            email: authData.user_info.email || authData.email || "",
            avatar: authData.user_info.avatar_url || `https://ui-avatars.com/api/?name=${authData.user_info.name || "User"}&background=random`,
          });
        }
      } catch (e) {
        console.error("Failed to parse auth data", e);
      }
    }
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("user_auth");
      router.push("/login");
    } catch (error) {
      console.error("Failed to sign out", error);
    }
  };

  if (!mounted) {
    return (
      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="size-5 rounded-md bg-muted animate-pulse" />
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <div className="flex flex-col gap-4 p-4">
            <div className="h-4 w-full rounded bg-muted animate-pulse" />
            <div className="h-4 w-full rounded bg-muted animate-pulse" />
            <div className="h-4 w-full rounded bg-muted animate-pulse" />
          </div>
        </SidebarContent>
      </Sidebar>
    );
  }

  const isStaff = role === "staff";
  const displayedNavItems = 
    role === "super_admin" 
      ? superAdminNavItems 
      : role === "admin" 
      ? adminNavItems 
      : staffNavItems;
  const roleSubtitle = 
    role === "super_admin" 
      ? "Super Admin" 
      : role === "admin" 
      ? "Admin & Counter POS" 
      : "Staff Register";

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b border-sidebar-border bg-sidebar">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-2 hover:bg-sidebar-accent"
            >
              <Link href={isStaff ? "/pos" : "/"} className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Store01Icon className="size-4 text-primary-foreground" />
                </div>
                <div className="flex flex-col leading-none">
                  <span className="text-sm font-black tracking-tight text-sidebar-foreground uppercase">
                    {settings.store_name || "HEALTHY FOOD POS"}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-semibold">
                    {roleSubtitle}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="p-2">
        <NavMain items={displayedNavItems} />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <NavUser user={user} onLogout={handleLogout} />
      </SidebarFooter>
    </Sidebar>
  );
}

