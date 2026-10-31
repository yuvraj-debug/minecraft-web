import { createNoise2D, createNoise3D } from 'simplex-noise';
import { BlockType } from './Block.ts';

export enum BiomeType {
  PLAINS = 'Plains',
  FOREST = 'Forest',
  DESERT = 'Desert',
  MOUNTAINS = 'Mountains',
  OCEAN = 'Ocean'
}

export class TerrainGenerator {
  private noise2D_continental: (x: number, y: number) => number;
  private noise2D_mountains: (x: number, y: number) => number;
  private noise2D_detail: (x: number, y: number) => number;
  private noise2D_temperature: (x: number, y: number) => number;
  private noise3D_caves: (x: number, y: number, z: number) => number;
  private noise3D_ores: (x: number, y: number, z: number) => number;

  public readonly SEA_LEVEL = 22;
  public readonly CHUNK_HEIGHT = 64;

  constructor(seed = 12345) {
    // Seeded pseudo-random PRNG for deterministic noise generators
    const createPrng = (s: number) => {
      let current = s % 2147483647;
      if (current <= 0) current += 2147483646;
      return () => {
        current = (current * 16807) % 2147483647;
        return (current - 1) / 2147483646;
      };
    };

    this.noise2D_continental = createNoise2D(createPrng(seed));
    this.noise2D_mountains = createNoise2D(createPrng(seed + 101));
    this.noise2D_detail = createNoise2D(createPrng(seed + 202));
    this.noise2D_temperature = createNoise2D(createPrng(seed + 303));
    this.noise3D_caves = createNoise3D(createPrng(seed + 404));
    this.noise3D_ores = createNoise3D(createPrng(seed + 505));
  }

  public getBiome(worldX: number, worldZ: number): BiomeType {
    const temp = this.noise2D_temperature(worldX * 0.003, worldZ * 0.003);
    const cont = this.noise2D_continental(worldX * 0.004, worldZ * 0.004);

    if (cont < -0.35) return BiomeType.OCEAN;
    if (temp > 0.45) return BiomeType.DESERT;
    if (cont > 0.35) return BiomeType.MOUNTAINS;
    if (temp < -0.1) return BiomeType.FOREST;
    return BiomeType.PLAINS;
  }

  public getHeight(worldX: number, worldZ: number): { height: number; biome: BiomeType } {
    const biome = this.getBiome(worldX, worldZ);
    const cont = this.noise2D_continental(worldX * 0.005, worldZ * 0.005);
    const detail = this.noise2D_detail(worldX * 0.03, worldZ * 0.03) * 3;

    let baseHeight = 24;

    switch (biome) {
      case BiomeType.OCEAN:
        baseHeight = 14 + (cont + 0.35) * 12 + detail * 0.5;
        break;
      case BiomeType.DESERT:
        baseHeight = 23 + Math.sin(worldX * 0.04) * 3 + Math.cos(worldZ * 0.04) * 3 + detail;
        break;
      case BiomeType.PLAINS:
        baseHeight = 25 + cont * 6 + detail;
        break;
      case BiomeType.FOREST:
        baseHeight = 26 + cont * 8 + detail * 1.2;
        break;
      case BiomeType.MOUNTAINS: {
        const ridge = Math.abs(this.noise2D_mountains(worldX * 0.015, worldZ * 0.015));
        baseHeight = 28 + ridge * 26 + detail * 1.5;
        break;
      }
    }

    const clampedHeight = Math.max(1, Math.min(this.CHUNK_HEIGHT - 8, Math.floor(baseHeight)));
    return { height: clampedHeight, biome };
  }

  public populateChunk(
    chunkX: number,
    chunkZ: number,
    voxels: Uint8Array,
    trees: Array<{ x: number; y: number; z: number }>
  ): void {
    const CHUNK_SIZE = 16;
    const CHUNK_HEIGHT = this.CHUNK_HEIGHT;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = chunkX * CHUNK_SIZE + lx;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wz = chunkZ * CHUNK_SIZE + lz;

        const { height, biome } = this.getHeight(wx, wz);

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const index = lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;

          // Bedrock layer at bottom
          if (y === 0) {
            voxels[index] = BlockType.BEDROCK;
            continue;
          }
          if (y < 3 && Math.random() < 0.5) {
            voxels[index] = BlockType.BEDROCK;
            continue;
          }

          if (y <= height) {
            // 3D Cave carving (smooth subterranean network)
            const caveVal = this.noise3D_caves(wx * 0.04, y * 0.07, wz * 0.04);
            const isCave = caveVal > 0.58 && y > 2 && y < height - 1;

            if (isCave) {
              // Air in caves, or water if below sea level
              voxels[index] = (y <= this.SEA_LEVEL) ? BlockType.WATER : BlockType.AIR;
              continue;
            }

            // Surface block & sub-surface layers
            if (y === height) {
              if (y < this.SEA_LEVEL) {
                // Ocean floor
                voxels[index] = BlockType.SAND;
              } else if (y <= this.SEA_LEVEL + 1) {
                // Sand beach around sea shore
                voxels[index] = BlockType.SAND;
              } else if (biome === BiomeType.DESERT) {
                voxels[index] = BlockType.SAND;
              } else if (biome === BiomeType.MOUNTAINS && y > 42) {
                voxels[index] = BlockType.SNOW;
              } else if (biome === BiomeType.MOUNTAINS && y > 36) {
                voxels[index] = BlockType.STONE;
              } else {
                voxels[index] = BlockType.GRASS;
              }
            } else if (y >= height - 3) {
              // 3 blocks under surface
              if (biome === BiomeType.DESERT || y <= this.SEA_LEVEL + 1) {
                voxels[index] = BlockType.SAND;
              } else {
                voxels[index] = BlockType.DIRT;
              }
            } else {
              // Deep underground: Stone with realistic mineral veins
              const oreNoise = this.noise3D_ores(wx * 0.15, y * 0.15, wz * 0.15);

              if (y < 12 && oreNoise > 0.72) {
                voxels[index] = BlockType.DIAMOND_ORE;
              } else if (y < 20 && oreNoise > 0.65) {
                voxels[index] = BlockType.GOLD_ORE;
              } else if (y < 35 && oreNoise > 0.55) {
                voxels[index] = BlockType.IRON_ORE;
              } else if (y < 50 && oreNoise > 0.48) {
                voxels[index] = BlockType.COAL_ORE;
              } else {
                voxels[index] = BlockType.STONE;
              }
            }
          } else {
            // Above ground: Water if below sea level, otherwise Air
            if (y <= this.SEA_LEVEL) {
              voxels[index] = BlockType.WATER;
            } else {
              voxels[index] = BlockType.AIR;
            }
          }
        }

        // Tree candidate spot check on dry land
        if (height > this.SEA_LEVEL + 1 && (biome === BiomeType.FOREST || biome === BiomeType.PLAINS)) {
          // Semi-random deterministic tree placement
          const treeChance = (biome === BiomeType.FOREST) ? 0.045 : 0.008;
          const hash = Math.sin(wx * 12.9898 + wz * 78.233) * 43758.5453;
          const rand = hash - Math.floor(hash);

          // Avoid chunk border to prevent cut off trunks
          if (rand < treeChance && lx >= 2 && lx <= 13 && lz >= 2 && lz <= 13) {
            trees.push({ x: lx, y: height + 1, z: lz });
          }
        }
      }
    }

    // Place trees in chunk voxel buffer
    for (const tree of trees) {
      this.growTree(voxels, tree.x, tree.y, tree.z);
    }
  }

  private growTree(voxels: Uint8Array, rootX: number, rootY: number, rootZ: number): void {
    const CHUNK_SIZE = 16;
    const CHUNK_HEIGHT = this.CHUNK_HEIGHT;
    const trunkHeight = 5;

    const setBlock = (lx: number, ly: number, lz: number, type: BlockType) => {
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT) return;
      const idx = lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE;
      // Do not overwrite solid wood or bedrock
      if (voxels[idx] === BlockType.AIR || voxels[idx] === BlockType.OAK_LEAVES) {
        voxels[idx] = type;
      }
    };

    // Oak trunk
    for (let dy = 0; dy < trunkHeight; dy++) {
      const idx = rootX + rootZ * CHUNK_SIZE + (rootY + dy) * CHUNK_SIZE * CHUNK_SIZE;
      if (rootY + dy < CHUNK_HEIGHT) {
        voxels[idx] = BlockType.OAK_WOOD;
      }
    }

    // Canopy leaves (5x5 layer at trunk top-1, then 3x3 layer at trunk top)
    const topY = rootY + trunkHeight;

    // 5x5 bottom canopy
    for (let ox = -2; ox <= 2; ox++) {
      for (let oz = -2; oz <= 2; oz++) {
        // Skip extreme corners for natural round shape
        if (Math.abs(ox) === 2 && Math.abs(oz) === 2) continue;
        setBlock(rootX + ox, topY - 2, rootZ + oz, BlockType.OAK_LEAVES);
        setBlock(rootX + ox, topY - 1, rootZ + oz, BlockType.OAK_LEAVES);
      }
    }

    // 3x3 top canopy
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        setBlock(rootX + ox, topY, rootZ + oz, BlockType.OAK_LEAVES);
      }
    }
    // Crown leaf at apex
    setBlock(rootX, topY + 1, rootZ, BlockType.OAK_LEAVES);
  }
}
