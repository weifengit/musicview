import type { Note } from '../types';
import { timeToX, xToTime, type Viewport } from './viewport';
import { noteColor, noteLabelColor } from './colors';

/** 图表布局常量（CSS 像素） */
export const AXIS_BOTTOM = 24; // 底部时间轴高度
export const AXIS_LEFT = 36; // 左侧音量轴宽度

const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
const MIN_TICK_PX = 60;
const MIN_LABEL_BAR_W = 26; // 柱宽小于此不画音名标签

/** 选刻度步长：使相邻刻度间距 ≥ MIN_TICK_PX */
function pickTickStep(vp: Viewport): number {
  for (const step of TICK_STEPS) {
    if (step * vp.pxPerSec >= MIN_TICK_PX) return step;
  }
  return TICK_STEPS[TICK_STEPS.length - 1];
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  if (m === 0) return s < 10 && sec % 1 !== 0 ? s.toFixed(1) : `${Math.round(s)}s`;
  return `${m}:${s.toFixed(0).padStart(2, '0')}`;
}

/** 二分查找：第一个 end > t 的音符下标 */
function lowerBound(notes: Note[], t: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].start + notes[mid].duration <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * 绘制底层：坐标轴 + 音符柱子 + 音名标签。
 * 所有坐标为 CSS 像素，调用方需已设置 DPR transform。
 */
export function renderChart(
  ctx: CanvasRenderingContext2D,
  notes: Note[],
  vp: Viewport,
  width: number,
  height: number,
) {
  const plotW = width - AXIS_LEFT;
  const plotH = height - AXIS_BOTTOM;

  ctx.clearRect(0, 0, width, height);

  // ---- Y 轴（音量参考线 0/0.25/0.5/0.75/1）----
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const v = i / 4;
    const y = plotH - v * plotH;
    ctx.strokeStyle = i === 0 ? 'rgba(128,128,128,0.5)' : 'rgba(128,128,128,0.15)';
    ctx.beginPath();
    ctx.moveTo(AXIS_LEFT, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(128,128,128,0.8)';
    ctx.fillText(v.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''), AXIS_LEFT - 6, y);
  }

  // ---- X 轴（时间刻度）----
  const step = pickTickStep(vp);
  const t0 = Math.max(0, Math.floor(xToTime(vp, AXIS_LEFT) / step) * step);
  const t1 = xToTime(vp, width);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let t = t0; t <= t1; t += step) {
    const x = timeToX(vp, t);
    if (x < AXIS_LEFT) continue;
    ctx.strokeStyle = 'rgba(128,128,128,0.35)';
    ctx.beginPath();
    ctx.moveTo(x, plotH);
    ctx.lineTo(x, plotH + 5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(128,128,128,0.9)';
    ctx.fillText(formatTime(t), x, plotH + 7);
  }

  // ---- 音符柱子（可视裁剪）----
  const visStart = xToTime(vp, AXIS_LEFT);
  const visEnd = xToTime(vp, width);
  const startIdx = lowerBound(notes, visStart);

  ctx.save();
  ctx.beginPath();
  ctx.rect(AXIS_LEFT, 0, plotW, plotH);
  ctx.clip();

  for (let i = startIdx; i < notes.length; i++) {
    const n = notes[i];
    if (n.start > visEnd) break;
    const x = timeToX(vp, n.start);
    const w = Math.max(n.duration * vp.pxPerSec, 2);
    const h = Math.max(n.velocity * plotH, 2);
    const y = plotH - h;

    ctx.fillStyle = noteColor(n.midi, n.velocity);
    ctx.fillRect(x, y, w, h);

    if (w >= MIN_LABEL_BAR_W) {
      ctx.fillStyle = noteLabelColor(n.velocity);
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.name, x + w / 2, y + Math.min(h / 2, 8), w - 4);
    }
  }
  ctx.restore();
}

/** 绘制顶层 playhead：竖线 + 顶部三角 */
export function renderPlayhead(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  timeSec: number,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  const plotH = height - AXIS_BOTTOM;
  const x = timeToX(vp, timeSec);
  if (x < AXIS_LEFT - 1 || x > width + 1) return;

  ctx.strokeStyle = 'rgba(255, 60, 60, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, plotH);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 60, 60, 0.9)';
  ctx.beginPath();
  ctx.moveTo(x - 5, 0);
  ctx.lineTo(x + 5, 0);
  ctx.lineTo(x, 7);
  ctx.closePath();
  ctx.fill();
}
