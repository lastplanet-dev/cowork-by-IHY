import { format } from "date-fns";

export function mmk(value: number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("en-US")} MMK`;
}

export function shortDate(date: Date | string | null | undefined) {
  if (!date) return "Not set";
  return format(new Date(date), "MMM d, yyyy");
}

export function shortTime(date: Date | string | null | undefined) {
  if (!date) return "";
  return format(new Date(date), "h:mm a");
}

export function dateTimeLocal(date: Date | string) {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function calculateDiscount(price: number, type?: string | null, value?: number | null) {
  if (!type || !value) return price;
  if (type === "PERCENTAGE") return Math.max(0, Math.round(price - price * (value / 100)));
  return Math.max(0, price - value);
}
