import { ExpoWebGLRenderingContext } from "expo-gl";
import type GameObj from "./GameObj";
import { Matrix4 } from "math.gl";

export default class DataManager{
    private static _objects: Map<string, Array<GameObj>> = new Map<string, Array<GameObj>>();

    private static _TRANSFORM_UNIFORM_NAME = "u_transformsTex"
    private static _NUM_INSTANCES_NAME = "u_numInstances"

    private static _gl: ExpoWebGLRenderingContext;
    private static _transform_tex: WebGLTexture;

    public static addObj(obj: GameObj){
        if(!this._objects.has(obj.model_name))
            this._objects.set(obj.model_name, [])

        this._objects.get(obj.model_name)?.push(obj);
    }

    public static init(gl: ExpoWebGLRenderingContext){
        this._gl = gl;
        gl.getExtension('OES_texture_float');

        this._transform_tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._transform_tex);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Upload as 4xN RGBA texture (one row per matrix, 4 pixels wide)
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            4,                 // width = 4 pixels (4 columns)
            1,      // height = number of instances
            0,
            gl.RGBA,
            gl.FLOAT,
            new Float32Array(4 * 4)
        );
    }

    private static _matrixToArray(matrix: Matrix4){
        const a = new Array<number>();
        for(let i = 0; i < 4; i++){
            a.push(...matrix.getColumn(i))
        }

        return a
    }

    public static updateBuffers(program: WebGLProgram){
        // todo: make it so that below code takes all columns of a matrix of all objects from certain name. Then update the texture with that.
        // todo: update glDraw and app.tsx in general and shaders to use objects and transforms
        //todo : make objectscripts work
        let transforms = new Array<number>();
        this._objects.forEach((v, k) => v.map(v => transforms.concat(DataManager._matrixToArray(v.transform.matrix))));
        if(transforms == undefined)
            throw Error("couldn't read transforms")
        this._gl.bindTexture(this._gl.TEXTURE_2D, this._transform_tex);
        this._gl.texImage2D(
            this._gl.TEXTURE_2D,
            0,
            0,       // x offset
            0,       // y offset (3rd row)
            4,       // width
            transforms.length,       // height
            this._gl.RGBA,
            this._gl.FLOAT,
            new Float32Array(transforms)
        );

        this._gl.activeTexture(this._gl.TEXTURE0);
        this._gl.bindTexture(this._gl.TEXTURE_2D, this._transform_tex);
        
        const transforms_loc = this._gl.getUniformLocation(program, this._TRANSFORM_UNIFORM_NAME)
        this._gl.uniform1i(transforms_loc, 0);        // texture unit 0
        const num_instances_loc = this._gl.getUniformLocation(program, this._NUM_INSTANCES_NAME)
        this._gl.uniform1f(num_instances_loc, transforms.length);
    }

    public static get objects(){
        return this._objects;
    }
}