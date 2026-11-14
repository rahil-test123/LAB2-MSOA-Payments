# LAB 2 - Building a Microservices-Oriented Application

Livraison de groupe : ASHAD Ossama, Elhaddaji Hamza, Sekkat Israa, Mouhcine Ayar, Rahil Msouhli, Karany Mohamed Amine.
Professeur : Zouheir BANOU. Le README du projet est adapté du frontend fourni par le professeur.

Ce dépôt utilise la configuration individuelle [Payments](backend/services/payments/). Les six API démarrent ensemble pour fournir les dépendances du service. Côté React, seul Payments utilise REST. Le guide Payments indique comment tester ce profil et comment faire un essai depuis le checkout.

## Démarrage rapide
Prérequis : Node.js 24 ou ultérieur et npm. Aucun serveur de base de données à installer.

```sh
npm ci
npm start
```
Ouvrir **http://127.0.0.1:5173**. Compte pédagogique : **demo@msoa.shop / demo123**.
Les six APIs démarrent sur 8081-8086. Ctrl+C arrête le groupe de processus.
Les données persistent dans backend/data, un fichier SQLite par service. Les bases sont créées au démarrage.

## Validation
Arrêter d'abord la démonstration (les tests utilisent les mêmes ports).
```sh
npm test
npm run build
```
Les tests créent un répertoire temporaire isolé et des preuves dans preuves/. Aucune base de démonstration existante n'est écrasée. Le test navigateur de groupe exige que les six entrées de `BACKEND_MODE` soient en `rest` et que la démonstration soit démarrée séparément :
```sh
npm start
# autre terminal (Chrome installé)
npm run test:browser
# Pour voir le parcours dans Chrome et garder sa fenêtre ouverte :
SHOW_BROWSER=1 KEEP_BROWSER=1 npm run test:browser
```
CHROME_PATH permet d'indiquer l'exécutable Chrome sur Windows/Linux. Sans variable, le chemin macOS est utilisé. Le test navigateur crée des commandes pédagogiques dans la base de démonstration. Si le stock est épuisé après de nombreux tests, relancer la démonstration avec un nouveau DATA_DIR plutôt que supprimer des données.

## Un microservice indépendamment
Depuis la racine application, définir une même clé interne d'au moins 32 caractères dans les terminaux des services :
```sh
export INTERNAL_KEY='cle-de-laboratoire-a-remplacer-32-caracteres'
node backend/services/catalog/index.mjs
```
Changer catalog en auth, inventory, orders, payments ou shipping. Catalog peut être consulté seul. Les autres scénarios exigent leurs dépendances décrites dans docs/ARCHITECTURE.md. Variables facultatives : PORT, HOST (127.0.0.1 par défaut), DATA_DIR, AUTH_URL, CATALOG_URL, INVENTORY_URL, ORDERS_URL, PAYMENTS_URL, SHIPPING_URL, CORS_ORIGINS. Une clé d'exemple n'est destinée qu'au laboratoire ; le lanceur npm start en génère une aléatoire en mémoire.

## Contenu à remettre
- Rapport de groupe PDF dans le dossier parent.
- Ce projet source complet, incluant les six backend/services et le frontend fourni.
- docs/ARCHITECTURE.md : réponses Q1-Q6, frontières, données, communications et migration.
- docs/API.md : contrats, états, autorisations et erreurs.
- preuves/integration.json, logs, build frontend et captures du navigateur : preuves effectivement produites.
- tests/integration.mjs et tests/browser.mjs : scénarios reproductibles.

Seul src/config/backend.js est modifié dans les sources React. Le panier reste géré côté navigateur conformément au frontend fourni. Les données du navigateur ne font jamais autorité pour prix, stock et autorisation. Paiements et transport restent des simulations pédagogiques.

## Utilisation de l'interface
Products -> Add to Cart -> panier -> Proceed to Checkout -> remplir les quatre champs -> Place Order -> View My Orders. Les commandes payées peuvent être annulées avant expédition. Simulate fait progresser la livraison ; après SHIPPED, l'annulation est interdite. Orders contrôle les invariants même si le navigateur forge les requêtes.

## Limites à expliquer
Pas de déploiement externe, pas de paiement réel, pas de broker ni de worker de réconciliation. Six processus indépendants, une instance par service ; verrous Orders locaux. La migration sans interruption est une proposition détaillée (Q6), le sujet ne fournit qu'un frontend simulé. Voir les compromis et reprises dans docs/ARCHITECTURE.md.
