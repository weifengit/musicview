import type { AudioFileRef } from '../types';

/**
 * 音频文件夹来源抽象（Tauri 适配层）。
 * 业务代码只依赖此接口与 Blob，不直接触碰具体文件 API。
 */

export interface AudioDirSource {
  /** 让用户选择一个文件夹；取消返回 null。返回的 token 供 listFiles 使用 */
  pickDirectory(): Promise<unknown | null>;
  /** 列出文件夹中的音频文件 */
  listFiles(token: unknown): Promise<AudioFileRef[]>;
  /** 读取文件内容为 Blob（用于分析/播放） */
  readBlob(ref: AudioFileRef): Promise<Blob>;
}

export const AUDIO_EXTENSIONS = ['.m4a', '.mp3', '.wav', '.aac', '.flac', '.ogg'];

export function isAudioFile(name: string): boolean {
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

import { webSource } from './webSource';
import { tauriSource } from './tauriSource';

/** 运行时选择实现：Tauri 环境用原生 fs，否则用 Web 实现 */
export function getSource(): AudioDirSource {
  if ('__TAURI_INTERNALS__' in window) {
    return tauriSource;
  }
  return webSource;
}
