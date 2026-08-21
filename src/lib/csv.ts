// 브라우저에서 CSV 를 파싱하고 journal_metrics 배치로 정규화

export interface ScimagoRow {
  issn: string;
  title: string | null;
  sjr: number | null;
  sjr_quartile: string | null;
  h_index: number | null;
  citescore: number | null;
  categories: string | null;
  publisher: string | null;
}
export interface ScieRow {
  issn: string;
  title: string | null;
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delimiter) { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* skip */ }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function detectDelimiter(headerLine: string): string {
  return headerLine.split(";").length > headerLine.split(",").length ? ";" : ",";
}

function normIssn(raw: string): string | null {
  const s = (raw || "").toUpperCase().replace(/[^0-9X]/g, "");
  return s.length === 8 ? s : null;
}

export function parseScimago(text: string): ScimagoRow[] {
  const nl = text.indexOf("\n");
  const delim = detectDelimiter(text.slice(0, nl < 0 ? text.length : nl));
  const rows = parseCsv(text, delim);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.findIndex((h) => h === name);
  const iTitle = col("title");
  const iIssn = col("issn");
  const iSjr = col("sjr");
  const iQuart = header.findIndex((h) => h.includes("quartile"));
  const iH = header.findIndex((h) => h === "h index" || h === "h-index");
  const iCite = header.findIndex((h) => h.includes("citescore"));
  const iCat = col("categories");
  const iPub = col("publisher");

  const out: ScimagoRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r];
    if (!c || c.length < 2) continue;
    const issns = (iIssn >= 0 ? c[iIssn] : "").split(/[,\s]+/).map(normIssn).filter(Boolean) as string[];
    if (issns.length === 0) continue;
    const sjr = iSjr >= 0 ? parseFloat(String(c[iSjr]).replace(",", ".")) : NaN;
    const h = iH >= 0 ? parseInt(c[iH], 10) : NaN;
    const cite = iCite >= 0 ? parseFloat(String(c[iCite]).replace(",", ".")) : NaN;
    for (const issn of issns) {
      out.push({
        issn,
        title: iTitle >= 0 ? c[iTitle]?.trim() || null : null,
        sjr: Number.isFinite(sjr) ? sjr : null,
        sjr_quartile: iQuart >= 0 ? c[iQuart]?.trim() || null : null,
        h_index: Number.isFinite(h) ? h : null,
        citescore: Number.isFinite(cite) ? cite : null,
        categories: iCat >= 0 ? c[iCat]?.trim() || null : null,
        publisher: iPub >= 0 ? c[iPub]?.trim() || null : null,
      });
    }
  }
  return out;
}

export function parseScie(text: string): ScieRow[] {
  const nl = text.indexOf("\n");
  const delim = detectDelimiter(text.slice(0, nl < 0 ? text.length : nl));
  const rows = parseCsv(text, delim);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const issnCols = header.map((h, i) => ({ h, i })).filter((x) => x.h.includes("issn")).map((x) => x.i);
  const iTitle = header.findIndex((h) => h.includes("title") || h.includes("journal"));

  const map = new Map<string, string | null>();
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r];
    if (!c) continue;
    for (const ci of issnCols) {
      const issn = normIssn(c[ci] || "");
      if (issn) map.set(issn, iTitle >= 0 ? c[iTitle]?.trim() || null : null);
    }
  }
  return [...map.entries()].map(([issn, title]) => ({ issn, title }));
}
