import { assetContents } from "@/generated/assetMap";
import * as base64js from "base64-js";
import { ExpoWebGLRenderingContext } from "expo-gl";
import * as UPNG from "upng-js";

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

  public static registerTexture(name: string) {
    if (!this._registered.has(name)) {
      // placeholder until atlas is built
      this._registered.set(name, { name, x: 0, y: 0, width: 1, height: 1 });
      console.log(`TextureManager.registerTexture: registered placeholder for ${name}`);
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
    console.log("TextureManager.init: registered textures:", Array.from(this._registered.keys()));
    const imgs: {
      name: string;
      width: number;
      height: number;
      rgba: Uint8Array;
    }[] = [];
    for (const [name] of this._registered) {
      const pngKey = `textures/${name}.png`;
      const data = (assetContents as any)[pngKey];
      if (!data) {
        console.log(`TextureManager.init: no embedded asset for key ${pngKey}`);
        continue;
      }

      try {
        // data is base64 string (no data: prefix) as produced by gen script
        const bin = base64js.toByteArray(data);
        // UPNG.decode expects a tightly-sliced ArrayBuffer
        const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
        const dec = UPNG.decode(ab as any);
        const rgbaResult = UPNG.toRGBA8(dec as any);
        // toRGBA8 may return a single Uint8Array, an ArrayBuffer, an array of frames, or an array of numbers
        let rgba: Uint8Array | undefined;
        const tryCoerce = (val: any): Uint8Array | undefined => {
          if (!val) return undefined;
          if (val instanceof Uint8Array) return val;
          if (val instanceof ArrayBuffer) return new Uint8Array(val);
          if (Array.isArray(val)) return new Uint8Array(val as any);
          return undefined;
        };

        if (Array.isArray(rgbaResult)) {
          rgba = tryCoerce(rgbaResult[0]);
        } else {
          rgba = tryCoerce(rgbaResult);
        }

        if (!rgba) {
          console.warn(`TextureManager: UPNG.toRGBA8 returned unexpected result for ${name}`);
          continue;
        }

        imgs.push({
          name,
          width: dec.width,
          height: dec.height,
          rgba: rgba,
        });
      } catch (err) {
        console.warn(
          `TextureManager: failed to decode embedded image for ${name}:`,
          err
        );
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
      console.warn(`TextureManager: skipping ${skipped} - invalid or missing RGBA data`);
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

    // Simple horizontal packing: place images side-by-side
    // Also allocate 1x1 placeholder pixels for any registered textures that were not found
    const registeredNames = Array.from(this._registered.keys());
    const foundNames = validImgs.map((it) => it.name);
    const missingNames = registeredNames.filter((n) => !foundNames.includes(n));

    const atlasWidth = validImgs.reduce((s, it) => s + it.width, 0) + missingNames.length * 1;
    const atlasHeight = Math.max(1, ...validImgs.map((it) => it.height));

    // Create RGBA buffer for atlas and blit each image into it
    const atlasPixels = new Uint8Array(atlasWidth * atlasHeight * 4);
    atlasPixels.fill(0);
    let xOff = 0;

    // Blit valid images
    for (const it of validImgs) {
      for (let row = 0; row < it.height; row++) {
        const srcStart = row * it.width * 4;
        const dstStart = (row * atlasWidth + xOff) * 4;
        atlasPixels.set(it.rgba.subarray(srcStart, srcStart + it.width * 4), dstStart);
      }
      this._registered.set(it.name, {
        name: it.name,
        x: xOff,
        y: 0,
        width: it.width,
        height: it.height,
      });
      xOff += it.width;
    }

    // Reserve a dedicated 1x1 white pixel per-missing texture so placeholders don't overlap real images
    if (missingNames.length > 0) {
      const white = new Uint8Array([255, 255, 255, 255]);
      for (const name of missingNames) {
        // place white pixel at (xOff, 0)
        const dstStart = (0 * atlasWidth + xOff) * 4;
        atlasPixels.set(white, dstStart);
        this._registered.set(name, {
          name,
          x: xOff,
          y: 0,
          width: 1,
          height: 1,
        });
        xOff += 1;
      }
      console.log(`TextureManager: reserved ${missingNames.length} placeholder pixel(s) for missing textures: ${missingNames.join(", ")}`);
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
    console.log(`TextureManager: built atlas ${atlasWidth}x${atlasHeight} with ${validImgs.length} images`);
    this._registered.forEach((m) => console.log("Texture meta:", m));
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
