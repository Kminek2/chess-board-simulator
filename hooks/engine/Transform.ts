import Model from "./Model";
import ModelManager from "./ModelManager";
import {degrees, Matrix4, radians, Vector3} from "math.gl"

export default class Transform {
    private _pos: Vector3;
    private _rot: Vector3;
    private _scale: Vector3;

    private _front: Vector3 = new Vector3();

    private _updates: boolean = true;
    private _mat: Matrix4 = new Matrix4();

    constructor(pos = new Vector3(), rot = new Vector3(), scale = new Vector3()){
        this._pos = pos;
        this._rot = new Vector3(radians(rot));
        this._scale = scale;

        this._update_front()
        this._updateMatrix();
    }

    public get will_update(){
        return this._updates;
    }

    public get matrix(){
        if(this._updates)
            this._updateMatrix();
        this._updates = false;
        return this._mat;
    }

    private _updateMatrix(){
        this._mat = new Matrix4();
        this._mat.translate(this._pos);
        this._mat.rotateXYZ(this._rot);
        this._mat.scale(this._scale);
    }

    //thanks to https://learnopengl.com/Getting-started/Camera
    private _update_front(){
        this._front = new Vector3();
        this._front.x = Math.cos(this._rot.y) * Math.cos(this._rot.x);
        this._front.y = Math.sin(this._rot.x);
        this._front.z = Math.sin(this._rot.y) * Math.cos(this._rot.x);
        this._front.normalize()
    }

    public get pos(){
        return new Vector3(this._pos);
    }

    public set pos(new_pos: Vector3){
        this._pos = new_pos;
        this._updates = true;
    }

    public translate(by: Vector3){
        this.pos.add(by.multiply(this._front));
        this._updates = true;
    }

    public move(by: Vector3){
        this.pos.add(by);
        this._updates = true;
    }

    public get rot(){
        return new Vector3(degrees(this._rot));
    }

    public set rot(new_rot: Vector3){
        this._rot = new Vector3(radians(new_rot));
        this._updates = true;
    }

    public rotate(by: Vector3) {
        this._rot.add(new Vector3(radians(by)));
        this._updates = true;
    }

    public get scale(){
        return new Vector3(this._scale);
    }

    public set scale(new_scale: Vector3){
        this._scale = new_scale;
        this._updates = true;
    }
}