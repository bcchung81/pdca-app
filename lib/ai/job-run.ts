// AI 백그라운드 작업 한 번의 끝맺기(순수 — 저장은 sink로 받음, 시험은 job-run.test.ts). after() 안에서 lib/ai/background.ts가 부름.
// 규칙: 작업(work)이 무엇을 돌려주든(성공·거절·저장 충돌) 결과 행 하나를 남기고, 던지면 짧은 글로 실패 결과를 남기며 호출 기록이 아직 running이면 error로 닫음
// (멈춘 running 행이 동시 실행 제한에 남지 않게). 결과를 못 남기면 호출 기록을 error로 닫아 화면이 실패로 보게 함(running으로 남은 행은 finish 조건상 이미 끝난 것이면 그대로).

import { JOB_CRASH_MSG, type JobOutcome } from "./jobs.ts";

export interface JobSink {
  /** 결과 한 행 넣기(ai_results — 본인 권한). 실패면 오류 글, 성공이면 null */
  save(result: JobOutcome): Promise<string | null>;
  /** 이 작업의 호출 기록(여러 안이면 묶음 전부)이 아직 running이면 error로 닫음 */
  fail(error: string): Promise<void>;
}

export async function runJob(work: () => Promise<JobOutcome>, sink: JobSink, log: (msg: string, e?: unknown) => void = (m, e) => console.error(m, e)): Promise<JobOutcome> {
  let out: JobOutcome;
  try {
    out = await work();
  } catch (e) {
    log("[ai-job] 작업 실패", e);
    out = { ok: false, message: JOB_CRASH_MSG };
  }
  // 거절·실패로 끝난 작업은 호출 기록도 닫음(이미 ok·error로 끝맺었으면 조건에 걸려 그대로)
  if (!out.ok) await sink.fail(out.message).catch((e) => log("[ai-job] 호출 기록 닫기 실패", e));
  const saveErr = await sink.save(out).catch((e) => String(e instanceof Error ? e.message : e));
  if (saveErr) {
    log("[ai-job] 결과 저장 실패", saveErr);
    await sink.fail(`결과를 저장하지 못했습니다 — ${saveErr}`.slice(0, 300)).catch((e) => log("[ai-job] 호출 기록 닫기 실패", e));
  }
  return out;
}
