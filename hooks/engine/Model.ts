import { assetContents } from "@/generated/assetMap";
import readFile from "@/hooks/helpers/read-file";
import { Paths } from "expo-file-system";

export default class Model {
  private _vertices: Float32Array;
  private _texcoords: Float32Array;
  private _indices: Uint32Array;
  private _submeshes: Array<{
    name: string;
    vertStart: number;
    vertSize: number;
    indStart: number;
    indSize: number;
  }> = [];
  private _name: string;
  private static _MODEL_FOLDER = "./models";
  private static _MODEL_EXTENSION = ".obj";

  constructor(name: string) {
    const model_data = Model._loadDataFromModel(Model._getModelSrc(name), name);
    // model_data.vertices is an interleaved Float32Array [x,y,z,u,v] per-vertex
    this._vertices = model_data.vertices;
    // keep texcoords for compatibility (may be empty)
    this._texcoords = model_data.texcoords || new Float32Array(0);
    this._indices = model_data.indices;
    this._submeshes = model_data.submeshes || [];
    this._name = name;
    // store discovered material->assetKey mapping (may be empty)
    (this as any)._materialAssetMap = model_data.materialAssetMap || {};
  }

  public get name() {
    return this._name;
  }

  public getVertices() {
    return this._vertices;
  }

  public getIndices() {
    return this._indices;
  }

  public getSubmeshes() {
    return this._submeshes;
  }

  private static _getModelSrc(model_path: string) {
    return readFile(this._fullModelPath(model_path, this._MODEL_EXTENSION));
  }

  private static _loadDataFromModel(model_src: string, modelName: string) {
    // We'll build unique vertices for each (pos,uv,norm) tuple to support OBJ files
    const positions: number[] = [];
    const rawTexcoords: number[] = [];
    const normals: number[] = [];

    const lines = model_src.split("\n");
    // faces grouped by material
    type FaceIdx = { vi: number; vti?: number; vni?: number };
    const materialFaces: Map<string, FaceIdx[]> = new Map();
    let currentMaterial = "default";
    let mtllibName: string | null = null;

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
      } else if (line.startsWith("mtllib ")) {
        const [, m] = line.split(/\s+/);
        mtllibName = m || null;
      } else if (line.startsWith("usemtl ")) {
        const [, m] = line.split(/\s+/);
        currentMaterial = m || "default";
        if (!materialFaces.has(currentMaterial))
          materialFaces.set(currentMaterial, []);
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
        const arr = materialFaces.get(currentMaterial) || [];
        for (let i = 1; i + 1 < tris.length; i++) {
          arr.push(tris[0]);
          arr.push(tris[i]);
          arr.push(tris[i + 1]);
        }
        materialFaces.set(currentMaterial, arr);
      }
    }

    // Build unique vertex list per-material and concatenate into master arrays
    const masterVerts: number[] = [];
    const masterIndices: number[] = [];
    const submeshes: Array<{
      name: string;
      vertStart: number;
      vertSize: number;
      indStart: number;
      indSize: number;
    }> = [];

    for (const [mat, faces] of materialFaces.entries()) {
      const uniqueMap = new Map<string, number>();
      const verts: number[] = []; // interleaved x,y,z,u,v
      const indices: number[] = [];

      for (const f of faces) {
        const key = `${f.vi}/${f.vti !== undefined ? f.vti : -1}/${
          f.vni !== undefined ? f.vni : -1
        }`;
        let idx = uniqueMap.get(key);
        if (idx === undefined) {
          // create new vertex
          const px = positions[f.vi * 3 + 0];
          const py = positions[f.vi * 3 + 1];
          const pz = positions[f.vi * 3 + 2];
          let u = 0;
          let v = 0;
          if (f.vti !== undefined && rawTexcoords.length >= (f.vti + 1) * 2) {
            // Flip V coordinate from OBJ space to WebGL texture space.
            // OBJ V origin may differ (top vs bottom), so invert to match atlas orientation.
            u = rawTexcoords[f.vti * 2 + 0];
            const rawV = rawTexcoords[f.vti * 2 + 1];
            v = 1 - rawV;
          }
          verts.push(px, py, pz, u, v);
          idx = verts.length / 5 - 1;
          uniqueMap.set(key, idx);
        }
        indices.push(idx);
      }

      const vertStart = masterVerts.length;
      masterVerts.push(...verts);
      const indStart = masterIndices.length;
      // indices from this submesh must be offset by the number of vertices already in master
      const vertOffset = vertStart / 5;
      for (const ii of indices) masterIndices.push(ii + vertOffset);

      submeshes.push({
        name: mat,
        vertStart,
        vertSize: verts.length,
        indStart,
        indSize: indices.length,
      });
    }

    // Try to find and parse the mtllib (if any) so we can map material->texture asset keys
    const materialAssetMap: Record<string, string> = {};
    if (mtllibName) {
      const candidates = [
        `textures/${modelName}/${mtllibName}`,
        `textures/${mtllibName}`,
        `models/${mtllibName}`,
        mtllibName,
      ];
      let mtlContent: string | null = null;
      // Prefer using generated assetContents directly to avoid logging errors for missing optional .mtl files
      for (const c of candidates) {
        const found = (assetContents as any)[c];
        if (found) {
          mtlContent = found;
          break;
        }
      }

      if (mtlContent) {
        let curMat: string | null = null;
        const mlines = mtlContent.split("\n");
        for (let l of mlines) {
          l = l.trim();
          if (l.length === 0 || l.startsWith("#")) continue;
          if (l.startsWith("newmtl ")) {
            const [, m] = l.split(/\s+/);
            curMat = m || null;
          } else if (l.startsWith("map_Kd ") && curMat) {
            const parts = l.split(/\s+/);
            const path = parts.slice(1).join(" ");
            const base = path.replace(/.*\\|.*\//, "");
            const baseNoExt = base.replace(/\.[^.]+$/, "");
            // find an embedded asset whose filename starts with the basename
            const found = Object.keys(assetContents).find((ak) => {
              const bn = ak.replace(/.*\//, "");
              return bn.toLowerCase().startsWith(baseNoExt.toLowerCase());
            });
            if (found) materialAssetMap[curMat] = found;
          }
        }
      }
    }

    return {
      vertices: new Float32Array(masterVerts),
      texcoords: new Float32Array([]),
      normals: new Float32Array(normals),
      indices: new Uint32Array(masterIndices),
      submeshes,
      materialAssetMap,
    };
  }

  // Return discovered material->assetKey mapping
  public getMaterialAssetMap(): Record<string, string> {
    return (this as any)._materialAssetMap || {};
  }

  private static _fullModelPath(path: string, ending: string): string {
    return Paths.join(this._MODEL_FOLDER, path + ending);
  }
}
