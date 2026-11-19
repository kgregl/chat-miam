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
      <span class="badge">${LABEL[k]}</span>
      ${v.image ? `<div class="prod"><img src="${esc(v.image)}" alt=""><h2>${esc(v.aliment)}</h2></div>` : `<h2>${esc(v.aliment || "Aliment")}</h2>`}
      <p>${esc(v.raison)}</p>
      ${risques.length ? `<p><b>Ingrédients à risque :</b></p><ul>${risques.map(r=>`<li>${esc(r)}</li>`).join("")}</ul>` : ""}
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
  $("askBtn").classList.toggle("hidden", !t);
}
$("q").oninput = renderList;
document.querySelectorAll(".filters button").forEach(b => b.onclick = () => {
  filter = b.dataset.f;
  document.querySelectorAll(".filters button").forEach(x => x.classList.toggle("on", x === b));
  renderList();
});

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

async function lookupBarcode(code){
  code = String(code).replace(/\D/g,"");
  if (code.length < 8) { error("Code-barres invalide."); return; }
  loading("Recherche du produit…");
  try {
    const fields = "product_name,product_name_fr,brands,ingredients_text,ingredients_text_fr,nutriments,image_front_small_url,nova_group";
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`);
    const j = await r.json();
    if (j.status !== 1 || !j.product) {
      showVerdict({aliment:`Code ${code}`, verdict:"inconnu",
        raison:"Ce produit n'est pas dans la base Open Food Facts.",
        conseil:"Prends sa liste d'ingrédients en photo (onglet Photo) ou cherche l'aliment par son nom."});
      return;
    }
    showVerdict(analyseProduct(j.product));
  } catch (e) {
    error("Impossible de joindre Open Food Facts. Vérifie ta connexion Internet.");
  }
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

$("photoInput").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  $("photoPreview").src = URL.createObjectURL(f); $("photoPreview").classList.remove("hidden");
  loading("Claude regarde ta photo…");
  try {
    const b64 = await toJpegB64(f);
    showVerdict(await askClaude("Voici la photo de l'aliment (ou de son emballage / sa liste d'ingrédients). Identifie-le et donne ton verdict.", b64));
  } catch (x) { error(claudeErr(x)); }
  e.target.value = "";
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

renderList();
refreshKeyState();
