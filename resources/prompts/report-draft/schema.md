경평 초안 AI 답의 필드 설명입니다(구조화 출력 JSON 스키마의 description으로 갑니다). 필드 구조·종류 목록(블록 종류·이야기 틀)은 코드(lib/reports/blocks.ts·section.ts)가 정하고, 여기에는 뜻과 채우는 법만 씁니다.
절 이름(「<!-- @이름 -->」)은 필드 경로입니다 — block.* = 블록 한 개의 필드. 절을 지우거나 이름을 바꾸면 불러올 때 오류가 납니다.

<!-- @title -->
소항목 제목 한 줄(명사구 — 글자 수는 요청 머리 「소항목 제목」의 한글 N자 안: 앱이 표지·갈래 칩·마커 칩을 붙여 판면 폭 한 줄에 놓으므로 칩이 많을수록 짧게. 수단(…로·…을 통한) + 대상 + 결과 명사. 분야가 나뉘면 [분야] 머리, 인상적인 원문 문구가 있으면 “…” 머리)

<!-- @story -->
이 소항목의 이야기 틀(적응문 5항) — 형제 소항목과 되도록 다르게

<!-- @blocks -->
블록을 이야기 순서대로(3~8개). 라벨이 있는 연속 블록은 사다리 표의 행, 라벨 없는 블록은 전폭

<!-- @results -->
추진성과 불릿 1~3개(각 1줄 55자 안팎, 「수단으로 결과 지표 변화」) — 2025 소항목 62개 중 53개가 불릿

<!-- @resultCards -->
3칸 추진성과 — 수치가 뚜렷한 세 갈래가 있을 때만(2025에서 1개뿐). 대개 빈 배열. 칸마다 tag 갈래 이름 10자 안(시점·괄호는 넣지 않음), headline 결과 한 줄 38자 안(【확인: …】 자리표시도 이 안에), figure 큰 수치 한 마디(「96% 단축」) — 넘치면 앱이 잘라 냅니다

<!-- @resultChart -->
추진성과 막대(곁들임 — 추진성과 불릿 오른쪽 42mm): 같은 결과 지표의 시점별 값 막대 2~4개. label = 시점(’24년·’25년·’26.8·기존·개선), value = 근거 수치 그대로, title = 지표 이름, badge = 증감 표현(근거에 있을 때만). 값이 모두 근거에 있을 때만 — 올해 값이 없으면 막대를 쓰지 않습니다. 3칸 추진성과와 함께 쓰지 않습니다. 쓰지 않으면 series를 빈 배열로

<!-- @resultBand -->
추진성과 강조 띠(곁들임 — 상자 오른쪽 끝 칩, 24자 안): 평가위원이 기억할 변화 하나(예: 「C → B」 등급 향상!·처리 시간 「1.6시간」 단축!). 숫자·등급이 근거에 있을 때만, 소항목에 하나. 막대(resultChart)를 쓰면 띠 대신 막대 badge에 적습니다. 없으면 빈 문자열

<!-- @caption -->
이 소항목 도식 설명 한 줄(화면 읽기용)

<!-- @block.kind -->
블록 종류(적응문 「블록 사전」)

<!-- @block.label -->
왼쪽 라벨 = 이야기 단계 이름(10자 안팎, 예: 추진배경·Step 1 민관 협력·’25년 개발·핵심이슈·해결책 마련·국민 의견수렴). 전폭 블록은 빈 문자열 — 다만 라벨·머리·칸 머리·칩이 하나도 없는 맨 상자는 무엇을 말하는지 안 보이므로 만들지 않습니다: 상자형 도식(cards·timeline·hub·define)을 전폭으로 두면 블록 머리(title)를 꼭 쓰고, band는 라벨을, quotes는 칸 head(인용 제목)를 꼭 씁니다

<!-- @block.title -->
블록 머리(없으면 빈 문자열). define은 탭 글(「…란?」「왜 …?」), case는 사례 제목. 전후 비교(compare)·표(table)·칸 도식의 머리는 「무엇을」(대상 명사)이 든 한 줄로 쓰고, 라벨·표 머리(기존·개선·As-Is·To-Be)가 이미 전후를 말하면 빈 문자열로 둡니다. 「A → B」는 양쪽이 같은 대상을 가리킬 때만 씁니다(고정형 OTA → 이동형 OTA) — 대상이 다른 두 말을 화살표로만 잇거나(✗ 사후 확인 → AI 사전예방 전환) 화살표 뒤에 「전환」을 겹쳐 쓰지 않고, 대상을 넣어 풉니다(✓ (대상) 점검을 사후 확인에서 AI 사전예방으로)

<!-- @block.variant -->
모양: cards=plus|arrow|plain|vs(2칸), compare=table|panels|diag(현황·문제 ▶ 추진방향 짝), steps=row|zigzag, timeline=chevron|dots, 그 밖은 빈 문자열

<!-- @block.text -->
banner·band·define·subhead 본문, strategy의 목표 띠·pdca의 환류 띠 한 줄(그 밖은 빈 문자열)

<!-- @block.items -->
bullets의 불릿·case의 「라벨 | 내용」 줄, define의 칩 흐름, compare panels의 [As-Is 요지, To-Be 요지](diag는 [현황·문제 요지, 추진방향 요지]), table의 머리 줄 전체(첫째 = 행 머리 열 이름, 나머지 = 값 열 이름 2~5개), strategy의 왼쪽 층 이름 0~4개(띠·열 머리·과제·지표 행 순서). 그 밖은 빈 배열

<!-- @block.cells -->
cards·steps·timeline·hub·voices·quotes·stats·qa·table·strategy·pdca의 칸(stats는 bullets[0]=성과 문장, head=그 문장의 핵심 수치 — 앱이 「성과 문장(^{시점}수치)」 추진성과 불릿 한 줄로 이음 · qa는 head=질문, bullets=답 1~2개 · table은 head=행 머리, bullets=값을 열 순서대로 값 열 수만큼 · strategy는 열마다 head=전략목표, bullets=실행과제, note=성과지표 · pdca는 4칸, tag=단계 표지(비우면 P·D·C·A), head=단계 이름): head=칸 제목(시기·단계·기관·화자), tag=칩(기관명·Step·연도 등, 없으면 빈 문자열), bullets=칸 불릿(voices·quotes는 [원문 인용]), note=결과 줄·출처(quotes는 시점·출처, stats는 그 수치의 시점 한 마디 — 필수, 전후 비교 값은 head에 「164명 → 126명」). 그 밖은 빈 배열

<!-- @block.rows -->
compare의 행: key=구분(짧게), before=기존, after=개선(diag는 before=현황·문제, after=그 문제의 추진방향 — 행마다 한 짝). 그 밖은 빈 배열

<!-- @block.series -->
chart의 막대 2~4개(값은 근거 수치 그대로). 그 밖은 빈 배열

<!-- @block.badge -->
chart 증감 배지(근거에 그 표현이 있을 때만) — 없으면 빈 문자열

<!-- @block.figures -->
그림 자리표시 0~2개(블록 옆·안에 영역만 차지하고 담당자가 채움). kind = photo 사진·illust 삽화·map 지도·screen 시스템 화면·logo 기관 로고 묶음, desc = 무엇을 보여줄 그림인지 명사구 25자 안팎(근거에 있는 대상·장면만 — 새 사실·수치 없이, 로고는 협업 기관 이름들), pos = left·right(블록 옆 — compare panels·diag는 left = 왼쪽(As-Is·현황·문제) 패널 안·right = 오른쪽(To-Be·추진방향) 패널 안·center = 두 패널 사이, hub는 center = 가운데 칸 로고), size = S·M·L·W·MAP. 그림이 없으면 빈 배열

<!-- @block.evidence -->
quotes·voices·case·define이 근거로 삼은 원문 구절(카드·첨부·전년 절에 있는 그대로). 그 밖은 빈 문자열
