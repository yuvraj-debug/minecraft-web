import { BlockType, BLOCK_DEFS, BlockDef } from '../world/Block.ts';
import { World } from '../world/World.ts';
import { Atmosphere } from '../render/Atmosphere.ts';
import { Player } from '../player/Player.ts';
import { Hotbar } from './Hotbar.ts';

export class HUD {
  private world: World;
  private atmosphere: Atmosphere;
  private player: Player;
  private hotbar: Hotbar;

  // DOM Elements
  private inventoryModal: HTMLElement;
  private inventoryGrid: HTMLElement;
  private inventorySearch: HTMLInputElement;
  private pauseMenu: HTMLElement;
  private underwaterOverlay: HTMLElement;

  private fpsLabel: HTMLElement;
  private posLabel: HTMLElement;
  private biomeLabel: HTMLElement;
  private chunkLabel: HTMLElement;
  private gamemodeLabel: HTMLElement;

  private isInventoryOpen = false;
  private isPauseMenuOpen = false;

  private currentCategory = 'all';
  private searchQuery = '';

  // FPS calculation
  private frameCount = 0;
  private lastTime = performance.now();
  private currentFps = 60;

  public onReturnToTitle?: () => void;

  constructor(world: World, atmosphere: Atmosphere, player: Player, hotbar: Hotbar) {
    this.world = world;
    this.atmosphere = atmosphere;
    this.player = player;
    this.hotbar = hotbar;

    this.inventoryModal = document.getElementById('inventory-modal')!;
    this.inventoryGrid = document.getElementById('inventory-grid')!;
    this.inventorySearch = document.getElementById('inventory-search') as HTMLInputElement;
    this.pauseMenu = document.getElementById('pause-menu')!;
    this.underwaterOverlay = document.getElementById('underwater-overlay')!;

    this.fpsLabel = document.getElementById('fps-counter')!;
    this.posLabel = document.getElementById('pos-counter')!;
    this.biomeLabel = document.getElementById('biome-counter')!;
    this.chunkLabel = document.getElementById('chunk-counter')!;
    this.gamemodeLabel = document.getElementById('gamemode-counter')!;

    this.initInventory();
    this.initSettings();
    this.setupListeners();
  }

  private getCategoryForBlock(def: BlockDef): string {
    switch (def.id) {
      case BlockType.COBBLESTONE:
      case BlockType.BRICKS:
      case BlockType.PLANKS:
      case BlockType.OAK_WOOD:
        return 'building';
      case BlockType.GRASS:
      case BlockType.DIRT:
      case BlockType.SAND:
      case BlockType.SNOW:
      case BlockType.OAK_LEAVES:
        return 'nature';
      case BlockType.STONE:
      case BlockType.BEDROCK:
      case BlockType.COAL_ORE:
      case BlockType.IRON_ORE:
      case BlockType.GOLD_ORE:
      case BlockType.DIAMOND_ORE:
        return 'minerals';
      case BlockType.TORCH:
      case BlockType.GLASS:
      case BlockType.WATER:
      default:
        return 'special';
    }
  }

  private renderInventoryGrid(): void {
    this.inventoryGrid.innerHTML = '';
    const blockList = Object.values(BLOCK_DEFS).filter((b) => b.id !== BlockType.AIR);

    const filtered = blockList.filter((def) => {
      // Category filter
      if (this.currentCategory !== 'all') {
        const cat = this.getCategoryForBlock(def);
        if (cat !== this.currentCategory) return false;
      }
      // Search filter
      if (this.searchQuery) {
        return def.name.toLowerCase().includes(this.searchQuery.toLowerCase());
      }
      return true;
    });

    if (filtered.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.gridColumn = '1 / -1';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.padding = '20px';
      emptyMsg.style.color = '#8b949e';
      emptyMsg.textContent = 'No matching items found.';
      this.inventoryGrid.appendChild(emptyMsg);
      return;
    }

    for (const def of filtered) {
      const itemEl = document.createElement('div');
      itemEl.className = 'inventory-item';
      itemEl.title = `${def.name} (Click to place in hotbar)`;

      const img = document.createElement('img');
      img.src = this.world.atlas.getIconDataURL(def.textures.side || def.textures.top);
      img.alt = def.name;
      itemEl.appendChild(img);

      const label = document.createElement('span');
      label.className = 'item-label';
      label.textContent = def.name;
      itemEl.appendChild(label);

      itemEl.addEventListener('click', () => {
        this.hotbar.setSlot(this.hotbar.selectedSlot, def.id);
        this.toggleInventory(false);
      });

      this.inventoryGrid.appendChild(itemEl);
    }
  }

  private initInventory(): void {
    this.renderInventoryGrid();

    // Category Tabs
    const tabButtons = document.querySelectorAll('.cat-btn');
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentCategory = (btn as HTMLElement).dataset.category || 'all';
        this.renderInventoryGrid();
      });
    });

    // Search bar
    this.inventorySearch.addEventListener('input', () => {
      this.searchQuery = this.inventorySearch.value.trim();
      this.renderInventoryGrid();
    });

    document.getElementById('close-inventory')?.addEventListener('click', () => {
      this.toggleInventory(false);
    });
  }

  public setGameMode(mode: 'creative' | 'survival'): void {
    this.world.gameMode = mode;
    const btnToggle = document.getElementById('btn-toggle-mode');
    const menuBtn = document.getElementById('btn-menu-mode');

    if (mode === 'creative') {
      this.player.physics.isFlying = true;
      if (btnToggle) btnToggle.textContent = 'Switch Mode: Creative Mode (Flight ON)';
      if (menuBtn) menuBtn.textContent = 'Game Mode: Creative';
    } else {
      this.player.physics.isFlying = false;
      if (btnToggle) btnToggle.textContent = 'Switch Mode: Survival Mode';
      if (menuBtn) menuBtn.textContent = 'Game Mode: Survival';
    }
  }

  private initSettings(): void {
    // Mode toggle in pause menu
    const btnToggleMode = document.getElementById('btn-toggle-mode');
    btnToggleMode?.addEventListener('click', () => {
      const nextMode = this.world.gameMode === 'creative' ? 'survival' : 'creative';
      this.setGameMode(nextMode);
    });

    const fovSlider = document.getElementById('slider-fov') as HTMLInputElement;
    const fovVal = document.getElementById('val-fov')!;
    fovSlider.addEventListener('input', () => {
      const val = parseInt(fovSlider.value, 10);
      fovVal.textContent = `${val}°`;
      this.player.camera.fov = val;
      this.player.camera.updateProjectionMatrix();
    });

    const renderDistSlider = document.getElementById('slider-render-distance') as HTMLInputElement;
    const renderDistVal = document.getElementById('val-render-distance')!;
    renderDistSlider.addEventListener('input', () => {
      const val = parseInt(renderDistSlider.value, 10);
      renderDistVal.textContent = `${val} chunks`;
      this.world.renderDistance = val;
      this.atmosphere.updateRenderDistance(val);
    });

    const timeSlider = document.getElementById('slider-time') as HTMLInputElement;
    const timeVal = document.getElementById('val-time')!;
    timeSlider.addEventListener('input', () => {
      const val = parseFloat(timeSlider.value);
      const hours = Math.floor(val);
      const mins = Math.floor((val - hours) * 60);
      const pad = (n: number) => n.toString().padStart(2, '0');
      timeVal.textContent = `${pad(hours)}:${pad(mins)}`;
      this.atmosphere.timeOfDay = val;
    });

    const daynightCheck = document.getElementById('check-daynight') as HTMLInputElement;
    daynightCheck.addEventListener('change', () => {
      this.atmosphere.isCycleActive = daynightCheck.checked;
    });

    const soundCheck = document.getElementById('check-sound') as HTMLInputElement;
    soundCheck.addEventListener('change', () => {
      this.player.audio.enabled = soundCheck.checked;
    });

    const fogCheck = document.getElementById('check-fog') as HTMLInputElement;
    fogCheck.addEventListener('change', () => {
      if (fogCheck.checked) {
        this.world.scene.fog = this.atmosphere.fog;
      } else {
        this.world.scene.fog = null;
      }
    });

    document.getElementById('btn-resume')?.addEventListener('click', () => {
      this.togglePauseMenu(false);
    });

    document.getElementById('btn-return-title')?.addEventListener('click', () => {
      this.togglePauseMenu(false);
      if (this.onReturnToTitle) {
        this.onReturnToTitle();
      }
    });

    document.getElementById('btn-reset-world')?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset all placed and broken blocks? This cannot be undone.')) {
        await this.world.resetWorld();
        this.togglePauseMenu(false);
      }
    });
  }

  private setupListeners(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') {
        if (!this.isPauseMenuOpen) {
          this.toggleInventory(!this.isInventoryOpen);
        }
      } else if (e.code === 'Escape') {
        if (this.isInventoryOpen) {
          this.toggleInventory(false);
        } else {
          this.togglePauseMenu(!this.isPauseMenuOpen);
        }
      }
    });
  }

  public toggleInventory(open: boolean): void {
    this.isInventoryOpen = open;
    if (open) {
      this.inventoryModal.classList.remove('hidden');
      document.exitPointerLock?.();
      this.inventorySearch.focus();
    } else {
      this.inventoryModal.classList.add('hidden');
      document.getElementById('game-canvas')?.requestPointerLock();
    }
  }

  public togglePauseMenu(open: boolean): void {
    this.isPauseMenuOpen = open;
    if (open) {
      this.pauseMenu.classList.remove('hidden');
      document.exitPointerLock?.();
    } else {
      this.pauseMenu.classList.add('hidden');
      document.getElementById('game-canvas')?.requestPointerLock();
    }
  }

  public isMenuOpen(): boolean {
    return this.isInventoryOpen || this.isPauseMenuOpen;
  }

  public update(): void {
    // FPS calculation
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastTime >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
      this.frameCount = 0;
      this.lastTime = now;
      this.fpsLabel.textContent = `FPS: ${this.currentFps}`;
    }

    // Coordinates
    const pos = this.player.physics.position;
    this.posLabel.textContent = `XYZ: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;

    // Biome
    const biome = this.world.getBiomeAt(Math.floor(pos.x), Math.floor(pos.z));
    this.biomeLabel.textContent = `Biome: ${biome}`;

    // Active Loaded Chunks
    this.chunkLabel.textContent = `Chunks: ${this.world.chunks.size}`;

    // Game Mode & Flight Status
    if (this.world.gameMode === 'creative') {
      const flyText = this.player.physics.isFlying ? 'ON' : 'OFF';
      this.gamemodeLabel.textContent = `Mode: Creative (Fly: ${flyText})`;
    } else {
      this.gamemodeLabel.textContent = `Mode: Survival`;
    }

    // Underwater visual effect
    if (this.player.physics.isSubmerged) {
      this.underwaterOverlay.classList.add('active');
    } else {
      this.underwaterOverlay.classList.remove('active');
    }
  }
}
