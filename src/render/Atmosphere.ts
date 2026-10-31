import * as THREE from 'three';

export class Atmosphere {
  public scene: THREE.Scene;
  public sunLight: THREE.DirectionalLight;
  public ambientLight: THREE.AmbientLight;
  public hemisphereLight: THREE.HemisphereLight;
  public sunMesh: THREE.Mesh;
  public moonMesh: THREE.Mesh;
  public stars: THREE.Points;
  public clouds: THREE.Group;
  public fog: THREE.Fog;

  public timeOfDay = 10.0; // 0 to 24 hours (12 = noon, 0/24 = midnight, 6 = dawn, 18 = dusk)
  public cycleSpeed = 0.04; // 1 full day every ~10 minutes, configurable
  public isCycleActive = true;

  // Sky colors for day/night transitions
  private colorDaySky = new THREE.Color(0x7ec0ee);
  private colorDawnSky = new THREE.Color(0xfd9465);
  private colorDuskSky = new THREE.Color(0xd35d6e);
  private colorNightSky = new THREE.Color(0x060c18);

  private colorDayFog = new THREE.Color(0xa7d8ff);
  private colorSunsetFog = new THREE.Color(0xe67e52);
  private colorNightFog = new THREE.Color(0x040810);

  constructor(scene: THREE.Scene, renderDistanceChunks: number) {
    this.scene = scene;

    // Atmospheric Fog
    const fogNear = renderDistanceChunks * 16 * 0.45;
    const fogFar = renderDistanceChunks * 16 * 0.95;
    this.fog = new THREE.Fog(this.colorDayFog, fogNear, fogFar);
    this.scene.fog = this.fog;

    // Ambient and Hemisphere lighting
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);

    this.hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x443322, 0.35);
    this.scene.add(this.hemisphereLight);

    // Directional Sun Light with PCF Soft Shadows
    this.sunLight = new THREE.DirectionalLight(0xfffaed, 1.2);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 180;
    const d = 40;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // Sun Visual Mesh
    const sunGeom = new THREE.SphereGeometry(6, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff3a8 });
    this.sunMesh = new THREE.Mesh(sunGeom, sunMat);
    this.scene.add(this.sunMesh);

    // Moon Visual Mesh
    const moonGeom = new THREE.SphereGeometry(5, 16, 16);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xe0e8ff });
    this.moonMesh = new THREE.Mesh(moonGeom, moonMat);
    this.scene.add(this.moonMesh);

    // Starfield
    this.stars = this.createStarfield();
    this.scene.add(this.stars);

    // 3D Clouds
    this.clouds = this.createClouds();
    this.scene.add(this.clouds);
  }

  private createStarfield(): THREE.Points {
    const starCount = 1200;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      // Distribute on sphere surface
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const radius = 300;

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(radius * Math.cos(phi)); // Only upper hemisphere
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      const brightness = 0.6 + Math.random() * 0.4;
      colors[i * 3] = brightness;
      colors[i * 3 + 1] = brightness;
      colors[i * 3 + 2] = brightness * 1.1; // subtle cool blue
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.0
    });

    return new THREE.Points(geometry, material);
  }

  private createClouds(): THREE.Group {
    const cloudGroup = new THREE.Group();
    const cloudMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    });

    // Procedural 3D cloud clusters
    const boxGeom = new THREE.BoxGeometry(1, 1, 1);
    const cloudCount = 45;
    for (let i = 0; i < cloudCount; i++) {
      const w = 20 + Math.random() * 30;
      const d = 20 + Math.random() * 30;
      const h = 4 + Math.random() * 3;

      const mesh = new THREE.Mesh(boxGeom, cloudMaterial);
      mesh.scale.set(w, h, d);
      mesh.position.set(
        (Math.random() - 0.5) * 350,
        58 + Math.random() * 4,
        (Math.random() - 0.5) * 350
      );
      cloudGroup.add(mesh);
    }
    return cloudGroup;
  }

  public updateRenderDistance(chunks: number): void {
    const fogNear = chunks * 16 * 0.45;
    const fogFar = chunks * 16 * 0.95;
    this.fog.near = fogNear;
    this.fog.far = fogFar;
  }

  public update(delta: number, playerPos: THREE.Vector3): void {
    if (this.isCycleActive) {
      this.timeOfDay = (this.timeOfDay + delta * this.cycleSpeed) % 24;
    }

    // Convert time (0-24) to sun angle (0 to 2*PI)
    // 6.0 = dawn (0), 12.0 = noon (PI/2), 18.0 = sunset (PI), 24.0 = midnight (3*PI/2)
    const angle = ((this.timeOfDay - 6) / 24) * Math.PI * 2;
    const sunDistance = 220;

    const sunX = playerPos.x + Math.cos(angle) * sunDistance;
    const sunY = playerPos.y + Math.sin(angle) * sunDistance;
    const sunZ = playerPos.z + 30;

    this.sunMesh.position.set(sunX, sunY, sunZ);
    this.moonMesh.position.set(
      playerPos.x - Math.cos(angle) * sunDistance,
      playerPos.y - Math.sin(angle) * sunDistance,
      playerPos.z - 30
    );

    this.sunLight.position.set(sunX, sunY, sunZ);
    this.sunLight.target.position.copy(playerPos);
    this.sunLight.target.updateMatrixWorld();

    // Drifting clouds
    this.clouds.position.x = (this.clouds.position.x + delta * 2.0) % 400;

    // Center starfield on player
    this.stars.position.copy(playerPos);

    // Compute sun height factor (-1 to +1)
    const sunAltitude = Math.sin(angle);

    // Interpolate sky and fog colors based on altitude
    const currentSky = new THREE.Color();
    const currentFog = new THREE.Color();

    if (sunAltitude > 0.2) {
      // Full Day
      const dayFactor = THREE.MathUtils.clamp((sunAltitude - 0.2) / 0.5, 0, 1);
      currentSky.lerpColors(this.colorDawnSky, this.colorDaySky, dayFactor);
      currentFog.lerpColors(this.colorSunsetFog, this.colorDayFog, dayFactor);

      this.sunLight.intensity = 1.1 * dayFactor + 0.3;
      this.ambientLight.intensity = 0.35 * dayFactor + 0.15;
      (this.stars.material as THREE.PointsMaterial).opacity = 0.0;
    } else if (sunAltitude > -0.2) {
      // Dawn / Dusk transition
      const sunsetFactor = (sunAltitude + 0.2) / 0.4;
      currentSky.lerpColors(this.colorNightSky, this.colorDuskSky, sunsetFactor);
      currentFog.lerpColors(this.colorNightFog, this.colorSunsetFog, sunsetFactor);

      this.sunLight.intensity = 0.4 * sunsetFactor;
      this.ambientLight.intensity = 0.15;
      (this.stars.material as THREE.PointsMaterial).opacity = (1.0 - sunsetFactor) * 0.7;
    } else {
      // Night
      currentSky.copy(this.colorNightSky);
      currentFog.copy(this.colorNightFog);

      this.sunLight.intensity = 0.08; // subtle moonlight
      this.ambientLight.intensity = 0.12;
      (this.stars.material as THREE.PointsMaterial).opacity = 0.95;
    }

    this.scene.background = currentSky;
    this.fog.color.copy(currentFog);
  }

  public getSunDirection(): THREE.Vector3 {
    return this.sunMesh.position.clone().normalize();
  }
}
