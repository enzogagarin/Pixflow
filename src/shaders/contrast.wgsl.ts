export const CONTRAST_WGSL = /* wgsl */ `
struct Params {
  amount: f32,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(outputTex);
  if (id.x >= dims.x || id.y >= dims.y) { return; }
  let coord = vec2i(id.xy);
  let src = textureLoad(inputTex, coord, 0);
  let factor = 1.0 + params.amount;
  let rgb = clamp((src.rgb - vec3f(0.5)) * factor + vec3f(0.5), vec3f(0.0), vec3f(1.0));
  textureStore(outputTex, coord, vec4f(rgb, src.a));
}
`;
