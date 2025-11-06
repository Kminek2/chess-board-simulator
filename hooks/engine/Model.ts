import readFile from "@/hooks/helpers/read-file";
import { Paths } from "expo-file-system";

export default class Model {
  private _vertices: Float32Array;
  private _indices: Uint32Array;
  private static _MODEL_FOLDER = "./models";
  private static _MODEL_EXTENSION = ".obj";

  constructor(name: string) {
    const model_data = Model._loadDataFromModel(Model._getModelSrc(name));

    this._vertices = model_data.positions;
    this._indices = model_data.indices;
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
    const positions = [];
    const texcoords = [];
    const normals = [];
    const indices = [];

    const lines = model_src.split("\n");
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith("v ")) {
        const [, x, y, z] = line.split(/\s+/);
        positions.push(parseFloat(x), parseFloat(z), parseFloat(y));
      } else if (line.startsWith("vt ")) {
        const [, u, v] = line.split(/\s+/);
        texcoords.push(parseFloat(u), parseFloat(v));
      } else if (line.startsWith("vn ")) {
        const [, x, y, z] = line.split(/\s+/);
        normals.push(parseFloat(x), parseFloat(y), parseFloat(z));
      } else if (line.startsWith("f ")) {
        const [, ...faces] = line.split(/\s+/);
        for (let f of faces) {
          // f format: vertex/uv/normal
          const [vi] = f.split("/");
          indices.push(parseInt(vi) - 1);
        }
      }
    }

    return {
      positions: new Float32Array(positions),
      texcoords: new Float32Array(texcoords),
      normals: new Float32Array(normals),
      indices: new Uint32Array(indices),
    };
  }

  private static _fullModelPath(path: string, ending: string): string {
    return Paths.join(this._MODEL_FOLDER, path + ending);
  }
}
