/* 개념 한 걸음 — app.js
   © 2026 영쌤클래스. 교육용으로 제작. 무단 복제·재배포 금지.
   데이터: data/standards.json (2022 개정 성취기준·성취수준), data/core_ideas.json (공통교육과정 핵심아이디어)
   AI: 교사 본인의 Gemini API 키를 브라우저에 저장해 직접 호출 */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const LEVELS = [
  { id: '초', name: '초등학교', grades: ['1~2학년군', '3~4학년군', '5~6학년군'], minutes: 40 },
  { id: '중', name: '중학교', grades: ['중학교'], minutes: 45 },
  { id: '고', name: '고등학교', grades: ['고등학교'], minutes: 50 },
];

let STD = [];      // standards
let CORE = [];     // core ideas (by area)
const state = {
  std: null,           // selected standard object
  coreSelected: [],    // selected core idea items [{id,text,area}]
  coreAuto: false,     // whether auto-matched
  concept: '',
  context: '',
  map: null,           // 오개념·발문 지도
  lesson: null,        // 차시안
  lessonMode: 'inductive',
  review: { checks: [false,false,false,false], edits: '' },
  originalMap: null,
  focusCard: 0,
  cardReviews: {},
};

/* ---------- 유틸 ---------- */
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function setStatus(msg, kind = '') { const el = $('#status'); el.textContent = msg; el.className = 'status ' + kind; }
function uniq(arr) { return Array.from(new Set(arr)); }
function levelOf(grade) { return LEVELS.find(l => l.grades.includes(grade)); }
function fillSelect(sel, items, placeholder) {
  sel.innerHTML = '';
  if (placeholder) { const o = document.createElement('option'); o.value = ''; o.textContent = placeholder; sel.appendChild(o); }
  for (const it of items) {
    const o = document.createElement('option');
    if (typeof it === 'string') { o.value = it; o.textContent = it; }
    else { o.value = it.value; o.textContent = it.label; }
    sel.appendChild(o);
  }
}

/* ---------- 핵심아이디어 매핑 ---------- */
function coreSubjectOf(subj) {
  if (subj === '실과' || subj === '기술·가정') return '실과(기술·가정)';
  if (subj === '역사') return '사회';
  return subj;
}
function normArea(subj, area) {
  let a = area.replace(/\s*영역$/, '').trim();
  const alias = {
    '이해': '이해(reception)', '표현': '표현(production)',
    '사회 공동체와의 관계': '사회·공동체와의 관계', '사회·공동체과의 관계': '사회·공동체와의 관계',
    '인간발달과 주도적 삶': '인간 발달과 주도적 삶', '생활환경과 지속가능한 삶': '생활환경과 지속가능한 선택',
  };
  if (subj === '영어' && alias[a]) return alias[a];
  if (alias[a] && subj !== '영어') return alias[a];
  return a;
}
function coreGroupsFor(std) {
  // 이 자료는 초1~중3 공통교육과정 전용이다. 교과 이름이 같아도 고등에 연결하지 않는다.
  if (std.g === '고등학교') return [];
  const cs = coreSubjectOf(std.s);
  let groups = CORE.filter(c => c.s === cs);
  if (std.s === '역사') groups = groups.filter(c => c.series === '역사');
  return groups;
}
function autoMatchCore(std) {
  const groups = coreGroupsFor(std);
  if (!groups.length) return { groups: [], matched: [] };
  const target = normArea(std.s, std.a);
  const matched = groups.filter(g => g.a === target);
  return { groups, matched };
}

/* ---------- 선택 UI ---------- */
function initSelectors() {
  fillSelect($('#selLevel'), LEVELS.map(l => ({ value: l.id, label: l.name })));
  $('#selLevel').value = '초';
  onLevelChange();
}
function onLevelChange() {
  const lv = LEVELS.find(l => l.id === $('#selLevel').value);
  const wrap = $('#wrapGrade');
  if (lv.grades.length > 1) { wrap.classList.remove('hidden'); fillSelect($('#selGrade'), lv.grades); }
  else { wrap.classList.add('hidden'); fillSelect($('#selGrade'), lv.grades); }
  onGradeChange();
}
function currentGrade() { return $('#selGrade').value; }
function onGradeChange() {
  const g = currentGrade();
  const subjects = uniq(STD.filter(d => d.g === g).map(d => d.s));
  fillSelect($('#selSubject'), subjects);
  onSubjectChange();
}
function onSubjectChange() {
  const g = currentGrade(), s = $('#selSubject').value;
  const courses = uniq(STD.filter(d => d.g === g && d.s === s).map(d => d.sub));
  const wrap = $('#wrapCourse');
  if (courses.length > 1) { wrap.classList.remove('hidden'); fillSelect($('#selCourse'), courses); }
  else { wrap.classList.add('hidden'); fillSelect($('#selCourse'), courses); }
  onCourseChange();
}
function onCourseChange() {
  const g = currentGrade(), s = $('#selSubject').value, sub = $('#selCourse').value;
  const areas = uniq(STD.filter(d => d.g === g && d.s === s && d.sub === sub).map(d => d.a));
  fillSelect($('#selArea'), areas.map(a => a || '(영역 없음)'));
  onAreaChange();
}
function onAreaChange() {
  clearSelection();
  const g = currentGrade(), s = $('#selSubject').value, sub = $('#selCourse').value;
  let a = $('#selArea').value; if (a === '(영역 없음)') a = '';
  const list = STD.filter(d => d.g === g && d.s === s && d.sub === sub && d.a === a);
  fillSelect($('#selStd'), list.map(d => ({ value: d.c, label: `${d.c} ${d.t}` })));
  $('#inpSearch').value = '';
}
function onSearch() {
  const q = $('#inpSearch').value.trim();
  if (!q) { onAreaChange(); return; }
  clearSelection();
  const g = currentGrade();
  const list = STD.filter(d => d.g === g && (d.t.includes(q) || d.c.includes(q) || d.a.includes(q))).slice(0, 80);
  fillSelect($('#selStd'), list.map(d => ({ value: d.c, label: `${d.c} ${d.t}` })));
}
function onStdPick() {
  const code = $('#selStd').value;
  const std = STD.find(d => d.c === code && d.g === currentGrade()) || STD.find(d => d.c === code);
  if (!std) return;
  state.std = std;
  state.concept = ''; $('#inpConcept').value = ''; $('#conceptChips').innerHTML = '';
  state.map = null; state.lesson = null;
  state.originalMap = null; state.focusCard = 0;
  state.cardReviews = {};
  state.review = { checks: [false,false,false,false], edits: '', plan: '' };
  $('#result').classList.add('hidden');
  renderEvidence();
}
function clearSelection() {
  state.std = null; state.map = null; state.lesson = null; state.originalMap = null;
  $('#evidence').classList.add('hidden'); $('#result').classList.add('hidden');
  $('#empty').classList.remove('hidden');
}

/* ---------- 근거 패널 ---------- */
function renderEvidence() {
  const std = state.std;
  $('#empty').classList.add('hidden');
  $('#evidence').classList.remove('hidden');
  $('#evCode').textContent = std.c;
  $('#evMeta').textContent = [std.g, std.s !== std.sub ? `${std.s} · ${std.sub}` : std.s, std.a].filter(Boolean).join(' / ');
  $('#evText').textContent = std.t;
  const dl = $('#evLevels'); dl.innerHTML = '';
  const names = std.D || std.E ? { A: 'A', B: 'B', C: 'C', D: 'D', E: 'E' }
    : { A: 'A (상)', B: 'B (중)', C: 'C (하)' };
  for (const k of ['A', 'B', 'C', 'D', 'E']) {
    if (!std[k]) continue;
    const dt = document.createElement('dt'); dt.textContent = names[k];
    const dd = document.createElement('dd'); dd.textContent = std[k];
    if (k === lowestLevelKey(std)) dd.className = 'low';
    dl.append(dt, dd);
  }
  // 핵심아이디어
  const { groups, matched } = autoMatchCore(std);
  const box = $('#evCore'); box.innerHTML = '';
  state.coreSelected = []; state.coreAuto = matched.length > 0;
  if (!groups.length) {
    $('#coreNote').textContent = '— 이 과목은 핵심아이디어 자료가 없습니다';
  } else if (matched.length) {
    $('#coreNote').textContent = `— 영역 「${matched[0].a}」 자동 연결`;
    for (const g of matched) for (const it of g.items) state.coreSelected.push({ ...it, area: g.a });
  } else {
    $('#coreNote').textContent = '— 영역명이 달라 직접 고르거나, 비워 두면 AI가 관련된 것을 고릅니다';
  }
  let others = null;
  if (matched.length && groups.length > matched.length) {
    others = document.createElement('details'); others.className = 'core-others';
    others.innerHTML = '<summary>다른 영역의 핵심아이디어도 보기</summary>';
  }
  for (const g of groups) {
    const isM = matched.includes(g);
    const div = document.createElement('div'); div.className = 'core-group';
    div.innerHTML = `<h5>${esc(g.series ? g.series + ' · ' : '')}${esc(g.a)}</h5>`;
    for (const it of g.items) {
      const lab = document.createElement('label'); lab.className = 'core-item' + (isM ? ' picked' : '');
      lab.innerHTML = `<input type="checkbox" ${isM ? 'checked' : ''} data-id="${esc(it.id)}"><span>${esc(it.text)}</span>`;
      lab.querySelector('input').addEventListener('change', (e) => {
        const on = e.target.checked;
        lab.classList.toggle('picked', on);
        if (on) state.coreSelected.push({ ...it, area: g.a });
        else state.coreSelected = state.coreSelected.filter(x => x.id !== it.id);
      });
      div.appendChild(lab);
    }
    (isM || !others ? box : others).appendChild(div);
  }
  if (others) box.appendChild(others);
}
function lowestLevelKey(std) { for (const k of ['E', 'D', 'C', 'B', 'A']) if (std[k]) return k; return 'C'; }

/* ---------- Gemini ---------- */
function getKey() { return localStorage.getItem('chg:key') || ''; }
const DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-flash'];
function getModel() {
  return localStorage.getItem('chg:model') || DEFAULT_MODELS[0];
}
function fillModels(list, note) {
  const sel = $('#selModel'); const cur = getModel();
  const items = uniq([...(list || []), ...(list && list.length ? [] : DEFAULT_MODELS), cur]);
  fillSelect(sel, items);
  sel.value = list?.length && !list.includes(cur) ? list[0] : cur;
  if (note) $('#modelNote').textContent = note;
}
async function loadModels() {
  const key = $('#inpKey').value.trim() || getKey();
  if (!key) { $('#modelNote').textContent = '키를 먼저 입력하세요.'; return; }
  $('#modelNote').textContent = '불러오는 중…';
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(res.status);
    const j = await res.json();
    const names = (j.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
      .filter(n => /^gemini/.test(n) && !/(image|tts|live|audio|embedding|translate|transcribe|omni|native)/.test(n))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    fillModels(names, `${names.length}개 모델을 찾았습니다.`);
  } catch (e) { fillModels(null, '목록을 불러오지 못했습니다. 키를 확인하거나 직접 입력하세요.'); }
}
async function callGemini(prompt) {
  const key = getKey();
  if (!key) { $('#dlgSettings').showModal(); throw new Error('API 키를 먼저 저장해 주세요.'); }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(getModel())}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, responseMimeType: 'application/json', maxOutputTokens: 8192 },
  };
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? '60초 안에 응답이 오지 않았습니다. 현재 초안은 유지됩니다. 키 없이 연습 또는 직접 작성으로 계속할 수 있습니다.' : '연결하지 못했습니다. 네트워크를 확인하거나 키 없이 연습·직접 작성을 이용하세요.');
  }
  if (!res.ok) {
    let msg = `요청 실패 (${res.status})`;
    try { const j = await res.json(); msg += ': ' + (j.error?.message || ''); } catch (_) { }
    if (res.status === 400 || res.status === 403) msg += ' — API 키가 맞는지 확인하세요.';
    if (res.status === 404) msg += ' — 설정에서 이 키로 쓸 수 있는 모델 목록을 다시 불러와 선택하세요.';
    if (res.status === 429) msg += ' — 요청 한도 또는 할당량을 확인하세요. 키 없이 연습·직접 작성으로 계속할 수 있습니다.';
    throw new Error(msg);
  }
  const data = await res.json();
  if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new Error('응답이 길어 중간에 끝났습니다. 기존 초안은 유지됩니다. 개념 범위를 좁혀 다시 시도하세요.');
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  const clean = text.replace(/^```json\s*|```\s*$/g, '').trim();
  try { return JSON.parse(clean); }
  catch (e) {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('AI 응답을 읽을 수 없습니다. 다시 시도하세요.');
  }
}

function curriculumBlock() {
  const std = state.std;
  const lv = levelOf(std.g);
  const lines = [];
  lines.push(`[학교급/학년군] ${lv.name} ${std.g}`);
  lines.push(`[교과/과목] ${std.s}${std.s !== std.sub ? ' / ' + std.sub : ''}   [영역] ${std.a}`);
  lines.push(`[성취기준] ${std.c} ${std.t}`);
  lines.push(`[성취수준]`);
  for (const k of ['A', 'B', 'C', 'D', 'E']) if (std[k]) lines.push(`  ${k}: ${std[k]}`);
  const lowest = lowestLevelKey(std);
  lines.push(`  ※ ${lowest} 수준을 포함한 성취수준은 수행의 도달 정도를 서술하며, 오개념의 발생·원인·빈도를 입증하지 않는다. 전체 수준 간 차이와 성취기준을 비교하여 확인할 개념 요소를 찾고, 예상 오개념은 미검증 가설로 구분한다. 서술에 없는 능력을 없다고 단정하지 않는다.`);
  if (state.coreSelected.length) {
    lines.push(`[핵심아이디어(교사가 선택)]`);
    for (const it of state.coreSelected) lines.push(`  (${it.id}) ${it.text}`);
  } else {
    const groups = coreGroupsFor(std);
    if (groups.length) {
      lines.push(`[핵심아이디어(이 교과 전체 — 이 성취기준과 가장 관련 깊은 1~2개를 골라 인용할 것)]`);
      for (const g of groups) for (const it of g.items) lines.push(`  (${it.id}) ${g.a}: ${it.text}`);
    } else {
      lines.push(`[핵심아이디어] 자료 없음 — 성취기준과 성취수준만 근거로 삼는다.`);
    }
  }
  if (state.context.trim()) lines.push(`[우리 반 특성] ${state.context.trim()}`);
  return lines.join('\n');
}

const RULES = `너는 한국 교사의 수업 준비를 돕는다. 교육과정 원문과 교수학적 추론을 구분하고, 학년·교과의 정확성을 우선한다. 예상 오개념은 학생 진단 결과가 아니다. 출력은 JSON만 쓴다.
발문은 한 번에 한 판단을 요구하고 판단 이유를 드러내게 한다. 선택형·예/아니오 질문도 이유 설명과 결합하면 가능하다. 자료와 조건은 별도 안내 문장으로 제시한다. 정답을 암시하는 유도 질문을 피하되 필요한 정의·용어·명시적 설명을 금지하지 않는다. 탐구에서는 안내를 제공하며 정의의 제시 시점은 목표·사전지식·과제에 따라 정한다.
원인 유형은 배타적 진단 분류가 아니다. 선개념/과잉일반화/과소일반화/용어 혼동을 중복 표기할 수 있고, 선수지식 부족/절차 오류/자료 해석/판단 보류도 가능하다. 오답 한 문장만으로 원인을 확정하지 않는다. 근거 요구는 모든 유형에 가능하며, 반례·대조·재표현·명시적 설명을 학생 반응에 따라 조합한다.`;

function promptSuggest() {
  return `${RULES}

${curriculumBlock()}

과제: 이 성취기준을 가르칠 때 학생이 획득해야 할 "핵심 개념(concept)" 후보를 2~3개 제안하라. 개념은 명사형 개념어(예: 분수, 장소감, 세포)로 쓰되, 이 성취기준 문장과 핵심아이디어에 실제로 들어 있는 것이어야 한다. 기능·태도가 아니라 이해해야 할 개념이어야 한다.

JSON 형식:
{"candidates":[{"concept":"개념어","why":"이 성취기준에서 왜 이 개념이 핵심인지 한 문장","core_idea_ids":["관련 핵심아이디어 id"]}]}`;
}

function promptMap() {
  return `${RULES}

${curriculumBlock()}

[핵심 개념] ${state.concept}
과제: 여러 차시에서 쓸 오개념·발문 지도 초안.
0. approach: 귀납 / 연역 후 범례 / 먼저 씨름 후 설명 중 출발 방식을 제안하고, 목표·사전지식·사례의 구별 가능성·가용시간에 근거한 조건을 명시한다. 사전지식이 없으면 추정이라고 밝힌다. 자료 제공 자체를 연역이라고 부르지 않는다. 먼저 씨름 후 설명은 비교 가능한 시도와 이를 연결하는 후속 설명을 포함한다.
1. concept: 학생 언어·교과 정의와 핵심아이디어 연결. 고등 등 자료가 없으면 연결을 꾸미지 말고 '앱에 해당 학교급 핵심아이디어 자료 없음'이라고 쓴다. 성취기준에 명시되지 않은 정의는 교과 지식에 기초한 검토용 초안이다.
2. 서로 다른 예상 오개념을 최대 3개 만든다. 타당한 것이 적으면 개수를 채우지 않는다.
- statement: 조건과 학생의 실제 발화를 구체화한다. 유형 type은 중복 가능하며 확정 진단 아님.
- evidence_source: 성취기준 또는 성취수준 A/B/C/D/E 중 관련 원문이 있는 하나. evidence_quote: 그 원문에서 실제로 연속된 구절을 그대로 인용. 인용할 원문이 없으면 둘 다 빈 문자열. evidence: 인용과 구별되는 추론 및 대안 설명을 쓴다. 하위 서술에서 오개념을 필연적으로 도출하거나 낮은 성취를 오개념과 동일시하지 않는다. 같은 적절한 인용을 여러 가설에 쓸 수 있다. 출처·페이지를 만들지 않는다.
- diagnostic_question: 교정 전에 학생이 무엇을 근거로 판단하는지 드러내는 질문.
- correction_type: 반례 제시/대조/근거 요구/재표현/명시적 설명 등을 선택·조합.
- material: 발문에 필요한 사례·수치·그림의 구체적 설명. correction_question: 그 자료로 묻는 간결한 질문.
- responses: 이해/부분 이해/오개념 유지 3갈래. student_says는 실제 예상 말. next_question은 교사의 후속 발문 또는 행동. 이해에는 새로운 사례 적용, 부분 이해에는 빠진 속성, 유지에는 그림·조작·대조·짧은 설명 등 다른 지원. 무조건 더 강한 모순을 요구하지 않는다. 말이 없거나 이유를 모르면 원인 판단을 보류하고 선택지·표현 지원을 제공.
- mastery: 같은 정답 반복이 아니라 다른 사례에서 핵심 조건과 이유를 말하는지를 판단.
- follow_up: 앞에서 쓴 자료와 다른 새로운 사례에서 확인하는 질문.
- scene: 쓸 장면. 수업 후 관찰 이전에 발생 빈도·효과를 확정하지 않는다.
3. teaching_note: 진단→학생 근거에 맞춘 지원→새 사례 확인 방법을 3문장으로.
JSON 형식:
{"approach":{"mode":"","reason":""},"concept":{"name":"","student_definition":"","formal_definition":"","core_idea_link":""},
"misconceptions":[{"statement":"","type":"","evidence_source":"","evidence_quote":"","evidence":"","material":"","diagnostic_question":"","correction_type":"","correction_question":"","responses":[{"kind":"이해","student_says":"","next_question":""},{"kind":"부분 이해","student_says":"","next_question":""},{"kind":"오개념 유지","student_says":"","next_question":""}],"mastery":"","follow_up":"","scene":""}],"teaching_note":""}`;
}

function promptLesson() {
  const lv = levelOf(state.std.g);
  const mis = (state.map?.misconceptions || []).map(m => `- ${m.statement} (${m.type})`).join('\n');
  return `${RULES}

${curriculumBlock()}

[핵심 개념] ${state.concept}
[이미 예측한 오개념]
${mis}

${state.lessonMode === 'deductive'
  ? `과제: 이 개념을 처음 도입하는 ${lv.minutes}분 차시를 "연역 안내 후 범례 확인" 방식으로 설계하라. 교사가 정의·약속·핵심 자료를 짧고 분명하게 안내한 뒤(학생 말로 번역해 주기), 학생은 여러 예시와 가까운 비예시에 그 정의를 적용해 판단하고, 판단이 갈리는 사례에서 속성을 다시 확인하며, 마지막에 자기 말로 정의를 다시 쓴다. 안내 길이는 학생 사전지식과 개념 복잡성에 맞추고 나머지는 학생의 적용·판단 활동으로 채운다.`
  : `과제: 이 개념을 처음 도입하는 ${lv.minutes}분 차시를 "귀납적 개념 획득" 방식으로 설계하라. 학생은 예시와 비예시를 먼저 보고, 공통 특징을 스스로 찾고, 자기 말로 정의를 만든 뒤, 마지막에 교과 정의와 맞춘다. 필요한 자료·비교 기준·발문을 제공한다. 용어·약속은 필요한 시점에 안내하고, 핵심 속성을 탐색한 뒤 정의를 정리한다.`}
1. 예시 5개: 학생에게 친숙하고 개념의 필수 속성이 잘 드러나는 것. 각각 왜 예시인지 한 구절.
2. 비예시 5개: "가까운 비예시" 위주 — 위에 예측한 오개념을 가진 학생이 예시라고 착각할 만한 것. 각각 어떤 속성이 빠져서 비예시인지 한 구절.
3. 학생이 발견해야 할 필수 속성(필요한 수만, 개수를 억지로 채우지 않기)와, 각각을 끌어내는 교사 질문 1문장.
4. 학생이 만들 법한 정의(예상)와 교과 정의.
5. ${lv.minutes}분 흐름 5~6단계: 단계명, 분, 교사가 하는 일, 학생이 하는 일, 준비물. 합계가 ${lv.minutes}분이 되게.
6. 차시 끝 이해 확인 질문 1개(새로운 사례를 판단하게 하는 질문).

JSON 형식:
{"examples":[{"item":"","note":""}],"nonexamples":[{"item":"","note":""}],
 "attributes":[{"attribute":"","eliciting_question":""}],
 "definition_student":"","definition_formal":"",
 "flow":[{"phase":"","minutes":0,"teacher":"","students":"","materials":""}],
 "check":""}`;
}

/* ---------- 액션 ---------- */
let aiBusy = false;
function setBusy(on) {
  aiBusy = on;
  $$('.rail input, .rail select, .rail textarea, .rail button, .result-toolbar button, .regen, #btnSaved, #btnSettings').forEach(el => { el.disabled = on; });
  $('#btnPresent').disabled = on || !state.lesson;
}
function validateMap(map) {
  if (!map || typeof map !== 'object' || !map.concept || typeof map.concept !== 'object' || !Array.isArray(map.misconceptions) || !map.misconceptions.length || map.misconceptions.some(m => !m || typeof m !== 'object' || !Array.isArray(m.responses) || m.responses.some(r => !r || typeof r !== 'object'))) {
    throw new Error('지도 형식이 올바르지 않습니다. 현재 초안은 유지됩니다.');
  }
  return map;
}
async function suggestConcepts() {
  if (aiBusy) return;
  if (!state.std) { setStatus('먼저 성취기준을 고르세요.', 'err'); return; }
  setStatus('개념 후보를 찾는 중', 'busy');
  setBusy(true);
  try {
    const j = await callGemini(promptSuggest());
    const box = $('#conceptChips'); box.innerHTML = '';
    for (const c of (j.candidates || []).slice(0, 4)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
      b.innerHTML = `${esc(c.concept)}<small>${esc(c.why)}</small>`;
      b.addEventListener('click', () => {
        $$('#conceptChips .chip').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        $('#inpConcept').value = c.concept; state.concept = c.concept;
        // 후보가 가리킨 핵심아이디어를 자동 체크(비어 있을 때만)
        if (!state.coreSelected.length && Array.isArray(c.core_idea_ids)) {
          for (const id of c.core_idea_ids) { const cb = $(`#evCore input[data-id="${CSS.escape(id)}"]`); if (cb && !cb.checked) cb.click(); }
        }
      });
      box.appendChild(b);
    }
    setStatus('후보를 고르거나 직접 입력하세요.');
  } catch (e) { setStatus(e.message, 'err'); }
  finally { setBusy(false); }
}

async function generateMap() {
  if (aiBusy) return;
  if (!state.std) { setStatus('먼저 성취기준을 고르세요.', 'err'); return; }
  state.concept = $('#inpConcept').value.trim();
  state.context = $('#inpContext').value;
  if (!state.concept) { setStatus('개념을 입력하거나 후보에서 고르세요.', 'err'); $('#inpConcept').focus(); return; }
  setStatus('초안을 만드는 중… 응답 시간은 모델·연결 상태에 따라 달라집니다.', 'busy');
  setBusy(true);
  try {
    const next = validateMap(await callGemini(promptMap()));
    state.map = next;
    state.originalMap = structuredClone(next); state.focusCard = 0;
    state.cardReviews = {};
    state.lesson = null; $('#blkLesson').classList.add('hidden'); $('#btnPresent').disabled = true;
    state.review = { checks: [false,false,false,false], edits: '', plan: '' };
    renderMap();
    $('#result').classList.remove('hidden');
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus('AI 초안입니다. 카드 하나를 골라 인용·가설·발문을 검토하고 수정 이유를 기록하세요.');
  } catch (e) { setStatus(e.message, 'err'); }
  finally { setBusy(false); }
}

async function generateLesson(mode) {
  if (aiBusy) return;
  if (!state.map) return;
  const previousMode = state.lessonMode;
  if (mode) state.lessonMode = mode;
  setStatus('차시안을 만드는 중… 응답 시간은 모델·연결 상태에 따라 달라집니다.', 'busy');
  setBusy(true);
  try {
    const next = await callGemini(promptLesson());
    if (!next || !['examples','nonexamples','attributes','flow'].every(k => Array.isArray(next[k]) && next[k].every(x => x && typeof x === 'object'))) throw new Error('차시안 형식이 올바르지 않습니다. 현재 초안은 유지됩니다.');
    state.lesson = next;
    renderLesson();
    $('#blkLesson').classList.remove('hidden');
    $('#btnPresent').disabled = false;
    $('#blkLesson').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus('차시안 완성.');
  } catch (e) { state.lessonMode = previousMode; setStatus(e.message, 'err'); }
  finally { setBusy(false); }
}

/* ---------- 렌더 & 양방향 바인딩 ---------- */
function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function setPath(obj, path, val) {
  const ks = path.split('.'); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = val;
}
function bindAll(root = document) {
  root.querySelectorAll('[data-bind]').forEach(el => {
    const v = getPath(state, el.dataset.bind);
    el.textContent = v == null ? '' : String(v);
    if (!el.dataset.bound) {
      el.dataset.bound = '1';
      el.addEventListener('input', () => {
        setPath(state, el.dataset.bind, el.textContent);
        updateReviewStatus();
        if (/\.evidence_(source|quote)$/.test(el.dataset.bind)) updateEvidenceChecks();
      });
    }
  });
}
function ed(path, cls = '') { return `<span class="editable ${cls}" contenteditable="true" data-bind="${path}"></span>`; }

function branchClass(k) { return k === '이해' ? 'ok' : (k === '부분 이해' ? 'part' : 'hold'); }
function evidenceCheck(mis) {
  const src = mis.evidence_source || '', quote = (mis.evidence_quote || '').trim();
  const key = src.match(/^성취수준 ([ABCDE])$/)?.[1];
  const source = src === '성취기준' ? state.std?.t : key ? state.std?.[key] : '';
  if (!quote) return '원문 인용 없음 · 가설의 근거를 교사가 확인하세요.';
  if (!source || !source.includes(quote)) return '인용 불일치 · 출처와 인용문을 수정하세요.';
  return '탑재 원문과 문구 일치 · 오개념의 발생·원인이나 공식 원문 대조까지 검증한 것은 아닙니다.';
}
function updateEvidenceChecks() {
  $$('#misCards [data-evidence-check]').forEach(el => { el.textContent = evidenceCheck(state.map.misconceptions[+el.dataset.evidenceCheck]); });
}
function changedFieldCount(before, after) {
  if (!before || !after) return 0;
  let n = 0;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (['status','note'].includes(key)) continue;
    const a = before[key], b = after[key];
    if (a && b && typeof a === 'object' && typeof b === 'object') n += changedFieldCount(a, b);
    else if (String(a ?? '').trim() !== String(b ?? '').trim()) n++;
  }
  return n;
}
function reviewSummary() {
  const i = state.focusCard || 0;
  const changed = changedFieldCount(state.originalMap?.misconceptions?.[i], state.map?.misconceptions?.[i]);
  const checks = (state.review.checks || []).filter(Boolean).length;
  return `선택 카드 ${i + 1} · 검토 ${checks}/4 · 초안 대비 수정 ${changed}곳 · ${state.review.edits?.trim() ? '판단 이유 기록됨' : '수정/유지/보류 이유를 기록하세요'} · ${state.review.plan?.trim() ? '적용 계획 기록됨' : '적용 계획 미작성'}`;
}
function updateReviewStatus() {
  $('#reviewStatus').textContent = reviewSummary();
}
function renderMap() {
  const m = state.map;
  $('#resTitle').textContent = `${state.concept} — ${state.std.c}`;
  $('#printCardTitle').textContent = `${state.std.g} ${state.std.sub} · ${state.std.c} · ${state.concept} — 검토용 발문 카드`;
  const box = $('#misCards'); box.innerHTML = '';
  (m.misconceptions || []).forEach((mis, i) => {
    const p = `map.misconceptions.${i}`;
    const card = document.createElement('article'); card.className = 'mis';
    card.classList.toggle('focus-card', i === state.focusCard);
    card.innerHTML = `
      <div class="mis-student">
        <label class="focus-choice"><input type="radio" name="focusCard" value="${i}" ${i === state.focusCard ? 'checked' : ''}> 이 카드 집중 검토·인쇄</label>
        <span class="mis-tag">${ed(p + '.type')}</span>
        <div class="mis-statement editable" contenteditable="true" data-bind="${p}.statement"></div>
        <div class="mis-evidence"><b>원문 출처</b> ${ed(p + '.evidence_source')}<br><b>원문 인용</b> ${ed(p + '.evidence_quote')}<p class="evidence-check" data-evidence-check="${i}"></p><b>예상 가설·대안 설명</b> ${ed(p + '.evidence')}</div>
      </div>
      <div class="mis-teacher">
        <div class="mis-small"><b>보여 줄 자료·조건</b> ${ed(p + '.material')}</div>
        <div class="mis-row"><span class="mis-tag">진단 질문</span><div class="mis-small">${ed(p + '.diagnostic_question', 'serif')}</div></div>
        <div class="mis-row"><span class="mis-tag">${ed(p + '.correction_type')}</span>
          <div class="mis-q editable" contenteditable="true" data-bind="${p}.correction_question"></div></div>
        <div class="tree">
          <div class="tree-head">학생 반응에 따라</div>
          ${(mis.responses || []).map((r, k) => `<div class="branch ${branchClass(r.kind)}">
            <span class="branch-kind">${ed(p + '.responses.' + k + '.kind')}</span>
            <div class="branch-says editable" contenteditable="true" data-bind="${p}.responses.${k}.student_says"></div>
            <div class="branch-next"><span class="arrow">↳</span><div class="editable serif" contenteditable="true" data-bind="${p}.responses.${k}.next_question"></div></div>
          </div>`).join('')}
          <div class="mis-small"><b>새 사례에서 확인할 기준</b> ${ed(p + '.mastery')}</div>
        </div>
        <div class="mis-small"><b>확인</b> ${ed(p + '.follow_up')}</div>
        <div class="mis-scene"><b>쓰는 장면</b> ${ed(p + '.scene')}</div>
        <div class="mis-after">
          <div class="row"><b>수업 뒤</b>
            <select data-status="${i}">
              <option value="">아직 수업 전</option>
              <option value="seen">실제로 나왔다</option>
              <option value="unseen">관찰하지 못했다 (없음 확정 아님)</option>
              <option value="unassessed">확인할 기회가 없었다</option>
              <option value="other">다른 오개념이 나왔다</option>
            </select></div>
          <div class="row" style="align-items:flex-start"><span>메모</span>${ed(p + '.note')}</div>
        </div>
      </div>`;
    const sel = card.querySelector('select');
    sel.value = mis.status || '';
    card.classList.toggle('seen', sel.value === 'seen');
    sel.addEventListener('change', () => { mis.status = sel.value; card.classList.toggle('seen', sel.value === 'seen'); });
    card.querySelector('input[name=focusCard]').addEventListener('change', () => {
      state.cardReviews[state.focusCard] = structuredClone(state.review);
      state.focusCard = i;
      state.review = state.cardReviews[i] || { checks: [false,false,false,false], edits: '', plan: '' };
      $$('#misCards .mis').forEach((c, n) => c.classList.toggle('focus-card', n === i));
      $$('#blkReview input[type=checkbox]').forEach(cb => { cb.checked = !!state.review.checks[+cb.dataset.review]; });
      bindAll($('#blkReview'));
      updateReviewStatus();
    });
    box.appendChild(card);
  });
  // 검토 체크
  $$('#blkReview input[type=checkbox]').forEach(cb => { cb.checked = !!state.review.checks[+cb.dataset.review]; });
  bindAll();
  updateEvidenceChecks(); updateReviewStatus();
}

function renderLesson() {
  const L = state.lesson;
  const lv = levelOf(state.std.g);
  $('#lessonMin').textContent = `(${lv.minutes}분 기준 · ${state.lessonMode === 'deductive' ? '연역 안내 후 범례 확인' : '귀납적 개념 획득'})`;
  $('#blkLesson h3').textContent = state.lessonMode === 'deductive' ? '연역 안내 후 범례 확인 차시안' : '귀납적 개념 획득 차시안';
  $('.lesson-lead').textContent = state.lessonMode === 'deductive' ? '정의·약속을 짧게 안내한 뒤 → 여러 예시와 가까운 비예시에 적용해 판단하고 → 갈리는 사례에서 속성을 확인한 뒤 → 자기 말로 정의를 다시 씁니다.' : '예시와 비예시를 먼저 보고 → 공통 특징을 찾고 → 학생 말로 정의를 만든 뒤 → 교과 정의와 맞춥니다. 필요한 안내를 제공하며, 탐색 뒤 정의를 정리합니다.';
  const li = (arr, path) => arr.map((_, i) => `<li><div class="item editable" contenteditable="true" data-bind="${path}.${i}.item"></div><div class="why editable" contenteditable="true" data-bind="${path}.${i}.note"></div></li>`).join('');
  $('#exList').innerHTML = li(L.examples || [], 'lesson.examples');
  $('#nonList').innerHTML = li(L.nonexamples || [], 'lesson.nonexamples');
  $('#attrList').innerHTML = (L.attributes || []).map((_, i) => `<div class="attr"><div class="a editable" contenteditable="true" data-bind="lesson.attributes.${i}.attribute"></div><div class="q editable" contenteditable="true" data-bind="lesson.attributes.${i}.eliciting_question"></div></div>`).join('');
  $('#flowTable tbody').innerHTML = (L.flow || []).map((_, i) => `<tr>
    <td>${ed(`lesson.flow.${i}.phase`)}</td><td>${ed(`lesson.flow.${i}.minutes`)}</td>
    <td>${ed(`lesson.flow.${i}.teacher`)}</td><td>${ed(`lesson.flow.${i}.students`)}</td><td>${ed(`lesson.flow.${i}.materials`)}</td></tr>`).join('');
  bindAll();
}

/* ---------- 내보내기 ---------- */
function toMarkdown() {
  const s = state.std, m = state.map, L = state.lesson;
  const out = [];
  out.push(`# ${state.concept} — 오개념·발문 지도`);
  out.push(`${s.g} ${s.s}${s.s !== s.sub ? ' / ' + s.sub : ''} · ${s.a}`);
  out.push(`**${s.c}** ${s.t}`);
  out.push('');
  out.push('## 성취수준');
  for (const k of ['A', 'B', 'C', 'D', 'E']) if (s[k]) out.push(`- ${k}: ${s[k]}`);
  if (state.coreSelected.length) { out.push('', '## 핵심아이디어'); for (const it of state.coreSelected) out.push(`- (${it.id}) ${it.text}`); }
  if (m) {
    if (m.approach) out.push('', `## 도입 방식: ${m.approach.mode}`, m.approach.reason || '');
    out.push('', '## 개념');
    out.push(`- 학생 언어로: ${m.concept?.student_definition || ''}`);
    out.push(`- 교과 정의: ${m.concept?.formal_definition || ''}`);
    out.push(`- 핵심아이디어와의 연결: ${m.concept?.core_idea_link || ''}`);
    out.push('', '## 예상 오개념과 교정 발문');
    (m.misconceptions || []).forEach((x, i) => {
      out.push(`### ${i + 1}. "${x.statement}" (${x.type})`);
      out.push(`- 원문 출처: ${x.evidence_source || '별도 확인 필요'}`);
      out.push(`- 원문 인용: ${x.evidence_quote || '없음'}`);
      out.push(`- 인용 대조: ${evidenceCheck(x)}`);
      out.push(`- 예상 가설·대안 설명: ${x.evidence}`);
      out.push(`- 자료·조건: ${x.material || ''}`);
      out.push(`- 진단 질문: ${x.diagnostic_question}`);
      out.push(`- 교정 발문 (${x.correction_type}): ${x.correction_question}`);
      (x.responses || []).forEach(r => out.push(`  - [${r.kind}] "${r.student_says}" → ${r.next_question}`));
      if (x.mastery) out.push(`- 벗어났다고 보는 기준: ${x.mastery}`);
      out.push(`- 확인: ${x.follow_up}`);
      if (x.scene) out.push(`- 쓰는 장면: ${x.scene}`);
      if (x.status || x.note) out.push(`- 수업 뒤: ${({seen:'실제로 나왔다',unseen:'관찰하지 못했다 (없음 확정 아님)',unassessed:'확인할 기회가 없었다',other:'다른 오개념이 나왔다'})[x.status] || '미기록'}${x.note ? ' — ' + x.note : ''}`);
    });
    out.push('', `수업에서 쓰는 방법: ${m.teaching_note || ''}`);
    const labels = ['원문 인용과 예상 가설을 구분했는가','학생의 말·조건·대안 원인을 확인했는가','발문이 한 판단과 이유를 드러내는가','유지 반응에 다른 지원과 새 사례 확인이 있는가'];
    out.push('', '## 검토', ...labels.map((l, i) => `- [${state.review.checks[i] ? 'x' : ' '}] ${l}`));
    if (state.review.edits) out.push(`- 고친 곳: ${state.review.edits}`);
    out.push(`- 검토 상태: ${reviewSummary()}`, `- 다음 수업 적용: ${state.review.plan || '미작성'}`);
    Object.entries(state.cardReviews || {}).forEach(([i, r]) => {
      if (+i !== state.focusCard) out.push(`- 카드 ${+i + 1} 검토 기록: ${r.edits || '미작성'} / 적용 계획: ${r.plan || '미작성'}`);
    });
  }
  if (L) {
    out.push('', `## ${state.lessonMode === 'deductive' ? '연역 안내 후 범례 확인' : '귀납적 개념 획득'} 차시안`);
    out.push('### 예시'); (L.examples || []).forEach(e => out.push(`- ${e.item} — ${e.note}`));
    out.push('### 비예시'); (L.nonexamples || []).forEach(e => out.push(`- ${e.item} — ${e.note}`));
    out.push('### 특징과 질문'); (L.attributes || []).forEach(a => out.push(`- ${a.attribute}: ${a.eliciting_question}`));
    out.push(`- 학생 정의(예상): ${L.definition_student}`, `- 교과 정의: ${L.definition_formal}`);
    out.push('### 차시 흐름', '| 단계 | 분 | 교사 | 학생 | 준비물 |', '|---|---|---|---|---|');
    (L.flow || []).forEach(f => out.push(`| ${f.phase} | ${f.minutes} | ${f.teacher} | ${f.students} | ${f.materials} |`));
    out.push(`- 이해 확인: ${L.check}`);
  }
  return out.join('\n');
}
async function copyText() {
  try { await navigator.clipboard.writeText(toMarkdown()); setStatus('복사했습니다. 한글·구글문서에 붙여 넣으세요.'); }
  catch (_) { setStatus('복사에 실패했습니다. 인쇄 / PDF를 이용하세요.', 'err'); }
}

/* ---------- 저장/불러오기 ---------- */
function savedAll() { try { const list = JSON.parse(localStorage.getItem('chg:saved') || '[]'); return Array.isArray(list) ? list : []; } catch (_) { return []; } }
function saveCurrent() {
  if (!state.map) return;
  const list = savedAll();
  const item = { id: Date.now(), title: `${state.concept} — ${state.std.c}`, ts: new Date().toISOString(),
    data: { stdCode: state.std.c, stdGrade: state.std.g, coreSelected: state.coreSelected, concept: state.concept, context: state.context, map: state.map, lesson: state.lesson, lessonMode: state.lessonMode, review: state.review, originalMap: state.originalMap, focusCard: state.focusCard, cardReviews: state.cardReviews } };
  list.unshift(item);
  try {
    localStorage.setItem('chg:saved', JSON.stringify(list.slice(0, 50)));
    setStatus('이 브라우저에 저장했습니다. 저장 목록의 「파일」로 별도 보관할 수 있습니다.');
  } catch (_) { setStatus('브라우저 저장 공간이 부족하거나 저장이 차단되었습니다. 텍스트 복사나 인쇄로 보관하세요.', 'err'); }
}
function loadItem(item) {
  const d = item.data;
  validateMap(d?.map);
  const std = STD.find(x => x.c === d.stdCode && x.g === d.stdGrade) || STD.find(x => x.c === d.stdCode);
  if (!std) { setStatus('저장된 성취기준을 찾을 수 없습니다.', 'err'); return; }
  const lv = levelOf(std.g);
  $('#selLevel').value = lv.id; onLevelChange();
  $('#selGrade').value = std.g; onGradeChange();
  $('#selSubject').value = std.s; onSubjectChange();
  $('#selCourse').value = std.sub; onCourseChange();
  $('#selArea').value = std.a || '(영역 없음)'; onAreaChange();
  $('#selStd').value = std.c; onStdPick();
  state.coreSelected = std.g === '고등학교' ? [] : (d.coreSelected || []);
  $$('#evCore input').forEach(cb => { const on = state.coreSelected.some(x => x.id === cb.dataset.id); cb.checked = on; cb.closest('label').classList.toggle('picked', on); });
  state.concept = d.concept; $('#inpConcept').value = d.concept;
  state.context = d.context || ''; $('#inpContext').value = state.context;
  state.map = d.map; state.lesson = d.lesson; state.lessonMode = d.lessonMode || 'inductive';
  state.review = { checks: [false,false,false,false], edits: '', plan: '', ...(d.review || {}) };
  state.originalMap = d.originalMap || structuredClone(d.map);
  state.focusCard = Number.isInteger(d.focusCard) && d.focusCard >= 0 && d.focusCard < d.map.misconceptions.length ? d.focusCard : 0;
  state.cardReviews = d.cardReviews || {};
  renderMap(); $('#result').classList.remove('hidden');
  if (state.lesson) { renderLesson(); $('#blkLesson').classList.remove('hidden'); $('#btnPresent').disabled = false; }
  else { $('#blkLesson').classList.add('hidden'); $('#btnPresent').disabled = true; }
  $('#dlgSaved').close();
  setStatus('불러왔습니다.');
}
function renderSaved() {
  const ul = $('#savedList'); ul.innerHTML = '';
  const list = savedAll();
  if (!list.length) { ul.innerHTML = '<li class="saved-empty">아직 저장한 지도가 없습니다.</li>'; return; }
  for (const it of list) {
    const li = document.createElement('li');
    li.innerHTML = `<div><div class="t">${esc(it.title)}</div><div class="d">${new Date(it.ts).toLocaleString('ko-KR')}</div></div>
      <div class="acts"><button type="button" data-a="load">열기</button> <button type="button" data-a="dl">파일</button> <button type="button" data-a="del">삭제</button></div>`;
    li.querySelector('[data-a=load]').addEventListener('click', () => loadItem(it));
    li.querySelector('[data-a=dl]').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(it, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${it.title}.json`; a.click();
    });
    li.querySelector('[data-a=del]').addEventListener('click', () => {
      localStorage.setItem('chg:saved', JSON.stringify(savedAll().filter(x => x.id !== it.id))); renderSaved();
    });
    ul.appendChild(li);
  }
}

/* ---------- 제시 모드 ---------- */
const pres = { items: [], i: 0, revealed: false };
function openPresent() {
  const L = state.lesson; if (!L) return;
  const items = [...(L.examples || []).map(e => ({ ...e, yes: true })), ...(L.nonexamples || []).map(e => ({ ...e, yes: false }))];
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  pres.items = items; pres.i = 0; pres.revealed = false;
  $('#presentConcept').textContent = state.concept;
  $('#present').classList.remove('hidden'); $('#present').focus();
  showPres();
}
function showPres() {
  const it = pres.items[pres.i]; if (!it) return;
  $('#presentCount').textContent = `${pres.i + 1} / ${pres.items.length}`;
  $('#presentItem').textContent = it.item;
  const ans = $('#presentAnswer');
  ans.textContent = (it.yes ? '예시 — ' : '비예시 — ') + (it.note || '');
  ans.className = 'present-answer ' + (it.yes ? 'yes' : 'no') + (pres.revealed ? '' : ' hidden');
}
function presNav(d) { pres.i = (pres.i + d + pres.items.length) % pres.items.length; pres.revealed = false; showPres(); }

/* ---------- 초기화 ---------- */
function openPractice(manual = false) {
  if (manual && !state.std) { setStatus('먼저 성취기준을 고르세요.', 'err'); return; }
  const p = manual ? null : PRACTICE[$('#selPractice').value];
  const std = manual ? state.std : STD.find(s => s.c === p.code);
  const concept = manual ? ($('#inpConcept').value.trim() || '핵심 개념을 입력하세요') : p.concept;
  const blank = { statement:'', type:'판단 보류', evidence_source:'성취기준', evidence_quote:std.t, evidence:'원문에서 확인할 개념 요소와 예상 가설을 구별해 적으세요.', material:'', diagnostic_question:'', correction_type:'', correction_question:'', responses:['이해','부분 이해','오개념 유지'].map(kind => ({kind, student_says:'', next_question:''})), mastery:'', follow_up:'', scene:'' };
  const map = {
    approach: { mode: p?.mode || '교사 판단', reason: p?.reason || '목표·사전지식·자료·시간을 기준으로 판단하세요.' },
    concept: {name:concept, student_definition:p?.student_definition || '', formal_definition:p?.formal_definition || '', core_idea_link:'이 카드에서는 핵심아이디어를 별도로 연결하지 않았습니다.'},
    misconceptions: [p ? {...structuredClone(p), evidence_source:'성취기준', evidence_quote:std.t} : blank],
    teaching_note: '먼저 판단 이유를 듣습니다. 확인된 이유에 맞춰 자료·발문·설명을 조정합니다. 새 사례의 응답을 기록하고, 관찰하지 못한 것을 오개념이 없다는 뜻으로 해석하지 않습니다.'
  };
  loadItem({data:{stdCode:std.c, stdGrade:std.g, concept, context:manual ? $('#inpContext').value : '', map, lesson:null, coreSelected:[]}});
  setStatus(manual ? '직접 작성 카드입니다. 빈칸을 채우고 저장하세요.' : '미리 작성한 연습 카드입니다. 실제 학생 진단·AI 출력이 아닙니다. 수정·유지·보류의 이유를 남기세요.');
}
function printCard() {
  document.body.classList.add('print-card');
  window.print();
}
window.addEventListener('afterprint', () => document.body.classList.remove('print-card'));
async function init() {
  setStatus('교육과정 자료를 불러오는 중', 'busy');
  const [a, b] = await Promise.all([fetch('data/standards.json').then(r => r.json()), fetch('data/core_ideas.json').then(r => r.json())]);
  STD = a; CORE = b;
  initSelectors();
  setStatus('');

  $('#selLevel').addEventListener('change', onLevelChange);
  $('#selGrade').addEventListener('change', onGradeChange);
  $('#selSubject').addEventListener('change', onSubjectChange);
  $('#selCourse').addEventListener('change', onCourseChange);
  $('#selArea').addEventListener('change', onAreaChange);
  $('#selStd').addEventListener('change', onStdPick);
  $('#inpSearch').addEventListener('input', onSearch);
  $('#btnSuggest').addEventListener('click', suggestConcepts);
  $('#btnGenerate').addEventListener('click', generateMap);
  $('#inpConcept').addEventListener('input', () => { state.concept = $('#inpConcept').value; });
  $('#btnLesson').addEventListener('click', () => generateLesson('inductive'));
  $('#btnLessonDed').addEventListener('click', () => generateLesson('deductive'));
  $$('.regen').forEach(b => b.addEventListener('click', () => b.dataset.part === 'lesson' ? generateLesson(state.lessonMode) : generateMap()));
  $('#btnCopy').addEventListener('click', copyText);
  $('#btnPrint').addEventListener('click', () => { document.body.classList.remove('print-card'); window.print(); });
  $('#btnPrintCard').addEventListener('click', printCard);
  $('#btnPractice').addEventListener('click', () => openPractice());
  $('#btnManual').addEventListener('click', () => openPractice(true));
  $('#btnSave').addEventListener('click', saveCurrent);

  $$('#blkReview input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => { state.review.checks[+cb.dataset.review] = cb.checked; updateReviewStatus(); }));
  $('#btnHelp').addEventListener('click', () => $('#dlgHelp').showModal());
  $('#btnCloseHelp').addEventListener('click', () => $('#dlgHelp').close());
  // 설정
  $('#btnSettings').addEventListener('click', () => { $('#inpKey').value = getKey(); fillModels(null, ''); $('#inpModel').value = ''; $('#dlgSettings').showModal(); });
  $('#btnModels').addEventListener('click', loadModels);
  $('#btnSaveKey').addEventListener('click', () => {
    localStorage.setItem('chg:key', $('#inpKey').value.trim());
    const custom = $('#inpModel').value.trim();
    localStorage.setItem('chg:model', custom || $('#selModel').value);
    setStatus(`저장했습니다. 모델: ${getModel()}`);
  });
  // 저장 목록
  $('#btnSaved').addEventListener('click', () => { renderSaved(); $('#dlgSaved').showModal(); });
  $('#btnCloseSaved').addEventListener('click', () => $('#dlgSaved').close());
  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const it = JSON.parse(await f.text()); loadItem(it); } catch (_) { setStatus('파일을 읽을 수 없습니다.', 'err'); }
    e.target.value = '';
  });
  // 제시 모드
  $('#btnPresent').addEventListener('click', openPresent);
  $('#btnPresentClose').addEventListener('click', () => $('#present').classList.add('hidden'));
  $('#btnPrev').addEventListener('click', () => presNav(-1));
  $('#btnNext').addEventListener('click', () => presNav(1));
  $('#btnReveal').addEventListener('click', () => { pres.revealed = !pres.revealed; showPres(); });
  document.addEventListener('keydown', (e) => {
    if ($('#present').classList.contains('hidden')) return;
    if (e.key === 'Escape') $('#present').classList.add('hidden');
    else if (e.key === 'ArrowRight') presNav(1);
    else if (e.key === 'ArrowLeft') presNav(-1);
    else if (e.key === ' ') { e.preventDefault(); pres.revealed = !pres.revealed; showPres(); }
  });
  if (!getKey()) setStatus('키 없이 연습·직접 작성이 가능합니다. AI 생성은 「API 키 설정」 후 이용하세요.');
}
init().catch(e => setStatus('자료를 불러오지 못했습니다: ' + e.message, 'err'));
