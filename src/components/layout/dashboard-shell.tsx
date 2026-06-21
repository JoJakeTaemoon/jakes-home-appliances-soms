"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { OfficeBreadcrumb } from "@/components/nav/office-breadcrumb";
import { BreadcrumbProvider } from "@/lib/nav/breadcrumb-context";

export function DashboardShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  // Sidebar is "open at <pathname>"; navigating to any other pathname
  // implicitly closes it without needing a useEffect that setStates from
  // another setState (which the set-state-in-effect rule flags).
  const [openAtPathname, setOpenAtPathname] = useState<string | null>(null);
  const sidebarOpen = openAtPathname === pathname;
  const setSidebarOpen = (open: boolean) => {
    setOpenAtPathname(open ? pathname : null);
  };

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  return (
    <BreadcrumbProvider>
    <div className="flex min-h-screen bg-white">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 lg:hidden transition-opacity duration-200 ${sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={() => setSidebarOpen(false)}
      />
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 lg:hidden transition-transform duration-200 ease-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <Sidebar />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-8 bg-white">
          <OfficeBreadcrumb />
          {children}
        </main>
      </div>
    </div>
    </BreadcrumbProvider>
  );
}
