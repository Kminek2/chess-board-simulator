import Scene from "@/hooks/engine/Scene";
import MainMenuScene from "./MainMenuScene";

export default class DefaultScene extends Scene {
    protected _init(): void {
        Scene.active_scene = new MainMenuScene();
    }
}