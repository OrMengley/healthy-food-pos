"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Tags,
  Package,
  ArrowRightLeft,
  Users,
  LogOut,
  Settings,
} from "lucide-react";

const sidebarLinks = [
  {
    title: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Categories",
    href: "/categories",
    icon: Tags,
  },
  {
    title: "Products",
    href: "/products",
    icon: Package,
  },
  {
    title: "Inventory",
    href: "/inventory",
    icon: ArrowRightLeft,
  },
  {
    title: "Users",
    href: "/users",
    icon: Users,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-64 flex-col border-r bg-background md:flex">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Settings className="h-6 w-6" />
          <span>CAR ACCESSORIES</span>
        </Link>
      </div>
      <div className="flex-1 overflow-auto py-2">
        <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
          {sidebarLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary",
                  pathname === link.href && "bg-muted text-primary"
                )}
              >
                <Icon className="h-4 w-4" />
                {link.title}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="mt-auto p-4">
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:text-primary">
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
