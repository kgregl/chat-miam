// Tâche en arrière-plan (Capacitor Background Runner) : vérifie les rappels RappelConso
// pour les codes-barres de l'historique et des favoris, et envoie une notification.

addEventListener("majCodes", (resolve, reject, args) => {
  try {
    CapacitorKV.set("codes", (args && args.codes) || "");
    resolve();
  } catch (e) { reject(e); }
});

addEventListener("verifierRappels", (resolve, reject, args) => {
  try {
    const stored = CapacitorKV.get("codes");
    const codes = ((stored && stored.value) || "").split(",").map(c => Number(c)).filter(c => c > 0).slice(0, 100);
    if (!codes.length) { resolve(); return; }
    const vusRaw = CapacitorKV.get("vus");
    const vus = ((vusRaw && vusRaw.value) || "").split(",").filter(Boolean);
    const url = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-trie/records?limit=100"
      + "&select=gtin,id,libelle,motif_rappel,date_de_fin_de_la_procedure_de_rappel"
      + "&where=" + encodeURIComponent("gtin in (" + codes.join(",") + ")");
    fetch(url).then(r => r.json()).then(j => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const nouveaux = (j.results || []).filter(r => {
        const fin = r.date_de_fin_de_la_procedure_de_rappel;
        const actif = !fin || new Date(fin) >= today;
        return actif && vus.indexOf(String(r.id)) === -1;
      });
      if (nouveaux.length) {
        CapacitorNotifications.schedule(nouveaux.slice(0, 5).map((r, i) => ({
          id: 7000 + (Number(r.id) % 100000) + i,
          title: "⚠️ Rappel : " + (r.libelle || "un produit scanné").slice(0, 60),
          body: (r.motif_rappel || "Produit rappelé") + " — ouvre Chat Miam et vérifie le n° de lot.",
        })));
        CapacitorKV.set("vus", vus.concat(nouveaux.map(r => String(r.id))).slice(-300).join(","));
      }
      resolve();
    }).catch(e => resolve());
  } catch (e) { resolve(); }
});
