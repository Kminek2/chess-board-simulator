import { ExpoWebGLRenderingContext } from "expo-gl";
import { Matrix4 } from "math.gl";
import type GameObj from "./GameObj";

export default class DataManager {
  private static _objects: Map<string, Array<GameObj>> = new Map<
    string,
    Array<GameObj>
  >();

  private static _TRANSFORM_UNIFORM_NAME = "u_transformsTex";
  private static _NUM_INSTANCES_NAME = "u_numInstances";

  private static _gl: ExpoWebGLRenderingContext;
  private static _transform_tex: WebGLTexture;

  public static addObj(obj: GameObj) {
    if (!this._objects.has(obj.model_name))
      this._objects.set(obj.model_name, []);

    this._objects.get(obj.model_name)?.push(obj);
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
  }

  private static _matrixToArray(matrix: Matrix4) {
    const a = new Array<number>();
    for (let i = 0; i < 4; i++) {
      // getColumn returns an array-like of 4 numbers
      a.push(...matrix.getColumn(i));
    }

    return a;
  }

  public static updateBuffers(program: WebGLProgram) {
    // Build flat float array of matrices (each matrix -> 16 floats)
    const transforms: number[] = [];
    this._objects.forEach((arr) => {
      arr.forEach((obj) => {
        const matArr = DataManager._matrixToArray(obj.transform.matrix);
        transforms.push(...matArr);
      });
    });

    // If no instances, upload a minimal 4x1 texture and set numInstances=0
    const totalFloats = transforms.length;
    const numInstances = totalFloats > 0 ? totalFloats / 16 : 0;

    // Validate float texture support
    const floatTexExt = this._gl.getExtension("OES_texture_float");
    if (!floatTexExt && totalFloats > 0) {
      console.warn(
        "Float textures not supported on this device; transforms will not upload."
      );
    }

    this._gl.bindTexture(this._gl.TEXTURE_2D, this._transform_tex);
    // width = 4 pixels (4 columns), height = number of instances
    this._gl.texImage2D(
      this._gl.TEXTURE_2D,
      0,
      this._gl.RGBA,
      4,
      Math.max(1, numInstances),
      0,
      this._gl.RGBA,
      this._gl.FLOAT,
      totalFloats > 0 ? new Float32Array(transforms) : null
    );

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
  }

  public static get objects() {
    return this._objects;
  }
}
