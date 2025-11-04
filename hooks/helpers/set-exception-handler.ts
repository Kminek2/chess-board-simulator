import {
  setJSExceptionHandler,
  setNativeExceptionHandler,
} from "react-native-exception-handler";
import {
  defaultJSExceptionHandler,
  defaultReactExceptionHandler,
} from "./default-exception-handler";

export function setDefaultExceptionHandler() {
  setDefaultJSHandler();
  setDefaultNativeHandler();
}

export function setCustomExceptionHandlers(
  js_error_handler: (error: Error, is_fatal: boolean) => void,
  react_error_handler: (error_string: string) => void
) {
  setJSExceptionHandler(js_error_handler, true);

  setNativeExceptionHandler(react_error_handler);
}

export function setDefaultJSHandler() {
  setJSExceptionHandler(defaultJSExceptionHandler, true);
}

export function setDefaultNativeHandler() {
  setNativeExceptionHandler(defaultReactExceptionHandler);
}
