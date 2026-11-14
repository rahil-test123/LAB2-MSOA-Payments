# LAB 2 - Analyse, architecture et communications

## Périmètre et provenance
Frontend du professeur : https://github.com/ZOUHEIRBN/MSOA-E-com-Demo, commit `baee7d79828a4883c8c7158e41ac4b1a878bf12a`.
Le fichier `src/config/backend.js` configure la connexion REST du frontend fourni. Dans ce dépôt, seule l'entrée Payments est en mode REST. Les dépendances et scripts de développement sont complétés dans package.json.

## Q1 - Trois arguments distincts
1. **Charge asymétrique** : la consultation explose pendant les promotions, contrairement aux paiements. Catalog peut disposer de ses propres réplicas/cache sans multiplier tous les traitements métier. Le prototype fournit les processus séparés ; il ne prétend pas mesurer une montée en charge en production.
2. **Autonomie des changements et des équipes** : les modifications du stock impactent aujourd'hui les commandes et imposent un redéploiement global. Inventory possède ses règles de réservation et sa base. Un contrat HTTP versionnable permet à son responsable de changer son implémentation sans toucher aux tables d'Orders. Les contrats doivent rester compatibles et être testés.
3. **Évolutivité fonctionnelle et intégrations externes** : introduire un nouveau prestataire de paiement ou de transport ne doit pas modifier tout le backend. Payments et Shipping constituent des points d'adaptation spécialisés. Délais d'attente et erreurs explicites limitent les effets d'une dépendance indisponible ; la distribution introduit cependant des risques de panne et de cohérence absents d'un simple appel local.

## Q2 - Décomposition par capacités métier / bounded contexts
| Service | Responsabilité et frontière | Propriétaire de données | Répartition proposée dans l'équipe |
|---|---|---|---|
| Orders :8084 | Cycle de vie des commandes, prix figés, orchestration des invariants d'achat | orders.sqlite : commandes, tentatives, clés d'idempotence | ASHAD Ossama |
| Auth :8081 | Comptes, mots de passe hachés, sessions révocables | auth.sqlite : utilisateurs et sessions | Elhaddaji Hamza |
| Catalog :8082 | Informations et prix des produits consultables | catalog.sqlite : catalogue hors stock | Sekkat Israa |
| Inventory :8083 | Quantités, réservation atomique et libération idempotente | inventory.sqlite : stock et registre des réservations | Mouhcine Ayar |
| Payments :8085 | Simulation de paiement, montant autoritaire de la commande, remboursement simulé | payments.sqlite : paiements | Rahil Msouhli |
| Shipping :8086 | Préparation, numéro de suivi et progression de livraison | shipping.sqlite : expéditions | Karany Mohamed Amine |

Cette attribution indique les responsabilités à prendre en charge, expliquer et valider par les membres ; elle ne constitue pas un historique de contributions individuelles. Le panier reste dans le navigateur comme dans le frontend fourni. Un service Cart n'est pas ajouté sans besoin de panier partagé entre appareils. Pas de service par table SQL : Catalog et Inventory sont séparés pour leurs règles et leurs profils de charge, pas simplement parce que leurs données sont différentes.

## Q3 - Évaluation de la décomposition
- Cohésion : toutes les règles de réservation sont dans Inventory, tous les changements métier de commande sont sérialisés dans Orders.
- Couplage : échanges JSON sur REST, aucune lecture directe des bases d'un autre service. Une copie du nom/prix est figée dans la ligne de commande ; aucun lien SQL distribué.
- Autonomie : six exécutables, ports et bases distincts. Catalog fonctionne sans les autres services. Orders dépend à l'exécution d'Auth, Catalog et Inventory ; annulation et expédition nécessitent les dépendances correspondantes.
- Propriété : Auth tranche l'identité, Catalog le prix, Inventory le stock, Orders l'état de la commande. Un montant, userId ou statut envoyé par le navigateur n'est pas accepté sans vérification.
- Mauvaise frontière possible : Catalog et Orders écrivant directement la table de stock produiraient une base partagée, des surventes et un monolithe distribué. Une prolifération de minuscules services par entité multiplierait les appels sans autonomie métier.

## Q4 - Commande de plusieurs produits
```
React -> Orders : POST /api/orders (userId, customer, items)
Orders -> Auth : GET /api/auth/me (session du client)
Orders -> Catalog : GET /products/{id} pour chaque produit
Orders -> Inventory : POST /api/inventory/reserve (toutes les lignes, reservationId)
Orders : PENDING_PAYMENT si réservation complète
React -> Payments : POST /api/payments
Payments -> Orders : action PAY (contrôle propriétaire / état)
Orders -> Payments : capture interne, montant de la commande
Orders : PAID
React -> Shipping : POST /api/shipments
Shipping -> Orders : action PREPARE
Orders -> Shipping : préparation interne
```
Orders coordonne les transitions métier. React conserve les trois appels du contrat fourni ; le backend ne lance pas un second paiement automatique. Les appels internes de capture/préparation n'appellent pas à nouveau Orders : la boucle de coordination se termine.

**Stock indisponible** : Inventory agrège les productId dupliqués et contrôle toutes les lignes dans BEGIN IMMEDIATE. Au moindre manque, aucun stock n'est modifié et Orders répond 409. Aucun paiement ni livraison ne doit être lancé. Le précontrôle dans le navigateur est indicatif ; seule la réservation est autoritaire.

**Annulation autorisée** : verrou par commande dans Orders ; Shipping refuse si déjà expédié, sinon annule PREPARING. Orders persiste CANCELLING, demande le remboursement simulé puis libère la réservation une seule fois avant CANCELLED. Une interruption peut être reprise par le même endpoint. Les appels sont idempotents sur l'identifiant de commande/réservation.

**Livraison** : PREPARING -> SHIPPED -> IN_TRANSIT -> DELIVERED. Orders coordonne Shipping puis met son propre état à SHIPPED / DELIVERED. Le second PATCH idempotent envoyé par le composant existant est accepté uniquement si l'état est déjà atteint ; le client ne peut pas se déclarer PAID ou SHIPPED arbitrairement.

## Q5 - Implémentation et compromis
Node.js 24+, API HTTP native et SQLite via node:sqlite. Chaque membre peut remplacer son service par Spring/FastAPI tant que les méthodes, URL, JSON et règles restent compatibles. Le backend n'a aucune dépendance npm de production. Les six bases persistent au redémarrage. Les prix sont calculés en centimes ; paiements entièrement simulés, sans données bancaires.

Session opaque aléatoire, seule son empreinte est conservée ; mots de passe scrypt avec sel individuel. Les appels internes utilisent INTERNAL_KEY, généré par le lanceur ou fourni par environnement. Le service vérifie à nouveau le propriétaire de chaque commande/paiement/expédition. Les listes sont limitées à l'utilisateur connecté. CORS autorise localhost:5173 et 127.0.0.1:5173.

Délais interservices : 2,5 secondes, panne traduite en 503. Idempotency-Key optionnelle sur création de commande, liée à l'utilisateur et à une empreinte logique de la requête. Paiement, préparation et libération utilisent le même identifiant de commande pour dédupliquer.

**Limites concrètes du prototype** : un processus par service ; les verrous d'Orders sont en mémoire et ne constituent pas un verrou distribué multi-réplicas. SQLite synchrone convient au TP, pas à un fort trafic sans étude. Pas de transaction atomique entre bases ; une panne après un effet distant peut laisser CREATING, CANCELLING ou un paiement avant la mise à jour locale. Les opérations idempotentes permettent la reprise, mais aucun worker automatique de réconciliation n'est implémenté. Le frontend ne fournit pas Idempotency-Key et ne doit pas relancer aveuglément un achat après un timeout. Auth central est un point de dépendance ; l'authentification fédérée/JWT et une outbox avec messages persistants seraient des évolutions. Aucun paiement réel n'est effectué. Le bouton de simulation de transport est réservé au propriétaire dans cette démo ; en production, seul un opérateur ou un transporteur autorisé ferait ces transitions.

## Q6 - Migration progressive (Strangler Fig)
1. Inventorier les contrats et figer une base de tests sur les mocks. Le dépôt contient des simulations, pas un monolithe backend exécutable : cette migration est une stratégie proposée, pas une bascule de production prétendument réalisée.
2. Extraire Catalog en lecture seule, copier et comparer les références et prix, basculer CATALOG à rest. Conserver les identifiants.
3. Extraire Auth et établir la correspondance des utilisateurs/sessions. Ne pas accepter les jetons mock dans le backend réel.
4. Préparer Inventory, reprendre les stocks et définir un instant de coupure des écritures : un seul propriétaire du stock pour chaque cohorte. Une double écriture non atomique serait dangereuse.
5. Déployer Orders avec Catalog/Inventory/Auth déjà disponibles ; migrer ensemble les étapes Payments/Shipping d'un même parcours d'achat. Activer les flags par cohorte et contrats compatibles. Ne pas associer des commandes mock à des paiements REST.
6. Faire des lectures miroir, des tests de contrat et du canary traffic, comparer erreurs/latence/totaux et tracer les corrélations. Ne pas rejouer une écriture réelle en mode miroir.
7. Revenir sur le routage uniquement quand les données et états restent compatibles ; réconcilier les écritures avant rollback. Jamais de fallback automatique vers le mock après l'échec d'un paiement ou d'une réservation.
8. Retirer progressivement les anciennes routes et simulations après validation. En production, une gateway/anti-corruption layer assure le routage stable pendant cette transition. Les flags de backend.js représentent le point d'intégration local prévu par le professeur.
