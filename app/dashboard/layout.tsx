import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "@/components/dashboard/AppSidebar";
import InactiveAccountShell from "@/components/dashboard/InactiveAccountShell";
import LiquidBackground from "@/components/dashboard/LiquidBackground";
import { Bell } from "lucide-react";
import SSEProvider from "@/components/SSEProvider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) redirect("/login");

  if (session.user.isActive === false) {
    return <InactiveAccountShell />;
  }

  const dbProfile = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: { image: true },
  });

  const user = {
    id:    session.user.id,
    name:  session.user.name,
    email: session.user.email,
    role:  session.user.role,
    image: dbProfile?.image ?? null,
  };

  const showActivityBell =
    session.user.role !== Role.USER && session.user.role !== Role.INTERN;

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset className="relative bg-transparent overflow-hidden">
        <LiquidBackground />
        
        {/* Glassmorphism Overlay */}
        <div className="absolute inset-0 bg-white/20 backdrop-blur-2xl -z-10" />

        <header className="flex h-16 shrink-0 items-center justify-between px-8 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black tracking-[0.3em] text-[#0c1421]/40 uppercase">The Credential Vault</span>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-auto p-12 pt-8">
          <SSEProvider>
            {children}
          </SSEProvider>
        </main>
        
        {/* {showActivityBell && (
          <div className="fixed bottom-8 right-8 z-50">
            <Link
              href="/dashboard/activity"
              aria-label="Open activity feed"
              className="block"
            >
              <div className="bg-[#0c1421] text-white p-5 rounded-2xl shadow-2xl cursor-pointer relative group transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70">
                <Bell className="size-6" />
                <div className="absolute top-5 right-5 size-2.5 bg-red-500 rounded-full border-2 border-[#0c1421]" />
              </div>
            </Link>
          </div>
        )} */}
      </SidebarInset>
    </SidebarProvider>
  );
}