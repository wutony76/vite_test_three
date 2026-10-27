
varying vec2 vUv;

 float hash(vec2 p) {
    return fract(
      sin(dot(p, vec2(127.1, 311.7))) * 43758.5453
    );
  }

  // 產生平滑噪聲
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(
      mix(a, b, f.x),
      mix(c, d, f.x),
      f.y
    );
  }


void main() {
  vec3 topColor = vec3(0.40, 0.12, 1.0);
  vec3 middleColor = vec3(1.0, 0.0, 0.55);
  vec3 bottomColor = vec3(0.02, 0.08, 0.35);

  vec3 color;



  if (vUv.y > 0.5) {
    float t = (vUv.y - 0.5) * 2.0;
    color = mix(middleColor, topColor, t);
    //color = mix(middleColor, topColor, smoothstep(0.2, 0.8, t));
  } else {
    float t = vUv.y * 2.0;
    color = mix(bottomColor, middleColor, t);
    //color = mix(bottomColor, middleColor, smoothstep(0.2, 0.8, t));
  }

  // 產生不規則數值。noise 回傳 0~1，減 0.5 後有的像素變亮、有的變暗
  float n = noise(vUv * 5.0);
   //color += (n - 0.5) * 0.35;
   color += (n - 0.5) * 0.35;

  // 用噪聲擾動原本的漸層
  // float t = vUv.y + (n - 0.5) * 0.5;

  // 混合兩種顏色
  // color = mix(topColor, middleColor, smoothstep(0.2, 0.8, t));

  gl_FragColor = vec4(color, 1.0);
}
