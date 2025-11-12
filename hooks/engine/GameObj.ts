import Model from "./Model";
import ModelManager from "./ModelManager";
import Transform from "./Transform";
import ObjectScript from "./ObjectScript";
import DataManager from "./DataManager";
import Logger from "@/hooks/helpers/logger";
import Scene from "./Scene";

export default class GameObj {
    private _transform: Transform;
    private _scripts: Array<ObjectScript>;
    private _model_name: string;

    private _static_obj: boolean;

    constructor(model: Model, transform = new Transform(), static_obj: boolean = false){
        this._transform = transform
        this._scripts = new Array();

        this._model_name = model.name
        DataManager.addObj(this);
        // Notify ModelManager that an instance of this model exists
        // (models are preloaded with 0 instances)
        Logger.debug(`GameObj: registering instance for model ${this._model_name}`);
        ModelManager.addInstanceByName(this._model_name);
        Logger.debug(`GameObj: registered instance for model ${this._model_name}`);

        this._static_obj = static_obj;
        
        if(static_obj){
            Scene.addStaticObject(this);
        } else {
            Scene.active_scene?.addObject(this);
        }
    }

    public destroy(){
        // Notify DataManager to delete this object
        DataManager.deleteObj(this);
        // Notify ModelManager that an instance of this model was deleted
        ModelManager.deleteInstanceByName(this._model_name);
        if(this._static_obj){
            Scene.deleteStaticObject(this);
        }
        else {
            Scene.active_scene?.deleteObject(this);
        }
    }

    public get model_name(){
        return this._model_name;
    }

    public get transform(){
        return this._transform;
    }

    public addScript(script: ObjectScript){
        this._scripts.push(script)
    }

    public early_update(){
        this._scripts.forEach(s => s.earlyUpdate());
    }

    public update(){
        this._scripts.forEach(s => s.update());
    }

    public late_update(){
        this._scripts.forEach(s => s.lateUpdate());
    }
}