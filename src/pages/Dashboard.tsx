import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, type ReportConfig, type SentReport } from "../lib/supabase";
import JournalDataBanner from "../components/JournalDataBanner";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function scheduleText(c: ReportConfig): string {
  const hh = String(c.run_hour).padStart(2, "0");
  const time = `${hh}:00`;
  if (c.frequency === "daily") return `매일 ${time}`;
  if (c.frequency === "weekly") return `매주 ${DOW[c.day_of_week ?? 0]}요일 ${time}`;
  return `매월 ${c.day_of_month ?? 1}일 ${time}`;
}

export default function Dashboard() {
  const [configs, setConfigs] = useState<ReportConfig[]>([]);
  const [reports, setReports] = useState<SentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: cfgs }, { data: reps }] = await Promise.all([
      supabase.from("report_configs").select("*").order("created_at", { ascending: false }),
      supabase.from("sent_reports").select("*").order("ran_at", { ascending: false }).limit(10),
    ]);
    setConfigs((cfgs as ReportConfig[]) ?? []);
    setReports((reps as SentReport[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleActive = async (c: ReportConfig) => {
    await supabase.from("report_configs").update({ active: !c.active }).eq("id", c.id);
    load();
  };

  const remove = async (c: ReportConfig) => {
    if (!confirm(`"${c.name}" 설정을 삭제할까요?`)) return;
    await supabase.from("report_configs").delete().eq("id", c.id);
    load();
  };

  // 특정 설정의 가장 최근 발송 이력 id 를 가져온다(새 결과 감지용).
  const latestReportId = async (configId: string): Promise<string | null> => {
    const { data } = await supabase
      .from("sent_reports")
      .select("id")
      .eq("config_id", configId)
      .order("ran_at", { ascending: false })
      .limit(1);
    return data?.[0]?.id ?? null;
  };

  const runNow = async (c: ReportConfig) => {
    setRunningId(c.id);
    setToast(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      // 트리거 전 마지막 이력 id (이후 새 행이 생기면 그게 이번 실행 결과)
      const beforeId = await latestReportId(c.id);

      // 백그라운드 함수 호출 → 즉시 202 반환(본문 작업은 서버에서 최대 15분 진행)
      const res = await fetch("/api/run-report-background", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ configId: c.id }),
      });
      if (!res.ok && res.status !== 202) {
        // 백그라운드 함수는 보통 202. 그 외 4xx/5xx 는 트리거 자체 실패.
        let msg = "발송 요청 실패";
        try {
          const j = await res.json();
          msg = j.error || msg;
        } catch {
          /* 본문 없음 */
        }
        throw new Error(msg);
      }

      setToast("발송을 시작했습니다. 결과를 확인하는 중… (논문 수에 따라 최대 1~2분)");

      // sent_reports 에 새 행이 나타날 때까지 폴링 (최대 약 3분)
      const started = Date.now();
      const TIMEOUT_MS = 180_000;
      const INTERVAL_MS = 4_000;
      let result: SentReport | null = null;
      while (Date.now() - started < TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, INTERVAL_MS));
        const { data: rows } = await supabase
          .from("sent_reports")
          .select("*")
          .eq("config_id", c.id)
          .order("ran_at", { ascending: false })
          .limit(1);
        const row = (rows?.[0] as SentReport | undefined) ?? null;
        if (row && row.id !== beforeId) {
          result = row;
          break;
        }
      }

      if (!result) {
        setToast("처리에 시간이 걸리고 있습니다. 잠시 후 아래 '발송 이력'을 새로고침해 확인하세요.");
      } else if (result.status === "success") {
        setToast(`발송 완료: ${result.paper_count}건`);
      } else if (result.status === "skipped") {
        setToast(`발송 생략: ${result.error ?? "신규 논문 없음"}`);
      } else {
        setToast(`실패: ${result.error ?? "알 수 없는 오류"}`);
      }
    } catch (e: any) {
      setToast(`오류: ${e.message}`);
    } finally {
      setRunningId(null);
      load();
    }
  };

  if (loading) return <div className="text-slate-400 text-center py-10">불러오는 중…</div>;

  return (
    <div className="space-y-8">
      <JournalDataBanner />
      {toast && (
        <div className="bg-brand-50 border border-brand-100 text-brand-700 rounded-lg px-4 py-3 text-sm">
          {toast}
        </div>
      )}

      {configs.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center">
          <p className="text-slate-500 mb-4">아직 등록된 리포팅 설정이 없습니다.</p>
          <Link
            to="/configs/new"
            className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-lg"
          >
            첫 리포팅 만들기
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {configs.map((c) => (
            <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-slate-900 truncate">{c.name}</h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        c.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {c.active ? "활성" : "비활성"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {c.keywords.map((k) => (
                      <span key={k} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        #{k}
                      </span>
                    ))}
                  </div>
                  <div className="text-sm text-slate-500 space-x-3">
                    <span>🕘 {scheduleText(c)}</span>
                    <span>📧 {c.recipients.length}명</span>
                    <span>{c.only_scie ? "SCI/SCIE만" : "전체"}{c.min_quartile ? ` · ${c.min_quartile}↑` : ""}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
                <button
                  onClick={() => runNow(c)}
                  disabled={runningId === c.id}
                  className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg"
                >
                  {runningId === c.id ? "발송 중…" : "지금 테스트 발송"}
                </button>
                <Link
                  to={`/configs/${c.id}`}
                  className="text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg"
                >
                  편집
                </Link>
                <button
                  onClick={() => toggleActive(c)}
                  className="text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg"
                >
                  {c.active ? "비활성화" : "활성화"}
                </button>
                <button
                  onClick={() => remove(c)}
                  className="text-sm text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg ml-auto"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {reports.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-3">최근 발송 이력</h2>
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
            {reports.map((r) => (
              <Link
                key={r.id}
                to={`/reports/${r.id}`}
                className="px-5 py-3 flex items-center justify-between text-sm hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-3">
                  <StatusDot status={r.status} />
                  <span className="text-slate-600">
                    {new Date(r.ran_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                  </span>
                </div>
                <div className="text-slate-500 flex items-center gap-2">
                  <span>
                    {r.status === "success"
                      ? `${r.paper_count}건 발송`
                      : r.status === "skipped"
                      ? r.error ?? "생략"
                      : r.error ?? "실패"}
                  </span>
                  <span className="text-slate-300">›</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: SentReport["status"] }) {
  const color =
    status === "success" ? "bg-green-500" : status === "skipped" ? "bg-slate-300" : "bg-red-500";
  return <span className={`w-2 h-2 rounded-full ${color}`} />;
}
