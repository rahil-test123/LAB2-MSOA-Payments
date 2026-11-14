# Contrats REST et règles d'accès
Toutes les réponses d'erreur : `{ "message": "...", "requestId": "..." }`.
200 = succès ; 400 = entrée invalide ; 401 = session absente/invalide ; 403 = propriétaire/acteur interdit ; 404 = ressource absente ; 409 = conflit métier ; 503 = service dépendant indisponible.

| Service | Méthode / chemin | Entrée | Sortie |
|---|---|---|---|
| Auth | POST /api/auth/register | name,email,password (min 6) | id,name,email,role |
| Auth | POST /api/auth/login | email,password | user,token |
| Auth | GET /api/auth/me | Bearer token | utilisateur public |
| Auth | POST /api/auth/logout | Bearer token | success |
| Catalog | GET /products | public | tableau de produits |
| Catalog | GET /products/{id} | public | id,name,category,price,image,description |
| Inventory | GET /api/inventory/{productId} | public | productId,stock |
| Inventory | POST /api/inventory/check | items:[{productId,quantity}] | available |
| Inventory | POST /api/inventory/reserve | items, reservationId optionnel ; appel interne | success,reservationId |
| Inventory | POST /api/inventory/release | items,reservationId ; appel interne | success |
| Orders | GET /api/orders?userId={id} | session propriétaire | commandes de cet utilisateur |
| Orders | GET /api/orders/{id} | session propriétaire | commande |
| Orders | POST /api/orders | userId,customer:{name,address,city},items | id,userId,customer,items,total,status,createdAt |
| Orders | PATCH /api/orders/{id}/status | status | état déjà atteint uniquement côté client ; sinon 403 |
| Orders | POST /api/orders/{id}/cancel | session propriétaire | commande CANCELLED |
| Payments | GET /api/payments | session | paiements de l'utilisateur |
| Payments | GET /api/payments/order/{orderId} | session propriétaire | paiement |
| Payments | POST /api/payments | orderId,method:CARD ou CASH | id,orderId,userId,amount,method,status,createdAt |
| Shipping | GET /api/shipments | session | expéditions de l'utilisateur |
| Shipping | GET /api/shipments/order/{orderId} | session propriétaire | expédition |
| Shipping | POST /api/shipments | orderId,address conforme à la commande | id,orderId,userId,address,trackingNumber,status,createdAt,updatedAt |
| Shipping | PATCH /api/shipments/{id}/status | status | expédition synchronisée avec Orders |

Chaque service expose GET /health. Le champ stock est fourni par Inventory, puis combiné au produit par Products.jsx sans modification du frontend.

Extensions internes (X-Internal-Key obligatoire) :
- Orders : POST /internal/orders/{id}/action, action PAY/PREPARE/SHIP/TRANSIT/DELIVER/CANCEL.
- Payments : POST /internal/payments/{orderId}/capture ou /refund.
- Shipping : POST /internal/shipments/{orderId}/prepare, /advance ou /cancel.

Le corps frontend contractuel items reste accepté. Inventory.reserve/release sont protégés car un client ne doit pas fabriquer du stock ; dans le parcours REST fourni, ces mutations sont déclenchées par Orders. Pour release, le reservationId lie l'opération à une réservation existante et empêche une double restitution. customer.email peut être conservé comme champ complémentaire. L'adresse de Shipping doit correspondre à celle figée par Orders.
