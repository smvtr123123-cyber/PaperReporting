#!/usr/bin/env node
/**
 * 저널 지표 / SCIE 화이트리스트 임포트 스크립트
 *
 * 사용법:
 *   node scripts/import-journals.mjs --scimago path/to/scimagojr.csv
 *   node scripts/import-journals.mjs --scie path/to/clarivate_scie.csv
 *   node scripts/import-journals.mjs --scimago sjr.csv --scie scie.csv
 *
 * 필요 환경변수(.env 또는 셸):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * - Scimago CSV: scimagojr.com 에서 다운로드(세미콜론 구분). SJR/분위/H지수/분야 채움.
 * - Clarivate SCIE CSV: mjl.clarivate.com 의 SCIE 저널 목록. 해당 ISSN 은 is_scie=true.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = parseArgs(process.argv.slice(2));
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function normalizeIssn(raw) {
  if (!raw) return null;
  const s = String(raw).toUpperCase().replace(/[^0-9X]/g, "");
  return s.length === 8 ? s : null;
}

// 아주 단순한 CSV 파서 (따옴표 처리 포함)
function parseCsv(text, delimiter) {
  const rows = [];
  let field = "";
  let row = [];
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

function detectDelimiter(headerLine) {
  return (headerLine.split(";").length > headerLine.split(",").length) ? ";" : ",";
}

async function upsertBatch(rows) {
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk);
    const { error } = await supabase.from("journal_metrics").upsert(batch, { onConflict: "issn" });
    if (error) throw new Error(error.message);
    console.log(`  upsert ${Math.min(i + chunk, rows.length)}/${rows.length}`);
  }
}

async function importScimago(path) {
  console.log(`Scimago 임포트: ${path}`);
  const text = readFileSync(path, "utf8");
  const delim = detectDelimiter(text.slice(0, text.indexOf("\n")));
  const rows = parseCsv(text, delim);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.findIndex((h) => h === name.toLowerCase());

  const iTitle = col("title");
  const iIssn = col("issn");
  const iSjr = col("sjr");
  const iQuart = header.findIndex((h) => h.includes("quartile"));
  const iH = header.findIndex((h) => h === "h index" || h === "h-index");
  const iCat = col("categories");
  const iPub = col("publisher");

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells || cells.length < 2) continue;
    const issnRaw = (cells[iIssn] || "").split(/[,\s]+/);
    const issns = issnRaw.map(normalizeIssn).filter(Boolean);
    if (issns.length === 0) continue;
    const sjr = iSjr >= 0 ? parseFloat(String(cells[iSjr]).replace(",", ".")) : NaN;
    const hIndex = iH >= 0 ? parseInt(cells[iH], 10) : NaN;
    for (const issn of issns) {
      out.push({
        issn,
        title: iTitle >= 0 ? cells[iTitle]?.trim() : null,
        sjr: Number.isFinite(sjr) ? sjr : null,
        sjr_quartile: iQuart >= 0 ? (cells[iQuart]?.trim() || null) : null,
        h_index: Number.isFinite(hIndex) ? hIndex : null,
        categories: iCat >= 0 ? cells[iCat]?.trim() : null,
        publisher: iPub >= 0 ? cells[iPub]?.trim() : null,
        source: "scimago",
        updated_at: new Date().toISOString(),
      });
    }
  }
  console.log(`  파싱된 ISSN 행: ${out.length}`);
  await upsertBatch(out);
}

async function importScie(path) {
  console.log(`SCIE 화이트리스트 임포트: ${path}`);
  const text = readFileSync(path, "utf8");
  const delim = detectDelimiter(text.slice(0, text.indexOf("\n")));
  const rows = parseCsv(text, delim);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  // ISSN / eISSN 컬럼 후보 모두 수집
  const issnCols = header
    .map((h, idx) => ({ h, idx }))
    .filter((x) => x.h.includes("issn"))
    .map((x) => x.idx);
  const iTitle = header.findIndex((h) => h.includes("title") || h.includes("journal"));

  const issnToTitle = new Map();
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells) continue;
    for (const c of issnCols) {
      const issn = normalizeIssn(cells[c]);
      if (issn) issnToTitle.set(issn, iTitle >= 0 ? cells[iTitle]?.trim() : null);
    }
  }
  const out = [...issnToTitle.entries()].map(([issn, title]) => ({
    issn,
    title,
    is_scie: true,
    source: "clarivate",
    updated_at: new Date().toISOString(),
  }));
  console.log(`  SCIE ISSN: ${out.length}`);
  await upsertBatch(out);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

(async () => {
  try {
    if (!args.scimago && !args.scie) {
      console.error("사용법: --scimago <csv> 그리고/또는 --scie <csv>");
      process.exit(1);
    }
    if (args.scimago) await importScimago(args.scimago);
    if (args.scie) await importScie(args.scie);
    console.log("완료.");
  } catch (e) {
    console.error("실패:", e.message);
    process.exit(1);
  }
})();
