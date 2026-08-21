# 논문 리포팅 서비스

키워드(해시태그)를 등록하면 정해진 주기·시간에 **SCI/SCIE 등재 논문**을 검색하여,
초록을 **한국어로 번역·요약**하고 **영향력 지표(Scimago/SJR/CiteScore)** 와 함께
등록된 이메일로 자동 발송하는 서비스입니다.

## 아키텍처

| 구성 | 기술 |
|------|------|
| 관리자 웹사이트 | Vite + React + TypeScript + Tailwind (Netlify 정적 호스팅) |
| DB / 인증 | Supabase (Postgres + Auth) |
| 논문 데이터 | [OpenAlex API](https://openalex.org) (무료, 초록·DOI·ISSN·인용수) |
| SCI/SCIE 판별 & 지표 | Scimago(SJR·분위) + Clarivate SCIE ISSN 화이트리스트 |
| 번역/요약 | Gemini API (무료 등급) 또는 Claude API — 환경변수로 선택 |
| 정기 실행 | Netlify Scheduled Functions (매시 정각 → KST 기준 대상 필터링) |
| 이메일 발송 | [Resend](https://resend.com) |

> **왜 구글학술검색이 아닌 OpenAlex인가?** Google Scholar는 공식 API가 없고 스크래핑 시
> IP 차단·CAPTCHA가 심해 정기 자동화에 부적합합니다. OpenAlex는 무료·합법·안정적이며
> 초록/DOI/저널 ISSN/인용수를 제공합니다.
>
> **Impact Factor 관련.** 정식 JCR Impact Factor는 Clarivate 유료 독점 데이터입니다.
> 본 서비스는 공개·무료 지표인 **Scimago SJR·분위(Quartile)·CiteScore·인용수**를 영향력
> 판단 지표로 제공합니다. 정식 IF가 필요하면 JCR 라이선스 데이터를 `journal_metrics`에
> 별도 컬럼으로 확장해 넣을 수 있습니다.

---

## 설정 순서

### 1. Supabase 프로젝트 생성
1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. SQL Editor에 [`supabase/schema.sql`](supabase/schema.sql) 붙여넣고 실행
3. Project Settings → API 에서 아래 값 확보
   - `Project URL`, `anon public key`, `service_role key`
4. Authentication → Providers → Email 활성화
5. **자가 가입 비활성화**: Authentication → Providers → Email 에서
   "Allow new users to sign up" 을 **끄고**, 관리자가 Authentication → Users →
   "Add user" 로 계정을 직접 생성합니다. (프론트에는 회원가입 UI가 없습니다.)
   - 조직 이메일만 허용하려면 도메인 제한을 추가로 설정하세요.

### 2. 환경변수 설정
[`.env.example`](.env.example)을 복사해 `.env` 를 만들고 값 채우기.
- 프론트(`VITE_*`)는 빌드 시 주입되어 브라우저에 노출됩니다 → **anon key만** 사용.
- 서버(`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` 또는 `ANTHROPIC_API_KEY`,
  `RESEND_API_KEY`)는 Netlify 환경변수(대시보드)에만 넣고 절대 프론트에 노출하지 마세요.
- 번역 프로바이더: `GEMINI_API_KEY`(무료, [AI Studio](https://aistudio.google.com/apikey))가
  있으면 Gemini를, 없으면 `ANTHROPIC_API_KEY`로 Claude를 사용합니다.

### 3. 저널 지표 / SCIE 목록 임포트
SCI/SCIE 필터와 지표 표시를 위해 저널 데이터를 한 번 적재합니다.

- **Scimago 지표**: [scimagojr.com](https://www.scimagojr.com/journalrank.php) →
  "Download data" 로 CSV(세미콜론 구분) 다운로드
- **SCIE 화이트리스트**: [mjl.clarivate.com](https://mjl.clarivate.com) →
  Master Journal List에서 **SCIE** 저널 목록 CSV 다운로드 (무료 가입 필요)

**방법 A — 관리자 사이트에서 업로드(권장):** 로그인 후 상단 **저널 데이터** 메뉴에서
Scimago CSV / SCIE CSV 를 각각 선택하면 브라우저에서 파싱해 500행씩 서버로 적재합니다.
현재 적재된 저널 수와 SCIE 표시 수를 화면에서 확인할 수 있습니다.

**방법 B — 로컬 스크립트:**
```bash
# .env 의 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 사용
node scripts/import-journals.mjs --scimago ./scimagojr.csv --scie ./scie_journals.csv
```

> SCIE CSV 없이 Scimago만 적재해도 동작하지만, 그 경우 `only_scie` 필터는
> "SCIE로 표시된 저널이 없어" 결과가 비게 됩니다. SCIE 목록을 반드시 함께 적재하거나,
> 설정에서 `SCI/SCIE만` 옵션을 끄고 Scimago 분위 기준으로 필터링하세요.

### 4. 로컬 실행
```bash
npm install
npm run dev            # 프론트만 (http://localhost:5173)
npm run netlify:dev    # 프론트 + Functions 통합 (Netlify CLI 필요)
```

### 5. Netlify 배포
1. GitHub에 푸시 후 Netlify에서 저장소 연결 (빌드 설정은 `netlify.toml`이 자동 적용)
2. Netlify 대시보드 → Site settings → Environment variables 에 `.env`의 모든 값 등록
   (프론트용 `VITE_*` 와 서버용 시크릿 모두)
3. 배포되면 `scheduled-report` 함수가 매시 정각 자동 실행됩니다.

---

## 사용 방법 (관리자 사이트)
1. 회원가입/로그인
2. **+ 새 리포팅** → 이름, 키워드(해시태그), 주기·시간, 수신 이메일, 발췌 조건 입력
3. **지금 테스트 발송**으로 즉시 결과 확인
4. 이후 설정한 주기(KST)에 자동 발송, 대시보드에서 발송 이력 확인

## 리포트 내용
- 논문별 **한국어 제목 + 핵심 요약(2~3문장) + 초록 전문 한국어 번역**
- **SCI/SCIE 배지**, **Scimago 분위/SJR/CiteScore/인용수** 지표
- **원문 자세히 보기** 링크(DOI/랜딩 페이지)
- 이미 발송한 논문은 다음 리포트에서 자동 제외(중복 방지)

---

## 프로젝트 구조
```
supabase/schema.sql            # DB 스키마 + RLS
scripts/import-journals.mjs    # Scimago/SCIE 데이터 적재
netlify/functions/
  scheduled-report.ts          # 매시 정각 크론 → 대상 설정 실행
  run-report.ts                # 관리자 사이트의 즉시 발송 API
  lib/
    openalex.ts                # 논문 검색 + 초록 복원
    journals.ts                # ISSN → SCIE/지표 조회
    translate.ts               # Claude 번역·요약
    email.ts                   # 리포트 HTML + Resend 발송
    report.ts                  # 파이프라인 오케스트레이션
src/                           # 관리자 프론트엔드
```
