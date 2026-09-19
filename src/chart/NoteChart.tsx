import { useCallback, useEffect, useRef } from 'react';
import { useAppStore, player } from '../store/appStore';
import { followTick } from '../hooks/usePlaybackSync';
import { fitViewport, panBy, zoomAt } from './viewport';
import { renderChart, renderPlayhead, AXIS_LEFT } from './render';

/**
 * 双层 Canvas 图表：
 * - 底层：坐标轴 + 音符柱子（仅视口/数据/尺寸变化时重绘）
 * - 顶层：playhead（每 rAF 重绘）
 * 交互：滚轮缩放（锚定鼠标）、拖拽/Shift+滚轮平移、用户操作后解除跟随并显示"恢复跟随"按钮。
 */
export function NoteChart() {
  const record = useAppStore((s) => s.currentRecord);
  const viewport = useAppStore((s) => s.viewport);
  const follow = useAppStore((s) => s.follow);
  const setViewport = useAppStore((s) => s.setViewport);
  const setFollow = useAppStore((s) => s.setFollow);

  const containerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dragRef = useRef<{ startX: number } | null>(null);

  // ---- 底层重绘 ----
  const redrawBase = useCallback(() => {
    const canvas = baseRef.current;
    const { w, h } = sizeRef.current;
    if (!canvas || w === 0 || h === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vp = useAppStore.getState().viewport;
    const rec = useAppStore.getState().currentRecord;
    if (vp && rec) renderChart(ctx, rec.notes, vp, w, h);
    else {
      ctx.clearRect(0, 0, w, h);
    }
  }, []);

  // ---- 尺寸监听 + DPR ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const apply = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: rect.width, h: rect.height };
      for (const c of [baseRef.current, headRef.current]) {
        if (!c) continue;
        c.width = Math.round(rect.width * dpr);
        c.height = Math.round(rect.height * dpr);
        c.style.width = `${rect.width}px`;
        c.style.height = `${rect.height}px`;
      }
      // 尺寸变化后保持视口合法；尚无视口时 fit-all
      const s = useAppStore.getState();
      if (s.currentRecord && !s.viewport) {
        s.setViewport(fitViewport(s.currentRecord.durationSec, rect.width - AXIS_LEFT));
      }
      redrawBase();
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(container);
    return () => ro.disconnect();
  }, [redrawBase]);

  // ---- 新记录加载时初始化视口（fit-all）----
  useEffect(() => {
    if (record && !viewport && sizeRef.current.w > 0) {
      setViewport(fitViewport(record.durationSec, sizeRef.current.w - AXIS_LEFT));
    }
  }, [record, viewport, setViewport]);

  // ---- 视口/数据变化 → 重绘底层 ----
  useEffect(() => {
    redrawBase();
  }, [record, viewport, redrawBase]);

  // ---- playhead rAF + 翻页跟随 ----
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const canvas = headRef.current;
      const { w, h } = sizeRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && w > 0 && h > 0) {
        const s = useAppStore.getState();
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const t = player.getTime();
        const vp = s.viewport;
        if (vp && s.currentRecord) {
          if (s.follow && s.playing) {
            const next = followTick(vp, t, w - AXIS_LEFT, s.currentRecord.durationSec);
            if (next) s.setViewport(next); // 触发底层重绘（上面的 effect）
          }
          renderPlayhead(ctx, useAppStore.getState().viewport ?? vp, t, w, h);
        } else {
          ctx.clearRect(0, 0, w, h);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- 交互：滚轮缩放 / Shift+滚轮平移 ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = useAppStore.getState();
      if (!s.viewport || !s.currentRecord) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const plotW = rect.width - AXIS_LEFT;
      const dur = s.currentRecord.durationSec;
      let next;
      if (e.shiftKey) {
        next = panBy(s.viewport, -(e.deltaY + e.deltaX), dur, plotW);
      } else {
        const factor = Math.exp(-e.deltaY * 0.0015);
        next = zoomAt(s.viewport, Math.max(0, x - AXIS_LEFT), factor, dur, plotW);
      }
      s.setViewport(next);
      s.setFollow(false);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  // ---- 交互：拖拽平移 ----
  const onPointerDown = (e: React.PointerEvent) => {
    if (!viewport) return;
    dragRef.current = { startX: e.clientX };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const s = useAppStore.getState();
    if (!s.viewport || !s.currentRecord) return;
    const dx = e.clientX - drag.startX;
    if (dx === 0) return;
    drag.startX = e.clientX;
    s.setViewport(panBy(s.viewport, dx, s.currentRecord.durationSec, sizeRef.current.w - AXIS_LEFT));
    s.setFollow(false);
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  // ---- 双击：回到全局视图 ----
  const onDoubleClick = () => {
    const s = useAppStore.getState();
    if (!s.currentRecord) return;
    s.setViewport(fitViewport(s.currentRecord.durationSec, sizeRef.current.w - AXIS_LEFT));
  };

  return (
    <div
      ref={containerRef}
      className="note-chart"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <canvas ref={baseRef} className="chart-layer" />
      <canvas ref={headRef} className="chart-layer" />
      {!follow && (
        <button className="follow-btn" onClick={() => setFollow(true)}>
          恢复跟随
        </button>
      )}
      {!record && <div className="chart-empty">选择文件并生成图表后在此显示</div>}
    </div>
  );
}
