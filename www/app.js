/* Chat Miam — logique de l'appli */
const $ = id => document.getElementById(id);
const LABEL = {ok:"OK", moderation:"À LIMITER", interdit:"INTERDIT", inconnu:"INCERTAIN"};
const RANK = {ok:0, moderation:1, interdit:2};
const norm = s => String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/œ/g,"oe").trim();
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const store = { get(k){ try{return localStorage.getItem(k)}catch(e){return null} }, set(k,v){ try{localStorage.setItem(k,v)}catch(e){} } };

/* ---------- Onglets ---------- */
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === b));
  ["scan","photo","search","settings"].forEach(t => $("tab-"+t).classList.toggle("hidden", t !== b.dataset.tab));
  $("result").innerHTML = "";
  if (b.dataset.tab !== "scan") stopScan();
});

/* ---------- Affichage du verdict ---------- */
function showVerdict(v){
  const k = LABEL[v.verdict] ? v.verdict : "inconnu";
  const risques = (v.ingredients_a_risque || []).filter(Boolean);
  $("result").innerHTML = `
    <div class="verdict ${k}">
      <span class="badge">${LABEL[k]}</span>${v.tag ? ` <span class="tag">${esc(v.tag)}</span>` : ""}
      ${v.alerte ? `<div class="alert">${v.alerte}</div>` : ""}
      ${v.image ? `<div class="prod"><img src="${esc(v.image)}" alt=""><h2>${esc(v.aliment)}</h2></div>` : `<h2>${esc(v.aliment || "Aliment")}</h2>`}
      <p>${esc(v.raison)}</p>
      ${risques.length ? `<p><b>Ingrédients à risque :</b></p><ul>${risques.map(r=>`<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      ${(v.infos||[]).length ? `<p><b>À savoir :</b></p><ul>${v.infos.map(r=>`<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      ${v.conseil ? `<p><b>Conseil :</b> ${esc(v.conseil)}</p>` : ""}
      ${v.note ? `<p class="hint">${esc(v.note)}</p>` : ""}
    </div>`;
  $("result").scrollIntoView({behavior:"smooth", block:"start"});
}
function loading(label){ $("result").innerHTML = `<div class="big"><span class="spinner"></span> ${esc(label)}</div>`; }
function error(msg){ $("result").innerHTML = `<div class="verdict inconnu"><p class="err">${esc(msg)}</p></div>`; }

/* ---------- Recherche locale ---------- */
let filter = "all";
function findLocal(text){
  const t = norm(text); if (!t) return [];
  return DB.filter(([n,,,al]) => norm(n).includes(t) || al.some(a => { const na = norm(a); return na.includes(t) || (na.length > 3 && t.includes(na)); }));
}
function renderList(){
  const t = $("q").value;
  let rows = t ? findLocal(t) : DB.slice();
  if (filter !== "all") rows = rows.filter(r => r[1] === filter);
  if (!t) rows.sort((a,b) => RANK[b[1]] - RANK[a[1]] || a[0].localeCompare(b[0]));
  $("list").innerHTML = rows.map(([n,v]) => `<li data-n="${esc(n)}"><span class="dot ${v}"></span><span class="n">${esc(n)}</span><span class="t">${LABEL[v]}</span></li>`).join("");
  $("list").querySelectorAll("li").forEach(li => li.onclick = () => {
    const r = DB.find(x => x[0] === li.dataset.n);
    showVerdict({aliment:r[0], verdict:r[1], raison:r[2]});
  });
  if (t && !rows.length) $("list").innerHTML = `<li class="empty">Pas encore dans la liste. Essaie un mot plus général (ex : « fromage » plutôt que « camembert »), scanne le code-barres, ou photographie la liste d'ingrédients.</li>`;
  $("askBtn").classList.toggle("hidden", !(t && !rows.length && store.get("apiKey")));
}
$("q").oninput = renderList;
document.querySelectorAll(".filters button").forEach(b => b.onclick = () => {
  filter = b.dataset.f;
  document.querySelectorAll(".filters button").forEach(x => x.classList.toggle("on", x === b));
  renderList();
});

/* ---------- Retrouver des aliments de la base dans un texte (étiquette) ---------- */
function matchText(text){
  const t = " " + norm(text).replace(/[^a-z0-9]+/g, " ") + " ";
  const res = [];
  for (const row of DB) {
    const terms = [row[0].split(/[(\/,]/)[0], ...row[3]].map(x => norm(x).replace(/[^a-z0-9]+/g, " ").trim()).filter(x => x.length >= 4);
    let best = 0, hit = "";
    for (const term of terms) if (t.includes(" " + term + " ") && term.length > best) { best = term.length; hit = term; }
    if (best) res.push({row, score: best, hit});
  }
  return res.sort((a, b) => b.score - a.score);
}

/* ---------- Analyse d'un produit Open Food Facts ---------- */
function analyseProduct(p){
  const name = [p.product_name_fr || p.product_name, p.brands].filter(Boolean).join(" — ") || "Produit";
  const ingr = p.ingredients_text_fr || p.ingredients_text || "";
  const t = " " + norm(ingr).replace(/[^a-z0-9]+/g," ") + " ";
  let verdict = "ok"; const found = []; const reasons = [];
  const bump = v => { if (RANK[v] > RANK[verdict]) verdict = v; };

  for (const [v, re, label] of RULES) {
    if (re.test(t) && !found.includes(label)) { found.push(label); bump(v); }
  }
  const salt = p.nutriments && Number(p.nutriments.salt_100g);
  if (salt >= 1.5) { bump("interdit"); found.push(`très salé (${salt.toFixed(1)} g de sel / 100 g)`); }
  else if (salt >= 0.8) { bump("moderation"); found.push(`salé (${salt.toFixed(1)} g de sel / 100 g)`); }

  // Pas d'ingrédients : on tente avec le nom du produit
  if (!ingr) {
    const m = findLocal(p.product_name_fr || p.product_name || "")[0];
    if (m) return {aliment:name, image:p.image_front_small_url, verdict:m[1], raison:m[2],
      note:"Liste d'ingrédients absente d'Open Food Facts : verdict basé sur le nom du produit."};
    return {aliment:name, image:p.image_front_small_url, verdict:"inconnu",
      raison:"Open Food Facts n'a pas la liste d'ingrédients de ce produit.",
      conseil:"Prends la liste d'ingrédients en photo dans l'onglet Photo, ou cherche l'aliment dans l'onglet Chercher."};
  }

  if (verdict === "interdit") reasons.push("Ce produit contient au moins un ingrédient dangereux pour les chats.");
  else if (verdict === "moderation") reasons.push("Rien de toxique repéré, mais des ingrédients peu adaptés aux chats. Au mieux une toute petite quantité, exceptionnellement.");
  else reasons.push("Aucun ingrédient dangereux repéré dans la liste.");

  const transformed = (p.nova_group && p.nova_group >= 3);
  return {
    aliment: name, image: p.image_front_small_url, verdict, raison: reasons.join(" "),
    ingredients_a_risque: found,
    conseil: verdict === "ok"
      ? (transformed ? "C'est un produit transformé : même sans ingrédient toxique, ce n'est pas un repas pour chat. Petite quantité seulement." : "Reste en petite quantité : l'alimentation pour chat doit rester la base.")
      : "",
    note: "Analyse automatique de la liste d'ingrédients Open Food Facts : les données peuvent être incomplètes."
  };
}

/* ---------- Aliments pour chats (et chiens) ---------- */
function petKind(p){
  const tags = (p.categories_tags || []).join(" ");
  const txt = " " + norm([p.product_name_fr, p.product_name, p.generic_name_fr, p.categories].filter(Boolean).join(" ")).replace(/[^a-z0-9]+/g," ") + " ";
  const cat = /cat-food|cat-treat|en:cats?\b|fr:chats?\b|fr:chatons?/.test(tags) || /\b(chats?|chatons?|cat|cats|kitten|feline|felin)\b/.test(txt);
  const dog = /dog-food|dog-treat|fr:chiens?\b/.test(tags) || /\b(chiens?|chiots?|dog|dogs|puppy|canin)\b/.test(txt);
  const petTags = /pet-food|dog-and-cat-food|cat-food|dog-food/.test(tags);
  if (cat && (petTags || p._pet || /\b(croquettes?|patee|friandises?|aliment)\b/.test(txt))) return "chat";
  if (dog && (petTags || p._pet) && !cat) return "chien";
  if (p._pet || petTags) return "animal";
  return null;
}

function analysePetFood(p, kind){
  const name = [p.product_name_fr || p.product_name, p.brands].filter(Boolean).join(" — ") || "Aliment pour animal";
  const ingr = p.ingredients_text_fr || p.ingredients_text || "";
  const all = " " + norm([p.product_name_fr, p.product_name, p.generic_name_fr, ingr, (p.categories_tags||[]).join(" "), (p.labels_tags||[]).join(" ")].filter(Boolean).join(" ")).replace(/[^a-z0-9]+/g," ") + " ";
  const ing = " " + norm(ingr).replace(/[^a-z0-9]+/g," ") + " ";
  let verdict = "ok"; const risques = []; const infos = [];
  const bump = v => { if (RANK[v] > RANK[verdict]) verdict = v; };

  if (kind === "chien") {
    return {aliment:name, image:p.image_front_small_url, verdict:"moderation", tag:"Aliment pour chien",
      raison:"Pas toxique, mais pas fait pour un chat : pas assez de taurine, de vitamine A ni de protéines. Un peu volé dans la gamelle du chien, ce n'est pas grave ; en repas régulier, si.",
      conseil:"Garde les gamelles séparées."};
  }

  // Ingrédients toxiques (oignon, ail, chocolat…) : uniquement les règles « interdit »
  for (const [v, re, label] of RULES) if (v === "interdit" && re.test(ing) && !risques.includes(label)) { risques.push(label); bump(v); }
  for (const [v, re, label] of PET_RULES) if (re.test(all) && !risques.includes(label)) { risques.push(label); bump(v); }

  // Type d'aliment
  const complementaire = /\b(complementaire|friandises?|snacks?|treats?|recompenses?|tubes? cremeux|cat treats?)\b/.test(all) || /cat-treats|pet-treats/.test((p.categories_tags||[]).join(" "));
  const complet = /\baliment complet\b|\bcomplete\b/.test(all);
  const veto = /\b(renal|urinary|urinaire|hepatic|hepatique|gastro ?intestinal|gastrointestinal|diabetic|diabete|prescription diet|veterinary|veterinaire|vet diet|dietetique|obesity|satiety|hypoallergenique|hypoallergenic|anallergenic|parnuts)\b/.test(all);
  const chaton = /\b(chatons?|kitten|junior|babycat|mother and babycat)\b/.test(all);
  const senior = /\b(senior|ageing|mature|7 ?ans|11 ?ans|12 ?ans|7 ?plus|11 ?plus)\b/.test(all);
  const lait = /\blait\b/.test(norm(p.product_name_fr || p.product_name || ""));
  const sec = /dry-cat-food|dry-pet-food/.test((p.categories_tags||[]).join(" ")) || /\bcroquettes?\b/.test(all);

  let tag = "Aliment pour chat";
  if (veto) { bump("moderation"); tag = "Aliment vétérinaire";
    infos.push("Aliment diététique pour une maladie précise (reins, urinaire, digestion, poids…) : à donner seulement sur conseil du vétérinaire. Pour un chat en bonne santé, il peut être déséquilibré."); }
  if (lait) { bump("moderation"); tag = "Lait pour chat";
    infos.push("Lait appauvri en lactose : mieux toléré que le lait de vache, mais c'est une friandise, pas une boisson. L'eau reste indispensable."); }
  else if (complementaire && !complet) { bump("moderation"); tag = "Friandise / aliment complémentaire";
    infos.push("Aliment « complémentaire » : il ne couvre pas tous les besoins du chat. Pas plus d'environ 10 % de sa ration quotidienne."); }
  if (chaton) infos.push("Formule chaton : idéale jusqu'à 12 mois environ. Pour un chat adulte, trop riche (risque de surpoids).");
  if (senior) infos.push("Formule senior : adaptée aux chats âgés (en général à partir de 7 à 11 ans selon la marque).");
  if (/\b(sterilise|sterilised|sterilized|neutered)\b/.test(all)) infos.push("Formule pour chat stérilisé : moins calorique, adaptée si ton chat est stérilisé.");
  if (/\b(sucres?|caramel|saccharose)\b/.test(ing)) infos.push("Contient du sucre ou du caramel : sans intérêt pour un chat (souvent pour la couleur ou l'appétence).");
  const first = norm(ingr).split(/[,(]/)[0] || "";
  if (/cereales|ble|mais|riz/.test(first)) infos.push("Les céréales sont le 1er ingrédient : aliment plutôt pauvre en viande. Pas dangereux, mais pas l'idéal pour un carnivore.");
  if (sec && !veto) infos.push("Croquettes : laisse toujours de l'eau fraîche à disposition, et alterner avec de la pâtée aide à mieux hydrater.");
  if (!ingr) infos.push("La liste d'ingrédients n'est pas renseignée dans la base : analyse limitée au type de produit.");

  let raison;
  if (verdict === "interdit") raison = "Attention : un ingrédient dangereux pour les chats a été repéré dans cet aliment pour animaux.";
  else if (veto) raison = "Aliment pour chat, mais à réserver aux chats pour qui le vétérinaire l'a prescrit.";
  else if (verdict === "moderation") raison = "Aliment pour chat, à donner avec modération.";
  else if (kind === "animal") raison = "Aliment pour animaux sans ingrédient toxique repéré. Vérifie qu'il est bien destiné aux chats.";
  else raison = "Aliment conçu pour les chats, sans ingrédient à risque repéré.";

  return {aliment:name, image:p.image_front_small_url, verdict, tag, raison, ingredients_a_risque:risques, infos,
    conseil: verdict === "ok" ? "Respecte la ration indiquée sur l'emballage selon le poids de ton chat, et fais toute transition d'aliment sur 7 jours environ." : "",
    note:"Analyse automatique (Open Pet Food Facts / Open Food Facts) : les données peuvent être incomplètes."};
}

/* ---------- Rappels de produits (RappelConso) ---------- */
async function checkRecall(code){
  try {
    const n = Number(code); if (!n) return null;
    const url = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-trie/records?limit=1&order_by=date_publication%20desc"
      + "&select=libelle,motif_rappel,risques_encourus,date_publication,date_de_fin_de_la_procedure_de_rappel,lien_vers_la_fiche_rappel,conduites_a_tenir_par_le_consommateur"
      + "&where=" + encodeURIComponent("gtin=" + n);
    const r = await fetch(url); if (!r.ok) return null;
    const j = await r.json();
    return (j.results && j.results[0]) || null;
  } catch (e) { return null; }
}
function recallHtml(rc){
  const fin = rc.date_de_fin_de_la_procedure_de_rappel;
  const actif = !fin || new Date(fin) >= new Date(new Date().toDateString());
  const d = s => s ? new Date(s).toLocaleDateString("fr-FR") : "";
  return `<b>⚠️ Produit rappelé${actif ? "" : " (rappel terminé)"}</b><br>
    ${esc(rc.motif_rappel || "")}${rc.risques_encourus ? " — " + esc(rc.risques_encourus) : ""}<br>
    <span class="muted">Publié le ${d(rc.date_publication)}${fin ? " · fin du rappel : " + d(fin) : ""}. Seuls certains lots sont en général concernés : compare le n° de lot et la date sur ton emballage.</span>
    ${rc.lien_vers_la_fiche_rappel ? `<br><a href="${esc(rc.lien_vers_la_fiche_rappel)}" target="_blank" rel="noopener">Voir la fiche RappelConso</a>` : ""}`;
}

/* ---------- Recherche d'un code-barres ---------- */
const FIELDS = "product_name,product_name_fr,generic_name_fr,brands,categories,categories_tags,labels_tags,ingredients_text,ingredients_text_fr,nutriments,image_front_small_url,nova_group";
async function fetchProduct(base, code, pet){
  try {
    const r = await fetch(`${base}/api/v2/product/${code}.json?fields=${FIELDS}`);
    const j = await r.json();
    if (j.status === 1 && j.product) { if (pet) j.product._pet = true; return j.product; }
  } catch (e) {}
  return null;
}
async function lookupBarcode(code){
  code = String(code).replace(/\D/g,"");
  if (code.length < 8) { error("Code-barres invalide."); return; }
  loading("Recherche du produit…");
  const [food, pet, recall] = await Promise.all([
    fetchProduct("https://world.openfoodfacts.org", code, false),
    fetchProduct("https://world.openpetfoodfacts.org", code, true),
    checkRecall(code)
  ]);
  const p = pet || food;
  let v;
  if (!p) {
    v = {aliment:`Code ${code}`, verdict:"inconnu",
      raison:"Ce produit n'est ni dans Open Food Facts ni dans Open Pet Food Facts (ou pas de connexion Internet).",
      conseil:"Prends sa liste d'ingrédients en photo (onglet Photo) ou cherche l'aliment par son nom."};
  } else {
    const kind = petKind(p);
    v = kind ? analysePetFood(p, kind) : analyseProduct(p);
  }
  if (recall) {
    const fin = recall.date_de_fin_de_la_procedure_de_rappel;
    const actif = !fin || new Date(fin) >= new Date(new Date().toDateString());
    if (actif) { v.verdict = "interdit"; v.raison = "Ce produit fait l'objet d'un rappel officiel en cours. " + (v.raison || ""); }
    v.alerte = recallHtml(recall);
  }
  showVerdict(v);
}
$("codeGo").onclick = () => lookupBarcode($("codeInput").value);
$("codeInput").onkeydown = e => { if (e.key === "Enter") lookupBarcode($("codeInput").value); };

/* ---------- Scanner caméra en direct (ZXing) ---------- */
let reader = null, scanning = false;
async function startScan(){
  if (!window.ZXing) { error("Le module de scan n'a pas chargé."); return; }
  $("result").innerHTML = "";
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E]);
  reader = new ZXing.BrowserMultiFormatReader(hints, 250);
  $("camBox").classList.remove("hidden"); $("scanBtn").classList.add("hidden"); $("stopBtn").classList.remove("hidden");
  scanning = true;
  try {
    await reader.decodeFromConstraints(
      {video: {facingMode: "environment", width: {ideal: 1280}, height: {ideal: 720}}},
      $("video"),
      (res) => {
        if (res && scanning) {
          scanning = false;
          if (navigator.vibrate) navigator.vibrate(80);
          const code = res.getText();
          $("codeInput").value = code;
          stopScan();
          lookupBarcode(code);
        }
      });
  } catch (e) {
    stopScan();
    error("Impossible d'ouvrir la caméra. Autorise l'accès à la caméra pour Chat Miam dans les réglages Android, ou tape le code à la main.");
  }
}
function stopScan(){
  scanning = false;
  try { reader && reader.reset(); } catch(e){}
  reader = null;
  $("camBox").classList.add("hidden"); $("scanBtn").classList.remove("hidden"); $("stopBtn").classList.add("hidden");
}
$("scanBtn").onclick = startScan;
$("stopBtn").onclick = stopScan;

/* ---------- Claude (photo + question libre) ---------- */
const PROMPT = `Tu es un assistant vétérinaire spécialisé en nutrition féline. L'utilisateur veut savoir s'il peut donner un aliment HUMAIN (n'importe lequel : fruit, légume, viande, plat, produit emballé, boisson…) à son chat adulte en bonne santé.
Repères : interdits = chocolat/cacao, oignon, ail, poireau, échalote, ciboulette et toute alliacée (y compris en poudre, dans sauces/bouillons), raisin et raisins secs, alcool, caféine, xylitol, pâte levée crue, os cuits, noyaux/pépins, avocat, macadamia, charcuterie et plats très salés ou assaisonnés, lys. À limiter = produits laitiers, poisson/œuf/viande crus, thon en conserve, foie, fruits sucrés, féculents. OK = viandes et poissons cuits nature sans os, œuf cuit, légumes cuits nature (courge, carotte, haricot vert, courgette, petits pois, brocoli), concombre, riz cuit.
Pour un produit emballé, lis la liste d'ingrédients si elle est visible et signale tout ingrédient à risque.
Si c'est un aliment POUR ANIMAUX : un aliment « complet » pour chat adulte est "ok" (sauf ingrédient toxique) ; « complémentaire »/friandise = "moderation" (max ~10 % de la ration) ; lait pour chat = "moderation" ; aliment vétérinaire (Renal, Urinary, Gastro, Hepatic, Diabetic, Obesity…) = "moderation", seulement sur prescription ; formule chaton = signaler que c'est trop riche pour un adulte ; aliment pour chien = "moderation" (manque de taurine) ; propylène glycol (E1520) = "interdit" ; éthoxyquine (E324) ou aliment cru = "moderation".
Si l'image n'est pas un aliment ou est illisible, verdict "inconnu".
Réponds UNIQUEMENT avec un objet JSON valide, en français :
{"aliment":"nom court","verdict":"ok"|"moderation"|"interdit"|"inconnu","raison":"1 à 2 phrases simples","ingredients_a_risque":["..."],"conseil":"1 phrase pratique ou chaîne vide"}`;

async function askClaude(text, imageB64){
  const key = store.get("apiKey");
  if (!key) throw {code:"no_key"};
  const content = [];
  if (imageB64) content.push({type:"image", source:{type:"base64", media_type:"image/jpeg", data:imageB64}});
  content.push({type:"text", text: PROMPT + "\n\n" + text});
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({model: "claude-haiku-5-5", max_tokens: 700, messages: [{role:"user", content}]})
  });
  if (!r.ok) throw {code: r.status === 401 ? "bad_key" : "http", status: r.status};
  const j = await r.json();
  const txt = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  const m = txt.match(/\{[\s\S]*\}/);
  const v = JSON.parse(m ? m[0] : txt);
  v.note = "Analyse par Claude. En cas de doute, demande à ton vétérinaire.";
  return v;
}
function claudeErr(e){
  if (e && e.code === "no_key") return "Ajoute d'abord ta clé API Anthropic dans l'onglet ⚙️ (ou utilise le scanner / la recherche, qui marchent sans clé).";
  if (e && e.code === "bad_key") return "Clé API refusée. Vérifie-la dans l'onglet ⚙️.";
  if (e && e.code === "http") return `Erreur du service Claude (${e.status}). Réessaie plus tard.`;
  return "L'analyse n'a pas marché. Réessaie avec une photo plus nette, ou vérifie ta connexion.";
}

function toJpegB64(file, max = 1280){
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = rej; img.src = url;
  });
}

function showPreview(f){ $("photoPreview").src = URL.createObjectURL(f); $("photoPreview").classList.remove("hidden"); }

/* Photo d'un aliment : MobileNet sur le téléphone */
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

$("foodInput").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  showPreview(f);
  loading(_mobilenet ? "Je regarde ta photo…" : "Chargement du modèle (la 1re fois, quelques secondes)…");
  let guesses = [];
  try { guesses = await withTimeout(classifyFood(f), 90000); }
  catch (x) { console.error(x); guesses = []; }
  const best = guesses[0];
  if (best && best.prob >= 0.25 && best.dbName) {
    const r = DB.find(x => x[0] === best.dbName);
    showVerdict({aliment: best.label, verdict: r[1], raison: r[2],
      note: `Reconnu sur la photo avec ${Math.round(best.prob * 100)} % de confiance.`});
    addAlternatives(guesses.slice(1), f);
    return;
  }
  // Pas d'aliment reconnu avec certitude (souvent un pot ou un emballage) : on lit l'étiquette
  loading("Je lis l'étiquette…");
  let text = "";
  try { text = await withTimeout(readText(f), 90000); } catch (x) { console.error(x); }
  const m = matchText(text);
  if (m.length) {
    const r = m[0].row;
    showVerdict({aliment: r[0], verdict: r[1], raison: r[2], note: `Reconnu grâce au texte de l'étiquette (« ${m[0].hit} »).`});
    const others = m.slice(1, 4).map(o => ({label: o.row[0], dbName: o.row[0]}))
      .concat(guesses.filter(g => g.dbName && g.prob >= 0.12).map(g => ({label: g.label, dbName: g.dbName})));
    addAlternatives(others, f);
    return;
  }
  showUnknown(guesses.filter(g => g.prob >= 0.05), f);
};

function showUnknown(guesses, file){
  const opts = guesses.filter(g => g.dbName).slice(0, 4);
  $("result").innerHTML = `<div class="verdict inconnu"><span class="badge">INCERTAIN</span>
    <h2>Je ne suis pas sûr de reconnaître cet aliment</h2>
    ${opts.length ? `<p>C'est peut-être :</p><div class="chips">${opts.map(o => `<button data-db="${esc(o.dbName)}" data-l="${esc(o.label)}">${esc(o.label)}</button>`).join("")}</div>` : ""}
    <p class="hint">La reconnaissance hors ligne connaît surtout des fruits, légumes et plats courants. Pour un produit emballé, scanne son code-barres ou photographie sa liste d'ingrédients. Sinon, tape son nom dans l'onglet Chercher.</p>
    ${store.get("apiKey") ? `<button id="claudeTry" class="big alt">Demander à Claude</button>` : ""}</div>`;
  bindChips(); bindClaude(file);
}
function addAlternatives(rest, file){
  const opts = rest.filter(g => g.dbName).slice(0, 3);
  const box = document.createElement("div"); box.className = "card";
  box.innerHTML = `${opts.length ? `<p class="hint" style="margin-top:0">Ce n'est pas ça ? C'est peut-être :</p><div class="chips">${opts.map(o => `<button data-db="${esc(o.dbName)}" data-l="${esc(o.label)}">${esc(o.label)}</button>`).join("")}</div>` : ""}
    <p class="hint">Sinon, cherche-le par son nom dans l'onglet Chercher.</p>
    ${store.get("apiKey") ? `<button id="claudeTry" class="big alt">Demander à Claude</button>` : ""}`;
  $("result").appendChild(box);
  bindChips(); bindClaude(file);
}
function bindChips(){
  $("result").querySelectorAll(".chips button").forEach(b => b.onclick = () => {
    const r = DB.find(x => x[0] === b.dataset.db);
    showVerdict({aliment: b.dataset.l, verdict: r[1], raison: r[2]});
  });
}
function bindClaude(file){
  const b = $("claudeTry"); if (!b) return;
  b.onclick = async () => {
    loading("Claude regarde ta photo…");
    try { showVerdict(await askClaude("Voici la photo de l'aliment (ou de son emballage / sa liste d'ingrédients). Identifie-le et donne ton verdict.", await toJpegB64(file))); }
    catch (x) { error(claudeErr(x)); }
  };
}

/* Photo d'une liste d'ingrédients : lecture du texte sur le téléphone */
$("ingrInput").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  showPreview(f);
  loading("Lecture du texte…");
  let text;
  try { text = await readText(f, pct => { const r = $("result").querySelector(".big"); if (r) r.innerHTML = `<span class="spinner"></span> Lecture du texte… ${pct} %`; }); }
  catch (x) { error("La lecture de texte n'a pas pu démarrer sur ce téléphone."); return; }
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 15) { error("Je n'arrive pas à lire de texte sur cette photo. Rapproche-toi, évite les reflets et prends la liste bien à plat."); return; }
  const p = {product_name: "Liste d'ingrédients photographiée", generic_name_fr: clean, ingredients_text_fr: clean};
  const kind = petKind(p);
  if (kind) p._pet = true;
  const v = kind ? analysePetFood(p, kind) : analyseProduct(p);
  v.note = "Texte lu sur la photo (peut contenir des erreurs de lecture) : « " + (clean.length > 220 ? clean.slice(0, 220) + "…" : clean) + " »";
  showVerdict(v);
};

$("askBtn").onclick = async () => {
  const t = $("q").value.trim(); if (!t) return;
  loading("Je demande à Claude…");
  try { showVerdict(await askClaude(`Aliment demandé par l'utilisateur : "${t}".`)); }
  catch (x) { error(claudeErr(x)); }
};

/* ---------- Réglages ---------- */
function refreshKeyState(){
  const k = store.get("apiKey");
  $("keyState").textContent = k ? "✅ Clé enregistrée (…" + k.slice(-4) + ")" : "Aucune clé enregistrée.";
}
$("saveKey").onclick = () => { store.set("apiKey", $("apiKey").value.trim()); $("apiKey").value = ""; refreshKeyState(); };

window.addEventListener("error", ev => error("Erreur inattendue : " + (ev.message || "inconnue") + ". Réessaie ou utilise l'onglet Chercher."));
window.addEventListener("unhandledrejection", ev => error("Erreur inattendue : " + ((ev.reason && ev.reason.message) || ev.reason || "inconnue") + ". Réessaie ou utilise l'onglet Chercher."));

renderList();
refreshKeyState();
