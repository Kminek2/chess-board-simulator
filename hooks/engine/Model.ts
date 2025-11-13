import { assetContents } from "@/generated/assetMap";
import Logger from "@/hooks/helpers/logger";
import readFile from "@/hooks/helpers/read-file";
import * as base64js from "base64-js";
import { Paths } from "expo-file-system";
import TextureManager from "./Texture";

// Toggle heavy per-primitive debug logging for GLB parsing. Set to `true` to
// enable the existing detailed sampling logs for targeted models (eg. 'store').
// Keep `false` by default to avoid Metro log spam during normal runs.
const MODEL_DEBUG = true;

export default class Model {
  private _vertices: Float32Array;
  private _texcoords: Float32Array;
  private _indices: Uint32Array;
  private _name: string;
  private _drawRanges: Array<{
    start: number;
    count: number;
    material: string;
  }> = [];
  private _textureNames: string[] = [];
  private static _MODEL_FOLDER = "./models";
  private static _MODEL_EXTENSION = ".obj";

  constructor(
    name: string,
    preloaded?: {
      vertices?: Float32Array;
      indices?: Uint32Array;
      drawRanges?: any[];
      textureNames?: string[];
    }
  ) {
    this._name = name;
    if (preloaded && preloaded.vertices && preloaded.indices) {
      this._vertices = preloaded.vertices;
      this._indices = preloaded.indices;
      this._drawRanges = preloaded.drawRanges || [];
      this._textureNames = preloaded.textureNames || [];
      this._texcoords = new Float32Array(0);
    } else {
      // Prefer embedded GLB if present: models/<name>.glb
      const glbKey = `models/${name}.glb`;
      if ((assetContents as any)[glbKey]) {
        try {
          const parsed = Model.parseGLB((assetContents as any)[glbKey], name);
          this._vertices = parsed.vertices;
          this._indices = parsed.indices;
          this._drawRanges = parsed.drawRanges || [];
          this._textureNames = parsed.textureNames || [];
          this._texcoords = new Float32Array(0);
        } catch (err) {
          // fallback to OBJ parsing if GLB parse fails
          const model_data = Model._loadDataFromModel(Model._getModelSrc(name));
          // model_data.vertices is an interleaved Float32Array [x,y,z,u,v] per-vertex
          this._vertices = model_data.vertices;
          // keep texcoords for compatibility (may be empty)
          this._texcoords = model_data.texcoords || new Float32Array(0);
          this._indices = model_data.indices;
          this._drawRanges = model_data.drawRanges || [];
          this._textureNames = model_data.textureNames || [];
        }
      } else {
        const model_data = Model._loadDataFromModel(Model._getModelSrc(name));
        // model_data.vertices is an interleaved Float32Array [x,y,z,u,v] per-vertex
        this._vertices = model_data.vertices;
        // keep texcoords for compatibility (may be empty)
        this._texcoords = model_data.texcoords || new Float32Array(0);
        this._indices = model_data.indices;
        this._drawRanges = model_data.drawRanges || [];
        this._textureNames = model_data.textureNames || [];
      }
    }
  }

  public get name() {
    return this._name;
  }

  public getVertices() {
    return this._vertices;
  }

  public getDrawRanges() {
    return this._drawRanges;
  }

  public getTextureNames() {
    return this._textureNames;
  }

  public getIndices() {
    return this._indices;
  }

  private static _getModelSrc(model_path: string) {
    return readFile(this._fullModelPath(model_path, this._MODEL_EXTENSION));
  }

  private static _loadDataFromModel(model_src: string) {
    // We'll build unique vertices for each (pos,uv,norm) tuple to support OBJ files
    const positions: number[] = [];
    const rawTexcoords: number[] = [];
    const normals: number[] = [];

    const lines = model_src.split("\n");
    // faces will be a flat list of {vi,vti,vni}
    type FaceIdx = {
      vi: number;
      vti?: number;
      vni?: number;
      material?: string;
    };
    const faces: FaceIdx[] = [];

    // Track per-material faces for draw ranges
    const materialFaces: Map<string, FaceIdx[]> = new Map();
    let currentMaterial = "default";

    for (let line of lines) {
      line = line.trim();
      if (line.length === 0 || line.startsWith("#")) continue;
      if (line.startsWith("v ")) {
        const [, x, y, z] = line.split(/\s+/);
        positions.push(parseFloat(x), parseFloat(y), parseFloat(z));
      } else if (line.startsWith("vt ")) {
        const [, u, v] = line.split(/\s+/);
        rawTexcoords.push(parseFloat(u), parseFloat(v));
      } else if (line.startsWith("vn ")) {
        const [, x, y, z] = line.split(/\s+/);
        normals.push(parseFloat(x), parseFloat(y), parseFloat(z));
      } else if (line.startsWith("usemtl ")) {
        const [, mname] = line.split(/\s+/);
        currentMaterial = mname || "default";
      } else if (line.startsWith("f ")) {
        const [, ...faceParts] = line.split(/\s+/);
        // triangulate polygons (OBJ faces may have more than 3 verts)
        const tris: FaceIdx[] = [];
        for (let f of faceParts) {
          const parts = f.split("/");
          const vi = parseInt(parts[0], 10) - 1;
          const vti = parts[1] ? parseInt(parts[1], 10) - 1 : undefined;
          const vni = parts[2] ? parseInt(parts[2], 10) - 1 : undefined;
          tris.push({ vi, vti, vni });
        }
        // If polygon is a triangle or quad etc, fan-triangulate
        for (let i = 1; i + 1 < tris.length; i++) {
          const a = tris[0];
          const b = tris[i];
          const c = tris[i + 1];
          a.material = currentMaterial;
          b.material = currentMaterial;
          c.material = currentMaterial;
          faces.push(a, b, c);
        }
      }
    }

    // Build unique vertex list, grouped by material to produce draw ranges
    const uniqueMap = new Map<string, number>();
    const verts: number[] = []; // interleaved x,y,z,u,v
    const indices: number[] = [];
    const drawRanges: Array<{
      start: number;
      count: number;
      material: string;
    }> = [];

    // Group faces by material
    const groups = new Map<string, FaceIdx[]>();
    for (const f of faces) {
      const mat = f.material || "default";
      if (!groups.has(mat)) groups.set(mat, []);
      groups.get(mat)!.push(f);
    }

    for (const [mat, matFaces] of groups) {
      const startIndex = indices.length;
      for (const f of matFaces) {
        const key = `${f.vi}/${f.vti !== undefined ? f.vti : -1}/${
          f.vni !== undefined ? f.vni : -1
        }`;
        let idx = uniqueMap.get(key);
        if (idx === undefined) {
          const px = positions[f.vi * 3 + 0];
          const py = positions[f.vi * 3 + 1];
          const pz = positions[f.vi * 3 + 2];
          let u = 0;
          let v = 0;
          if (f.vti !== undefined && rawTexcoords.length >= (f.vti + 1) * 2) {
            u = rawTexcoords[f.vti * 2 + 0];
            v = rawTexcoords[f.vti * 2 + 1];
          }
          verts.push(px, py, pz, u, v);
          idx = verts.length / 5 - 1;
          uniqueMap.set(key, idx);
        }
        indices.push(idx);
      }
      const endIndex = indices.length;
      drawRanges.push({
        start: startIndex,
        count: endIndex - startIndex,
        material: mat,
      });
    }

    return {
      vertices: new Float32Array(verts),
      texcoords: new Float32Array([]),
      normals: new Float32Array(normals),
      indices: new Uint32Array(indices),
      drawRanges,
      textureNames: Array.from(groups.keys()),
    };
  }

  // Parse a GLB (base64-encoded) and extract simple mesh data (positions, texcoords, indices)
  public static parseGLB(base64Data: string, modelName: string) {
    const bin = base64js.toByteArray(base64Data);
    const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    const textDecoder = new TextDecoder();

    // header
    const magic = textDecoder.decode(bin.subarray(0, 4));
    if (magic !== "glTF") throw new Error("Invalid GLB: missing magic");
    const version = dv.getUint32(4, true);
    const length = dv.getUint32(8, true);

    let offset = 12;
    let json: any = null;
    let binChunk: Uint8Array | null = null;

    while (offset < length) {
      const chunkLength = dv.getUint32(offset, true);
      const chunkType = dv.getUint32(offset + 4, true);
      const chunkDataStart = offset + 8;
      const chunkData = bin.subarray(
        chunkDataStart,
        chunkDataStart + chunkLength
      );
      // decode chunkType string
      const t0 = String.fromCharCode(chunkType & 0xff);
      const t1 = String.fromCharCode((chunkType >> 8) & 0xff);
      const t2 = String.fromCharCode((chunkType >> 16) & 0xff);
      const t3 = String.fromCharCode((chunkType >> 24) & 0xff);
      const chunkTypeStr = `${t0}${t1}${t2}${t3}`;
      if (chunkTypeStr === "JSON") {
        const s = textDecoder.decode(chunkData);
        json = JSON.parse(s);
      } else if (chunkTypeStr === "BIN\0" || chunkTypeStr === "BIN") {
        binChunk = chunkData;
      }
      offset = chunkDataStart + chunkLength;
    }

    if (!json) throw new Error("GLB: no JSON chunk");
    if (!binChunk) binChunk = new Uint8Array(0);

    const bufferViews = json.bufferViews || [];
    const accessors = json.accessors || [];
    const meshes = json.meshes || [];
    const materials = json.materials || [];
    const images = json.images || [];
    const textures = json.textures || [];

    const verts: number[] = [];
    const indices: number[] = [];
    const drawRanges: Array<{
      start: number;
      count: number;
      material: string;
    }> = [];
    const textureNames: string[] = [];

    // register images as inline textures
    images.forEach((img: any, idx: number) => {
      if (img.bufferView !== undefined) {
        const bv = bufferViews[img.bufferView];
        const start = bv.byteOffset || 0;
        const len = bv.byteLength || 0;
        const data = binChunk!.subarray(start, start + len);
        const texName = img.name || `${modelName}_img_${idx}`;
        TextureManager.registerTextureFromBuffer(texName, data, img.mimeType);
        textureNames.push(texName);
      }
    });

    // Helper to read accessor data
    const numComponentsForType = (t: string) =>
      t === "VEC3" ? 3 : t === "VEC2" ? 2 : 1;

    const readAccessorFloats = (accIdx: number) => {
      const acc = accessors[accIdx];
      const bv = bufferViews[acc.bufferView];
      const comp = numComponentsForType(acc.type);
      const bvByteOffset = bv.byteOffset || 0;
      const accByteOffset = acc.byteOffset || 0;
      const byteStride = bv.byteStride || comp * 4;
      const count = acc.count;

      const out = new Float32Array(count * comp);
      if (!binChunk) return out;
      const dataBuf = binChunk.buffer;
      const baseOffset = binChunk.byteOffset + bvByteOffset + accByteOffset;
      // Determine component type (glTF componentType) and bytes per component
      const componentType = acc.componentType; // e.g., 5126 = FLOAT, 5123 = UNSIGNED_SHORT, 5121 = UNSIGNED_BYTE, 5122 = SHORT, 5120 = BYTE
      const normalized = !!acc.normalized;
      const bytesPerComponent =
        componentType === 5126
          ? 4
          : componentType === 5123 || componentType === 5122
          ? 2
          : 1;

      // If tightly-packed and already float32 components, create a direct view for speed
      if (byteStride === comp * 4 && componentType === 5126) {
        const view = new Float32Array(dataBuf, baseOffset, count * comp);
        out.set(view);
        return out;
      }

      // Otherwise read per-element honoring byteStride and component types
      const dv = new DataView(dataBuf, baseOffset, byteStride * count);
      for (let i = 0; i < count; i++) {
        const elemBase = i * byteStride;
        for (let c = 0; c < comp; c++) {
          const compOffset = elemBase + c * bytesPerComponent;
          let v = 0;
          switch (componentType) {
            case 5126: // FLOAT
              v = dv.getFloat32(compOffset, true);
              break;
            case 5125: // UNSIGNED_INT (rare for vertex attribs)
              v = dv.getUint32(compOffset, true);
              break;
            case 5123: // UNSIGNED_SHORT
              v = dv.getUint16(compOffset, true);
              if (normalized) v = v / 65535.0;
              break;
            case 5122: // SHORT
              v = dv.getInt16(compOffset, true);
              if (normalized) v = Math.max(v / 32767.0, -1.0);
              break;
            case 5121: // UNSIGNED_BYTE
              v = dv.getUint8(compOffset);
              if (normalized) v = v / 255.0;
              break;
            case 5120: // BYTE
              v = dv.getInt8(compOffset);
              if (normalized) v = Math.max(v / 127.0, -1.0);
              break;
            default:
              // Unknown component type - fallback to zero
              v = 0;
          }
          out[i * comp + c] = v;
        }
      }
      return out;
    };

    const readAccessorIndices = (accIdx: number) => {
      const acc = accessors[accIdx];
      const bv = bufferViews[acc.bufferView];
      const bvByteOffset = bv.byteOffset || 0;
      const accByteOffset = acc.byteOffset || 0;
      const count = acc.count;
      if (!binChunk) return new Uint16Array(0);
      const baseOffset = binChunk.byteOffset + bvByteOffset + accByteOffset;
      if (acc.componentType === 5123) {
        return new Uint16Array(binChunk.buffer, baseOffset, count);
      } else if (acc.componentType === 5125) {
        return new Uint32Array(binChunk.buffer, baseOffset, count);
      }
      return new Uint16Array(0);
    };

    // For now iterate first mesh and its primitives
    for (const mesh of meshes) {
      for (const prim of mesh.primitives) {
        const attr = prim.attributes;
        if (!attr.POSITION) continue;
        const posArr = readAccessorFloats(attr.POSITION);
        const texArr = attr.TEXCOORD_0
          ? readAccessorFloats(attr.TEXCOORD_0)
          : null;
        const normArr = attr.NORMAL ? readAccessorFloats(attr.NORMAL) : null;
        const idxArr =
          prim.indices !== undefined ? readAccessorIndices(prim.indices) : null;

        // Debugging: sample large models or the 'store' model to inspect parsed data
        try {
          const isTarget =
            MODEL_DEBUG &&
            (modelName === "store" ||
              modelName.indexOf("store_") === 0 ||
              modelName.indexOf("store") >= 0 ||
              (posArr && posArr.length > 100000));
          if (isTarget) {
            const accPos = accessors[attr.POSITION];
            const bvPos = bufferViews[accPos.bufferView] || {};
            Logger.info(
              `Model.parseGLB: model=${modelName} prim has position accessor count=${
                accPos.count
              } componentType=${accPos.componentType} accByteOffset=${
                accPos.byteOffset || 0
              } bvByteOffset=${bvPos.byteOffset || 0} bvStride=${
                bvPos.byteStride || 0
              }`
            );

            // Texcoord accessor metadata (if present)
            if (attr.TEXCOORD_0) {
              const accTex = accessors[attr.TEXCOORD_0];
              const bvTex = bufferViews[accTex.bufferView] || {};
              Logger.info(
                `Model.parseGLB: model=${modelName} prim TEXCOORD_0 accessor count=${
                  accTex.count
                } componentType=${
                  accTex.componentType
                } normalized=${!!accTex.normalized} accByteOffset=${
                  accTex.byteOffset || 0
                } bvByteOffset=${bvTex.byteOffset || 0} bvStride=${
                  bvTex.byteStride || 0
                }`
              );
            }

            // Sample raw arrays (positions/indices/texcoords)
            const samplePos = [] as number[];
            for (let i = 0; i < Math.min(12, posArr.length); i++)
              samplePos.push(posArr[i]);
            Logger.info(
              `Model.parseGLB: sample positions (first ${Math.min(
                12,
                posArr.length
              )}):`,
              samplePos
            );

            if (idxArr) {
              const sampleIdx = [] as number[];
              for (let i = 0; i < Math.min(24, idxArr.length); i++)
                sampleIdx.push(idxArr[i]);
              Logger.info(
                `Model.parseGLB: sample indices (first ${Math.min(
                  24,
                  idxArr.length
                )}):`,
                sampleIdx
              );
            }

            if (texArr) {
              const sampleTex = [] as number[];
              for (let i = 0; i < Math.min(12, texArr.length); i++)
                sampleTex.push(texArr[i]);
              Logger.info(
                `Model.parseGLB: sample texcoords (first ${Math.min(
                  12,
                  texArr.length
                )}):`,
                sampleTex
              );
            }

            // Interleaved vertex sample using indices (x,y,z,u,v) for the first few indices — mirrors how we pack into verts
            const interleavedSample: number[] = [];
            if (idxArr) {
              for (let i = 0; i < Math.min(5, idxArr.length); i++) {
                const vi = idxArr[i];
                const px = posArr[vi * 3 + 0];
                const py = posArr[vi * 3 + 1];
                const pz = posArr[vi * 3 + 2];
                const u = texArr ? texArr[vi * 2 + 0] : 0;
                const v = texArr ? texArr[vi * 2 + 1] : 0;
                interleavedSample.push(px, py, pz, u, v);
              }
              Logger.info(
                `Model.parseGLB: interleaved sample (first ${Math.min(
                  5,
                  idxArr.length
                )} vertices):`,
                interleavedSample
              );
            }
          }
        } catch (err) {
          Logger.warn("Model.parseGLB: debug sampling failed", err);
        }

        const uniqueMap2 = new Map<string, number>();
        const primStart = indices.length;
        if (idxArr) {
          for (let i = 0; i < idxArr.length; i++) {
            const vi = idxArr[i];
            const u = texArr ? texArr[vi * 2 + 0] : 0;
            const v = texArr ? texArr[vi * 2 + 1] : 0;
            const px = posArr[vi * 3 + 0];
            const py = posArr[vi * 3 + 1];
            const pz = posArr[vi * 3 + 2];
            const key = `${vi}/${u}/${v}`;
            let idx = uniqueMap2.get(key);
            if (idx === undefined) {
              verts.push(px, py, pz, u, v);
              idx = verts.length / 5 - 1;
              uniqueMap2.set(key, idx);
            }
            indices.push(idx);
          }
        } else {
          // no indices: use sequential
          const vertCount = posArr.length / 3;
          for (let vi = 0; vi < vertCount; vi++) {
            const u = texArr ? texArr[vi * 2 + 0] : 0;
            const v = texArr ? texArr[vi * 2 + 1] : 0;
            const px = posArr[vi * 3 + 0];
            const py = posArr[vi * 3 + 1];
            const pz = posArr[vi * 3 + 2];
            verts.push(px, py, pz, u, v);
            indices.push(verts.length / 5 - 1);
          }
        }

        const primEnd = indices.length;
        // Determine material/texture name
        let matName = `${modelName}`;
        if (prim.material !== undefined && materials[prim.material]) {
          const m = materials[prim.material];
          // try baseColorTexture
          const pbr = m.pbrMetallicRoughness;
          if (
            pbr &&
            pbr.baseColorTexture &&
            typeof pbr.baseColorTexture.index === "number"
          ) {
            const texIndex = pbr.baseColorTexture.index;
            const tex = textures[texIndex];
            if (tex && typeof tex.source === "number") {
              const img = images[tex.source];
              matName =
                img && img.name
                  ? img.name
                  : `${modelName}_mat_${prim.material}`;
            }
          } else if (m.name) {
            matName = m.name;
          } else {
            matName = `${modelName}_mat_${prim.material}`;
          }
        }
        // ensure texture name is registered
        textureNames.push(matName);
        drawRanges.push({
          start: primStart,
          count: primEnd - primStart,
          material: matName,
        });
      }
    }

    // Optionally emit the final packed vertex array for targeted debugging.
    try {
      if (MODEL_DEBUG && modelName === "store") {
        const packedSample = verts.slice(0, Math.min(25, verts.length));
        Logger.info(
          `Model.parseGLB: packed verts (first ${Math.floor(
            packedSample.length / 5
          )} verts / ${packedSample.length} floats):`,
          packedSample
        );
      }
    } catch (err) {
      Logger.warn("Model.parseGLB: failed to log packed verts", err);
    }

    return {
      vertices: new Float32Array(verts),
      indices: new Uint32Array(indices),
      drawRanges,
      textureNames: Array.from(new Set(textureNames)),
    };
  }

  private static _fullModelPath(path: string, ending: string): string {
    return Paths.join(this._MODEL_FOLDER, path + ending);
  }
}
