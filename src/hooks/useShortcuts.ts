import { useEffect } from 'react';
import { useSettingsStore } from '../settings/settingsStore';
import { useAppStore } from '../store/appStore';
import { dispatchAction } from '../store/actions';
import { ACTIONS, type ActionId } from '../settings/shortcuts';

const REPEATABLE = new Set(ACTIONS.filter((a) => a.allowRepeat).map((a) => a.id));

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/** 全局快捷键监听：输入框内 / IME 合成中不触发 */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || isEditableTarget(e.target)) return;

      const { bindings } = useSettingsStore.getState();
      const action = (Object.keys(bindings) as ActionId[]).find(
        (id) => bindings[id] === e.code,
      );
      if (!action) return;

      if (e.repeat && !REPEATABLE.has(action)) return;

      e.preventDefault();
      // 设置弹窗打开时不响应全局快捷键（避免与按键捕获冲突）
      if (useAppStore.getState().settingsOpen) return;
      dispatchAction(action);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
