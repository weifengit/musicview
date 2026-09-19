/** 快捷键 action 定义与默认键位（用 KeyboardEvent.code，与键盘布局/输入法无关） */

export type ActionId =
  | 'togglePlay'
  | 'speedDown'
  | 'speedUp'
  | 'speedToggle'
  | 'jumpBack'
  | 'jumpForward'
  | 'toggleFollow';

export interface ActionDef {
  id: ActionId;
  label: string;
  /** 按住连发（e.repeat）是否生效：toggle 类不连发，jump/速度类连发 */
  allowRepeat: boolean;
}

export const ACTIONS: ActionDef[] = [
  { id: 'togglePlay', label: '播放 / 暂停', allowRepeat: false },
  { id: 'speedDown', label: '速度减一档', allowRepeat: true },
  { id: 'speedUp', label: '速度加一档', allowRepeat: true },
  { id: 'speedToggle', label: '速度 1.0 ↔ 自定义 切换', allowRepeat: false },
  { id: 'jumpBack', label: '向后回退', allowRepeat: true },
  { id: 'jumpForward', label: '向前跳跃', allowRepeat: true },
  { id: 'toggleFollow', label: '恢复指针跟随', allowRepeat: false },
];

export const DEFAULT_BINDINGS: Record<ActionId, string> = {
  togglePlay: 'Space',
  speedDown: 'KeyA',
  speedUp: 'KeyD',
  speedToggle: 'KeyS',
  jumpBack: 'KeyZ',
  jumpForward: 'KeyX',
  toggleFollow: 'KeyF',
};

export interface Settings {
  bindings: Record<ActionId, string>;
  /** 速度梯度（每档增减量） */
  speedStep: number;
  /** 跳跃秒数 */
  jumpSec: number;
  minRate: number;
  maxRate: number;
}

export const DEFAULT_SETTINGS: Settings = {
  bindings: { ...DEFAULT_BINDINGS },
  speedStep: 0.2,
  jumpSec: 5,
  minRate: 0.25,
  maxRate: 3,
};

/** KeyboardEvent.code → 友好显示名 */
export function codeToLabel(code: string): string {
  if (code === 'Space') return '空格';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] ?? code;
  if (code.startsWith('Numpad')) return '小键盘' + code.slice(6);
  const map: Record<string, string> = {
    ShiftLeft: '左Shift', ShiftRight: '右Shift',
    ControlLeft: '左Ctrl', ControlRight: '右Ctrl',
    AltLeft: '左Alt', AltRight: '右Alt',
    Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'",
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=',
    Backquote: '`', Tab: 'Tab', Enter: '回车', Backspace: '退格',
  };
  return map[code] ?? code;
}
