import Scene from "@/hooks/engine/Scene";
import WolfAndSheepScene from "@/hooks/game/WolfAndSheepScene";
import React from "react";
import { PanGestureHandlerGestureEvent } from "react-native-gesture-handler";
import SceneClass from "./SceneClass";

export default class Game extends SceneClass {
  private _scene: WolfAndSheepScene;
  constructor() {
    super();
    Scene.active_scene = new WolfAndSheepScene();
    this._scene = Scene.active_scene as WolfAndSheepScene;
    this.scene = this.scene.bind(this);
  }
  public render(): SceneClass {
    return this;
  }

  private last = React.useRef({ x: 0, y: 0 });
  private pan = { x: 0, y: 0 };

  private updatePan() {
    this._scene.onPanned(this.pan);
  }

  public scene(): React.JSX.Element {
    const onGesture = (e: PanGestureHandlerGestureEvent) => {
      const { translationX, translationY } = e.nativeEvent;

      // delta from the last saved position
      const dx = translationX - this.last.current.x;
      const dy = translationY - this.last.current.y;

      // update stored values
      this.last.current = { x: translationX, y: translationY };
      this.pan = { x: dx, y: dy };

      this.updatePan();
    };

    const onGestureEnd = () => {
      this.last.current = { x: 0, y: 0 };
    };
    return <></>;
  }
}
