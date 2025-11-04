import { promises as fsPromises } from "fs";
import { join } from "path";
import getAssetsPath from "./get-asset-dir";

//thanks to: https://bobbyhadz.com/blog/typescript-read-file-contents#:~:text=Use%20the%20readFileSync%28%29%20method%20to%20read%20a%20file%27s,code%20for%20this%20article%20is%20available%20on%20GitHub
export default async function asyncReadFile(filename: string) {
  try {
    const result = await fsPromises.readFile(
      join(getAssetsPath(), filename),
      "utf-8"
    );

    console.log(result);

    return result;
  } catch (err) {
    console.log(err);
    throw new Error("Couldn't load shaders.");
  }
}
