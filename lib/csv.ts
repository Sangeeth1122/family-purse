/**
 * Small CSV helpers for report export. `csvString` is pure (testable);
 * `downloadCSV` triggers a browser download for the currently selected
 * report/filter result.
 */

export function csvString(
  header: string[],
  rows: (string | number)[][],
): string {
  const cells = (row: (string | number)[]) =>
    row
      .map((c) => {
        const s = String(c ?? "");
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(",");
  return [cells(header), ...rows.map(cells)].join("\r\n");
}

export function downloadCSV(
  filename: string,
  header: string[],
  rows: (string | number)[][],
): void {
  const blob = new Blob([csvString(header, rows)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}