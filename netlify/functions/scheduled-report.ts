import type { Config } from "@netlify/functions";
import { getAdminClient } from "./lib/supabaseAdmin.js";
import { runReportForConfig, type ReportConfig } from "./lib/report.js";

// 현재 KST 시각 파츠
function kstParts(): { hour: number; dow: number; dom: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    hour: parseInt(get("hour"), 10) % 24,
    dow: dowMap[get("weekday")] ?? -1,
    dom: parseInt(get("day"), 10),
  };
}

function isDue(cfg: ReportConfig, t: { hour: number; dow: number; dom: number }): boolean {
  if (cfg.run_hour !== t.hour) return false;
  if (cfg.frequency === "daily") return true;
  if (cfg.frequency === "weekly") return cfg.day_of_week === t.dow;
  if (cfg.frequency === "monthly") return cfg.day_of_month === t.dom;
  return false;
}

export default async () => {
  const t = kstParts();
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("report_configs")
    .select(
      "id,user_id,name,keywords,or_keywords,frequency,run_hour,day_of_week,day_of_month,recipients,only_scie,min_quartile,lookback_days,max_results,last_run_at"
    )
    .eq("active", true);

  if (error) {
    console.error("설정 조회 실패:", error.message);
    return new Response("config query failed", { status: 500 });
  }

  // 중복 방지: "이번 정시 슬롯(현재 시각의 정각) 이후에 이미 실행됐는지"로 판단한다.
  // rolling 50분 창을 쓰면, 정기 실행 직전(50분 내)에 한 수동 테스트 발송이
  // 정기 발송을 막아버린다(last_run_at 갱신 때문). 슬롯 기준이면 이전 시각의
  // 수동 발송은 정기 실행을 막지 않고, 같은 시각의 중복 크론만 걸러진다.
  // (KST 오프셋은 정수 시간이라 UTC 정시 경계와 일치한다.)
  const slotStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const due = (data ?? []).filter((c: any) => {
    if (!isDue(c as ReportConfig, t)) return false;
    if (c.last_run_at && new Date(c.last_run_at).getTime() >= slotStart) return false;
    return true;
  });

  console.log(`KST ${t.hour}시 · 대상 설정 ${due.length}건 실행`);

  const results = [];
  for (const cfg of due) {
    const r = await runReportForConfig(cfg as ReportConfig);
    results.push({ id: (cfg as any).id, ...r });
  }

  return new Response(JSON.stringify({ ran: results.length, results }), {
    headers: { "content-type": "application/json" },
  });
};

// 매시 정각 실행
export const config: Config = {
  schedule: "0 * * * *",
};
