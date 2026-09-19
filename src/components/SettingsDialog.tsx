import { useEffect, useState } from 'react';
import { useSettingsStore } from '../settings/settingsStore';
import { useAppStore } from '../store/appStore';
import { ACTIONS, codeToLabel, type ActionId } from '../settings/shortcuts';

/**
 * 设置弹窗：
 * - 快捷键重绑定（点击"修改"后按新键，Esc 取消；冲突时提示交换/覆盖/取消）
 * - 速度梯度、跳跃秒数、速度范围
 * - 恢复默认
 */
export function SettingsDialog() {
  const open = useAppStore((s) => s.settingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const settings = useSettingsStore();

  /** 正在捕获按键的 action */
  const [capturing, setCapturing] = useState<ActionId | null>(null);
  /** 冲突待处理：{action 要绑定的键与占用者} */
  const [conflict, setConflict] = useState<{ action: ActionId; code: string; holder: ActionId } | null>(null);

  // 按键捕获
  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setCapturing(null);
        return;
      }
      // 忽略纯修饰键
      if (/^(Shift|Control|Alt|Meta)/.test(e.code)) return;

      const holder = (Object.keys(settings.bindings) as ActionId[]).find(
        (id) => id !== capturing && settings.bindings[id] === e.code,
      );
      if (holder) {
        setConflict({ action: capturing, code: e.code, holder });
      } else {
        settings.setBinding(capturing, e.code);
      }
      setCapturing(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturing, settings]);

  if (!open) return null;

  const close = () => {
    setCapturing(null);
    setConflict(null);
    setOpen(false);
  };

  const holderLabel = (id: ActionId) => ACTIONS.find((a) => a.id === id)?.label ?? id;

  return (
    <div className="dialog-backdrop" onClick={close}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>快捷键设置</h2>
          <button onClick={close}>关闭</button>
        </div>

        <table className="bindings-table">
          <tbody>
            {ACTIONS.map((a) => (
              <tr key={a.id}>
                <td>{a.label}</td>
                <td className="key-cell">
                  {capturing === a.id ? (
                    <span className="capturing">按下新按键… (Esc 取消)</span>
                  ) : (
                    <kbd>{codeToLabel(settings.bindings[a.id])}</kbd>
                  )}
                </td>
                <td>
                  <button onClick={() => setCapturing(a.id)}>修改</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="settings-fields">
          <label>
            速度梯度
            <input
              type="number"
              min={0.05}
              max={1}
              step={0.05}
              value={settings.speedStep}
              onChange={(e) => settings.setSpeedStep(Number(e.target.value))}
            />
          </label>
          <label>
            跳跃秒数
            <input
              type="number"
              min={1}
              max={30}
              step={1}
              value={settings.jumpSec}
              onChange={(e) => settings.setJumpSec(Number(e.target.value))}
            />
          </label>
          <label>
            最低速度
            <input
              type="number"
              min={0.1}
              max={4}
              step={0.05}
              value={settings.minRate}
              onChange={(e) => settings.setRateRange(Number(e.target.value), settings.maxRate)}
            />
          </label>
          <label>
            最高速度
            <input
              type="number"
              min={0.2}
              max={5}
              step={0.05}
              value={settings.maxRate}
              onChange={(e) => settings.setRateRange(settings.minRate, Number(e.target.value))}
            />
          </label>
        </div>

        <div className="dialog-footer">
          <button onClick={() => settings.resetDefaults()}>恢复默认</button>
        </div>

        {conflict && (
          <div className="conflict-box">
            <p>
              按键 <kbd>{codeToLabel(conflict.code)}</kbd> 已被「{holderLabel(conflict.holder)}」占用：
            </p>
            <button
              onClick={() => {
                settings.swapBindings(conflict.action, conflict.holder);
                setConflict(null);
              }}
            >
              交换两者的键位
            </button>
            <button
              onClick={() => {
                settings.setBinding(conflict.action, conflict.code);
                setConflict(null);
              }}
            >
              覆盖（「{holderLabel(conflict.holder)}」将无键位）
            </button>
            <button onClick={() => setConflict(null)}>取消</button>
          </div>
        )}
      </div>
    </div>
  );
}
