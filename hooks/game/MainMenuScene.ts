import Scene from "@/hooks/engine/Scene";
import { Vector3 } from "math.gl";
import Camera from "../engine/Camera";
import GameObj from "../engine/GameObj";
import Model from "../engine/Model";

export default class MainMenuScene extends Scene {
  private _worldObj: GameObj | null = null;

  protected _init(): void {
    // Load a GLB model named "store.glb" embedded in generated/assetMap.ts as "models/store.glb".
    // ModelManager preloads models at init; you can also construct a Model directly.
    const storeModel = new Model("store");
    new GameObj(storeModel);

    // Position the camera to view the store model and look at the origin
    Camera.main.transform.pos = new Vector3(0, 100, 0);
    Camera.main.transform.lookAt(new Vector3(0, 0, 0));
  }
}
