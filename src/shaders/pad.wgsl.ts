export const PAD_WGSL = /* wgsl */ `
struct Params {
  in_size:  vec2u,
  out_size: vec2u,
  offset:   vec2u,    // top-left position of input within output
  color:    vec4f,    // fill color (RGBA)
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.out_size.x || id.y >= params.out_size.y) { return; }
  let ox = i32(id.x);
  let oy = i32(id.y);
  let sx = ox - i32(params.offset.x);
  let sy = oy - i32(params.offset.y);

  if (sx >= 0 && sy >= 0 && sx < i32(params.in_size.x) && sy < i32(params.in_size.y)) {
    let s = textureLoad(inputTex, vec2i(sx, sy), 0);
    textureStore(outputTex, vec2i(ox, oy), s);
  } else {
    textureStore(outputTex, vec2i(ox, oy), params.color);
  }
}
`;
