import { dateTimeLocalYangon, formatYangonDate, formatYangonTime } from "@/lib/yangon-time";

export function mmk(value: number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("en-US")} MMK`;
}

export function shortDate(date: Date | string | null | undefined) {
  return formatYangonDate(date);
}

export function shortTime(date: Date | string | null | undefined) {
  return formatYangonTime(date);
}

export function dateTimeLocal(date: Date | string) {
  return dateTimeLocalYangon(date);
}

export function calculateDiscount(price: number, type?: string | null, value?: number | null) {
  if (!type || !value) return price;
  if (type === "PERCENTAGE") return Math.max(0, Math.round(price - price * (value / 100)));
  return Math.max(0, price - value);
}
