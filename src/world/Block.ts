export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  COBBLESTONE = 4,
  OAK_WOOD = 5,
  OAK_LEAVES = 6,
  SAND = 7,
  WATER = 8,
  BEDROCK = 9,
  COAL_ORE = 10,
  IRON_ORE = 11,
  GOLD_ORE = 12,
  DIAMOND_ORE = 13,
  GLASS = 14,
  BRICKS = 15,
  PLANKS = 16,
  SNOW = 17,
  TORCH = 18
}

export interface BlockDef {
  id: BlockType;
  name: string;
  isSolid: boolean;
  isTransparent: boolean;
  isFluid: boolean;
  lightLevel: number;
  hardness: number;
  soundType: 'grass' | 'stone' | 'wood' | 'sand' | 'water' | 'glass';
  // Atlas coordinate offsets (column, row in 8x8 or 16x16 grid)
  textures: {
    top: number;
    bottom: number;
    side: number;
  };
}

// Atlas index constants (0 to 63 in an 8x8 atlas)
export const ATLAS_INDEX = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  OAK_WOOD_TOP: 5,
  OAK_WOOD_SIDE: 6,
  OAK_LEAVES: 7,
  SAND: 8,
  WATER: 9,
  BEDROCK: 10,
  COAL_ORE: 11,
  IRON_ORE: 12,
  GOLD_ORE: 13,
  DIAMOND_ORE: 14,
  GLASS: 15,
  BRICKS: 16,
  PLANKS: 17,
  SNOW_TOP: 18,
  SNOW_SIDE: 19,
  TORCH: 20
};

export const BLOCK_DEFS: Record<BlockType, BlockDef> = {
  [BlockType.AIR]: {
    id: BlockType.AIR,
    name: 'Air',
    isSolid: false,
    isTransparent: true,
    isFluid: false,
    lightLevel: 0,
    hardness: 0,
    soundType: 'stone',
    textures: { top: 0, bottom: 0, side: 0 }
  },
  [BlockType.GRASS]: {
    id: BlockType.GRASS,
    name: 'Grass Block',
    isSolid: true,
    isTransparent: false,
    isFluid: false,
    lightLevel: 0,
    hardness: 0.6,
    soundType: 'grass',
    textures: {
      top: ATLAS_INDEX.GRASS_TOP,
      bottom: ATLAS_INDEX.DIRT,
      side: ATLAS_INDEX.GRASS_SIDE
    }
  },
  [BlockType.DIRT]: {
    id: BlockType.DIRT,
    name: 'Dirt',
    isSolid: true,
    isTransparent: false,
    isFluid: false,
    lightLevel: 0,
    hardness: 0.5,
    soundType: 'grass',
    textures: {
      top: ATLAS_INDEX.DIRT,
      bottom: ATLAS_INDEX.DIRT,
      side: ATLAS_INDEX.DIRT
    }
  },
  [BlockType.STONE]: {
    id: BlockType.STONE,
    name: 'Stone',
    isSolid: true,
    isTransparent: false,
    isFluid: false,
    lightLevel: 0,
    hardness: 1.5,
    soundType: 'stone',
    textures: {
      top: ATLAS_INDEX.STONE,
      bottom: ATLAS_INDEX.STONE,
      side: ATLAS_INDEX.STONE
    }
  },
  [BlockType.COBBLESTONE]: {
    id: BlockType.COBBLESTONE,
    name: 'Cobblestone',
    isSolid: true,
    isTransparent: false,
    isFluid: false,
    lightLevel: 0,
    hardness: 2.0,
    soundType: 'stone',
    textures: {
      top: ATLAS_INDEX.COBBLESTONE,
      bottom: ATLAS_INDEX.COBBLESTONE,
      side: ATLAS_INDEX.COBBLESTONE
    }
  },
  [BlockType.OAK_WOOD]: {
    id: BlockType.OAK_WOOD,
    name: 'Oak Wood Log',
    isSolid: true,
    isTransparent: false,
    isFluid: false,
    lightLevel: 0,
    hardness: 2.0,
    soundType: 'wood',
    textures: {
      top: ATLAS_INDEX.OAK_WOOD_TOP,
      bottom: ATLAS_INDEX.OAK_WOOD_TOP,
      side: ATLAS_INDEX.OAK_WOOD_SIDE
    }
  },
  [BlockType.OAK_LEAVES]: {
    id: BlockType.OAK_LEAVES,
    name: 'Oak Leaves',
    isSolid: true,
    isTransparent: true,
    isFluid: false,
    lightLevel: 0,
    hardness: 0.2,
    soundType: 'grass',
    textures: {
      top: ATLAS_INDEX.OAK_LEAVES,
      bottom: ATLAS_INDEX.OAK_LEAVES,
      side: ATLAS_INDEX.OAK_LEAVES
    }
  },
  [BlockType.SAND]: {
    id: BlockType.SAND,
    name: 'Sand',
    isSolid: true,
    isTransparent: false,
    isFluid: false,
    lightLevel: 0,
    hardness: 0.5,
    soundType: 'sand',
    textures: {
      top: ATLAS_INDEX.SAND,
      bottom: ATLAS_INDEX.SAND,
      side: ATLAS_INDEX.SAND
    }
  },
  [BlockType.WATER]: {
    id: BlockType.WATER,
    name: 'Water',
    isSolid: false,
    isTransparent: true,
    isFluid: true,
    lightLevel: 0,
    hardness: 100,
    soundType: 'water',
    textures: {
      top: ATLAS_INDEX.WATER,
      bottom: ATLAS_INDEX.WATER,
      side: ATLAS_INDEX.WATER
    }
  },
  [BlockType.BEDROCK]: {
    id: BlockType.BEDROCK,
    name: 'Bedrock',
    isSolid: true,
    isTransparent: false,
    isFluid: false,
    lightLevel: 0,
    hardness: 9999,
    soundType: 'stone',
    textures: {
      top: ATLAS_INDEX.BEDROCK,
      bottom: ATLAS_INDEX.BEDROCK,
      side: ATLAS_INDEX.BEDROCK
    }
  },
  [BlockType.COAL_ORE]: {
    id: BlockType.COAL_ORE,
    name: 'Coal Ore',
    isSolid: true,
    isTransparent: false,
    isFluid: false,
    lightLevel: 0,
    hardness: 3.0,
    soundType: 'stone',
    textures: {
      top: ATLAS_INDEX.COAL_ORE,
      bottom: ATLAS_INDEX.COAL_ORE,
      side: ATLAS_INDEX.COAL_ORE
    }
  },
  [BlockType.IRON_ORE]: {
    id: BlockType.IRON_ORE,
    name: 'Iron Ore',
    isSolid: true,
    isTransparent: false,
    isFluid: false,
    lightLevel: 0,
    hardness: 3.0,
    soundType: 'stone',
    textures: {
      top: ATLAS_INDEX.IRON_ORE,
      bottom: ATLAS_INDEX.IRON_ORE,
      side: ATLAS_INDEX.IRON_ORE
    }
  },
  [BlockType.GOLD_ORE]: {
    id: BlockType.GOLD_ORE,
    name: 'Gold Ore',
    isSolid: true,
    isTransparent: false,
    isFluid: false,
    lightLevel: 0,
    hardness: 3.0,
    soundType: 'stone',
    textures: {
      top: ATLAS_INDEX.GOLD_ORE,
      bottom: ATLAS_INDEX.GOLD_ORE,
      side: ATLAS_INDEX.GOLD_ORE
    }
  },
  [BlockType.DIAMOND_ORE]: {
    id: BlockType.DIAMOND_ORE,
    name: 'Diamond Ore',
    isSolid: true,
    isTransparent: false,
    isFluid: false,
    lightLevel: 0,
    hardness: 4.0,
    soundType: 'stone',
    textures: {
      top: ATLAS_INDEX.DIAMOND_ORE,
      bottom: ATLAS_INDEX.DIAMOND_ORE,
      side: ATLAS_INDEX.DIAMOND_ORE
    }
  },
  [BlockType.GLASS]: {
    id: BlockType.GLASS,
    name: 'Glass',
    isSolid: true,
    isTransparent: true,
    isFluid: false,
    lightLevel: 0,
    hardness: 0.3,
    soundType: 'glass',
    textures: {
      top: ATLAS_INDEX.GLASS,
      bottom: ATLAS_INDEX.GLASS,
      side: ATLAS_INDEX.GLASS
    }
  },
  [BlockType.BRICKS]: {
    id: BlockType.BRICKS,
    name: 'Bricks',
    isSolid: true,
    isTransparent: false,
    isFluid: false,
    lightLevel: 0,
    hardness: 2.0,
    soundType: 'stone',
    textures: {
      top: ATLAS_INDEX.BRICKS,
      bottom: ATLAS_INDEX.BRICKS,
      side: ATLAS_INDEX.BRICKS
    }
  },
  [BlockType.PLANKS]: {
    id: BlockType.PLANKS,
    name: 'Oak Planks',
    isSolid: true,
    isTransparent: false,
    isFluid: false,
    lightLevel: 0,
    hardness: 2.0,
    soundType: 'wood',
    textures: {
      top: ATLAS_INDEX.PLANKS,
      bottom: ATLAS_INDEX.PLANKS,
      side: ATLAS_INDEX.PLANKS
    }
  },
  [BlockType.SNOW]: {
    id: BlockType.SNOW,
    name: 'Snow Block',
    isSolid: true,
    isTransparent: false,
    isFluid: false,
    lightLevel: 0,
    hardness: 0.2,
    soundType: 'grass',
    textures: {
      top: ATLAS_INDEX.SNOW_TOP,
      bottom: ATLAS_INDEX.DIRT,
      side: ATLAS_INDEX.SNOW_SIDE
    }
  },
  [BlockType.TORCH]: {
    id: BlockType.TORCH,
    name: 'Torch',
    isSolid: false,
    isTransparent: true,
    isFluid: false,
    lightLevel: 14,
    hardness: 0.0,
    soundType: 'wood',
    textures: {
      top: ATLAS_INDEX.TORCH,
      bottom: ATLAS_INDEX.TORCH,
      side: ATLAS_INDEX.TORCH
    }
  }
};
