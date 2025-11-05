import { ExpoWebGLRenderingContext } from "expo-gl";
import {Paths} from "expo-file-system"
import readFile from "../helpers/read-file";

export class Shader {
  private _gl: ExpoWebGLRenderingContext;
  private _shader_path: string;
  private _shader_type: number;

  private _shader_source: string = "";

  private _SHADER_FOLDER: string = "./shaders";

  /**
   * @param shader_path Path to shader relative to assets/shaders and without extensions
   */
  constructor(
    gl: ExpoWebGLRenderingContext,
    shader_path: string,
    shader_type: number
  ) {
    this._gl = gl;
    this._shader_type = shader_type;
    this._shader_path = shader_path;
  }
  public async compile(): Promise<WebGLShader> {
    this._shader_source = readFile(
      this._fullShaderPath(this._shader_path, this._getShaderExtension())
    );

    const shader = this._compileShader(
      this._gl,
      this._shader_type,
      this._shader_source
    );

    return shader;
  }

  private _compileShader(
    gl: ExpoWebGLRenderingContext,
    type: number,
    source: string
  ): WebGLShader {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!success) {
      throw new Error(
        gl.getShaderInfoLog(shader) || "Shader compilation failed"
      );
    }
    return shader;
  }

  private _getShaderExtension() {
    switch (this._shader_type) {
      case this._gl.VERTEX_SHADER:
        return ".vert";
      case this._gl.FRAGMENT_SHADER:
        return ".frag";
      default:
        return undefined;
    }
  }

  private _fullShaderPath(path: string, ending?: string): string {
    return ending
      ? Paths.join(this._SHADER_FOLDER, path + ".glsl" + ending)
      : Paths.join(this._SHADER_FOLDER, path + ".glsl");
  }
}
