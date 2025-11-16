import MainMenu from "./(tabs)/MainMenu";
import SceneClass from "./(tabs)/SceneClass";

export default class GameScene {
  private active_scene: SceneClass;
  constructor() {
    this.active_scene = new MainMenu();
  }

  public update() {
    this.active_scene = this.active_scene.render();
  }

  public render() {
    return <this.active_scene.scene />;
  }
}
