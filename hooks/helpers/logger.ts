const ENABLE = typeof __DEV__ !== "undefined" ? __DEV__ : false;

export default class Logger {
  static debug(...args: any[]) {
    if (ENABLE) console.log(...args);
  }

  static info(...args: any[]) {
    console.log(...args);
  }

  static warn(...args: any[]) {
    console.warn(...args);
  }

  static error(...args: any[]) {
    console.error(...args);
  }
}

export { ENABLE };
