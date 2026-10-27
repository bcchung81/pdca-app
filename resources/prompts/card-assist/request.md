작성지원 요청 글입니다. 코드(lib/ai/writer.ts `userPrompt`)가 prompt 절을 채우고, 실적 반영이면 paste 절, 첨부가 있으면 files.head 절과 자료별 <source key="file:N"> 봉투(전체 글)를 이어 붙입니다(블록 사이 빈 줄).
요청 종류별 할 일은 task.* 절 — 운영 지침(09)의 어느 절을 따르는지 적습니다. 반영 제안 8건 상한은 코드도 자릅니다(SUGGESTION_MAX).
보완 점검이면 followup.* 절로 「점검표 보완 요구」 블록을 이어 붙입니다(lib/ai/followup.ts followupBlock).

<!-- @prompt -->
요청 종류: {{label}}
기준 월: {{period}}
{{note}}

「할 일」
{{task}}

「카드」 — 칸 경로 | 글
{{card}}

「근거 자료」
{{refs}}

<!-- @note.given -->
요청 내용(사용자): {{note}}

<!-- @note.inPaste -->
요청 내용(사용자): 아래 「실적 자료·요청」에 함께 적혀 있을 수 있음(실적 문장·수치와 요청이 섞여 있음)

<!-- @note.none -->
요청 내용(사용자): (없음 — 요청 종류대로)

<!-- @task.improve -->
개선 제안 — 지침 「작업절차」가 함께 붙이라는 세 가지를 한 번에 봅니다.
① 지적사항 환류(지침 「지적사항_환류」): 근거 자료에서 이 과제와 관련된 지적(중간보고서·'25 평가보고서·실사 [경평지적사항])을 「」로 인용하고 [Act] 전년도 환류·[Plan] 조치 및 개선방향에 1:1로 매칭합니다. 관련 지적이 없으면 '관련 지적사항 미발견'.
② 전략연계 점검(지침 「전략연계_점검」): 실행과제 매칭·계량지표(성과지표 Pool·산식)·국정과제·ESG·AX 연계를 봅니다(신규과제의 실행과제 미매칭은 결함이 아님). 카드 계량지표 칸의 지표 구분 체크(중장기 경영목표·기관장 경영계약·성과지표 Pool·대표 계량지표)가 근거 자료의 해당 문서(중장기 목표지표·기관장 성과지표·성과지표 Pool·'26 편람 대표 계량지표)에 실제로 있는지, '25 실적·'26 목표가 단위와 함께 채워졌는지 대조합니다.
③ 점검 대비(지침 「점검기준」 — 정합성 5·우수사례 7대 축·평가위원 질의 패턴 8): 이 카드에 빠지거나 약한 칸을 짚되, 성과관리팀이 무겁게 보는 OutCome 연결·계량 수치의 함정·성과확산·지속성을 먼저 봅니다.
답: summary는 ◆ 지적사항 환류 · ◆ 전략연계 · ◆ 점검 대비로 나눠 짧게 씁니다. 카드에 바로 넣을 보완 문장은 우선순위가 높은 것부터 suggestions로 8건 이하만 줍니다(같은 칸은 한 건으로 합침).

<!-- @task.discover -->
실적 발굴(모드 B) — 계획(Plan·Do)·대상사업 실행과제·7대 축에 비추어 이번 달 카드에 넣을 만한 활동과 다음 단계를 제안합니다.
- 제안 수치에는 '(제안)'·'제안 목표치' 같은 표시를 붙입니다.
- 넣을 자리를 suggestions로 줍니다.

<!-- @task.reflect -->
실적 반영(모드 A) — 첨부 자료와 「실적 자료·요청」(붙여 넣은 글)의 수치화된 사실만으로 이번 달 월별 실적 초안을 만듭니다.
- monthly_row에 6열(월·추진실적·정량성과·정성성과·진도율·리스크)을 채우고, 같은 내용을 [Do] 월별 실적 상자(kind monthly)로 suggestions에 줍니다. 상자의 기간(period)은 자료의 기준월입니다 — 이번 달 자료가 아니면 그 기준월로 적거나 need_input으로 되묻습니다.
- 진도율은 지침 「진도율_산식」으로 분자·분모 근거와 함께 씁니다.
- 지침의 '점검 대비 귀띔'대로 성과관리팀 점검 기준에서 이 카드에 빠지거나 약한 칸 1~3개를 쉬운 말로 summary에 ▸ 줄로 짚습니다.
- 첨부 자료가 없거나 수치가 없으면 need_input으로 되묻습니다.
- summary 끝에 '이 초안이 원본자료 수치와 일치하는지 확인 후 카드에 반영하십시오'를 붙입니다.

<!-- @task.followup -->
보완 점검(모드 C, 지침 「보완이행점검」) — 아래 「점검표 보완 요구」의 행마다, 점검 뒤 카드(「카드」)에 그 보완이 반영됐는지 스스로 점검합니다. 공식 판정이 아니므로 판단어는 충족·미흡이 아니라 **반영됨 · 일부 반영 · 미반영 · 확인 불가**만 씁니다.
- 대조 기준은 「카드」(편집기에 지금 보이는 카드)입니다. 행의 「점검 당시 카드」는 점검 때의 상태일 뿐입니다.
- followup에 요청에 준 행 id를 빠짐없이 한 번씩, 주어진 순서대로 냅니다(없는 id는 만들지 않습니다).
- 반영됨: 요구한 내용(수치·사유·계획·연계 등)이 해당 칸에 구체적으로 들어가 있음. 일부 반영: 칸은 채웠으나 요구의 일부만(수치 없이 서술만, 시기·규모 없음, 지적 취지보다 좁음). 미반영: 「점검 당시 카드」가 지적한 상태 그대로. 확인 불가: 해당 칸을 찾을 수 없거나 보완 요구가 카드 밖 자료(증빙 등)를 가리킴.
- card_quote에는 판단 근거가 된 현재 카드 칸의 글을 한 문장 이내로 그대로(줄이면 …), inspection_quote에는 점검표 보완 요구의 원문을 한 문장 이내로 그대로 인용합니다. 확인 불가면 card_quote는 빈 문자열일 수 있습니다.
- remaining은 미반영·일부 반영·확인 불가일 때 '어느 칸에 무엇을 넣을지' 한 줄입니다. 수치를 지어 넣지 않고 필요하면 "○○ 실측치 기재 필요"로 씁니다. 반영됨이면 빈 문자열입니다.
- 점검표의 판정·문장을 바꾸거나 새 판정·지적을 만들지 않습니다. 점검표 판정에 이견이 있어 보여도 반박·재판정하지 말고 summary에 "성과관리팀에 재점검을 요청해 주십시오"로 안내합니다.
- summary는 ◆ 보완 이행 자가점검 한 줄 결론, ▸ 집중보완이면 ★핵심 항목의 이행 상태, 「재확인」이 있으면 카드 변경으로 이제 성립하게 된 항목만 ▸ 줄로 적습니다. 항목별 표와 건수는 앱이 그리고 세므로 summary에 표·건수를 쓰지 않습니다.
- 미반영·일부 반영 항목은 카드에 바로 넣을 문장이 있으면 suggestions로 줍니다(8건 이하, 같은 칸은 한 건). reason은 항목 라벨(예: 7대축 4 OutCome 연결)로 시작합니다.
- 이 앱에서는 지침 「보완이행점검」의 4단계 「점검 이후 바뀐 곳」과 5단계의 「점검 이후 바뀐 곳」·「다음 점검 전 우선순위 3가지」 줄, 「대조 카드: ○○(파일명)」 표기를 하지 않습니다. 대조 기준은 늘 「카드」입니다(카드 파일이 첨부돼 있어도 같음).
- monthly_row는 null입니다.

<!-- @paste -->
「실적 자료·요청(사용자가 요청 칸에 붙여 넣은 글)」
{{text}}

<!-- @followup.head -->
「점검표 보완 요구」 — {{period}} 점검({{status}}) · 미흡 {{count}}건 · 집중보완: {{focus}}
집중보완이 「예」면 ★ 표시 행(★핵심 3항목)을 먼저 봅니다.
줄마다 `id | 항목 | 요구받은 보완(▸ 보완) | 점검 당시 카드(▸ 카드) | 예상 질의 | 점검표 근거`

<!-- @followup.row -->
{{id}} | {{star}}{{label}} | {{requested}} | {{cardThen}} | {{question}} | {{evidence}}

<!-- @followup.recheck -->
「재확인」(점검표에서 기준 미확인·해당 없음이던 행 — 표에 넣지 않습니다): {{items}}

<!-- @files.head -->
{{> _shared/files.md#head}}

<!-- @kb.institution -->
{{> _shared/knowledge.md#institution}}

<!-- @kb.common -->
{{> _shared/knowledge.md#common}}

<!-- @kb.business -->
{{> _shared/knowledge.md#business}}

<!-- @kb.list -->
{{> _shared/knowledge.md#list}}

<!-- @kb.taskRow -->
{{> _shared/knowledge.md#taskRow}}

<!-- @kb.none -->
{{> _shared/knowledge.md#none}}

<!-- @kb.select.digestTrack -->
{{> _shared/knowledge.md#select.digestTrack}}

<!-- @kb.select.digestUnit -->
{{> _shared/knowledge.md#select.digestUnit}}

<!-- @kb.select.institution -->
{{> _shared/knowledge.md#select.institution}}

<!-- @kb.select.common -->
{{> _shared/knowledge.md#select.common}}

<!-- @kb.select.business -->
{{> _shared/knowledge.md#select.business}}

<!-- @kb.select.picked -->
{{> _shared/knowledge.md#select.picked}}

<!-- @kb.select.list -->
{{> _shared/knowledge.md#select.list}}

<!-- @kb.select.unpicked -->
{{> _shared/knowledge.md#select.unpicked}}
