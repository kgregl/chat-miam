# 🐱 Chat Miam — Mon chat peut-il manger ça ?

Appli Android pour savoir si un aliment peut être donné à un chat.

- **Scanner** : code-barres en direct avec la caméra → produit cherché sur Open Food Facts → ingrédients analysés (oignon, ail, chocolat, xylitol, raisin, alcool, caféine, sel…).
- **Aliments pour chats** : croquettes, pâtées, friandises, lait, aliments vétérinaires, formules chaton, aliments pour chien (via Open Pet Food Facts), avec repérage du propylène glycol, de l’éthoxyquine, des ingrédients toxiques.
- **Rappels** : vérification du code-barres dans RappelConso (rappels officiels en France).
- **Photo** : reconnaissance d'un aliment ou d'une liste d'ingrédients par Claude (clé API Anthropic à saisir dans ⚙️, optionnel).
- **Chercher** : base intégrée de ~65 aliments (interdit / à limiter / OK), fonctionne hors ligne.

## Récupérer l'APK
Chaque push sur `main` lance GitHub Actions qui compile l'APK et le publie dans **Releases**.
Sur le téléphone : ouvre la dernière release → télécharge `ChatMiam.apk` → autorise « sources inconnues » → installe.

## Compiler soi-même
Prérequis : Node 22, JDK 21, Android SDK.
```bash
npm ci && npm run copy-libs
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```
(Ajouter `<uses-permission android:name="android.permission.CAMERA" />` dans `android/app/src/main/AndroidManifest.xml`.)

Stack : Capacitor 8 + HTML/JS, ZXing, API Open Food Facts.

> Repères généraux, ne remplace pas l'avis d'un vétérinaire. Urgence : CNITV Lyon 04 78 87 10 40 · CAPAE-Ouest 02 40 68 77 40.
