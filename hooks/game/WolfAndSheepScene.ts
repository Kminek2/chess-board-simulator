import Scene from "@/hooks/engine/Scene";
import { Vector3 } from "math.gl";
import Camera from "../engine/Camera";
import GameObj from "../engine/GameObj";
import Model from "../engine/Model";
import Time from "../engine/Time";

export default class WolfAndSheepScene extends Scene {
  private readonly RADIUS: number = 10;
  private pan = { x: 0, y: 0 };

  protected _init(): void {
    new GameObj(new Model("board"));
    //Camera.main.transform.pos = new Vector3(0, 10, -10);
    //Camera.main.transform.lookAt(new Vector3(0, 0, 0));
  }

  protected update(): void {
    this._updateCamera(Time.delta_time);
  }

  private _updateCamera(delta_ime: number) {
    Camera.main.transform.rotate(
      new Vector3(this.pan.x, this.pan.y, 0).scale(Time.delta_time * 0.01)
    );
    Camera.main.transform.translate(new Vector3(0, 0, this.RADIUS));
    Camera.main.transform.lookAt(new Vector3(0, 0, 0));
  }

  public onPanned({ x, y }: { x: number; y: number }) {}
}
