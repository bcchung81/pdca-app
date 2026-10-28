"use client";

import { useEffect } from "react";
import { CARD_COPY_FRAME_ATTR, CARD_COPY_READY, CARD_COPY_READY_ATTR, settleCardCopy } from "../../lib/cards/hwpx-copy-marks.ts";
import { fitHwpText } from "../../lib/hwp/fit.ts";

/** 숨은 사본(/cards/<uid>/hwpx-copy): 카드 화면과 같은 글자 간격 맞춤 → 글꼴·그림 준비 → <html data-hwfit="1">(lib/cards/hwpx-copy.ts settleCardCopy) */
export function CardCopyReady() {
  useEffect(() => {
    void settleCardCopy(document, fitHwpText, { frameAttr: CARD_COPY_FRAME_ATTR, readyAttr: CARD_COPY_READY_ATTR, ready: CARD_COPY_READY });
  }, []);
  return null;
}
