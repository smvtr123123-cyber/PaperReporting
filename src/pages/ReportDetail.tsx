import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase, type SentReport } from "../lib/supabase";
import PaperCard from "../components/PaperCard";

export default function ReportDetail() {
  const { id } = useParams();
  const [report, setReport] = useState<SentReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("sent_reports")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setReport((data as SentReport) ?? null);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div className="text-slate-400 text-center py-10">불러오는 중…</div>;
  if (!report) return <div className="text-slate-500 text-center py-10">리포트를 찾을 수 없습니다.</div>;

  const items = report.meta?.items ?? [];
  const ran = new Date(report.ran_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link to="/" className="text-sm text-brand-600 hover:text-brand-700">
        ← 목록으로
      </Link>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h1 className="text-xl font-bold text-slate-900">
          {report.meta?.configName ?? "리포트"} 발송 상세
        </h1>
        <div className="text-sm text-slate-500 mt-1">{ran}</div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(report.meta?.keywords ?? []).map((k) => (
            <span key={k} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              #{k}
            </span>
          ))}
        </div>
        <div className="text-sm text-slate-500 mt-3 space-x-3">
          <StatusBadge status={report.status} />
          <span>논문 {report.paper_count}건</span>
          <span>수신 {report.recipients.length}명</span>
        </div>
        {report.error && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {report.error}
          </div>
        )}
      </div>

      {items.length > 0 ? (
        <div className="space-y-3">
          <h2 className="font-bold text-slate-900">포함된 논문 ({items.length})</h2>
          {items.map((it, i) => (
            <PaperCard key={i} item={it} index={i} />
          ))}
        </div>
      ) : (
        <div className="text-center text-slate-500 py-8 bg-white border border-dashed border-slate-200 rounded-2xl">
          이 리포트에는 포함된 논문이 없습니다.
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: SentReport["status"] }) {
  const map: Record<string, string> = {
    success: "bg-green-100 text-green-700",
    skipped: "bg-slate-100 text-slate-500",
    failed: "bg-red-100 text-red-700",
    partial: "bg-amber-100 text-amber-700",
  };
  const label: Record<string, string> = {
    success: "발송 완료",
    skipped: "생략",
    failed: "실패",
    partial: "부분 발송",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${map[status]}`}>{label[status]}</span>
  );
}
