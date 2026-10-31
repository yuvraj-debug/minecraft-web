import * as THREE from 'three';
import { World } from '../world/World.ts';
import { PlayerPhysics } from './PlayerPhysics.ts';
import { BlockType, BLOCK_DEFS } from '../world/Block.ts';
import { SoundFX } from '../audio/SoundFX.ts';

export interface RaycastHit {
  blockX: number;
  blockY: number;
  blockZ: number;
  placeX: number;
  placeY: number;
  placeZ: number;
  blockType: BlockType;
}

export class Player {
  public camera: THREE.PerspectiveCamera;
  public physics: PlayerPhysics;
  public world: World;
  public audio: SoundFX;

  // Camera angles
  public yaw = 0;
  public pitch = 0;
  public isLocked = false;

  // Input states
  private keys: Record<string, boolean> = {};

  // Raycast interaction
  public currentHit: RaycastHit | null = null;
  private highlightMesh: THREE.LineSegments;

  // First-person hand / held item
  public handGroup: THREE.Group;
  public heldBlockMesh: THREE.Mesh | null = null;
  private swingTimer = 0;
  private isSwinging = false;
  private bobTime = 0;

  // Particle bursts
  private particleGroup: THREE.Group;
  private particles: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; life: number }> = [];

  // Footstep timing
  private footstepDistance = 0;

  constructor(camera: THREE.PerspectiveCamera, world: World, audio: SoundFX) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;
    this.physics = new PlayerPhysics(world);

    // Block highlight wireframe box
    const boxGeometry = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges = new THREE.EdgesGeometry(boxGeometry);
    this.highlightMesh = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 })
    );
    this.highlightMesh.visible = false;
    this.world.scene.add(this.highlightMesh);

    // First person hand container
    this.handGroup = new THREE.Group();
    this.camera.add(this.handGroup);
    this.createHandModel();

    // Particle manager for block destruction
    this.particleGroup = new THREE.Group();
    this.world.scene.add(this.particleGroup);

    this.setupInputs();
  }

  private createHandModel(): void {
    // 3D miniature block held in hand
    const geom = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const mat = new THREE.MeshStandardMaterial({
      map: this.world.atlas.texture,
      roughness: 0.8
    });
    this.heldBlockMesh = new THREE.Mesh(geom, mat);
    this.heldBlockMesh.position.set(0.38, -0.32, -0.6);
    this.heldBlockMesh.rotation.set(0.2, -0.4, 0.1);
    this.handGroup.add(this.heldBlockMesh);
  }

  public updateHeldBlock(blockType: BlockType): void {
    if (!this.heldBlockMesh) return;
    if (blockType === BlockType.AIR) {
      this.heldBlockMesh.visible = false;
    } else {
      this.heldBlockMesh.visible = true;
      // Update UVs for held block
      const def = BLOCK_DEFS[blockType];
      if (def) {
        const geom = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const { uMin, vMin, uMax, vMax } = this.world.atlas.getUV(def.textures.top);
        const { uMin: suMin, vMin: svMin, uMax: suMax, vMax: svMax } = this.world.atlas.getUV(def.textures.side);

        const uvs = new Float32Array([
          // East (+X)
          suMax, svMin,  suMin, svMin,  suMax, svMax,  suMin, svMax,
          // West (-X)
          suMin, svMin,  suMax, svMin,  suMin, svMax,  suMax, svMax,
          // Top (+Y)
          uMin, vMax,  uMax, vMax,  uMin, vMin,  uMax, vMin,
          // Bottom (-Y)
          uMin, vMin,  uMax, vMin,  uMin, vMax,  uMax, vMax,
          // North (+Z)
          suMin, svMin,  suMax, svMin,  suMin, svMax,  suMax, svMax,
          // South (-Z)
          suMax, svMin,  suMin, svMin,  suMax, svMax,  suMin, svMax
        ]);
        geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        this.heldBlockMesh.geometry.dispose();
        this.heldBlockMesh.geometry = geom;
      }
    }
  }

  private setupInputs(): void {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      const sensitivity = 0.0022;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    });
  }

  public triggerSwing(): void {
    this.isSwinging = true;
    this.swingTimer = 0;
  }

  public breakBlock(): void {
    if (!this.currentHit) return;
    const { blockX, blockY, blockZ, blockType } = this.currentHit;
    if (blockType === BlockType.BEDROCK) return; // Unbreakable

    this.triggerSwing();
    const def = BLOCK_DEFS[blockType];
    this.audio.playBlockBreak(def ? def.soundType : 'stone');

    // Spawn block debris particles
    this.spawnBlockParticles(blockX, blockY, blockZ, blockType);

    this.world.setBlock(blockX, blockY, blockZ, BlockType.AIR);
  }

  public placeBlock(typeToPlace: BlockType): boolean {
    if (!this.currentHit || typeToPlace === BlockType.AIR) return false;
    const { placeX, placeY, placeZ } = this.currentHit;

    // Check collision with player AABB
    const blockAABB = new THREE.Box3(
      new THREE.Vector3(placeX, placeY, placeZ),
      new THREE.Vector3(placeX + 1, placeY + 1, placeZ + 1)
    );

    if (BLOCK_DEFS[typeToPlace]?.isSolid && this.physics.getAABB().intersectsBox(blockAABB)) {
      return false; // Can't place inside player
    }

    this.triggerSwing();
    const def = BLOCK_DEFS[typeToPlace];
    this.audio.playBlockPlace(def ? def.soundType : 'stone');

    this.world.setBlock(placeX, placeY, placeZ, typeToPlace);
    return true;
  }

  private spawnBlockParticles(x: number, y: number, z: number, blockType: BlockType): void {
    const def = BLOCK_DEFS[blockType];
    const { uMin, vMin, uMax, vMax } = this.world.atlas.getUV(def ? def.textures.top : 0);

    const count = 10;
    const geom = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const uvs = new Float32Array(24 * 2);
    for (let i = 0; i < 24 * 2; i += 2) {
      uvs[i] = (uMin + uMax) / 2;
      uvs[i + 1] = (vMin + vMax) / 2;
    }
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    const mat = new THREE.MeshBasicMaterial({ map: this.world.atlas.texture });

    for (let i = 0; i < count; i++) {
      const pMesh = new THREE.Mesh(geom, mat);
      pMesh.position.set(
        x + 0.3 + Math.random() * 0.4,
        y + 0.3 + Math.random() * 0.4,
        z + 0.3 + Math.random() * 0.4
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 4 + 1,
        (Math.random() - 0.5) * 4
      );
      this.particleGroup.add(pMesh);
      this.particles.push({ mesh: pMesh, vel, life: 0.8 });
    }
  }

  public update(delta: number): void {
    // 1. Calculate horizontal input vector relative to player yaw
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const inputDir = new THREE.Vector3();

    if (this.keys['KeyW']) inputDir.add(forward);
    if (this.keys['KeyS']) inputDir.sub(forward);
    if (this.keys['KeyD']) inputDir.add(right);
    if (this.keys['KeyA']) inputDir.sub(right);

    if (inputDir.lengthSq() > 0) {
      inputDir.normalize();
    }

    const isJumping = !!this.keys['Space'];
    const isSprinting = !!(this.keys['ControlLeft'] || this.keys['ControlRight']);
    const isSneaking = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);

    // 2. Physics Update
    const { footstepTrigger } = this.physics.update(delta, inputDir, isJumping, isSprinting, isSneaking);

    // Footstep audio
    if (footstepTrigger) {
      const speed = Math.hypot(this.physics.velocity.x, this.physics.velocity.z);
      this.footstepDistance += speed * delta;
      if (this.footstepDistance > (isSprinting ? 1.8 : 2.4)) {
        this.footstepDistance = 0;
        const blockBelow = this.world.getBlock(
          Math.floor(this.physics.position.x),
          Math.floor(this.physics.position.y - 0.5),
          Math.floor(this.physics.position.z)
        );
        const def = BLOCK_DEFS[blockBelow];
        this.audio.playFootstep(def ? def.soundType : 'grass');
      }
    }

    // 3. Update Camera Position & Rotation
    const eyePos = this.physics.getEyePosition();
    this.camera.position.copy(eyePos);

    // Camera Euler rotation (Pitch then Yaw)
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    // 4. Raycast DDA Voxel Traversal
    this.updateVoxelRaycast();

    // 5. Update Hand / Held Item Bobbing & Swing
    this.updateHandAnimation(delta, inputDir.lengthSq() > 0 && this.physics.onGround);

    // 6. Update Destruction Particles
    this.updateParticles(delta);
  }

  private updateVoxelRaycast(): void {
    const maxDistance = 7.0; // Reach distance in blocks
    const origin = this.physics.getEyePosition();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / (dir.x || 1e-8));
    const tDeltaY = Math.abs(1 / (dir.y || 1e-8));
    const tDeltaZ = Math.abs(1 / (dir.z || 1e-8));

    let tMaxX = dir.x > 0 ? (Math.floor(origin.x) + 1 - origin.x) * tDeltaX : (origin.x - Math.floor(origin.x)) * tDeltaX;
    let tMaxY = dir.y > 0 ? (Math.floor(origin.y) + 1 - origin.y) * tDeltaY : (origin.y - Math.floor(origin.y)) * tDeltaY;
    let tMaxZ = dir.z > 0 ? (Math.floor(origin.z) + 1 - origin.z) * tDeltaZ : (origin.z - Math.floor(origin.z)) * tDeltaZ;

    let hit: RaycastHit | null = null;
    let normalX = 0, normalY = 0, normalZ = 0;
    let distance = 0;

    while (distance < maxDistance) {
      const block = this.world.getBlock(x, y, z);
      if (block !== BlockType.AIR && block !== BlockType.WATER) {
        hit = {
          blockX: x,
          blockY: y,
          blockZ: z,
          placeX: x + normalX,
          placeY: y + normalY,
          placeZ: z + normalZ,
          blockType: block
        };
        break;
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX;
          distance = tMaxX;
          tMaxX += tDeltaX;
          normalX = -stepX;
          normalY = 0;
          normalZ = 0;
        } else {
          z += stepZ;
          distance = tMaxZ;
          tMaxZ += tDeltaZ;
          normalX = 0;
          normalY = 0;
          normalZ = -stepZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY;
          distance = tMaxY;
          tMaxY += tDeltaY;
          normalX = 0;
          normalY = -stepY;
          normalZ = 0;
        } else {
          z += stepZ;
          distance = tMaxZ;
          tMaxZ += tDeltaZ;
          normalX = 0;
          normalY = 0;
          normalZ = -stepZ;
        }
      }
    }

    this.currentHit = hit;

    if (hit) {
      this.highlightMesh.position.set(hit.blockX + 0.5, hit.blockY + 0.5, hit.blockZ + 0.5);
      this.highlightMesh.visible = true;
    } else {
      this.highlightMesh.visible = false;
    }
  }

  private updateHandAnimation(delta: number, isMoving: boolean): void {
    if (!this.heldBlockMesh) return;

    // Walking bobbing
    if (isMoving) {
      this.bobTime += delta * 10.0;
    } else {
      this.bobTime = THREE.MathUtils.lerp(this.bobTime, 0, 5 * delta);
    }

    const bobX = Math.sin(this.bobTime * 0.5) * 0.02;
    const bobY = Math.abs(Math.sin(this.bobTime)) * 0.03;

    // Mining swing animation
    let swingRot = 0;
    if (this.isSwinging) {
      this.swingTimer += delta * 7.0;
      if (this.swingTimer > Math.PI) {
        this.isSwinging = false;
        this.swingTimer = 0;
      } else {
        swingRot = Math.sin(this.swingTimer) * 0.6;
      }
    }

    this.heldBlockMesh.position.set(
      0.38 + bobX,
      -0.32 - bobY + swingRot * 0.1,
      -0.6 + swingRot * 0.15
    );
    this.heldBlockMesh.rotation.set(
      0.2 + swingRot * 0.8,
      -0.4 - swingRot * 0.4,
      0.1 - swingRot * 0.3
    );
  }

  private updateParticles(delta: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      if (p.life <= 0) {
        this.particleGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      p.vel.y -= 15.0 * delta; // Gravity on debris
      p.mesh.position.addScaledVector(p.vel, delta);
      p.mesh.rotation.x += delta * 8;
      p.mesh.rotation.y += delta * 8;
      p.mesh.scale.setScalar(p.life / 0.8);
    }
  }

  public setSpawn(x: number, z: number): void {
    const spawnY = this.world.getSpawnHeight(x, z);
    this.physics.position.set(x + 0.5, spawnY, z + 0.5);
    this.physics.velocity.set(0, 0, 0);
  }
}
