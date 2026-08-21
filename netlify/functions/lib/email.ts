// 리포트 이메일 렌더링 + Resend 발송

export interface ReportItem {
  titleKo: string;
  titleEn: string;
  summaryKo: string;
  abstractKo: string;
  journalTitle: string | null;
  isScie: boolean;
  sjrQuartile: string | null;
  sjr: number | null;
  citescore: number | null;
  authors: string[];
  publicationDate: string;
  citedByCount: number;
  url: string;
  doi: string | null;
}

export interface ReportMeta {
  configName: string;
  keywords: string[];
  generatedAt: string; // KST 표기 문자열
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function metricBadges(item: ReportItem): string {
  const badges: string[] = [];
  if (item.isScie) {
    badges.push(
      `<span style="display:inline-block;background:#dcfce7;color:#166534;font-size:12px;font-weight:600;padding:2px 8px;border-radius:9999px;margin:0 4px 4px 0;">SCI/SCIE</span>`
    );
  }
  if (item.sjrQuartile) {
    const color = { Q1: "#1d4ed8", Q2: "#2563eb", Q3: "#64748b", Q4: "#94a3b8" }[item.sjrQuartile] ?? "#64748b";
    badges.push(
      `<span style="display:inline-block;background:#eff6ff;color:${color};font-size:12px;font-weight:600;padding:2px 8px;border-radius:9999px;margin:0 4px 4px 0;">Scimago ${esc(item.sjrQuartile)}</span>`
    );
  }
  if (item.sjr != null) {
    badges.push(
      `<span style="display:inline-block;background:#f1f5f9;color:#334155;font-size:12px;padding:2px 8px;border-radius:9999px;margin:0 4px 4px 0;">SJR ${item.sjr.toFixed(3)}</span>`
    );
  }
  if (item.citescore != null) {
    badges.push(
      `<span style="display:inline-block;background:#f1f5f9;color:#334155;font-size:12px;padding:2px 8px;border-radius:9999px;margin:0 4px 4px 0;">CiteScore ${item.citescore.toFixed(1)}</span>`
    );
  }
  badges.push(
    `<span style="display:inline-block;background:#f1f5f9;color:#334155;font-size:12px;padding:2px 8px;border-radius:9999px;margin:0 4px 4px 0;">인용 ${item.citedByCount}</span>`
  );
  return badges.join("");
}

function renderItem(item: ReportItem, index: number): string {
  const authors = item.authors.length
    ? esc(item.authors.slice(0, 6).join(", ")) + (item.authors.length > 6 ? " 외" : "")
    : "저자 정보 없음";
  return `
  <div style="border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:16px;background:#ffffff;">
    <div style="font-size:13px;color:#64748b;margin-bottom:6px;">
      #${index + 1} · ${esc(item.journalTitle ?? "저널 정보 없음")} · ${esc(item.publicationDate)}
    </div>
    <div style="font-size:17px;font-weight:700;color:#0f172a;line-height:1.4;margin-bottom:4px;">
      ${esc(item.titleKo || item.titleEn)}
    </div>
    <div style="font-size:13px;color:#94a3b8;margin-bottom:10px;">${esc(item.titleEn)}</div>
    <div style="margin-bottom:12px;">${metricBadges(item)}</div>
    <div style="font-size:13px;color:#475569;margin-bottom:12px;">${authors}</div>
    <div style="background:#f8fafc;border-radius:8px;padding:12px 14px;margin-bottom:10px;">
      <div style="font-size:12px;font-weight:700;color:#2563eb;margin-bottom:4px;">핵심 요약</div>
      <div style="font-size:14px;color:#1e293b;line-height:1.6;">${esc(item.summaryKo)}</div>
    </div>
    <details style="margin-bottom:12px;">
      <summary style="font-size:13px;font-weight:600;color:#2563eb;cursor:pointer;">초록 전문 (한국어 번역) 보기</summary>
      <div style="font-size:13px;color:#334155;line-height:1.7;margin-top:8px;">${esc(item.abstractKo)}</div>
    </details>
    <a href="${esc(item.url)}" style="display:inline-block;font-size:14px;font-weight:600;color:#ffffff;background:#2563eb;padding:8px 16px;border-radius:8px;text-decoration:none;">
      원문 자세히 보기 &rarr;
    </a>
    ${item.doi ? `<span style="font-size:12px;color:#94a3b8;margin-left:10px;">DOI: ${esc(item.doi)}</span>` : ""}
  </div>`;
}

export function renderReportHtml(meta: ReportMeta, items: ReportItem[]): string {
  const tags = meta.keywords.map((k) => `#${esc(k)}`).join(" ");
  const body = items.length
    ? items.map(renderItem).join("")
    : `<div style="text-align:center;color:#64748b;padding:40px 0;">이번 주기에 조건에 맞는 신규 논문이 없습니다.</div>`;

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Malgun Gothic',sans-serif;">
  <div style="max-width:680px;margin:0 auto;padding:24px 16px;">
    <div style="background:linear-gradient(135deg,#1d4ed8,#2563eb);border-radius:16px;padding:28px;color:#ffffff;margin-bottom:20px;">
      <div style="font-size:13px;opacity:.85;margin-bottom:6px;">논문 리포팅 · ${esc(meta.configName)}</div>
      <div style="font-size:22px;font-weight:800;margin-bottom:8px;">SCI/SCIE 논문 리포트</div>
      <div style="font-size:14px;opacity:.9;">${tags}</div>
      <div style="font-size:12px;opacity:.75;margin-top:10px;">${esc(meta.generatedAt)} 생성 · 총 ${items.length}건</div>
    </div>
    ${body}
    <div style="text-align:center;font-size:12px;color:#94a3b8;padding:20px 0;">
      본 리포트는 OpenAlex 데이터와 Scimago 지표를 기반으로 자동 생성되었습니다.<br>
      초록 번역은 자동 번역이며 정확성은 원문을 확인하세요.
    </div>
  </div>
</body></html>`;
}

export async function sendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY / REPORT_FROM_EMAIL 환경변수가 설정되지 않았습니다.");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend 발송 실패: ${res.status} ${await res.text()}`);
  }
}
