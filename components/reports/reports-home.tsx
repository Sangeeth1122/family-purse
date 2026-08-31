"use client";

import { useRouter } from "next/navigation";
import {
  IconArrowLeftRight,
  IconChartDonut4,
  IconChevronRight,
  IconGridDots,
  IconStack2,
  IconTargetArrow,
  IconTrendingUp,
  IconUsers,
} from "@tabler/icons-react";

type ReportEntry = {
  title: string;
  subtitle: string;
  href: string;
  Icon: typeof IconChartDonut4;
};

const REPORTS: ReportEntry[] = [
  {
    title: "Where did the money go?",
    subtitle: "Category breakdown · this period",
    href: "/app/reports/where-money-went",
    Icon: IconChartDonut4,
  },
  {
    title: "Are we on pace with budget?",
    subtitle: "Spend vs budget per category",
    href: "/app/reports/budget-pace",
    Icon: IconTargetArrow,
  },
  {
    title: "What changed vs last period?",
    subtitle: "Category spending up or down",
    href: "/app/reports/vs-last-period",
    Icon: IconArrowLeftRight,
  },
  {
    title: "When do we actually spend?",
    subtitle: "Calendar heatmap of daily spend",
    href: "/app/reports/spend-calendar",
    Icon: IconGridDots,
  },
  {
    title: "Is income staying ahead of expense?",
    subtitle: "Income and expense trend lines",
    href: "/app/reports/income-vs-expense",
    Icon: IconTrendingUp,
  },
  {
    title: "Where did the savings come from?",
    subtitle: "Income cascading to net figure",
    href: "/app/reports/savings-waterfall",
    Icon: IconStack2,
  },
  {
    title: "Who's contributing what?",
    subtitle: "Spend ranked per family member",
    href: "/app/reports/who-contributes",
    Icon: IconUsers,
  },
];

export default function ReportsHome() {
  const router = useRouter();

  return (
    <div className="min-h-screen pb-24">
      <header className="px-5 pt-6 pb-1">
        <h1 className="text-[20px] font-bold">Reports</h1>
        <p className="text-[13px] t-secondary font-medium mt-1">
          One chart per question — pick what you want to know.
        </p>
      </header>

      <div className="px-5 pt-4 flex flex-col gap-2.5">
        {REPORTS.map((r) => {
          const Icon = r.Icon;
          return (
            <button
              key={r.href}
              type="button"
              className="card p-4 flex items-center gap-3.5 text-left"
              onClick={() => router.push(r.href)}
            >
              <span className="h-11 w-11 rounded-[11px] bg-black/5 flex items-center justify-center shrink-0">
                <Icon size={19} stroke={1.8} />
              </span>
              <span className="flex-1">
                <span className="block text-[14.5px] font-bold">
                  {r.title}
                </span>
                <span className="block text-[12px] t-tertiary font-medium mt-0.5">
                  {r.subtitle}
                </span>
              </span>
              <span className="t-tertiary">
                <IconChevronRight size={16} stroke={2} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}