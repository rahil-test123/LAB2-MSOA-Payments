# Payments

Responsabilité attribuée : Rahil Msouhli.

Payments gère les paiements et remboursements simulés. Il valide la session auprès d'Auth et utilise le montant de la commande enregistré par Orders. Chaque service utilise sa propre base SQLite.

## Configuration individuelle

Dans [`src/config/backend.js`](../../../src/config/backend.js), `BACKEND_MODE.PAYMENTS` vaut `"rest"` et `API_URLS.PAYMENTS` vaut `"http://127.0.0.1:8085"`. Les autres entrées de `BACKEND_MODE` valent `"mock"`.

Depuis la racine du dépôt avec Node.js 24 ou ultérieur, lancez le frontend et les API nécessaires.

```sh
npm ci
npm start
```

Ouvrez [la boutique React](http://127.0.0.1:5173) ou [la route de disponibilité de Payments](http://127.0.0.1:8085/health). La route `/health` renvoie `{"service":"payments","status":"UP"}`.

## Test du paiement

Pour tester le contrat REST, arrêtez d'abord la démonstration avec Ctrl+C et lancez `npm test`. La suite démarre ses propres services, crée une session et une commande et vérifie notamment `POST /api/payments`, le statut `SUCCESS`, le passage de la commande à `PAID`, la répétition d'un paiement et le remboursement simulé.

Le profil individuel attend un jeton Auth valide et un identifiant de commande connu d'Orders. Pour faire une démonstration depuis le checkout de la boutique, passez temporairement `AUTH` et `ORDERS` en `rest` dans la configuration. Connectez-vous avec `demo@msoa.shop` et `demo123`, ajoutez un produit et validez le checkout. Dans l'onglet **Réseau** du navigateur, `POST http://127.0.0.1:8085/api/payments` doit renvoyer `200 OK` et `status: "SUCCESS"`. Remettez `AUTH` et `ORDERS` en `mock` pour retrouver le profil individuel.

Voir les [contrats REST](../../../docs/API.md) et les [tests d'intégration](../../../tests/integration.mjs).
