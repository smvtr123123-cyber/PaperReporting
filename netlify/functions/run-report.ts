import { getAdminClient } from "./lib/supabaseAdmin.js";
import { runReportForConfig, type ReportConfig } from "./lib/report.js";

const CONFIG_COLS =
  "id,user_id,name,keywords,or_keywords,frequency,run_hour,day_of_week,day_of_month,recipients,only_scie,min_quartile,lookback_days,max_results";

// POST /api/run-report  { configId }  (Authorization: Bearer <supabase access token>)
// 관리자 사이트에서 특정 설정을 즉시 실행(테스트 발송)할 때 사용.
export default async (req: Request) => {
  // 핸들러 전체를 감싸 어떤 예외든(예: createClient 초기화 실패, 환경변수 누락)
  // Netlify 의 무형식 500 이 아니라 원인 메시지가 담긴 JSON 으로 응답한다.
  // 이렇게 해야 프론트엔드가 "실행 실패" 대신 실제 원인을 보여줄 수 있다.
  try {
    if (req.method !== "POST") {
      return json({ error: "POST 만 허용됩니다." }, 405);
    }

    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "인증 토큰이 필요합니다." }, 401);

    const supabase = getAdminClient();
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) return json({ error: "유효하지 않은 토큰입니다." }, 401);
    const userId = userData.user.id;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "잘못된 요청 본문" }, 400);
    }
    const configId = body?.configId;
    if (!configId) return json({ error: "configId 가 필요합니다." }, 400);

    const { data: cfg, error } = await supabase
      .from("report_configs")
      .select(CONFIG_COLS)
      .eq("id", configId)
      .single();
    if (error || !cfg) return json({ error: "설정을 찾을 수 없습니다." }, 404);
    if ((cfg as any).user_id !== userId) return json({ error: "권한이 없습니다." }, 403);

    const result = await runReportForConfig(cfg as ReportConfig);
    return json(result, result.status === "failed" ? 500 : 200);
  } catch (err: any) {
    return json({ error: `서버 오류: ${err?.message ?? String(err)}` }, 500);
  }
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
