import Scene from "@/hooks/engine/Scene";
import { Vector3 } from "math.gl";
import Camera from "../engine/Camera";
import GameObj from "../engine/GameObj";
import Model from "../engine/Model";

export default class MainMenuScene extends Scene {
  private _worldObj: GameObj | null = null;

  protected _init(): void {
    new GameObj(new Model("cube-test"));
    Camera.main.transform.pos = new Vector3(0, 10, -10);
    Camera.main.transform.lookAt(new Vector3(0, 0, 0));
  }
}
