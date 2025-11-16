import Scene from "@/hooks/engine/Scene";
import MainMenuScene from "@/hooks/game/MainMenuScene";
import SceneClass from "./SceneClass";

export default class MainMenu extends SceneClass {
  constructor() {
    super();
    Scene.active_scene = new MainMenuScene();
  }
  public render(): SceneClass {
    return this;
  }

  public scene(): React.JSX.Element {
    return <></>;
  }
}
