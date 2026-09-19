/** 频率 ↔ MIDI ↔ 音名 转换（十二平均律，A4=440Hz） */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** 固定唱名：C=哆 D=来 E=咪 F=发 G=唆 A=拉 B=西 */
const SOLFEGE = ['哆', '升哆', '来', '升来', '咪', '发', '升发', '唆', '升唆', '拉', '升拉', '西'];

/** 频率 → 浮点 MIDI（未取整） */
export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

/** MIDI 整数 → 音名，如 69 → "A4"，61 → "C#4" */
export function midiToName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[pc] + octave;
}

/** MIDI 整数 → 音级（0-11，0=C），用于颜色映射 */
export function midiToPitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/** MIDI 整数 → 唱名，如 66 → "升发" */
export function midiToSolfege(midi: number): string {
  return SOLFEGE[midiToPitchClass(midi)];
}
