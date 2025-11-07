import { ExpoWebGLRenderingContext } from "expo-gl";
import Model from "./Model";

export default class ModelManager {
  private static _vertices: Float32Array = new Float32Array([]);
  private static _indices: Uint32Array = new Uint32Array([]);
  private static _models: Array<Number[]> = new Array<number[]>();

  private static _MIN_VBO = 256;
  private static _MIN_EBO = 126;

  private static _vbo: WebGLBuffer;
  private static _vbo_used: number = 0;
  private static _vbo_size: number = this._MIN_VBO;
  private static _ebo: WebGLBuffer;
  private static _ebo_used: number = 0;
  private static _ebo_size: number = this._MIN_EBO;

  private static _gl: ExpoWebGLRenderingContext;

  public static init(gl: ExpoWebGLRenderingContext) {
    this._gl = gl;
    this._vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._MIN_VBO * 4, gl.STATIC_DRAW);

    this._ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._MIN_EBO * 4, gl.STATIC_DRAW);
  }

  /**
   *
   * @param model model to add to rendering
   * @returns index of the new model used for model deletion
   */
  public static addModel(model: Model) {
    const m_ind = model.getIndices();
    m_ind.map((e) => e + this._ebo_used);

    this._addToVertex(model.getVertices());
    this._addToEbo(m_ind);

    const vert_start = this._vertices.length;
    const n_vert = new Float32Array(
      this._vertices.length + model.getVertices().length
    );
    n_vert.set(this._vertices, 0);
    n_vert.set(model.getVertices(), this._vertices.length);
    this._vertices = n_vert;

    const ind_start = this._indices.length;
    const n_ind = new Uint32Array(this._indices.length + m_ind.length);
    n_ind.set(this._indices, 0);
    n_ind.set(m_ind, this._indices.length);
    this._indices = n_ind;

    this._models.push([
      vert_start,
      this._vertices.length,
      ind_start,
      this._indices.length,
    ]);

    return this._models.length - 1;
  }

  private static _addToVertex(vertices: Float32Array) {
    if (this._vbo_used + vertices.length > this._vbo_size) {
      this._recreateVao(vertices.length);
    }

    this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._vbo);
    this._gl.bufferSubData(this._gl.ARRAY_BUFFER, this._vbo_used, vertices);

    this._vbo_used += vertices.length;
    console.log(vertices.length);
  }

  private static _recreateVao(extra_size: number) {
    while (this._vbo_used + extra_size > this._vbo_size) {
      this._vbo_size *= 2;
    }

    this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._vbo);
    this._gl.bufferData(
      this._gl.ARRAY_BUFFER,
      this._vbo_size * 4,
      this._gl.STATIC_DRAW
    );
    this._gl.bufferSubData(this._gl.ARRAY_BUFFER, 0, this._vertices);
  }

  private static _addToEbo(indices: Uint32Array) {
    if (this._ebo_used + indices.length > this._ebo_size) {
      this._recreateEbo(indices.length);
    }

    this._gl.bindBuffer(this._gl.ELEMENT_ARRAY_BUFFER, this._ebo);
    this._gl.bufferSubData(
      this._gl.ELEMENT_ARRAY_BUFFER,
      this._ebo_used,
      indices
    );

    this._ebo_used += indices.length;
  }

  private static _recreateEbo(extra_size: number) {
    while (this._ebo_used + extra_size > this._ebo_size) {
      this._ebo_size *= 2;
    }

    this._gl.bindBuffer(this._gl.ELEMENT_ARRAY_BUFFER, this._ebo);
    this._gl.bufferData(
      this._gl.ELEMENT_ARRAY_BUFFER,
      this._ebo_size * 4,
      this._gl.STATIC_DRAW
    );
    this._gl.bufferSubData(this._gl.ELEMENT_ARRAY_BUFFER, 0, this._indices);
  }

  public static getIndicesLength() {
    return this._indices.length;
  }
}
