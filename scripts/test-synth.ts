/**
 * 算法验证脚本（Node 直接运行，不依赖浏览器）：
 * 合成钢琴风格音调（基频 + 泛音 + 起音/衰减包络），跑完整分析管线
 * （STFT onset 检测 → 逐帧 YIN → onset 驱动音符构建），断言识别结果。
 *
 * 运行：npx tsx scripts/test-synth.ts
 */
import { analyzePcm } from '../src/analysis/pipeline';
import { freqToMidi, midiToName } from '../src/analysis/music';
import { DEFAULT_ANALYSIS_PARAMS } from '../src/types';

const SR = 22050;

// ---- 1. music.ts 基本断言 ----
console.assert(Math.round(freqToMidi(440)) === 69 && midiToName(69) === 'A4', '440Hz → A4');
console.assert(Math.round(freqToMidi(261.63)) === 60 && midiToName(60) === 'C4', '261.63Hz → C4');
console.log('✓ music.ts: 440→A4, 261.63→C4');

// ---- 2. 合成音频 ----
interface Tone {
  freq: number;
  start: number;
  duration: number;
  amp: number;
}

/** 钢琴风格音色：基频 + 泛音（2 次泛音能量不低，考验八度纠错）+ 指数衰减 + 快速起音 + 释放斜坡 */
function renderTone(pcm: Float32Array, { freq, start, duration, amp }: Tone) {
  const s0 = Math.floor(start * SR);
  const s1 = Math.min(pcm.length, Math.floor((start + duration) * SR));
  const releaseSec = 0.25; // 250ms 释放，避免硬切断产生伪 onset
  for (let i = s0; i < s1; i++) {
    const t = (i - s0) / SR;
    const attack = Math.min(1, t / 0.008); // 8ms 起音
    const decay = Math.exp(-t * 2.2);
    // 尾端升余弦释放（平缓，避免频谱扩散产生伪 onset）
    const tail = (s1 - i) / SR / releaseSec;
    const release = tail >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, tail));
    const v =
      Math.sin(2 * Math.PI * freq * t) +
      0.6 * Math.sin(2 * Math.PI * freq * 2 * t) +
      0.3 * Math.sin(2 * Math.PI * freq * 3 * t);
    pcm[i] += amp * attack * decay * release * v;
  }
}

const TOTAL = 5.0;
const pcm = new Float32Array(Math.ceil(TOTAL * SR));
// 底噪（真实手机录音不会是绝对静音；无噪声时基线为 0，微小频谱涟漪会触发伪 onset）
for (let i = 0; i < pcm.length; i++) {
  pcm[i] = (Math.random() * 2 - 1) * 0.0005;
}

// 旋律：C4 D4 E4，间隔 0.2s；之后 C4 重复两次；
// 最后长音 G3 在 4.3s 处重击一次（onset 应把同音切成两段）
const F_C4 = 261.63;
const F_D4 = 293.66;
const F_E4 = 329.63;
const F_G3 = 196.0;

renderTone(pcm, { freq: F_C4, start: 0.1, duration: 0.5, amp: 0.30 });
renderTone(pcm, { freq: F_D4, start: 0.8, duration: 0.5, amp: 0.55 }); // 更响 → peakDb 更大
renderTone(pcm, { freq: F_E4, start: 1.5, duration: 0.5, amp: 0.30 });
renderTone(pcm, { freq: F_C4, start: 2.2, duration: 0.5, amp: 0.30 });
renderTone(pcm, { freq: F_C4, start: 2.9, duration: 0.5, amp: 0.30 }); // 同音重复，应分开
renderTone(pcm, { freq: F_G3, start: 3.6, duration: 1.3, amp: 0.45 });
renderTone(pcm, { freq: F_G3, start: 4.3, duration: 0.6, amp: 0.60 }); // 重击

// ---- 3. 完整管线 ----
const t0 = performance.now();
const { notes, onsetCount } = analyzePcm(pcm, SR, DEFAULT_ANALYSIS_PARAMS);
const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
console.log(`✓ 管线: ${onsetCount} 个 onset → ${notes.length} 个音符，耗时 ${elapsed}s`);
for (const n of notes) {
  console.log(
    `  ${n.name.padEnd(4)} ${n.solfege.padEnd(3)} start=${n.start.toFixed(2)}s dur=${n.duration.toFixed(2)}s peak=${n.peakDb.toFixed(1)}dB`,
  );
}

// ---- 4. 断言 ----
const expect = [
  { midi: 60, near: 0.1 }, // C4
  { midi: 62, near: 0.8 }, // D4
  { midi: 64, near: 1.5 }, // E4
  { midi: 60, near: 2.2 }, // C4
  { midi: 60, near: 2.9 }, // C4 重复
  { midi: 55, near: 3.6 }, // G3 第一次
  { midi: 55, near: 4.3 }, // G3 重击（onset 切分）
];

let pass = true;
if (notes.length !== expect.length) {
  console.error(`✗ 音符数量：期望 ${expect.length}，实际 ${notes.length}`);
  pass = false;
} else {
  for (let i = 0; i < expect.length; i++) {
    const n = notes[i];
    const e = expect[i];
    if (n.midi !== e.midi) {
      console.error(`✗ 第 ${i + 1} 个音符音高：期望 MIDI ${e.midi}，实际 ${n.midi} (${n.name})`);
      pass = false;
    }
    if (Math.abs(n.start - e.near) > 0.15) {
      console.error(`✗ 第 ${i + 1} 个音符起点：期望 ~${e.near}s，实际 ${n.start.toFixed(2)}s`);
      pass = false;
    }
  }
}

// 音量相对关系：D4(amp 0.55) 应比 C4(amp 0.30) 响
if (notes.length >= 2 && notes[1].peakDb <= notes[0].peakDb) {
  console.error('✗ 音量关系错误：D4 应比 C4 peakDb 大');
  pass = false;
}

// onset 驱动：音符应无缝衔接（除被跳过的无声段外，end ≈ 下一 start）
for (let i = 1; i < notes.length; i++) {
  const gap = notes[i].start - (notes[i - 1].start + notes[i - 1].duration);
  if (gap > 0.05) {
    console.error(`✗ 第 ${i} 与 ${i + 1} 个音符间存在 ${gap.toFixed(2)}s 空隙（应无缝衔接）`);
    pass = false;
  }
}

if (pass) {
  console.log('\n✓ 全部断言通过：onset 切分、音高、起点、无缝衔接、音量相对关系均正确');
  process.exit(0);
} else {
  console.error('\n✗ 存在失败断言');
  process.exit(1);
}
