import { useEffect } from 'react';
import { player, useAppStore } from '../store/appStore';
import { clampViewport, type Viewport } from '../chart/viewport';

/**
 * 播放同步：
 * 1. 订阅播放引擎事件 → 同步 playing/duration 到 store
 * 2. rAF 循环：播放时间 → store.currentTime（供 playhead 与进度条）
 *    翻页跟随由 NoteChart 内的 rAF 执行（那里有真实图表宽度），用 followTick。
 */
export function usePlaybackSync() {
  // 引擎事件 → store
  useEffect(() => {
    player.setEvents({
      onPlay: () => useAppStore.getState().setPlaying(true),
      onPause: () => useAppStore.getState().setPlaying(false),
      onEnded: () => useAppStore.getState().setPlaying(false),
      onLoaded: (duration) => useAppStore.getState().setDuration(duration),
    });
    return () => player.setEvents({});
  }, []);

  // rAF：时间同步
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = useAppStore.getState();
      const t = player.getTime();
      if (Math.abs(t - s.currentTime) > 0.005) {
        s.setCurrentTime(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/**
 * 供 NoteChart 的 rAF 调用（那里有真实宽度）：
 * 指针像素位置越过可视区 85% 或小于 0 时，翻页到 15% 处；否则返回 null（不变）。
 */
export function followTick(
  viewport: Viewport,
  timeSec: number,
  plotWidthPx: number,
  durationSec: number,
): Viewport | null {
  const x = (timeSec - viewport.offsetSec) * viewport.pxPerSec;
  if (x > plotWidthPx * 0.85 || x < 0) {
    return clampViewport(
      {
        offsetSec: timeSec - (plotWidthPx * 0.15) / viewport.pxPerSec,
        pxPerSec: viewport.pxPerSec,
      },
      durationSec,
      plotWidthPx,
    );
  }
  return null;
}
