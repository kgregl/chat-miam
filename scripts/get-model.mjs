// Télécharge le modèle MobileNet v2 (TensorFlow.js) dans www/model pour un fonctionnement hors ligne.
import { mkdir, writeFile } from "node:fs/promises";
const BASE = "https://tfhub.dev/google/imagenet/mobilenet_v2_100_224/classification/2/";
const Q = "?tfjs-format=file";
await mkdir("www/model", { recursive: true });
const get = async (name) => {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(BASE + name + Q);
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    console.warn(`Essai ${i + 1} échoué pour ${name} : ${r.status}`);
    await new Promise(s => setTimeout(s, 3000));
  }
  throw new Error("Téléchargement impossible : " + name);
};
const model = JSON.parse((await get("model.json")).toString());
await writeFile("www/model/model.json", JSON.stringify(model));
let total = 0;
for (const g of model.weightsManifest) for (const p of g.paths) {
  const b = await get(p); total += b.length;
  await writeFile("www/model/" + p, b);
  console.log("OK", p, b.length);
}
console.log("Modèle téléchargé :", (total / 1e6).toFixed(1), "Mo");
