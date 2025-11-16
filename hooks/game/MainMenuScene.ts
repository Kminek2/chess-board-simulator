import Scene from "@/hooks/engine/Scene";
import { Vector3 } from "math.gl";
import Camera from "../engine/Camera";
import GameObj from "../engine/GameObj";
import Model from "../engine/Model";
import Time from "../engine/Time";

export default class MainMenuScene extends Scene {
  private _worldObj: GameObj | null = null;
  private _cam_rot: number = 0;
  private readonly ROTATION_SPEED: number = 0.5; // radians per second
  private readonly RADIUS: number = 10;
  private readonly CAMERA_HEIGHT: number = 10;
  private readonly CAMERA_OFFSET: number = 8;

  protected _init(): void {
    new GameObj(new Model("chess"));
    //Camera.main.transform.pos = new Vector3(0, 10, -10);
    //Camera.main.transform.lookAt(new Vector3(0, 0, 0));
  }

  protected update(): void {
    this._updateCamera(Time.delta_time);
  }

  private _updateCamera(delta_ime: number) {
    this._cam_rot += this.ROTATION_SPEED * delta_ime;
    const camX = this.RADIUS * Math.sin(this._cam_rot);
    const camZ = this.RADIUS * Math.cos(this._cam_rot);
    Camera.main.transform.pos = new Vector3(camX, this.CAMERA_HEIGHT, camZ);
    Camera.main.transform.lookAt(new Vector3(0, 0, 0));
    Camera.main.transform.translate(new Vector3(this.CAMERA_OFFSET, 0, 0));
  }
}
