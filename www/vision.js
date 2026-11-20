/* Reconnaissance sur le téléphone, sans Internet :
   - MobileNet (TensorFlow.js) pour reconnaître un aliment en photo
   - Tesseract.js pour lire une liste d'ingrédients */

// Classes ImageNet (1er nom, en minuscules) -> [nom affiché, nom dans la base DB]
window.IMAGENET_FOOD = {
  "banana": ["Banane", "Banane"],
  "orange": ["Orange", "Agrumes (orange, citron, pamplemousse)"],
  "lemon": ["Citron", "Agrumes (orange, citron, pamplemousse)"],
  "granny smith": ["Pomme", "Pomme (sans pépins ni trognon)"],
  "strawberry": ["Fraise", "Fraise"],
  "pineapple": ["Ananas", "Ananas"],
  "fig": ["Figue", "Figue"],
  "pomegranate": ["Grenade", "Grenade"],
  "custard apple": ["Corossol / pomme cannelle", "Fruits exotiques"],
  "jackfruit": ["Jacquier", "Fruits exotiques"],
  "broccoli": ["Brocoli", "Brocoli cuit"],
  "cauliflower": ["Chou-fleur", "Chou-fleur cuit"],
  "zucchini": ["Courgette", "Courgette cuite"],
  "spaghetti squash": ["Courge spaghetti", "Citrouille / potiron cuit"],
  "acorn squash": ["Courge", "Citrouille / potiron cuit"],
  "butternut squash": ["Butternut", "Citrouille / potiron cuit"],
  "cucumber": ["Concombre", "Concombre"],
  "artichoke": ["Artichaut", "Artichaut"],
  "bell pepper": ["Poivron", "Poivron"],
  "cardoon": ["Cardon", "Artichaut"],
  "mushroom": ["Champignon", "Champignons"],
  "head cabbage": ["Chou", "Chou"],
  "corn": ["Maïs", "Maïs"],
  "ear": ["Épi de maïs", "Maïs"],
  "mashed potato": ["Purée de pommes de terre", "Pomme de terre cuite"],
  "hotdog": ["Hot-dog", "Plats préparés / restes assaisonnés"],
  "cheeseburger": ["Burger", "Plats préparés / restes assaisonnés"],
  "pizza": ["Pizza", "Plats préparés / restes assaisonnés"],
  "burrito": ["Burrito", "Plats préparés / restes assaisonnés"],
  "meat loaf": ["Pain de viande", "Plats préparés / restes assaisonnés"],
  "potpie": ["Tourte", "Plats préparés / restes assaisonnés"],
  "carbonara": ["Pâtes carbonara", "Plats préparés / restes assaisonnés"],
  "consomme": ["Bouillon / soupe", "Plats préparés / restes assaisonnés"],
  "hot pot": ["Plat mijoté", "Plats préparés / restes assaisonnés"],
  "guacamole": ["Guacamole", "Avocat"],
  "bagel": ["Bagel", "Pain"],
  "french loaf": ["Baguette", "Pain"],
  "pretzel": ["Bretzel", "Sel et aliments très salés"],
  "dough": ["Pâte crue", "Pâte à pain / pâte levée crue"],
  "trifle": ["Dessert", "Gâteaux, bonbons, desserts"],
  "ice cream": ["Glace", "Gâteaux, bonbons, desserts"],
  "ice lolly": ["Glace à l'eau", "Gâteaux, bonbons, desserts"],
  "chocolate sauce": ["Chocolat", "Chocolat"],
  "espresso": ["Café", "Café, thé, boissons énergisantes"],
  "red wine": ["Vin", "Alcool"],
  "wine bottle": ["Bouteille de vin", "Alcool"],
  "beer bottle": ["Bière", "Alcool"],
  "beer glass": ["Bière", "Alcool"],
  "eggnog": ["Lait de poule", "Alcool"],
  "lobster": ["Homard", "Crustacés cuits"],
  "american lobster": ["Homard", "Crustacés cuits"],
  "spiny lobster": ["Langouste", "Crustacés cuits"],
  "crayfish": ["Écrevisse", "Crustacés cuits"],
  "king crab": ["Crabe", "Crustacés cuits"],
  "dungeness crab": ["Crabe", "Crustacés cuits"],
  "rock crab": ["Crabe", "Crustacés cuits"],
  "plate": ["Assiette (plat cuisiné)", null],
};

let _mobilenet = null, _ocr = null;

async function loadMobilenet(){
  if (_mobilenet) return _mobilenet;
  if (!window.tf || !window.mobilenet) throw new Error("libs");
  try { await tf.setBackend("webgl"); } catch(e) { await tf.setBackend("cpu"); }
  await tf.ready();
  _mobilenet = await mobilenet.load({version: 2, alpha: 1.0, modelUrl: "model/model.json"});
  return _mobilenet;
}

function fileToImage(file){
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => res(img);
    img.onerror = rej; img.src = url;
  });
}

// Renvoie [{label, dbName, prob}] (aliments uniquement), triés par probabilité
async function classifyFood(file){
  const model = await loadMobilenet();
  const img = await fileToImage(file);
  // Image carrée centrée, 224 px (taille attendue par MobileNet)
  const c = document.createElement("canvas"); c.width = c.height = 224;
  const s = Math.min(img.width, img.height);
  c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 224, 224);
  const preds = await model.classify(c, 10);
  const out = [];
  for (const p of preds) {
    const names = p.className.toLowerCase().split(",").map(x => x.trim());
    const key = names.find(n => IMAGENET_FOOD[n]);
    if (key && !out.some(o => o.label === IMAGENET_FOOD[key][0])) out.push({label: IMAGENET_FOOD[key][0], dbName: IMAGENET_FOOD[key][1], prob: p.probability});
  }
  return out;
}

async function getOcr(onProgress){
  if (_ocr) return _ocr;
  if (!window.Tesseract) throw new Error("libs");
  const abs = p => new URL(p, location.href).href;
  _ocr = await Tesseract.createWorker("fra", 1, {
    workerPath: abs("lib/worker.min.js"),
    corePath: abs("lib/tess-core/tesseract-core-simd-lstm.wasm.js"),
    langPath: abs("lib/tess-lang"),
    gzip: true,
    cacheMethod: "none",
    logger: m => { if (onProgress && m.status === "recognizing text") onProgress(Math.round(m.progress * 100)); }
  });
  return _ocr;
}

// Prépare l'image (niveaux de gris, contraste) et lit le texte
async function readText(file, onProgress){
  const img = await fileToImage(file);
  const max = 2000, s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  const ctx = c.getContext("2d");
  ctx.filter = "grayscale(1) contrast(1.4)";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const w = await getOcr(onProgress);
  const r = await w.recognize(c);
  return (r.data && r.data.text) || "";
}
