import * as THREE from 'three';

export interface TorchLight {
  x: number;
  y: number;
  z: number;
  light: THREE.PointLight;
  baseIntensity: number;
  flickerSpeed: number;
}

export class LightingManager {
  public scene: THREE.Scene;
  private torches: Map<string, TorchLight> = new Map();
  private maxLights = 16; // Limit active point lights to avoid GPU shader overhead

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public addTorch(x: number, y: number, z: number): void {
    const key = `${x},${y},${z}`;
    if (this.torches.has(key)) return;

    const light = new THREE.PointLight(0xffa540, 1.8, 14, 1.8);
    light.position.set(x + 0.5, y + 0.8, z + 0.5);
    this.scene.add(light);

    this.torches.set(key, {
      x, y, z,
      light,
      baseIntensity: 1.8,
      flickerSpeed: 4.0 + Math.random() * 4.0
    });
  }

  public removeTorch(x: number, y: number, z: number): void {
    const key = `${x},${y},${z}`;
    const torch = this.torches.get(key);
    if (torch) {
      this.scene.remove(torch.light);
      torch.light.dispose();
      this.torches.delete(key);
    }
  }

  public update(time: number, playerPos: THREE.Vector3): void {
    // Torch flame flickering animation and distance-based culling
    let count = 0;

    for (const torch of this.torches.values()) {
      const distSq = (torch.x - playerPos.x) ** 2 + (torch.z - playerPos.z) ** 2;

      // Only enable point lights within 48 blocks of player
      if (distSq < 48 * 48 && count < this.maxLights) {
        torch.light.visible = true;
        count++;

        // Natural flame flicker
        const flicker = Math.sin(time * torch.flickerSpeed) * 0.15 +
                        Math.cos(time * torch.flickerSpeed * 1.7) * 0.1;
        torch.light.intensity = torch.baseIntensity + flicker;
      } else {
        torch.light.visible = false;
      }
    }
  }

  public clear(): void {
    for (const torch of this.torches.values()) {
      this.scene.remove(torch.light);
      torch.light.dispose();
    }
    this.torches.clear();
  }
}
