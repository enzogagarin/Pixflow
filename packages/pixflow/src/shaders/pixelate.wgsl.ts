export const PIXELATE_WGSL = /* wgsl */ `
struct Params {
  region_count: u32,
  block_size: u32,
  _pad0: u32,
  _pad1: u32,
  regions: array<vec4i, 16>,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

fn regionIndexAt(x: i32, y: i32) -> i32 {
  let n = i32(params.region_count);
  for (var i: i32 = 0; i < n; i = i + 1) {
    let r = params.regions[i];
    if (r.z <= 0 || r.w <= 0) { continue; }
    if (x >= r.x && y >= r.y && x < r.x + r.z && y < r.y + r.w) {
      return i;
    }
  }
  return -1;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(outputTex);
  if (id.x >= dims.x || id.y >= dims.y) { return; }

  let coord = vec2i(i32(id.x), i32(id.y));
  let idx = regionIndexAt(coord.x, coord.y);

  if (idx < 0 || params.block_size == 0u) {
    textureStore(outputTex, coord, textureLoad(inputTex, coord, 0));
    return;
  }

  let r = params.regions[idx];
  let bs = i32(params.block_size);
  let bx = r.x + ((coord.x - r.x) / bs) * bs;
  let by = r.y + ((coord.y - r.y) / bs) * bs;
  let in_dims = textureDimensions(inputTex);
  let max_x = i32(in_dims.x) - 1;
  let max_y = i32(in_dims.y) - 1;
  let sx = clamp(bx, 0, max_x);
  let sy = clamp(by, 0, max_y);
  textureStore(outputTex, coord, textureLoad(inputTex, vec2i(sx, sy), 0));
}
`;
