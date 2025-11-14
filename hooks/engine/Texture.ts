import { assetContents } from "@/generated/assetMap";
import * as base64js from "base64-js";
import { ExpoWebGLRenderingContext } from "expo-gl";
import * as UPNG from "upng-js";
import * as jpeg from "jpeg-js";
import Logger from "@/hooks/helpers/logger";

type TexMeta = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export default class TextureManager {
  private static _registered: Map<string, TexMeta> = new Map();
  private static _atlasTex: WebGLTexture | null = null;
  private static _atlasWidth = 1;
  private static _atlasHeight = 1;

  // Register a texture name used by the renderer.
  // Optionally provide an explicit assetKey (key inside generated assetContents)
  // if the texture filename in assets doesn't match the logical name.
  public static registerTexture(name: string, assetKey?: string) {
    if (!this._registered.has(name)) {
      // placeholder until atlas is built. store assetKey so init() can look up the correct embedded asset.
      const meta: TexMeta & { assetKey?: string } = { name, x: 0, y: 0, width: 1, height: 1 };
      if (assetKey) (meta as any).assetKey = assetKey;
      this._registered.set(name, meta as TexMeta);
      Logger.debug(`TextureManager.registerTexture: registered placeholder for ${name} (assetKey=${assetKey || "<none>"})`);
    }
  }

  // Build a simple horizontal atlas if PNG/JPG base64 data is present in generated assetContents (web-friendly).
  public static async init(gl: ExpoWebGLRenderingContext) {
    this._atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._atlasTex);

    // set default params first
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Try to load image data from generated assetContents (base64 strings produced by gen script)
  Logger.info("TextureManager.init: registered textures:", Array.from(this._registered.keys()));
    const imgs: {
      name: string;
      width: number;
      height: number;
      rgba: Uint8Array;
    }[] = [];
    for (const [name, meta] of this._registered) {
      // Determine which embedded asset key (if any) corresponds to this registered texture.
      // Prefer explicit assetKey stored on registration; otherwise try a few heuristics.
      const explicit = (meta as any).assetKey as string | undefined;
      const possibleKeys: string[] = [];
      if (explicit) possibleKeys.push(explicit);
      // Default lookup: textures/<name>.(png|jpeg|jpg)
      possibleKeys.push(`textures/${name}.png`);
      possibleKeys.push(`textures/${name}.jpeg`);
      possibleKeys.push(`textures/${name}.jpg`);
      // Also try to find any embedded texture whose filename contains the registered name
      // and some common variants (ignore separators)
      const normalized = (s: string) => s.replace(/[_\-.\s]/g, "").toLowerCase();
      // Only consider image assets (png/jpeg) to avoid matching obj/mtl text files
      const assetCandidates = Object.keys(assetContents).filter((k) => {
        if (!/\.(png|jpe?g)$/i.test(k)) return false;
        const bn = k.replace(/.*\//, "");
        return bn.toLowerCase().includes(name.toLowerCase()) || normalized(bn).includes(normalized(name));
      });
      // push candidates (prefer shorter keys first)
      assetCandidates.sort((a, b) => a.length - b.length);
      for (const c of assetCandidates) possibleKeys.push(c);

      let data: string | undefined = undefined;
      let foundKey: string | undefined = undefined;
      for (const k of possibleKeys) {
        const d = (assetContents as any)[k];
        if (d) {
          data = d;
          foundKey = k;
          break;
        }
      }

      if (!data) {
        Logger.debug(`TextureManager.init: no embedded asset for registered texture ${name} (tried: ${possibleKeys.join(",")})`);
        continue;
      }

      try {
        // data is base64 string (no data: prefix) as produced by gen script
        const bin = base64js.toByteArray(data);
        const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);

        // Choose decoder based on foundKey extension (fallback to PNG decoder)
        const fk = foundKey ? foundKey.toLowerCase() : "";
        if (fk.endsWith(".jpg") || fk.endsWith(".jpeg")) {
          // jpeg-js can decode Uint8Array/ArrayBuffer
          const decJ = jpeg.decode(ab as any, { useTArray: true });
          if (!decJ || !decJ.data) {
            Logger.warn(`TextureManager: jpeg-js returned no data for ${name}`);
            continue;
          }
          // jpeg-js returns RGBA Uint8Array
          imgs.push({ name, width: decJ.width, height: decJ.height, rgba: decJ.data });
        } else {
          // PNG (or fallback) decode via UPNG
          const dec = UPNG.decode(ab as any);
          const rgbaResult = UPNG.toRGBA8(dec as any);
          let rgba: Uint8Array | undefined;
          const tryCoerce = (val: any): Uint8Array | undefined => {
            if (!val) return undefined;
            if (val instanceof Uint8Array) return val;
            if (val instanceof ArrayBuffer) return new Uint8Array(val);
            if (Array.isArray(val)) return new Uint8Array(val as any);
            return undefined;
          };
          if (Array.isArray(rgbaResult)) rgba = tryCoerce(rgbaResult[0]);
          else rgba = tryCoerce(rgbaResult);
          if (!rgba) {
            Logger.warn(`TextureManager: UPNG.toRGBA8 returned unexpected result for ${name}`);
            continue;
          }
          imgs.push({ name, width: dec.width, height: dec.height, rgba: rgba });
        }

        // If we found a specific asset key, remember it on the registered meta so later code can use the same key
        if (foundKey) {
          const registered = this._registered.get(name);
          if (registered) (registered as any).assetKey = foundKey;
        }
      } catch (err) {
        Logger.warn(`TextureManager: failed to decode embedded image for ${name}:`, err);
      }
    }

    if (imgs.length === 0) {
      // no images decoded — upload single white pixel as placeholder
      const pixel = new Uint8Array([255, 255, 255, 255]);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel
      );
      this._atlasWidth = 1;
      this._atlasHeight = 1;
      this._registered.forEach((meta, key) => {
        this._registered.set(key, {
          name: key,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        });
      });
      return;
    }

    // Filter to only images with a usable RGBA buffer
    const validImgs = imgs.filter(
      (it) => it.rgba && typeof (it.rgba as any).subarray === "function" && it.rgba.length >= it.width * it.height * 4
    );

    if (validImgs.length !== imgs.length) {
      const skipped = imgs
        .filter((it) => !validImgs.includes(it))
        .map((it) => it.name || "<unknown>")
        .join(", ");
      Logger.warn(`TextureManager: skipping ${skipped} - invalid or missing RGBA data`);
    }

    if (validImgs.length === 0) {
      // no valid images after decode — upload single white pixel as placeholder
      const pixel = new Uint8Array([255, 255, 255, 255]);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel
      );
      this._atlasWidth = 1;
      this._atlasHeight = 1;
      this._registered.forEach((meta, key) => {
        this._registered.set(key, {
          name: key,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        });
      });
      return;
    }

    // Pack images into rows constrained by GL_MAX_TEXTURE_SIZE to avoid creating extremely wide atlases
    const maxTexSize = (gl.getParameter as any)(gl.MAX_TEXTURE_SIZE) || 4096;
    const maxAtlasWidth = Math.max(256, Math.min(16384, maxTexSize));
    Logger.info(`TextureManager: GL_MAX_TEXTURE_SIZE=${maxTexSize}, packing atlas with max width ${maxAtlasWidth}`);

    const registeredNames = Array.from(this._registered.keys());
    const foundNames = validImgs.map((it) => it.name);
    const missingNames = registeredNames.filter((n) => !foundNames.includes(n));

    // Build rows: fill each row until adding the next image would exceed maxAtlasWidth
    type Row = { items: typeof validImgs; width: number; height: number };
    const rows: Array<{ items: typeof validImgs; width: number; height: number }> = [];
    let curRowItems: typeof validImgs = [];
    let curRowW = 0;
    let curRowH = 0;
    for (const it of validImgs) {
      if (it.width > maxAtlasWidth) {
        Logger.warn(`TextureManager: image ${it.name} width ${it.width} exceeds max texture size ${maxAtlasWidth}, skipping and reserving placeholder`);
        // mark as missing by not including it
        continue;
      }
      if (curRowW + it.width > maxAtlasWidth && curRowItems.length > 0) {
        rows.push({ items: curRowItems, width: curRowW, height: curRowH });
        curRowItems = [];
        curRowW = 0;
        curRowH = 0;
      }
      curRowItems.push(it);
      curRowW += it.width;
      curRowH = Math.max(curRowH, it.height);
    }
    if (curRowItems.length > 0) rows.push({ items: curRowItems, width: curRowW, height: curRowH });

    const atlasWidth = Math.max(1, ...rows.map((r) => r.width));
    const atlasHeight = rows.reduce((s, r) => s + r.height, 0) + Math.max(0, missingNames.length); // add at least 1px per missing

    // Create RGBA buffer for atlas and blit each image into it
    const atlasPixels = new Uint8Array(atlasWidth * atlasHeight * 4);
    atlasPixels.fill(0);

    let yOff = 0;
    for (const row of rows) {
      let xOff = 0;
      for (const it of row.items) {
        for (let rowIdx = 0; rowIdx < it.height; rowIdx++) {
          const srcStart = rowIdx * it.width * 4;
          const dstStart = ((yOff + rowIdx) * atlasWidth + xOff) * 4;
          atlasPixels.set(it.rgba.subarray(srcStart, srcStart + it.width * 4), dstStart);
        }
        this._registered.set(it.name, {
          name: it.name,
          x: xOff,
          y: yOff,
          width: it.width,
          height: it.height,
        });
        xOff += it.width;
      }
      yOff += row.height;
    }

    // Reserve a dedicated 1x1 white pixel per-missing texture so placeholders don't overlap real images
    if (missingNames.length > 0) {
      const white = new Uint8Array([255, 255, 255, 255]);
      for (const name of missingNames) {
        const dstStart = (yOff * atlasWidth + 0) * 4; // place at start of a new row
        atlasPixels.set(white, dstStart);
        this._registered.set(name, {
          name,
          x: 0,
          y: yOff,
          width: 1,
          height: 1,
        });
        yOff += 1;
      }
      Logger.debug(`TextureManager: reserved ${missingNames.length} placeholder pixel(s) for missing textures: ${missingNames.join(", ")}`);
    }

    // Ensure proper unpack alignment for arbitrary widths
    try {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    } catch (e) {
      // pixelStorei may not be available or necessary on all platforms; ignore errors
    }

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      atlasWidth,
      atlasHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      atlasPixels
    );

    this._atlasWidth = atlasWidth;
    this._atlasHeight = atlasHeight;
    Logger.info(`TextureManager: built atlas ${atlasWidth}x${atlasHeight} with ${validImgs.length} images`);
    this._registered.forEach((m) => Logger.debug("Texture meta:", m));
  }

  public static bindAtlas(gl: ExpoWebGLRenderingContext, unit = 1) {
    if (!this._atlasTex) return;
    // Use numeric enum arithmetic which is more reliable across RN GL implementations
    const activeEnum = (gl as any).TEXTURE0 + unit;
    gl.activeTexture(activeEnum);
    gl.bindTexture(gl.TEXTURE_2D, this._atlasTex);
  }

  public static getMeta(name: string) {
    return (
      this._registered.get(name) || { name, x: 0, y: 0, width: 1, height: 1 }
    );
  }

  public static getAtlasSize() {
    return { width: this._atlasWidth, height: this._atlasHeight };
  }
}
