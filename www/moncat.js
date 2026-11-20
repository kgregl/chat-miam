/* Chat Miam — profil du chat, historique, favoris, alertes de rappel, plantes */
const loadJ = (k, d) => { try { const v = JSON.parse(store.get(k)); return v == null ? d : v; } catch (e) { return d; } };
const saveJ = (k, v) => store.set(k, JSON.stringify(v));
const catName = () => (loadJ("profil", {}).nom || "ton chat");

/* =====================================================================
   1. PROFIL DU CHAT ET VERDICTS PERSONNALISÉS
   ===================================================================== */
const CONDITIONS = {
  reins: "Maladie des reins",
  urinaire: "Problèmes urinaires (calculs, cystite)",
  diabete: "Diabète",
  surpoids: "Surpoids",
  digestif: "Estomac sensible",
};
const RX = {
  sucre: /\b(miel|sucres?|confiture|banane|raisins?|dattes?|pruneaux?|jus|friandises?|lait pour chat|gateaux?|desserts?|bonbons?|sirop|cereales|ananas|melon|pasteque|fraises?|fruits?|kaki|mangue|caramel|glace|crepes?|biscuits?)\b/,
  glucides: /\b(riz|pates|pain|pomme de terre|patate|mais|semoule|couscous|cereales|ble|quinoa|avoine|frites|gnocchi|biscottes?)\b/,
  oxalates: /\b(epinards?|blettes?|bettes?|rhubarbe|betteraves?|kale|carambole|persil)\b/,
  sel: /\b(sel|sale|salee|sales|charcuterie|jambon|saucisson|lardons|chips|anchois|olives?|surimi|fume|fumee|bouillon|fromages?|camembert|emmental|comte|gruyere|feta|parmesan|pizza|cornichons?|sauce soja|saumon fume)\b/,
  phosphore: /\b(fromages?|abats|foie|rognons?|coeur|gesiers?|thon|sardines?|maquereau|lait|yaourt|oeufs?|oeuf|crustaces|crevettes?)\b/,
  gras: /\b(fromages?|beurre|creme|huile|peau|gras|graisse|foie gras|friandises?|lait pour chat|charcuterie|lardons|saucisson|frites|chips|mayonnaise|croquettes pour chaton|chaton|kitten|noix de coco|canard|agneau|porc|maquereau|thon a l huile|huile)\b/,
  digest: /\b(cru|crue|crus|barf|lait|creme|fromages?|gras|beurre|huile|epices?|nouveau)\b/,
  croquettes: /\b(croquettes?|dry-cat-food|aliment sec)\b/,
  chatonFormule: /\b(chatons?|kitten|junior|babycat)\b/,
};
const VETO = {
  reins: /\b(renal|kidney|renale|k\/d|k d)\b/,
  urinaire: /\b(urinary|urinaire|s\/o|c\/d|struvite)\b/,
  diabete: /\b(diabetic|diabete|m\/d|glycemi)\b/,
  surpoids: /\b(obesity|satiety|light|weight|r\/d|metabolic)\b/,
  digestif: /\b(gastro|intestinal|digestive|i\/d|sensitive|sensible)\b/,
};

function profileText(v){
  return " " + norm([v.aliment, v.dbName, v.tag, v.ingr, (v.ingredients_a_risque || []).join(" ")].filter(Boolean).join(" ")).replace(/[^a-z0-9/]+/g, " ") + " ";
}

function personalize(v){
  const P = loadJ("profil", null);
  if (!P || !LABEL[v.verdict] || v.verdict === "inconnu" || v.isPlant) return v;
  const t = profileText(v), nom = P.nom || "ton chat", msgs = [];
  const cond = P.conditions || [];
  const isPet = /aliment pour chat|aliment veterinaire|friandise|lait pour chat|croquettes|patee/.test(t);
  const isVeto = /aliment veterinaire/.test(t);
  const bump = (lvl, msg) => { if (RANK[lvl] > RANK[v.verdict]) v.verdict = lvl; msgs.push(msg); };

  // Allergies
  const allergies = (P.allergies || "").split(/[,;]+/).map(a => norm(a).trim()).filter(a => a.length >= 3);
  for (const a of allergies) {
    const syn = a.startsWith("poisson") ? "(poissons?|thon|saumon|cabillaud|sardines?|maquereau|truite|colin|merlu|lieu)"
      : a.startsWith("volaille") || a.startsWith("poulet") ? "(volailles?|poulet|dinde|canard)"
      : a.startsWith("boeuf") ? "(boeuf|bovin|veau)" : a.startsWith("lait") ? "(lait|laitiers?|lactose|fromages?|yaourt|creme|beurre)"
      : a.replace(/[^a-z0-9 ]/g, "");
    if (new RegExp("\\b" + syn + "s?\\b").test(t)) bump("interdit", `Contient « ${a} », auquel ${nom} est allergique.`);
  }
  // Aliments vétérinaires adaptés aux maladies déclarées
  if (isVeto) for (const c of cond) if (VETO[c] && VETO[c].test(t)) {
    v.verdict = "ok"; msgs.push(`Cet aliment vétérinaire correspond à « ${CONDITIONS[c].toLowerCase()} » : adapté à ${nom} s'il a été prescrit par le vétérinaire.`);
  }
  if (cond.includes("diabete")) {
    if (RX.sucre.test(t) && !isVeto) bump("interdit", `Sucré : à éviter pour ${nom}, qui est diabétique.`);
    else if (RX.glucides.test(t) && !isVeto) bump("moderation", `Riche en glucides : à limiter pour ${nom} (diabète). Demande au vétérinaire l'alimentation adaptée.`);
  }
  if (cond.includes("urinaire")) {
    if (RX.oxalates.test(t)) bump("interdit", `Riche en oxalates : favorise les calculs urinaires de ${nom}.`);
    if (RX.sel.test(t)) bump("interdit", `Salé : le sel et les minéraux sont à éviter pour les problèmes urinaires de ${nom}.`);
    if (RX.croquettes.test(t) && !isVeto) msgs.push(`Problèmes urinaires : privilégie la pâtée (plus d'eau) et l'aliment urinaire conseillé par le vétérinaire.`);
  }
  if (cond.includes("reins")) {
    if (RX.sel.test(t)) bump("interdit", `Salé : mauvais pour les reins de ${nom}.`);
    if (RX.phosphore.test(t) && !isVeto) bump("moderation", `Riche en phosphore : à limiter pour les reins de ${nom}.`);
    if (isPet && !isVeto) msgs.push(`Maladie rénale : l'aliment de base devrait être un aliment « rénal » prescrit par le vétérinaire.`);
  }
  if (cond.includes("surpoids")) {
    if (RX.gras.test(t) || RX.sucre.test(t)) bump(v.verdict === "ok" ? "moderation" : "interdit", `Gras ou sucré : à éviter, ${nom} doit perdre du poids.`);
    else if (isPet) msgs.push(`Surpoids : pèse la ration au gramme près et limite les friandises.`);
  }
  if (cond.includes("digestif") && RX.digest.test(t)) bump(v.verdict === "ok" ? "moderation" : v.verdict, `${nom} a l'estomac sensible : à éviter ou à introduire très progressivement.`);

  // Âge
  if (P.age === "chaton") {
    if (/lait de vache|\blait\b/.test(t) && !/lait pour chat/.test(t)) bump("interdit", `${nom} est un chaton : le lait de vache donne la diarrhée.`);
    if (/\b(cru|crue|crus|barf)\b/.test(t)) bump("interdit", `${nom} est un chaton : pas d'aliment cru.`);
    if (RX.chatonFormule.test(t) && isPet) { if (v.verdict === "moderation" && !/friandise/.test(t)) v.verdict = "ok"; msgs.push(`Formule chaton : parfaite pour ${nom}.`); }
    else if (isPet && /aliment pour chat/.test(t) && !/friandise|lait pour chat/.test(t)) msgs.push(`${nom} est un chaton : préfère une formule « chaton » (jusqu'à 12 mois environ).`);
  } else if (RX.chatonFormule.test(t) && isPet) {
    msgs.push(`Formule chaton : trop riche pour ${nom}${P.sterilise ? ", surtout stérilisé" : ""}.`);
  }
  if (P.age === "senior" && RX.sel.test(t)) msgs.push(`${nom} est âgé : ses reins sont plus fragiles, évite le sel.`);
  if (P.sterilise && /friandise|lait pour chat/.test(t)) msgs.push(`${nom} est stérilisé et prend du poids plus facilement : friandises avec modération.`);

  if (msgs.length) v.perso = [...new Set(msgs)];
  return v;
}

function renderProfile(){
  const P = loadJ("profil", {});
  $("pNom").value = P.nom || "";
  $("pAge").value = P.age || "adulte";
  $("pPoids").value = P.poids || "";
  $("pSter").checked = !!P.sterilise;
  $("pAll").value = P.allergies || "";
  $("pCond").innerHTML = Object.entries(CONDITIONS).map(([k, l]) =>
    `<label class="check"><input type="checkbox" value="${k}" ${(P.conditions || []).includes(k) ? "checked" : ""}> ${esc(l)}</label>`).join("");
  $("profilTitre").textContent = P.nom ? `🐱 ${P.nom}` : "🐱 Profil de ton chat";
}
$("pSave").onclick = () => {
  const P = {
    nom: $("pNom").value.trim(), age: $("pAge").value, poids: $("pPoids").value.trim(),
    sterilise: $("pSter").checked, allergies: $("pAll").value.trim(),
    conditions: [...$("pCond").querySelectorAll("input:checked")].map(i => i.value),
  };
  saveJ("profil", P); renderProfile();
  $("pSaved").textContent = "✅ Profil enregistré : les verdicts sont maintenant adaptés.";
  setTimeout(() => $("pSaved").textContent = "", 4000);
};

/* =====================================================================
   2. HISTORIQUE ET FAVORIS
   ===================================================================== */
const keyOf = v => v.code ? "code:" + v.code : "nom:" + norm(v.aliment);
const slim = v => ({aliment: v.aliment, verdict: v.verdict, raison: v.raison, tag: v.tag, image: v.image, code: v.code,
  dbName: v.dbName, ingr: v.ingr ? String(v.ingr).slice(0, 600) : undefined, infos: v.infos, ingredients_a_risque: v.ingredients_a_risque,
  conseil: v.conseil, isPlant: v.isPlant, baseVerdict: v.baseVerdict || v.verdict, date: Date.now()});

function addHistory(v){
  if (!LABEL[v.verdict] || v.verdict === "inconnu" || v.noHistory) return;
  const h = loadJ("historique", []).filter(x => keyOf(x) !== keyOf(v));
  h.unshift(slim(v)); saveJ("historique", h.slice(0, 100));
  if (v.code) syncRunnerCodes();
}
const isFav = v => loadJ("favoris", []).some(x => keyOf(x) === keyOf(v));
function toggleFav(v){
  let f = loadJ("favoris", []);
  if (f.some(x => keyOf(x) === keyOf(v))) f = f.filter(x => keyOf(x) !== keyOf(v));
  else f.unshift(slim(v));
  saveJ("favoris", f); if (v.code) syncRunnerCodes();
  return isFav(v);
}

const _renderVerdict = showVerdict;
showVerdict = function(v){
  v.baseVerdict = v.baseVerdict || v.verdict;
  v.verdict = v.baseVerdict;
  personalize(v);
  _renderVerdict(v);
  const box = $("result").querySelector(".verdict");
  if (box && v.perso) box.querySelector(".badge").insertAdjacentHTML("afterend",
    `<div class="perso"><b>🐱 Pour ${esc(catName())} :</b><ul>${v.perso.map(m => `<li>${esc(m)}</li>`).join("")}</ul></div>`);
  if (box && LABEL[v.verdict] && v.verdict !== "inconnu") {
    const fav = isFav(v);
    box.insertAdjacentHTML("beforeend", `<button class="favbtn ${fav ? "on" : ""}">${fav ? "★ Dans les favoris" : "☆ Ajouter aux favoris"}</button>`);
    const b = box.querySelector(".favbtn");
    b.onclick = () => { const on = toggleFav(v); b.classList.toggle("on", on); b.textContent = on ? "★ Dans les favoris" : "☆ Ajouter aux favoris"; };
  }
  addHistory(v);
};

const DOT = {ok: "🟢", moderation: "🟠", interdit: "🔴"};
function listHtml(arr, kind){
  if (!arr.length) return `<p class="hint">${kind === "fav" ? "Aucun favori pour l'instant : touche ☆ sous un verdict pour l'ajouter." : "Rien pour l'instant : tes scans, photos et recherches apparaîtront ici."}</p>`;
  const recalls = loadJ("rappelsActifs", {});
  return `<ul class="list">${arr.map((x, i) => `<li data-i="${i}" data-k="${kind}"><span class="dot ${x.verdict}"></span>
    <span class="n">${esc(x.aliment)}${x.code && recalls[x.code] ? ' <b class="err">⚠️ rappel</b>' : ""}<br><span class="t">${new Date(x.date).toLocaleDateString("fr-FR")}${x.code ? " · code " + esc(x.code) : ""}</span></span>
    <span class="t">${LABEL[x.verdict]}</span></li>`).join("")}</ul>`;
}
function renderLists(){
  const h = loadJ("historique", []), f = loadJ("favoris", []);
  $("favList").innerHTML = listHtml(f, "fav");
  $("histList").innerHTML = listHtml(h, "hist");
  $("histClear").classList.toggle("hidden", !h.length);
  document.querySelectorAll("#favList li[data-i], #histList li[data-i]").forEach(li => li.onclick = () => {
    const arr = li.dataset.k === "fav" ? f : h;
    const x = Object.assign({}, arr[+li.dataset.i]);
    x.verdict = x.baseVerdict || x.verdict;
    if (x.code) { $("codeInput").value = x.code; lookupBarcode(x.code); }   // rescanne pour avoir les infos à jour (rappels…)
    else showVerdict(x);
  });
}
$("histClear").onclick = () => { saveJ("historique", []); renderLists(); syncRunnerCodes(); };

/* =====================================================================
   3. ALERTES DE RAPPEL (au lancement + notifications en arrière-plan)
   ===================================================================== */
const RUNNER_LABEL = "fr.greg.chatmiam.rappels";
// Appels directs aux plugins natifs (l'appli n'embarque pas @capacitor/core, seulement le pont natif)
const IS_NATIVE = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.nativePromise);
const native = (plugin, method, opts) => Capacitor.nativePromise(plugin, method, opts || {});
const BR = IS_NATIVE ? {
  dispatchEvent: o => native("BackgroundRunner", "dispatchEvent", o),
  checkPermissions: () => native("BackgroundRunner", "checkPermissions"),
  requestPermissions: o => native("BackgroundRunner", "requestPermissions", o),
} : null;
function watchedCodes(){
  const codes = [...loadJ("favoris", []), ...loadJ("historique", [])].map(x => x.code).filter(Boolean);
  return [...new Set(codes)].slice(0, 100);
}
async function syncRunnerCodes(){
  if (!BR) return;
  try { await BR.dispatchEvent({label: RUNNER_LABEL, event: "majCodes", details: {codes: watchedCodes().join(",")}}); } catch (e) {}
}
async function checkAllRecalls(){
  const codes = watchedCodes().map(Number).filter(Boolean);
  if (!codes.length) { saveJ("rappelsActifs", {}); renderRecallBanner(); return; }
  try {
    const where = `gtin in (${codes.join(",")})`;
    const url = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-trie/records?limit=100"
      + "&select=gtin,id,libelle,motif_rappel,date_publication,date_de_fin_de_la_procedure_de_rappel,lien_vers_la_fiche_rappel"
      + "&where=" + encodeURIComponent(where);
    const j = await (await fetch(url)).json();
    const today = new Date(new Date().toDateString());
    const actifs = {};
    for (const r of (j.results || [])) {
      const fin = r.date_de_fin_de_la_procedure_de_rappel;
      if (!fin || new Date(fin) >= today) actifs[String(r.gtin).padStart(13, "0")] = r;
    }
    // Les codes de l'historique peuvent avoir 13 chiffres avec un 0 devant : on garde les deux formes
    for (const c of watchedCodes()) { const k = String(Number(c)).padStart(13, "0"); if (actifs[k]) actifs[c] = actifs[k]; }
    saveJ("rappelsActifs", actifs);
    renderRecallBanner(); renderLists();
  } catch (e) { /* hors ligne : on réessaiera plus tard */ }
}
function renderRecallBanner(){
  const actifs = loadJ("rappelsActifs", {}), vus = loadJ("rappelsVus", []);
  const items = watchedCodes().filter(c => actifs[c] && !vus.includes(c + ":" + actifs[c].id));
  const el = $("recallBanner");
  if (!items.length) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  const nameOf = c => ([...loadJ("favoris", []), ...loadJ("historique", [])].find(x => x.code === c) || {}).aliment || actifs[c].libelle;
  el.innerHTML = `<b>⚠️ Rappel officiel sur ${items.length > 1 ? items.length + " produits" : "un produit"} que tu as scanné</b>
    <ul>${items.map(c => `<li><b>${esc(nameOf(c))}</b> : ${esc(actifs[c].motif_rappel || "")}${actifs[c].lien_vers_la_fiche_rappel ? ` — <a href="${esc(actifs[c].lien_vers_la_fiche_rappel)}" target="_blank" rel="noopener">fiche</a>` : ""}</li>`).join("")}</ul>
    <span class="muted">Vérifie le n° de lot sur ton emballage.</span> <button id="recallOk" class="small">J'ai vu</button>`;
  el.classList.remove("hidden");
  $("recallOk").onclick = () => { saveJ("rappelsVus", [...vus, ...items.map(c => c + ":" + actifs[c].id)]); renderRecallBanner(); };
}
async function refreshNotifState(){
  if (!BR) { $("notifState").textContent = "Les notifications en arrière-plan ne marchent que dans l'appli Android."; $("notifBtn").classList.add("hidden"); return; }
  try {
    const p = await BR.checkPermissions();
    const on = p && p.notifications === "granted";
    $("notifState").textContent = on ? "✅ Notifications activées : l'appli vérifie les rappels environ 2 fois par jour, même fermée." : "Notifications désactivées.";
    $("notifBtn").classList.toggle("hidden", on);
  } catch (e) { $("notifState").textContent = ""; }
}
$("notifBtn").onclick = async () => {
  try { await BR.requestPermissions({apis: ["notifications"]}); } catch (e) {}
  await syncRunnerCodes(); refreshNotifState();
};

/* =====================================================================
   4. PLANTES (Pl@ntNet avec clé gratuite, sinon lecture de l'étiquette)
   ===================================================================== */
function plantFromGenus(genus, family){
  const p = PLANTS.find(x => (x[4] || []).includes(genus));
  if (p) return {verdict: p[1], raison: p[2], nomListe: p[0]};
  if (family && PLANT_FAMILIES[family]) return {verdict: PLANT_FAMILIES[family][0], raison: PLANT_FAMILIES[family][1]};
  return null;
}
async function plantnetIdentify(b64, key){
  const url = `https://my-api.plantnet.org/v2/identify/all?api-key=${encodeURIComponent(key)}&lang=fr&nb-results=3&include-related-images=false`;
  if (IS_NATIVE) {
    const r = await native("CapacitorHttp", "request", {url, method: "POST", headers: {"Content-Type": "multipart/form-data"}, dataType: "formData",
      connectTimeout: 30000, readTimeout: 45000,
      data: [{key: "organs", value: "auto", type: "string"}, {key: "images", value: b64, type: "base64File", fileName: "plante.jpg", contentType: "image/jpeg"}]});
    return {status: r.status, data: typeof r.data === "string" ? JSON.parse(r.data || "{}") : r.data};
  }
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const fd = new FormData(); fd.append("organs", "auto"); fd.append("images", new Blob([bin], {type: "image/jpeg"}), "plante.jpg");
  const r = await fetch(url, {method: "POST", body: fd});
  return {status: r.status, data: await r.json().catch(() => ({}))};
}
const PLANTNET_CREDIT = "Identification par l'API Pl@ntNet (my.plantnet.org).";

$("plantInput").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  showPreview(f);
  const key = store.get("plantnetKey");
  if (key) {
    loading("Pl@ntNet cherche la plante…");
    try {
      const {status, data} = await withTimeout(plantnetIdentify(await toJpegB64(f, 1280), key), 60000);
      if (status === 401 || status === 403) { error("Clé Pl@ntNet refusée. Vérifie-la dans ⚙️ (et que « exposer ma clé » est décoché sur my.plantnet.org)."); return; }
      if (status === 429) { error("Quota Pl@ntNet du jour atteint (500 identifications). Réessaie demain."); return; }
      const res = (data && data.results) || [];
      if (status === 404 || !res.length) { showPlantUnknown("Pl@ntNet n'a pas reconnu de plante. Reprends la photo en cadrant bien une feuille ou une fleur."); return; }
      const best = res[0], sp = best.species || {};
      const genus = sp.genus && sp.genus.scientificNameWithoutAuthor, family = sp.family && sp.family.scientificNameWithoutAuthor;
      const nomFr = (sp.commonNames && sp.commonNames[0]) || sp.scientificNameWithoutAuthor;
      const m = plantFromGenus(genus, family);
      const others = res.slice(1).map(r => {
        const s = r.species || {}, mm = plantFromGenus(s.genus && s.genus.scientificNameWithoutAuthor, s.family && s.family.scientificNameWithoutAuthor);
        return `${(s.commonNames && s.commonNames[0]) || s.scientificNameWithoutAuthor} (${Math.round(r.score * 100)} %)${mm ? " : " + LABEL[mm.verdict] : ""}`;
      });
      if (!m) {
        showVerdict({aliment: `${nomFr} (${sp.scientificNameWithoutAuthor})`, verdict: "inconnu", isPlant: true, noHistory: true,
          raison: "Cette plante n'est pas dans ma liste. En cas de doute, considère-la comme toxique et vérifie sur la liste de l'ASPCA (« toxic and non-toxic plants »).",
          infos: others.length ? ["Autres possibilités : " + others.join(" ; ")] : [], note: `Confiance : ${Math.round(best.score * 100)} %. ${PLANTNET_CREDIT}`});
        return;
      }
      showVerdict({aliment: `${nomFr} (${sp.scientificNameWithoutAuthor})`, verdict: m.verdict, raison: m.raison, isPlant: true, tag: "Plante",
        infos: [...(best.score < 0.4 ? ["Identification peu sûre : vérifie avec une autre photo (feuille ou fleur bien nette)."] : []),
                ...(others.length ? ["Autres possibilités : " + others.join(" ; ")] : [])],
        note: `Confiance : ${Math.round(best.score * 100)} %. ${PLANTNET_CREDIT}`});
    } catch (x) {
      console.error(x);
      const d = (x && (x.message || x.errorMessage || x.code)) || String(x);
      error("Pl@ntNet ne répond pas (" + d + "). Vérifie ta connexion, ou cherche la plante par son nom dans l'onglet Chercher.");
    }
    return;
  }
  // Sans clé : on lit l'étiquette du pot
  loading("Je lis l'étiquette de la plante…");
  let text = "";
  try { text = await withTimeout(readText(f), 90000); } catch (x) {}
  const m = matchText(text).filter(x => x.row[0].startsWith("Plante : "));
  if (m.length) {
    const r = m[0].row;
    showVerdict({aliment: r[0].replace("Plante : ", ""), dbName: r[0], verdict: r[1], raison: r[2], isPlant: true, tag: "Plante",
      note: `Reconnue grâce à l'étiquette (« ${m[0].hit} »).`});
    return;
  }
  showPlantUnknown("Sans étiquette lisible, je ne peux pas reconnaître la plante hors ligne.", true);
};
function showPlantUnknown(msg, suggestKey){
  $("result").innerHTML = `<div class="verdict inconnu"><span class="badge">INCERTAIN</span><h2>Plante non reconnue</h2><p>${esc(msg)}</p>
    ${suggestKey ? `<p>Pour reconnaître n'importe quelle plante en photo, ajoute une <b>clé Pl@ntNet gratuite</b> (500 identifications par jour) dans l'onglet ⚙️.</p>` : ""}
    <p class="hint">Tu peux aussi chercher son nom dans l'onglet Chercher (ex : « monstera », « lys », « orchidée »). En cas de doute, considère la plante comme toxique.</p></div>`;
}
function refreshPlantKey(){
  const k = store.get("plantnetKey");
  $("plantKeyState").textContent = k ? "✅ Clé Pl@ntNet enregistrée (…" + k.slice(-4) + ")" : "Aucune clé Pl@ntNet.";
}
$("savePlantKey").onclick = () => { store.set("plantnetKey", $("plantKey").value.trim()); $("plantKey").value = ""; refreshPlantKey(); };

/* ---------- Démarrage ---------- */
function openMonChat(){ renderProfile(); renderLists(); refreshNotifState(); }
renderProfile(); renderLists(); refreshPlantKey(); renderRecallBanner();
checkAllRecalls(); syncRunnerCodes();
