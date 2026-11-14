# Orders

Responsabilité attribuée : ASHAD Ossama.

Exécution depuis la racine application :
```sh
export INTERNAL_KEY='cle-de-laboratoire-a-remplacer-32-caracteres'
node backend/services/orders/index.mjs
```

API et tests : docs/API.md, tests/integration.mjs et preuves/integration.json.
La base propre au service est créée au premier démarrage dans DATA_DIR.
Voir docs/ARCHITECTURE.md pour les dépendances et les limites.
