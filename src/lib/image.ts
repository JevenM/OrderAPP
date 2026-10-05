/**
 * 上传前的图片压缩：统一压到 20KB 左右再上传
 * 手机直出照片动辄 3~5MB，Supabase 免费额度 + 流量都扛不住，这里在浏览器里先压好。
 */

/** 压缩目标：20KB */
export const TARGET_PHOTO_BYTES = 20 * 1024

/** 长边上限：先把像素降下来，再调画质，比单纯降质量清晰得多 */
const MAX_EDGE = 1280

export type CompressedImage = {
  file: File
  /** 压缩后大小（字节） */
  size: number
  /** 原图大小（字节） */
  originalSize: number
}

/** 把字节数显示成 KB / MB */
export function sizeText(bytes: number): string {
  if (!bytes) return '0KB'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('这张图片浏览器读不出来，换一张试试'))
    }
    img.src = url
  })
}

function render(img: HTMLImageElement, w: number, h: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('浏览器不支持图片压缩'))
      return
    }
    // JPEG 没有透明通道，先铺白底，否则 png 透明区域会变黑
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片压缩失败，换一张试试'))),
      'image/jpeg',
      quality
    )
  })
}

/**
 * 压缩到 targetBytes 以内：先按长边限制降分辨率，再逐步降画质，仍不达标就继续缩小。
 * 极端情况下（比如超长图）退到最后一次结果，保证一定能拿到图。
 */
export async function compressImage(file: File, targetBytes = TARGET_PHOTO_BYTES): Promise<CompressedImage> {
  const img = await loadImage(file)

  // 针对特大原图（例如 10MB~50MB），先根据分辨率预收缩，初始长边限制在 1280 像素
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  let w = Math.max(1, Math.round(img.width * scale))
  let h = Math.max(1, Math.round(img.height * scale))
  let quality = 0.8

  let blob = await render(img, w, h, quality)
  let rounds = 0

  // 增大循环轮次，增加阶梯步进收缩算法，保证超大图片也能稳定压进 20KB（targetBytes）以内
  while (blob.size > targetBytes && rounds < 35) {
    rounds += 1
    if (quality > 0.5) {
      quality = Math.max(0.45, quality - 0.1)
    } else if (w > 320 && h > 320) {
      w = Math.round(w * 0.75)
      h = Math.round(h * 0.75)
      quality = 0.7
    } else if (quality > 0.25) {
      quality = Math.max(0.2, quality - 0.08)
    } else if (w > 160 && h > 160) {
      w = Math.round(w * 0.8)
      h = Math.round(h * 0.8)
      quality = 0.35
    } else {
      break // 已经极限缩小，退出循环
    }
    blob = await render(img, w, h, quality)
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
  const next = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  return { file: next, size: next.size, originalSize: file.size }
}
