import { midiToPitchClass } from '../analysis/music';

/**
 * 音名 → 颜色。
 * 12 个音级均布色环（每级 30°）；同音名的不同音量用同色系明度/饱和度渐变：
 * 越响 → 越深、越饱和。
 */
export function noteColor(midi: number, velocity: number): string {
  const hue = midiToPitchClass(midi) * 30;
  const sat = 55 + 25 * velocity;
  const light = 72 - 32 * velocity;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/** 柱子上标签文字颜色：深底白字、浅底深字 */
export function noteLabelColor(velocity: number): string {
  return velocity > 0.45 ? 'rgba(255,255,255,0.95)' : 'rgba(40,40,50,0.9)';
}
