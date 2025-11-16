import Logger from "../helpers/logger";
import Camera from "./Camera";
import GameObj from "./GameObj";

export const UI_TESTING = false;

export default abstract class Scene {
  private static _active: Scene | null = null;
  private static _static_objects: Array<GameObj> = [];
  private _objects: Array<GameObj>;

  constructor() {
    this._objects = new Array();
  }

  protected abstract _init(): void;
  protected early_update(): void {}
  protected update(): void {}
  protected late_update(): void {}

  public addObject(obj: GameObj) {
    this._objects.push(obj);
  }

  public static addStaticObject(obj: GameObj) {
    Scene._static_objects.push(obj);
  }

  public deleteObject(obj: GameObj) {
    this._objects.splice(this._objects.indexOf(obj), 1);
  }

  public static deleteStaticObject(obj: GameObj) {
    Scene._static_objects.splice(Scene._static_objects.indexOf(obj), 1);
  }

  private _deleteAllObjects() {
    for (const obj of this._objects) {
      obj.destroy();
    }
  }

  public static get active_scene() {
    if (this._active === null) {
      Logger.error("Tried to add scene obj with no active scene");
      throw new Error("Scene: no active scene set");
    }
    return this._active;
  }

  public static set active_scene(scene: Scene) {
    if (UI_TESTING) {
      Logger.warn("Scene: setting active scene while in UI testing mode");
      return;
    }
    if (this._active !== null) {
      this._active._deleteAllObjects();
    }
    this._active = scene;

    Camera.main = new Camera();

    scene._init();
  }

  public static EarlyUpdate() {
    this.active_scene.early_update();
    for (const obj of this._static_objects) {
      obj.early_update();
    }
    if (this._active === null) return;
    for (const obj of this._active._objects) {
      obj.early_update();
    }
  }

  public static Update() {
    this.active_scene.update();
    for (const obj of this._static_objects) {
      obj.update();
    }
    if (this._active === null) return;
    for (const obj of this._active._objects) {
      obj.update();
    }
  }

  public static LateUpdate() {
    this.active_scene.late_update();
    for (const obj of this._static_objects) {
      obj.late_update();
    }
    if (this._active === null) return;
    for (const obj of this._active._objects) {
      obj.late_update();
    }
  }
}
