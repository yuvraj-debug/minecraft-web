import * as THREE from 'three';
import { Chunk } from './Chunk.ts';
import { ChunkMesher } from './ChunkMesher.ts';
import { TerrainGenerator, BiomeType } from './TerrainGenerator.ts';
import { TextureAtlas } from './TextureAtlas.ts';
import { WaterMaterial } from '../render/WaterMaterial.ts';
import { WorldStorage } from './WorldStorage.ts';
import { LightingManager } from '../render/LightingManager.ts';
import { BlockType, BLOCK_DEFS } from './Block.ts';
import { VillageGenerator } from './VillageGenerator.ts';

export class World {
  public scene: THREE.Scene;
  public atlas: TextureAtlas;
  public mesher: ChunkMesher;
  public generator: TerrainGenerator;
  public village: VillageGenerator;
  public storage: WorldStorage;
  public lighting: LightingManager;
  public waterMaterial: WaterMaterial;
  public opaqueMaterial: THREE.MeshStandardMaterial;

  public chunks: Map<string, Chunk> = new Map();
  public renderDistance = 6; // Chunks radius around player

  private modifiedBlocks: Map<string, BlockType> = new Map();
  private dirtyChunks: Set<Chunk> = new Set();
  private isLoaded = false;

  constructor(scene: THREE.Scene, lighting: LightingManager) {
    this.scene = scene;
    this.lighting = lighting;
    this.atlas = new TextureAtlas();
    this.mesher = new ChunkMesher(this.atlas);
    this.generator = new TerrainGenerator(42);
    this.village = new VillageGenerator(24, 24);
    this.storage = new WorldStorage();

    // Standard PBR Material for solid voxel blocks with vertex AO and shadows
    this.opaqueMaterial = new THREE.MeshStandardMaterial({
      map: this.atlas.texture,
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.05,
      alphaTest: 0.05,
      side: THREE.DoubleSide
    });

    // Custom animated water shader material
    this.waterMaterial = new WaterMaterial(this.atlas.texture);
  }

  public async init(): Promise<void> {
    // Initialize Village structures
    this.village.init((wx, wz) => {
      const { height } = this.generator.getHeight(wx, wz);
      return height;
    });

    // Spawn village torch point lights
    for (const torch of this.village.getTorches()) {
      this.lighting.addTorch(torch.x, torch.y, torch.z);
    }

    // Load previously saved modified blocks from IndexedDB
    this.modifiedBlocks = await this.storage.loadAllDeltas();

    // Spawn torch point lights from saved blocks
    for (const [key, type] of this.modifiedBlocks.entries()) {
      if (type === BlockType.TORCH) {
        const [x, y, z] = key.split(',').map(Number);
        this.lighting.addTorch(x, y, z);
      }
    }

    this.isLoaded = true;
  }

  public static getChunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  public getBlock(wx: number, wy: number, wz: number): BlockType {
    if (wy < 0 || wy >= Chunk.HEIGHT) return BlockType.AIR;

    // Check modified blocks delta first
    const key = `${wx},${wy},${wz}`;
    if (this.modifiedBlocks.has(key)) {
      return this.modifiedBlocks.get(key)!;
    }

    const cx = Math.floor(wx / Chunk.SIZE);
    const cz = Math.floor(wz / Chunk.SIZE);
    const chunkKey = World.getChunkKey(cx, cz);
    const chunk = this.chunks.get(chunkKey);

    if (chunk && chunk.isLoaded) {
      const lx = ((wx % Chunk.SIZE) + Chunk.SIZE) % Chunk.SIZE;
      const lz = ((wz % Chunk.SIZE) + Chunk.SIZE) % Chunk.SIZE;
      return chunk.getBlock(lx, wy, lz);
    }

    // Check village block
    const vb = this.village.getBlock(wx, wy, wz);
    if (vb !== null) return vb;

    // If chunk isn't loaded into memory, sample directly from terrain generator
    const { height } = this.generator.getHeight(wx, wz);
    if (wy === 0) return BlockType.BEDROCK;
    if (wy <= height) return BlockType.STONE;
    if (wy <= this.generator.SEA_LEVEL) return BlockType.WATER;
    return BlockType.AIR;
  }

  public setBlock(wx: number, wy: number, wz: number, type: BlockType): boolean {
    if (wy < 0 || wy >= Chunk.HEIGHT) return false;

    const oldBlock = this.getBlock(wx, wy, wz);
    if (oldBlock === type) return false;

    const key = `${wx},${wy},${wz}`;
    this.modifiedBlocks.set(key, type);
    this.storage.saveBlock(wx, wy, wz, type);

    // Torch dynamic lighting updates
    if (type === BlockType.TORCH) {
      this.lighting.addTorch(wx, wy, wz);
    } else if (oldBlock === BlockType.TORCH) {
      this.lighting.removeTorch(wx, wy, wz);
    }

    const cx = Math.floor(wx / Chunk.SIZE);
    const cz = Math.floor(wz / Chunk.SIZE);
    const lx = ((wx % Chunk.SIZE) + Chunk.SIZE) % Chunk.SIZE;
    const lz = ((wz % Chunk.SIZE) + Chunk.SIZE) % Chunk.SIZE;

    const chunk = this.getOrCreateChunk(cx, cz);
    chunk.setBlock(lx, wy, lz, type);
    this.dirtyChunks.add(chunk);

    // Re-mesh neighbor chunks if on border
    if (lx === 0) this.markChunkDirty(cx - 1, cz);
    if (lx === Chunk.SIZE - 1) this.markChunkDirty(cx + 1, cz);
    if (lz === 0) this.markChunkDirty(cx, cz - 1);
    if (lz === Chunk.SIZE - 1) this.markChunkDirty(cx, cz + 1);

    return true;
  }

  private markChunkDirty(cx: number, cz: number): void {
    const chunk = this.chunks.get(World.getChunkKey(cx, cz));
    if (chunk) {
      this.dirtyChunks.add(chunk);
    }
  }

  public getOrCreateChunk(cx: number, cz: number): Chunk {
    const key = World.getChunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.chunks.set(key, chunk);
      this.generateChunk(chunk);
      this.dirtyChunks.add(chunk);
    }
    return chunk;
  }

  private generateChunk(chunk: Chunk): void {
    const trees: Array<{ x: number; y: number; z: number }> = [];
    this.generator.populateChunk(chunk.chunkX, chunk.chunkZ, chunk.voxels, trees);
    this.village.populateChunk(chunk);

    // Apply delta modifications saved in IndexedDB
    const baseX = chunk.chunkX * Chunk.SIZE;
    const baseZ = chunk.chunkZ * Chunk.SIZE;

    for (let lx = 0; lx < Chunk.SIZE; lx++) {
      for (let lz = 0; lz < Chunk.SIZE; lz++) {
        for (let ly = 0; ly < Chunk.HEIGHT; ly++) {
          const wx = baseX + lx;
          const wz = baseZ + lz;
          const key = `${wx},${ly},${wz}`;
          if (this.modifiedBlocks.has(key)) {
            chunk.setBlock(lx, ly, lz, this.modifiedBlocks.get(key)!);
          }
        }
      }
    }

    chunk.isLoaded = true;
  }

  public preloadSpawnChunks(playerX: number, playerZ: number, radius = 3): void {
    const centerCX = Math.floor(playerX / Chunk.SIZE);
    const centerCZ = Math.floor(playerZ / Chunk.SIZE);

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = centerCX + dx;
        const cz = centerCZ + dz;
        this.getOrCreateChunk(cx, cz);
      }
    }

    // Mesh all initial chunks immediately so player never sees invisible blocks
    for (const chunk of this.dirtyChunks) {
      this.rebuildChunkMesh(chunk);
    }
    this.dirtyChunks.clear();
  }

  public updateChunks(playerX: number, playerZ: number): void {
    if (!this.isLoaded) return;

    const centerCX = Math.floor(playerX / Chunk.SIZE);
    const centerCZ = Math.floor(playerZ / Chunk.SIZE);
    const r = this.renderDistance;

    // Load chunks around player
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz <= r * r) {
          const cx = centerCX + dx;
          const cz = centerCZ + dz;
          this.getOrCreateChunk(cx, cz);
        }
      }
    }

    // Unload distant chunks
    const unloadDistSq = (r + 2) * (r + 2);
    for (const [key, chunk] of this.chunks.entries()) {
      const dx = chunk.chunkX - centerCX;
      const dz = chunk.chunkZ - centerCZ;
      if (dx * dx + dz * dz > unloadDistSq) {
        chunk.dispose(this.scene);
        this.dirtyChunks.delete(chunk);
        this.chunks.delete(key);
      }
    }

    // Process a batch of dirty chunk meshes (up to 8 per tick to keep 60 FPS while streaming rapidly)
    let processed = 0;
    for (const chunk of this.dirtyChunks) {
      if (processed >= 8) break;
      this.rebuildChunkMesh(chunk);
      this.dirtyChunks.delete(chunk);
      processed++;
    }
  }

  private rebuildChunkMesh(chunk: Chunk): void {
    const { opaqueGeometry, waterGeometry } = this.mesher.meshChunk(
      chunk,
      (wx, wy, wz) => this.getBlock(wx, wy, wz)
    );

    const worldPos = chunk.getWorldPosition();

    // Rebuild or update Opaque Solid Mesh
    if (chunk.opaqueMesh) {
      this.scene.remove(chunk.opaqueMesh);
      chunk.opaqueMesh.geometry.dispose();
      chunk.opaqueMesh = null;
    }

    if (opaqueGeometry) {
      const mesh = new THREE.Mesh(opaqueGeometry, this.opaqueMaterial);
      mesh.position.copy(worldPos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      chunk.opaqueMesh = mesh;
    }

    // Rebuild or update Transparent Water Mesh
    if (chunk.waterMesh) {
      this.scene.remove(chunk.waterMesh);
      chunk.waterMesh.geometry.dispose();
      chunk.waterMesh = null;
    }

    if (waterGeometry) {
      const mesh = new THREE.Mesh(waterGeometry, this.waterMaterial.material);
      mesh.position.copy(worldPos);
      this.scene.add(mesh);
      chunk.waterMesh = mesh;
    }

    chunk.isDirty = false;
  }

  public getBiomeAt(x: number, z: number): BiomeType {
    return this.generator.getBiome(x, z);
  }

  public gameMode: 'creative' | 'survival' = 'creative';

  public getSpawnHeight(x: number, z: number): number {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    for (let y = Chunk.HEIGHT - 2; y >= 1; y--) {
      const b = this.getBlock(bx, y, bz);
      if (b !== BlockType.AIR && b !== BlockType.WATER) {
        return y + 2.0;
      }
    }
    const { height } = this.generator.getHeight(x, z);
    return Math.max(height, this.generator.SEA_LEVEL) + 2.0;
  }

  public isBlockSolid(wx: number, wy: number, wz: number): boolean {
    const block = this.getBlock(wx, wy, wz);
    if (block === BlockType.AIR || block === BlockType.WATER) return false;
    return BLOCK_DEFS[block]?.isSolid ?? false;
  }

  public isBlockWater(wx: number, wy: number, wz: number): boolean {
    return this.getBlock(wx, wy, wz) === BlockType.WATER;
  }

  public async resetWorld(): Promise<void> {
    await this.storage.clearAll();
    this.modifiedBlocks.clear();
    this.lighting.clear();
    for (const chunk of this.chunks.values()) {
      chunk.dispose(this.scene);
    }
    this.chunks.clear();
    this.dirtyChunks.clear();
  }
}
