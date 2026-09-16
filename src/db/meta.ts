import type { StudiumDB } from './db';
import type { MetaShape } from '../domain/types';

export function metaRepo(db: StudiumDB) {
  return {
    async get<K extends keyof MetaShape>(key: K): Promise<MetaShape[K] | undefined> {
      const row = await db.meta.get(key);
      return row === undefined ? undefined : (row.value as MetaShape[K]);
    },

    async set<K extends keyof MetaShape>(key: K, value: MetaShape[K]): Promise<void> {
      await db.meta.put({ key, value });
    },
  };
}

export type MetaRepo = ReturnType<typeof metaRepo>;
