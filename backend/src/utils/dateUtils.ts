export function getWeekStartDate(fromDate?: Date): string {
  const now = fromDate ?? new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
  const offset = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + offset);
  return monday.toISOString().split('T')[0];
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}
