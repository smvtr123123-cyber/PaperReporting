import { useState } from "react";
import type { ReportItem } from "../lib/supabase";

const QUART_COLOR: Record<string, string> = {
  Q1: "text-brand-700",
  Q2: "text-brand-500",
  Q3: "text-slate-500",
  Q4: "text-slate-400",
};

// 리포트 미리보기용 논문 카드 (이메일 렌더링과 동일한 정보 구성)
export default function PaperCard({ item, index }: { item: ReportItem; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white">
      <div className="text-xs text-slate-500 mb-1">
        #{index + 1} · {item.journalTitle ?? "저널 정보 없음"} · {item.publicationDate}
      </div>
      <div className="font-bold text-slate-900 leading-snug">{item.titleKo || item.titleEn}</div>
      <div className="text-xs text-slate-400 mt-0.5 mb-2">{item.titleEn}</div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {item.isScie && (
          <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
            SCI/SCIE
          </span>
        )}
        {item.sjrQuartile && (
          <span className={`text-xs bg-brand-50 font-semibold px-2 py-0.5 rounded-full ${QUART_COLOR[item.sjrQuartile] ?? "text-slate-500"}`}>
            Scimago {item.sjrQuartile}
          </span>
        )}
        {item.sjr != null && (
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            SJR {item.sjr.toFixed(3)}
          </span>
        )}
        {item.citescore != null && (
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            CiteScore {item.citescore.toFixed(1)}
          </span>
        )}
        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
          인용 {item.citedByCount}
        </span>
      </div>

      <div className="bg-slate-50 rounded-lg p-3 mb-2">
        <div className="text-xs font-bold text-brand-600 mb-1">핵심 요약</div>
        <div className="text-sm text-slate-700 leading-relaxed">{item.summaryKo}</div>
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-semibold text-brand-600 hover:text-brand-700"
      >
        {open ? "초록 접기" : "초록 전문(한국어) 보기"}
      </button>
      {open && (
        <div className="text-sm text-slate-600 leading-relaxed mt-2">{item.abstractKo}</div>
      )}

      <div className="mt-3">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg"
        >
          원문 자세히 보기 →
        </a>
        {item.doi && <span className="text-xs text-slate-400 ml-2">DOI: {item.doi}</span>}
      </div>
    </div>
  );
}
