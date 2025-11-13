import { assetContents } from "@/generated/assetMap";
import Logger from "@/hooks/helpers/logger";
import { ExpoWebGLRenderingContext } from "expo-gl";
import Model from "./Model";
import TextureManager from "./Texture";

type LoadedModel = {
  vertStart: number; // vertex_data_start
  vertSize: number; // vertex_data_size
  indStart: number; // index_data_start
  indSize: number; // index_data_size
  instanceCount: number; // instance_count
  instanceOffset: number; // instance_offset (offset into IDs buffer)
  indexBufferStart: number; // index_buffer_start (offset into instanced indices)
  indexBufferLength: number; // index_buffer_end (length of this model's instanced index chunk)
  drawRanges?: Array<{ start: number; count: number; material: string }>;
};

export default class ModelManager {
  private static _vertices: Float32Array = new Float32Array([]);
  private static _indices: Uint32Array = new Uint32Array([]);
  private static _instanced_indices: Uint32Array = new Uint32Array([]);
  private static _eboInstanced: WebGLBuffer;
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

    // separate EBO for the instanced (duplicated) index buffer fallback
    this._eboInstanced = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._eboInstanced);
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
        } else if (k.startsWith("models/") && k.endsWith(".glb")) {
          const name = k.substring("models/".length, k.length - ".glb".length);
          // parse GLB binary (base64 stored in assetContents)
          try {
            const base64 = (assetContents as any)[k];
            const parsed = Model.parseGLB(base64, name);
            const m = new Model(name, {
              vertices: parsed.vertices,
              indices: parsed.indices,
              drawRanges: parsed.drawRanges,
              textureNames: parsed.textureNames,
            });
            this.addModel(m, 0);
          } catch (err) {
            Logger.warn(`ModelManager: failed to parse GLB ${k}:`, err);
          }
        }
      });
    } catch (err) {
      console.warn("ModelManager: failed to preload models:", err);
    }
    Logger.info(
      "ModelManager: loaded models:",
      Array.from(this._loaded_models.keys())
    );

    // Diagnostic: print a small sample of interleaved vertices for the 'store' model
    // This diagnostic is gated by MANAGER_DEBUG to avoid spamming Metro logs.
    try {
      const MANAGER_DEBUG = true;
      if (MANAGER_DEBUG) {
        const sampleName = "store";
        const md = this._loaded_models.get(sampleName);
        if (md) {
          const startFloat = md.vertStart; // floats
          const vertCount = Math.floor(md.vertSize / 5);
          const sampleVerts = Math.min(5, vertCount);
          const out: number[] = [];
          for (let i = 0; i < sampleVerts; i++) {
            const base = startFloat + i * 5;
            // ensure within bounds
            if (base + 4 < this._vertices.length) {
              out.push(
                this._vertices[base + 0],
                this._vertices[base + 1],
                this._vertices[base + 2],
                this._vertices[base + 3],
                this._vertices[base + 4]
              );
            }
          }
          Logger.info(
            `ModelManager: vertex sample for '${sampleName}' (first ${sampleVerts} verts):`,
            out
          );
        }
      }
    } catch (err) {
      Logger.warn("ModelManager: vertex sample diagnostic failed:", err);
    }

    // Diagnostic validation: ensure indices reference valid vertex ranges.
    try {
      const totalVerts = Math.floor(this._vertices.length / 5);
      this._loaded_models.forEach((m, name) => {
        const vertCount = Math.floor(m.vertSize / 5);
        const start = m.indStart;
        const len = m.indSize;
        let minIdx = -1;
        let maxIdx = -1;
        if (len > 0) {
          // iterate without creating large intermediates to compute min/max safely
          const view = this._indices.subarray(start, start + len);
          for (let i = 0; i < view.length; i++) {
            const v = view[i];
            if (minIdx === -1 || v < minIdx) minIdx = v;
            if (maxIdx === -1 || v > maxIdx) maxIdx = v;
          }
        }
        Logger.info(
          `ModelManager: model='${name}' verts=${vertCount} indCount=${
            m.indSize
          } indRange=[${minIdx},${maxIdx}] vertRangeStart=${Math.floor(
            m.vertStart / 5
          )} totalVerts=${totalVerts}`
        );
        if (
          maxIdx >= Math.floor(m.vertStart / 5) + vertCount ||
          (minIdx !== -1 && minIdx < Math.floor(m.vertStart / 5))
        ) {
          Logger.warn(
            `ModelManager: index range for model '${name}' appears outside its vertex range — this will produce broken geometry.`
          );
        }
      });
    } catch (err) {
      Logger.warn("ModelManager: diagnostic validation failed:", err);
    }
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

    // Diagnostic: log the actual vertices provided by the parser for quick comparison
    try {
      const MANAGER_DEBUG = false;
      if (MANAGER_DEBUG) {
        if (model.name === "store") {
          const sampleCount = Math.min(25, vertsToAdd.length); // 5 verts = 25 floats
          const sampleArr: number[] = [];
          for (let i = 0; i < sampleCount; i++) sampleArr.push(vertsToAdd[i]);
          Logger.info(
            `ModelManager.addModel: received vertsToAdd (first ${Math.floor(
              sampleCount / 5
            )} verts / ${sampleCount} floats):`,
            sampleArr
          );
        }
      }
    } catch (err) {
      Logger.warn(
        "ModelManager.addModel: failed to sample incoming verts",
        err
      );
    }

    // Record starting offsets in floats/elements
    const vert_start = this._vertices.length; // in floats
    const ind_start = this._indices.length; // in elements

    // Append to CPU-side arrays first
    const n_vert = new Float32Array(this._vertices.length + vertsToAdd.length);
    n_vert.set(this._vertices, 0);
    n_vert.set(vertsToAdd, this._vertices.length);
    this._vertices = n_vert;

    // When appending a model's indices into the global index buffer we must
    // offset them by the number of vertices already present. Note that
    // `vert_start` is measured in floats (each vertex = 5 floats), so compute
    // vertexOffset in vertex-counts.
    const vertexOffset = Math.floor(vert_start / 5);
    const shifted = new Uint32Array(indsToAdd.length);
    for (let i = 0; i < indsToAdd.length; i++)
      shifted[i] = indsToAdd[i] + vertexOffset;

    const n_ind = new Uint32Array(this._indices.length + shifted.length);
    n_ind.set(this._indices, 0);
    n_ind.set(shifted, this._indices.length);
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
      drawRanges: (model as any).getDrawRanges
        ? (model as any).getDrawRanges()
        : undefined,
    });

    // Register textures for this model. Models may expose multiple material/texture names.
    try {
      const names = (model as any).getTextureNames
        ? (model as any).getTextureNames()
        : [];
      if (Array.isArray(names) && names.length > 0) {
        for (const tn of names) TextureManager.registerTexture(tn);
      } else {
        // Fallback: register texture with model name
        TextureManager.registerTexture(model.name);
      }
    } catch (err) {
      TextureManager.registerTexture(model.name);
    }

    this._updateVert();
    // Upload base (non-duplicated) indices for use with instanced drawing
    this._setEbo(this._indices);
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
    Logger.debug(
      "ModelManager._addToVertex: uploaded",
      vertices.length,
      "floats"
    );
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
    // Build duplicated index buffer (one block of indices per-instance) and
    // upload it into the separate instanced EBO. We keep the base indices in
    // `this._indices` (uploaded via _setEbo) for use with drawElementsInstanced.
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
    this._setInstancedEbo(this._instanced_indices);
  }

  private static _setInstancedEbo(indices: Uint32Array) {
    // Ensure base EBO has capacity (we use same sizing strategy)
    if (indices.length > this._ebo_size) this._recreateEbo(indices.length);

    this._gl.bindBuffer(this._gl.ELEMENT_ARRAY_BUFFER, this._eboInstanced);
    this._gl.bufferData(
      this._gl.ELEMENT_ARRAY_BUFFER,
      indices,
      this._gl.STATIC_DRAW
    );
    this._ebo_used = indices.length;
  }

  public static getInstancedEBO(): WebGLBuffer {
    return this._eboInstanced;
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
    Logger.debug(
      `ModelManager.addInstanceByName: before=${model_data.instanceCount}, add=${count}`
    );
    model_data.instanceCount += count;
    this._updateIds();
    this._recreate_ind_buffer();
    Logger.debug(
      `ModelManager.addInstanceByName: after=${model_data.instanceCount}`
    );
  }

  public static deleteInstanceByName(name: string, count: number = 1) {
    const model_data = this._loaded_models.get(name);
    if (model_data == undefined) throw Error(`Model ${name} not registered`);
    if (model_data.instanceCount < count) {
      throw Error(
        `ModelManager.deleteInstanceByName: cannot delete ${count} instances from model ${name} with only ${model_data.instanceCount} instances`
      );
    }
    Logger.debug(
      `ModelManager.deleteInstanceByName: before=${model_data.instanceCount}, delete=${count}`
    );
    model_data.instanceCount -= count;
    this._updateIds();
    this._recreate_ind_buffer();
    Logger.debug(
      `ModelManager.deleteInstanceByName: after=${model_data.instanceCount}`
    );
  }
}
