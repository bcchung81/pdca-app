"use client";

import { saveDraft } from "../../app/(app)/my/actions";
import { fixedLabelOf } from "../../lib/cards/fixed.ts";
import { PaneResizer } from "../workspace/pane-resizer";
import { type PaneTabItem, PaneTabs } from "../workspace/pane-tabs";
import { AiAssist } from "./ai-assist";
import { CardEditor } from "./card-editor";
import type { WorkspaceProps } from "./card-workspace";
import { FixedChip, LockedChip } from "./card-workspace-bars";
import { DraftImportPanel } from "./import/draft-import-panel";
import { HistoryPanel } from "./history-panel";
import { InspectionPanel } from "./inspection-panel";
import { MaterialsPanel } from "./materials-panel";
import type { CardWorkspaceState } from "./use-card-workspace";

const PANE_TABS: PaneTabItem<"ai" | "inspection">[] = [
  { key: "ai", label: "AI 작성지원" },
  { key: "inspection", label: "점검 결과" },
];

/** 본문: 왼쪽 카드 편집기 + 오른쪽 패널(AI 작성지원·점검 결과 / 자료·한글 파일 채우기·수정 이력) */
export function WorkspaceBody({ props, ws }: { props: WorkspaceProps; ws: CardWorkspaceState }) {
  const { draft } = props;
  const { editor, side, aiOpen, inspOpen, assistPane, sidePane, sidePaneStyle } = ws;
  // 오른쪽 패널의 탭: AI 작성지원 | 점검 결과(같은 패널·같은 폭에서 바꿔 봄)
  const assistTabs = <PaneTabs id={ws.paneId} ariaLabel="AI 작성지원·점검 결과" tabs={PANE_TABS} active={side === "inspection" ? "inspection" : "ai"} onChange={ws.setTab} />;
  return (
    <div className="flex min-h-0 grow">
      <div className="flex min-w-0 grow flex-col">
        <CardEditor
          ref={editor}
          uid={props.uid}
          initial={props.initial}
          imageUrls={ws.imageUrls}
          layout={props.layout ?? null}
          readOnly={props.readOnly}
          preview={props.preview}
          defaultPeriod={props.defaultPeriod}
          zoomPaused={ws.paneDragging}
          onSaved={ws.onSaved}
          saveAction={ws.draftMode ? saveDraft : undefined}
          variant={ws.draftMode ? "draft" : "ledger"}
          locked={props.locked}
          versionId={props.versionId ?? null}
          rev={props.rev}
          base={ws.draftMode && draft?.status !== "draft" && draft?.status !== "submitted" ? props.initial : undefined}
          metaSlot={
            props.fixedLockedAt !== undefined && !props.preview && !draft ? (
              <FixedChip uid={props.uid} lockedAt={props.fixedLockedAt} label={fixedLabelOf({ group: props.group })} onDone={ws.setMessage} />
            ) : props.locked?.length ? (
              <LockedChip label={fixedLabelOf({ group: props.group })} />
            ) : null
          }
        />
      </div>
      <PaneResizer width={ws.paneW} onWidth={ws.setPaneLive} onDragging={ws.setPaneDragging} onCommit={ws.setPaneW} label="오른쪽 패널 폭 조절" />
      {assistPane && (
        <div className={`${sidePane} ${aiOpen ? "" : "hidden"}`} style={sidePaneStyle}>
          <AiAssist
            uid={props.uid}
            title={props.title}
            canApply={!props.readOnly}
            getCard={() => editor.current?.current()}
            onApply={(s) => editor.current?.apply(s)}
            canUpload={!props.preview}
            preview={props.preview}
            tabs={assistTabs}
            active={aiOpen}
          />
        </div>
      )}
      {assistPane && ws.inspSeen && (
        <div className={`${sidePane} ${inspOpen ? "" : "hidden"}`} style={sidePaneStyle}>
          <InspectionPanel uid={props.uid} canAck={ws.draftMode} tabs={assistTabs} />
        </div>
      )}
      {side === "materials" && (
        <div className={sidePane} style={sidePaneStyle}>
          <MaterialsPanel uid={props.uid} readOnly={Boolean(props.preview)} onClose={() => ws.setOther(null)} />
        </div>
      )}
      {side === "import" && (
        <div className={sidePane} style={sidePaneStyle}>
          <DraftImportPanel
            uid={props.uid}
            flush={async () => (await editor.current?.flush()) ?? true}
            onApplied={(r) => {
              ws.setImageUrls((u) => ({ ...u, ...r.imageUrls }));
              editor.current?.reset(r.data, r.rev, { versionId: r.versionId, label: "한글 파일 반영됨" });
              ws.setMessage(r.message);
              ws.router.refresh();
            }}
            onClose={() => ws.setOther(null)}
          />
        </div>
      )}
      {side === "history" && (
        <div className={sidePane} style={sidePaneStyle}>
          <HistoryPanel uid={props.uid} version={ws.savedTick} onClose={() => ws.setOther(null)} />
        </div>
      )}
    </div>
  );
}
