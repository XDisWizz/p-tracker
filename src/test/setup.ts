// Vitest běží v Node, kde IndexedDB neexistuje. fake-indexeddb ji doplní,
// takže datová vrstva se testuje přes skutečné Dexie, ne přes atrapu.
import 'fake-indexeddb/auto';
