import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function Loading({
  loadingText,
}: {
  loadingText: string;
}): React.JSX.Element {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#717834",
      justifyContent: "center",
      alignItems: "center",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
    },
    mainText: {
      color: "#2F5323",
      fontSize: 34,
      fontWeight: "800",
      marginBottom: 15,
    },
    subText: {
      color: "#BC7F60",
      fontSize: 20,
      fontWeight: "500",
    },
  });
  return (
    <View style={styles.container}>
      <Text style={styles.mainText}>Loading...</Text>
      <Text style={styles.subText}>{loadingText}</Text>
    </View>
  );
}
