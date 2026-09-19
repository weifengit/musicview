import { player, useAppStore } from '../store/appStore';
import { setRate } from '../store/actions';
import { useSettingsStore } from '../settings/settingsStore';
import { codeToLabel } from '../settings/shortcuts';

function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 播放控制条：播放/暂停、进度、音量、速度显示 */
export function PlayerBar() {
  const playing = useAppStore((s) => s.playing);
  const currentTime = useAppStore((s) => s.currentTime);
  const duration = useAppStore((s) => s.duration);
  const rate = useAppStore((s) => s.rate);
  const volume = useAppStore((s) => s.volume);
  const setVolume = useAppStore((s) => s.setVolume);
  const hasRecord = useAppStore((s) => s.currentRecord !== null);
  const bindings = useSettingsStore((s) => s.bindings);

  return (
    <div className="player-bar">
      <button
        className="play-btn"
        disabled={!hasRecord}
        onClick={() => player.toggle()}
        title={`播放/暂停（${codeToLabel(bindings.togglePlay)}）`}
      >
        {playing ? '⏸' : '▶'}
      </button>

      <span className="time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <input
        className="seek"
        type="range"
        min={0}
        max={duration || 0}
        step={0.01}
        value={Math.min(currentTime, duration || 0)}
        disabled={!hasRecord}
        onChange={(e) => player.seek(Number(e.target.value))}
      />

      <span className="rate" title="播放速度（快捷键 A/D 调整，S 切换 1.0）">
        {rate.toFixed(2)}×
      </span>
      <input
        className="rate-slider"
        type="range"
        min={0.25}
        max={3}
        step={0.05}
        value={rate}
        onChange={(e) => setRate(Number(e.target.value))}
      />

      <span className="vol-icon">🔊</span>
      <input
        className="vol-slider"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => {
          const v = Number(e.target.value);
          player.setVolume(v);
          setVolume(v);
        }}
      />
    </div>
  );
}
