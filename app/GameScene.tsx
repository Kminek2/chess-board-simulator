import React from "react";
import MainMenu from "./(tabs)/MainMenu";
import SceneClass from "./(tabs)/SceneClass";

export default class GameScene extends React.Component {
  state = {
    active_scene: new MainMenu(),
  };

  setScene = (scene: SceneClass) => {
    this.setState({ active_scene: scene });
  };

  constructor() {
    super({});
  }

  public update() {
    if (this.state.active_scene === undefined) {
      return;
    }
    this.setScene(this.state.active_scene.render());
  }

  public render() {
    if (this.state.active_scene === undefined) {
      return <></>;
    }
    return <this.state.active_scene.scene />;
  }
}
