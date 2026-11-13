<p align="right">
  <a href="README.md"><img src="docs/assets/btn-ar-lang.svg" alt="اقرأ بالعربية" height="36"></a>
</p>

<div align="center">

<a href="https://web-production-88238.up.railway.app">
  <img src="public/og/en.png" alt="Waqaya: a smart digital system that measures and analyses compliance with hygiene and infection-control protocols" width="100%">
</a>

<img src="docs/assets/hackathon-badge.png" alt="Hackathon badge" height="28">

<h3>Measure infection-control compliance as it really happens, not as it's assumed</h3>

<p>Realistic training simulations, an AI-assisted camera audit of real areas, and reports that show exactly where things break down, all in one platform.</p>

<p>
  <a href="https://web-production-88238.up.railway.app"><img src="docs/assets/btn-en-live.svg" alt="Try the live platform" height="40"></a>
  &nbsp;
  <a href="#-explainer-video"><img src="docs/assets/btn-en-video.svg" alt="Watch the explainer video" height="40"></a>
</p>

<p>
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 16">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL-Prisma_7-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL + Prisma">
  <img src="https://img.shields.io/badge/AI-Claude_Vision-D97757?style=flat-square&logo=anthropic&logoColor=white" alt="Claude Vision">
  <img src="https://img.shields.io/badge/tests-116_unit_%C2%B7_42_e2e-2ea44f?style=flat-square&logo=vitest&logoColor=white" alt="116 unit test files, 42 end-to-end specs">
  <img src="https://img.shields.io/badge/i18n-Arabic_RTL_%2B_English-0e7c86?style=flat-square" alt="Arabic RTL + English">
  <img src="https://img.shields.io/badge/license-view--only_%C2%B7_all_rights_reserved-b31d28?style=flat-square" alt="View only, all rights reserved">
</p>

</div>

> [!IMPORTANT]
> **This repository is for viewing only by the judges of the** <img src="docs/assets/hackathon-badge.png" alt="Hackathon badge" height="20" align="absmiddle"> **hackathon.**
>
> © 2026 the Waqaya team. All rights reserved. No part of this code may be copied, used, modified, republished or distributed, in whole or in part, without prior written permission. There is no open-source license.

## 🎬 Explainer video

<div align="center">

<a href="docs/video/waqaya-explainer.mp4"><img src="docs/video/poster.jpg" alt="Click to watch the Waqaya explainer video" width="88%"></a>

<sub>Two and a half minutes on the problem, the solution, an examiner's work today versus with Waqaya, and a walk through the platform (narrated in Arabic) · <a href="docs/video/waqaya-explainer.mp4">Open the video</a></sub>

</div>

## 📑 Contents

<table>
<tr>
<td valign="top" width="50%">

- [💡 Why Waqaya?](#-why-waqaya)
- [✨ Key features](#-key-features)
- [🔄 How it works](#-how-it-works)
- [🧮 How scores are calculated](#-how-scores-are-calculated)
- [👥 Roles and permissions](#-roles-and-permissions)
- [📚 Medical content](#-medical-content)

</td>
<td valign="top" width="50%">

- [🏗️ Architecture](#️-architecture)
- [🔒 Security and privacy](#-security-and-privacy)
- [✅ Quality and testing](#-quality-and-testing)
- [🗂️ Repository layout](#️-repository-layout)
- [💻 Running locally](#-running-locally)
- [⚖️ Rights and usage](#️-rights-and-usage)

</td>
</tr>
</table>

## 💡 Why Waqaya?

Healthcare facilities don't lack protocols. What they lack is **real compliance with them, and a way to measure it**. Waqaya turns compliance behaviour into **data that can be scored, analysed and acted on**: from discovering a failure after it happens, to catching it before it becomes a risk.

| Today | With Waqaya |
|---|---|
| Theory-based training that never shows what staff will actually do in the moment | **Realistic simulations** where trainees decide step by step, and every mistake is explained |
| Paper audit rounds that rely on memory and impressions | **AI-assisted photo audits** that check the area against each protocol step, with the examiner making the final call |
| Scattered numbers that don't say where the gap is or what to do next | **Dashboards and reports** that surface the most frequent gaps and the training that closes them |

<table>
<tr>
<td align="center" width="16%">📋<br><b>8</b><br><sub>core protocols</sub></td>
<td align="center" width="16%">🎬<br><b>10</b><br><sub>simulation scenarios</sub></td>
<td align="center" width="16%">👥<br><b>5</b><br><sub>roles</sub></td>
<td align="center" width="16%">🌐<br><b>2</b><br><sub>full languages</sub></td>
<td align="center" width="16%">🧪<br><b>116</b><br><sub>unit test files</sub></td>
<td align="center" width="16%">🧭<br><b>42</b><br><sub>end-to-end specs</sub></td>
</tr>
</table>

## ✨ Key features

<table>
<tr>
<td align="center" width="33%">🎓<br><b>Simulations</b><br><sub>for trainees</sub></td>
<td align="center" width="33%">📷<br><b>Smart scan</b><br><sub>for examiners</sub></td>
<td align="center" width="33%">📊<br><b>Reports and dashboards</b><br><sub>for management</sub></td>
</tr>
</table>

### 🎓 Simulations: training on real situations

A trainee steps into a realistic hospital scenario (a blood spill in a patient's room, a used needle after an injection, waste from a dressing round…) and makes decisions stage by stage.

- Every choice maps to a specific protocol step, and every mistake is explained on the spot.
- The attempt ends with a score and a risk level, then a **personal AI debrief** on what to focus on next.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/02-simulation.jpg" alt="A simulation in progress"></td>
<td width="50%"><img src="docs/screenshots/03-simulation-result.jpg" alt="Simulation result with the AI debrief"></td>
</tr>
<tr>
<td align="center"><sub>A simulation in progress</sub></td>
<td align="center"><sub>The result and the AI debrief</sub></td>
</tr>
</table>

### 📷 Smart scan: photo audits, human decisions

An examiner photographs a real area (a sink, a sharps container, a waste corner…) and AI vision checks the photos against the protocol steps that can actually be seen.

- Each step gets a verdict: **compliant / non-compliant / not visible**, with a confidence level and written evidence from the photo.
- **A human always makes the final call**: the examiner reviews, overrides where needed, and finalises the report.

<p align="center"><img src="docs/screenshots/04-smart-scan-review.jpg" alt="Smart scan: the examiner reviewing the AI verdicts" width="88%"></p>

### 📊 Reports and dashboards: where is the gap?

- **For each trainee:** a personal history and recurring weak steps.
- **For the institution:** compliance trend, breakdown by protocol and department, the most frequent gaps with the recommended training for each, and trainee progress.
- A printable report and CSV export.

<p align="center"><img src="docs/screenshots/05-org-dashboard.jpg" alt="Institution dashboard" width="88%"></p>

### 🏥 And also

| | Feature | What it gives you |
|---|---|---|
| 🏥 | **Institution management** | Role-based invitations, departments, and custom copies of the global protocols |
| 🛠️ | **Platform admin** | Users and organizations, a protocol and scenario editor with preview, AI settings, and an audit log of every sensitive action |
| 🌐 | **Two full languages** | Right-to-left Arabic and left-to-right English, with the medical content itself in both |
| 📱 | **Mobile first** | Scans and simulations are designed to be used on a phone inside the wards |

**Nothing is mocked:** every number on every screen comes from the database, and empty states say so.

<details>
<summary><b>🖼️ More screenshots: home page and mobile</b></summary>
<br>

<p align="center"><img src="docs/screenshots/01-home.jpg" alt="Home page" width="88%"></p>
<p align="center"><img src="docs/screenshots/06-mobile.jpg" alt="A simulation on a phone" width="300"></p>

</details>

## 🔄 How it works

One closed loop: training reveals the gap, audits measure it in the real world, and reports aim the next round of training at it.

```mermaid
flowchart LR
    A["🎓 Train<br/>simulation scenarios"] --> B["📷 Audit<br/>AI photo scan"]
    B --> C["🧑‍⚕️ Human review<br/>examiner sign-off"]
    C --> D["📊 Measure<br/>dashboards and reports"]
    D --> E["🎯 Recommend<br/>training aimed at the gaps"]
    E --> A
```

<details>
<summary><b>🔍 The smart scan, step by step</b></summary>
<br>

```mermaid
sequenceDiagram
    autonumber
    actor X as 🧑‍⚕️ Examiner
    participant W as Waqaya
    participant S as 🗄️ Storage
    participant AI as 🤖 AI vision
    Note over X,W: photos resized and stripped of EXIF/GPS in the browser
    X->>W: 1 to 4 photos of the area
    W->>S: store photos after checking the real file type
    W->>AI: photos + only the visually checkable protocol steps
    AI-->>W: verdict per step + confidence + evidence
    W-->>X: review screen
    X->>W: override where needed, then finalise
    W->>W: score, risk and recommendations
```

- The analysis is not tied to the phone's connection: if the connection drops mid-analysis, the result is still saved with the scan.
- If the analysis fails, the examiner can retry or answer every step by hand.

</details>

## 🧮 How scores are calculated

**One** scoring model serves both simulations and scans, in [`lib/scoring.ts`](lib/scoring.ts), covered by unit tests.

Each step has a weight $w$ from 1 to 3. The score is the weight of the compliant steps $C$ over the weight of the applicable steps $A$:

$$S = 100 \times \frac{\sum_{i \in C} w_i}{\sum_{i \in A} w_i}$$

| Risk level | When |
|---|---|
| 🔴 **High** | A critical step was violated (such as recapping a needle), or the score is below 50 |
| 🟠 **Medium** | A mandatory step was violated, or the score is below 80 |
| 🟢 **Low** | Otherwise |

- **Recommendations** are built from the violated steps (the reason and the matching training scenario), and AI writes a personal summary on top. The rule-based list is always there, even if the AI call fails.
- When no step applies, the result is **not assessable** rather than zero, so dashboards don't inflate the high-risk share.

## 👥 Roles and permissions

| Role | Can |
|---|---|
| 🛡️ Platform admin | Everything, including the admin panel |
| ✍️ Protocol editor | Edit the global protocols and scenarios |
| 🏥 Institution owner or admin | Members, invitations, departments, institution protocols, and all institution data |
| 📷 Examiner | Run, review and finalise scans; institution dashboards and trainee results |
| 🎓 Trainee | Simulations, personal results and recommendations (any user without an institution starts as a trainee) |

## 📚 Medical content

**8 core protocols** and **10 simulation scenarios** built on them. Every step has a rationale ("why it matters") and a reference to **WHO** and **CDC** guidance.

| Protocol | Protocol |
|---|---|
| 💉 Sharps safety | 🧼 Sinks and hand-hygiene stations |
| 🗑️ Medical waste management | 🧪 Specimen and culture areas |
| 🩸 Blood and body-fluid spills | 🍽️ Food and drink in clinical areas |
| 🧽 Environmental and surface cleaning | 🔧 Equipment and facility maintenance schedule |

> The content is educational and is reviewed by the team's medical members before institutional use.

## 🏗️ Architecture

```mermaid
flowchart LR
    U["👥 Users<br/>trainee · examiner · management"] --> APP
    subgraph APP["Next.js 16 · App Router"]
        direction LR
        UI["UI<br/>React 19<br/>Tailwind 4 + shadcn/ui"] --> SRV["Server<br/>Server Actions<br/>API Routes"]
        SRV --> DOM["Domain logic<br/>scoring, permissions, reports"]
    end
    DOM --> DB[("PostgreSQL<br/>Prisma 7")]
    DOM --> S3[("S3-compatible storage<br/>scan photos")]
    DOM --> AI["Claude<br/>Vercel AI SDK"]
```

| Layer | Technology |
|---|---|
| App and server | <img src="https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js"> <img src="https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React"> <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"> |
| Design and languages | <img src="https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS"> <img src="https://img.shields.io/badge/shadcn%2Fui-000000?style=flat-square&logo=shadcnui&logoColor=white" alt="shadcn/ui"> <img src="https://img.shields.io/badge/next--intl-RTL_%2B_LTR-0e7c86?style=flat-square" alt="next-intl"> |
| Data | <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL"> <img src="https://img.shields.io/badge/Prisma_7-2D3748?style=flat-square&logo=prisma&logoColor=white" alt="Prisma"> <img src="https://img.shields.io/badge/Zod-408AFF?style=flat-square&logo=zod&logoColor=white" alt="Zod"> |
| Auth | <img src="https://img.shields.io/badge/Better_Auth-000000?style=flat-square&logo=betterauth&logoColor=white" alt="Better Auth"> roles, organizations and invitations, rate limiting, account deletion |
| AI | <img src="https://img.shields.io/badge/Claude-D97757?style=flat-square&logo=claude&logoColor=white" alt="Claude"> <img src="https://img.shields.io/badge/Vercel_AI_SDK-000000?style=flat-square&logo=vercel&logoColor=white" alt="Vercel AI SDK"> vision and summaries, structured output, a daily limit per user |
| Hosting | <img src="https://img.shields.io/badge/Railway-0B0D0E?style=flat-square&logo=railway&logoColor=white" alt="Railway"> app, database and storage |
| Quality | <img src="https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest"> <img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat-square" alt="Playwright"> <img src="https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white" alt="GitHub Actions"> |

## 🔒 Security and privacy

- 🛡️ **Strict security headers:** Content Security Policy, HSTS and more.
- 🖼️ **Photos:** location metadata (EXIF/GPS) is stripped in the browser before upload, the real file type is verified, and photos are deleted automatically after the retention period.
- 🏢 **Strict separation** of each institution's data.
- 📝 **Audit log** of every sensitive action, and server logs without personal data.
- ⏱️ **Usage limits:** rate-limited sign-in, and a daily cap on AI calls per user.
- 🗑️ **Account deletion** that cleans up the related data.

## ✅ Quality and testing

| Check | Tool | Size |
|---|---|---|
| Unit tests | Vitest | 116 test files |
| End-to-end tests on desktop and mobile | Playwright + accessibility checks (axe) | 42 spec files |
| Types and lint | TypeScript · ESLint (zero warnings) | All code |
| Translation completeness | Arabic and English key check | All strings |
| Continuous integration | GitHub Actions on every push | Automatic |

## 🗂️ Repository layout

```text
.
├── app/
│   ├── [locale]/        # pages in Arabic & English: landing, auth, app, account
│   └── api/             # scans, simulations, reports, admin, health
├── components/          # UI components per feature
├── lib/                 # domain logic: scoring, AI, scans, simulations, reports, permissions
├── messages/            # UI strings: ar/ and en/
├── prisma/              # schema, migrations, seed (protocols & scenarios)
├── e2e/                 # Playwright end-to-end tests
└── docs/                # screenshots, explainer video, README assets
```

## 💻 Running locally

**Requirements:** Node 24 · pnpm 11 · PostgreSQL (for example via Docker).

```bash
cp .env.example .env.local      # BETTER_AUTH_SECRET, DATABASE_URL, optional ANTHROPIC_API_KEY
pnpm install
pnpm db:migrate                 # apply migrations
pnpm db:seed                    # protocols & scenarios
ADMIN_EMAIL=you@example.com ADMIN_INITIAL_PASSWORD='<long random password>' pnpm db:seed-admin
pnpm dev                        # http://localhost:3000
```

- Without an AI key the platform still runs and shows "AI is not configured".
- With `EMAIL_PROVIDER=console`, verification codes are printed to the server log.
- To run every check: `pnpm typecheck && pnpm lint && pnpm test && pnpm i18n:check && pnpm build`

> [!NOTE]
> This repository contains no secrets, passwords or keys. Every variable is documented with an empty value in [`.env.example`](.env.example).

## ⚖️ Rights and usage

This repository is **for viewing only** by the hackathon judges, and carries no open-source license.
© 2026 the Waqaya team. All rights reserved. No part of this code may be copied, used, modified, republished or distributed, in whole or in part, without prior written permission.

<div align="center">
<br>

<a href="https://web-production-88238.up.railway.app"><img src="app/icon.svg" alt="Waqaya" width="44"></a>

<b>Waqaya</b> · from finding failures after they happen to catching them before they become a risk

<sub><a href="#top">⬆ Back to top</a></sub>

</div>
