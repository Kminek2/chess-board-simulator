import readFile from "@/hooks/helpers/read-file";
import { Paths } from "expo-file-system";

export default class Model {
  private _vertices: Float32Array;
  private _texcoords: Float32Array;
  private _indices: Uint32Array;
  private _name: string;
  private static _MODEL_FOLDER = "./models";
  private static _MODEL_EXTENSION = ".obj";

  constructor(name: string) {
    const model_data = Model._loadDataFromModel(Model._getModelSrc(name));
    // model_data.vertices is an interleaved Float32Array [x,y,z,u,v] per-vertex
    this._vertices = model_data.vertices;
    // keep texcoords for compatibility (may be empty)
    this._texcoords = model_data.texcoords || new Float32Array(0);
    this._indices = model_data.indices;
    this._name = name;
  }

  public get name(){
    return this._name;
  }

  public getVertices() {
    return this._vertices;
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
    type FaceIdx = { vi: number; vti?: number; vni?: number };
    const faces: FaceIdx[] = [];

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
          faces.push(tris[0]);
          faces.push(tris[i]);
          faces.push(tris[i + 1]);
        }
      }
    }

    // Build unique vertex list
    const uniqueMap = new Map<string, number>();
    const verts: number[] = []; // interleaved x,y,z,u,v
    const indices: number[] = [];

    for (const f of faces) {
      const key = `${f.vi}/${f.vti !== undefined ? f.vti : -1}/${f.vni !== undefined ? f.vni : -1}`;
      let idx = uniqueMap.get(key);
      if (idx === undefined) {
        // create new vertex
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

    return {
      vertices: new Float32Array(verts),
      texcoords: new Float32Array([]),
      normals: new Float32Array(normals),
      indices: new Uint32Array(indices),
    };
  }

  private static _fullModelPath(path: string, ending: string): string {
    return Paths.join(this._MODEL_FOLDER, path + ending);
  }
}
