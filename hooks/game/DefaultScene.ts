import Scene from "@/hooks/engine/Scene";
import GameObj from "../engine/GameObj";
import Model from "../engine/Model";
import Transform from "../engine/Transform";
import { Vector3 } from "math.gl";
import Camera from "../engine/Camera";

export default class DefaultScene extends Scene {
    protected _init(): void {
        new GameObj(new Model("cube-test"), new Transform(new Vector3(-0.5,-0.5,2)));
    }
}