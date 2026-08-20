export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

/** "YYYY-MM" -> "YYYY-MM-01" (matches the `month` column on the performance views). */
export function monthStartDate(month: string) {
  return `${month}-01`;
}

export function nextMonthStart(month: string) {
  const [year, m] = month.split("-").map(Number);
  // JS Date months are 0-indexed, so passing the 1-indexed `m` lands on next month's 1st.
  return new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10);
}

export function prevMonthOf(month: string) {
  const [year, m] = month.split("-").map(Number);
  // m is 1-indexed; m-2 as a 0-indexed month is one month earlier.
  return new Date(Date.UTC(year, m - 2, 1)).toISOString().slice(0, 7);
}

export function resolveMonthParam(param: string | string[] | undefined) {
  const value = Array.isArray(param) ? param[0] : param;
  return value ?? currentMonth();
}
