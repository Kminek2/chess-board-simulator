import { assetContents } from "@/generated/assetMap"; // adjust relative path

export default function readFile(filename: string): string {
  // filename should match the key in the generated map, e.g. "shaders/test.glsl.frag"
  const content = assetContents[filename];
  if (content === undefined) {
    throw new Error(`Asset not found in embedded map: ${filename}`);
  }
  return content;
  /*
  console.log(filename);
  const moduleId = require("../../assets/loaded/shaders/test.glsl.frag")// assetMap[filename];
  if (!moduleId) throw new Error(`Asset not found: ${filename}`);

  const asset = Asset.fromModule(require("../../assets/loaded/shaders/test.glsl.frag"));
  await asset.downloadAsync();

  /*const file = new File(asset.localUri!);
  return await file.text();
  /*const asset_file = Paths.join(getAssetsPath(), filename);
  console.log(asset_file);
  const [assets, error] = useAssets([
    require(asset_file),
  ]);

  if(!assets)
    throw new Error(`Couldn't find asset ${asset_file}. ${error}`)
  
  const asset = assets[0]

  //const asset = Asset.fromModule(require(asset_file));

  await asset.downloadAsync();

  if (!asset.localUri) {
    throw new Error(`Asset ${filename} failed to download or does not have a localUri.`);
  }

  const file = new File(asset.localUri);

  const text = await file.text();

  return text;
  /*
  const f = new File(Paths.join(getAssetsPath(), filename))
  console.log(Paths.join(getAssetsPath(), filename))
  try {
    const result = await f.textSync();

    console.log(result);
    Assets.at
    return result;
  } catch (err) {
    console.log(err);
    throw new Error("Couldn't read file")
  }*/
}
