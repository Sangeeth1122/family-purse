const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatINR(amount: number): string {
  if (!Number.isFinite(amount)) return "₹0";
  const abs = Math.abs(amount);
  const s = inr.format(abs);
  return amount < 0 ? `−${s}` : s;
}

export function formatINRExact(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function toINRInput(value: string): string {
  return value.replace(/[^\d.]/g, "");
}

/** Signed INR, e.g. "+₹17,700" / "−₹8,900" / "₹0". */
export function formatSigned(amount: number): string {
  if (amount < 0) return `−${formatINR(-amount)}`;
  if (amount > 0) return `+${formatINR(amount)}`;
  return formatINR(0);
}

export function parseINR(value: string): number {
  const n = parseFloat(toINRInput(value));
  return Number.isFinite(n) ? n : 0;
}

export function monthKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthYear(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function formatDayMonth(date: string): string {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export function formatFullDate(date: string): string {
  const d = new Date(date);
  const today = new Date();
  if (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  ) {
    return "Today";
  }
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function formatTime(date: string): string {
  return new Date(date).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}