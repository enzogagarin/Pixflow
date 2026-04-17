export const ROTATE90_WGSL = /* wgsl */ `
struct Params {
  in_size:  vec2u,
  out_size: vec2u,
  turns:    u32,    // 1 = 90 CW, 2 = 180, 3 = 270 CW
  _pad:     u32,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.out_size.x || id.y >= params.out_size.y) { return; }
  let ox = i32(id.x);
  let oy = i32(id.y);
  let in_w = i32(params.in_size.x);
  let in_h = i32(params.in_size.y);
  var sx: i32;
  var sy: i32;
  switch (params.turns) {
    case 1u: {
      // 90 CW: out(x, y) = in(y, in_h - 1 - x)
      sx = oy;
      sy = in_h - 1 - ox;
    }
    case 2u: {
      // 180: out(x, y) = in(in_w - 1 - x, in_h - 1 - y)
      sx = in_w - 1 - ox;
      sy = in_h - 1 - oy;
    }
    case 3u: {
      // 270 CW (90 CCW): out(x, y) = in(in_w - 1 - y, x)
      sx = in_w - 1 - oy;
      sy = ox;
    }
    default: {
      sx = ox;
      sy = oy;
    }
  }
  let s = textureLoad(inputTex, vec2i(sx, sy), 0);
  textureStore(outputTex, vec2i(ox, oy), s);
}
`;
