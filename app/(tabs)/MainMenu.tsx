import Scene from "@/hooks/engine/Scene";
import MainMenuScene from "@/hooks/game/MainMenuScene";
import { Text } from "@react-navigation/elements";
import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import SceneClass from "./SceneClass";

export default class MainMenu extends SceneClass {
  constructor() {
    super();
    Scene.active_scene = new MainMenuScene();
    this.scene = this.scene.bind(this);
  }
  public render(): SceneClass {
    return this;
  }

  private readonly styles = StyleSheet.create({
    menuOptions: {
      position: "absolute",
      top: 0,
      right: 0,
      height: "100%",
      width: "50%",
      backgroundColor: "#2F5323",
      borderLeftWidth: 6,
      borderLeftColor: "#717834",
      paddingHorizontal: 20,
      justifyContent: "center",
      alignItems: "center",
    },
    titleText: {
      color: "#BC7F60",
      fontSize: 36,
      fontWeight: "700",
      marginBottom: 30,
      letterSpacing: 1,
    },
    playButton: {
      backgroundColor: "#717834",
      paddingVertical: 15,
      paddingHorizontal: 40,
      borderRadius: 10,
    },
    playButtonText: {
      color: "#BC7F60",
      fontSize: 22,
      fontWeight: "600",
      textAlign: "center",
    },
  });

  public scene(): React.JSX.Element {
    const menuStyle = this.styles;
    return (
      <View style={menuStyle.menuOptions}>
        <Text style={menuStyle.titleText}>Wolf and Sheep</Text>
        <Link style={menuStyle.playButton} href="./(tabs)/Game.tsx">
          <Text style={menuStyle.playButtonText}>Play</Text>
        </Link>
      </View>
    );
  }
}
