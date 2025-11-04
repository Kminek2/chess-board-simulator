import { Alert } from "react-native";

export function defaultJSExceptionHandler(error: Error, is_fatal: boolean) {
  console.log("Global JS error:", error);

  Alert.alert(
    "Unexpected error",
    is_fatal
      ? `The app ran into a serious problem and needs to restart. \n${error.message}`
      : error.message,
    [{ text: "OK" }]
  );
}

export function defaultReactExceptionHandler(error_string: string) {
  console.log("Native crash:", error_string);
  Alert.alert("Unexpected error", error_string, [{ text: "OK" }]);
}
