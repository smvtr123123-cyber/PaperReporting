import { getAdminClient } from "./lib/supabaseAdmin.js";

// POST /api/import-journals
//   Authorization: Bearer <supabase access token>
//   body: { kind: "scimago" | "scie", rows: JournalRow[] }  (한 배치당 최대 500행 권장)
// 프론트에서 CSV 를 파싱·정규화한 배치를 받아 journal_metrics 에 upsert (service_role).
export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST 만 허용됩니다." }, 405);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "인증 토큰이 필요합니다." }, 401);

  const supabase = getAdminClient();
  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData?.user) return json({ error: "유효하지 않은 토큰입니다." }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "잘못된 요청 본문" }, 400);
  }

  const kind = body?.kind;
  const rows = body?.rows;
  if (kind !== "scimago" && kind !== "scie") return json({ error: "kind 는 scimago|scie" }, 400);
  if (!Array.isArray(rows) || rows.length === 0) return json({ error: "rows 가 비었습니다." }, 400);
  if (rows.length > 1000) return json({ error: "한 배치는 최대 1000행" }, 400);

  // 화이트리스트 컬럼만 통과 (신뢰 경계)
  const clean = rows
    .map((r: any) => {
      const issn = typeof r.issn === "string" ? r.issn.replace(/[^0-9X]/gi, "").toUpperCase() : "";
      if (issn.length !== 8) return null;
      if (kind === "scie") {
        return {
          issn,
          title: str(r.title),
          is_scie: true,
          source: "clarivate",
          updated_at: new Date().toISOString(),
        };
      }
      return {
        issn,
        title: str(r.title),
        sjr: num(r.sjr),
        sjr_quartile: quart(r.sjr_quartile),
        h_index: int(r.h_index),
        citescore: num(r.citescore),
        categories: str(r.categories),
        publisher: str(r.publisher),
        source: "scimago",
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  if (clean.length === 0) return json({ error: "유효한 ISSN 행이 없습니다.", upserted: 0 }, 200);

  const { error } = await supabase.from("journal_metrics").upsert(clean as any[], { onConflict: "issn" });
  if (error) return json({ error: error.message }, 500);

  return json({ upserted: clean.length });
};

function str(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, 500) : null;
}
function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function int(v: unknown): number | null {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}
function quart(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase();
  return ["Q1", "Q2", "Q3", "Q4"].includes(s) ? s : null;
}
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
