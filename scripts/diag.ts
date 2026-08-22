// 진단: DB 의 기존 설정을 그대로 실행해 실제 에러 메시지 확인
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i < 0 || line.trim().startsWith("#")) continue;
  const k = line.slice(0, i).trim();
  const v = line.slice(i + 1).trim();
  if (k && !(k in process.env)) process.env[k] = v;
}

const { getAdminClient } = await import("../netlify/functions/lib/supabaseAdmin.js");
const { runReportForConfig } = await import("../netlify/functions/lib/report.js");
const sb = getAdminClient();

const { data: cfgs } = await sb
  .from("report_configs")
  .select("*")
  .order("created_at", { ascending: false });
console.log(`설정 ${cfgs?.length ?? 0}개`);
for (const c of cfgs ?? []) {
  console.log(`- ${c.name} | keywords=${JSON.stringify(c.keywords)} | only_scie=${c.only_scie} | recipients=${JSON.stringify(c.recipients)} | lookback=${c.lookback_days}`);
}

const target = (cfgs ?? [])[0];
if (!target) { console.log("설정 없음"); process.exit(0); }

console.log(`\n▶ '${target.name}' 실행…`);
const result = await runReportForConfig(target as any);
console.log("결과:", JSON.stringify(result, null, 2));
