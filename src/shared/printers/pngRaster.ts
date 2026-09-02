import { PNG } from 'pngjs'

export type EscposRasterImage = {
  width: number
  height: number
  dataBase64: string
}

const pixelLuminance = (data: Buffer, offset: number) => {
  const alpha = data[offset + 3] / 255
  const color =
    0.2126 * data[offset] +
    0.7152 * data[offset + 1] +
    0.0722 * data[offset + 2]
  return 255 - alpha * (255 - color)
}

const contentBounds = (png: PNG) => {
  let left = png.width
  let right = -1
  let top = png.height
  let bottom = -1

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (pixelLuminance(png.data, (y * png.width + x) * 4) >= 248) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }

  if (right < left || bottom < top) {
    return { left: 0, top: 0, width: png.width, height: png.height }
  }

  const margin = 4
  const boundedLeft = Math.max(0, left - margin)
  const boundedTop = Math.max(0, top - margin)
  const boundedRight = Math.min(png.width - 1, right + margin)
  const boundedBottom = Math.min(png.height - 1, bottom + margin)
  return {
    left: boundedLeft,
    top: boundedTop,
    width: boundedRight - boundedLeft + 1,
    height: boundedBottom - boundedTop + 1,
  }
}

export function rasterizePngForEscpos(
  input: Buffer,
  options: {
    maxWidthDots: number
    threshold?: number
    cropWhitespace?: boolean
  },
): EscposRasterImage {
  const png = PNG.sync.read(input)
  if (!png.width || !png.height) throw new Error('PNG has no printable pixels')

  const bounds =
    options.cropWhitespace === false
      ? { left: 0, top: 0, width: png.width, height: png.height }
      : contentBounds(png)
  const scale = Math.min(1, options.maxWidthDots / bounds.width)
  const width = Math.max(1, Math.round(bounds.width * scale))
  const height = Math.max(1, Math.round(bounds.height * scale))
  const widthBytes = Math.ceil(width / 8)
  const raster = Buffer.alloc(widthBytes * height)
  const threshold = options.threshold ?? 205

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(png.height - 1, bounds.top + Math.floor(y / scale))
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(
        png.width - 1,
        bounds.left + Math.floor(x / scale),
      )
      const luminance = pixelLuminance(
        png.data,
        (sourceY * png.width + sourceX) * 4,
      )
      if (luminance >= threshold) continue
      raster[y * widthBytes + Math.floor(x / 8)] |= 0x80 >> (x % 8)
    }
  }

  return {
    width,
    height,
    dataBase64: raster.toString('base64'),
  }
}
