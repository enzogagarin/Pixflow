export const FLIP_WGSL = /* wgsl */ `
struct Params {
  size:  vec2u,
  // axis.x = 1 means horizontal flip (negate x), axis.y = 1 means vertical flip (negate y)
  axis:  vec2u,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.size.x || id.y >= params.size.y) { return; }
  var sx = i32(id.x);
  var sy = i32(id.y);
  if (params.axis.x == 1u) { sx = i32(params.size.x) - 1 - sx; }
  if (params.axis.y == 1u) { sy = i32(params.size.y) - 1 - sy; }
  let s = textureLoad(inputTex, vec2i(sx, sy), 0);
  textureStore(outputTex, vec2i(id.xy), s);
}
`;
