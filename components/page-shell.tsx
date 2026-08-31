"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  IconHome,
  IconChartBar,
  IconCreditCard,
  IconUser,
  IconPlus,
} from "@tabler/icons-react";
import AddTransactionSheet from "@/components/add-transaction-sheet";

export default function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  const active =
    pathname.startsWith("/app/dashboard") || pathname.startsWith("/app/budgets")
      ? "home"
      : pathname.startsWith("/app/reports")
        ? "reports"
        : pathname.startsWith("/app/cards")
          ? "cards"
          : pathname.startsWith("/app/profile")
            ? "profile"
            : "home";

  const nav = [
    { key: "home", label: "Home", icon: IconHome, href: "/app/dashboard" },
    { key: "reports", label: "Reports", icon: IconChartBar, href: "/app/reports" },
    { key: "cards", label: "Cards", icon: IconCreditCard, href: "/app/cards" },
    { key: "profile", label: "Profile", icon: IconUser, href: "/app/profile" },
  ];

  return (
    <>
      <div className="pb-24">{children}</div>

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
              onClick={() => router.push(item.href)}
            >
              <Icon size={21} stroke={1.8} />
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
          <IconPlus size={22} stroke={2.5} />
        </button>

        {nav.slice(2).map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`nav-item ${isActive ? "active" : ""}`}
              onClick={() => router.push(item.href)}
            >
              <Icon size={21} stroke={1.8} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}