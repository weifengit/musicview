import type { Note } from '../types';
import { timeToX, xToTime, type Viewport } from './viewport';
import { noteFill, noteStroke, familyColor, FAMILY_LABELS } from './colors';

/** 图表布局常量（CSS 像素） */
export const AXIS_BOTTOM = 24; // 底部时间轴高度
export const AXIS_LEFT = 48; // 左侧音量轴宽度（dB 标签）

const TIME_TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
const DB_TICK_STEPS = [1, 2, 3, 5, 6, 10, 20];
const MIN_TICK_PX = 60;
const MIN_DB_TICK_PX = 36;
const LEGEND_H = 20; // 顶部图例高度

/** 选刻度步长：使相邻刻度间距 ≥ minPx */
function pickStep(steps: number[], unitPx: number, minPx: number): number {
  for (const step of steps) {
    if (step * unitPx >= minPx) return step;
  }
  return steps[steps.length - 1];
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
 * 绘制底层：图例 + 坐标轴 + 音符柱子 + 音名/唱名标签。
 * Y 轴 = 峰值音量 dB（对齐参考实现：base=全局最小峰值，柱高 = peakDb - base）。
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
  if (notes.length === 0) return;

  // Y 轴 dB 范围（对齐参考：yMin = floor(base - 3)，yMax = 0）
  let base = Infinity;
  let dbMax = -Infinity;
  for (const n of notes) {
    if (n.peakDb < base) base = n.peakDb;
    if (n.peakDb > dbMax) dbMax = n.peakDb;
  }
  const yMin = Math.floor(base - 3);
  const yMax = 0;
  const dbRange = yMax - yMin;
  const dbToY = (db: number) => plotH - ((db - yMin) / dbRange) * plotH;

  // ---- 图例（7 音级族）----
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let lx = AXIS_LEFT + 6;
  for (let f = 0; f < 7; f++) {
    ctx.fillStyle = familyColor(f);
    ctx.fillRect(lx, 4, 10, 10);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(lx, 4, 10, 10);
    ctx.fillStyle = 'rgba(200,200,210,0.85)';
    ctx.fillText(FAMILY_LABELS[f], lx + 13, 9.5);
    lx += 13 + ctx.measureText(FAMILY_LABELS[f]).width + 10;
  }
  ctx.fillStyle = 'rgba(140,140,150,0.8)';
  ctx.fillText('明度：浅=弱 → 深=强', lx + 4, 9.5);

  // ---- Y 轴（dB 刻度）----
  const dbStep = pickStep(DB_TICK_STEPS, plotH / dbRange, MIN_DB_TICK_PX);
  ctx.textAlign = 'right';
  for (let db = Math.ceil(yMin / dbStep) * dbStep; db <= yMax; db += dbStep) {
    const y = dbToY(db);
    ctx.strokeStyle = db === 0 ? 'rgba(128,128,128,0.5)' : 'rgba(128,128,128,0.15)';
    ctx.beginPath();
    ctx.moveTo(AXIS_LEFT, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(128,128,128,0.8)';
    ctx.fillText(`${db}`, AXIS_LEFT - 6, y);
  }

  // ---- X 轴（时间刻度）----
  const step = pickStep(TIME_TICK_STEPS, vp.pxPerSec, MIN_TICK_PX);
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
  const normRange = Math.max(dbMax - base, 1e-6);
  const yFloor = dbToY(base); // 所有柱子从 base 线起画

  ctx.save();
  ctx.beginPath();
  ctx.rect(AXIS_LEFT, LEGEND_H, plotW, plotH - LEGEND_H);
  ctx.clip();

  for (let i = startIdx; i < notes.length; i++) {
    const n = notes[i];
    if (n.start > visEnd) break;
    const x = timeToX(vp, n.start);
    const w = Math.max(n.duration * vp.pxPerSec, 1.5);
    const t = (n.peakDb - base) / normRange;
    const yTop = dbToY(n.peakDb);
    const h = Math.max(yFloor - yTop, 1.5);

    ctx.fillStyle = noteFill(n.midi, t);
    ctx.strokeStyle = noteStroke(n.midi);
    ctx.lineWidth = 0.5;
    ctx.fillRect(x, yTop, w, h);
    ctx.strokeRect(x, yTop, w, h);

    // 标签：优先画在柱子上方（音名+唱名两行）；贴顶时画进柱子内部；稍窄只画音名
    const above = yTop - 24 > LEGEND_H;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (w > 26 && above) {
      ctx.fillStyle = 'rgba(225,225,232,0.95)';
      ctx.textBaseline = 'bottom';
      ctx.fillText(n.name, x + w / 2, yTop - 13, w + 20);
      ctx.fillText(n.solfege, x + w / 2, yTop - 3, w + 20);
    } else if (w > 26) {
      // 贴顶（最响的音）：画进柱子内部，响音柱身深色用白字
      ctx.fillStyle = t > 0.4 ? 'rgba(255,255,255,0.95)' : 'rgba(40,40,50,0.9)';
      ctx.textBaseline = 'top';
      ctx.fillText(n.name, x + w / 2, yTop + 3, w - 4);
      if (h > 24) ctx.fillText(n.solfege, x + w / 2, yTop + 14, w - 4);
    } else if (w > 13 && yTop - 12 > LEGEND_H) {
      ctx.fillStyle = 'rgba(225,225,232,0.95)';
      ctx.textBaseline = 'bottom';
      ctx.fillText(n.name, x + w / 2, yTop - 3, w + 20);
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
  ctx.moveTo(x, LEGEND_H);
  ctx.lineTo(x, plotH);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 60, 60, 0.9)';
  ctx.beginPath();
  ctx.moveTo(x - 5, LEGEND_H);
  ctx.lineTo(x + 5, LEGEND_H);
  ctx.lineTo(x, LEGEND_H + 7);
  ctx.closePath();
  ctx.fill();
}
