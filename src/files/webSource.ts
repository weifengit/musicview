import type { AudioFileRef } from '../types';
import { isAudioFile, type AudioDirSource } from './source';

/**
 * Web 端文件夹来源：
 * 优先 File System Access API（Chrome/Edge），
 * 不支持的浏览器回退 <input type="file" webkitdirectory>。
 */

interface FSAudioFileRef extends AudioFileRef {
  payload: File | FileSystemFileHandle;
}

// ---- File System Access API 类型补充（TS lib 未完整覆盖）----
interface DirHandle {
  values(): AsyncIterable<FileSystemHandle>;
}
declare function showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;

function supportsFSAccess(): boolean {
  return 'showDirectoryPicker' in window;
}

function pickViaInput(): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.webkitdirectory = true;
    input.onchange = () => resolve(input.files);
    // cancel 事件（Chrome 113+）；老浏览器无法感知取消，返回 null 即可
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export const webSource: AudioDirSource = {
  async pickDirectory(): Promise<unknown | null> {
    if (supportsFSAccess()) {
      try {
        return await showDirectoryPicker();
      } catch {
        return null; // 用户取消
      }
    }
    return pickViaInput();
  },

  async listFiles(token: unknown): Promise<AudioFileRef[]> {
    const refs: FSAudioFileRef[] = [];
    if (token instanceof FileList) {
      for (const file of Array.from(token)) {
        if (!isAudioFile(file.name)) continue;
        refs.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          payload: file,
        });
      }
    } else if (token && typeof token === 'object' && 'values' in token) {
      const dir = token as unknown as DirHandle;
      for await (const entry of dir.values()) {
        if (entry.kind !== 'file' || !isAudioFile(entry.name)) continue;
        const fh = entry as FileSystemFileHandle;
        const file = await fh.getFile();
        refs.push({
          id: `${entry.name}-${file.size}-${file.lastModified}`,
          name: entry.name,
          size: file.size,
          lastModified: file.lastModified,
          payload: fh,
        });
      }
    }
    return refs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  },

  async readBlob(ref: AudioFileRef): Promise<Blob> {
    const payload = (ref as FSAudioFileRef).payload;
    if (payload instanceof File) return payload;
    if (payload && typeof payload === 'object' && 'getFile' in payload) {
      return (payload as FileSystemFileHandle).getFile();
    }
    throw new Error(`无法读取文件: ${ref.name}`);
  },
};
