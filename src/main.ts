import * as THREE from 'three';
import { World } from './world/World.ts';
import { Player } from './player/Player.ts';
import { Atmosphere } from './render/Atmosphere.ts';
import { LightingManager } from './render/LightingManager.ts';
import { SoundFX } from './audio/SoundFX.ts';
import { Hotbar } from './ui/Hotbar.ts';
import { HUD } from './ui/HUD.ts';

const SPLASH_TEXTS = [
  "Now with Creative Flight!",
  "Double-tap Space to fly!",
  "Realistic Water & Soft Shadows!",
  "Procedural Voxel Caves!",
  "Infinite Creative Building!",
  "Shader-enhanced 3D Atmosphere!",
  "Press E for Creative Palette!",
  "100% In-Browser Three.js!"
];

class Game {
  public canvas: HTMLCanvasElement;
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;

  public lighting: LightingManager;
  public atmosphere: Atmosphere;
  public world: World;
  public audio: SoundFX;
  public player: Player;
  public hotbar: Hotbar;
  public hud: HUD;

  private clock: THREE.Clock;
  public inTitleScreen = true;
  private titlePanoramaAngle = 0;
  private autoSaveTimer = 0;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.clock = new THREE.Clock();

    // 1. WebGL Renderer with PCF Soft Shadows & ACES Filmic Tone Mapping
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // 2. Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 800);
    this.scene.add(this.camera);

    // 3. Systems
    this.audio = new SoundFX();
    this.lighting = new LightingManager(this.scene);
    this.atmosphere = new Atmosphere(this.scene, 6);
    this.world = new World(this.scene, this.lighting);
    this.player = new Player(this.camera, this.world, this.audio);

    this.hotbar = new Hotbar(this.world.atlas, (selectedBlock) => {
      this.player.updateHeldBlock(selectedBlock);
    });
    this.player.updateHeldBlock(this.hotbar.getSelectedBlock());

    this.hud = new HUD(this.world, this.atmosphere, this.player, this.hotbar);

    this.hud.onReturnToTitle = () => {
      this.returnToTitle();
    };

    this.setupWindowEvents();
    this.setupPointerLockAndInteraction();
    this.setupTitleMenu();
  }

  private setupTitleMenu(): void {
    const splashEl = document.getElementById('splash-text');
    if (splashEl) {
      splashEl.textContent = SPLASH_TEXTS[Math.floor(Math.random() * SPLASH_TEXTS.length)];
    }

    const btnPlay = document.getElementById('btn-play-world');
    const btnMenuMode = document.getElementById('btn-menu-mode');
    const btnMenuSettings = document.getElementById('btn-menu-settings');
    const btnMenuReset = document.getElementById('btn-menu-reset');
    const mainMenu = document.getElementById('main-menu');

    btnMenuMode?.addEventListener('click', () => {
      this.audio.playMenuClick();
      const nextMode = this.world.gameMode === 'creative' ? 'survival' : 'creative';
      this.hud.setGameMode(nextMode);
    });

    btnMenuSettings?.addEventListener('click', () => {
      this.audio.playMenuClick();
      this.hud.togglePauseMenu(true);
    });

    btnMenuReset?.addEventListener('click', async () => {
      this.audio.playMenuClick();
      if (confirm('Are you sure you want to reset all placed and broken blocks?')) {
        await this.world.resetWorld();
        this.world.preloadSpawnChunks(0, 0, 3);
        alert('World save reset successfully!');
      }
    });

    btnPlay?.addEventListener('click', () => {
      this.audio.playMenuClick();
      this.inTitleScreen = false;
      document.body.classList.remove('in-title');
      mainMenu?.classList.add('hidden');
      this.canvas.requestPointerLock();
    });
  }

  public returnToTitle(): void {
    this.inTitleScreen = true;
    document.body.classList.add('in-title');
    document.exitPointerLock?.();
    const mainMenu = document.getElementById('main-menu');
    mainMenu?.classList.remove('hidden');

    const splashEl = document.getElementById('splash-text');
    if (splashEl) {
      splashEl.textContent = SPLASH_TEXTS[Math.floor(Math.random() * SPLASH_TEXTS.length)];
    }
  }

  public async start(): Promise<void> {
    const progressBar = document.getElementById('progress-bar')!;
    const menuLoading = document.getElementById('menu-loading')!;
    const buttonGroup = document.querySelector('.menu-button-group') as HTMLElement;

    // Step 1: Initialize World and Saved Delta State
    progressBar.style.width = '35%';
    await this.world.init();

    // Step 2: Determine Spawn and Generate Initial Spawn Chunks
    progressBar.style.width = '65%';
    const savedPlayer = await this.world.storage.loadPlayer();

    if (savedPlayer) {
      this.player.physics.position.set(
        savedPlayer.position.x,
        savedPlayer.position.y,
        savedPlayer.position.z
      );
      this.player.yaw = savedPlayer.yaw;
      this.player.pitch = savedPlayer.pitch;
      this.atmosphere.timeOfDay = savedPlayer.timeOfDay;
      if (savedPlayer.hotbar) {
        this.hotbar.slots = savedPlayer.hotbar;
      }
      this.hotbar.selectSlot(savedPlayer.selectedSlot || 0);
    } else {
      this.player.setSpawn(0, 0);
    }

    // Pre-generate and mesh all initial chunks around player
    progressBar.style.width = '90%';
    this.world.preloadSpawnChunks(this.player.physics.position.x, this.player.physics.position.z, 3);

    // Step 3: Complete Loading and reveal Start Menu
    progressBar.style.width = '100%';
    setTimeout(() => {
      menuLoading.classList.add('hidden');
      if (buttonGroup) buttonGroup.style.display = 'flex';
    }, 200);

    // Start rendering loop immediately (renders scenic background behind menu)
    this.clock.start();
    this.loop();
  }

  private setupWindowEvents(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  private setupPointerLockAndInteraction(): void {
    this.canvas.addEventListener('click', () => {
      if (!this.inTitleScreen && !this.player.isLocked && !this.hud.isMenuOpen()) {
        this.canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      const isLocked = document.pointerLockElement === this.canvas;
      this.player.isLocked = isLocked;
      const hint = document.getElementById('hint-banner');
      if (hint) {
        hint.style.display = (isLocked || this.inTitleScreen) ? 'none' : 'block';
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.inTitleScreen || !this.player.isLocked || this.hud.isMenuOpen()) return;

      if (e.button === 0) {
        // Left Click -> Instant Break in Creative
        this.player.breakBlock();
      } else if (e.button === 2) {
        // Right Click -> Place Block
        const selected = this.hotbar.getSelectedBlock();
        this.player.placeBlock(selected);
      }
    });
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);

    let delta = this.clock.getDelta();
    if (delta > 0.1) delta = 0.1;

    if (this.inTitleScreen) {
      // --- Scenic 360 Panoramic Camera on Title Screen ---
      this.titlePanoramaAngle += delta * 0.08;
      const camRadius = 38.0;
      const spawnX = this.player.physics.position.x;
      const spawnZ = this.player.physics.position.z;

      this.camera.position.set(
        spawnX + Math.cos(this.titlePanoramaAngle) * camRadius,
        42.0,
        spawnZ + Math.sin(this.titlePanoramaAngle) * camRadius
      );
      this.camera.lookAt(spawnX, 24.0, spawnZ);

      // Stream chunks around spawn
      this.world.updateChunks(spawnX, spawnZ);

      // Update living atmosphere & water
      this.atmosphere.update(delta, this.camera.position);
      this.lighting.update(performance.now() * 0.001, this.camera.position);
      this.world.waterMaterial.update(
        performance.now() * 0.001,
        this.camera.position,
        this.atmosphere.getSunDirection(),
        this.atmosphere.fog.color,
        this.atmosphere.fog.near,
        this.atmosphere.fog.far
      );

      this.renderer.render(this.scene, this.camera);
      return;
    }

    // --- Active In-Game Update Loop ---

    // 1. Update Player & Physics (Flight, Movement, Collisions, DDA Raycast)
    this.player.update(delta);

    // 2. Stream & Mesh Chunks
    const pos = this.player.physics.position;
    this.world.updateChunks(pos.x, pos.z);

    // 3. Dynamic Atmosphere, Soft Shadows & Realistic Water
    this.atmosphere.update(delta, pos);
    this.lighting.update(performance.now() * 0.001, pos);
    this.world.waterMaterial.update(
      performance.now() * 0.001,
      this.camera.position,
      this.atmosphere.getSunDirection(),
      this.atmosphere.fog.color,
      this.atmosphere.fog.near,
      this.atmosphere.fog.far
    );

    // 4. Update HUD
    this.hud.update();

    // 5. Periodic World Save
    this.autoSaveTimer += delta;
    if (this.autoSaveTimer >= 5.0) {
      this.autoSaveTimer = 0;
      this.world.storage.savePlayer({
        position: { x: pos.x, y: pos.y, z: pos.z },
        pitch: this.player.pitch,
        yaw: this.player.yaw,
        hotbar: this.hotbar.slots,
        selectedSlot: this.hotbar.selectedSlot,
        timeOfDay: this.atmosphere.timeOfDay
      });
    }

    // 6. Render Frame
    this.renderer.render(this.scene, this.camera);
  };
}

// Launch Game
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  (window as any).game = game;
  game.start().catch((err) => console.error('Game failed to launch:', err));
});
