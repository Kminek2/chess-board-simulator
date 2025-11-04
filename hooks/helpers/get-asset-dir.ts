import { join } from "path";

const ASSETS_PATH = "./assets";

export default function getAssetsPath() {
  return join(__dirname, ASSETS_PATH);
}
