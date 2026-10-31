import * as THREE from 'three';
import { BlockType } from './Block.ts';

export class Chunk {
  public static readonly SIZE = 16;
  public static readonly HEIGHT = 64;

  public chunkX: number;
  public chunkZ: number;
  public voxels: Uint8Array;
  public isDirty = true;
  public isLoaded = false;

  public opaqueMesh: THREE.Mesh | null = null;
  public waterMesh: THREE.Mesh | null = null;

  constructor(chunkX: number, chunkZ: number) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.voxels = new Uint8Array(Chunk.SIZE * Chunk.HEIGHT * Chunk.SIZE);
  }

  public static getIndex(lx: number, ly: number, lz: number): number {
    return lx + lz * Chunk.SIZE + ly * Chunk.SIZE * Chunk.SIZE;
  }

  public getBlock(lx: number, ly: number, lz: number): BlockType {
    if (lx < 0 || lx >= Chunk.SIZE || lz < 0 || lz >= Chunk.SIZE || ly < 0 || ly >= Chunk.HEIGHT) {
      return BlockType.AIR;
    }
    return this.voxels[Chunk.getIndex(lx, ly, lz)];
  }

  public setBlock(lx: number, ly: number, lz: number, type: BlockType): boolean {
    if (lx < 0 || lx >= Chunk.SIZE || lz < 0 || lz >= Chunk.SIZE || ly < 0 || ly >= Chunk.HEIGHT) {
      return false;
    }
    const idx = Chunk.getIndex(lx, ly, lz);
    if (this.voxels[idx] !== type) {
      this.voxels[idx] = type;
      this.isDirty = true;
      return true;
    }
    return false;
  }

  public getWorldPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.chunkX * Chunk.SIZE, 0, this.chunkZ * Chunk.SIZE);
  }

  public dispose(scene: THREE.Scene): void {
    if (this.opaqueMesh) {
      scene.remove(this.opaqueMesh);
      this.opaqueMesh.geometry.dispose();
      this.opaqueMesh = null;
    }
    if (this.waterMesh) {
      scene.remove(this.waterMesh);
      this.waterMesh.geometry.dispose();
      this.waterMesh = null;
    }
  }
}
