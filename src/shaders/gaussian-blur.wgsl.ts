export const GAUSSIAN_BLUR_WGSL = /* wgsl */ `
struct Params {
  // direction.x = 1 means horizontal pass, direction.y = 1 means vertical pass
  direction: vec2f,
  radius: f32,
  inv_two_sigma_sq: f32,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

const MAX_RADIUS: i32 = 64;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(outputTex);
  if (id.x >= dims.x || id.y >= dims.y) { return; }
  let in_dims = textureDimensions(inputTex);
  let coord = vec2i(id.xy);
  let r = i32(params.radius);

  var sum = vec4f(0.0);
  var weight_sum = 0.0;
  let dir = vec2i(i32(params.direction.x), i32(params.direction.y));
  let max_x = i32(in_dims.x) - 1;
  let max_y = i32(in_dims.y) - 1;

  for (var i = -MAX_RADIUS; i <= MAX_RADIUS; i = i + 1) {
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
  let result = sum / weight_sum;
  textureStore(outputTex, coord, result);
}
`;
