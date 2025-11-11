declare module "upng-js" {
  export function decode(buffer: ArrayBuffer): any;
  export function toRGBA8(dec: any): Uint8Array | Uint8Array[];
}

export {};
