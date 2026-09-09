# 개념 한 걸음

2022 개정 교육과정 성취기준·성취수준·핵심아이디어를 근거로 「오개념·발문 지도」와 「귀납적 개념 획득 차시안」을 만드는 교사용 도구입니다.

## 올리는 방법 (GitHub Pages)
1. GitHub에 새 저장소를 만들고 이 폴더의 파일을 그대로 올립니다. (index.html, app.js, style.css, data/)
2. Settings → Pages → Branch를 main / (root)로 두고 저장합니다.
3. 잠시 뒤 `https://아이디.github.io/저장소이름/` 에서 열립니다.

## 사용 준비
- Google AI Studio(https://aistudio.google.com/app/apikey)에서 Gemini API 키를 발급받아, 앱 오른쪽 위 「API 키 설정」에 넣습니다. 키는 사용자의 브라우저에만 저장됩니다.

## 데이터
- data/standards.json — 초·중·고 성취기준 2,217개와 성취수준(초 A~C, 중·고 A~E)
- data/core_ideas.json — 공통교육과정(초1~중3) 핵심아이디어 46개 영역 153항목
- 초·중 사회·과학처럼 성취기준 영역명이 핵심아이디어 영역명과 다른 교과는 자동 연결 대신 교사가 체크하거나, 비워 두면 AI가 관련 항목을 골라 인용합니다.

## 데이터 갱신
스프레드시트를 고친 뒤 같은 열 구조로 JSON을 다시 내보내면 됩니다. 키: g(학년군) s(교과) sub(과목) a(영역) c(코드) t(성취기준) A~E(성취수준)
