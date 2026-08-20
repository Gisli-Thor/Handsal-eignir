/**
 * Server-side image derivatives (SPEC §5): every upload gets a web-size and a
 * thumbnail JPEG. JPEG (not WebP) because the derivatives are reused by the
 * söluyfirlit PDF renderer (M4), which only takes JPEG/PNG.
 */
import sharp from "sharp";
import { THUMB_MAX_EDGE, WEB_MAX_EDGE } from "@/core/media/constants";

export interface ImageDerivatives {
  web: Buffer;
  thumb: Buffer;
  /** Dimensions of the original, after EXIF orientation is applied. */
  width: number;
  height: number;
}

export async function createImageDerivatives(
  original: Buffer,
): Promise<ImageDerivatives> {
  // .rotate() with no args applies the EXIF orientation.
  const base = sharp(original).rotate();

  const { data: web, info } = await base
    .clone()
    .resize({
      width: WEB_MAX_EDGE,
      height: WEB_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const thumb = await base
    .clone()
    .resize({
      width: THUMB_MAX_EDGE,
      height: THUMB_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();

  const meta = await base.metadata();
  // metadata() reports pre-rotation dimensions; swap for 90°/270° EXIF turns.
  const swapped = (meta.orientation ?? 1) >= 5;
  const width = (swapped ? meta.height : meta.width) ?? info.width;
  const height = (swapped ? meta.width : meta.height) ?? info.height;

  return { web, thumb, width, height };
}
