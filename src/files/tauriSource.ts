import { open } from '@tauri-apps/plugin-dialog';
import { readDir, readFile, stat } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import type { AudioFileRef } from '../types';
import { isAudioFile, type AudioDirSource } from './source';

/**
 * Tauri 端文件夹来源：原生目录选择器 + plugin-fs 读取。
 * payload 为文件绝对路径，读取时按路径取内容。
 */

interface TauriPayload {
  path: string;
}

const MIME_BY_EXT: Record<string, string> = {
  '.m4a': 'audio/mp4',
  '.aac': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
};

function mimeOf(name: string): string {
  const lower = name.toLowerCase();
  for (const ext of Object.keys(MIME_BY_EXT)) {
    if (lower.endsWith(ext)) return MIME_BY_EXT[ext];
  }
  return 'application/octet-stream';
}

export const tauriSource: AudioDirSource = {
  async pickDirectory(): Promise<unknown | null> {
    const dir = await open({ directory: true, multiple: false, title: '选择音频文件夹' });
    return typeof dir === 'string' ? dir : null;
  },

  async listFiles(token: unknown): Promise<AudioFileRef[]> {
    const dir = token as string;
    const entries = await readDir(dir);
    const refs: AudioFileRef[] = [];
    for (const entry of entries) {
      if (!entry.isFile || !isAudioFile(entry.name)) continue;
      const path = await join(dir, entry.name);
      let size = 0;
      let lastModified = 0;
      try {
        const info = await stat(path);
        size = info.size;
        lastModified = info.mtime?.getTime() ?? 0;
      } catch {
        // 元信息取不到不影响列出
      }
      refs.push({ id: path, name: entry.name, size, lastModified, payload: { path } });
    }
    return refs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  },

  async readBlob(ref: AudioFileRef): Promise<Blob> {
    const { path } = ref.payload as TauriPayload;
    const bytes = await readFile(path);
    return new Blob([bytes.buffer as ArrayBuffer], { type: mimeOf(ref.name) });
  },
};
