export const YANGON_TIME_ZONE = "Asia/Yangon";
const YANGON_OFFSET_MINUTES = 6 * 60 + 30;

export type OperatingDay = { open: boolean; start: string; end: string };
export type OperatingHours = Record<string, OperatingDay>;

export const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export const defaultOperatingHours: OperatingHours = {
  sun: { open: false, start: "09:00", end: "18:00" },
  mon: { open: true, start: "09:00", end: "18:00" },
  tue: { open: true, start: "09:00", end: "18:00" },
  wed: { open: true, start: "09:00", end: "18:00" },
  thu: { open: true, start: "09:00", end: "18:00" },
  fri: { open: true, start: "09:00", end: "18:00" },
  sat: { open: true, start: "09:00", end: "17:00" }
};

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: YANGON_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

export function parseOperatingHours(value?: string | null): OperatingHours {
  if (!value) return defaultOperatingHours;
  try {
    const parsed = JSON.parse(value) as OperatingHours;
    return Object.fromEntries(dayKeys.map((day) => [day, { ...defaultOperatingHours[day], ...(parsed[day] ?? {}) }])) as OperatingHours;
  } catch {
    return defaultOperatingHours;
  }
}

export function stringifyOperatingHours(hours: OperatingHours) {
  return JSON.stringify(Object.fromEntries(dayKeys.map((day) => [day, hours[day]])));
}

export function operatingHoursFromForm(formData: FormData, prefix = "hours") {
  const hours = Object.fromEntries(dayKeys.map((day) => {
    const start = String(formData.get(`${prefix}_${day}_start`) || defaultOperatingHours[day].start);
    const end = String(formData.get(`${prefix}_${day}_end`) || defaultOperatingHours[day].end);
    return [day, { open: formData.get(`${prefix}_${day}_open`) === "on", start, end }];
  })) as OperatingHours;
  return stringifyOperatingHours(hours);
}

export function yangonParts(date = new Date()) {
  const parts = Object.fromEntries(dateParts.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

export function todayYangonDateInput(date = new Date()) {
  const parts = yangonParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function startOfYangonDayUtc(date = new Date()) {
  const parts = yangonParts(date);
  return parseYangonDateTimeToUtc(`${parts.year}-${pad(parts.month)}-${pad(parts.day)}T00:00`);
}

export function endOfYangonDayUtc(date = new Date()) {
  const start = startOfYangonDayUtc(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function parseYangonDateTimeToUtc(value: string) {
  const [date, time = "00:00"] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - YANGON_OFFSET_MINUTES * 60 * 1000);
}

export function parseYangonDateToUtc(value: string) {
  return parseYangonDateTimeToUtc(`${value}T00:00`);
}

export function dateTimeLocalYangon(date: Date | string) {
  const parts = yangonParts(new Date(date));
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function dateInputYangon(date: Date | string) {
  const parts = yangonParts(new Date(date));
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function nearestYangonSlot(date = new Date(), minutes = 5) {
  const parts = yangonParts(date);
  const roundedMinute = Math.ceil(parts.minute / minutes) * minutes;
  const hour = parts.hour + Math.floor(roundedMinute / 60);
  const minute = roundedMinute % 60;
  return parseYangonDateTimeToUtc(`${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(hour)}:${pad(minute)}`);
}

export function formatYangonDate(date: Date | string | null | undefined) {
  if (!date) return "Not set";
  return new Intl.DateTimeFormat("en-US", { timeZone: YANGON_TIME_ZONE, month: "short", day: "numeric", year: "numeric" }).format(new Date(date));
}

export function formatYangonTime(date: Date | string | null | undefined) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: YANGON_TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(new Date(date));
}

export function isWithinOperatingHours(start: Date, end: Date, schedule: OperatingHours) {
  const parts = yangonParts(start);
  const day = dayKeyForDateParts(parts.year, parts.month, parts.day);
  const rule = schedule[day];
  if (!rule?.open) return false;
  const open = parseYangonDateTimeToUtc(`${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${rule.start}`);
  const close = parseYangonDateTimeToUtc(`${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${rule.end}`);
  return start >= open && end <= close && end > start;
}

export function operatingWindowForYangonDate(dateInput: string, schedule: OperatingHours) {
  const [year, month, day] = dateInput.split("-").map(Number);
  const key = dayKeyForDateParts(year, month, day);
  const rule = schedule[key];
  if (!rule?.open) return null;
  return {
    start: parseYangonDateTimeToUtc(`${dateInput}T${rule.start}`),
    end: parseYangonDateTimeToUtc(`${dateInput}T${rule.end}`)
  };
}

function dayKeyForDateParts(year: number, month: number, day: number) {
  return dayKeys[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
