"use client"

import { AddCircleIcon, Mail01Icon, ArrowDown01Icon } from "hugeicons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentType } from "react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

export interface NavItem {
  title: string
  url?: string
  icon?: ComponentType<{ className?: string }>
  isActive?: boolean
  items?: {
    title: string
    url: string
    icon?: ComponentType<{ className?: string }>
  }[]
}

export function NavMain({
  items,
}: {
  items: NavItem[]
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Quick Create"
              className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear font-bold text-xs"
            >
              <AddCircleIcon />
              <span>Quick Create</span>
            </SidebarMenuButton>
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              variant="outline"
            >
              <Mail01Icon />
              <span className="sr-only">Inbox</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarMenu>
          {items.map((item) => {
            if (item.items && item.items.length > 0) {
              const isSubActive = item.items.some(
                (sub) =>
                  pathname === sub.url ||
                  (sub.url !== "/" && pathname.startsWith(sub.url + "/"))
              )

              return (
                <Collapsible
                  key={item.title}
                  asChild
                  defaultOpen={isSubActive || item.isActive}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={item.title}
                        className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      >
                        {item.icon && <item.icon />}
                        <span className="font-semibold text-xs">{item.title}</span>
                        <ArrowDown01Icon className="ml-auto size-3.5 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180 opacity-70" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items.map((subItem) => {
                          const isSubItemActive =
                            pathname === subItem.url ||
                            (subItem.url !== "/" && pathname.startsWith(subItem.url + "/"))
                          return (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isSubItemActive}
                                className="text-xs font-medium"
                              >
                                <Link href={subItem.url}>
                                  {subItem.icon && <subItem.icon className="size-3.5" />}
                                  <span>{subItem.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )
            }

            const isItemActive =
              pathname === item.url ||
              (item.url !== "/" &&
                item.url !== "/sales" &&
                item.url !== undefined &&
                pathname.startsWith(item.url + "/"))

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={isItemActive}
                >
                  <Link href={item.url || "#"}>
                    {item.icon && <item.icon />}
                    <span className="font-semibold text-xs">{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
