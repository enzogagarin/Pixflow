// Separable Lanczos-3 resampler. The same shader handles both passes; the
// "axis" uniform selects horizontal (1,0) or vertical (0,1) sampling.
export const LANCZOS_WGSL = /* wgsl */ `
struct Params {
  axis: vec2f,            // (1,0) horizontal, (0,1) vertical
  in_size: vec2f,         // input texture dimensions
  out_size: vec2f,        // output texture dimensions
  ratio: f32,             // in_size / out_size on the active axis
  scale: f32,             // max(ratio, 1)
  support: f32,           // A * scale (radius in input pixels)
  taps: f32,              // ceil(support * 2)
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

const A: f32 = 3.0;
const PI: f32 = 3.14159265358979;
const MAX_TAPS: i32 = 96;

fn sinc(x: f32) -> f32 {
  if (abs(x) < 1e-6) { return 1.0; }
  let pix = PI * x;
  return sin(pix) / pix;
}

fn lanczos(x: f32) -> f32 {
  if (abs(x) >= A) { return 0.0; }
  return sinc(x) * sinc(x / A);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(outputTex);
  if (id.x >= dims.x || id.y >= dims.y) { return; }
  let coord_out = vec2i(id.xy);

  // Active output coordinate along the resampling axis
  let out_v = f32(coord_out.x) * params.axis.x + f32(coord_out.y) * params.axis.y;
  let center = (out_v + 0.5) * params.ratio - 0.5;

  // First input pixel index in the support window
  let first_pix = i32(floor(center - params.support + 0.5));
  let taps_count = i32(params.taps);

  let in_w = i32(params.in_size.x);
  let in_h = i32(params.in_size.y);
  let max_x = in_w - 1;
  let max_y = in_h - 1;

  var sum = vec4f(0.0);
  var weight_sum = 0.0;

  for (var i = 0; i < MAX_TAPS; i = i + 1) {
    if (i >= taps_count) { break; }
    let pix = first_pix + i;
    let dist = f32(pix) - center;
    if (abs(dist) >= params.support) { continue; }
    let kx = dist / params.scale;
    let w = lanczos(kx);

    let varying_clamped = clamp(pix, 0, select(max_y, max_x, params.axis.x > 0.5));
    var sx: i32;
    var sy: i32;
    if (params.axis.x > 0.5) {
      sx = varying_clamped;
      sy = clamp(coord_out.y, 0, max_y);
    } else {
      sx = clamp(coord_out.x, 0, max_x);
      sy = varying_clamped;
    }
    let s = textureLoad(inputTex, vec2i(sx, sy), 0);
    sum = sum + s * w;
    weight_sum = weight_sum + w;
  }

  if (weight_sum < 1e-6) {
    textureStore(outputTex, coord_out, textureLoad(inputTex, vec2i(
      clamp(coord_out.x, 0, max_x),
      clamp(coord_out.y, 0, max_y),
    ), 0));
    return;
  }

  let result = sum / weight_sum;
  let rgb = clamp(result.rgb, vec3f(0.0), vec3f(1.0));
  textureStore(outputTex, coord_out, vec4f(rgb, clamp(result.a, 0.0, 1.0)));
}
`;
