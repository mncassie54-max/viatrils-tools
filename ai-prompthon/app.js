import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";

const cfg = window.promptthonConfig || {};
const isPreview = new URLSearchParams(location.search).get("preview") === "1";
const configured = /^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(cfg.url || "") && (cfg.anonKey || "").length > 30;
const db = configured ? createClient(cfg.url, cfg.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
const $ = (selector) => document.querySelector(selector);
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[c]);
const safeUrl = (raw) => {
  try { const url = new URL(String(raw)); return url.protocol === "https:" ? url.href : ""; }
  catch { return ""; }
};
const rubric = [
  { key: "impact", title: "업무 개선 효과", weight: 30, desc: "업무상 문제 해결과 생산성 개선 효과" },
  { key: "completion", title: "구현 완성도", weight: 30, desc: "구현한 핵심 기능이 실제 작동하는 정도" },
  { key: "feasibility", title: "실무 활용 가능성", weight: 25, desc: "현업 적용 및 지속적인 활용 가능성" },
  { key: "creativity", title: "창의성 및 차별성", weight: 15, desc: "기존 업무 방식 대비 새로운 AI 활용 접근" }
];
let judgeToken = null;
let judgeData = null;
let currentTeamId = null;
let adminData = { teams: [], judges: [], reviews: [] };

function notice(message, kind = "info") {
  $("#notice").innerHTML = message ? '<div class="' + (kind === "error" ? "error" : "info") + '" style="margin:0 0 18px">' + safe(message) + "</div>" : "";
}
function setTab(mode) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === mode));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === mode));
  notice("");
}
function failure(error) {
  const message = error && error.message ? error.message : String(error || "알 수 없는 오류");
  notice(message, "error");
}
function totalScore(s) {
  return rubric.reduce((sum, item) => sum + Number(s[item.key] || 0) * item.weight / 5, 0);
}
function submitProgress() {
  const finished = judgeData.teams.filter((t) => t.submitted).length;
  const total = judgeData.teams.length;
  $("#judge-progress").textContent = finished + " / " + total + "개 팀 평가 완료";
  const bar = $("#progress-fill");
  if (bar) bar.style.width = (total ? finished / total * 100 : 0) + "%";
}
async function loadJudge(code) {
  if (!db) return;
  notice("");
  const token = String(code || "").trim();
  if (!/^[a-f0-9]{48}$/i.test(token)) {
    notice("유효한 초대 코드를 입력해 주세요. 운영자에게 개인 심사 링크를 요청할 수 있습니다.", "error");
    return;
  }
  const { data, error } = await db.rpc("judge_dashboard", { p_token: token });
  if (error) return failure(error);
  if (!data || !data.judge) return notice("초대 코드를 확인할 수 없습니다.", "error");
  judgeToken = token;
  judgeData = data;
  sessionStorage.setItem("prompthon_judge_token", token);
  $("#judge-login").hidden = true;
  $("#judge-workspace").hidden = false;
  $("#judge-greeting").textContent = data.judge.name + " 심사위원님";
  submitProgress();
  renderJudgeTeams();
  if (data.teams.length) {
    const next = data.teams.find((x) => !x.submitted) || data.teams[0];
    renderEvaluation(next.id);
  } else $("#judge-evaluation").innerHTML = '<div class="panel empty">아직 등록된 평가 대상 팀이 없습니다.</div>';
}
function renderJudgeTeams() {
  $("#judge-team-list").innerHTML = judgeData.teams.map((t, i) =>
    '<button type="button" class="team ' + (t.id === currentTeamId ? "selected" : "") + '" data-team="' + safe(t.id) + '" aria-current="' + (t.id === currentTeamId ? "step" : "false") + '">' +
      '<div class="sectionhead" style="margin-bottom:8px"><h3>' + String(i + 1).padStart(2, "0") + ' &nbsp; ' + safe(t.name) +
      '</h3><span class="pill ' + (t.submitted ? "" : "pending") + '">' +
      (t.submitted ? "완료" : "대기") + "</span></div><p>" +
      safe(t.description || "제출 결과보고서를 확인해 주세요.") + "</p>" +
      '<span class="hint">평가 내용 보기 →</span></button>'
  ).join("");
  document.querySelectorAll("[data-team]").forEach((b) => b.addEventListener("click", () => renderEvaluation(b.dataset.team)));
}
function renderEvaluation(teamId) {
  currentTeamId = teamId;
  const team = judgeData.teams.find((x) => x.id === teamId);
  if (!team) return;
  renderJudgeTeams();
  const resultLink = safeUrl(team.result_url);
  const projectHeading = '<div class="project-summary"><div class="project-card">' +
    '<div class="project-symbol" aria-hidden="true">◇</div><div style="min-width:0"><div class="eyebrow">CURRENT PROJECT</div>' +
    '<h2>' + safe(team.name) + '</h2><p class="hint">' + safe(team.description || "AI Prompthon · Final Project") + '</p></div></div>' +
    '<div class="score-summary"><div class="score-symbol" aria-hidden="true">✦</div><div>' +
    '<div class="hint">TOTAL SCORE</div><strong id="hero-total">' + (team.submitted ? "✓" : "0") +
    '</strong><small>' + (team.submitted ? " 제출 완료" : " / 100") + '</small></div></div></div>';
  if (team.submitted) {
    $("#judge-evaluation").innerHTML = projectHeading + '<div class="panel scoring-panel"><h2>평가 제출 완료</h2>' +
      '<div class="info">이 팀에 대한 평가가 저장되었습니다. 최종 제출된 평가는 변경할 수 없습니다.</div>' +
      (resultLink ? '<p><a target="_blank" rel="noreferrer noopener" href="' + safe(resultLink) +
      '">제출 결과보고서 다시 보기 ↗</a></p>' : "") + "</div>";
    return;
  }
  const icons = ["↗", "⚙", "◎", "✧"];
  $("#judge-evaluation").innerHTML = projectHeading +
    '<div class="panel scoring-panel"><div class="scoring-head"><span class="icon" aria-hidden="true">▥</span>' +
    '<div><h2>Weighted Total Score</h2><p class="hint">각 항목의 1~5점 평가가 자동으로 환산됩니다.</p></div></div>' +
    '<div class="info">평가 기준: 1점 매우 미흡 · 2점 미흡 · 3점 보통 · 4점 우수 · 5점 매우 우수</div>' +
    '<form id="evaluation-form"><div class="scoring-rows">' +
    rubric.map((item, i) =>
      '<div class="score-row"><div class="score-line"><span class="criteria-index" aria-hidden="true">' + icons[i] +
      '</span><div><strong>' + safe(item.title) + '</strong><div class="hint">' + safe(item.desc) + '</div></div></div>' +
      '<div class="weight-badge">' + item.weight + '점</div>' +
      '<div class="score-controls" role="radiogroup" aria-label="' + safe(item.title) + ' 점수">' +
      [1, 2, 3, 4, 5].map((n) =>
        '<span class="score-option"><input id="' + item.key + n + '" name="' + item.key +
        '" type="radio" value="' + n + '" required/><label for="' + item.key + n + '">' + n + "</label></span>"
      ).join("") + "</div></div>"
    ).join("") + '</div>' +
    '<div class="comment-head"><span aria-hidden="true">▤</span><strong>종합 의견</strong></div>' +
    '<textarea id="review-comment" maxlength="1000" aria-label="종합 의견" placeholder="실무 적용 가능성과 향후 확산 방향 등에 관한 종합 의견을 작성해 주세요."></textarea>' +
    (resultLink ? '<p style="margin:12px 0"><a class="btn secondary" target="_blank" rel="noreferrer noopener" href="' +
    safe(resultLink) + '">제출 결과보고서 보기 ↗</a></p>' : "") +
    '<div class="total"><span>가중치 적용 점수</span><strong id="live-total">0 / 100</strong></div>' +
    '<div class="submit-actions"><button class="btn" id="submit-review" type="submit"' +
    (isPreview ? ' disabled title="미리보기 화면에서는 제출할 수 없습니다"' : "") + '>' +
    (isPreview ? '디자인 미리보기 · 제출 불가' : '✈ &nbsp; 최종 제출') +
    '</button><p class="lock-note">' +
    (isPreview ? "디자인 시연용 데이터입니다. 실제 평가나 저장은 이루어지지 않습니다." :
    "최종 제출 후에는 수정할 수 없습니다. 제출 전 모든 점수를 확인해 주세요.") +
    '</p></div></form></div>';
  $("#evaluation-form").addEventListener("change", updateTotal);
  if (!isPreview) $("#evaluation-form").addEventListener("submit", submitReview);
}
function formScores(form) {
  const f = new FormData(form);
  const scores = {};
  rubric.forEach((r) => { scores[r.key] = Number(f.get(r.key) || 0); });
  return scores;
}
function updateTotal() {
  const sum = totalScore(formScores($("#evaluation-form")));
  $("#live-total").textContent = sum + " / 100";
  const hero = $("#hero-total");
  if (hero) hero.textContent = String(sum);
}
async function submitReview(ev) {
  ev.preventDefault();
  const form = ev.target;
  const scores = formScores(form);
  if (rubric.some((r) => !Number.isInteger(scores[r.key]) || scores[r.key] < 1 || scores[r.key] > 5)) {
    return notice("4개 항목 모두 1~5점을 선택해 주세요.", "error");
  }
  if (!window.confirm("총 " + totalScore(scores) + "점으로 최종 제출할까요?\n제출 후에는 수정할 수 없습니다.")) return;
  const button = $("#submit-review");
  button.disabled = true;
  button.textContent = "제출 중…";
  const { error } = await db.rpc("judge_submit", {
    p_token: judgeToken, p_team_id: currentTeamId, p_impact: scores.impact,
    p_completion: scores.completion, p_feasibility: scores.feasibility,
    p_creativity: scores.creativity, p_comment: $("#review-comment").value.trim()
  });
  if (error) {
    button.disabled = false;
    button.textContent = "이 팀 평가 최종 제출";
    return failure(error);
  }
  notice("평가가 정상적으로 저장되었습니다.");
  await loadJudge(judgeToken);
}
async function checkAdmin() {
  if (!db) return;
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData.session) return;
  const { data: allowed, error } = await db.rpc("is_admin");
  if (error) return failure(error);
  if (!allowed) return notice("로그인한 계정에 운영자 권한이 없습니다. Supabase 관리자 설정을 확인해 주세요.", "error");
  $("#admin-login").hidden = true;
  $("#admin-workspace").hidden = false;
  await refreshAdmin();
}
async function refreshAdmin() {
  const [t, j, r] = await Promise.all([
    db.from("teams").select("*").order("created_at"),
    db.from("judges").select("id,name,active,created_at").order("created_at"),
    db.from("reviews").select("*").order("submitted_at", { ascending: false })
  ]);
  const error = t.error || j.error || r.error;
  if (error) return failure(error);
  adminData = { teams: t.data || [], judges: j.data || [], reviews: r.data || [] };
  renderAdmin();
}
function renderAdmin() {
  const { teams, judges, reviews } = adminData;
  const active = judges.filter((j) => j.active);
  const expected = teams.length * active.length;
  const done = reviews.filter((r) => active.some((j) => j.id === r.judge_id)).length;
  $("#metrics").innerHTML = [
    ["등록된 팀", teams.length], ["심사위원", active.length],
    ["제출된 평가", done + " / " + expected], ["제출률", expected ? Math.round(done / expected * 100) + "%" : "—"]
  ].map((x) => '<div class="metric"><span class="label">' + safe(x[0]) + '</span><strong>' + safe(x[1]) + '</strong></div>').join("");
  const ranking = teams.map((team) => {
    const submitted = reviews.filter((r) => r.team_id === team.id);
    const scores = submitted.map(totalScore);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    return { team, submitted: submitted.length, avg };
  }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || a.team.name.localeCompare(b.team.name));
  $("#ranking").innerHTML = ranking.length ?
    '<table><thead><tr><th>순위</th><th>팀명</th><th class="num">평균 점수</th><th class="num">제출 수</th></tr></thead><tbody>' +
    ranking.map((x, i) => '<tr><td>' + (x.avg === null ? "—" : i + 1) + '</td><td><strong>' +
      safe(x.team.name) + '</strong></td><td class="num"><strong>' + (x.avg === null ? "—" : x.avg.toFixed(1)) +
      '</strong></td><td class="num">' + x.submitted + ' / ' + active.length + '</td></tr>').join("") + "</tbody></table>" :
    '<div class="empty">등록된 팀이 없습니다. 아래에서 평가 대상 팀을 추가해 주세요.</div>';
  const items = reviews.map((r) => ({
    ...r, team: teams.find((t) => t.id === r.team_id),
    judge: judges.find((j) => j.id === r.judge_id)
  }));
  $("#review-detail").innerHTML = items.length ?
    '<table><thead><tr><th>팀</th><th>심사자</th><th class="num">업무 개선</th><th class="num">구현</th><th class="num">활용</th><th class="num">창의성</th><th class="num">총점</th><th>의견</th></tr></thead><tbody>' +
    items.map((x) => '<tr><td>' + safe(x.team?.name || "삭제된 팀") + '</td><td>' + safe(x.judge?.name || "삭제된 심사자") +
      '</td><td class="num">' + x.impact + '</td><td class="num">' + x.completion +
      '</td><td class="num">' + x.feasibility + '</td><td class="num">' + x.creativity +
      '</td><td class="num"><strong>' + totalScore(x) + '</strong></td><td>' + safe(x.comment || "—") + '</td></tr>').join("") + "</tbody></table>" :
    '<div class="empty">아직 제출된 평가가 없습니다.</div>';
}
function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV spreadsheet formula-injection guard
  return '"' + s.replace(/"/g, '""') + '"';
}
function downloadCsv() {
  const { teams, judges, reviews } = adminData;
  const headers = ["팀명", "평가자", "제출 상태", "업무 개선(1~5)", "구현 완성(1~5)", "실무 활용(1~5)", "창의성(1~5)", "총점(100)", "종합 의견", "제출 시각"];
  const rows = [headers];
  for (const team of teams) for (const judge of judges) {
    if (!judge.active) continue;
    const r = reviews.find((x) => x.team_id === team.id && x.judge_id === judge.id);
    rows.push([team.name, judge.name, r ? "제출" : "미제출", r?.impact, r?.completion, r?.feasibility,
      r?.creativity, r ? totalScore(r) : "", r?.comment || "", r?.submitted_at || ""]);
  }
  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blobUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = "AI_Prompthon_Final_Evaluation_" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
async function addTeam(ev) {
  ev.preventDefault();
  const name = $("#team-name").value.trim();
  const desc = $("#team-desc").value.trim();
  const url = $("#team-link").value.trim();
  if (!name) return;
  if (url && !safeUrl(url)) return notice("보고서 링크는 https:// 주소를 입력해 주세요.", "error");
  const { error } = await db.from("teams").insert({ name, description: desc, result_url: url || null });
  if (error) return failure(error);
  ev.target.reset();
  notice("평가 대상 팀을 추가했습니다.");
  await refreshAdmin();
}
async function addJudge(ev) {
  ev.preventDefault();
  const name = $("#judge-name").value.trim();
  if (!name) return;
  const { data, error } = await db.rpc("admin_add_judge", { p_name: name });
  if (error) return failure(error);
  const link = location.origin + location.pathname + "?mode=judge#code=" + encodeURIComponent(data.token);
  const invitation = $("#invitation");
  invitation.innerHTML = '<div class="info"><strong>' + safe(name) + ' 심사위원 초대 링크 (이번 화면에서만 확인 가능)</strong>' +
    '<p class="link" id="issued-link">' + safe(link) + '</p><button class="btn secondary" id="copy-invite" type="button">링크 복사</button></div>';
  $("#copy-invite").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(link); notice("초대 링크를 복사했습니다."); }
    catch { notice("복사 권한이 없으면 표시된 링크를 직접 복사해 주세요."); }
  });
  ev.target.reset();
  await refreshAdmin();
}
function initEvents() {
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setTab(tab.dataset.tab)));
  $("#judge-login-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    loadJudge($("#judge-code").value);
  });
  $("#judge-logout").addEventListener("click", () => {
    sessionStorage.removeItem("prompthon_judge_token");
    history.replaceState({}, "", location.pathname + "?mode=judge");
    judgeToken = null; judgeData = null; currentTeamId = null;
    $("#judge-login").hidden = false; $("#judge-workspace").hidden = true; $("#judge-code").value = ""; notice("");
  });
  $("#admin-login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!db) return;
    const { error } = await db.auth.signInWithOtp({
      email: $("#admin-email").value.trim(),
      options: { emailRedirectTo: location.origin + location.pathname + "?mode=admin" }
    });
    if (error) return failure(error);
    notice("입력하신 이메일로 로그인 링크를 전송했습니다. 메일함을 확인해 주세요.");
  });
  $("#admin-logout").addEventListener("click", async () => {
    await db.auth.signOut();
    $("#admin-login").hidden = false; $("#admin-workspace").hidden = true; notice("로그아웃했습니다.");
  });
  $("#refresh").addEventListener("click", refreshAdmin);
  $("#export").addEventListener("click", downloadCsv);
  $("#add-team").addEventListener("submit", addTeam);
  $("#add-judge").addEventListener("submit", addJudge);
}
async function init() {
  initEvents();
  if (isPreview) {
    judgeData = {
      judge: { name: "디자인 미리보기" },
      teams: [
        { id: "demo-1", name: "AI Agent for Kakao Operations", description: "카카오 업무를 돕는 AI 에이전트 (예시)", submitted: false },
        { id: "demo-2", name: "Pharma Insight Copilot", description: "정보 탐색 및 요약 도우미 (예시)", submitted: false },
        { id: "demo-3", name: "Meeting Summary Assistant", description: "회의 결과 정리 자동화 (예시)", submitted: false },
        { id: "demo-4", name: "Document Automation Agent", description: "반복 문서 작업 효율화 (예시)", submitted: false }
      ]
    };
    setTab("judge");
    $("#judge-login").hidden = true;
    $("#judge-workspace").hidden = false;
    $("#judge-greeting").textContent = "디자인 미리보기";
    $("#judge-logout").hidden = true;
    submitProgress();
    renderEvaluation("demo-1");
    notice("디자인 미리보기입니다. 예시 프로젝트와 점수는 실제 심사 데이터가 아니며 저장되지 않습니다.");
    return;
  }
  const mode = new URLSearchParams(location.search).get("mode");
  if (mode === "admin") setTab("admin");
  if (!configured) {
    setTab("judge");
    $("#judge-login").innerHTML = '<h2>스코어링 화면 디자인 미리보기</h2><p class="subtitle" style="margin-bottom:18px">데이터 저장소 연결 전에도 심사 화면 디자인과 점수 자동 계산을 체험할 수 있습니다. 미리보기의 점수는 저장되지 않습니다.</p><a class="btn" href="?preview=1">디자인 미리보기 열기 ↗</a>';
    $("#admin-login").innerHTML = '<h2>결과 대시보드</h2><p class="hint">심사 데이터 저장소 연결 후 운영자 로그인과 결과 집계가 활성화됩니다.</p>';
    notice("현재 디자인 검토 단계입니다. 실제 심사 제출은 데이터 저장소 연결과 배포 설정을 마친 후 이용할 수 있습니다.");
    return;
  }
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const code = hash.get("code") || sessionStorage.getItem("prompthon_judge_token");
  if (code) { setTab("judge"); await loadJudge(code); }
  else if (mode !== "admin") setTab("judge");
  await checkAdmin();
}
init().catch(failure);
