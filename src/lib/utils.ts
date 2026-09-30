import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getOptimizedImageUrl(url: string, width: number = 1080) {
  if (!url || !url.includes('cloudinary.com')) return url;
  
  // If it already has transformations, this might be tricky, 
  // but usually simple upload URLs look like .../upload/v123...
  // We insert our transformation after /upload/
  return url.replace('/upload/', `/upload/w_${width},c_limit,q_auto,f_auto/`);
}

export function parseFirestoreDate(val: any, fallback = new Date()): Date {
  if (!val) return fallback;
  if (typeof val?.toDate === "function") {
    try {
      return val.toDate();
    } catch {
      return fallback;
    }
  }
  if (val instanceof Date) return isNaN(val.getTime()) ? fallback : val;
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? fallback : d;
  }
  if (typeof val?.seconds === "number") {
    return new Date(val.seconds * 1000 + (val.nanoseconds || 0) / 1000000);
  }
  return fallback;
}

// =============================================================================
// CAMBODIA TIMEZONE UTILITIES (Asia/Phnom_Penh / UTC+7 / ICT)
// =============================================================================

export const CAMBODIA_TIMEZONE = "Asia/Phnom_Penh";

/**
 * Returns year, month, day, hour, minute, second strings in Cambodia timezone (UTC+7)
 */
export function getCambodiaDateParts(date: Date = new Date()) {
  const validDate = isNaN(date.getTime()) ? new Date() : date;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMBODIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(validDate);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }

  return {
    year: map.year || "2026",
    month: map.month || "01",
    day: map.day || "01",
    hour: map.hour === "24" ? "00" : map.hour || "00",
    minute: map.minute || "00",
    second: map.second || "00",
  };
}

/**
 * Returns formatted string "YYYY-MM-DD" in Cambodia timezone
 */
export function getCambodiaDateString(date: Date = new Date()): string {
  const { year, month, day } = getCambodiaDateParts(date);
  return `${year}-${month}-${day}`;
}

/**
 * Returns formatted string "YYYY-MM-DDTHH:mm" in Cambodia timezone (ideal for <input type="datetime-local" />)
 */
export function getCambodiaDateTimeLocalString(date: Date = new Date()): string {
  const { year, month, day, hour, minute } = getCambodiaDateParts(date);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Parses user input date or datetime string into a JavaScript Date object in Cambodia timezone (+07:00).
 * Handles:
 * 1. "YYYY-MM-DDTHH:mm" / "YYYY-MM-DDTHH:mm:ss" -> parses with explicit +07:00 offset.
 * 2. "YYYY-MM-DD" ->
 *    If date is today in Cambodia, attaches the current Cambodia time.
 *    If date is another day, attaches midday (12:00:00+07:00) so no date boundary shift happens.
 * 3. Date instances or Firestore Timestamps.
 */
export function parseCambodiaInputDate(val: string | Date | undefined | null): Date {
  if (!val) return new Date();
  if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val;
  if (typeof val !== "string") return parseFirestoreDate(val);

  const clean = val.trim();
  if (!clean) return new Date();

  // If input is YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss without timezone
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(clean)) {
    const isoWithOffset = clean.length === 16 ? `${clean}:00+07:00` : `${clean}+07:00`;
    const d = new Date(isoWithOffset);
    if (!isNaN(d.getTime())) return d;
  }

  // If input is YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const todayCambodia = getCambodiaDateString(new Date());
    if (clean === todayCambodia) {
      // It's today in Cambodia: capture the current moment
      return new Date();
    }
    // Specific date: set midday in Cambodia (+07:00) to ensure zero date shifting across timezones
    const d = new Date(`${clean}T12:00:00+07:00`);
    if (!isNaN(d.getTime())) return d;
  }

  const d = new Date(clean);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Formats any Date or Firestore Timestamp in Cambodia Timezone (Asia/Phnom_Penh / UTC+7).
 */
export function formatCambodiaDate(
  val: any,
  preset: "date" | "time" | "datetime" | "invoice" | "table" | "code" = "datetime"
): string {
  const date = parseFirestoreDate(val);
  if (!date || isNaN(date.getTime())) return "—";

  if (preset === "date" || preset === "table") {
    // e.g. "30 Sep 2026"
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: CAMBODIA_TIMEZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  if (preset === "time") {
    // e.g. "04:33 PM"
    return new Intl.DateTimeFormat("en-US", {
      timeZone: CAMBODIA_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }

  if (preset === "invoice") {
    // e.g. "30/09/2026, 04:33 PM"
    const dStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: CAMBODIA_TIMEZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
    const tStr = new Intl.DateTimeFormat("en-US", {
      timeZone: CAMBODIA_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
    return `${dStr}, ${tStr}`;
  }

  if (preset === "code") {
    // e.g. "20260930"
    const { year, month, day } = getCambodiaDateParts(date);
    return `${year}${month}${day}`;
  }

  // Default "datetime": e.g. "30 Sep 2026, 04:33 PM"
  const dStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: CAMBODIA_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
  const tStr = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMBODIA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${dStr}, ${tStr}`;
}

/**
 * Checks if a date falls on "today" in Cambodia timezone
 */
export function isTodayCambodia(val: any): boolean {
  const d = parseFirestoreDate(val);
  if (!d || isNaN(d.getTime())) return false;
  return getCambodiaDateString(d) === getCambodiaDateString(new Date());
}

/**
 * Checks if a date falls on "yesterday" in Cambodia timezone
 */
export function isYesterdayCambodia(val: any): boolean {
  const d = parseFirestoreDate(val);
  if (!d || isNaN(d.getTime())) return false;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return getCambodiaDateString(d) === getCambodiaDateString(yesterday);
}

/**
 * Checks if a date is within the current month in Cambodia timezone
 */
export function isThisMonthCambodia(val: any): boolean {
  const d = parseFirestoreDate(val);
  if (!d || isNaN(d.getTime())) return false;
  const targetParts = getCambodiaDateParts(d);
  const currentParts = getCambodiaDateParts(new Date());
  return targetParts.year === currentParts.year && targetParts.month === currentParts.month;
}


