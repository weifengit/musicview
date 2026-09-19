import { player, useAppStore } from './appStore';
import { useSettingsStore } from '../settings/settingsStore';
import type { ActionId } from '../settings/shortcuts';

/** 统一的 action 执行入口：快捷键与 UI 共用 */

export function dispatchAction(action: ActionId) {
  switch (action) {
    case 'togglePlay':
      player.toggle();
      break;
    case 'speedDown':
      adjustSpeed(-1);
      break;
    case 'speedUp':
      adjustSpeed(1);
      break;
    case 'speedToggle':
      toggleSpeed();
      break;
    case 'jumpBack':
      jump(-1);
      break;
    case 'jumpForward':
      jump(1);
      break;
    case 'toggleFollow':
      useAppStore.getState().setFollow(true);
      break;
  }
}

/** A/D：按梯度调整速度（clamp 到设置的范围） */
function adjustSpeed(direction: 1 | -1) {
  const { speedStep, minRate, maxRate } = useSettingsStore.getState();
  const { rate } = useAppStore.getState();
  const next = Math.round((rate + direction * speedStep) * 100) / 100;
  const clamped = Math.min(maxRate, Math.max(minRate, next));
  setRate(clamped);
}

/** S：1.0 ↔ 自定义速度 切换 */
function toggleSpeed() {
  const { rate, customRate } = useAppStore.getState();
  if (rate === 1) {
    setRate(customRate === 1 ? 1 : customRate);
  } else {
    useAppStore.getState().setCustomRate(rate);
    setRate(1);
  }
}

/** Z/X：跳跃指定秒数 */
function jump(direction: 1 | -1) {
  const { jumpSec } = useSettingsStore.getState();
  player.seek(player.getTime() + direction * jumpSec);
}

export function setRate(rate: number) {
  player.setRate(rate);
  useAppStore.getState().setRate(rate);
  if (rate !== 1) useAppStore.getState().setCustomRate(rate);
}
