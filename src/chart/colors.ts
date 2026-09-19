import { midiToPitchClass } from '../analysis/music';

/**
 * 音名 → 颜色（对齐参考实现）：
 * 7 个音级族（升降音与自然音同族）：C D E F G A B；
 * 同族同色相，音量越大颜色越深（明度 78% → 38%）。
 */

// 半音 → 族序号
const FAMILY = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
// 各族色相：红 橙 黄 绿 青 蓝 紫
export const FAMILY_HUES = [0, 28, 55, 120, 185, 222, 268];
export const FAMILY_LABELS = ['C 哆', 'D 来', 'E 咪', 'F 发', 'G 唆', 'A 拉', 'B 西'];

function familyOf(midi: number): number {
  return FAMILY[midiToPitchClass(midi)];
}

/**
 * 柱子填充色。
 * @param t 归一化音量 (db - base) / (dbMax - base)，0=最弱 1=最强
 */
export function noteFill(midi: number, t: number): string {
  const lightness = 78 - Math.min(1, Math.max(0, t)) * 40;
  return `hsl(${FAMILY_HUES[familyOf(midi)]}, 48%, ${lightness}%)`;
}

/** 柱子描边色（同族深色） */
export function noteStroke(midi: number): string {
  return `hsl(${FAMILY_HUES[familyOf(midi)]}, 48%, 25%)`;
}

/** 图例色块 */
export function familyColor(family: number): string {
  return `hsl(${FAMILY_HUES[family]}, 48%, 55%)`;
}
