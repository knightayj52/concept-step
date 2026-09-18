const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function app() {
  const storage = new Map();
  const ctx = vm.createContext({ structuredClone, AbortSignal, window: { addEventListener() {} },
    localStorage: { getItem:k=>storage.get(k) ?? null, setItem:(k,v)=>storage.set(k,v) } });
  const code = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/^init\(\)\.catch.*$/m, '');
  vm.runInContext(code, ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'practice.js'), 'utf8'), ctx);
  ctx.standards = JSON.parse(fs.readFileSync(path.join(root, 'data/standards.json')));
  ctx.cores = JSON.parse(fs.readFileSync(path.join(root, 'data/core_ideas.json')));
  vm.runInContext('STD = standards; CORE = cores;', ctx);
  return { ctx, run:code=>vm.runInContext(code,ctx), storage };
}
test('고등의 모든 과목에서 초중 핵심아이디어가 섞이지 않는다', () => {
  const a=app();
  assert.equal(a.run("STD.filter(s=>s.g==='고등학교').every(s=>coreGroupsFor(s).length===0)"), true);
  assert.equal(a.run("coreGroupsFor(STD.find(s=>s.c==='[4수01-09]')).length>0"), true);
});
test('기존 모델을 임의 교체하지 않는다', () => {
  const a=app(); a.storage.set('chg:model','gemini-2.5-flash');
  assert.equal(a.run('getModel()'),'gemini-2.5-flash');
});
test('근거 대조는 실제 출처의 연속 구절만 일치로 표시한다', () => {
  const a=app(); a.run("state.std=STD.find(s=>s.c==='[4수01-09]');");
  assert.match(a.run("evidenceCheck({evidence_source:'성취수준 C',evidence_quote:state.std.C})"),/문구 일치/);
  assert.match(a.run("evidenceCheck({evidence_source:'성취수준 C',evidence_quote:'등분의 의미를 이해하지 못한다'})"),/불일치/);
  assert.match(a.run("evidenceCheck({evidence_source:'성취수준 E',evidence_quote:state.std.C})"),/불일치/);
  assert.match(a.run('evidenceCheck({evidence:"옛 저장 자료"})'),/인용 없음/);
});
test('세 학교급 연습 카드의 성취기준이 실제 데이터에 존재한다', () => {
  const a=app();
  assert.equal(a.run('Object.values(PRACTICE).every(p=>STD.some(s=>s.c===p.code))'),true);
  assert.equal(a.run('Object.values(PRACTICE).every(p=>p.responses.length===3 && p.material && p.follow_up)'),true);
});
test('빈 응답 또는 잘못된 AI 지도는 기존 지도에 적용하기 전에 거절한다', () => {
  const a=app();
  for (const candidate of ['null','{}','{concept:{},misconceptions:[]}','{concept:{},misconceptions:[{responses:null}]}']) {
    assert.throws(()=>a.run(`validateMap(${candidate})`),/지도 형식/);
  }
  assert.equal(a.run("validateMap({concept:{},misconceptions:[{statement:'검토',responses:[]}]}) .misconceptions.length"),1);
});
test('수업 후 기록과 공백만의 수정은 발문 수정 수를 부풀리지 않는다', () => {
  const a=app();
  assert.equal(a.run("changedFieldCount({statement:'원문',note:'',status:''},{statement:' 원문 ',note:'관찰함',status:'seen'})"),0);
  assert.equal(a.run("changedFieldCount({statement:'원문',responses:[{next_question:'왜?'}]},{statement:'수정',responses:[{next_question:'무엇을 비교했니?'}]})"),2);
});
test('복사 결과에 선택 카드 검토·적용 계획과 연역 차시안 제목을 보존한다', () => {
  const a=app();
  a.run(`state.std=STD.find(s=>s.c==='[4수01-09]');state.concept='분수';
    state.map={concept:{},misconceptions:[{statement:'세 조각',type:'가설',responses:[],note:'확인 기회 없음',status:'unassessed'}]};
    state.lesson={};state.lessonMode='deductive';state.review={checks:[true,false,false,false],edits:'근거를 수정함',plan:'월요일 도입에서 확인'};`);
  const text=a.run('toMarkdown()');
  assert.match(text,/연역 안내 후 범례 확인 차시안/);
  assert.match(text,/월요일 도입에서 확인/);
  assert.match(text,/확인할 기회가 없었다/);
  assert.doesNotMatch(text,/## 귀납적 개념 획득 차시안/);
});
test('고등 프롬프트에는 초중 핵심아이디어가 포함되지 않는다', () => {
  const a=app();a.run("state.std=STD.find(s=>s.c==='[12경제02-02]');state.concept='공공재';");
  const prompt=a.run('promptMap()');
  assert.match(prompt,/핵심아이디어\] 자료 없음/);
  assert.match(prompt,/서술에 없는 능력을 없다고 단정하지 않는다/);
});
