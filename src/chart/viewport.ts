/** 图表视口：时间 ↔ 像素坐标变换，缩放/平移数学 */

export interface Viewport {
  /** 视口左边缘对应的时间（秒） */
  offsetSec: number;
  /** 每秒对应的像素数（缩放级别） */
  pxPerSec: number;
}

export const MAX_PX_PER_SEC = 2000;

export function timeToX(vp: Viewport, t: number): number {
  return (t - vp.offsetSec) * vp.pxPerSec;
}

export function xToTime(vp: Viewport, x: number): number {
  return x / vp.pxPerSec + vp.offsetSec;
}

/** 全局适配（fit-all）：整段音频恰好铺满宽度 */
export function fitViewport(durationSec: number, widthPx: number): Viewport {
  return { offsetSec: 0, pxPerSec: Math.max(1, widthPx / Math.max(durationSec, 0.001)) };
}

/** clamp 视口，防止平移/缩放越界 */
export function clampViewport(vp: Viewport, durationSec: number, widthPx: number): Viewport {
  const minPxPerSec = Math.max(1, widthPx / Math.max(durationSec, 0.001));
  const pxPerSec = Math.min(MAX_PX_PER_SEC, Math.max(minPxPerSec, vp.pxPerSec));
  const visibleSpan = widthPx / pxPerSec;
  // 允许两侧各留半秒余量
  const offsetSec = Math.min(
    Math.max(vp.offsetSec, -0.5),
    Math.max(-0.5, durationSec - visibleSpan + 0.5),
  );
  return { offsetSec, pxPerSec };
}

/** 以 anchorX（鼠标位置，CSS 像素）为锚点缩放 factor 倍 */
export function zoomAt(
  vp: Viewport,
  anchorX: number,
  factor: number,
  durationSec: number,
  widthPx: number,
): Viewport {
  const anchorTime = xToTime(vp, anchorX);
  const next: Viewport = { offsetSec: 0, pxPerSec: vp.pxPerSec * factor };
  next.offsetSec = anchorTime - anchorX / next.pxPerSec;
  return clampViewport(next, durationSec, widthPx);
}

/** 平移 dx 像素（正值 = 内容向右，即时间窗向前） */
export function panBy(
  vp: Viewport,
  dxPx: number,
  durationSec: number,
  widthPx: number,
): Viewport {
  return clampViewport(
    { ...vp, offsetSec: vp.offsetSec - dxPx / vp.pxPerSec },
    durationSec,
    widthPx,
  );
}
