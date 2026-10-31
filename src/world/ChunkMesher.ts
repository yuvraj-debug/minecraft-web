import * as THREE from 'three';
import { Chunk } from './Chunk.ts';
import { BlockType, BLOCK_DEFS } from './Block.ts';
import { TextureAtlas } from './TextureAtlas.ts';

// Face direction vectors
const FACES = [
  { dir: [0, 1, 0], name: 'top', normal: [0, 1, 0] },
  { dir: [0, -1, 0], name: 'bottom', normal: [0, -1, 0] },
  { dir: [0, 0, 1], name: 'north', normal: [0, 0, 1] },
  { dir: [0, 0, -1], name: 'south', normal: [0, 0, -1] },
  { dir: [1, 0, 0], name: 'east', normal: [1, 0, 0] },
  { dir: [-1, 0, 0], name: 'west', normal: [-1, 0, 0] }
];

export interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

export class ChunkMesher {
  private atlas: TextureAtlas;

  constructor(atlas: TextureAtlas) {
    this.atlas = atlas;
  }

  public meshChunk(
    chunk: Chunk,
    getBlockWorld: (wx: number, wy: number, wz: number) => BlockType
  ): { opaqueGeometry: THREE.BufferGeometry | null; waterGeometry: THREE.BufferGeometry | null } {
    const opaqueData: MeshData = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
    const waterData: MeshData = { positions: [], normals: [], uvs: [], colors: [], indices: [] };

    const baseX = chunk.chunkX * Chunk.SIZE;
    const baseZ = chunk.chunkZ * Chunk.SIZE;

    // Helper to query block with neighbor chunk awareness
    const getBlock = (x: number, y: number, z: number): BlockType => {
      if (x >= 0 && x < Chunk.SIZE && z >= 0 && z < Chunk.SIZE && y >= 0 && y < Chunk.HEIGHT) {
        return chunk.getBlock(x, y, z);
      }
      return getBlockWorld(baseX + x, y, baseZ + z);
    };

    const isOpaque = (type: BlockType): boolean => {
      if (type === BlockType.AIR) return false;
      const def = BLOCK_DEFS[type];
      return def ? (!def.isTransparent && def.isSolid) : false;
    };

    // Calculate vertex Ambient Occlusion (0 to 3)
    const getVertexAO = (side1: boolean, side2: boolean, corner: boolean): number => {
      if (side1 && side2) return 0;
      return 3 - ((side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0));
    };

    const aoFactors = [0.4, 0.62, 0.82, 1.0];

    for (let lx = 0; lx < Chunk.SIZE; lx++) {
      for (let lz = 0; lz < Chunk.SIZE; lz++) {
        for (let ly = 0; ly < Chunk.HEIGHT; ly++) {
          const block = chunk.getBlock(lx, ly, lz);
          if (block === BlockType.AIR) continue;

          const def = BLOCK_DEFS[block];
          if (!def) continue;

          // Special rendering for Torch (slender model)
          if (block === BlockType.TORCH) {
            this.buildTorchMesh(opaqueData, lx, ly, lz);
            continue;
          }

          // Separate water fluid meshing
          if (block === BlockType.WATER) {
            this.buildWaterVoxel(waterData, lx, ly, lz, getBlock);
            continue;
          }

          // Solid block face generation
          for (const face of FACES) {
            const [dx, dy, dz] = face.dir;
            const nx = lx + dx;
            const ny = ly + dy;
            const nz = lz + dz;

            const neighborBlock = getBlock(nx, ny, nz);
            const neighborDef = BLOCK_DEFS[neighborBlock];

            // Render face if neighbor is transparent, fluid, or different translucent block (e.g. leaves against air)
            let renderFace = false;
            if (neighborBlock === BlockType.AIR || neighborBlock === BlockType.WATER) {
              renderFace = true;
            } else if (neighborDef && neighborDef.isTransparent) {
              // Only don't render if same leaf block to avoid interior clutter
              renderFace = !(block === BlockType.OAK_LEAVES && neighborBlock === BlockType.OAK_LEAVES);
            }

            if (!renderFace) continue;

            // Texture UV mapping
            let texIndex = def.textures.side;
            if (face.name === 'top') texIndex = def.textures.top;
            else if (face.name === 'bottom') texIndex = def.textures.bottom;

            const { uMin, vMin, uMax, vMax } = this.atlas.getUV(texIndex);

            // Compute Ambient Occlusion on 4 corners of the quad
            let ao00 = 3, ao01 = 3, ao10 = 3, ao11 = 3;

            if (face.name === 'top') {
              const sW = isOpaque(getBlock(lx - 1, ly + 1, lz));
              const sE = isOpaque(getBlock(lx + 1, ly + 1, lz));
              const sS = isOpaque(getBlock(lx, ly + 1, lz - 1));
              const sN = isOpaque(getBlock(lx, ly + 1, lz + 1));
              const cSW = isOpaque(getBlock(lx - 1, ly + 1, lz - 1));
              const cSE = isOpaque(getBlock(lx + 1, ly + 1, lz - 1));
              const cNW = isOpaque(getBlock(lx - 1, ly + 1, lz + 1));
              const cNE = isOpaque(getBlock(lx + 1, ly + 1, lz + 1));

              // v00: NW, v10: NE, v01: SW, v11: SE
              ao00 = getVertexAO(sW, sN, cNW);
              ao10 = getVertexAO(sE, sN, cNE);
              ao01 = getVertexAO(sW, sS, cSW);
              ao11 = getVertexAO(sE, sS, cSE);
            } else if (face.name === 'bottom') {
              const sW = isOpaque(getBlock(lx - 1, ly - 1, lz));
              const sE = isOpaque(getBlock(lx + 1, ly - 1, lz));
              const sS = isOpaque(getBlock(lx, ly - 1, lz - 1));
              const sN = isOpaque(getBlock(lx, ly - 1, lz + 1));
              const cSW = isOpaque(getBlock(lx - 1, ly - 1, lz - 1));
              const cSE = isOpaque(getBlock(lx + 1, ly - 1, lz - 1));
              const cNW = isOpaque(getBlock(lx - 1, ly - 1, lz + 1));
              const cNE = isOpaque(getBlock(lx + 1, ly - 1, lz + 1));

              // v00: SW, v10: SE, v01: NW, v11: NE
              ao00 = getVertexAO(sW, sS, cSW);
              ao10 = getVertexAO(sE, sS, cSE);
              ao01 = getVertexAO(sW, sN, cNW);
              ao11 = getVertexAO(sE, sN, cNE);
            } else if (face.name === 'north') { // +Z
              const sW = isOpaque(getBlock(lx - 1, ly, lz + 1));
              const sE = isOpaque(getBlock(lx + 1, ly, lz + 1));
              const sD = isOpaque(getBlock(lx, ly - 1, lz + 1));
              const sU = isOpaque(getBlock(lx, ly + 1, lz + 1));
              const cDW = isOpaque(getBlock(lx - 1, ly - 1, lz + 1));
              const cDE = isOpaque(getBlock(lx + 1, ly - 1, lz + 1));
              const cUW = isOpaque(getBlock(lx - 1, ly + 1, lz + 1));
              const cUE = isOpaque(getBlock(lx + 1, ly + 1, lz + 1));

              ao00 = getVertexAO(sW, sD, cDW);
              ao10 = getVertexAO(sE, sD, cDE);
              ao01 = getVertexAO(sW, sU, cUW);
              ao11 = getVertexAO(sE, sU, cUE);
            } else if (face.name === 'south') { // -Z
              const sW = isOpaque(getBlock(lx - 1, ly, lz - 1));
              const sE = isOpaque(getBlock(lx + 1, ly, lz - 1));
              const sD = isOpaque(getBlock(lx, ly - 1, lz - 1));
              const sU = isOpaque(getBlock(lx, ly + 1, lz - 1));
              const cDW = isOpaque(getBlock(lx - 1, ly - 1, lz - 1));
              const cDE = isOpaque(getBlock(lx + 1, ly - 1, lz - 1));
              const cUW = isOpaque(getBlock(lx - 1, ly + 1, lz - 1));
              const cUE = isOpaque(getBlock(lx + 1, ly + 1, lz - 1));

              ao00 = getVertexAO(sE, sD, cDE);
              ao10 = getVertexAO(sW, sD, cDW);
              ao01 = getVertexAO(sE, sU, cUE);
              ao11 = getVertexAO(sW, sU, cUW);
            } else if (face.name === 'east') { // +X
              const sS = isOpaque(getBlock(lx + 1, ly, lz - 1));
              const sN = isOpaque(getBlock(lx + 1, ly, lz + 1));
              const sD = isOpaque(getBlock(lx + 1, ly - 1, lz));
              const sU = isOpaque(getBlock(lx + 1, ly + 1, lz));
              const cDS = isOpaque(getBlock(lx + 1, ly - 1, lz - 1));
              const cDN = isOpaque(getBlock(lx + 1, ly - 1, lz + 1));
              const cUS = isOpaque(getBlock(lx + 1, ly + 1, lz - 1));
              const cUN = isOpaque(getBlock(lx + 1, ly + 1, lz + 1));

              ao00 = getVertexAO(sS, sD, cDS);
              ao10 = getVertexAO(sN, sD, cDN);
              ao01 = getVertexAO(sS, sU, cUS);
              ao11 = getVertexAO(sN, sU, cUN);
            } else if (face.name === 'west') { // -X
              const sS = isOpaque(getBlock(lx - 1, ly, lz - 1));
              const sN = isOpaque(getBlock(lx - 1, ly, lz + 1));
              const sD = isOpaque(getBlock(lx - 1, ly - 1, lz));
              const sU = isOpaque(getBlock(lx - 1, ly + 1, lz));
              const cDS = isOpaque(getBlock(lx - 1, ly - 1, lz - 1));
              const cDN = isOpaque(getBlock(lx - 1, ly - 1, lz + 1));
              const cUS = isOpaque(getBlock(lx - 1, ly + 1, lz - 1));
              const cUN = isOpaque(getBlock(lx - 1, ly + 1, lz + 1));

              ao00 = getVertexAO(sN, sD, cDN);
              ao10 = getVertexAO(sS, sD, cDS);
              ao01 = getVertexAO(sN, sU, cUN);
              ao11 = getVertexAO(sS, sU, cUS);
            }

            this.addQuad(
              opaqueData,
              lx, ly, lz,
              face.name,
              face.normal,
              uMin, vMin, uMax, vMax,
              aoFactors[ao00], aoFactors[ao10], aoFactors[ao01], aoFactors[ao11]
            );
          }
        }
      }
    }

    return {
      opaqueGeometry: this.buildBufferGeometry(opaqueData),
      waterGeometry: this.buildBufferGeometry(waterData)
    };
  }

  private buildWaterVoxel(
    data: MeshData,
    lx: number, ly: number, lz: number,
    getBlock: (x: number, y: number, z: number) => BlockType
  ): void {
    // Water top face (only if block above is not water)
    const blockAbove = getBlock(lx, ly + 1, lz);
    if (blockAbove !== BlockType.WATER) {
      const { uMin, vMin, uMax, vMax } = this.atlas.getUV(BLOCK_DEFS[BlockType.WATER].textures.top);
      // Slightly recessed surface (0.88 instead of 1.0) for authentic water look
      const yOffset = 0.88;
      const startIndex = data.positions.length / 3;

      data.positions.push(
        lx, ly + yOffset, lz,
        lx + 1, ly + yOffset, lz,
        lx, ly + yOffset, lz + 1,
        lx + 1, ly + yOffset, lz + 1
      );

      data.normals.push(0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0);
      data.uvs.push(uMin, vMin,  uMax, vMin,  uMin, vMax,  uMax, vMax);
      data.colors.push(0.9, 0.95, 1.0,  0.9, 0.95, 1.0,  0.9, 0.95, 1.0,  0.9, 0.95, 1.0);

      data.indices.push(startIndex, startIndex + 2, startIndex + 1, startIndex + 1, startIndex + 2, startIndex + 3);
    }
  }

  private buildTorchMesh(data: MeshData, lx: number, ly: number, lz: number): void {
    const { uMin, vMin, uMax, vMax } = this.atlas.getUV(BLOCK_DEFS[BlockType.TORCH].textures.side);
    const start = data.positions.length / 3;

    // Slender central post (0.42 to 0.58 on X/Z, 0 to 0.65 on Y)
    const minX = lx + 0.42, maxX = lx + 0.58;
    const minZ = lz + 0.42, maxZ = lz + 0.58;
    const minY = ly, maxY = ly + 0.65;

    // 4 vertical sides
    data.positions.push(
      minX, minY, minZ,  maxX, minY, minZ,  minX, maxY, minZ,  maxX, maxY, minZ, // South
      maxX, minY, minZ,  maxX, minY, maxZ,  maxX, maxY, minZ,  maxX, maxY, maxZ, // East
      maxX, minY, maxZ,  minX, minY, maxZ,  maxX, maxY, maxZ,  minX, maxY, maxZ, // North
      minX, minY, maxZ,  minX, minY, minZ,  minX, maxY, maxZ,  minX, maxY, minZ  // West
    );

    for (let f = 0; f < 4; f++) {
      data.normals.push(0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1);
      data.uvs.push(uMin, vMin,  uMax, vMin,  uMin, vMax,  uMax, vMax);
      data.colors.push(1.2, 1.0, 0.8,  1.2, 1.0, 0.8,  1.2, 1.0, 0.8,  1.2, 1.0, 0.8);
      const s = start + f * 4;
      data.indices.push(s, s + 1, s + 2,  s + 1, s + 3, s + 2);
    }
  }

  private addQuad(
    data: MeshData,
    lx: number, ly: number, lz: number,
    face: string,
    normal: number[],
    uMin: number, vMin: number, uMax: number, vMax: number,
    ao00: number, ao10: number, ao01: number, ao11: number
  ): void {
    const startIndex = data.positions.length / 3;

    // Corner vertices (v00: bottom-left, v10: bottom-right, v01: top-left, v11: top-right)
    let v00 = [0, 0, 0], v10 = [0, 0, 0], v01 = [0, 0, 0], v11 = [0, 0, 0];

    switch (face) {
      case 'top':
        // CCW from above: (v10 - v00) x (v01 - v00) = +Y
        v00 = [lx, ly + 1, lz + 1];
        v10 = [lx + 1, ly + 1, lz + 1];
        v01 = [lx, ly + 1, lz];
        v11 = [lx + 1, ly + 1, lz];
        break;
      case 'bottom':
        // CCW from below: (v10 - v00) x (v01 - v00) = -Y
        v00 = [lx, ly, lz];
        v10 = [lx + 1, ly, lz];
        v01 = [lx, ly, lz + 1];
        v11 = [lx + 1, ly, lz + 1];
        break;
      case 'north': // +Z
        v00 = [lx, ly, lz + 1];
        v10 = [lx + 1, ly, lz + 1];
        v01 = [lx, ly + 1, lz + 1];
        v11 = [lx + 1, ly + 1, lz + 1];
        break;
      case 'south': // -Z
        v00 = [lx + 1, ly, lz];
        v10 = [lx, ly, lz];
        v01 = [lx + 1, ly + 1, lz];
        v11 = [lx, ly + 1, lz];
        break;
      case 'east': // +X
        v00 = [lx + 1, ly, lz + 1];
        v10 = [lx + 1, ly, lz];
        v01 = [lx + 1, ly + 1, lz + 1];
        v11 = [lx + 1, ly + 1, lz];
        break;
      case 'west': // -X
        v00 = [lx, ly, lz];
        v10 = [lx, ly, lz + 1];
        v01 = [lx, ly + 1, lz];
        v11 = [lx, ly + 1, lz + 1];
        break;
    }

    data.positions.push(...v00, ...v10, ...v01, ...v11);
    data.normals.push(...normal, ...normal, ...normal, ...normal);
    data.uvs.push(uMin, vMin,  uMax, vMin,  uMin, vMax,  uMax, vMax);

    // Apply AO shade to vertex color multiplier
    data.colors.push(
      ao00, ao00, ao00,
      ao10, ao10, ao10,
      ao01, ao01, ao01,
      ao11, ao11, ao11
    );

    // Quad diagonal flip to eliminate ambient occlusion lighting creases
    if (ao00 + ao11 > ao10 + ao01) {
      data.indices.push(
        startIndex, startIndex + 1, startIndex + 2,
        startIndex + 1, startIndex + 3, startIndex + 2
      );
    } else {
      data.indices.push(
        startIndex, startIndex + 1, startIndex + 3,
        startIndex, startIndex + 3, startIndex + 2
      );
    }
  }

  private buildBufferGeometry(data: MeshData): THREE.BufferGeometry | null {
    if (data.positions.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
    geometry.setIndex(data.indices);

    geometry.computeBoundingSphere();
    return geometry;
  }
}
