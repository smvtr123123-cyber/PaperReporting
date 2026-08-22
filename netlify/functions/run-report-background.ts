import { getAdminClient } from "./lib/supabaseAdmin.js";
import { runReportForConfig, type ReportConfig } from "./lib/report.js";

const CONFIG_COLS =
  "id,user_id,name,keywords,frequency,run_hour,day_of_week,day_of_month,recipients,only_scie,min_quartile,lookback_days,max_results";

// POST /api/run-report-background  { configId }  (Authorization: Bearer <supabase access token>)
//
// 파일명이 "-background" 로 끝나므로 Netlify 가 백그라운드 함수로 처리한다.
// → 호출 즉시 202 를 반환하고, 본문 작업은 최대 15분까지 비동기로 계속 실행된다.
// (기존 동기 run-report 는 기본 10초 제한이라, 논문 다수 번역 시 타임아웃으로 죽었다.)
//
// 백그라운드 함수의 반환값은 호출자에게 전달되지 않으므로, 프론트엔드는 결과를
// sent_reports 테이블에 새로 기록되는 행으로 확인한다(runReportForConfig 가 기록).
export default async (req: Request) => {
  try {
    if (req.method !== "POST") return;

    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) {
      console.error("run-report-background: 인증 토큰 없음");
      return;
    }

    const supabase = getAdminClient();
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) {
      console.error("run-report-background: 유효하지 않은 토큰");
      return;
    }
    const userId = userData.user.id;

    let body: any;
    try {
      body = await req.json();
    } catch {
      console.error("run-report-background: 잘못된 요청 본문");
      return;
    }
    const configId = body?.configId;
    if (!configId) {
      console.error("run-report-background: configId 누락");
      return;
    }

    const { data: cfg, error } = await supabase
      .from("report_configs")
      .select(CONFIG_COLS)
      .eq("id", configId)
      .single();
    if (error || !cfg) {
      console.error("run-report-background: 설정을 찾을 수 없음", configId);
      return;
    }
    if ((cfg as any).user_id !== userId) {
      console.error("run-report-background: 권한 없음", configId, userId);
      return;
    }

    const result = await runReportForConfig(cfg as ReportConfig);
    console.log("run-report-background 완료:", configId, JSON.stringify(result));
  } catch (err: any) {
    // 실패해도 runReportForConfig 내부에서 sent_reports 에 failed 로 기록됨.
    console.error("run-report-background 예외:", err?.message ?? String(err));
  }
};
