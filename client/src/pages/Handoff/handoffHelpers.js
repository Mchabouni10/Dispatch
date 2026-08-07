// Pure helper functions used by the Handoff Board

export const BOARD_STATUSES = ["Available", "Break", "Off Duty", "On Call"];

export const TYPE_ICONS_KEYS = {
  Tractor: "Tractor",
  "Straight Truck": "Straight Truck",
  "Cube Truck": "Cube Truck",
  "Sprinter Van": "Sprinter Van",
};

export const CLASS_FALLBACK = {
  A: "Tractor",
  B: "Straight Truck",
  C: "Cube Truck",
  D: "Cube Truck",
};

export const WORK_DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const SWAP_REASONS = [
  { value: "MECHANICAL", label: "Mechanical Issue" },
  { value: "BREAKDOWN", label: "Breakdown" },
  { value: "MAINTENANCE", label: "Maintenance Required" },
  { value: "ROUTE_CHANGE", label: "Route Change" },
  { value: "DRIVER_REQUEST", label: "Driver Request" },
  { value: "DISPATCH", label: "Dispatch Decision" },
  { value: "TRAILER_SWAP", label: "Trailer Swap Only" },
  { value: "RELOCATION", label: "Equipment Relocation" },
];

export const RETURN_REASONS = [
  { value: "SHIFT_END", label: "End of Shift" },
  { value: "BREAK", label: "Break (temporary)" },
  { value: "MAINTENANCE", label: "Maintenance Needed" },
  { value: "DAMAGE", label: "Damage Reported" },
  { value: "RELOCATION", label: "Relocation" },
];

export const HISTORY_RANGES = [
  { value: "30d", label: "Last 30 Days", days: 30 },
  { value: "90d", label: "Last 90 Days", days: 90 },
  { value: "all", label: "All Time", days: null },
];

export function eligibleTypesFor(driver) {
  if (driver?.vehicleTypes?.length) return driver.vehicleTypes;
  const fallback = CLASS_FALLBACK[driver?.licenseClass];
  return fallback ? [fallback] : [];
}

export function isSameDay(a, b) {
  if (!a) return false;
  const d1 = new Date(a);
  const d2 = b || new Date();
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function initials(name = "") {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatHour12(hhmm) {
  if (!hhmm) return "";
  const h = Number(String(hhmm).split(":")[0]);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${period}`;
}

export function minutesUntil(value) {
  if (!value) return null;
  return Math.round((new Date(value).getTime() - Date.now()) / 60000);
}

export function minutesSince(value) {
  if (!value) return null;
  return Math.round((Date.now() - new Date(value).getTime()) / 60000);
}

export function shiftStartToday(driver) {
  if (!driver?.shiftStart) return null;
  const [h] = String(driver.shiftStart).split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d;
}

export function shiftEndToday(driver) {
  if (!driver?.shiftEnd) return null;
  const [h] = String(driver.shiftEnd).split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d;
}

export function latenessAtCheckin(driver) {
  const expected = shiftStartToday(driver);
  if (!expected || !driver.lastCheckin) return null;
  if (!isSameDay(driver.lastCheckin, expected)) return null;
  return Math.round(
    (new Date(driver.lastCheckin).getTime() - expected.getTime()) / 60000,
  );
}

export function minutesPastExpectedStart(driver) {
  const expected = shiftStartToday(driver);
  if (!expected) return null;
  const diff = Math.round((Date.now() - expected.getTime()) / 60000);
  return diff > 0 ? diff : null;
}

export function isScheduledToday(driver) {
  if (!driver) return true;
  const dayKey =
    WORK_DAY_KEYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
  if (Array.isArray(driver.daysOff) && driver.daysOff.length > 0) {
    if (driver.daysOff.includes(dayKey)) {
      return !!driver.availableOnDaysOff;
    }
    return true;
  }
  return true;
}

export function isPastShiftEnd(driver) {
  if (!driver?.shiftEnd) return false;
  const [h] = String(driver.shiftEnd).split(":").map(Number);
  if (Number.isNaN(h)) return false;
  const end = new Date();
  end.setHours(h, 0, 0, 0);
  return Date.now() > end.getTime();
}

export function formatDuration(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return "—";
  const abs = Math.abs(minutes);
  const hrs = Math.floor(abs / 60);
  const mins = abs % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export function formatDateHeader(date = new Date()) {
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatClock(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
