import { ExpoWebGLRenderingContext } from "expo-gl";
import { Matrix4 } from "math.gl";
import type GameObj from "./GameObj";
import Logger from "@/hooks/helpers/logger";

export default class DataManager {
  private static _objects: Map<string, Array<GameObj>> = new Map<
    string,
    Array<GameObj>
  >();

  private static _TRANSFORM_UNIFORM_NAME = "u_transformsTex";
  private static _NUM_INSTANCES_NAME = "u_numInstances";

  private static _gl: ExpoWebGLRenderingContext;
  private static _transform_tex: WebGLTexture;
  private static _supportsFloatTex: boolean = false;
  // Reusable buffers to avoid per-frame allocations
  private static _transformsFloat: Float32Array | null = null;
  private static _transformsPacked: Uint8Array | null = null;
  private static _transformsCapacityInstances: number = 0;

  public static addObj(obj: GameObj) {
    if (!this._objects.has(obj.model_name))
      this._objects.set(obj.model_name, []);

    this._objects.get(obj.model_name)?.push(obj);
  }

  public static deleteObj(obj: GameObj) {
    if (!this._objects.has(obj.model_name)) {
      Logger.warn(`DataManager: attempted to delete object of model ${obj.model_name} which is not registered`);
      return;
    }
    this._objects.get(obj.model_name)?.splice(
      this._objects.get(obj.model_name)!.indexOf(obj),
      1
    );
  }

  public static init(gl: ExpoWebGLRenderingContext) {
    this._gl = gl;
    gl.getExtension("OES_texture_float");

    this._transform_tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._transform_tex);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Upload as 4xN RGBA texture (one row per matrix, 4 pixels wide)
    // Start with a 4x1 texture (one identity-like matrix placeholder)
    // Detect float texture support
    const floatExt = gl.getExtension("OES_texture_float");
    this._supportsFloatTex = !!floatExt;

    if (this._supportsFloatTex) {
      // Upload a 4x1 placeholder float texture
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        4, // width = 4 pixels (4 columns)
        1, // height = number of instances
        0, // border
        gl.RGBA,
        gl.FLOAT,
        new Float32Array(4 * 4)
      );
    } else {
      // Fallback: upload a 4x1 unsigned byte white pixel placeholder so sampling is valid
      const white = new Uint8Array(4 * 4);
      for (let i = 0; i < 4; i++) {
        white.set([255, 255, 255, 255], i * 4);
      }
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        4,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        white
      );
    }
  }

  private static _matrixToBuffer(matrix: Matrix4, out: Float32Array, offset: number) {
    // write matrix columns into out starting at offset (offset measured in floats)
    // matrix.getColumn(i) returns [x,y,z,w]
    for (let i = 0; i < 4; i++) {
      const col = matrix.getColumn(i);
      const base = offset + i * 4;
      out[base + 0] = col[0];
      out[base + 1] = col[1];
      out[base + 2] = col[2];
      out[base + 3] = col[3];
    }
  }

  public static updateBuffers(program: WebGLProgram) {
    // Count instances and prepare reusable buffers (each matrix -> 16 floats)
    let numInstances = 0;
    this._objects.forEach((arr) => (numInstances += arr.length));

    // Ensure our reusable buffers have enough capacity
    if (numInstances > this._transformsCapacityInstances) {
      this._transformsFloat = new Float32Array(numInstances * 16);
      this._transformsPacked = new Uint8Array(numInstances * 16);
      this._transformsCapacityInstances = numInstances;
    }

    // Fill float buffer directly, avoiding interim JS arrays
    if (!this._transformsFloat) this._transformsFloat = new Float32Array(0);
    let writeOffset = 0;
    this._objects.forEach((arr) => {
      arr.forEach((obj) => {
        DataManager._matrixToBuffer(obj.transform.matrix, this._transformsFloat!, writeOffset);
        writeOffset += 16;
      });
    });

    this._gl.bindTexture(this._gl.TEXTURE_2D, this._transform_tex);
    const height = Math.max(1, numInstances);
    if (this._supportsFloatTex) {
      // Upload the float buffer (if no instances, pass null to keep minimal texture)
      this._gl.texImage2D(
        this._gl.TEXTURE_2D,
        0,
        this._gl.RGBA,
        4,
        height,
        0,
        this._gl.RGBA,
        this._gl.FLOAT,
        numInstances > 0 ? this._transformsFloat!.subarray(0, numInstances * 16) : null
      );
    } else {
      // Pack floats into unsigned bytes using ENCODE_SCALE, writing into the reusable packed buffer
      const ENCODE_SCALE = 16.0;
      if (!this._transformsPacked) this._transformsPacked = new Uint8Array(numInstances * 16);
      for (let i = 0; i < numInstances; i++) {
        for (let c = 0; c < 16; c++) {
          const f = this._transformsFloat![i * 16 + c];
          const n = Math.max(-1.0, Math.min(1.0, f / ENCODE_SCALE));
          const byte = Math.round((n * 0.5 + 0.5) * 255.0);
          const texel = i * 4 + Math.floor(c / 4);
          const comp = c % 4;
          this._transformsPacked![texel * 4 + comp] = byte;
        }
      }

      this._gl.texImage2D(
        this._gl.TEXTURE_2D,
        0,
        this._gl.RGBA,
        4,
        height,
        0,
        this._gl.RGBA,
        this._gl.UNSIGNED_BYTE,
        this._transformsPacked!.subarray(0, height * 4 * 4)
      );
    }

    this._gl.activeTexture(this._gl.TEXTURE0);
    this._gl.bindTexture(this._gl.TEXTURE_2D, this._transform_tex);

    const transforms_loc = this._gl.getUniformLocation(
      program,
      this._TRANSFORM_UNIFORM_NAME
    );
    this._gl.uniform1i(transforms_loc, 0); // texture unit 0
    const num_instances_loc = this._gl.getUniformLocation(
      program,
      this._NUM_INSTANCES_NAME
    );
    // shader expects a float for u_numInstances (used in division), set as float
    this._gl.uniform1f(num_instances_loc, numInstances);

    // Inform shader whether we uploaded packed unsigned bytes or float texture
    const transformsAreBytesLoc = this._gl.getUniformLocation(program, "u_transformsAreBytes");
    const transformScaleLoc = this._gl.getUniformLocation(program, "u_transformScale");
    if (transformsAreBytesLoc) this._gl.uniform1i(transformsAreBytesLoc, this._supportsFloatTex ? 0 : 1);
    if (transformScaleLoc) this._gl.uniform1f(transformScaleLoc, this._supportsFloatTex ? 1.0 : 16.0);
  }

  public static get objects() {
    return this._objects;
  }
}
