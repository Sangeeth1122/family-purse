"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  IconHome,
  IconChartBar,
  IconFolder,
  IconUser,
  IconPlus,
  IconCreditCard,
  IconScale,
  IconFolderOpen,
  IconWallet,
} from "@tabler/icons-react";
import AddTransactionSheet from "@/components/add-transaction-sheet";

export default function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const manageRef = useRef<HTMLDivElement>(null);

  const active =
    pathname.startsWith("/app/dashboard") || pathname.startsWith("/app/budgets")
      ? "home"
      : pathname.startsWith("/app/reports")
        ? "reports"
        : pathname.startsWith("/app/cards") ||
            pathname.startsWith("/app/loans") ||
            pathname.startsWith("/app/projects") ||
            pathname.startsWith("/app/budgets")
          ? "manage"
          : pathname.startsWith("/app/profile")
            ? "profile"
            : "home";

  useEffect(() => {
    if (!manageOpen) return;
    function handleClick(e: MouseEvent) {
      if (manageRef.current && !manageRef.current.contains(e.target as Node)) {
        setManageOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [manageOpen]);

  const nav = [
    { key: "home", label: "Home", icon: IconHome, href: "/app/dashboard" },
    { key: "reports", label: "Reports", icon: IconChartBar, href: "/app/reports" },
    { key: "manage", label: "Manage", icon: IconFolder },
    { key: "profile", label: "Profile", icon: IconUser, href: "/app/profile" },
  ];

  return (
    <>
      {children}

      {adding && <AddTransactionSheet onClose={() => setAdding(false)} />}

      <nav className="bottom-nav">
        {nav.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`nav-item ${isActive ? "active" : ""}`}
              onClick={() => router.push(item.href!)}
            >
              <Icon size={20} stroke={1.8} />
              {item.label}
            </button>
          );
        })}

        <button
          type="button"
          className="nav-add"
          aria-label="Add transaction"
          onClick={() => setAdding(true)}
        >
          <IconPlus size={18} stroke={2.5} />
        </button>

        {nav.slice(2).map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;

          if (item.key === "manage") {
            return (
              <div key="manage" ref={manageRef} className="relative">
                <button
                  type="button"
                  className={`nav-item ${isActive ? "active" : ""}`}
                  onClick={() => setManageOpen((v) => !v)}
                >
                  <Icon size={20} stroke={1.8} />
                  {item.label}
                </button>
                {manageOpen && (
                  <div className="manage-menu">
                    <button
                      type="button"
                      className="manage-menu-item"
                      onClick={() => {
                        setManageOpen(false);
                        router.push("/app/cards");
                      }}
                    >
                      <IconCreditCard size={17} stroke={1.8} />
                      Cards
                    </button>
                    <button
                      type="button"
                      className="manage-menu-item"
                      onClick={() => {
                        setManageOpen(false);
                        router.push("/app/loans");
                      }}
                    >
                      <IconScale size={17} stroke={1.8} />
                      Loans
                    </button>
                    <button
                      type="button"
                      className="manage-menu-item"
                      onClick={() => {
                        setManageOpen(false);
                        router.push("/app/projects");
                      }}
                    >
                      <IconFolderOpen size={17} stroke={1.8} />
                      Projects
                    </button>
                    <button
                      type="button"
                      className="manage-menu-item"
                      onClick={() => {
                        setManageOpen(false);
                        router.push("/app/budgets");
                      }}
                    >
                      <IconWallet size={17} stroke={1.8} />
                      Budgets
                    </button>
                  </div>
                )}
              </div>
            );
          }

          return (
            <button
              key={item.key}
              type="button"
              className={`nav-item ${isActive ? "active" : ""}`}
              onClick={() => router.push(item.href!)}
            >
              <Icon size={20} stroke={1.8} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}