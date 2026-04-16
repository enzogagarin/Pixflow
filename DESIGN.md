pixflow
WebGPU ile Tarayıcıda Batch Görsel İşleme Kütüphanesi

Versiyon: 0.1 (design draft)
Yazar: Burak Şahin
Tarih: Nisan 2026
Durum: Geliştirmeye hazır

0. Bu Döküman Ne İşe Yarar
Bu döküman pixflow'un manifestosu, mimari referansı ve 12 haftalık geliştirme yol haritasıdır.
Üç kullanımı vardır: (1) geliştirme sırasında tasarım kararlarının referansı, (2) yeni katkıcılara
oryantasyon, (3) README ve dış iletişimin kaynağı. Döküman yaşayan bir dokümandır, her
önemli tasarım kararı sonrası güncellenir.

1. Manifesto
Ağır iş sunucuda değil, kullanıcının cihazında olmalı.

2026'da ortalama bir cep telefonu 10 yıl önceki bir dizüstü bilgisayardan daha güçlü. Bir kullanıcı
5MB fotoğrafı yeniden boyutlandırmak için sunucuna yüklüyorsa, bu sunucunuzun gereksinimi
değil, araçlarınızın yetersizliğidir. WebGPU bu denklemi değiştirdi. pixflow bunu pratiğe döken
kütüphanedir.
Temel inançlar:

Görsel pipeline'ları deklaratif olmalı. Canvas2D imperative API'si yazılım mühendisliği için
uygun değil. Kullanıcı "resize, blur, encode" diyebilmeli, getContext ve drawImage çağrıları
yazmamalı.
Gizlilik mimari bir karardır, pazarlama değil. Kullanıcının fotoğrafı yeniden boyutlandırmak için
sunucuya gidiyorsa, orada kalıyor, loglanıyor, yedekleniyor, sızıyor. pixflow'la fotoğraf hiç o
yolculuğa çıkmaz.
Performans kanıtlanmış olmalı, iddia edilmiş değil. Her iddia benchmark'la desteklenir. "15x
hızlı" yazan README'ler çöp, "Sharp.js server: 8.2s, pixflow: 0.4s, koşullar şunlar" diyen
README'ler güvenilir.
Kütüphane davetkâr olmalı. Tek satır import, tek fonksiyon çağrısı ile ilk değer görülmeli. WGSL
bilmeden kullanılabilmeli. İsteyen derinlere inebilmeli.
Reddettiklerimiz:

pixflow bir image editor değildir. Canvas, katman, seçim, maske, fırça yok. Bu Photopea'nın işi.

pixflow bir ML kütüphanesi değildir. Arka plan kaldırma, upscale, generative işlemler yok. Bu
Transformers.js'in işi.
pixflow bir format converter değildir. HEIC/RAW decode, SVG rasterize, PDF export gibi format
gymnastics'ine girmez. Bu libvips'in işi.
pixflow bir general-purpose GPU framework değildir. NumPy-like tensor operasyonları, matrix
math, scientific computing yok. Bu TensorFlow.js veya wgpu-py'nin işi.
pixflow görsel pipeline'ları için vardır: al, işle, kaydet. Bu kadar.

2. Kime Yönelik
Birincil hedef: SaaS ve UGC platform geliştiricileri.

Bir destek ticket sisteminde kullanıcı screenshot yüklüyor. Bir topluluk forumunda yorum
fotoğrafı yükleniyor. Bir proje yönetim aracında dosya eki var. Bu uygulamalar her gün
milyonlarca görseli sunucuya yolluyor, çoğu 10x gereksiz büyüklükte. pixflow bu yükü tarayıcıya
aktarır.
İkincil hedefler:

E-ticaret (ürün fotoğrafı upload'u), EdTech (ödev fotoğrafı yüklemesi), legal/KYC (belge
fotoğrafı optimizasyonu), fotoğrafçı portfolyo araçları (preview üretimi), dahili kurumsal araçlar
(saha teknisyeni upload'u).
Hedef değil:

Nihai kullanıcı son-kullanıcı uygulamaları (pixflow bir SDK, bir app değil). Profesyonel fotoğraf
düzenleme (Affinity Photo, Capture One pazarı). Offline masaüstü araçları (Electron wrapper
yapmak istenirse topluluk yapar).

3. Başarı Kriterleri
pixflow v1.0'ın başarılı sayılması için 12 ay sonunda şunların olması gerekir:
Teknik: 60fps canlı önizleme desteği, 100 resim × 2K → 800px pipeline'ı M1 Mac'te 3 saniye
altında, bellek kullanımı batch başına 200MB altında, WebGPU desteklenen her tarayıcıda
çalışıyor.
Topluluk: GitHub 1000+ star, ayda 10.000+ npm download, en az 3 tanınmış OSS projeye entegre
edilmiş (hedefler: Discourse, Ghost, Strapi, Directus arasından), Hacker News ön sayfasına bir
kez çıkmış.
Kişisel: Burak Şahin "tarayıcıda GPU compute" alanında tanınan bir isim. Bu alanda 3+ teknik
yazı yayınlanmış, 1+ konferans talk verilmiş.

Başarısızlık kriterleri de eşit önemli: 12 ay sonunda 200 star altındaysa proje istediği kitleye
ulaşamamıştır, ya problem gerçek değildir ya pozisyonlama yanlıştır.

4. Yüksek Seviye Mimari
┌─────────────────────────────────────────────────────────────────┐
│
Kullanıcı Uygulaması
│
│
(React, Vue, vanilla JS, Svelte)
│
└──────────────────────────┬──────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────┐
│
@pixflow/react (opsiyonel)
│
│
Hooks, components, Suspense desteği
│
└──────────────────────────┬──────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────┐
│
@pixflow/core
│
│ ┌─────────────┐ ┌─────────────┐ ┌──────────────────────┐ │
│ │ Pipeline │ │ Filters │ │ Codec (encode)
│ │
│ │ Builder
│ │ Registry │ │ JPEG/WebP/AVIF
│ │
│ └──────┬──────┘ └──────┬──────┘ └──────────┬───────────┘
│
│
│
│
│
│
│ ┌──────▼────────────────▼────────────────────▼───────────┐ │
│ │
Execution Engine
│ │
│ │ Resource pool, pipeline cache, scheduler
│ │
│ └──────────────────────────┬──────────────────────────────┘ │
│
│
│
│ ┌──────────────────────────▼──────────────────────────────┐ │
│ │
GPU Abstraction Layer
│ │
│ │ Device management, fallback detection, capability
│ │
│ └──────────┬──────────────────────────────┬───────────────┘ │
└─────────────┼──────────────────────────────┼───────────────────┘
│
│
▼
▼
┌───────────────┐
┌───────────────┐
│ WebGPU
│
│ WebGL 2
│
│ Backend
│
│ Backend
│
│ (birincil) │
│ (fallback) │
└───────────────┘
└───────────────┘

4.1 Modüller
@pixflow/core (ilk release'de tek paket olarak başlayacak, sonradan ayrılacak): pipeline tanımı,

filter contract, execution engine, resource management.
@pixflow/filters (core içinden ayrılır v0.2'de): tüm hazır filtrelerin kaynak kodu. Tree-shakable;
kullanılmayan filtre bundle'a girmez.
@pixflow/codec: encoding katmanı. Canvas convertToBlob ve WebCodecs arasında otomatik
seçim.
@pixflow/react (v0.3): React hooks, Suspense boundary, useDrop benzeri yardımcılar.
@pixflow/vue (topluluktan gelirse): Vue composable'ları.
@pixflow/cli (v0.4): Node.js tarafında aynı pipeline'ı çalıştıran CLI. wgpu-native binding'i ile.
CI/CD kullanımı ve dev iteration için.
4.2 Veri Akışı
File/Blob/URL

→

ImageBitmap

→

GPUTexture (input)
│
▼
┌─── Filter 1 (GPU pass) ───┐
│
│
▼
│
GPUTexture (intermediate A)
│
│
│
▼
│
Filter 2 (GPU pass)
│
│
│
▼
│
GPUTexture (intermediate B)
│
│
│
▼
│
Filter N (GPU pass) ──────────────┘
│
▼
GPUTexture (output)
│
▼
Canvas / OffscreenCanvas
│
▼
Blob (JPEG/WebP/PNG/AVIF)

Ara texture'lar ping-pong pattern ile reuse edilir. N filtreli pipeline için sadece 2 intermediate
texture tutarız, N değil.

5. Public API Tasarımı
5.1 Temel Kullanım
typescript

import { Pipeline } from '@pixflow/core';
const pipe = Pipeline.create()
.resize({ width: 1024, fit: 'contain' })
.autoWhiteBalance()
.unsharpMask({ amount: 0.3, radius: 1.0 })
.encode({ format: 'webp', quality: 0.85 });
const result = await pipe.run(file);
// result: { blob: Blob, width: 1024, height: 683, stats: {...} }

5.2 Batch Kullanım
typescript

const results = await pipe.batch(files, {
concurrency: 4,
onProgress: (done, total) => console.log(`${done}/${total}`),
signal: abortController.signal,
});
// results: Array<PipelineResult>

5.3 Filter Contract

Her filtre aşağıdaki interface'i uygular:
typescript

interface Filter<Params = unknown> {
readonly name: string;
readonly params: Params;
readonly stage: 'compute' | 'render' | 'cpu';
prepare(ctx: ExecutionContext): Promise<FilterPipeline>;
execute(
input: GPUTexture,
output: GPUTexture,
ctx: ExecutionContext
): void;
hash(): string;
}

hash() pipeline cache için kullanılır. Aynı parametrelerle aynı shader'ı recompile etmeyiz.

5.4 Custom Shader Kullanımı

Hazır filtreler yetmiyorsa:
typescript

const sepia = Pipeline.customFilter({
name: 'sepia',
wgsl: `
@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
let dims = textureDimensions(outputTex);
if (id.x >= dims.x || id.y >= dims.y) { return; }
let src = textureLoad(inputTex, vec2i(id.xy), 0).rgb;
let r = dot(src, vec3f(0.393, 0.769, 0.189));
let g = dot(src, vec3f(0.349, 0.686, 0.168));
let b = dot(src, vec3f(0.272, 0.534, 0.131));
textureStore(outputTex, vec2i(id.xy), vec4f(r, g, b, 1.0));
}
`,
entryPoint: 'main',
});

5.5 Hata Yönetimi
typescript

try {
const result = await pipe.run(file);
} catch (err) {
if (err instanceof PixflowError) {
switch (err.code) {
case 'WEBGPU_UNAVAILABLE': /* fallback */
case 'OUT_OF_MEMORY':
/* smaller batch */
case 'INVALID_INPUT':
/* user error */
case 'SHADER_COMPILE':
/* filter bug */
}
}
}

Her hatanın stabil bir code alanı olur. Mesaj değişebilir, code değişmez.

6. Filter Katalogu
6.1 MVP Filtre Seti (v0.1)
Geometrik:
Filtre

Parametreler

Algoritma

resize

width, height, fit (contain/cover/fill)

Lanczos-3 separable

crop

x, y, width, height

Texture subrect

rotate90

turns: 1, 2, 3

Coordinate swap

flip

axis: 'h' | 'v'

Coordinate negation

pad

top, right, bottom, left, color

Render to larger target

Renk ve ton:

Filtre

Parametreler

Algoritma

brightness

amount: -1..1

Additive RGB

contrast

amount: -1..1

Scale around 0.5

saturation

amount: -1..1

HSL space

curves

control points

LUT apply

whiteBalance

temperature, tint

Matrix transform

colorMatrix

4x4 matrix

Direct multiplication

Kalite:
Filtre

Parametreler

Algoritma

gaussianBlur

radius

Separable 2-pass

unsharpMask

amount, radius

Original minus blur

Yardımcı:
Filtre

Parametreler

Not

exifStrip

none

CPU stage, GPU değil

orient

auto (EXIF'e göre)

rotate90 + flip kombinasyonu

Encoding:
Format

Kanal

Not

jpeg

canvas.convertToBlob

Her tarayıcıda var

webp

canvas.convertToBlob

Her tarayıcıda var

png

canvas.convertToBlob

Lossless ama yavaş

avif

WebCodecs ImageEncoder

Yeni; feature detect, fallback JPEG

6.2 v0.2 Roadmap

Thumbnail generation (çoklu boyut tek geçişte), denoise (non-local means veya basit bilateral

filter), sharpen (high-pass), vignette, tone mapping (basit Reinhard), histogram (compute
shader + CPU readback).
6.3 Asla yapılmayacaklar

Yüz tanıma, segmentasyon, generative dolgular, upscale. Bunlar ML kütüphanelerinin işi.
pixflow bunlara customFilter API'si ile başka bir kütüphanenin çıktısını pipeline'a sokmayı
destekler, ama kendi bünyesine dahil etmez.

7. Teknik Derinlik
7.1 WGSL Shader Desenleri

Tüm compute shader'lar tek bir pattern'e uyar:
wgsl

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: FilterParams;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
let dims = textureDimensions(outputTex);
if (id.x >= dims.x || id.y >= dims.y) { return; }
let coord = vec2i(id.xy);
let src = textureLoad(inputTex, coord, 0);
let dst = apply_filter(src, coord, params);
textureStore(outputTex, coord, dst);
}

Workgroup boyutu kararı: 8x8 genel amaçlı iyi bir başlangıç. Mobil GPU'larda maksimum 256
invocation/workgroup. 8x8 = 64 invocation, her yerde çalışır. Benchmark sonuçlarına göre bazı
filtreler 16x16 veya 32x1 ile daha iyi olabilir, filter başına tune edilir.
Separable filtreler: Gaussian blur ve Lanczos resize iki geçişli. Önce horizontal pass (yatay),
sonra vertical pass (dikey). Bu O(N²) yerine O(2N) kompleksite.
7.2 Bellek Yönetimi

GPU texture allocation pahalı. Çözüm: havuz (pool) ve ping-pong.
typescript

class TexturePool {
private buckets = new Map<string, GPUTexture[]>();
acquire(width: number, height: number, format: GPUTextureFormat): GPUTexture {
const key = `${width}x${height}x${format}`;
const bucket = this.buckets.get(key);
if (bucket && bucket.length > 0) {
return bucket.pop()!;
}
return this.device.createTexture({
size: { width, height },
format,
usage: GPUTextureUsage.TEXTURE_BINDING
| GPUTextureUsage.STORAGE_BINDING
| GPUTextureUsage.COPY_SRC
| GPUTextureUsage.COPY_DST,
});
}
release(texture: GPUTexture) {
const key = `${texture.width}x${texture.height}x${texture.format}`;
let bucket = this.buckets.get(key);
if (!bucket) {
bucket = [];
this.buckets.set(key, bucket);
}
bucket.push(texture);
}
dispose() {
for (const bucket of this.buckets.values()) {
for (const tex of bucket) tex.destroy();
}
this.buckets.clear();
}
}

Ping-pong intermediate'lar: N filtreli pipeline için 2 intermediate texture yeterli. Filter i çıktısı
(i+1)'in girdisi, alternatif kullanılır.
typescript

let src = inputTexture;
let dstA = pool.acquire(w, h, format);
let dstB = pool.acquire(w, h, format);
for (let i = 0; i < filters.length; i++) {
const dst = (i % 2 === 0) ? dstA : dstB;
filters[i].execute(src, dst, ctx);
src = dst;
}
// src şimdi final çıktı
// diğer intermediate pool'a geri
pool.release(i % 2 === 0 ? dstB : dstA);

Önemli edge case: Bir filtre boyut değiştirirse (resize), ping-pong kırılır. Resize sonrası
intermediate'lar yeni boyutta allocate edilir, eskiler release edilir.
7.3 Pipeline Cache
GPUComputePipeline oluşturmak shader compile eder, masraflı. Aynı filter + aynı format

kombinasyonu için cache.
typescript

class PipelineCache {
private cache = new Map<string, GPUComputePipeline>();
get(filter: Filter, inputFormat: GPUTextureFormat, outputFormat: GPUTextureFormat)
const key = `${filter.hash()}|${inputFormat}|${outputFormat}`;
let pipeline = this.cache.get(key);
if (!pipeline) {
pipeline = this.createPipeline(filter, inputFormat, outputFormat);
this.cache.set(key, pipeline);
}
return pipeline;
}
}

Batch içinde aynı pipeline 100 resim için reuse edilir, compile maliyeti amortize olur.
7.4 Renk Uzayı Kararları
Karar: İç işlemler linear sRGB'de yapılır, input/output sRGB (gamma-encoded).

Texture format'ı input ve output için rgba8unorm-srgb olur. GPU otomatik olarak sample
sırasında linearize eder, write sırasında gamma-encode eder. Shader'da hesap linear değerlerle
yapılır.

Filtre matematiği ancak linear space'te doğrudur. Brightness 0.5 ekleme gamma-encoded
space'te yapılırsa ciddi yanlış sonuç verir.
Edge case: JPEG encode RGB istediği için render pipeline'ın son adımı rgba8unorm-srgb
texture'ı canvas'a yazar, canvas convertToBlob sRGB encoding yapar. Zincir tutarlı.
7.5 EXIF İşleme

EXIF metadata WebGPU'nun görev alanı dışında. CPU'da yapılır.
Strip (sil): JPEG encoding sırasında canvas doğal olarak strip eder. Sadece orijinal Blob'da EXIF
okuma gerekirse piexifjs veya exifr kütüphanesi peer dependency olarak eklenir.
Orient (oryantasyon düzelt): EXIF'ten rotation okunur, pipeline'a rotate90 + flip filtreleri eklenir.
Kullanıcı .orient() ile çağırır, manuel rotate90'dan daha kolay.
7.6 Browser Uyumluluk
Hedef matrisi (v0.1):
Tarayıcı

Versiyon

WebGPU

Durum

Chrome

113+

Var

Birincil

Edge

113+

Var

Birincil

Safari

26+

Var

Birincil

Firefox

141+

Var (Windows), Nightly (diğer)

Birincil

Chrome Android

121+

Qualcomm/ARM

Birincil

Mobile Safari

iOS 26+

Var

Birincil

WebGPU olmayan tarayıcılarda v0.1'de davranış: PixflowError fırlat, code:
'WEBGPU_UNAVAILABLE' . Kullanıcı kendisi fallback implementasyonuna yönlendirir. v0.2'de
WebGL 2 fallback backend eklenecek.
Önemli: Firefox Linux ve Android desteği 2026 boyunca gelişiyor. navigator.gpu kontrolü şart,
adapter talebi fail olabilir. Feature detection örneği:
typescript

async function detectWebGPU(): Promise<boolean> {
if (!navigator.gpu) return false;
try {
const adapter = await navigator.gpu.requestAdapter();
return adapter !== null;
} catch {
return false;
}
}

7.7 WebGL 2 Fallback Stratejisi (v0.2)

Aynı Filter interface, farklı execute implementasyonu. WebGL 2'de compute shader yok, ama
fragment shader ile aynı sonuca ulaşılır.
Yaklaşım: Her filter iki shader kaynağı sağlar, WGSL ve GLSL ES 3.0. Build time'da ikisi de
bundle'a girer (veya lazy load ile sadece gereken). Backend seçim runtime'da yapılır.
Performans: WebGL 2 WebGPU'dan yaklaşık 2-4x yavaş olacak. Mesaj: "Desteklenir, en iyi
performans için WebGPU'ya yükselt."
7.8 WebCodecs Entegrasyonu

WebCodecs API'si AVIF ve efficient video frame encoding için kritik. Ancak:
Chrome: AVIF encoding Chrome 121+ (cihazda codec varsa).
Safari: WebCodecs kısmi, AVIF henüz değişken.
Firefox: Kısmi destek.
Strateji: Feature detection yap, AVIF requested ise WebCodecs deneyecek, başarısızsa WebP'ye
geri düşecek ve stats.fallback = 'webp' döndürecek. Kullanıcıyı sessizce aldatmaz, haber
verir.
7.9 Web Workers

v0.1'de ana thread'de çalış. GPU submit async, main thread'i blocklamıyor. Ama JavaScript filter
orchestration CPU'da, blocklar.
v0.3'te OffscreenCanvas + Worker'da çalışacak şekilde yeniden yapılandırma.
Pipeline.createInWorker() API'si. Bu ana thread'i tamamen rahatlatır. Karmaşıklık yüksek,
v0.1'e girmez.

8. Performans Hedefleri
Referans donanım: M1 MacBook Pro, 16GB RAM, Chrome 120+.

Senaryo

Hedef

Tek resim 2048² → 800², resize + blur + webp

< 100ms

100 resim 2048² → 800², resize + webp

< 3 saniye

10 resim 4K → 1080p, resize + color correct

< 1 saniye

Batch bellek kullanımı (100 resim)

< 200MB GPU + 100MB CPU

İlk render time (pipeline setup)

< 50ms

Pipeline cache hit response

< 5ms

Karşılaştırma benchmark'ları (README için):

1. Sharp.js (Node.js sunucuda, aynı pipeline) çalışma zamanı
2. browser-image-compression (Canvas2D) çalışma zamanı
3. Canvas2D + manuel JS filter çalışma zamanı
4. pixflow çalışma zamanı
Her birinde: 100 resim × 2048² → 800². Açık koşullar, tekrarlanabilir kod, farklı donanımlarda test
(M1 Mac, Intel laptop, Android telefon, iPhone).
Performans testinin kuralı: Kullanıcı bilgisayarında yavaşsa pixflow "hızlı" değil. Sunucu-sınıfı
M2 Max'te hızlı olmak kimsenin umurunda değil.

9. Test Stratejisi
9.1 Katmanlar
Birim testleri (Vitest): Pipeline builder API'si, pool allocator'ı, filter hash fonksiyonları,
parametre validasyonu. Headless, hızlı.
Filter doğruluk testleri (Vitest + node-webgpu veya Playwright): Her filter için sabit input →
beklenen output piksel karşılaştırması. Tolerans: her kanalda ±2/255 (GPU precision
varyasyonu).
Görsel regresyon testleri (Playwright): Demo site'daki kritik senaryoları screenshot
karşılaştırması ile test et. Yeni filter eklendiğinde görsel bozulma fark edilir.
Performance regression testleri (Playwright + CI): Benchmark senaryoları her PR'da çalışır,
önceki baseline'dan %15'ten fazla sapma uyarı üretir.
Cross-browser smoke testleri: Playwright ile Chrome, Firefox, Safari'de temel pipeline çalıştır.

9.2 CI Matrisi

GitHub Actions üzerinde:
İş

Ortam

Ne çalıştırır

lint

Ubuntu, Node 20

ESLint, Prettier, TypeScript check

unit

Ubuntu, Node 20

Vitest (WebGPU gerektirmeyen)

filters

Ubuntu, node-webgpu

Filter doğruluk testleri

e2e-chrome

Ubuntu, Playwright

Chrome smoke

e2e-firefox

Ubuntu, Playwright

Firefox Nightly smoke

e2e-safari

macOS, Playwright

WebKit smoke

benchmark

Ubuntu, Playwright

Performans regression

node-webgpu bağımlılığı olgunlaşmazsa filter doğruluk testleri browser'da çalıştırılır (headless
Chrome).

10. Repo Yapısı
pixflow/
├── packages/
│ ├── core/
│ │ ├── src/
│ │ │ ├── pipeline/
│ │ │ ├── resources/
│ │ │ ├── shaders/
│ │ │ ├── backends/
│ │ │ ├── codec/
│ │ │ ├── utils/
│ │ │ └── index.ts
│ │ ├── test/
│ │ ├── package.json
│ │ └── tsconfig.json
│ ├── filters/
│ ├── react/
│ └── cli/
├── examples/
│ ├── vanilla-js/
│ ├── react-upload-form/

# @pixflow/core
# Pipeline builder, execution
# Texture pool, buffer pool
# WGSL shader modülleri
# WebGPU backend (v0.2: WebGL2)
# Encoding (JPEG/WebP/PNG/AVIF)
# Misc

# @pixflow/filters (v0.2'de ayrışır)
# @pixflow/react
# @pixflow/cli (v0.4)

│
│

├── vue-gallery/

└── discourse-plugin/
├── benchmarks/
│ ├── scenarios/
│ └── runner.ts
├── docs/
├── .github/
│ └── workflows/
├── package.json
├── pnpm-workspace.yaml
├── README.md
├── DESIGN.md
├── CONTRIBUTING.md
├── CHANGELOG.md
└── LICENSE

# VitePress veya Astro Starlight

# pnpm workspace root

# Bu döküman

# MIT

10.1 Araç Zinciri
Amaç

Araç

Neden

Dil

TypeScript 5+ strict

Tip güvenliği, library author'lar için standart

Monorepo

pnpm workspaces

Yeterli, Turborepo MVP için overkill

Build (lib)

tsup

Sıfır config, ESM+CJS+types tek seferde

Build (demo)

Vite

En hızlı dev server

Test

Vitest + Playwright

Modern, hızlı, iyi Developer Experience

Format

Prettier + ESLint

Standart

Release

Changesets

Monorepo versioning için en iyi

Docs

VitePress

Pragmatik, hafif, Vue bilgisi gerekmez

10.2 Tek Paket ile Başla Prensibi

v0.1'de tek paket olarak başla ( pixflow ), monorepo olmasın. Monorepo erken karmaşıklık
ekler. v0.2'de ihtiyaç varsa böl.
Sebep: MVP'de "@pixflow/react" paketinin 50 kullanıcısı olmayacak. Monorepo setup yüksek
maliyet, düşük değer. Kullanıcı 100'e ulaşınca bölme kararı ver.

11. Geliştirme Fazları (12 Hafta)
Her hafta somut deliverable'ı olmalı. Haftalar arası gevşeklik ayarı: planın 20% buffer'lı
olduğunu kabul et, gerçekte hafta N işi N+1'e taşabilir.
Hafta 1: Temeller
Hedef: Tarayıcıda "Hello WebGPU" çalışıyor, compute shader bir resmin parlaklığını
değiştirebiliyor.

Yapılacaklar:
1. Repo oluştur, TypeScript + Vite kurulumu, ESLint/Prettier.
2. WebGPU device/adapter acquisition yardımcısı yaz, feature detection.
3. File/Blob/URL → ImageBitmap → GPUTexture import fonksiyonu.
4. İlk compute shader: brightness adjustment (WGSL kaynak + TypeScript wrapper).
5. GPUTexture → Canvas → Blob readback fonksiyonu.
6. Manuel test HTML sayfası: upload > +20 brightness > download.
Deliverable: Bir dosya yükle, brightness'ı +20 yapan kod, çalışıyor.
Risk: WebGPU API'nin detaylı kısımlarında (bind group layout, pipeline layout) takılma. Çözüm:
İlk versiyonda over-engineering yok, working code öncelik.
Hafta 2: Mimari İskelet
Hedef: Filter interface tanımlanmış, Pipeline builder API iskeleti hazır, 2 filter chain'lenebiliyor.

Yapılacaklar:
1. Filter<T> interface'ini tanımla, ExecutionContext tipini belirle.
2. Pipeline class builder pattern ile: .brightness(0.2).contrast(0.1) .
3. İki ayrı filter hazırla (brightness + contrast), chain'le.
4. Intermediate texture yönetimi için basit sürüm (pool henüz yok, manual allocate).
5. Error handling iskeleti: PixflowError class, error code enum.
Deliverable: Pipeline builder API kullanıma hazır, chain mantığı çalışıyor, 2 filter peş peşe
çalışabiliyor.
Hafta 3: Resource Pool ve Pipeline Cache
Hedef: Tekrar tekrar işlenen resimler için cache devreye girmiş, memory allocation optimize.

Yapılacaklar:
1. TexturePool implementasyonu, bucket-based.
2. PipelineCache implementasyonu, filter hash tabanlı.

3. Ping-pong intermediate pattern'ını execute engine'e entegre et.
4. Integration test: aynı pipeline 10 resim üzerinde çalışır, pool reuse doğrulanır.
5. Memory leak detection: 1000 resim sonrası allocation stabilize oluyor mu?
Deliverable: 100 resim üzerinde tutarlı bellek tüketimi, ilk resimden sonra allocation yok.
Hafta 4: İlk Önemli Filtre: Resize
Hedef: Production-kalite Lanczos-3 resize çalışıyor.

Yapılacaklar:
1. Separable Lanczos shader yaz (horizontal pass + vertical pass).
2. Fit modları implementasyon: contain , cover , fill , inside , outside (Sharp.js
semantiği ile paralel).
3. Aspect ratio hesaplama, boyut validasyonu.
4. Test suite: çeşitli input boyutları, çıktıyı reference implementasyon (Sharp.js) ile karşılaştır,
±2/255 tolerans.
5. Performance testi: 2048² → 800², hedef < 20ms.
Deliverable: Resize filtresi production kalitede, tested, benchmarked.
Not: Lanczos doğrulaması önemli. Kötü implementasyon aliasing, ringing veya blur verir.
Referans karşılaştırması kritik.
Hafta 5: Renk Filtreleri
Hedef: Temel renk düzenleme seti hazır (brightness, contrast, saturation, curves, white balance,
color matrix).

Yapılacaklar:
1. Linear sRGB renk uzayında çalışma kararını texture format'a ( rgba8unorm-srgb ) yansıt.
2. Her filter için WGSL shader yaz.
3. Curves için 1D LUT buffer passing (256 entry).
4. Color matrix için 4x4 uniform buffer.
5. Her filter için doğruluk testi: bilinen input → beklenen output.
Deliverable: 6 renk filtresi hazır, test edilmiş.
Hafta 6: Geometrik ve Yardımcı Filtreler
Hedef: Crop, rotate90, flip, pad, EXIF orient tamamlanmış.

Yapılacaklar:
1. Crop: texture subrect rendering.

2. Rotate90: coordinate transformation shader (3 versiyon: 90, 180, 270 derece).
3. Flip: coordinate negation shader.
4. Pad: daha büyük hedef texture, kaynak ortada, etraf renkli.
5. EXIF orient: exifr peer dep, EXIF'ten rotation okunur, uygun rotate+flip kombinasyonu
pipeline'a eklenir.
6. EXIF strip: encoding katmanında doğal, özel kod gerekmez.
Deliverable: 5 geometrik filtre + EXIF orient helper.
Hafta 7: Kalite Filtreleri
Hedef: Gaussian blur + unsharp mask çalışıyor.

Yapılacaklar:
1. Separable Gaussian blur: her iki eksen için ayrı geçiş, workgroup optimize.
2. Unsharp mask: blurred version hesapla, original - blurred × amount formülü.
3. Radius parametresi için kernel size dinamik üret (1 pixel radius = 3x kernel, 10 pixel radius
= 31x kernel).
4. Performans testi: 2048² üzerinde radius=5 blur, hedef < 15ms.
Deliverable: 2 kalite filtresi, production kalite.
Hafta 8: Encoding ve Batch API
Hedef: Tam pipeline çıktısı disk'e kaydedilebilir Blob olarak dönüyor, batch API çalışıyor.

Yapılacaklar:
1. Encoding katmanı: JPEG/WebP/PNG via Canvas.convertToBlob.
2. AVIF via WebCodecs, feature detection + WebP fallback.
3. Quality parametre geçişi (0-1 float, format-specific translation).
4. Batch API: pipe.batch(files[], options) .
5. Concurrency kontrolü (kaç resim paralel GPU'ya).
6. Progress reporting: her resim bittiğinde callback.
7. Cancellation via AbortSignal.
Deliverable: Gerçek dünya API'si, .run() ve .batch() çalışıyor.
Hafta 9: Demo Site
Hedef: Potansiyel kullanıcıyı etkileyecek demo sitesi hazır.

Yapılacaklar:
1. Site yapısı: VitePress veya basit Vite app.

2. Ana özellik: drag-drop 100 resim, pipeline seç, anında işle, ZIP olarak indir.
3. Canlı benchmark: "Canvas2D kullansaydık: Xs, pixflow: Ys" gerçek zamanlı.
4. Farklı pipeline preset'leri: "Forum post", "Ecommerce thumbnail", "Blog hero", "Avatar".
5. Görsel before/after slider.
6. WebGPU detection + nazikçe fallback mesajı.
Deliverable: Shareable URL, "bunu kullanmak istiyorum" hissi veren site.
Hafta 10: Dokümantasyon
Hedef: VitePress docs site, ilk tanışmayı 5 dakikada halleden kaynak.

Yapılacaklar:
1. Getting Started sayfası (kurulum → ilk pipeline → gerçek kullanım, 10 dakika).
2. API Reference (otomatik TypeDoc'tan üret, manuel düzenle).
3. Recipes (ör. "Avatar optimizasyonu", "Blog resmi pipeline", "Forum upload").
4. Her filter için ayrı sayfa: ne yapar, parametreleri, görsel önce/sonra.
5. Performance kılavuzu (batch size, concurrency, pipeline caching).
6. WebGPU compatibility sayfası, fallback stratejileri.
7. Contributing kılavuzu.
Deliverable: pixflow.dev veya GitHub Pages üzerinde canlı docs.
Hafta 11: Launch Hazırlık
Hedef: HN launch, npm publish, ilk kullanıcılar için tüm altyapı hazır.

Yapılacaklar:
1. README'yi yeniden yaz: manifesto + 30 saniyelik gif + install + örnek + benchmarks.
2. İlk teknik blog post: "WebGPU'da Lanczos Resize Nasıl Uygulanır" veya "Tarayıcıda 100
Resmi 3 Saniyede İşlemenin Hikayesi". Dev.to, Medium, kişisel blog paralel yayın.
3. Benchmark'ları tekrarla, farklı cihazlarda test et (M1, Intel, Android, iPhone), README
tablosunu güncelle.
4. NPM publish checklist: package.json doğruluğu, bundle size analizi, tree-shaking
doğrulaması.
5. Logo ve görsel kimlik basit ama tutarlı.
6. Discourse veya Ghost için örnek entegrasyon PR taslağı hazırla.
Deliverable: npm publish'e basılmaya hazır v0.1.0, launch materyalleri.

Hafta 12: Launch
Hedef: İlk kullanıcıları ve geri bildirimi topla.

Yapılacaklar:
1. NPM publish (Pazartesi).
2. Blog post yayınla (Salı sabah EST).
3. Show HN (Salı 9am EST, en yüksek trafik saati).
4. Reddit r/webdev, r/webgpu, r/javascript (Çarşamba, zaman farklı).
5. Twitter thread, dev arkadaşlardan amplifikasyon iste.
6. Discord ve Slack community'lerde paylaş (spam olmadan).
7. İlk 48 saat: issue'lara ve PR'lara hızlı yanıt ver.
8. İlk haftanın sonunda retrospektif, v0.2 roadmap'i güncelle.
Deliverable: Canlı proje, topluluk başlangıcı, v0.2 için öncelik listesi gerçek geribildirimden
çıkmış.

12. v0.2+ Roadmap
v0.2 (3 ay sonra):

WebGL 2 fallback backend, OffscreenCanvas + Worker desteği, thumbnail multi-size tek geçiş,
histogram ve auto-adjustments, denoise filter, paket ayrıştırması (@pixflow/core +
@pixflow/filters).
v0.3 (6 ay sonra):

React bindings (@pixflow/react), Vue bindings varsa topluluktan, daha zengin encoding options
(progressive JPEG, WebP metadata), video frame support (tek frame işleme), custom shader
validation tool'u.
v0.4 (9 ay sonra):

Node.js CLI ve SSR support (wgpu-native via napi-rs), CI/CD pipeline entegrasyonları (GitHub
Action, GitLab CI), WebAssembly fallback değerlendirmesi (pure JS çok yavaş, WASM orta yol).
v1.0 (12 ay sonra):

API stabilite garantisi, semver, enterprise kullanım için production-hardening, LTS sürüm
stratejisi.

13. Pozisyonlama ve İletişim
13.1 Tek Cümle Tarif

"pixflow, tarayıcıda GPU ile resim pipeline'larını bir satır koddan çalıştıran kütüphane."
13.2 Hedef Kanal Öncelikleri

1. Hacker News (Show HN)
2. Twitter/X (dev ilişkileri, thread + demo video)
3. Dev.to + Medium çapraz yayın
4. Reddit r/javascript, r/webdev, r/webgpu
5. npm trending (organik ama SEO için)
6. Discourse + Ghost + Strapi toplulukları (hedef entegrasyon PR'ları)
7. WebGPU Discord + ilgili Slack kanalları
13.3 Mesaj Varyantları
Geliştirici için (HN/Twitter): "Resize + compress yapan 100 satır Canvas2D kod yerine 3 satır
pixflow. 15-30x hız."
Teknik lider için (blog): "Image upload sunucu maliyetinizin X%'i. pixflow bandwidth'i %90
azaltıyor."
Gizlilik odaklı için: "Kullanıcının fotoğrafı sunucuya gitmeden önce tarayıcıda optimize edilir."
13.4 İçerik Takvimi (İlk 3 Ay)

Ay 1: "Building pixflow" Twitter thread'leri, haftada 1 progress update.
Ay 2: "WebGPU'da X nasıl yapılır" teknik yazıları (Lanczos, Gaussian blur, memory pooling).
Ay 3: Launch week + follow-up yazılar ("İlk hafta öğrendiklerim", "Y şirketi pixflow'u nasıl
kullandı").

14. Karar Defteri
Aşağıdaki kararlar düşünülerek alındı, değişmeden kalırlar. Değişmesi gerekirse bu bölümde
neden ve yeni karar kayıt altına alınır.

Karar

Seçim

Neden

Dil

TypeScript strict

Library author standardı

İlk backend

Yalnız WebGPU

MVP scope, fallback v0.2

Renk uzayı

Linear sRGB (texture gamma)

Doğru filtre matematiği

Workgroup size

8x8 varsayılan

Her yerde çalışan güvenli
başlangıç

Intermediate buffer
pattern

Ping-pong 2 texture

N filter için O(1) memory

Encoding API

canvas.convertToBlob + WebCodecs feature
detect

Uyumluluk + yeni format
desteği

Monorepo

v0.2'ye kadar yok

Erken karmaşıklık kaçınılması

Test runner

Vitest + Playwright

Modern, hızlı

Lisans

MIT

OSS benimseme maksimize

Paket adı

pixflow (önce kontrol)

Kısa, akılda kalıcı, mevcut
değilse

v0.1 hedef tarayıcılar

WebGPU'lu major tarayıcılar

70% coverage yeterli başlangıç

Web Worker kullanımı

v0.3

v0.1 ana thread'de, measure
önce

Custom shader API

v0.1'de dahil

Power user'lar kütüphaneye
bağlılık

15. Bilinen Riskler ve Azaltma
Risk 1: WebGPU Inspector / WonderInteractive benzeri rakip genişler ve pixflow'u kapsar.
Azaltma: Onlar debugger alanında. pixflow image processing'de. Ayrı kategoriler, rekabet düşük.
Risk 2: TypeGPU veya benzer WebGPU wrapper'ı olgunlaşır, altta değişir. Azaltma: İlk
versiyonda vanilla WebGPU API'sine bağlı kal, wrapper kullanma. Bağımlılık kontrolü elimde
olsun.
Risk 3: Sharp.js sunucu tarafında zaten çalışıyor, müşteri pixflow'a geçmez. Azaltma: Upload
UX mesajını öne çıkar, sunucu karşılaştırması için client-side'ın farklı değer önerisi (bandwidth
tasarrufu, mobile UX).

Risk 4: browser-image-compression var, 10k star, yerleşik. Azaltma: Onlar Canvas2D, yavaş,
sınırlı filter. pixflow modern ve zengin. Dokümante edilmiş performans karşılaştırması kritik.
Risk 5: Safari veya Firefox WebGPU desteğinde regresyon. Azaltma: Multi-browser CI,
bulunursa kullanıcıya şeffaf bildir, workaround yayınla.
Risk 6: Solo geliştirici, 2-3 ay içinde başka şey çıkar. Azaltma: Bu dökümanı takip et, haftalık
commit disiplini, her hafta progress public (Twitter).
Risk 7: 12 hafta yetmez. Azaltma: Hafta 8 sonunda halfway checkpoint: encoding + batch
bitmişse ilerle, bitmemişse feature kes (örn. bazı renk filtrelerini v0.2'ye at).

16. Kabul Kriterleri (v0.1 "Done")
pixflow v0.1'in release edilmesi için şu koşulların hepsi sağlanmalı:
1. MVP filter seti (Bölüm 6.1) çalışır durumda, her biri için birim testi var.
2. Pipeline.create() builder API'si, .run() ve .batch() metotları çalışıyor.
3. TexturePool ve PipelineCache aktif, memory leak yok (1000 resim sonrası stabil).
4. JPEG, WebP, PNG encoding çalışıyor; AVIF feature detect edip fallback.
5. EXIF orient filtresi çalışıyor.
6. Chrome, Firefox, Safari, Edge'de smoke test geçiyor.
7. Demo sitesi canlı, 100 resim senaryosu çalışıyor.
8. README, API reference, Getting Started dokümanları yayında.
9. Benchmark tablosu README'de, en az 3 farklı cihazdan sonuçlar.
10. Bundle size < 60KB minified + gzipped (core).
11. TypeScript strict mode, tüm tiplerin d.ts export'u doğru.
12. Changesets ile ilk release (v0.1.0).

17. Sonsöz
pixflow basit bir iddia üzerine inşa edildi: tarayıcılar artık bunu yapabilir, yapsınlar.
Projenin değeri sadece kodda değil. Tarayıcıda ağır hesaplamanın norm olduğu bir gelecek var
ve pixflow bu geleceği somutlaştıran araçlardan biri olacak. Bu dökümanın kendisi de bir söz: 12
hafta sonra elimizde ne olacağının taahhüdüdür.
Bu dökümanı takip et. Her hafta git commit'lerinde hangi bölüme ait olduğunu belirt. Haftalık
progress tweet'lerinde ilgili bölümü referans ver. İşte böylece kod ve döküman birlikte canlanır.

İletişim: burak@iconig.ai Proje: github.com/buraks/pixflow (placeholder) Twitter: build-inpublic thread'leri #pixflow etiketi ile

Bu döküman yaşayan bir dökümandır. Son güncelleme: Nisan 2026.

