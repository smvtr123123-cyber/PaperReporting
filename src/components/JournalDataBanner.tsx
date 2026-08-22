import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

// 저널 지표(Scimago/SCIE)는 매년 새 판이 공개되므로, 마지막 적재 후 오래되면
// 관리자에게 갱신을 권고한다. 아래 일수를 넘기면 "오래됨" 배너를 노출.
const STALE_DAYS = 365;

type State =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "stale"; lastUpdated: Date; days: number }
  | { kind: "ok" };

const DAY_MS = 24 * 60 * 60 * 1000;

export default function JournalDataBanner() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    (async () => {
      const [{ count }, { data: latest }] = await Promise.all([
        supabase.from("journal_metrics").select("*", { count: "exact", head: true }),
        supabase
          .from("journal_metrics")
          .select("updated_at")
          .order("updated_at", { ascending: false })
          .limit(1),
      ]);

      if (!count || count === 0) {
        setState({ kind: "empty" });
        return;
      }
      const updatedAt = latest?.[0]?.updated_at ? new Date(latest[0].updated_at) : null;
      if (updatedAt) {
        const days = Math.floor((Date.now() - updatedAt.getTime()) / DAY_MS);
        if (days >= STALE_DAYS) {
          setState({ kind: "stale", lastUpdated: updatedAt, days });
          return;
        }
      }
      setState({ kind: "ok" });
    })().catch(() => setState({ kind: "ok" })); // 조회 실패 시 배너 숨김(기능 방해 금지)
  }, []);

  if (state.kind === "loading" || state.kind === "ok") return null;

  if (state.kind === "empty") {
    return (
      <Banner tone="red">
        <strong>저널 지표 데이터가 아직 없습니다.</strong> SCI/SCIE 필터와 SJR·분위·CiteScore 배지가
        표시되려면 저널 데이터를 한 번 적재해야 합니다.{" "}
        <Link to="/journals" className="underline font-semibold">
          저널 데이터 적재하러 가기 →
        </Link>
      </Banner>
    );
  }

  // stale
  const dateStr = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(state.lastUpdated);
  return (
    <Banner tone="amber">
      <strong>저널 지표 데이터가 오래되었습니다.</strong> 마지막 적재: {dateStr} ({state.days}일 전).
      Scimago(SJR·분위·CiteScore)와 SCIE 목록은 <strong>매년 새 기준으로 갱신</strong>되므로, 최신
      점수·분위를 반영하려면 새 판 CSV로 다시 적재하는 것을 권장합니다.{" "}
      <Link to="/journals" className="underline font-semibold">
        지금 갱신하기 →
      </Link>
    </Banner>
  );
}

function Banner({ tone, children }: { tone: "red" | "amber"; children: React.ReactNode }) {
  const cls =
    tone === "red"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-amber-50 border-amber-200 text-amber-800";
  return (
    <div className={`border rounded-xl px-4 py-3 text-sm leading-relaxed ${cls}`}>{children}</div>
  );
}
