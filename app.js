/* 개념 한 걸음 — app.js
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
  const g = currentGrade(), s = $('#selSubject').value, sub = $('#selCourse').value;
  let a = $('#selArea').value; if (a === '(영역 없음)') a = '';
  const list = STD.filter(d => d.g === g && d.s === s && d.sub === sub && d.a === a);
  fillSelect($('#selStd'), list.map(d => ({ value: d.c, label: `${d.c} ${d.t}` })));
  $('#inpSearch').value = '';
}
function onSearch() {
  const q = $('#inpSearch').value.trim();
  if (!q) { onAreaChange(); return; }
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
  $('#result').classList.add('hidden');
  renderEvidence();
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
  const names = { A: 'A (상)', B: 'B (중)', C: 'C (하)', D: 'D', E: 'E' };
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
function getModel() { return localStorage.getItem('chg:model') || 'gemini-2.5-flash'; }
async function callGemini(prompt) {
  const key = getKey();
  if (!key) { $('#dlgSettings').showModal(); throw new Error('API 키를 먼저 저장해 주세요.'); }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${getModel()}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, responseMimeType: 'application/json', maxOutputTokens: 8192 },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = `요청 실패 (${res.status})`;
    try { const j = await res.json(); msg += ': ' + (j.error?.message || ''); } catch (_) { }
    if (res.status === 400 || res.status === 403) msg += ' — API 키가 맞는지 확인하세요.';
    if (res.status === 429) msg += ' — 무료 할당량을 잠시 넘었습니다. 조금 뒤 다시 시도하세요.';
    throw new Error(msg);
  }
  const data = await res.json();
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
  lines.push(`  ※ 최하 수준(${lowest}) 서술은 "학생이 어디까지만 할 수 있는가"를 보여 주므로, 오개념·막힘 지점을 예측하는 출발점으로 삼는다.`);
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

const RULES = `너는 한국 교사의 수업 준비를 돕는 교육과정 전문가다. 반드시 아래 교육과정 원문 범위 안에서만 생성하고, 학년 수준에 맞는 어휘를 쓴다. 학생이 실제로 말할 법한 구어체를 쓰고, 교사 발문은 한 문장으로 짧게, 학생이 생각하게 만드는 열린 질문으로 쓴다. 출력은 JSON만, 다른 텍스트 없이.`;

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

과제: 위 성취기준을 다루는 여러 차시에 걸쳐 교사가 교탁에 두고 쓸 "오개념·발문 지도"를 만들어라.
1. 개념을 학생 언어로 된 한 문장 정의와 교과 정의로 정리하고, 선택된 핵심아이디어와 어떻게 이어지는지 한 문장으로 쓴다.
2. 예상 오개념 3개. 각 오개념은 (가) 학생이 실제로 말할 법한 문장, (나) 원인 유형(선개념 / 과잉일반화 / 과소일반화 / 용어 혼동 중 하나), (다) 근거: 성취수준 최하 수준 서술의 어느 부분에서 이 막힘이 예측되는지 해당 구절을 짧게 인용하며 설명, (라) 이 오개념을 드러내는 진단 질문 1개, (마) 교정 발문 유형(반례 제시형 / 모순 유도형 / 근거 요구형 중 원인 유형에 가장 맞는 것)과 실제 발문 1문장, (바) 교정 뒤 이해를 확인하는 짧은 질문 1개.
   - 반례 제시형: 오개념에 어긋나는 사례를 보여 주고 묻는다. 과잉일반화에 특히 맞는다.
   - 모순 유도형: 학생의 말대로라면 생기는 모순을 스스로 발견하게 묻는다. 선개념에 특히 맞는다.
   - 근거 요구형: "왜 그렇게 생각했는지"를 묻고 근거를 점검하게 한다. 용어 혼동·과소일반화에 맞는다.
3. 발문 카드 활용 안내 2~3문장: 도입 차시, 연습 중 순회지도, 평가 후 재지도에서 어떻게 쓰는지.

JSON 형식:
{"concept":{"name":"${state.concept}","student_definition":"","formal_definition":"","core_idea_link":""},
 "misconceptions":[{"statement":"","type":"","evidence":"","diagnostic_question":"","correction_type":"","correction_question":"","follow_up":""}],
 "teaching_note":""}`;
}

function promptLesson() {
  const lv = levelOf(state.std.g);
  const mis = (state.map?.misconceptions || []).map(m => `- ${m.statement} (${m.type})`).join('\n');
  return `${RULES}

${curriculumBlock()}

[핵심 개념] ${state.concept}
[이미 예측한 오개념]
${mis}

과제: 이 개념을 처음 도입하는 ${lv.minutes}분 차시를 "귀납적 개념 획득" 방식으로 설계하라. 학생은 예시와 비예시를 먼저 보고, 공통 특징을 스스로 찾고, 자기 말로 정의를 만든 뒤, 마지막에 교과 정의와 맞춘다. 정의를 먼저 알려주지 않는다.
1. 예시 5개: 학생에게 친숙하고 개념의 필수 속성이 잘 드러나는 것. 각각 왜 예시인지 한 구절.
2. 비예시 5개: "가까운 비예시" 위주 — 위에 예측한 오개념을 가진 학생이 예시라고 착각할 만한 것. 각각 어떤 속성이 빠져서 비예시인지 한 구절.
3. 학생이 발견해야 할 필수 속성 3~4개와, 각각을 끌어내는 교사 질문 1문장.
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
async function suggestConcepts() {
  if (!state.std) { setStatus('먼저 성취기준을 고르세요.', 'err'); return; }
  setStatus('개념 후보를 찾는 중', 'busy');
  $('#btnSuggest').disabled = true;
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
  finally { $('#btnSuggest').disabled = false; }
}

async function generateMap() {
  if (!state.std) { setStatus('먼저 성취기준을 고르세요.', 'err'); return; }
  state.concept = $('#inpConcept').value.trim();
  state.context = $('#inpContext').value;
  if (!state.concept) { setStatus('개념을 입력하거나 후보에서 고르세요.', 'err'); $('#inpConcept').focus(); return; }
  setStatus('오개념·발문 지도를 만드는 중 (20초 안팎)', 'busy');
  $('#btnGenerate').disabled = true;
  try {
    state.map = await callGemini(promptMap());
    state.lesson = null; $('#blkLesson').classList.add('hidden'); $('#btnPresent').disabled = true;
    renderMap();
    $('#result').classList.remove('hidden');
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus('완성. 본문을 눌러 바로 고칠 수 있습니다.');
  } catch (e) { setStatus(e.message, 'err'); }
  finally { $('#btnGenerate').disabled = false; }
}

async function generateLesson() {
  if (!state.map) return;
  setStatus('차시안을 만드는 중 (20초 안팎)', 'busy');
  $('#btnLesson').disabled = true;
  try {
    state.lesson = await callGemini(promptLesson());
    renderLesson();
    $('#blkLesson').classList.remove('hidden');
    $('#btnPresent').disabled = false;
    $('#blkLesson').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus('차시안 완성.');
  } catch (e) { setStatus(e.message, 'err'); }
  finally { $('#btnLesson').disabled = false; }
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
      el.addEventListener('input', () => setPath(state, el.dataset.bind, el.textContent));
    }
  });
}
function ed(path, cls = '') { return `<span class="editable ${cls}" contenteditable="true" data-bind="${path}"></span>`; }

function renderMap() {
  const m = state.map;
  $('#resTitle').textContent = `${state.concept} — ${state.std.c}`;
  const box = $('#misCards'); box.innerHTML = '';
  (m.misconceptions || []).forEach((mis, i) => {
    const p = `map.misconceptions.${i}`;
    const card = document.createElement('article'); card.className = 'mis';
    card.innerHTML = `
      <div class="mis-student">
        <span class="mis-tag">${ed(p + '.type')}</span>
        <div class="mis-statement editable" contenteditable="true" data-bind="${p}.statement"></div>
        <div class="mis-evidence"><b>근거</b> ${ed(p + '.evidence')}</div>
      </div>
      <div class="mis-teacher">
        <div class="mis-row"><span class="mis-tag">진단 질문</span><div class="mis-small">${ed(p + '.diagnostic_question', 'serif')}</div></div>
        <div class="mis-row"><span class="mis-tag">${ed(p + '.correction_type')}</span>
          <div class="mis-q editable" contenteditable="true" data-bind="${p}.correction_question"></div></div>
        <div class="mis-small"><b>확인</b> ${ed(p + '.follow_up')}</div>
      </div>`;
    box.appendChild(card);
  });
  bindAll();
}

function renderLesson() {
  const L = state.lesson;
  const lv = levelOf(state.std.g);
  $('#lessonMin').textContent = `(${lv.minutes}분 기준)`;
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
    out.push('', '## 개념');
    out.push(`- 학생 언어로: ${m.concept?.student_definition || ''}`);
    out.push(`- 교과 정의: ${m.concept?.formal_definition || ''}`);
    out.push(`- 핵심아이디어와의 연결: ${m.concept?.core_idea_link || ''}`);
    out.push('', '## 예상 오개념과 교정 발문');
    (m.misconceptions || []).forEach((x, i) => {
      out.push(`### ${i + 1}. "${x.statement}" (${x.type})`);
      out.push(`- 근거: ${x.evidence}`);
      out.push(`- 진단 질문: ${x.diagnostic_question}`);
      out.push(`- 교정 발문 (${x.correction_type}): ${x.correction_question}`);
      out.push(`- 확인: ${x.follow_up}`);
    });
    out.push('', `발문 카드 활용: ${m.teaching_note || ''}`);
  }
  if (L) {
    out.push('', '## 귀납적 개념 획득 차시안');
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
function savedAll() { try { return JSON.parse(localStorage.getItem('chg:saved') || '[]'); } catch (_) { return []; } }
function saveCurrent() {
  if (!state.map) return;
  const list = savedAll();
  const item = { id: Date.now(), title: `${state.concept} — ${state.std.c}`, ts: new Date().toISOString(),
    data: { stdCode: state.std.c, stdGrade: state.std.g, coreSelected: state.coreSelected, concept: state.concept, context: state.context, map: state.map, lesson: state.lesson } };
  list.unshift(item);
  localStorage.setItem('chg:saved', JSON.stringify(list.slice(0, 50)));
  setStatus('이 브라우저에 저장했습니다.');
}
function loadItem(item) {
  const d = item.data;
  const std = STD.find(x => x.c === d.stdCode && x.g === d.stdGrade) || STD.find(x => x.c === d.stdCode);
  if (!std) { setStatus('저장된 성취기준을 찾을 수 없습니다.', 'err'); return; }
  const lv = levelOf(std.g);
  $('#selLevel').value = lv.id; onLevelChange();
  $('#selGrade').value = std.g; onGradeChange();
  $('#selSubject').value = std.s; onSubjectChange();
  $('#selCourse').value = std.sub; onCourseChange();
  $('#selArea').value = std.a || '(영역 없음)'; onAreaChange();
  $('#selStd').value = std.c; onStdPick();
  state.coreSelected = d.coreSelected || [];
  $$('#evCore input').forEach(cb => { const on = state.coreSelected.some(x => x.id === cb.dataset.id); cb.checked = on; cb.closest('label').classList.toggle('picked', on); });
  state.concept = d.concept; $('#inpConcept').value = d.concept;
  state.context = d.context || ''; $('#inpContext').value = state.context;
  state.map = d.map; state.lesson = d.lesson;
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
  $('#btnLesson').addEventListener('click', generateLesson);
  $$('.regen').forEach(b => b.addEventListener('click', () => b.dataset.part === 'lesson' ? generateLesson() : generateMap()));
  $('#btnCopy').addEventListener('click', copyText);
  $('#btnPrint').addEventListener('click', () => window.print());
  $('#btnSave').addEventListener('click', saveCurrent);

  // 설정
  $('#btnSettings').addEventListener('click', () => { $('#inpKey').value = getKey(); $('#selModel').value = getModel(); $('#dlgSettings').showModal(); });
  $('#btnSaveKey').addEventListener('click', () => { localStorage.setItem('chg:key', $('#inpKey').value.trim()); localStorage.setItem('chg:model', $('#selModel').value); setStatus('API 키를 저장했습니다.'); });
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
  if (!getKey()) setStatus('오른쪽 위 「API 키 설정」에서 Gemini 키를 먼저 넣어 주세요.');
}
init().catch(e => setStatus('자료를 불러오지 못했습니다: ' + e.message, 'err'));
