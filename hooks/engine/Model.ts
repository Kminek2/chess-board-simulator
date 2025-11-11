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
    // interleaved vertices will contain positions and texcoords when available
    // positions: model_data.positions (3 floats per vertex)
    // texcoords: model_data.texcoords (2 floats per vertex) - may be empty
    const posCount = model_data.positions.length / 3;
    const hasTex = model_data.texcoords.length === posCount * 2;

    const interleaved = new Float32Array(posCount * (3 + 2));
    for (let i = 0; i < posCount; i++) {
      interleaved[i * 5 + 0] = model_data.positions[i * 3 + 0];
      interleaved[i * 5 + 1] = model_data.positions[i * 3 + 1];
      interleaved[i * 5 + 2] = model_data.positions[i * 3 + 2];
      if (hasTex) {
        interleaved[i * 5 + 3] = model_data.texcoords[i * 2 + 0];
        interleaved[i * 5 + 4] = model_data.texcoords[i * 2 + 1];
      } else {
        interleaved[i * 5 + 3] = 0;
        interleaved[i * 5 + 4] = 0;
      }
    }

    this._vertices = interleaved;
    this._texcoords = model_data.texcoords;
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
    // First pass: collect raw v/vt/vn data and faces with their indices
    const positions: number[] = [];
    const rawTexcoords: number[] = [];
    const normals: number[] = [];

    type FaceIdx = { vi: number; vti?: number; vni?: number };
    const faces: FaceIdx[] = [];

    const lines = model_src.split("\n");
    for (let line of lines) {
      line = line.trim();
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
        for (let f of faceParts) {
          // f format: v[/vt[/vn]]
          const parts = f.split("/");
          const vi = parseInt(parts[0], 10) - 1;
          const vti = parts[1] ? parseInt(parts[1], 10) - 1 : undefined;
          const vni = parts[2] ? parseInt(parts[2], 10) - 1 : undefined;
          faces.push({ vi, vti, vni });
        }
      }
    }

    const posCount = positions.length / 3;

    // Create per-vertex texcoord array (defaults to 0s). We'll map vt indices referenced in faces
    const texcoordsPerVertex = new Float32Array(posCount * 2);
    for (let i = 0; i < texcoordsPerVertex.length; i++) texcoordsPerVertex[i] = 0;

    const indices: number[] = [];
    // Map any referenced vt to the corresponding vertex
    for (const f of faces) {
      indices.push(f.vi);
      if (f.vti !== undefined && rawTexcoords.length >= (f.vti + 1) * 2) {
        texcoordsPerVertex[f.vi * 2 + 0] = rawTexcoords[f.vti * 2 + 0];
        texcoordsPerVertex[f.vi * 2 + 1] = rawTexcoords[f.vti * 2 + 1];
      }
    }

    return {
      positions: new Float32Array(positions),
      texcoords: texcoordsPerVertex,
      normals: new Float32Array(normals),
      indices: new Uint32Array(indices),
    };
  }

  private static _fullModelPath(path: string, ending: string): string {
    return Paths.join(this._MODEL_FOLDER, path + ending);
  }
}
