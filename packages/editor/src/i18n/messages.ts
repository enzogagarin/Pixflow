/**
 * UI string catalog. Keyed by a stable dot-path; `tr` is the source of
 * truth (target audience is Turkish-speaking), `en` is the fallback for
 * keys that haven't been translated yet (none at present, but the
 * fallback mechanism in `useT` keeps the UI from crashing if a key
 * goes missing mid-refactor).
 *
 * Conventions:
 *   - Keep strings short and interface-grade. No sentences that span
 *     multiple lines via newlines — break into separate keys instead.
 *   - Use `{placeholder}` only; format in caller with replace().
 *   - Don't duplicate English in TR. If a word is identical in both
 *     (e.g. "EXIF"), still list it in both maps — makes diffs and
 *     lookups predictable.
 */
export type Locale = 'tr' | 'en';

export const LOCALES: readonly Locale[] = ['tr', 'en'] as const;

export type MessageKey =
  // App shell
  | 'app.title'
  | 'app.preAlpha'
  | 'app.newImage'
  | 'app.footer.shortcuts'
  | 'app.importedPixflow'
  // DropZone
  | 'dropzone.primary'
  | 'dropzone.hint'
  // Canvas / status
  | 'webgpu.ready'
  | 'webgpu.unavailable'
  | 'webgpu.suggest'
  | 'history.noEdits'
  | 'history.withEdits'
  // Zoom controls
  | 'zoom.in'
  | 'zoom.out'
  | 'zoom.fit'
  | 'zoom.actualSize'
  // Inspector shell
  | 'inspector.title'
  | 'inspector.reset'
  | 'inspector.resetTooltip'
  | 'inspector.nothingToReset'
  | 'inspector.section.geometry'
  | 'inspector.section.color'
  | 'inspector.section.detail'
  | 'inspector.section.overlay'
  | 'inspector.section.export'
  // Geometry
  | 'geometry.rotate'
  | 'geometry.flip.horizontal'
  | 'geometry.flip.vertical'
  | 'geometry.crop'
  | 'geometry.crop.soon'
  | 'geometry.crop.soonTooltip'
  // Color
  | 'color.brightness'
  | 'color.contrast'
  | 'color.saturation'
  | 'color.whiteBalance'
  | 'color.temp'
  | 'color.tint'
  // Detail
  | 'detail.sharpen'
  | 'detail.sharpen.enable'
  | 'detail.sharpen.amount'
  | 'detail.sharpen.radius'
  | 'detail.blur'
  | 'detail.blur.enable'
  | 'detail.blur.sigma'
  // Overlay / Watermark
  | 'watermark.title'
  | 'watermark.pickImage'
  | 'watermark.replace'
  | 'watermark.remove'
  | 'watermark.position'
  | 'watermark.opacity'
  | 'watermark.scale'
  | 'watermark.margin'
  | 'watermark.position.topLeft'
  | 'watermark.position.topRight'
  | 'watermark.position.bottomLeft'
  | 'watermark.position.bottomRight'
  | 'watermark.position.center'
  | 'watermark.position.tile'
  // Face blur
  | 'faceBlur.title'
  | 'faceBlur.enable'
  | 'faceBlur.description'
  | 'faceBlur.style'
  | 'faceBlur.style.pixelate'
  | 'faceBlur.style.gaussian'
  | 'faceBlur.strength'
  | 'faceBlur.addBox'
  | 'faceBlur.picking'
  | 'faceBlur.autoDetect'
  | 'faceBlur.detecting'
  | 'faceBlur.clearAll'
  | 'faceBlur.noRegions'
  | 'faceBlur.warning'
  | 'faceBlur.warningPlural'
  | 'faceBlur.remove'
  | 'faceBlur.phase.fetchingRuntime'
  | 'faceBlur.phase.fetchingModel'
  | 'faceBlur.phase.verifyingModel'
  | 'faceBlur.phase.creatingSession'
  | 'faceBlur.phase.ready'
  | 'faceBlur.noFaces'
  | 'faceBlur.detected'
  | 'faceBlur.detectedPlural'
  // Export
  | 'export.format'
  | 'export.format.webp'
  | 'export.format.jpeg'
  | 'export.format.png'
  | 'export.format.avif'
  | 'export.quality'
  | 'export.qualityPng'
  | 'export.maxDims'
  | 'export.width'
  | 'export.height'
  | 'export.button'
  | 'export.rendering'
  | 'export.busy'
  | 'export.saved'
  | 'export.error'
  | 'export.stripSummary'
  | 'export.obscuresFaces'
  | 'export.obscuresFacesPlural'
  // Help overlay
  | 'help.title'
  | 'help.dismiss'
  | 'help.shortcuts.title'
  | 'help.panel.title'
  | 'help.kbd.undo'
  | 'help.kbd.redo'
  | 'help.kbd.pan'
  | 'help.kbd.compare'
  | 'help.kbd.zoom'
  | 'help.kbd.sliderReset'
  | 'help.kbd.pickExit'
  | 'help.kbd.help'
  | 'help.kbd.export'
  | 'help.panel.geometry'
  | 'help.panel.color'
  | 'help.panel.detail'
  | 'help.panel.overlay'
  | 'help.panel.export'
  | 'help.openHint'
  // Clipboard + unsaved
  | 'clipboard.pasted'
  | 'clipboard.notImage'
  | 'unsaved.warnTitle'
  // Batch mode
  | 'batch.queued'
  | 'batch.queuedPlural'
  | 'batch.exportAll'
  | 'batch.exporting'
  | 'batch.done'
  | 'batch.donePartial';

export type Messages = Record<MessageKey, string>;

export const MESSAGES: Record<Locale, Messages> = {
  tr: {
    'app.title': 'Pixflow Editör',
    'app.preAlpha': 'pre-alpha',
    'app.newImage': '+ Yeni görsel',
    'app.footer.shortcuts':
      'Görseli sürükle · ⌘Z geri al · ⇧⌘Z yinele · Space sürükle · / karşılaştır · +/− yakınlaş · 2× tıkla = sıfırla · ? yardım',
    'app.importedPixflow': 'pixflow v{version}',

    'dropzone.primary': 'Görseli buraya bırak',
    'dropzone.hint': 'ya da tıklayıp seç · her şey cihazında kalır',

    'webgpu.ready': 'WebGPU hazır',
    'webgpu.unavailable': 'WebGPU mevcut değil',
    'webgpu.suggest': 'Chrome 121+, Edge 121+, Safari 26+ veya Firefox 141+ dene',
    'history.noEdits': 'Değişiklik yok',
    'history.withEdits': '{count} değişiklik',

    'zoom.in': 'Yakınlaş',
    'zoom.out': 'Uzaklaş',
    'zoom.fit': 'Sığdır',
    'zoom.actualSize': 'Gerçek',

    'inspector.title': 'Denetçi',
    'inspector.reset': 'Sıfırla',
    'inspector.resetTooltip': 'Tüm değişiklikleri sıfırla (⌘Z geri al)',
    'inspector.nothingToReset': 'Sıfırlanacak değişiklik yok',
    'inspector.section.geometry': 'Geometri',
    'inspector.section.color': 'Renk',
    'inspector.section.detail': 'Detay',
    'inspector.section.overlay': 'Kaplama',
    'inspector.section.export': 'Dışa aktar',

    'geometry.rotate': 'Döndür',
    'geometry.flip.horizontal': 'Yatay çevir',
    'geometry.flip.vertical': 'Dikey çevir',
    'geometry.crop': 'Kırp',
    'geometry.crop.soon': 'Yakında',
    'geometry.crop.soonTooltip': 'İnteraktif kırpma aracı sonraki sürümde',

    'color.brightness': 'Parlaklık',
    'color.contrast': 'Kontrast',
    'color.saturation': 'Doygunluk',
    'color.whiteBalance': 'BEYAZ DENGESİ',
    'color.temp': 'Sıcaklık',
    'color.tint': 'Renk tonu',

    'detail.sharpen': 'Keskinleştir',
    'detail.sharpen.enable': 'Etkin',
    'detail.sharpen.amount': 'Miktar',
    'detail.sharpen.radius': 'Yarıçap',
    'detail.blur': 'Bulanıklaştır',
    'detail.blur.enable': 'Etkin',
    'detail.blur.sigma': 'Şiddet',

    'watermark.title': 'Filigran',
    'watermark.pickImage': 'Görsel seç',
    'watermark.replace': 'Değiştir',
    'watermark.remove': 'Kaldır',
    'watermark.position': 'Konum',
    'watermark.opacity': 'Opaklık',
    'watermark.scale': 'Boyut',
    'watermark.margin': 'Kenar',
    'watermark.position.topLeft': 'SÜ',
    'watermark.position.topRight': 'SA',
    'watermark.position.bottomLeft': 'AÜ',
    'watermark.position.bottomRight': 'AA',
    'watermark.position.center': 'O',
    'watermark.position.tile': 'Döşe',

    'faceBlur.title': 'Yüz maskeleme',
    'faceBlur.enable': 'Etkin',
    'faceBlur.description':
      'Yüzleri veya hassas alanları mozaik veya bulanıklık ile gizle.',
    'faceBlur.style': 'Tip',
    'faceBlur.style.pixelate': 'Mozaik',
    'faceBlur.style.gaussian': 'Bulanık',
    'faceBlur.strength': 'Şiddet',
    'faceBlur.addBox': '+ Alan ekle',
    'faceBlur.picking': 'Alan seçiliyor…',
    'faceBlur.autoDetect': '⚙ Otomatik bul',
    'faceBlur.detecting': 'Tespit ediliyor…',
    'faceBlur.clearAll': 'Tümünü temizle',
    'faceBlur.noRegions':
      'Henüz alan yok. "+ Alan ekle" tıklayıp görselde sürükle ya da tek tıkla.',
    'faceBlur.warning': '⚠ {count} alan dışa aktarımda gizlenecek.',
    'faceBlur.warningPlural': '⚠ {count} alan dışa aktarımda gizlenecek.',
    'faceBlur.remove': '{index}. alanı kaldır',
    'faceBlur.phase.fetchingRuntime': 'Çalışma zamanı indiriliyor (~25 MB, ilk kezde)…',
    'faceBlur.phase.fetchingModel': 'Model indiriliyor (~1.2 MB)…',
    'faceBlur.phase.verifyingModel': 'Bütünlük doğrulanıyor…',
    'faceBlur.phase.creatingSession': 'Başlatılıyor…',
    'faceBlur.phase.ready': 'Yüzler taranıyor…',
    'faceBlur.noFaces': 'Yüz bulunamadı.',
    'faceBlur.detected': '{count} yüz bulundu.',
    'faceBlur.detectedPlural': '{count} yüz bulundu.',

    'export.format': 'Format',
    'export.format.webp': 'WebP',
    'export.format.jpeg': 'JPEG',
    'export.format.png': 'PNG',
    'export.format.avif': 'AVIF',
    'export.quality': 'Kalite',
    'export.qualityPng': 'Kalite (PNG kayıpsız)',
    'export.maxDims': 'Maks. boyut (boş → orijinal boyut)',
    'export.width': 'genişlik',
    'export.height': 'yükseklik',
    'export.button': '↓ Dışa aktar',
    'export.rendering': 'İşleniyor…',
    'export.busy': 'Dışa aktarılıyor…',
    'export.saved':
      'Kaydedildi · {w}×{h} · {kb} KB · {ms} ms',
    'export.error': 'Hata: {message}',
    'export.stripSummary':
      '✓ Tüm EXIF, GPS, kamera bilgileri, XMP ve gömülü küçük görseller dışa aktarımdan kaldırılır.',
    'export.obscuresFaces': 'Dışa aktarma {count} yüz alanını gizleyecek.',
    'export.obscuresFacesPlural': 'Dışa aktarma {count} yüz alanını gizleyecek.',

    'help.title': 'Kısayollar ve paneller',
    'help.dismiss': 'Kapat',
    'help.shortcuts.title': 'Klavye kısayolları',
    'help.panel.title': 'Paneller',
    'help.kbd.undo': 'Geri al',
    'help.kbd.redo': 'Yinele',
    'help.kbd.pan': 'Sürükle',
    'help.kbd.compare': 'Önce/sonra karşılaştır',
    'help.kbd.zoom': 'Yakınlaş / uzaklaş',
    'help.kbd.sliderReset': 'Değeri sıfırla',
    'help.kbd.pickExit': 'Alan seçimi bitir',
    'help.kbd.help': 'Bu yardımı aç',
    'help.kbd.export': 'Dışa aktar',
    'help.panel.geometry':
      'Döndürme, yatay/dikey çevirme. Kırpma sonraki sürümde.',
    'help.panel.color': 'Parlaklık, kontrast, doygunluk ve beyaz dengesi.',
    'help.panel.detail': 'Keskinleştirme ve gauss bulanıklığı.',
    'help.panel.overlay':
      'Filigran ekleme ve yüzleri maskeleme (manuel veya otomatik BlazeFace).',
    'help.panel.export':
      'Format, kalite, boyut seç; EXIF/GPS otomatik kaldırılır.',
    'help.openHint': '? ile yardımı aç',

    'clipboard.pasted': 'Panodan görsel alındı',
    'clipboard.notImage': 'Panoda görsel yok',
    'unsaved.warnTitle':
      'Kaydedilmemiş değişiklikler var. Sayfadan ayrılmak istediğinden emin misin?',

    'batch.queued': '{count} görsel kuyrukta',
    'batch.queuedPlural': '{count} görsel kuyrukta',
    'batch.exportAll': '↓ Hepsini dışa aktar ({count})',
    'batch.exporting': 'İşleniyor: {done}/{total} · {name}',
    'batch.done':
      'ZIP kaydedildi · {count} görsel · {mb} MB · {ms} ms',
    'batch.donePartial':
      'ZIP kaydedildi · {count}/{total} başarılı ({errors} hata) · {ms} ms',
  },
  en: {
    'app.title': 'Pixflow Editor',
    'app.preAlpha': 'pre-alpha',
    'app.newImage': '+ New image',
    'app.footer.shortcuts':
      'Drop image · ⌘Z undo · ⇧⌘Z redo · Space pan · / compare · +/− zoom · 2× click slider = reset · ? help',
    'app.importedPixflow': 'pixflow v{version}',

    'dropzone.primary': 'Drop image here',
    'dropzone.hint': 'or click to browse · everything stays on your device',

    'webgpu.ready': 'WebGPU ready',
    'webgpu.unavailable': 'WebGPU unavailable',
    'webgpu.suggest': 'Try Chrome 121+, Edge 121+, Safari 26+, or Firefox 141+',
    'history.noEdits': 'No edits yet',
    'history.withEdits': '{count} edit(s)',

    'zoom.in': 'Zoom in',
    'zoom.out': 'Zoom out',
    'zoom.fit': 'Fit',
    'zoom.actualSize': '1:1',

    'inspector.title': 'Inspector',
    'inspector.reset': 'Reset',
    'inspector.resetTooltip': 'Reset all edits (⌘Z to undo)',
    'inspector.nothingToReset': 'No edits to reset',
    'inspector.section.geometry': 'Geometry',
    'inspector.section.color': 'Color',
    'inspector.section.detail': 'Detail',
    'inspector.section.overlay': 'Overlay',
    'inspector.section.export': 'Export',

    'geometry.rotate': 'Rotate',
    'geometry.flip.horizontal': 'Flip horizontal',
    'geometry.flip.vertical': 'Flip vertical',
    'geometry.crop': 'Crop',
    'geometry.crop.soon': 'Soon',
    'geometry.crop.soonTooltip': 'Interactive crop tool coming in a later release',

    'color.brightness': 'Brightness',
    'color.contrast': 'Contrast',
    'color.saturation': 'Saturation',
    'color.whiteBalance': 'WHITE BALANCE',
    'color.temp': 'Temp',
    'color.tint': 'Tint',

    'detail.sharpen': 'Sharpen',
    'detail.sharpen.enable': 'Enable',
    'detail.sharpen.amount': 'Amount',
    'detail.sharpen.radius': 'Radius',
    'detail.blur': 'Blur',
    'detail.blur.enable': 'Enable',
    'detail.blur.sigma': 'Sigma',

    'watermark.title': 'Watermark',
    'watermark.pickImage': 'Pick image',
    'watermark.replace': 'Replace',
    'watermark.remove': 'Remove',
    'watermark.position': 'Position',
    'watermark.opacity': 'Opacity',
    'watermark.scale': 'Scale',
    'watermark.margin': 'Margin',
    'watermark.position.topLeft': 'TL',
    'watermark.position.topRight': 'TR',
    'watermark.position.bottomLeft': 'BL',
    'watermark.position.bottomRight': 'BR',
    'watermark.position.center': 'C',
    'watermark.position.tile': 'Tile',

    'faceBlur.title': 'Face blur',
    'faceBlur.enable': 'Enable',
    'faceBlur.description':
      'Mask faces or sensitive areas with pixelation or gaussian blur.',
    'faceBlur.style': 'Style',
    'faceBlur.style.pixelate': 'Pixel',
    'faceBlur.style.gaussian': 'Blur',
    'faceBlur.strength': 'Strength',
    'faceBlur.addBox': '+ Add box',
    'faceBlur.picking': 'Picking…',
    'faceBlur.autoDetect': '⚙ Auto-detect',
    'faceBlur.detecting': 'Detecting…',
    'faceBlur.clearAll': 'Clear all',
    'faceBlur.noRegions':
      'No regions yet. Click "+ Add box" then click on the image to place one.',
    'faceBlur.warning': '⚠ {count} region will be obscured on export.',
    'faceBlur.warningPlural': '⚠ {count} regions will be obscured on export.',
    'faceBlur.remove': 'Remove region {index}',
    'faceBlur.phase.fetchingRuntime': 'Loading runtime (~25 MB, first time only)…',
    'faceBlur.phase.fetchingModel': 'Fetching model (~1.2 MB)…',
    'faceBlur.phase.verifyingModel': 'Verifying integrity…',
    'faceBlur.phase.creatingSession': 'Initializing…',
    'faceBlur.phase.ready': 'Scanning for faces…',
    'faceBlur.noFaces': 'No faces detected.',
    'faceBlur.detected': 'Detected {count} face.',
    'faceBlur.detectedPlural': 'Detected {count} faces.',

    'export.format': 'Format',
    'export.format.webp': 'WebP',
    'export.format.jpeg': 'JPEG',
    'export.format.png': 'PNG',
    'export.format.avif': 'AVIF',
    'export.quality': 'Quality',
    'export.qualityPng': 'Quality (PNG is lossless)',
    'export.maxDims': 'Max dimensions (leave blank to keep source size)',
    'export.width': 'width',
    'export.height': 'height',
    'export.button': '↓ Export',
    'export.rendering': 'Rendering…',
    'export.busy': 'Exporting…',
    'export.saved': 'Saved · {w}×{h} · {kb} KB · {ms} ms',
    'export.error': 'Error: {message}',
    'export.stripSummary':
      '✓ All EXIF, GPS, camera-identifying tags, XMP, and embedded thumbnails are stripped on export.',
    'export.obscuresFaces': 'Export will obscure {count} face region.',
    'export.obscuresFacesPlural': 'Export will obscure {count} face regions.',

    'help.title': 'Shortcuts & panels',
    'help.dismiss': 'Close',
    'help.shortcuts.title': 'Keyboard shortcuts',
    'help.panel.title': 'Panels',
    'help.kbd.undo': 'Undo',
    'help.kbd.redo': 'Redo',
    'help.kbd.pan': 'Pan',
    'help.kbd.compare': 'Before/after compare',
    'help.kbd.zoom': 'Zoom in / out',
    'help.kbd.sliderReset': 'Reset slider to default',
    'help.kbd.pickExit': 'Exit face-box picking',
    'help.kbd.help': 'Open this help',
    'help.kbd.export': 'Export',
    'help.panel.geometry': 'Rotation and flip. Crop ships in a later release.',
    'help.panel.color': 'Brightness, contrast, saturation, and white balance.',
    'help.panel.detail': 'Sharpen and gaussian blur.',
    'help.panel.overlay':
      'Watermark and face masking (manual or automatic via BlazeFace).',
    'help.panel.export':
      'Choose format, quality, and size; EXIF/GPS are stripped automatically.',
    'help.openHint': 'Press ? for help',

    'clipboard.pasted': 'Image pasted from clipboard',
    'clipboard.notImage': 'No image on clipboard',
    'unsaved.warnTitle':
      'You have unsaved changes. Are you sure you want to leave?',

    'batch.queued': '{count} image queued',
    'batch.queuedPlural': '{count} images queued',
    'batch.exportAll': '↓ Export all ({count})',
    'batch.exporting': 'Processing: {done}/{total} · {name}',
    'batch.done':
      'ZIP saved · {count} images · {mb} MB · {ms} ms',
    'batch.donePartial':
      'ZIP saved · {count}/{total} succeeded ({errors} errors) · {ms} ms',
  },
};
