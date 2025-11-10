import { ExpoWebGLRenderingContext } from "expo-gl";
import Model from "./Model";

export default class ModelManager {
  private static _vertices: Float32Array = new Float32Array([]);
  private static _indices: Uint32Array = new Uint32Array([]);
  private static _instanced_indices: Uint32Array = new Uint32Array([]);
  private static _IDs: Float32Array = new Float32Array([]);
  private static _loaded_models: Map<string, number[]> = new Map<string, number[]>();

  private static _MIN_VBO = 256;
  private static _MIN_EBO = 126;

  private static _vbo: WebGLBuffer;
  private static _vbo_used: number = 0;
  private static _vbo_size: number = this._MIN_VBO;
  private static _ebo: WebGLBuffer;
  private static _ebo_used: number = 0;
  private static _ebo_size: number = this._MIN_EBO;

  private static _vboIDs: WebGLBuffer;

  private static _gl: ExpoWebGLRenderingContext;

  public static init(gl: ExpoWebGLRenderingContext) {
    this._gl = gl;
    this._vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._MIN_VBO * 4, gl.STATIC_DRAW);

    this._ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._MIN_EBO * 4, gl.STATIC_DRAW);

    this._vboIDs = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._vboIDs);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, 400, gl.STATIC_DRAW);

    this._loaded_models = new Map<string, number[]>();
  }

  /**
   *
   * @param model model to add to rendering
   * @returns index of the new model used for model deletion
   */
  public static addModel(model: Model) {
    if(this._loaded_models.has(model.name)){
      const table = this._loaded_models.get(model.name);
      if(table == undefined)
        throw Error("Something is wrong. PLEASE NOOO");

      table[4] += 1;
      this._updateIds();
      this._recreate_ind_buffer();
      return;
    }

    const m_ind = model.getIndices();

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

    this._loaded_models.set(model.name, [
      vert_start,
      this._vertices.length - vert_start,
      ind_start,
      this._indices.length - ind_start,
      1,
      0,
      0,
      0
    ]);

    this._updateVert();
    this._updateIds();
    this._recreate_ind_buffer();

    console.log("----- Model Manager logs ------")
    console.log(this._vertices);
    console.log(this._instanced_indices);
    console.log(this._IDs);
    console.log(this._loaded_models)
  }

  private static _updateIds(){
    const ids = new Array<number>();

    this._loaded_models.forEach((v, k) => {
      const lm = this._loaded_models.get(k);
      if(lm == undefined)
        throw Error("Undefined something. Too much work")
      lm[5] = ids.length
      for(let i = 0; i < v[4]; i++){
        ids.push(ids.length)
      }
    })

    this._IDs = new Float32Array(ids);

    
    this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._vboIDs);
    this._gl.bufferData(this._gl.ARRAY_BUFFER, this._IDs, this._gl.STATIC_DRAW);
  }

  private static _updateVert(){
    this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._vbo);
    this._gl.bufferData(this._gl.ARRAY_BUFFER, this._vertices, this._gl.STATIC_DRAW);
  }

  public static getModelData(model_name: string){
    return this._loaded_models.get(model_name);
  }

  private static _addToVertex(vertices: Float32Array) {
    if (this._vbo_used + vertices.length > this._vbo_size) {
      this._recreateVao(vertices.length);
    }

    this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._vbo);
    this._gl.bufferSubData(this._gl.ARRAY_BUFFER, this._vbo_used * 4, vertices);

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

  private static _setEbo(indices: Uint32Array){
    if(indices.length > this._ebo_size)
      this._recreateEbo(indices.length);

    this._gl.bindBuffer(this._gl.ELEMENT_ARRAY_BUFFER, this._ebo);
    this._gl.bufferData(
      this._gl.ELEMENT_ARRAY_BUFFER,
      indices,
      this._gl.STATIC_DRAW
    );

    this._ebo_used = indices.length;
  }

  private static _addToEbo(indices: Uint32Array) {
    if (this._ebo_used + indices.length > this._ebo_size) {
      this._recreateEbo(this._ebo_used + indices.length);
    }

    this._gl.bindBuffer(this._gl.ELEMENT_ARRAY_BUFFER, this._ebo);
    this._gl.bufferSubData(
      this._gl.ELEMENT_ARRAY_BUFFER,
      this._ebo_used * 4,
      indices
    );

    this._ebo_used += indices.length;
  }

  private static _recreateEbo(new_size: number) {
    while (new_size > this._ebo_size) {
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

  private static _recreate_ind_buffer(){
    let n_ind = new Array<number>();
    this._loaded_models.forEach((v, k) => {
      const a = this._indices.slice(v[2], v[2] + v[3])
      const b = new Array<number>(...a);

      const model_data = this._loaded_models.get(k);
      if(model_data == undefined)
        throw Error("Error updating buffer")
      model_data[6] = n_ind.length;

      for(let i = 0; i < v[4]; i++){
        console.log("AAAAAAAA")
        n_ind = n_ind.concat(b);
      }

      model_data[7] = n_ind.length - model_data[6];

      
      console.log("----- Ind buffer recreation -----")
      console.log(a);
      console.log(b);
      console.log(v);
      console.log(n_ind);
    })
    this._instanced_indices = new Uint32Array(n_ind);
    this._setEbo(this._instanced_indices);
  }

  public static getIndicesLength(name: string) {
    const model_data = this._loaded_models.get(name);
    if(model_data == undefined)
      throw Error("Error rendering model")
    return model_data[3]
  }

  public static getInstanceCount(name: string) {
    const model_data = this._loaded_models.get(name);
    if(model_data == undefined)
      throw Error("Error rendering model")
    return model_data[4]
  }

  public static getInstanceOffset(name: string) {
    const model_data = this._loaded_models.get(name);
    if(model_data == undefined)
      throw Error("Error rendering model")
    return model_data[6]
  }
}
