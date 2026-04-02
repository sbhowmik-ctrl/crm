"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Role } from "@prisma/client";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Clock,
  FolderOpen,
  FileText,
  Users,
  ShieldCheck,
  Settings,
  LogOut,
  Key,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import UserAvatar from "@/components/dashboard/UserAvatar";
import { isVaultMemberOnlyRole } from "@/lib/role-access";

export interface SidebarUser {
  id:    string;
  name:  string | null | undefined;
  email: string | null | undefined;
  role:  Role;
  image: string | null | undefined;
}

interface NavItem {
  label: string;
  href:  string;
  icon:  React.ElementType;
}

export default function AppSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const memberOnly = isVaultMemberOnlyRole(user.role);

  const fullNav: NavItem[] = [
    { label: "Dashboard",       href: "/dashboard",           icon: LayoutDashboard },
    { label: "Projects",        href: "/dashboard/projects", icon: FolderOpen },
    { label: "Credentials",     href: "/dashboard/credentials", icon: Key },
    { label: "General Notes",   href: "/dashboard/notes",    icon: FileText },
    { label: "User Management", href: "/dashboard/users",    icon: Users },
    { label: "Approvals",       href: "/dashboard/approvals", icon: ShieldCheck },
    { label: "Activity",        href: "/dashboard/activity", icon: Clock },
  ];

  const moderatorHidden = new Set<string>(["/dashboard/users", "/dashboard/approvals"]);

  const mainNav: NavItem[] = memberOnly
    ? fullNav.filter(
        (item) =>
          item.href === "/dashboard/projects" ||
          item.href === "/dashboard/notes" ||
          item.href === "/dashboard/credentials",
      )
    : user.role === Role.MODERATOR
      ? fullNav.filter((item) => !moderatorHidden.has(item.href))
      : fullNav;

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/login" });
    toast.success("Signed out successfully.");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-white/5 bg-[#0c1421] text-sidebar-foreground">
      <SidebarHeader className="px-6 py-10">
        <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-left-4 duration-500">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-blue-500 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.5)]">
              <ShieldCheck className="size-5 text-white" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-white group-data-[collapsible=icon]:hidden uppercase leading-none">
              Credential <span className="text-blue-500">Vault</span>
            </h1>
          </div>
          <p className="text-[9px] font-black tracking-[0.2em] text-blue-500/50 group-data-[collapsible=icon]:hidden uppercase ml-0.5">
            Credentials Management System
          </p>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarMenu className="gap-2">
            {mainNav.map((item) => {
              const isActive = item.href === "/dashboard" 
                ? pathname === "/dashboard" 
                : pathname.startsWith(item.href);
              
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActive}
                    className={`h-12 px-4 rounded-xl transition-all duration-300 ${
                      isActive 
                        ? "bg-blue-500/10 text-white shadow-[inset_0_0_20px_rgba(59,130,246,0.1)] border border-blue-500/20" 
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                    render={
                      <Link href={item.href} className="flex items-center gap-3.5">
                        <div className="relative">
                          <item.icon className={`size-5 transition-colors ${isActive ? "text-blue-500" : ""}`} />
                          {isActive && (
                            <div className="absolute inset-0 bg-blue-500 blur-md opacity-30" />
                          )}
                        </div>
                        <span className="font-bold text-sm tracking-wide">{item.label}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="mt-auto px-4 py-8 space-y-8 bg-black/20 backdrop-blur-md">
        <div className="space-y-5">
          <div className="flex items-center gap-3.5 px-2 group-data-[collapsible=icon]:hidden">
            <div className="relative shrink-0">
              <UserAvatar
                image={user.image}
                name={user.name}
                email={user.email}
                className="h-10 w-10 ring-2 ring-blue-500/20 shadow-lg text-sm"
              />
              <div className="absolute -bottom-0.5 -right-0.5 size-3 bg-green-500 rounded-full border-2 border-[#0c1421] shadow-[0_0_5px_rgba(34,197,94,0.5)]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-black text-white tracking-wide uppercase leading-tight">
                {user.name ?? "User"}
              </span>
              <span className="text-[10px] font-medium text-slate-500 truncate tracking-tight">
                {user.email}
              </span>
            </div>
          </div>
          
          <div className="flex items-center justify-between px-2 group-data-[collapsible=icon]:hidden">
            <div className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-md">
              <span className="text-[10px] font-black text-blue-500 tracking-widest uppercase">
                {user.role}
              </span>
            </div>
            <button 
              onClick={handleSignOut}
              className="group flex items-center gap-2 text-[10px] font-black text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
            >
              Sign out <LogOut className="size-3 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <Link href="/dashboard/settings" className="flex items-center gap-3.5 px-3 py-2.5 text-[11px] font-bold text-slate-500 hover:text-white transition-all hover:bg-white/5 rounded-lg group-data-[collapsible=icon]:justify-center uppercase tracking-widest leading-none">
            <Settings className="size-4" />
            <span className="group-data-[collapsible=icon]:hidden">System Config</span>
          </Link>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
