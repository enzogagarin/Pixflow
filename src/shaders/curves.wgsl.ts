export const CURVES_WGSL = /* wgsl */ `
struct Lut {
  // 256 entries packed as 64 vec4s. WGSL uniforms require 16-byte stride for
  // arrays of scalars, so we pack 4 LUT samples per vec4 to keep the buffer
  // dense (1024 bytes total). Component access uses dynamic indexing via v[c].
  data: array<vec4<f32>, 64>,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> lut: Lut;

fn lut_sample(channel: f32) -> f32 {
  // channel is in [0, 1]; map to fractional index in [0, 255].
  let x = clamp(channel, 0.0, 1.0) * 255.0;
  let i0 = u32(floor(x));
  let i1 = min(i0 + 1u, 255u);
  let t = x - f32(i0);
  let v0 = lut.data[i0 / 4u][i0 % 4u];
  let v1 = lut.data[i1 / 4u][i1 % 4u];
  return mix(v0, v1, t);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(outputTex);
  if (id.x >= dims.x || id.y >= dims.y) { return; }
  let coord = vec2i(id.xy);
  let src = textureLoad(inputTex, coord, 0);
  let r = lut_sample(src.r);
  let g = lut_sample(src.g);
  let b = lut_sample(src.b);
  textureStore(outputTex, coord, vec4f(r, g, b, src.a));
}
`;
