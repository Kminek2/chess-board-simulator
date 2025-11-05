import { Paths } from "expo-file-system"

const ASSETS_PATH = "./assets";

export default function getAssetsPath() {
  return Paths.join(Paths.document, ASSETS_PATH)
  //return join(__dirname, ASSETS_PATH);
}
