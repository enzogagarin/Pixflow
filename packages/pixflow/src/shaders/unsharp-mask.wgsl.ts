export const UNSHARP_COMBINE_WGSL = /* wgsl */ `
struct Params {
  amount: f32,
  threshold: f32,
}

@group(0) @binding(0) var originalTex: texture_2d<f32>;
@group(0) @binding(1) var blurredTex: texture_2d<f32>;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(outputTex);
  if (id.x >= dims.x || id.y >= dims.y) { return; }
  let coord = vec2i(id.xy);
  let orig = textureLoad(originalTex, coord, 0);
  let blur = textureLoad(blurredTex, coord, 0);
  let diff = orig.rgb - blur.rgb;
  // optional threshold to avoid amplifying noise
  let mask = step(vec3f(params.threshold), abs(diff));
  let sharp = orig.rgb + diff * params.amount * mask;
  let rgb = clamp(sharp, vec3f(0.0), vec3f(1.0));
  textureStore(outputTex, coord, vec4f(rgb, orig.a));
}
`;
