import { ExpoWebGLRenderingContext } from "expo-gl";
import Model from "./Model";
import { assetContents } from "@/generated/assetMap";
import TextureManager from "./Texture";
import Logger from "@/hooks/helpers/logger";

type LoadedModel = {
  vertStart: number; // vertex_data_start
  vertSize: number; // vertex_data_size
  indStart: number; // index_data_start
  indSize: number; // index_data_size
  instanceCount: number; // instance_count
  instanceOffset: number; // instance_offset (offset into IDs buffer)
  indexBufferStart: number; // index_buffer_start (offset into instanced indices)
  indexBufferLength: number; // index_buffer_end (length of this model's instanced index chunk)
};

export default class ModelManager {
  private static _vertices: Float32Array = new Float32Array([]);
  private static _indices: Uint32Array = new Uint32Array([]);
  private static _instanced_indices: Uint32Array = new Uint32Array([]);
  private static _IDs: Float32Array = new Float32Array([]);
  private static _loaded_models: Map<string, LoadedModel> = new Map<
    string,
    LoadedModel
  >();

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
    // IDs buffer is a vertex attribute buffer, should be bound to ARRAY_BUFFER
    this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._vboIDs);
    this._gl.bufferData(this._gl.ARRAY_BUFFER, 400, this._gl.STATIC_DRAW);

    this._loaded_models = new Map<string, LoadedModel>();

    // Preload all models found in generated asset map with 0 instances
    try {
      Object.keys(assetContents).forEach((k) => {
        if (k.startsWith("models/") && k.endsWith(".obj")) {
          const name = k.substring("models/".length, k.length - ".obj".length);
          // construct model instance and register with zero instances
          const m = new Model(name);
          this.addModel(m, 0);
        }
      });
    } catch (err) {
      console.warn("ModelManager: failed to preload models:", err);
    }
  Logger.info("ModelManager: loaded models:", Array.from(this._loaded_models.keys()));
  }

  // Expose buffers so rendering code can bind them before setting attrib pointers
  public static getVBO(): WebGLBuffer {
    return this._vbo;
  }

  public static getVBOIDs(): WebGLBuffer {
    return this._vboIDs;
  }

  public static getEBO(): WebGLBuffer {
    return this._ebo;
  }

  /**
   *
   * @param model model to add to rendering
   * @returns index of the new model used for model deletion
   */
  public static addModel(model: Model, initialInstanceCount: number = 1) {
    if (this._loaded_models.has(model.name)) {
      const table = this._loaded_models.get(model.name);
      if (table == undefined) throw Error("Something is wrong. PLEASE NOOO");

      table.instanceCount += initialInstanceCount;
      this._updateIds();
      this._recreate_ind_buffer();
      return;
    }
    const vertsToAdd = model.getVertices();
    const indsToAdd = model.getIndices();

    // Record starting offsets in floats/elements
    const vert_start = this._vertices.length; // in floats
    const ind_start = this._indices.length; // in elements

    // Append to CPU-side arrays first
    const n_vert = new Float32Array(this._vertices.length + vertsToAdd.length);
    n_vert.set(this._vertices, 0);
    n_vert.set(vertsToAdd, this._vertices.length);
    this._vertices = n_vert;

    const n_ind = new Uint32Array(this._indices.length + indsToAdd.length);
    n_ind.set(this._indices, 0);
    n_ind.set(indsToAdd, this._indices.length);
    this._indices = n_ind;

    this._loaded_models.set(model.name, {
      vertStart: vert_start,
      vertSize: vertsToAdd.length,
      indStart: ind_start,
      indSize: indsToAdd.length,
      instanceCount: initialInstanceCount,
      instanceOffset: 0,
      indexBufferStart: 0,
      indexBufferLength: 0,
    });

    // Register texture for this model (texture file name = model name)
    TextureManager.registerTexture(model.name);

    this._updateVert();
    this._updateIds();
    this._recreate_ind_buffer();

  // Debug logs removed to avoid spamming Metro logs during render.
  // If you need to inspect buffers, enable these selectively.
  }

  private static _updateIds() {
    const ids = new Array<number>();

    this._loaded_models.forEach((v, k) => {
      const lm = this._loaded_models.get(k);
      if (lm == undefined) throw Error("Undefined something. Too much work");
      lm.instanceOffset = ids.length;
      for (let i = 0; i < v.instanceCount; i++) {
        ids.push(ids.length);
      }
    });

    this._IDs = new Float32Array(ids);

    this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._vboIDs);
    this._gl.bufferData(this._gl.ARRAY_BUFFER, this._IDs, this._gl.STATIC_DRAW);
  }

  private static _updateVert() {
    this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._vbo);
    this._gl.bufferData(
      this._gl.ARRAY_BUFFER,
      this._vertices,
      this._gl.STATIC_DRAW
    );
  }

  public static getModelData(model_name: string) {
    return this._loaded_models.get(model_name);
  }

  private static _addToVertex(vertices: Float32Array) {
    if (this._vbo_used + vertices.length > this._vbo_size) {
      this._recreateVao(vertices.length);
    }

  this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._vbo);
  this._gl.bufferSubData(this._gl.ARRAY_BUFFER, this._vbo_used * 4, vertices);

  this._vbo_used += vertices.length;
  Logger.debug("ModelManager._addToVertex: uploaded", vertices.length, "floats");
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

  private static _setEbo(indices: Uint32Array) {
    if (indices.length > this._ebo_size) this._recreateEbo(indices.length);

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

  private static _recreate_ind_buffer() {
    let n_ind = new Array<number>();
    this._loaded_models.forEach((v, k) => {
  const a = this._indices.slice(v.indStart, v.indStart + v.indSize);
  const b = Array.from(a);

      const model_data = this._loaded_models.get(k);
      if (model_data == undefined) throw Error("Error updating buffer");
      model_data.indexBufferStart = n_ind.length;

      for (let i = 0; i < v.instanceCount; i++) {
        // append indices for each instance
        n_ind = n_ind.concat(b);
      }

      model_data.indexBufferLength = n_ind.length - model_data.indexBufferStart;
    });
    this._instanced_indices = new Uint32Array(n_ind);
    this._setEbo(this._instanced_indices);
  }

  public static getIndicesLength(name: string) {
    const model_data = this._loaded_models.get(name);
    if (model_data == undefined) throw Error("Error rendering model");
    return model_data.indSize;
  }

  public static getInstanceCount(name: string) {
    const model_data = this._loaded_models.get(name);
    if (model_data == undefined) throw Error("Error rendering model");
    return model_data.instanceCount;
  }

  public static getInstanceOffset(name: string) {
    const model_data = this._loaded_models.get(name);
    if (model_data == undefined) throw Error("Error rendering model");
    return model_data.indexBufferStart;
  }

  // Increase instance count for an already-registered model by name.
  // Useful when creating GameObj instances without reconstructing model geometry.
  public static addInstanceByName(name: string, count: number = 1) {
    const model_data = this._loaded_models.get(name);
    if (model_data == undefined) throw Error(`Model ${name} not registered`);
    Logger.debug(`ModelManager.addInstanceByName: before=${model_data.instanceCount}, add=${count}`);
    model_data.instanceCount += count;
    this._updateIds();
    this._recreate_ind_buffer();
    Logger.debug(`ModelManager.addInstanceByName: after=${model_data.instanceCount}`);
  }


  public static deleteInstanceByName(name: string, count: number = 1) {
    const model_data = this._loaded_models.get(name);
    if (model_data == undefined) throw Error(`Model ${name} not registered`);
    if (model_data.instanceCount < count) {
      throw Error(`ModelManager.deleteInstanceByName: cannot delete ${count} instances from model ${name} with only ${model_data.instanceCount} instances`);
    }
    Logger.debug(`ModelManager.deleteInstanceByName: before=${model_data.instanceCount}, delete=${count}`);
    model_data.instanceCount -= count;
    this._updateIds();
    this._recreate_ind_buffer();
    Logger.debug(`ModelManager.deleteInstanceByName: after=${model_data.instanceCount}`);
  }
}
