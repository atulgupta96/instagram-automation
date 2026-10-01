import fs from 'fs';

export type Account = {
  email: string;
  fullName: string;
  username: string;
  password: string;
  day: string;
  month: string;
  year: string;
};

const HEADER = 'email,full_name,username,dob,password';

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Read raw CSV rows as strings (does not parse dob). */
export function readCsvRows(csvPath: string): Array<{ [k: string]: string }> {
  const text = fs.readFileSync(csvPath, 'utf-8').replace(/\r\n/g, '\n');
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    // Simple parser (handles quoted values with commas)
    const cells: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (c === ',' && !inQuote) {
        cells.push(cur); cur = '';
      } else {
        cur += c;
      }
    }
    cells.push(cur);

    const row: { [k: string]: string } = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()));
    return row;
  });
}

/** Write rows (array of objects with the fixed header keys) back to CSV. */
export function writeCsvRows(
  csvPath: string,
  rows: Array<{ email: string; full_name: string; username: string; dob: string; password: string }>
): void {
  const lines = [HEADER];
  for (const r of rows) {
    lines.push([
      csvEscape(r.email),
      csvEscape(r.full_name),
      csvEscape(r.username),
      csvEscape(r.dob),
      csvEscape(r.password),
    ].join(','));
  }
  // Write to a temp file then rename, so a crash mid-write can't truncate the queue.
  const tmpPath = `${csvPath}.tmp`;
  fs.writeFileSync(tmpPath, lines.join('\n') + '\n', { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmpPath, csvPath);
}

/** Remove the first row from the CSV (called after a successful signup). */
export function deleteFirstRow(csvPath: string): void {
  const rows = readCsvRows(csvPath);
  rows.shift();
  writeCsvRows(csvPath, rows as any);
}