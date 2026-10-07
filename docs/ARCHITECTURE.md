# ZAFF — Architecture et conventions (backend)

> Mémoire du projet : à lire avant toute modification. À mettre à jour quand une règle change.

## Produit
ERP + caisse pour boutiques de matériel informatique / high-tech (Afrique de l'Ouest, devise par défaut « F CFA »).
Une boutique s'inscrit, gère son équipe, met ses appareils en stock **à l'unité par N° de série / IMEI**
et vend **en scannant** l'appareil. Le propriétaire suit en temps réel les ventes de ses vendeurs.
Priorité absolue : une expérience simple et compréhensible (UI et messages d'erreur en français).

## Bases de données (MongoDB)
**Base globale** `zaff_global` (connexion `GLOBAL_CONNECTION`) — collections communes à toute la plateforme :
- `establishments` : boutiques (slug, `databaseName`, statut active/suspended, devise).
- `user_directory` : annuaire identifiant (téléphone normalisé / e-mail) → boutique + id du compte.
  Sert UNIQUEMENT à résoudre la boutique à la connexion. Tenu à jour par `DirectoryService.syncUser/removeUser`
  (création de boutique, création / modification / suppression d'un collaborateur, connexion d'un ancien compte).
- `reference_categories` : catalogue de référence (catégories + marques usuelles), seedé au démarrage, en cache 10 min.
- `super_admins` : administrateurs de la plateforme (pas encore de connexion dédiée).

**Une base par boutique** `zaff_tenant_<slug>` (via `TenantConnectionService.getModel(db, name, schema)`) :
users, products, product_units, sales, sale_returns, stock_movements, customers, suppliers, purchase_orders,
repairs, warranties, categories, brands, notifications.
Jamais de donnée d'une boutique dans une autre ; toujours passer `@CurrentTenant('databaseName')` aux services.

## Rôles (`common/enums/role.enum.ts`)
- `admin` = propriétaire : tout. `seller` = vendeur : vend (scan / caisse), voit le stock, ses propres ventes.
- `storekeeper` = magasinier : modèles, mise en stock par scan, mouvements, fournisseurs.
- `superadmin` = plateforme. L'ancien rôle `standard` = vendeur (`normalizeRole`).
- Les permissions sont **appliquées côté serveur** (`RolesGuard` + `@Roles`) ; le menu du frontend n'est qu'un confort.
- `/global/establishments` : seul `POST` (inscription) est public ; le reste est réservé au superadmin.

## Stock à l'unité (N° de série)
- `Product` = modèle (catégorie, marque, nom, modèle, couleur, code-barres EAN de la boîte, prix).
- `ProductUnit` = appareil physique, `serialNumber` **unique** dans la boutique, statut `in_stock | sold | defective`.
- Pour un produit `hasSerialNumbers`, `stockQuantity` = nombre d'unités `in_stock` : il ne bouge QUE par
  `/units` (mise en stock), la vente, un retour, ou le passage défectueux ↔ en stock. Mouvements manuels et
  réceptions fournisseurs refusés / ignorés pour ces produits.
- Vente : réservation **atomique** (`findOneAndUpdate` sur `status: in_stock`) + décrément conditionnel du stock,
  avec rollback de tout ce qui a été fait si une ligne échoue. Ne jamais remplacer par un « lire puis écrire ».
- Un code scanné est résolu par `GET /units/lookup/:code` : N° de série d'une unité, sinon code-barres d'un modèle.

## Temps réel (Socket.IO, namespace `/realtime`)
- Auth : `handshake.auth.token` = JWT de l'utilisateur. Salons : `t:<db>`, `t:<db>:r:<rôle>`, `u:<userId>`.
- Événements serveur → client :
  - `notification` : `{ id, type, title, message, level, data, createdAt, read }` (persistée dans `notifications`, TTL 60 j).
  - `data:invalidate` : `{ scopes: DataScope[] }` → le frontend invalide les requêtes React Query correspondantes.
  - `presence` : liste des collaborateurs connectés (envoyée au propriétaire). `presence:get` (ack) pour la demander.
- Émettre depuis les services via `NotificationsService.notify()` / `.invalidate()` (jamais de socket dans le métier).
- Contrôleurs CRUD : décorateur `@Invalidates('products', …)` → `InvalidateInterceptor` diffuse après succès.
- Types d'événements actuels : `sale.created` (→ admin), `units.added` (→ admin), `stock.low` (→ admin, storekeeper).
- Présence en mémoire : une seule instance. Pour plusieurs instances, ajouter l'adaptateur Redis de Socket.IO.

## Conventions
- Réponses HTTP enveloppées `{ success, data, timestamp }` (`TransformInterceptor`) ; erreurs `{ success:false, message, details? }`.
- Messages d'erreur métier en français, compréhensibles par un vendeur (« L'appareil X a déjà été vendu (facture #1001) »).
- Téléphones normalisés avec `normalizePhone` / `normalizeIdentifier` (`common/utils/identifier.ts`) avant stockage.
- Port 8000 par défaut, préfixe `/api`, Swagger sur `/api/docs`.

## Vérifier un changement
- `npx tsc --noEmit -p tsconfig.json` puis `npm run build`
- `npx jest` : stock à l'unité / vente par scan / notifications (modèles en mémoire, `src/testing/fake-model.ts`)
  et WebSocket réel (auth, cloisonnement par boutique, présence).
- `npm run test:boot` : démarre toute l'app sans MongoDB (connexion simulée) : injection, routes, WebSocket.
- Le lint (prettier) signale de nombreux écarts de formatage antérieurs : ne pas reformater tout le dépôt dans un changement fonctionnel.
