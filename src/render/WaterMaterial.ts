import * as THREE from 'three';

export class WaterMaterial {
  public material: THREE.ShaderMaterial;

  constructor(waterTexture: THREE.Texture) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTexture: { value: waterTexture },
        uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        uCameraPos: { value: new THREE.Vector3() },
        uFogColor: { value: new THREE.Color(0x87ceeb) },
        uFogNear: { value: 30.0 },
        uFogFar: { value: 90.0 }
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vNormal;

        void main() {
          vUv = uv;
          
          // Gentle realistic water ripples
          vec3 pos = position;
          float wave1 = sin(pos.x * 2.0 + uTime * 2.5) * 0.04;
          float wave2 = cos(pos.z * 2.5 + uTime * 2.0) * 0.04;
          pos.y += wave1 + wave2;

          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          vWorldPosition = worldPos.xyz;
          vNormal = normalMatrix * normal;

          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        uniform float uTime;
        uniform vec3 uSunDirection;
        uniform vec3 uCameraPos;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;

        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vNormal;

        void main() {
          // Flowing texture coordinates
          vec2 animatedUv = vUv + vec2(sin(uTime * 0.4) * 0.02, cos(uTime * 0.4) * 0.02);
          vec4 texColor = texture2D(uTexture, animatedUv);

          // Realistic Fresnel reflection
          vec3 viewDir = normalize(uCameraPos - vWorldPosition);
          float fresnel = pow(1.0 - max(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);

          // Sunlight specular highlight
          vec3 reflectDir = reflect(-uSunDirection, vec3(0.0, 1.0, 0.0));
          float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);

          // Deep vs shallow water tint
          vec3 deepColor = vec3(0.05, 0.35, 0.75);
          vec3 shallowColor = vec3(0.15, 0.65, 0.85);
          vec3 waterTint = mix(shallowColor, deepColor, 0.4);

          vec3 finalColor = mix(texColor.rgb * waterTint, vec3(1.0, 1.0, 1.0), fresnel * 0.45);
          finalColor += vec3(1.0, 0.95, 0.8) * spec * 0.8;

          // Atmospheric fog blending
          float dist = length(uCameraPos - vWorldPosition);
          float fogFactor = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
          finalColor = mix(finalColor, uFogColor, fogFactor);

          gl_FragColor = vec4(finalColor, 0.78);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  public update(time: number, cameraPos: THREE.Vector3, sunDir: THREE.Vector3, fogColor: THREE.Color, fogNear: number, fogFar: number): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCameraPos.value.copy(cameraPos);
    this.material.uniforms.uSunDirection.value.copy(sunDir);
    this.material.uniforms.uFogColor.value.copy(fogColor);
    this.material.uniforms.uFogNear.value = fogNear;
    this.material.uniforms.uFogFar.value = fogFar;
  }
}
