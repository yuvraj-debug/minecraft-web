import * as THREE from 'three';
import { World } from '../world/World.ts';

export class PlayerPhysics {
  public position: THREE.Vector3 = new THREE.Vector3(0, 35, 0);
  public velocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

  public readonly width = 0.6;
  public readonly height = 1.8;
  public readonly eyeHeight = 1.62;

  public onGround = false;
  public inWater = false;
  public isSubmerged = false; // Eyes underwater
  public isSneaking = false;
  public isFlying = true; // Default to creative flight enabled

  public gravity = 26.0;
  public jumpStrength = 8.5;
  public walkSpeed = 5.0;
  public sprintSpeed = 8.0;
  public waterSpeed = 3.2;
  public flightSpeed = 11.0;
  public flightSprintSpeed = 20.0;

  private lastSpacePress = 0;
  private spacePressedPrev = false;

  private world: World;

  constructor(world: World) {
    this.world = world;
  }

  public getEyePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  public getAABB(pos = this.position): THREE.Box3 {
    const hw = this.width / 2;
    return new THREE.Box3(
      new THREE.Vector3(pos.x - hw, pos.y, pos.z - hw),
      new THREE.Vector3(pos.x + hw, pos.y + this.height, pos.z + hw)
    );
  }

  public update(
    delta: number,
    inputDir: THREE.Vector3,
    isJumping: boolean,
    isSprinting: boolean,
    isSneaking: boolean
  ): { footstepTrigger: boolean } {
    const now = performance.now();

    // Double-tap Space to toggle flight (Minecraft style)
    if (isJumping && !this.spacePressedPrev) {
      if (now - this.lastSpacePress < 300) {
        this.isFlying = !this.isFlying;
        if (this.isFlying) {
          this.velocity.y = 2.0; // slight initial lift
        }
      }
      this.lastSpacePress = now;
    }
    this.spacePressedPrev = isJumping;

    this.isSneaking = isSneaking && (this.onGround || this.isFlying);

    // Check fluid immersion
    const feetBlockX = Math.floor(this.position.x);
    const feetBlockY = Math.floor(this.position.y);
    const feetBlockZ = Math.floor(this.position.z);
    const eyeBlockY = Math.floor(this.position.y + this.eyeHeight);

    this.inWater = this.world.isBlockWater(feetBlockX, feetBlockY, feetBlockZ);
    this.isSubmerged = this.world.isBlockWater(feetBlockX, eyeBlockY, feetBlockZ);

    // Apply Acceleration
    if (this.isFlying) {
      // --- Creative Flight Physics ---
      const flightMoveSpeed = isSprinting ? this.flightSprintSpeed : this.flightSpeed;
      const targetVel = inputDir.clone().multiplyScalar(flightMoveSpeed);

      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVel.x, 10.0 * delta);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVel.z, 10.0 * delta);

      // Vertical flight controls (Space = Ascend, Shift = Descend)
      let targetVy = 0;
      if (isJumping) {
        targetVy = isSprinting ? 14.0 : 8.5;
      } else if (isSneaking) {
        targetVy = isSprinting ? -14.0 : -8.5;
      }
      this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, targetVy, 12.0 * delta);
    } else if (this.inWater) {
      // --- Water Swimming Physics ---
      const targetSpeed = this.waterSpeed;
      const moveAccel = inputDir.clone().multiplyScalar(targetSpeed);

      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, moveAccel.x, 8 * delta);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, moveAccel.z, 8 * delta);

      if (isJumping) {
        this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, 4.0, 10 * delta);
      } else {
        this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, -1.5, 3 * delta);
      }
    } else {
      // --- Ground / Walking Physics ---
      let targetSpeed = this.walkSpeed;
      if (isSprinting) targetSpeed = this.sprintSpeed;
      else if (this.isSneaking) targetSpeed = this.walkSpeed * 0.45;

      const moveAccel = inputDir.clone().multiplyScalar(targetSpeed);
      const damping = this.onGround ? 12.0 : 2.5;

      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, moveAccel.x, damping * delta);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, moveAccel.z, damping * delta);

      // Gravity
      this.velocity.y -= this.gravity * delta;
      this.velocity.y = Math.max(this.velocity.y, -35.0);

      // Jump
      if (isJumping && this.onGround) {
        this.velocity.y = this.jumpStrength;
        this.onGround = false;
      }
    }

    // Displacement for this frame
    let dx = this.velocity.x * delta;
    let dy = this.velocity.y * delta;
    let dz = this.velocity.z * delta;

    // Sneaking edge-lock: prevent walking off high cliffs
    if (this.isSneaking && this.onGround) {
      const testPos = this.position.clone().add(new THREE.Vector3(dx, 0, dz));
      if (!this.isPositionGrounded(testPos)) {
        dx = 0;
        dz = 0;
      }
    }

    const hw = this.width / 2;

    // 1. Resolve Y-axis (Vertical) Movement & Collisions
    if (dy !== 0) {
      const targetY = this.position.y + dy;
      if (dy < 0) {
        // Falling or flying downwards: check ground
        if (this.isBoxColliding(this.position.x - hw, targetY, this.position.z - hw, this.position.x + hw, targetY + this.height, this.position.z + hw)) {
          const fromBy = Math.floor(this.position.y);
          const toBy = Math.floor(targetY);
          let groundBlockY = toBy;
          for (let by = fromBy; by >= toBy; by--) {
            if (this.isBoxColliding(this.position.x - hw, by, this.position.z - hw, this.position.x + hw, by + 1, this.position.z + hw)) {
              groundBlockY = by;
              break;
            }
          }
          this.position.y = groundBlockY + 1.0;
          this.velocity.y = 0;
          this.onGround = true;
        } else {
          this.position.y = targetY;
          this.onGround = false;
        }
      } else {
        // Jumping or flying upwards: check ceiling
        if (this.isBoxColliding(this.position.x - hw, targetY, this.position.z - hw, this.position.x + hw, targetY + this.height, this.position.z + hw)) {
          const fromBy = Math.floor(this.position.y + this.height);
          const toBy = Math.floor(targetY + this.height);
          let ceilBlockY = toBy;
          for (let by = fromBy; by <= toBy; by++) {
            if (this.isBoxColliding(this.position.x - hw, by, this.position.z - hw, this.position.x + hw, by + 1, this.position.z + hw)) {
              ceilBlockY = by;
              break;
            }
          }
          this.position.y = ceilBlockY - this.height - 0.001;
          this.velocity.y = 0;
        } else {
          this.position.y = targetY;
        }
      }
    } else {
      this.onGround = this.isBoxColliding(this.position.x - hw, this.position.y - 0.05, this.position.z - hw, this.position.x + hw, this.position.y, this.position.z + hw);
    }

    let steppedThisFrame = false;

    // 2. Resolve X-axis Movement & Collisions with Safe Step-Up
    if (dx !== 0) {
      const targetX = this.position.x + dx;
      if (this.isBoxColliding(targetX - hw, this.position.y, this.position.z - hw, targetX + hw, this.position.y + this.height, this.position.z + hw)) {
        // Collided on X: check if we can step up onto a 1-block ledge (only when on ground and walking)
        let stepped = false;
        if (this.onGround && !this.isFlying && !this.inWater) {
          const stepY = Math.floor(this.position.y) + 1.0;
          if (stepY - this.position.y <= 1.05 && stepY > this.position.y) {
            const clearAbove = !this.isBoxColliding(targetX - hw, stepY, this.position.z - hw, targetX + hw, stepY + this.height, this.position.z + hw);
            const solidBelow = this.isBoxColliding(targetX - hw, stepY - 0.2, this.position.z - hw, targetX + hw, stepY, this.position.z + hw);
            if (clearAbove && solidBelow) {
              this.position.y = stepY;
              this.position.x = targetX;
              this.velocity.y = 0;
              stepped = true;
              steppedThisFrame = true;
            }
          }
        }
        if (!stepped) {
          // Push player flush against the first solid wall along trajectory
          if (dx > 0) {
            const fromBx = Math.floor(this.position.x + hw);
            const toBx = Math.floor(targetX + hw);
            let firstSolidBx = toBx;
            for (let bx = fromBx; bx <= toBx; bx++) {
              if (this.isBoxColliding(bx, this.position.y, this.position.z - hw, bx + 1, this.position.y + this.height, this.position.z + hw)) {
                firstSolidBx = bx;
                break;
              }
            }
            this.position.x = firstSolidBx - hw - 0.001;
          } else {
            const fromBx = Math.floor(this.position.x - hw);
            const toBx = Math.floor(targetX - hw);
            let firstSolidBx = toBx;
            for (let bx = fromBx; bx >= toBx; bx--) {
              if (this.isBoxColliding(bx, this.position.y, this.position.z - hw, bx + 1, this.position.y + this.height, this.position.z + hw)) {
                firstSolidBx = bx;
                break;
              }
            }
            this.position.x = (firstSolidBx + 1.0) + hw + 0.001;
          }
          this.velocity.x = 0;
        }
      } else {
        this.position.x = targetX;
      }
    }

    // 3. Resolve Z-axis Movement & Collisions with Safe Step-Up
    if (dz !== 0) {
      const targetZ = this.position.z + dz;
      if (this.isBoxColliding(this.position.x - hw, this.position.y, targetZ - hw, this.position.x + hw, this.position.y + this.height, targetZ + hw)) {
        let stepped = false;
        if (!steppedThisFrame && this.onGround && !this.isFlying && !this.inWater) {
          const stepY = Math.floor(this.position.y) + 1.0;
          if (stepY - this.position.y <= 1.05 && stepY > this.position.y) {
            const clearAbove = !this.isBoxColliding(this.position.x - hw, stepY, targetZ - hw, this.position.x + hw, stepY + this.height, targetZ + hw);
            const solidBelow = this.isBoxColliding(this.position.x - hw, stepY - 0.2, targetZ - hw, this.position.x + hw, stepY, targetZ + hw);
            if (clearAbove && solidBelow) {
              this.position.y = stepY;
              this.position.z = targetZ;
              this.velocity.y = 0;
              stepped = true;
            }
          }
        }
        if (!stepped) {
          if (dz > 0) {
            const fromBz = Math.floor(this.position.z + hw);
            const toBz = Math.floor(targetZ + hw);
            let firstSolidBz = toBz;
            for (let bz = fromBz; bz <= toBz; bz++) {
              if (this.isBoxColliding(this.position.x - hw, this.position.y, bz, this.position.x + hw, this.position.y + this.height, bz + 1)) {
                firstSolidBz = bz;
                break;
              }
            }
            this.position.z = firstSolidBz - hw - 0.001;
          } else {
            const fromBz = Math.floor(this.position.z - hw);
            const toBz = Math.floor(targetZ - hw);
            let firstSolidBz = toBz;
            for (let bz = fromBz; bz >= toBz; bz--) {
              if (this.isBoxColliding(this.position.x - hw, this.position.y, bz, this.position.x + hw, this.position.y + this.height, bz + 1)) {
                firstSolidBz = bz;
                break;
              }
            }
            this.position.z = (firstSolidBz + 1.0) + hw + 0.001;
          }
          this.velocity.z = 0;
        }
      } else {
        this.position.z = targetZ;
      }
    }

    // Anti-stuck safeguard: ensure player is never overlapping a solid block
    if (this.isBoxColliding(this.position.x - hw, this.position.y, this.position.z - hw, this.position.x + hw, this.position.y + this.height, this.position.z + hw)) {
      this.position.y = Math.floor(this.position.y) + 1.0;
      this.velocity.y = 0;
      this.onGround = true;
    }

    // Footstep audio trigger calculation
    const horizontalMovement = Math.hypot(this.velocity.x, this.velocity.z);
    const footstepTrigger = this.onGround && horizontalMovement > 0.8;

    return { footstepTrigger };
  }

  private isPositionGrounded(pos: THREE.Vector3): boolean {
    const hw = this.width / 2;
    for (const ox of [-hw, hw]) {
      for (const oz of [-hw, hw]) {
        const bx = Math.floor(pos.x + ox);
        const by = Math.floor(pos.y - 0.2);
        const bz = Math.floor(pos.z + oz);
        if (this.world.isBlockSolid(bx, by, bz)) {
          return true;
        }
      }
    }
    return false;
  }

  public isBoxColliding(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    const eps = 0.001;
    const startX = Math.floor(minX + eps);
    const endX = Math.floor(maxX - eps);
    const startY = Math.floor(minY + eps);
    const endY = Math.floor(maxY - eps);
    const startZ = Math.floor(minZ + eps);
    const endZ = Math.floor(maxZ - eps);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        for (let z = startZ; z <= endZ; z++) {
          if (this.world.isBlockSolid(x, y, z)) {
            return true;
          }
        }
      }
    }
    return false;
  }
}
