import * as THREE from 'three';
import { ATLAS_INDEX } from './Block.ts';

export class TextureAtlas {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public texture: THREE.CanvasTexture;
  public readonly tileSize = 64;
  public readonly atlasGrid = 8; // 8x8 tiles = 512x512 texture
  public readonly totalSize = 512;

  // Cache for quick UI icons
  private iconCache: Map<number, string> = new Map();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.totalSize;
    this.canvas.height = this.totalSize;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Could not create 2D canvas context');
    this.ctx = context;

    this.generateAtlas();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestMipmapLinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  private getTileCoord(index: number): { x: number; y: number } {
    const col = index % this.atlasGrid;
    const row = Math.floor(index / this.atlasGrid);
    return { x: col * this.tileSize, y: row * this.tileSize };
  }

  public getUV(index: number): { uMin: number; vMin: number; uMax: number; vMax: number } {
    const col = index % this.atlasGrid;
    const row = Math.floor(index / this.atlasGrid);
    // In WebGL, V is 0 at bottom, 1 at top
    const uMin = col / this.atlasGrid;
    const uMax = (col + 1) / this.atlasGrid;
    const vMax = 1.0 - (row / this.atlasGrid);
    const vMin = 1.0 - ((row + 1) / this.atlasGrid);
    return { uMin, vMin, uMax, vMax };
  }

  public getIconDataURL(index: number): string {
    if (this.iconCache.has(index)) {
      return this.iconCache.get(index)!;
    }
    const { x, y } = this.getTileCoord(index);
    const temp = document.createElement('canvas');
    temp.width = this.tileSize;
    temp.height = this.tileSize;
    const tctx = temp.getContext('2d')!;
    tctx.drawImage(this.canvas, x, y, this.tileSize, this.tileSize, 0, 0, this.tileSize, this.tileSize);
    const dataUrl = temp.toDataURL('image/png');
    this.iconCache.set(index, dataUrl);
    return dataUrl;
  }

  private generateAtlas(): void {
    // Clear with transparent black
    this.ctx.clearRect(0, 0, this.totalSize, this.totalSize);

    this.drawGrassTop(ATLAS_INDEX.GRASS_TOP);
    this.drawGrassSide(ATLAS_INDEX.GRASS_SIDE);
    this.drawDirt(ATLAS_INDEX.DIRT);
    this.drawStone(ATLAS_INDEX.STONE);
    this.drawCobblestone(ATLAS_INDEX.COBBLESTONE);
    this.drawOakWoodTop(ATLAS_INDEX.OAK_WOOD_TOP);
    this.drawOakWoodSide(ATLAS_INDEX.OAK_WOOD_SIDE);
    this.drawOakLeaves(ATLAS_INDEX.OAK_LEAVES);
    this.drawSand(ATLAS_INDEX.SAND);
    this.drawWater(ATLAS_INDEX.WATER);
    this.drawBedrock(ATLAS_INDEX.BEDROCK);
    this.drawOre(ATLAS_INDEX.COAL_ORE, '#222222', '#111111');
    this.drawOre(ATLAS_INDEX.IRON_ORE, '#d8af93', '#b88b6f');
    this.drawOre(ATLAS_INDEX.GOLD_ORE, '#fcee4b', '#d6b829');
    this.drawOre(ATLAS_INDEX.DIAMOND_ORE, '#55ffff', '#2cb8b8');
    this.drawGlass(ATLAS_INDEX.GLASS);
    this.drawBricks(ATLAS_INDEX.BRICKS);
    this.drawPlanks(ATLAS_INDEX.PLANKS);
    this.drawSnowTop(ATLAS_INDEX.SNOW_TOP);
    this.drawSnowSide(ATLAS_INDEX.SNOW_SIDE);
    this.drawTorch(ATLAS_INDEX.TORCH);
  }

  // --- Procedural Shader-Quality Texture Renderers ---

  private drawGrassTop(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;
    const imgData = this.ctx.createImageData(s, s);
    const data = imgData.data;

    for (let py = 0; py < s; py++) {
      for (let px = 0; px < s; px++) {
        const i = (py * s + px) * 4;
        const noise = (Math.sin(px * 0.4) + Math.cos(py * 0.4) + (Math.random() - 0.5) * 1.5) * 12;
        const r = Math.max(0, Math.min(255, 68 + noise));
        const g = Math.max(0, Math.min(255, 142 + noise * 1.4));
        const b = Math.max(0, Math.min(255, 38 + noise * 0.8));
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    this.ctx.putImageData(imgData, x, y);
  }

  private drawDirt(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;
    const imgData = this.ctx.createImageData(s, s);
    const data = imgData.data;

    for (let py = 0; py < s; py++) {
      for (let px = 0; px < s; px++) {
        const i = (py * s + px) * 4;
        const noise = ((Math.random() - 0.5) * 30) + Math.sin(px * 0.2 + py * 0.3) * 10;
        const r = Math.max(0, Math.min(255, 120 + noise));
        const g = Math.max(0, Math.min(255, 82 + noise * 0.7));
        const b = Math.max(0, Math.min(255, 52 + noise * 0.5));
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    this.ctx.putImageData(imgData, x, y);
  }

  private drawGrassSide(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;
    // Draw dirt base first
    this.drawDirt(index);

    // Draw jagged grass overlay on top edge
    this.ctx.save();
    for (let px = 0; px < s; px++) {
      const overhang = Math.floor(10 + Math.sin(px * 0.5) * 4 + ((px * 17) % 7));
      for (let py = 0; py < overhang; py++) {
        const noise = (Math.random() - 0.5) * 20;
        const r = Math.floor(Math.max(0, Math.min(255, 68 + noise)));
        const g = Math.floor(Math.max(0, Math.min(255, 142 + noise * 1.4)));
        const b = Math.floor(Math.max(0, Math.min(255, 38 + noise * 0.8)));
        this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        this.ctx.fillRect(x + px, y + py, 1, 1);
      }
    }
    this.ctx.restore();
  }

  private drawStone(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;
    const imgData = this.ctx.createImageData(s, s);
    const data = imgData.data;

    for (let py = 0; py < s; py++) {
      for (let px = 0; px < s; px++) {
        const i = (py * s + px) * 4;
        const strata = Math.sin(py * 0.35 + px * 0.1) * 8;
        const noise = (Math.random() - 0.5) * 25 + strata;
        const base = Math.max(0, Math.min(255, 125 + noise));
        data[i] = base;
        data[i + 1] = base;
        data[i + 2] = base + 3; // slight cool slate tone
        data[i + 3] = 255;
      }
    }
    this.ctx.putImageData(imgData, x, y);
  }

  private drawCobblestone(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;
    this.drawStone(index);

    this.ctx.save();
    // Draw rounded stones with darker mortar lines
    for (let cy = 0; cy < s; cy += 16) {
      for (let cx = 0; cx < s; cx += 16) {
        const ox = (cy % 32 === 0) ? 0 : 8;
        const stoneX = x + ((cx + ox) % s);
        const stoneY = y + cy;
        
        this.ctx.strokeStyle = 'rgba(40, 40, 45, 0.7)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(stoneX + 1, stoneY + 1, 14, 14);

        this.ctx.fillStyle = 'rgba(180, 180, 190, 0.2)';
        this.ctx.fillRect(stoneX + 2, stoneY + 2, 6, 6);
      }
    }
    this.ctx.restore();
  }

  private drawOakWoodSide(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;
    const imgData = this.ctx.createImageData(s, s);
    const data = imgData.data;

    for (let py = 0; py < s; py++) {
      for (let px = 0; px < s; px++) {
        const i = (py * s + px) * 4;
        const barkFibers = Math.sin(px * 0.8 + Math.cos(py * 0.15) * 2) * 20;
        const noise = (Math.random() - 0.5) * 15 + barkFibers;
        const r = Math.max(0, Math.min(255, 105 + noise));
        const g = Math.max(0, Math.min(255, 75 + noise * 0.7));
        const b = Math.max(0, Math.min(255, 45 + noise * 0.5));
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    this.ctx.putImageData(imgData, x, y);
  }

  private drawOakWoodTop(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;
    const center = s / 2;

    this.ctx.fillStyle = '#8f683d';
    this.ctx.fillRect(x, y, s, s);

    // Tree rings
    this.ctx.save();
    this.ctx.lineWidth = 1.5;
    for (let r = 4; r < s / 2 - 2; r += 4) {
      this.ctx.strokeStyle = (r % 8 === 0) ? '#684a28' : '#aa8252';
      this.ctx.beginPath();
      this.ctx.arc(x + center, y + center, r, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Outer bark border
    this.ctx.strokeStyle = '#523719';
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
    this.ctx.restore();
  }

  private drawOakLeaves(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;
    const imgData = this.ctx.createImageData(s, s);
    const data = imgData.data;

    for (let py = 0; py < s; py++) {
      for (let px = 0; px < s; px++) {
        const i = (py * s + px) * 4;
        // Dappled foliage with cutout holes
        const isHole = (px % 4 === 0 && py % 4 === 0 && Math.random() > 0.4);
        if (isHole) {
          data[i + 3] = 0;
          continue;
        }
        const noise = (Math.random() - 0.5) * 35;
        data[i] = Math.max(0, Math.min(255, 45 + noise));
        data[i + 1] = Math.max(0, Math.min(255, 120 + noise * 1.2));
        data[i + 2] = Math.max(0, Math.min(255, 30 + noise * 0.8));
        data[i + 3] = 230; // semi-translucent
      }
    }
    this.ctx.putImageData(imgData, x, y);
  }

  private drawSand(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;
    const imgData = this.ctx.createImageData(s, s);
    const data = imgData.data;

    for (let py = 0; py < s; py++) {
      for (let px = 0; px < s; px++) {
        const i = (py * s + px) * 4;
        const ripple = Math.sin((px + py * 0.5) * 0.2) * 6;
        const noise = (Math.random() - 0.5) * 16 + ripple;
        data[i] = Math.max(0, Math.min(255, 218 + noise));
        data[i + 1] = Math.max(0, Math.min(255, 198 + noise * 0.9));
        data[i + 2] = Math.max(0, Math.min(255, 148 + noise * 0.7));
        data[i + 3] = 255;
      }
    }
    this.ctx.putImageData(imgData, x, y);
  }

  private drawWater(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;
    const imgData = this.ctx.createImageData(s, s);
    const data = imgData.data;

    for (let py = 0; py < s; py++) {
      for (let px = 0; px < s; px++) {
        const i = (py * s + px) * 4;
        const wave = Math.sin(px * 0.25) * Math.cos(py * 0.25) * 15;
        data[i] = Math.max(0, Math.min(255, 30 + wave * 0.5));
        data[i + 1] = Math.max(0, Math.min(255, 110 + wave));
        data[i + 2] = Math.max(0, Math.min(255, 220 + wave * 1.2));
        data[i + 3] = 190; // translucent water
      }
    }
    this.ctx.putImageData(imgData, x, y);
  }

  private drawBedrock(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;
    const imgData = this.ctx.createImageData(s, s);
    const data = imgData.data;

    for (let py = 0; py < s; py++) {
      for (let px = 0; px < s; px++) {
        const i = (py * s + px) * 4;
        const noise = (Math.random() - 0.5) * 40;
        const val = Math.max(0, Math.min(255, 50 + noise));
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
        data[i + 3] = 255;
      }
    }
    this.ctx.putImageData(imgData, x, y);
  }

  private drawOre(index: number, primaryColor: string, secondaryColor: string): void {
    const { x, y } = this.getTileCoord(index);
    this.drawStone(index);

    this.ctx.save();
    // Scatter realistic gem/mineral flecks
    const positions = [
      { ox: 12, oy: 14, w: 8, h: 6 },
      { ox: 34, oy: 18, w: 9, h: 7 },
      { ox: 20, oy: 36, w: 10, h: 8 },
      { ox: 44, oy: 42, w: 7, h: 6 },
      { ox: 8, oy: 46, w: 6, h: 6 }
    ];

    for (const pos of positions) {
      this.ctx.fillStyle = secondaryColor;
      this.ctx.fillRect(x + pos.ox - 1, y + pos.oy - 1, pos.w + 2, pos.h + 2);
      this.ctx.fillStyle = primaryColor;
      this.ctx.fillRect(x + pos.ox, y + pos.oy, pos.w, pos.h);
      // Sparkle highlight
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(x + pos.ox + 1, y + pos.oy + 1, 2, 2);
    }
    this.ctx.restore();
  }

  private drawGlass(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;

    this.ctx.clearRect(x, y, s, s);
    this.ctx.fillStyle = 'rgba(215, 235, 255, 0.25)';
    this.ctx.fillRect(x, y, s, s);

    // Beveled frame
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);

    this.ctx.strokeStyle = 'rgba(180, 210, 240, 0.7)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x + 3, y + 3, s - 6, s - 6);

    // Diagonal glass glare lines
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x + 14, y + 4);
    this.ctx.lineTo(x + 4, y + 14);
    this.ctx.moveTo(x + 28, y + 4);
    this.ctx.lineTo(x + 4, y + 28);
    this.ctx.stroke();
  }

  private drawBricks(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;

    this.ctx.fillStyle = '#d0d3d4'; // mortar
    this.ctx.fillRect(x, y, s, s);

    this.ctx.fillStyle = '#9e4436';
    const brickH = 14;
    const brickW = 28;

    for (let r = 0; r < 4; r++) {
      const by = y + r * (brickH + 2) + 1;
      const shift = (r % 2 === 0) ? 0 : 15;
      for (let bx = x - 15 + shift; bx < x + s; bx += brickW + 2) {
        const renderX = Math.max(x + 1, bx);
        const renderW = Math.min(bx + brickW, x + s - 1) - renderX;
        if (renderW > 0) {
          this.ctx.fillRect(renderX, by, renderW, brickH);
        }
      }
    }
  }

  private drawPlanks(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;

    this.ctx.fillStyle = '#bc9862';
    this.ctx.fillRect(x, y, s, s);

    this.ctx.strokeStyle = '#7c5e34';
    this.ctx.lineWidth = 2;

    // 4 horizontal wooden planks
    for (let py = 16; py < s; py += 16) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, y + py);
      this.ctx.lineTo(x + s, y + py);
      this.ctx.stroke();
    }

    // Vertical seam lines
    this.ctx.beginPath();
    this.ctx.moveTo(x + 24, y);
    this.ctx.lineTo(x + 24, y + 16);
    this.ctx.moveTo(x + 44, y + 16);
    this.ctx.lineTo(x + 44, y + 32);
    this.ctx.moveTo(x + 18, y + 32);
    this.ctx.lineTo(x + 18, y + 48);
    this.ctx.moveTo(x + 36, y + 48);
    this.ctx.lineTo(x + 36, y + 64);
    this.ctx.stroke();
  }

  private drawSnowTop(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;
    const imgData = this.ctx.createImageData(s, s);
    const data = imgData.data;

    for (let py = 0; py < s; py++) {
      for (let px = 0; px < s; px++) {
        const i = (py * s + px) * 4;
        const sparkle = (Math.random() - 0.5) * 12;
        const val = Math.max(0, Math.min(255, 245 + sparkle));
        data[i] = val;
        data[i + 1] = Math.min(255, val + 4);
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
    this.ctx.putImageData(imgData, x, y);
  }

  private drawSnowSide(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;
    this.drawDirt(index);

    this.ctx.save();
    for (let px = 0; px < s; px++) {
      const drop = Math.floor(14 + Math.sin(px * 0.4) * 4 + ((px * 13) % 5));
      for (let py = 0; py < drop; py++) {
        this.ctx.fillStyle = '#f5faff';
        this.ctx.fillRect(x + px, y + py, 1, 1);
      }
    }
    this.ctx.restore();
  }

  private drawTorch(index: number): void {
    const { x, y } = this.getTileCoord(index);
    const s = this.tileSize;
    this.ctx.clearRect(x, y, s, s);

    // Wooden shaft
    this.ctx.fillStyle = '#7c582f';
    this.ctx.fillRect(x + 28, y + 24, 8, 36);

    // Charcoal head
    this.ctx.fillStyle = '#222222';
    this.ctx.fillRect(x + 27, y + 20, 10, 6);

    // Fiery flame
    this.ctx.fillStyle = '#ff4500';
    this.ctx.fillRect(x + 26, y + 10, 12, 12);
    this.ctx.fillStyle = '#ffa500';
    this.ctx.fillRect(x + 28, y + 8, 8, 10);
    this.ctx.fillStyle = '#ffff66';
    this.ctx.fillRect(x + 30, y + 6, 4, 6);
  }
}
