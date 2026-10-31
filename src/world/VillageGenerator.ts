import { BlockType } from './Block.ts';
import { Chunk } from './Chunk.ts';

export interface StructureBlock {
  worldX: number;
  worldY: number;
  worldZ: number;
  blockType: BlockType;
}

export class VillageGenerator {
  public centerWorldX = 32;
  public centerWorldZ = 32;
  public villageRadius = 50;

  private villageBlocks: Map<string, BlockType> = new Map();
  private villageTorches: Array<{ x: number; y: number; z: number }> = [];
  private isGenerated = false;

  constructor(centerX = 32, centerZ = 32) {
    this.centerWorldX = centerX;
    this.centerWorldZ = centerZ;
  }

  public init(getGroundHeight: (x: number, z: number) => number): void {
    if (this.isGenerated) return;

    const cx = this.centerWorldX;
    const cz = this.centerWorldZ;
    const baseGroundY = getGroundHeight(cx, cz);

    // 1. Build Village Town Well (Center Plaza)
    this.buildTownWell(cx, baseGroundY, cz);

    // 2. Build Paths radiating out from Well
    this.buildPaths(cx, cz, getGroundHeight);

    // 3. Build Village Houses
    this.buildHouse(cx + 12, getGroundHeight(cx + 12, cz + 10), cz + 10, 6, 5, 6); // House 1 (East)
    this.buildHouse(cx - 16, getGroundHeight(cx - 16, cz + 8), cz + 8, 5, 5, 5);  // House 2 (West)
    this.buildBlacksmith(cx + 10, getGroundHeight(cx + 10, cz - 16), cz - 16);     // Blacksmith (North-East)
    this.buildHouse(cx - 12, getGroundHeight(cx - 12, cz - 14), cz - 14, 6, 6, 6); // Large House (North-West)

    // 4. Build Farmland & Crops
    this.buildFarmPlot(cx - 2, getGroundHeight(cx - 2, cz + 18), cz + 18);
    this.buildFarmPlot(cx + 16, getGroundHeight(cx + 16, cz - 2), cz - 2);

    // 5. Build Street Lamp Posts
    this.buildLampPost(cx + 4, getGroundHeight(cx + 4, cz + 4), cz + 4);
    this.buildLampPost(cx - 4, getGroundHeight(cx - 4, cz - 4), cz - 4);
    this.buildLampPost(cx + 18, getGroundHeight(cx + 18, cz + 14), cz + 14);
    this.buildLampPost(cx - 18, getGroundHeight(cx - 18, cz + 12), cz + 12);

    this.isGenerated = true;
  }

  private setVoxel(x: number, y: number, z: number, type: BlockType): void {
    const key = `${x},${y},${z}`;
    this.villageBlocks.set(key, type);
    if (type === BlockType.TORCH) {
      this.villageTorches.push({ x, y, z });
    }
  }

  public getBlock(x: number, y: number, z: number): BlockType | null {
    const key = `${x},${y},${z}`;
    return this.villageBlocks.get(key) ?? null;
  }

  public getTorches(): Array<{ x: number; y: number; z: number }> {
    return this.villageTorches;
  }

  public populateChunk(chunk: Chunk): void {
    const baseX = chunk.chunkX * Chunk.SIZE;
    const baseZ = chunk.chunkZ * Chunk.SIZE;

    for (let lx = 0; lx < Chunk.SIZE; lx++) {
      for (let lz = 0; lz < Chunk.SIZE; lz++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;

        for (let ly = 1; ly < Chunk.HEIGHT; ly++) {
          const key = `${wx},${ly},${wz}`;
          const b = this.villageBlocks.get(key);
          if (b !== undefined) {
            chunk.setBlock(lx, ly, lz, b);
          }
        }
      }
    }
  }

  // --- Village Structures ---

  private buildTownWell(cx: number, cy: number, cz: number): void {
    // 4x4 Cobblestone rim with water inside
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        const isBorder = Math.abs(x) === 2 || Math.abs(z) === 2;
        if (isBorder) {
          // Cobblestone rim
          this.setVoxel(cx + x, cy, cz + z, BlockType.COBBLESTONE);
          this.setVoxel(cx + x, cy + 1, cz + z, BlockType.COBBLESTONE);
        } else {
          // Water reservoir (3 blocks deep)
          this.setVoxel(cx + x, cy - 2, cz + z, BlockType.WATER);
          this.setVoxel(cx + x, cy - 1, cz + z, BlockType.WATER);
          this.setVoxel(cx + x, cy, cz + z, BlockType.WATER);
          this.setVoxel(cx + x, cy + 1, cz + z, BlockType.AIR);
        }
      }
    }

    // 4 Corner Wooden Posts
    for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      this.setVoxel(cx + px, cy + 2, cz + pz, BlockType.OAK_WOOD);
      this.setVoxel(cx + px, cy + 3, cz + pz, BlockType.OAK_WOOD);
    }

    // Well Roof
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        this.setVoxel(cx + x, cy + 4, cz + z, BlockType.PLANKS);
      }
    }
    this.setVoxel(cx, cy + 5, cz, BlockType.COBBLESTONE);
    this.setVoxel(cx, cy + 3, cz, BlockType.TORCH);
  }

  private buildPaths(cx: number, cz: number, getGroundHeight: (x: number, z: number) => number): void {
    const length = 28;
    // Paths extending North, South, East, West
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (const [dx, dz] of directions) {
      for (let i = 2; i < length; i++) {
        for (let w = -1; w <= 1; w++) {
          const px = cx + dx * i + (dz !== 0 ? w : 0);
          const pz = cz + dz * i + (dx !== 0 ? w : 0);
          const gy = getGroundHeight(px, pz);

          // Path surface: Cobblestone and Planks mixture
          const pathBlock = ((px + pz) % 3 === 0) ? BlockType.COBBLESTONE : BlockType.PLANKS;
          this.setVoxel(px, gy, pz, pathBlock);
          // Clear air above path
          this.setVoxel(px, gy + 1, pz, BlockType.AIR);
          this.setVoxel(px, gy + 2, pz, BlockType.AIR);
        }
      }
    }
  }

  private buildHouse(x: number, y: number, z: number, width = 6, height = 5, depth = 6): void {
    // Foundation & Floor
    for (let dx = 0; dx < width; dx++) {
      for (let dz = 0; dz < depth; dz++) {
        this.setVoxel(x + dx, y, z + dz, BlockType.COBBLESTONE);
      }
    }

    // Walls & Corners
    for (let dy = 1; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        for (let dz = 0; dz < depth; dz++) {
          const isEdgeX = dx === 0 || dx === width - 1;
          const isEdgeZ = dz === 0 || dz === depth - 1;
          const isCorner = isEdgeX && isEdgeZ;
          const isWall = isEdgeX || isEdgeZ;

          if (isCorner) {
            // Wood Log Corners
            this.setVoxel(x + dx, y + dy, z + dz, BlockType.OAK_WOOD);
          } else if (isWall) {
            // Doorway on front
            if (dx === Math.floor(width / 2) && dz === 0 && (dy === 1 || dy === 2)) {
              this.setVoxel(x + dx, y + dy, z + dz, BlockType.AIR);
            } else if (dy === 2 && (dx === 2 || dx === width - 3 || dz === 2)) {
              // Glass Windows
              this.setVoxel(x + dx, y + dy, z + dz, BlockType.GLASS);
            } else {
              // Oak Planks Wall
              this.setVoxel(x + dx, y + dy, z + dz, BlockType.PLANKS);
            }
          } else {
            // Hollow Interior
            this.setVoxel(x + dx, y + dy, z + dz, BlockType.AIR);
          }
        }
      }
    }

    // Roof (Pyramid / Gable roof)
    for (let dx = -1; dx <= width; dx++) {
      for (let dz = -1; dz <= depth; dz++) {
        this.setVoxel(x + dx, y + height, z + dz, BlockType.PLANKS);
      }
    }
    for (let dx = 1; dx < width - 1; dx++) {
      for (let dz = 1; dz < depth - 1; dz++) {
        this.setVoxel(x + dx, y + height + 1, z + dz, BlockType.COBBLESTONE);
      }
    }

    // Cozy Interior Torches
    this.setVoxel(x + 1, y + 3, z + 1, BlockType.TORCH);
    this.setVoxel(x + width - 2, y + 3, z + depth - 2, BlockType.TORCH);
  }

  private buildBlacksmith(x: number, y: number, z: number): void {
    const width = 7;
    const depth = 6;
    const height = 4;

    // Stone Foundation
    for (let dx = 0; dx < width; dx++) {
      for (let dz = 0; dz < depth; dz++) {
        this.setVoxel(x + dx, y, z + dz, BlockType.COBBLESTONE);
      }
    }

    // Cobblestone Walls with open front porch
    for (let dy = 1; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        for (let dz = 0; dz < depth; dz++) {
          const isEdgeX = dx === 0 || dx === width - 1;
          const isEdgeZ = dz === 0 || dz === depth - 1;

          // Open front porch
          if (dz === 0 && dx >= 2 && dx <= 4) {
            this.setVoxel(x + dx, y + dy, z + dz, BlockType.AIR);
            continue;
          }

          if (isEdgeX || isEdgeZ) {
            this.setVoxel(x + dx, y + dy, z + dz, BlockType.COBBLESTONE);
          } else {
            this.setVoxel(x + dx, y + dy, z + dz, BlockType.AIR);
          }
        }
      }
    }

    // Blacksmith flat roof
    for (let dx = 0; dx < width; dx++) {
      for (let dz = 0; dz < depth; dz++) {
        this.setVoxel(x + dx, y + height, z + dz, BlockType.STONE);
      }
    }

    // Furnaces / Iron Ore display inside
    this.setVoxel(x + 1, y + 1, z + 2, BlockType.IRON_ORE);
    this.setVoxel(x + 1, y + 1, z + 3, BlockType.COAL_ORE);
    this.setVoxel(x + 2, y + 2, z + 1, BlockType.TORCH);
  }

  private buildFarmPlot(x: number, y: number, z: number): void {
    const width = 7;
    const depth = 5;

    // Wooden Border
    for (let dx = 0; dx < width; dx++) {
      for (let dz = 0; dz < depth; dz++) {
        const isBorder = dx === 0 || dx === width - 1 || dz === 0 || dz === depth - 1;
        const isWaterCanal = dx === Math.floor(width / 2);

        if (isBorder) {
          this.setVoxel(x + dx, y, z + dz, BlockType.OAK_WOOD);
          this.setVoxel(x + dx, y + 1, z + dz, BlockType.AIR);
        } else if (isWaterCanal) {
          // Central irrigation canal
          this.setVoxel(x + dx, y, z + dz, BlockType.WATER);
          this.setVoxel(x + dx, y + 1, z + dz, BlockType.AIR);
        } else {
          // Farmland Dirt with Green Crops/Leaves on top
          this.setVoxel(x + dx, y, z + dz, BlockType.DIRT);
          this.setVoxel(x + dx, y + 1, z + dz, BlockType.OAK_LEAVES);
          this.setVoxel(x + dx, y + 2, z + dz, BlockType.AIR);
        }
      }
    }
  }

  private buildLampPost(x: number, y: number, z: number): void {
    // 3 Oak Wood fence post blocks
    this.setVoxel(x, y + 1, z, BlockType.OAK_WOOD);
    this.setVoxel(x, y + 2, z, BlockType.OAK_WOOD);
    this.setVoxel(x, y + 3, z, BlockType.OAK_WOOD);
    // Cobblestone top
    this.setVoxel(x, y + 4, z, BlockType.COBBLESTONE);
    // Glowing Torches on sides
    this.setVoxel(x + 1, y + 4, z, BlockType.TORCH);
    this.setVoxel(x - 1, y + 4, z, BlockType.TORCH);
  }
}
