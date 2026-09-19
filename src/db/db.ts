import Dexie, { type Table } from 'dexie';
import type { AnalysisRecord } from '../types';

interface BlobRow {
  id: string;
  blob: Blob;
}

class MusicViewDB extends Dexie {
  analyses!: Table<AnalysisRecord, string>;
  blobs!: Table<BlobRow, string>;

  constructor() {
    super('musicview');
    this.version(1).stores({
      analyses: 'id, createdAt, name',
      blobs: 'id',
    });
  }
}

export const db = new MusicViewDB();

/** 保存分析结果 + 音频副本（同事务） */
export async function saveAnalysis(record: AnalysisRecord, blob: Blob): Promise<void> {
  await db.transaction('rw', db.analyses, db.blobs, async () => {
    await db.analyses.put(record);
    await db.blobs.put({ id: record.id, blob });
  });
}

/** 历史列表（按时间倒序），不加载音频 blob */
export async function listAnalyses(): Promise<AnalysisRecord[]> {
  return db.analyses.orderBy('createdAt').reverse().toArray();
}

/** 恢复一条历史记录（含音频 blob） */
export async function getWithBlob(
  id: string,
): Promise<{ record: AnalysisRecord; blob: Blob } | null> {
  const record = await db.analyses.get(id);
  if (!record) return null;
  const row = await db.blobs.get(id);
  if (!row) return null;
  return { record, blob: row.blob };
}

/** 删除单条（两表同事务） */
export async function deleteOne(id: string): Promise<void> {
  await db.transaction('rw', db.analyses, db.blobs, async () => {
    await db.analyses.delete(id);
    await db.blobs.delete(id);
  });
}

/** 一键清空全部历史 */
export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.analyses, db.blobs, async () => {
    await db.analyses.clear();
    await db.blobs.clear();
  });
}

/** 估算总占用（字节）：notes JSON + blob 大小 */
export async function totalSize(): Promise<number> {
  let total = 0;
  await db.analyses.each((r) => {
    total += JSON.stringify(r.notes).length * 2; // UTF-16 粗略估算
  });
  await db.blobs.each((b) => {
    total += b.blob.size;
  });
  return total;
}
