# ZAFF — Architecture et conventions (backend)

> Mémoire du projet : à lire avant toute modification. À mettre à jour quand une règle change.

## Produit
ERP + caisse pour boutiques de matériel informatique / high-tech (Afrique de l'Ouest, devise par défaut « F CFA »).
Une boutique s'inscrit, gère son équipe, met ses appareils en stock **à l'unité par N° de série / IMEI**
et vend **en scannant** l'appareil. Le propriétaire suit en temps réel les ventes de ses vendeurs.
Priorité absolue : une expérience simple et compréhensible (UI et messages d'erreur en français).

## Bases de données (MongoDB)
**Base globale** `zaff_global` (connexion `GLOBAL_CONNECTION`) — collections communes à toute la plateforme :
- `establishments` : boutiques (slug interne généré, `databaseName`, statut, pays `countryCode`, ville, commune,
  devise `currency` = symbole affiché + `currencyCode` ISO).
- `user_directory` : annuaire identifiant (téléphone normalisé / e-mail) → boutique + id du compte.
  Sert UNIQUEMENT à résoudre la boutique à la connexion. Tenu à jour par `DirectoryService.syncUser/removeUser`
  (création de boutique, création / modification / suppression d'un collaborateur, connexion d'un ancien compte).
- `catalog_images` : **base d'images produits partagée par toutes les boutiques** (marque, modèle, couleur, clés
  normalisées, fichier ≤ 600 Ko, empreinte sha256 anti-doublon, boutique qui l'a ajoutée, compteur d'utilisation).
- `reference_categories` : catalogue de référence (catégories + marques usuelles), seedé au démarrage, en cache 10 min.
- `global_devices` : **catalogue global des appareils** (catégorie, marque, modèle, capacités, coloris, photos par coloris,
  photo par défaut), tenu par l'administrateur de la plateforme, seedé au 1er démarrage depuis `device-catalog.ts`.
- `device_requests` : **demandes d'ajout** — modèles saisis par des boutiques et absents du catalogue (une par marque + modèle,
  nombre de boutiques, coloris / capacités vus, statut `open | added | dismissed`).
- `super_admins` : réservé (l'administrateur de la plateforme se connecte avec les identifiants de l'environnement).

**Une base par boutique** `zaff_tenant_<slug>` (via `TenantConnectionService.getModel(db, name, schema)`) :
users, products, product_units, sales, sale_returns, stock_movements, customers, suppliers, purchase_orders,
repairs, warranties, categories, brands, notifications, push_subscriptions, cash_closings, product_returns, credit_notes,
sales_contract_versions.
Paramètres de la boutique (dont `settings.returnPolicy`, `settings.salesContract`) : dans `establishments` (base globale), chargés à chaque requête par `TenantGuard`.
Jamais de donnée d'une boutique dans une autre ; toujours passer `@CurrentTenant('databaseName')` aux services.

## Pays, téléphones, inscription
- **Données géographiques** (`src/common/geo/`) : 245 pays (libphonenumber) avec indicatif, drapeau, devise ISO +
  symbole (`F CFA`, `₦`…), villes principales des 54 pays africains, communes / arrondissements des grandes villes.
  **Abidjan : commune obligatoire** (`communeRequired`). Pays sans liste : ville saisie librement.
  API publique en cache 24 h : `GET /global/geo/countries`, `GET /global/geo/countries/:code/cities`.
- **Téléphones au format international E.164** (`toE164(numéro, pays)`, `normalizeIdentifier`) : le pays choisi donne
  l'indicatif, libphonenumber vérifie la longueur (Côte d'Ivoire : 10 chiffres, le 0 est conservé). Un numéro est donc
  unique **par pays** (07 51… en CI ≠ 07 51… en France). E-mails en minuscules.
- **Unicité** d'un numéro et d'un e-mail sur toute la plateforme via `user_directory` (inscription et collaborateurs) ;
  conflits renvoyés en 409 avec `details.code` `PHONE_TAKEN` / `EMAIL_TAKEN` (le frontend ouvre une fenêtre dédiée).
- **Inscription** `POST /global/establishments` (`RegistrationService`) : tout est validé côté serveur (pays, ville
  de la liste, commune, numéro valide, e-mail obligatoire, mot de passe ≥ 8 caractères avec lettre et chiffre),
  **aucune valeur par défaut**, annulation complète si une étape échoue, réponse sans informations internes.
  `POST /global/establishments/check` : numéro / e-mail valides et libres (vérification en direct).
- **Connexion** : `identifier` = e-mail, ou numéro + `countryCode` (le pays donne l'indicatif).

## Rôles (`common/enums/role.enum.ts`)
- `admin` = propriétaire : tout. `seller` = vendeur : vend (scan / caisse), voit le stock, ses propres ventes.
- `storekeeper` = magasinier : modèles, mise en stock par scan, mouvements, fournisseurs.
- `superadmin` = plateforme. L'ancien rôle `standard` = vendeur (`normalizeRole`).
- Les permissions sont **appliquées côté serveur** (`RolesGuard` + `@Roles`) ; le menu du frontend n'est qu'un confort.
- `/global/establishments` : seul `POST` (inscription) est public ; le reste est réservé au superadmin.

## Stock à l'unité (N° de série)
- `Product` = modèle (catégorie, marque, nom, modèle, couleur, code-barres EAN de la boîte, prix).
- `ProductUnit` = appareil physique, `serialNumber` **unique** dans la boutique, statut `in_stock | sold | defective | in_repair`.
- Pour un produit `hasSerialNumbers`, `stockQuantity` = nombre d'unités `in_stock` : il ne bouge QUE par
  `/units` (mise en stock), la vente, un retour, ou le passage défectueux ↔ en stock. Mouvements manuels et
  réceptions fournisseurs refusés / ignorés pour ces produits.
- Vente : réservation **atomique** (`findOneAndUpdate` sur `status: in_stock`) + décrément conditionnel du stock,
  avec rollback de tout ce qui a été fait si une ligne échoue. Ne jamais remplacer par un « lire puis écrire ».
- Un code scanné est résolu par `GET /units/lookup/:code` : N° de série d'une unité, sinon code-barres d'un modèle.

## Retours, avoirs et garantie (`/returns`, `/credit-notes`, `/settings/return-policy`)
- **Politique configurée par le propriétaire** (`settings/return-policy.ts`, valeurs par défaut + `resolveReturnPolicy`) :
  délai de retour, conditions à cocher, solutions autorisées (avoir / remboursement / échange), frais de remise en stock,
  modes de remboursement, validité des avoirs ; pour les pannes : délai d'échange, garantie par défaut, réparation
  sous garantie, réparation payante hors garantie. Le vendeur applique seulement ce qui est proposé.
- **Règles** : fonction pure `evaluateReturn` (`returns/return-rules.ts`), utilisée par `GET /returns/lookup/:serial`
  (affichage) et **réappliquée** par `POST /returns` (le client ne peut pas forcer une option).
- Effet sur l'appareil (réservation atomique `status: sold`) :
  - changement d'avis → `in_stock`, stock +1 (revendable) ;
  - panne dans le délai d'échange (échange / avoir / remboursement) → `defective` (propriété boutique, hors stock)
    + ticket SAV `ownership: shop` ; réparé → notification `repair.ready`, remise en vente manuelle (Numéros de série) ;
  - réparation sous garantie / payante → `in_repair` (appareil du client, hors stock) + ticket SAV `ownership: customer` ;
    ticket passé à `returned` → l'appareil redevient `sold`.
- **Avoirs** `AV-<n>` (séquence `number`) : utilisables à la vente (`creditNoteCode`), débit atomique du solde, vente
  entièrement annulée si l'avoir est invalide / expiré / déjà utilisé. Échange = avoir utilisé tout de suite.
- **Caisse** : la part d'une vente payée par avoir n'est pas comptée comme encaissée ; les remboursements donnés par
  le collaborateur sont déduits de ses espèces / Mobile Money à remettre (`refunds` dans la clôture).
- Tableau de bord : retours de la période déduits (`sales.returns`, `sales.netRevenue`).

## Contrat de vente et garantie (`contracts/`)
- Remis au client **après chaque vente** : `GET /sales/:id/contract` (propriétaire, vendeur) renvoie le document prêt à
  imprimer (identification vendeur / client / produits, articles numérotés, fiche de garantie). Le frontend l'affiche et l'imprime.
- **Modèle par défaut** (`contract-template.ts`, inspiré du contrat OTTAZIA : 35 articles) + article « Retour, échange
  et panne » **généré depuis la politique de retour** : le contrat dit exactement ce que l'application applique.
  Variables : `{{boutique}}` (dénomination sociale sinon nom), `{{garantie}}`, `{{pays}}`, `{{droit}}`, `{{loi}}`
  (loi n° 2016-412 pour la Côte d'Ivoire, formulation neutre ailleurs). Texte : paragraphes, puces « - ».
- **Personnalisation** (propriétaire) `GET/PUT /settings/sales-contract` : informations légales (raison sociale, forme,
  RCCM, N° contribuable, représentant), titre, introduction, mode `default` | `custom` (articles activés / modifiés /
  ajoutés ; vendeur, client, produit toujours présents), fiche de garantie. `POST /settings/sales-contract/preview` :
  aperçu d'un brouillon avec une vente fictive.
- **Versions figées** : chaque enregistrement crée une version (`sales_contract_versions`, `effectiveFrom`) ; une vente
  est imprimée avec le texte en vigueur le jour de la vente (sans version antérieure : modèle par défaut).
- Garantie d'un appareil : `effectiveWarrantyEnd` (`returns/return-rules.ts`) = garantie enregistrée à la vente, sinon
  garantie par défaut de la politique — **même règle que les retours**. État (`condition` neuf / reconditionné /
  occasion) et `accessories` sur le modèle `Product`.
- **QR code de vérification** : chaque ligne du contrat porte `verifyCode` = base64url(boutique · vente · ligne) +
  signature HMAC-SHA256 tronquée (clé dérivée de `JWT_SECRET`, `warranty-code.ts`) : infalsifiable, sans donnée
  personnelle. `GET /public/warranty/:code` (**public**, sans connexion, `no-store`) : statut `active | expired | none |
  returned`, appareil `with_customer | in_repair | returned`, jours restants, appareil (N° de série masqué), boutique.
  Jamais le client ni le prix. Changer `JWT_SECRET` invalide les QR déjà imprimés.

## Administrateur de la plateforme (`/platform/*`)
- Identifiants **uniquement dans l'environnement** : `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD` (≥ 12 caractères en
  production, ou empreinte bcrypt `$2…`). Sans eux, la connexion admin est désactivée.
- `POST /platform/auth/login { email, password }` (`PlatformAuthService`) : comparaison en temps constant, 5 échecs → IP
  bloquée 15 min ; jeton `platform: true`, rôle `superadmin`, valable 12 h. `GET /platform/auth/me`.
- `PlatformAdminGuard` : jeton plateforme ET e-mail = celui de l'environnement. `TenantGuard` **refuse** un jeton plateforme :
  l'administrateur ne lit jamais les données d'une boutique ; un jeton de boutique n'accède jamais à `/platform/*`.

## Catalogue global des appareils (`devices/`)
- `GET /global/reference/devices` (connecté, cache 5 min) : profils par catégorie (`device-catalog.ts` : libellé de variante,
  capacités, couleurs, accessoires, garantie usuelle) + `models[catégorie][marque] = [{ id, name, variants, colors, photos,
  imageId }]` lus dans `global_devices` (appareils actifs). Le formulaire produit en fait des suggestions ; toute valeur peut
  encore être tapée (appareil inconnu = produit sans photo).
- Administration `/platform/devices` (PlatformAdminGuard) : liste (recherche, catégorie, avec / sans photo), `stats`, CRUD,
  `POST /:id/photos` (multipart `file` + `thumb` + `color?`), `PATCH /:id/photos/:imageId/default`, `DELETE /:id/photos/:imageId`,
  `reports` (photos signalées / masquées) avec `keep` et suppression, `usage` (stockage).
- Un produit de boutique garde `deviceId` (appareil global) et `imageId` (photo choisie parmi celles de l'appareil).
  Attention : dans un produit, le modèle est dans **`name`** (« Samsung Galaxy A55 5G ») et `model` = capacité (« 256 Go »).
- **Fiche technique** `specs [{ label, value }]` (≤ 30 lignes) saisie par l'admin, renvoyée dans le catalogue des boutiques.
- **Lien produits ↔ catalogue** (`DeviceUsageService`, ne bloque jamais l'enregistrement d'un produit, appelé en arrière-plan
  par `CatalogService` après création / modification) :
  - appareil reconnu (par `deviceId`, sinon marque + `name` normalisés) → `deviceId` posé, boutique ajoutée à `shops`
    (bases, **jamais renvoyées**) / `shopCount` ; produit sans photo → photo de son coloris (sinon par défaut) rattachée ;
  - modèle inconnu → demande d'ajout (`device_requests`) ; `POST /platform/device-requests/:id/accept` crée l'appareil
    (fiche corrigée par l'admin), rattache les produits des boutiques concernées ; `dismiss`, `reopen` ;
  - photo ajoutée par l'admin → `propagate` : les produits **sans photo** de cet appareil la reçoivent (jamais de
    remplacement d'une photo déjà choisie) + `data:invalidate products` vers la boutique ;
  - **recalcul complet** `sync()` toutes les 6 h et `POST /platform/devices/sync` (bouton « Mettre à jour ») : anciens produits
    rattachés, produits supprimés décomptés, demandes sans boutique retirées, photos manquantes transmises.
- **Doublons** : `POST /platform/device-requests/:id/merge { deviceId }` → l'écriture de la demande devient un alias de
  l'appareil (`aliases` « marque|modèle » normalisés, reconnus ensuite par le suivi) et ses produits y sont rattachés.
- **Photo transmise** → notification `catalog.photo` (→ admin, storekeeper) à chaque boutique concernée.
- **Prix pratiqué** `prices [{ currency, variant, variantKey, median, shops }]` recalculé par `sync()` : un prix par
  boutique (sa médiane), puis médiane des boutiques, par devise ISO (`currencyCode`) et capacité (+ toutes capacités) ;
  publié seulement à partir de **3 boutiques** (`MIN_SHOPS_FOR_PRICE`), jamais de prix individuel. La session renvoie
  `establishment.currencyCode`.
- **Contrat** : chaque ligne porte `specs` (fiche technique de l'appareil, 8 lignes max, `DevicesService.specsFor`).
- Tri `GET /platform/devices?sort=popular` (les plus utilisés d'abord) ; `stats` : `usedDevices`, `usedWithPhotos`, `requests`.

## Images produits partagées (`/global/images`) — UploadThing, sans fichier orphelin
- **Stockage** (`media-storage.ts`, jeton `MEDIA_STORAGE`) : **UploadThing** si `UPLOADTHING_TOKEN` est défini (envoi
  côté serveur avec `UTApi`, après nos vérifications ; `customId` = `zaff-<sha256>`), sinon dans MongoDB (développement,
  `dev:memory`). La fiche garde `storage`, `storageKey`, `url`.
- `GET /global/images?brand&model&color&category` (connecté) : photos du modèle, toutes boutiques, la couleur demandée
  d'abord puis les plus utilisées ; jamais les photos encore « en attente ». Clé du modèle **sans la marque en tête**
  (`modelKeyOf` : « Samsung Galaxy A55 » = « Galaxy A55 »). `GET /global/images/:id/file` : **public** (balise `<img>`) —
  redirection vers le CDN UploadThing, ou fichier servi depuis MongoDB (cache 1 an).
- **Seul l'administrateur de la plateforme envoie des photos** (`POST /global/images` et `/platform/devices/:id/photos`,
  PlatformAdminGuard) : les boutiques ne photographient plus leurs produits, elles choisissent une photo du catalogue. Vrai
  type vérifié par les premiers octets (JPEG / PNG / WebP, pas de SVG), 600 Ko max, une même photo stockée une fois.
  Si la fiche ne peut pas être créée après l'envoi, le fichier UploadThing est supprimé.
- **Cycle de vie (aucune photo orpheline)** :
  - photos d'appareil envoyées par l'admin avec `library: true` + `deviceId` (gardées même sans produit) ; retirer une photo
    d'un appareil l'efface, ou la masque seulement si des produits l'utilisent encore (`adminRemove`) ;
  - enregistrer le produit la rattache (`attach` : `usage + 1`, `pending: false`) ; photo inexistante → 400 ;
  - produit modifié avec une autre photo, photo retirée, produit supprimé → `release` de l'ancienne : si plus aucun produit
    ne l'utilise et qu'elle n'est pas en photothèque, **effacée chez UploadThing et dans la base** ;
  - **filet de sécurité toutes les heures** (`cleanup`) : photos en attente depuis plus d'1 h supprimées, et fichiers
    `zaff-…` présents chez UploadThing sans fiche supprimés (les autres fichiers du compte ne sont jamais touchés).
- **Signalement** `POST /global/images/:id/report` (boutique) : 3 boutiques différentes → photo masquée, à revoir par
  l'administrateur (garder ou retirer).
- `Product.imageId` : photo choisie (rattachée / libérée par `CatalogService`).

## Clôture de caisse (`/cash-closings`)
- Chaque vente porte `sellerId` et `closingId` (null tant qu'elle n'est pas clôturée).
- `GET /cash-closings/current` : ma caisse en cours (totaux par mode de paiement calculés par le serveur).
- `POST /cash-closings { declaredCash, notes }` : rattache **en une seule écriture** toutes mes ventes non clôturées
  (`updateMany closingId: null → id`) puis calcule les totaux sur ce lot : une vente n'est jamais comptée deux fois,
  une vente faite pendant la clôture part dans la suivante, deux clôtures simultanées sont impossibles.
  Écart = espèces comptées − espèces attendues (négatif = il manque de l'argent).
- `GET /cash-closings/open` (propriétaire) : caisses encore ouvertes par vendeur. `PATCH /:id/validate` : réception confirmée.
- Notifications : `cash.closed` (→ admin, `warning` s'il y a un écart), `cash.validated` (→ le vendeur concerné via `userIds`).

## Temps réel (Socket.IO, namespace `/realtime`)
- Auth : `handshake.auth.token` = JWT de l'utilisateur. Salons : `t:<db>`, `t:<db>:r:<rôle>`, `u:<userId>`.
- Événements serveur → client :
  - `notification` : `{ id, type, title, message, level, data, createdAt, read }` (persistée dans `notifications`, TTL 60 j).
  - `data:invalidate` : `{ scopes: DataScope[] }` → le frontend invalide les requêtes React Query correspondantes.
  - `presence` : liste des collaborateurs connectés (envoyée au propriétaire). `presence:get` (ack) pour la demander.
- Émettre depuis les services via `NotificationsService.notify()` / `.invalidate()` (jamais de socket dans le métier).
- Contrôleurs CRUD : décorateur `@Invalidates('products', …)` → `InvalidateInterceptor` diffuse après succès.
- Types d'événements actuels : `sale.created` (→ admin, avec le mode de paiement), `units.added` (→ admin),
  `catalog.photo` (→ admin, storekeeper : photo officielle ajoutée aux produits),
  `stock.low` (→ admin, storekeeper), `cash.closed` (→ admin), `cash.validated` (→ vendeur),
  `return.created` (→ admin, + storekeeper si atelier), `repair.ready` (→ admin, storekeeper).
- Une notification vise des rôles (`roles`) et/ou des personnes (`userIds`, salon `u:<userId>`).

## Notifications push (Web Push, `PushService`)
- Chaque `notify()` est aussi envoyé en push (en arrière-plan) aux appareils abonnés des destinataires : le patron
  est prévenu même application fermée. Abonnements par appareil dans `push_subscriptions` (supprimés si expirés 404/410).
- Clés VAPID **dans l'environnement** (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), générées par
  `npm run vapid:generate` ; sans elles le push est désactivé (le reste fonctionne). La clé publique est servie par
  `GET /notifications/push/config`.
- Présence en mémoire : une seule instance. Pour plusieurs instances, ajouter l'adaptateur Redis de Socket.IO.

## Conventions
- Réponses HTTP enveloppées `{ success, data, timestamp }` (`TransformInterceptor`) ; erreurs `{ success:false, message, details? }`.
- Messages d'erreur métier en français, compréhensibles par un vendeur (« L'appareil X a déjà été vendu (facture #1001) »).
- Téléphones stockés au format E.164 (`toE164` / `normalizeIdentifier`), jamais tels que saisis.
- Port 8000 par défaut, préfixe `/api`, Swagger sur `/api/docs`.
- **Aucun secret dans le code.** Configuration lue uniquement depuis l'environnement et validée au démarrage
  (`src/config/env.validation.ts`) : `MONGODB_URI` et `JWT_SECRET` obligatoires (JWT ≥ 32 caractères en
  production), sinon l'app refuse de démarrer. En local : copier `.env.example` en `.env` (ignoré par git).
  Lire la config avec `getOrThrow`, jamais de valeur de repli pour un secret. `UPLOADTHING_TOKEN` (facultatif) : stockage
  des photos chez UploadThing (Dashboard > API Keys > V7) ; sans lui, photos dans MongoDB.
- ⚠️ Un ancien mot de passe MongoDB et un ancien secret JWT figurent dans l'historique git (avant cette règle) :
  à changer dans Atlas et à régénérer avant la mise en production.

## Vérifier un changement
- `npx tsc --noEmit -p tsconfig.json` puis `npm run build`
- `npx jest` : stock à l'unité / vente par scan / notifications (modèles en mémoire, `src/testing/fake-model.ts`)
  et WebSocket réel (auth, cloisonnement par boutique, présence).
- `npm run test:boot` : démarre toute l'app sans MongoDB (connexion simulée) : injection, routes, WebSocket.
- `npm run dev:memory` : le **vrai** backend (contrôleurs, gardes, validation, services, WebSocket) sur une base en
  mémoire (`test/memory-server.ts`, données de démo, comptes +2250700000001/2/3 mot de passe « secret »). Sert aux
  démonstrations et aux tests navigateur sans MongoDB. Si un service utilise un opérateur Mongo non géré par
  `src/testing/fake-model.ts`, l'ajouter au fake (il échoue explicitement plutôt que de répondre faux).
- Le lint (prettier) signale de nombreux écarts de formatage antérieurs : ne pas reformater tout le dépôt dans un changement fonctionnel.
