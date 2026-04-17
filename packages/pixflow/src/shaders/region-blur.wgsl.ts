export const REGION_BLUR_WGSL = /* wgsl */ `
struct Params {
  region_count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  direction: vec2f,
  radius: f32,
  inv_two_sigma_sq: f32,
  regions: array<vec4i, 16>,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

const MAX_RADIUS: i32 = 96;

fn insideAnyRegion(x: i32, y: i32) -> bool {
  let n = i32(params.region_count);
  for (var i: i32 = 0; i < n; i = i + 1) {
    let r = params.regions[i];
    if (r.z <= 0 || r.w <= 0) { continue; }
    if (x >= r.x && y >= r.y && x < r.x + r.z && y < r.y + r.w) {
      return true;
    }
  }
  return false;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(outputTex);
  if (id.x >= dims.x || id.y >= dims.y) { return; }

  let coord = vec2i(i32(id.x), i32(id.y));

  if (!insideAnyRegion(coord.x, coord.y)) {
    textureStore(outputTex, coord, textureLoad(inputTex, coord, 0));
    return;
  }

  let in_dims = textureDimensions(inputTex);
  let max_x = i32(in_dims.x) - 1;
  let max_y = i32(in_dims.y) - 1;
  let r = i32(params.radius);
  let dir = vec2i(i32(params.direction.x), i32(params.direction.y));

  var sum = vec4f(0.0);
  var weight_sum = 0.0;
  for (var i: i32 = -MAX_RADIUS; i <= MAX_RADIUS; i = i + 1) {
    if (i < -r || i > r) { continue; }
    let fi = f32(i);
    let w = exp(-(fi * fi) * params.inv_two_sigma_sq);
    var sx = coord.x + dir.x * i;
    var sy = coord.y + dir.y * i;
    sx = clamp(sx, 0, max_x);
    sy = clamp(sy, 0, max_y);
    let s = textureLoad(inputTex, vec2i(sx, sy), 0);
    sum = sum + s * w;
    weight_sum = weight_sum + w;
  }
  textureStore(outputTex, coord, sum / weight_sum);
}
`;
