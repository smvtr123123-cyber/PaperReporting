// E2E 검증: 실제 OpenAlex 검색 → Gemini 번역 → Resend 발송 → Supabase 기록
// 실행: npx tsx scripts/e2e.ts [수신이메일]
import { readFileSync } from "node:fs";

// .env 로드 (tsx 는 dotenv 를 자동 로드하지 않음)
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

console.log("1) 관리자 사용자 조회…");
const { data: users, error: uErr } = await sb.auth.admin.listUsers();
if (uErr || !users?.users.length) throw new Error("사용자를 찾을 수 없습니다: " + uErr?.message);
const user = users.users[0];
const recipient = process.argv[2] || user.email!;
const keyword = process.argv[3] || "large language models";
console.log(`   user=${user.email}  수신=${recipient}  키워드=${keyword}`);

console.log("2) 테스트 리포팅 설정 생성…");
const { data: cfg, error: cErr } = await sb
  .from("report_configs")
  .insert({
    user_id: user.id,
    name: "E2E 테스트",
    keywords: [keyword],
    frequency: "daily",
    run_hour: 9,
    recipients: [recipient],
    only_scie: false, // 저널 데이터 미적재 상태라 필터 해제
    min_quartile: null,
    lookback_days: 180,
    max_results: 3,
    active: true,
  })
  .select("*")
  .single();
if (cErr || !cfg) throw new Error("설정 생성 실패: " + cErr?.message);
console.log(`   config id=${cfg.id}`);

console.log("3) 리포트 실행 (검색→번역→발송)…");
const result = await runReportForConfig(cfg as any);
console.log("   결과:", JSON.stringify(result));

console.log("4) 정리: 테스트 설정 삭제");
await sb.from("report_configs").delete().eq("id", cfg.id);

if (result.status === "failed") {
  console.error("❌ 실패:", result.error);
  process.exit(1);
}
console.log(`✅ 완료 — status=${result.status}, 논문 ${result.paperCount}건, 수신 ${recipient}`);
