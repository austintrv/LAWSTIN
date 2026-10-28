/** Date helpers that work on plain "YYYY-MM-DD" day keys (no time zone drift). */
export const dateKey = {
  /** Today's day key in the device's local time zone. */
  today(d: Date = new Date()): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  /** A DB date (returned as a UTC-midnight Date) or string, as a day key. */
  fromDb(v: Date | string | null | undefined): string | null {
    if (!v) return null;
    if (typeof v === "string") return v.slice(0, 10);
    return v.toISOString().slice(0, 10);
  },
  addDays(key: string, n: number): string {
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return dt.toISOString().slice(0, 10);
  },
  diff(a: string, b: string): number {
    const [y1, m1, d1] = a.split("-").map(Number);
    const [y2, m2, d2] = b.split("-").map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
  },
  isValid(key: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(key);
  },
};