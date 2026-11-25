export const portraitVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uDispersion;
  uniform float uDispersionStrength;
  uniform float uBaseSize;
  uniform float uPixelRatio;
  uniform float uFloatAmp;
  uniform float uInteraction;
  uniform vec3 uMouse;
  uniform float uMouseStrength;
  uniform float uRepelRadius;
  uniform float uRepelPush;
  uniform vec2 uParallax;

  attribute vec3 aTarget;
  attribute vec3 aScatter;
  attribute vec3 aColor;
  attribute float aBright;
  attribute float aSeed;

  varying vec3 vColor;
  varying float vBright;
  varying float vGlow;
  varying float vScan;

  void main() {
    float seedWave = aSeed * 42.0;
    vec3 p = aTarget;

    float stagger = clamp((uDispersion - aSeed * 0.18) * 1.25, 0.0, 1.0);
    p += aScatter * uDispersionStrength * stagger;

    if (uFloatAmp > 0.0) {
      p.x += sin(uTime * 1.05 + seedWave) * uFloatAmp;
      p.y += cos(uTime * 0.9 + seedWave * 1.17) * uFloatAmp;
      p.z += sin(uTime * 0.75 + seedWave * 0.82) * uFloatAmp * 0.65;
    }

    p.xy += uParallax * (0.55 + aBright * 0.55);

    vec4 world = modelMatrix * vec4(p, 1.0);

    if (uInteraction > 0.5 && uDispersion < 0.92) {
      vec3 away = world.xyz - uMouse;
      float dist = length(away);
      float push = (1.0 - smoothstep(0.0, uRepelRadius, dist)) * uMouseStrength;
      world.xyz += normalize(away + vec3(0.0001)) * push * uRepelPush;
    }

    vec4 view = viewMatrix * world;
    gl_Position = projectionMatrix * view;

    float size = uBaseSize * (0.35 + aBright * 0.9 + 0.25 * (1.0 - uDispersion * 0.35));
    gl_PointSize = size * uPixelRatio / max(0.01, -view.z);

    vColor = aColor;
    vBright = aBright;
    vGlow = length(world.xy - uMouse.xy) < uRepelRadius ? uMouseStrength * 0.85 : 0.0;
    vScan = aTarget.x * 2.8 + aTarget.y * 3.6;
  }
`

export const portraitFragmentShader = /* glsl */ `
  uniform float uEffect;
  uniform float uTime;
  uniform vec3 uTechA;
  uniform vec3 uTechB;
  uniform vec3 uTechC;
  uniform float uOpacity;

  varying vec3 vColor;
  varying float vBright;
  varying float vGlow;
  varying float vScan;

  vec3 fxGradient(vec3 a, vec3 b, vec3 c, float t) {
    vec3 m = mix(a, b, t);
    return mix(m, c, smoothstep(0.35, 0.95, t));
  }

  float brightBoost(float b) {
    return 0.35 + b * 0.9;
  }

  vec3 applyEffect(vec3 photo, float bright) {
    if (uEffect < 0.5) return photo;

    if (uEffect < 1.5) return fxGradient(uTechA, uTechB, uTechC, bright);

    if (uEffect < 2.5) {
      vec3 neon = mix(uTechA, uTechB, bright);
      neon = mix(neon, uTechC, pow(bright, 2.2));
      return mix(photo, neon, 0.86);
    }

    if (uEffect < 3.5) {
      float l = dot(photo, vec3(0.299, 0.587, 0.114));
      vec3 sepia = vec3(l * 1.08, l * 0.88, l * 0.62);
      return mix(photo, sepia, 0.75);
    }

    if (uEffect < 4.5) {
      float l = dot(photo, vec3(0.299, 0.587, 0.114));
      float c = smoothstep(0.12, 0.88, l);
      return vec3(c) * (0.75 + bright * 0.35);
    }

    if (uEffect < 5.5) return fxGradient(uTechA, uTechB, uTechC, bright);

    if (uEffect < 6.5) return fxGradient(uTechA, uTechB, uTechC, bright);

    return fxGradient(uTechA, uTechB, uTechC, bright);
  }

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;

    float core = smoothstep(0.5, 0.0, d);
    float rim = smoothstep(0.48, 0.15, d);

    vec3 base = applyEffect(vColor, vBright);

    if (uEffect > 4.5 && uEffect < 5.5) {
      float band = sin(vScan * 18.0 - uTime * 4.5) * 0.5 + 0.5;
      base += uTechA * band * 0.18 * brightBoost(vBright);
      base = mix(base, uTechC, rim * 0.22);
    }

    if (uEffect > 2.5 && uEffect < 3.5) {
      float vig = smoothstep(0.0, 0.85, vBright);
      base *= 0.55 + vig * 0.55;
    }

    vec3 color = base + vGlow * vec3(0.35, 0.55, 0.9);
    color += rim * 0.12;

    float alpha = core * uOpacity;
    if (uEffect < 0.5 || (uEffect > 3.5 && uEffect < 4.5)) {
      alpha *= 0.55 + vBright * 0.65;
    } else {
      alpha *= 0.45 + vBright * 0.65;
    }

    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`