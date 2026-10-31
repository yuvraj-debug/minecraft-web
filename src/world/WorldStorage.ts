import { BlockType } from './Block.ts';

export interface PlayerSaveData {
  position: { x: number; y: number; z: number };
  pitch: number;
  yaw: number;
  hotbar: BlockType[];
  selectedSlot: number;
  timeOfDay: number;
}

export class WorldStorage {
  private dbName = 'RealisticMinecraftDB';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;
  public isReady = false;

  constructor() {
    this.initDB();
  }

  private initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('block_deltas')) {
          db.createObjectStore('block_deltas', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.isReady = true;
        resolve();
      };

      request.onerror = (event) => {
        console.warn('IndexedDB failed to open, running in-memory session only:', event);
        reject(event);
      };
    });
  }

  public async saveBlock(x: number, y: number, z: number, type: BlockType): Promise<void> {
    if (!this.db) return;
    const key = `${x},${y},${z}`;
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('block_deltas', 'readwrite');
        const store = tx.objectStore('block_deltas');
        store.put({ key, x, y, z, type });
        tx.oncomplete = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  public async loadAllDeltas(): Promise<Map<string, BlockType>> {
    const map = new Map<string, BlockType>();
    if (!this.db) return map;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('block_deltas', 'readonly');
        const store = tx.objectStore('block_deltas');
        const request = store.getAll();

        request.onsuccess = () => {
          for (const item of request.result) {
            map.set(item.key, item.type);
          }
          resolve(map);
        };
        request.onerror = () => resolve(map);
      } catch {
        resolve(map);
      }
    });
  }

  public async savePlayer(data: PlayerSaveData): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('meta', 'readwrite');
        const store = tx.objectStore('meta');
        store.put({ key: 'player', ...data });
        tx.oncomplete = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  public async loadPlayer(): Promise<PlayerSaveData | null> {
    if (!this.db) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('meta', 'readonly');
        const store = tx.objectStore('meta');
        const request = store.get('player');
        request.onsuccess = () => {
          resolve(request.result || null);
        };
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  public async clearAll(): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(['block_deltas', 'meta'], 'readwrite');
        tx.objectStore('block_deltas').clear();
        tx.objectStore('meta').clear();
        tx.oncomplete = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
