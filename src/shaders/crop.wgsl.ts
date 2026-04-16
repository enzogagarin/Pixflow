export const CROP_WGSL = /* wgsl */ `
struct Params {
  origin: vec2u,   // (x, y) offset in input texture
  size:   vec2u,   // (w, h) size of cropped region == output dims
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.size.x || id.y >= params.size.y) { return; }
  let src_coord = vec2i(i32(id.x + params.origin.x), i32(id.y + params.origin.y));
  let s = textureLoad(inputTex, src_coord, 0);
  textureStore(outputTex, vec2i(id.xy), s);
}
`;
