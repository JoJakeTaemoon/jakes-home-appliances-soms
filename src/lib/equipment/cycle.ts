/** UTC 기준 YYYY-MM-DD 에 days 를 더한다. DST/타임존 영향 없음. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 최근교체일 + 주기(일) = 다음 예정일. */
export function nextDueDate(lastReplacedISO: string, cycleDays: number): string {
  return addDays(lastReplacedISO, cycleDays);
}
