export const WATERMARK_WGSL = /* wgsl */ `
struct Params {
  wm_size: vec2u,
  draw_size: vec2u,
  origin: vec2i,
  mode: u32,
  opacity: f32,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var watermarkTex: texture_2d<f32>;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: Params;

fn sampleWatermarkAt(local: vec2u) -> vec4f {
  let wmW = max(params.wm_size.x, 1u);
  let wmH = max(params.wm_size.y, 1u);
  let drawW = max(params.draw_size.x, 1u);
  let drawH = max(params.draw_size.y, 1u);

  let sx = min(u32(floor(f32(local.x) * f32(wmW) / f32(drawW))), wmW - 1u);
  let sy = min(u32(floor(f32(local.y) * f32(wmH) / f32(drawH))), wmH - 1u);
  // Explicit u32->i32 cast: WGSL has no implicit conversion between
  // integer types, and Tint (Chrome's compiler) rejects vec2i(u32, u32)
  // outright. Without this cast, the watermark shader fails to compile
  // and the whole watermark filter throws "[Invalid ShaderModule
  // pixflow.watermark.module]" at runtime.
  return textureLoad(watermarkTex, vec2i(i32(sx), i32(sy)), 0);
}

fn compositeOver(src: vec4f, over: vec4f, opacity: f32) -> vec4f {
  let a = clamp(over.a * opacity, 0.0, 1.0);
  if (a <= 0.0) {
    return src;
  }

  let outA = a + src.a * (1.0 - a);
  let srcPremul = src.rgb * src.a;
  let overPremul = over.rgb * a;
  let outPremul = overPremul + srcPremul * (1.0 - a);
  let outRgb = select(vec3f(0.0), outPremul / outA, outA > 0.0);
  return vec4f(clamp(outRgb, vec3f(0.0), vec3f(1.0)), clamp(outA, 0.0, 1.0));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(outputTex);
  if (id.x >= dims.x || id.y >= dims.y) { return; }

  let coord = vec2i(id.xy);
  let src = textureLoad(inputTex, coord, 0);

  if (params.opacity <= 0.0 || params.draw_size.x == 0u || params.draw_size.y == 0u) {
    textureStore(outputTex, coord, src);
    return;
  }

  if (params.mode == 5u) {
    let local = vec2u(id.x % params.draw_size.x, id.y % params.draw_size.y);
    let wm = sampleWatermarkAt(local);
    textureStore(outputTex, coord, compositeOver(src, wm, params.opacity));
    return;
  }

  let relX = i32(id.x) - params.origin.x;
  let relY = i32(id.y) - params.origin.y;
  if (
    relX < 0 ||
    relY < 0 ||
    relX >= i32(params.draw_size.x) ||
    relY >= i32(params.draw_size.y)
  ) {
    textureStore(outputTex, coord, src);
    return;
  }

  let wm = sampleWatermarkAt(vec2u(u32(relX), u32(relY)));
  textureStore(outputTex, coord, compositeOver(src, wm, params.opacity));
}
`;
