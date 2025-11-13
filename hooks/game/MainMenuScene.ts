import Scene from "@/hooks/engine/Scene";
import GameObj from "../engine/GameObj";
import Model from "../engine/Model";
import Camera from "../engine/Camera";
import { Vector3 } from "math.gl";

export default class MainMenuScene extends Scene {
    private _worldObj: GameObj | null = null;

    protected _init(): void {
        new GameObj(new Model("Cargo-Shelf"))
        Camera.main.transform.pos = new Vector3(0, 20, -3);
        Camera.main.transform.lookAt(new Vector3(0, 0, 0));
    }
}