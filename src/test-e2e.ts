/**
 * E2E 测试脚本（仅开发用，test-e2e.html 引用）：
 * 浏览器内合成钢琴风格 WAV → Blob → analyzeAudio（真实 decodeAudioData + Worker）→
 * 用 renderChart 绘制 → 结果写入 #result 供自动化断言。
 */
import { analyzeAudio } from './analysis/analyzer';
import { renderChart, AXIS_LEFT, AXIS_BOTTOM } from './chart/render';
import { fitViewport } from './chart/viewport';
import { AudioPlayer } from './audio/player';

const SR = 22050;

function renderTone(pcm: Float32Array, freq: number, start: number, duration: number, amp: number) {
  const s0 = Math.floor(start * SR);
  const s1 = Math.min(pcm.length, Math.floor((start + duration) * SR));
  const releaseSec = 0.25;
  for (let i = s0; i < s1; i++) {
    const t = (i - s0) / SR;
    const attack = Math.min(1, t / 0.008);
    const decay = Math.exp(-t * 2.2);
    const tail = (s1 - i) / SR / releaseSec;
    const release = tail >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, tail));
    const v =
      Math.sin(2 * Math.PI * freq * t) +
      0.6 * Math.sin(2 * Math.PI * freq * 2 * t) +
      0.3 * Math.sin(2 * Math.PI * freq * 3 * t);
    pcm[i] += amp * attack * decay * release * v;
  }
}

/** 打包为标准 16-bit PCM WAV Blob */
function toWavBlob(pcm: Float32Array, sampleRate: number): Blob {
  const dataLen = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);
  for (let i = 0; i < pcm.length; i++) {
    const v = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

async function main() {
  const resultEl = document.getElementById('result')!;
  const lines: string[] = [];

  // 与 Node 测试相同的旋律：C4 D4 E4 C4 C4 G3(+重击)
  const pcm = new Float32Array(Math.ceil(5.0 * SR));
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = (Math.random() * 2 - 1) * 0.0005; // 底噪
  }
  renderTone(pcm, 261.63, 0.1, 0.5, 0.3); // C4
  renderTone(pcm, 293.66, 0.8, 0.5, 0.55); // D4 更响
  renderTone(pcm, 329.63, 1.5, 0.5, 0.3); // E4
  renderTone(pcm, 261.63, 2.2, 0.5, 0.3); // C4
  renderTone(pcm, 261.63, 2.9, 0.5, 0.3); // C4 重复
  renderTone(pcm, 196.0, 3.6, 1.3, 0.45); // G3 长音
  renderTone(pcm, 196.0, 4.3, 0.6, 0.6); // G3 重击

  const blob = toWavBlob(pcm, SR);
  lines.push(`WAV Blob: ${blob.size} bytes`);

  // ---- 分析（decodeAudioData + Worker 全链路）----
  const t0 = performance.now();
  const { notes, durationSec } = await analyzeAudio(blob, () => {}).promise;
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  lines.push(`分析完成: ${notes.length} 个音符, 时长 ${durationSec.toFixed(2)}s, 耗时 ${elapsed}s`);
  for (const n of notes) {
    lines.push(`  ${n.name}(${n.solfege}) start=${n.start.toFixed(2)} dur=${n.duration.toFixed(2)} peak=${n.peakDb.toFixed(1)}dB`);
  }

  const expected = [60, 62, 64, 60, 60, 55, 55];
  const pitchOk = notes.length === expected.length && notes.every((n, i) => n.midi === expected[i]);
  lines.push(pitchOk ? '断言: 音高序列正确 PASS' : `断言: 音高序列错误 FAIL (期望 ${expected.join(',')})`);

  // ---- 播放器加载验证 ----
  const player = new AudioPlayer();
  const loadedDuration = await new Promise<number>((resolve, reject) => {
    player.setEvents({ onLoaded: resolve });
    player.loadBlob(blob);
    setTimeout(() => reject(new Error('播放器加载超时')), 5000);
  });
  lines.push(`播放器: 加载成功, duration=${loadedDuration.toFixed(2)}s`);
  player.setRate(1.6);
  lines.push(`播放器: 变速 1.6× 设置后 rate=${player.getRate()}`);

  // ---- 图表渲染验证 ----
  const canvas = document.getElementById('chart') as HTMLCanvasElement;
  const dpr = window.devicePixelRatio || 1;
  const w = 1000;
  const h = 300;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vp = fitViewport(durationSec, w - AXIS_LEFT);
  renderChart(ctx, notes, vp, w, h);
  void AXIS_BOTTOM;
  lines.push('图表: renderChart 执行完成（见上方 canvas）');

  resultEl.textContent = lines.join('\n');
  document.title = pitchOk ? 'E2E PASS' : 'E2E FAIL';
}

main().catch((err) => {
  document.getElementById('result')!.textContent =
    `E2E 失败: ${err instanceof Error ? err.message : err}\n${err instanceof Error ? err.stack : ''}`;
  document.title = 'E2E ERROR';
});
