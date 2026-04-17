export const SATURATION_WGSL = /* wgsl */ `
struct Params {
  amount: f32,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

fn rgb_to_hsl(c: vec3f) -> vec3f {
  let maxc = max(c.r, max(c.g, c.b));
  let minc = min(c.r, min(c.g, c.b));
  let l = (maxc + minc) * 0.5;
  var h: f32 = 0.0;
  var s: f32 = 0.0;
  let d = maxc - minc;
  if (d > 1e-6) {
    if (l > 0.5) {
      s = d / (2.0 - maxc - minc);
    } else {
      s = d / (maxc + minc);
    }
    if (maxc == c.r) {
      h = (c.g - c.b) / d;
      if (c.g < c.b) { h = h + 6.0; }
    } else if (maxc == c.g) {
      h = (c.b - c.r) / d + 2.0;
    } else {
      h = (c.r - c.g) / d + 4.0;
    }
    h = h / 6.0;
  }
  return vec3f(h, s, l);
}

fn hue_to_rgb(p: f32, q: f32, t_in: f32) -> f32 {
  var t = t_in;
  if (t < 0.0) { t = t + 1.0; }
  if (t > 1.0) { t = t - 1.0; }
  if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
  if (t < 0.5) { return q; }
  if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
  return p;
}

fn hsl_to_rgb(hsl: vec3f) -> vec3f {
  let h = hsl.x;
  let s = hsl.y;
  let l = hsl.z;
  if (s < 1e-6) {
    return vec3f(l, l, l);
  }
  var q: f32;
  if (l < 0.5) {
    q = l * (1.0 + s);
  } else {
    q = l + s - l * s;
  }
  let p = 2.0 * l - q;
  let r = hue_to_rgb(p, q, h + 1.0 / 3.0);
  let g = hue_to_rgb(p, q, h);
  let b = hue_to_rgb(p, q, h - 1.0 / 3.0);
  return vec3f(r, g, b);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(outputTex);
  if (id.x >= dims.x || id.y >= dims.y) { return; }
  let coord = vec2i(id.xy);
  let src = textureLoad(inputTex, coord, 0);
  let hsl = rgb_to_hsl(src.rgb);
  let new_s = clamp(hsl.y * (1.0 + params.amount), 0.0, 1.0);
  let rgb = hsl_to_rgb(vec3f(hsl.x, new_s, hsl.z));
  textureStore(outputTex, coord, vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), src.a));
}
`;
