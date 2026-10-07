import { ReturnPolicy } from '../settings/return-policy';

/**
 * Contrat de vente, garantie commerciale et conditions de SAV remis au client après chaque vente.
 *
 * Chaque boutique utilise le modèle par défaut (ci-dessous) ou le personnalise dans ses paramètres :
 * informations légales (RCCM, N° contribuable…), titre, introduction, articles (activer / désactiver,
 * modifier le texte, en ajouter). Les blocs d'identification (vendeur, client, produit) et l'article
 * « Retour et échange » sont remplis automatiquement à partir de la vente et de la politique de retour :
 * le contrat dit toujours exactement ce que l'application applique.
 *
 * Texte d'un article : paragraphes séparés par une ligne vide, puces commençant par « - ».
 * Variables : {{boutique}} {{garantie}} {{pays}} {{droit}} {{loi}}.
 */

export type ArticleKind = 'text' | 'seller' | 'customer' | 'product' | 'returns';

export interface ContractArticle {
  id: string;
  title: string;
  body: string;
  enabled: boolean;
  kind: ArticleKind;
}

export interface ContractLegal {
  /** Dénomination sociale (sinon le nom de la boutique) */
  legalName: string;
  /** Forme juridique : SARL, SA, Entreprise individuelle… */
  legalForm: string;
  activity: string;
  rccm: string;
  taxId: string;
  /** Représentant qui signe : « Nom, Gérant » */
  representative: string;
}

export interface ContractSettings {
  mode: 'default' | 'custom';
  legal: ContractLegal;
  title: string;
  subtitle: string;
  intro: string;
  /** Articles personnalisés (mode « custom ») */
  articles: ContractArticle[];
  /** Fiche de garantie détachable à la fin du contrat */
  warrantyCard: boolean;
  version: number;
  updatedAt: string | null;
}

export const PLACEHOLDERS = ['boutique', 'garantie', 'pays', 'droit', 'loi'] as const;

const a = (id: string, title: string, body: string, kind: ArticleKind = 'text'): ContractArticle => ({ id, title, body, enabled: true, kind });

export const DEFAULT_ARTICLES: ContractArticle[] = [
  a('seller', 'Identification du vendeur', '', 'seller'),
  a('customer', 'Identification du client', '', 'customer'),
  a('product', 'Identification du produit', '', 'product'),
  a(
    'purpose',
    'Objet du contrat',
    `Le présent contrat a pour objet de définir :
- les conditions de vente du produit ;
- les conditions de la garantie commerciale accordée par {{boutique}} ;
- les conditions de prise en charge d'un produit présentant une anomalie pendant la période de garantie ;
- les conditions applicables aux réparations sollicitées par le Client après l'expiration de la garantie commerciale ;
- les responsabilités respectives du Vendeur et du Client ;
- les conditions relatives à la disponibilité des pièces détachées ;
- les conditions relatives au diagnostic, au devis, à la réparation et à la restitution du matériel.

Le présent contrat est établi dans le respect des dispositions impératives applicables {{droit}} en matière de protection du consommateur.`,
  ),
  a(
    'information',
    'Information du client',
    `{{boutique}} s'engage à fournir au Client une information claire et compréhensible concernant les caractéristiques essentielles du produit, son prix, ses accessoires, les conditions de garantie et, lorsque cela est applicable, les conditions du service après-vente.

Le Client reconnaît avoir eu la possibilité de prendre connaissance des caractéristiques essentielles du produit avant son achat.

Lorsque le produit est vendu comme produit d'occasion ou reconditionné, son état est indiqué au Client avant la conclusion de la vente.`,
  ),
  a(
    'warranty',
    'Garantie commerciale',
    `{{boutique}} accorde au Client une garantie commerciale d'une durée de {{garantie}}, à compter de la date figurant sur la facture ou le document de vente.

Cette garantie commerciale couvre uniquement les défauts expressément couverts par les conditions de garantie du produit.

Pendant la période de garantie commerciale, le Client doit présenter, dans la mesure du possible :
- la facture ou preuve d'achat ;
- le présent document ;
- le produit concerné ;
- les accessoires nécessaires au diagnostic lorsque ceux-ci sont concernés par le dysfonctionnement.

La prise en charge au titre de la garantie est effectuée après diagnostic du matériel.`,
  ),
  a(
    'legal-warranty',
    'Garanties légales',
    `La garantie commerciale accordée par {{boutique}} constitue une garantie contractuelle supplémentaire et ne doit pas être interprétée comme supprimant ou limitant les droits dont le Client pourrait bénéficier en vertu des dispositions légales impératives applicables.

En conséquence, l'expiration de la garantie commerciale ne signifie pas nécessairement que toute responsabilité légale du Vendeur disparaît automatiquement.

Les droits du consommateur résultant des dispositions légales applicables demeurent applicables dans les limites et conditions prévues par ces dispositions.

Aucune disposition du présent contrat ne peut avoir pour objet ou pour effet de priver le consommateur d'un droit auquel la loi lui reconnaît impérativement droit.`,
  ),
  a('returns', 'Retour, échange et panne constatée après l\'achat', '', 'returns'),
  a(
    'exclusions',
    'Exclusions de la garantie commerciale',
    `Sauf disposition légale contraire, la garantie commerciale ne couvre notamment pas les dommages résultant :
- d'un choc ou d'une chute ;
- d'une casse physique ;
- de l'utilisation incorrecte ou non conforme du produit ;
- de l'utilisation d'un chargeur, adaptateur ou accessoire incompatible ;
- d'une surtension électrique ou d'une alimentation électrique défectueuse ;
- d'un incendie, d'une inondation ou d'un sinistre ;
- de l'exposition à un liquide ou à l'humidité ;
- de l'oxydation ;
- d'une intervention effectuée par une personne ou une entreprise non autorisée lorsque cette intervention est à l'origine du dommage ;
- de la modification du matériel ;
- de l'installation de composants incompatibles ;
- de la suppression, modification ou détérioration du numéro de série ou de tout élément permettant d'identifier le matériel ;
- d'un virus, logiciel malveillant ou programme informatique lorsque celui-ci n'est pas imputable au vendeur ;
- de la perte ou de la corruption de données ;
- d'une utilisation contraire aux recommandations du fabricant ;
- de l'usure normale des composants et consommables ;
- de tout dommage résultant d'une cause extérieure au produit.

Cette liste ne fait pas obstacle aux droits impératifs reconnus au Client par la législation applicable.`,
  ),
  a(
    'wear',
    "Batteries, chargeurs et composants d'usure",
    `Les batteries, chargeurs, câbles, claviers, souris, ventilateurs, disques de stockage et autres composants peuvent être soumis à une usure naturelle liée à leur utilisation.

Lorsqu'un composant présente une défaillance résultant de son usure normale et que cette situation n'est pas couverte par la garantie commerciale applicable, son remplacement peut être effectué dans le cadre d'une prestation de réparation payante.

Les conditions particulières applicables à certains composants peuvent être précisées sur la facture ou le bon de garantie.`,
  ),
  a(
    'warranty-end',
    'Fin de la garantie commerciale',
    `À l'expiration de la garantie commerciale, les interventions sollicitées par le Client auprès de {{boutique}} constituent, sauf disposition légale contraire, des prestations de service après-vente hors garantie.

Ces prestations sont distinctes de la garantie commerciale initiale. Elles sont facturées au Client conformément au devis ou au tarif applicable au moment de l'intervention.

L'expiration de la garantie commerciale n'interdit pas au Client de solliciter {{boutique}} pour effectuer un diagnostic ou une réparation.

Toutefois, le Client demeure libre de confier son matériel à un autre réparateur de son choix, sous réserve des conséquences éventuelles que cette intervention pourrait avoir sur les garanties encore applicables au produit.`,
  ),
  a(
    'after-warranty-repair',
    'Réparation après garantie',
    `Lorsque le Client sollicite {{boutique}} pour réparer un produit après l'expiration de la garantie commerciale, la réparation est effectuée uniquement après :
- réception du matériel ;
- établissement d'un diagnostic ;
- identification de la panne dans la mesure du possible ;
- identification des pièces éventuellement nécessaires ;
- établissement d'un devis lorsque le montant de l'intervention doit être déterminé ;
- acceptation du devis par le Client.

Le Client prend à sa charge les frais de réparation après garantie, notamment :
- les pièces détachées ;
- la main-d'œuvre ;
- les frais de diagnostic lorsqu'ils sont prévus ;
- les frais de transport ou d'expédition lorsqu'ils sont nécessaires ;
- les éventuels frais de commande spéciale de pièces ;
- tout autre coût expressément accepté par le Client.

Aucune réparation payante importante ne sera effectuée sans l'accord préalable du Client sur le devis, sauf accord contraire expressément établi entre les parties.`,
  ),
  a(
    'diagnosis',
    'Diagnostic et devis',
    `Lorsqu'un produit est confié à {{boutique}} pour réparation, un diagnostic peut être nécessaire afin d'identifier l'origine de la panne. Le diagnostic peut révéler une panne différente de celle initialement décrite par le Client.

Lorsque le coût de réparation ne peut pas être déterminé immédiatement, {{boutique}} communique au Client un devis indiquant, dans la mesure du possible :
- la nature de la panne ;
- les opérations envisagées ;
- les pièces à remplacer ;
- le coût des pièces ;
- le coût de la main-d'œuvre ;
- les éventuels frais supplémentaires ;
- le délai estimatif d'intervention.

Le Client reste libre d'accepter ou de refuser le devis.`,
  ),
  a(
    'parts',
    'Disponibilité des pièces détachées',
    `La réparation d'un appareil dépend notamment de la disponibilité des pièces nécessaires.

{{boutique}} ne garantit pas qu'une pièce détachée sera disponible après l'expiration de la garantie commerciale, notamment lorsque :
- le fabricant a cessé la production du modèle ;
- le modèle est ancien ;
- la pièce n'est plus fabriquée ;
- la pièce n'est plus disponible auprès des fournisseurs ;
- la pièce est indisponible sur le marché ;
- le coût ou le délai d'approvisionnement rend la réparation techniquement ou économiquement inadaptée.

Dans ce cas, {{boutique}} informe le Client de la situation dans la mesure des informations dont elle dispose.

L'impossibilité de réparer un appareil en raison de l'indisponibilité d'une pièce ne constitue pas, à elle seule, une obligation pour {{boutique}} de fournir gratuitement un appareil de remplacement.`,
  ),
  a(
    'repair-time',
    'Délai de réparation',
    `Les délais communiqués par {{boutique}} pour les réparations hors garantie sont, sauf engagement écrit contraire, des délais estimatifs.

Ils peuvent varier notamment en fonction :
- de la disponibilité des pièces ;
- du fournisseur ;
- du transport ;
- de la complexité de la panne ;
- de la nécessité de procéder à des tests complémentaires ;
- de la disponibilité des composants.

Lorsqu'une pièce doit être spécialement commandée, le Client est informé, dans la mesure du possible, du délai estimatif correspondant.`,
  ),
  a(
    'quote-refused',
    'Refus du devis',
    `Lorsque le Client refuse le devis proposé, {{boutique}} restitue le matériel dans son état résultant du diagnostic et des opérations éventuellement nécessaires au diagnostic.

Les frais de diagnostic, de démontage, de remontage ou autres frais applicables ne sont dus que lorsqu'ils ont été préalablement portés à la connaissance du Client ou prévus dans les conditions acceptées par celui-ci.

Lorsque la réparation n'est pas réalisée, {{boutique}} n'est pas tenue de garantir le fonctionnement d'un matériel présentant déjà une panne ou ayant fait l'objet d'un diagnostic.`,
  ),
  a(
    'partial-repair',
    'Réparation partielle',
    `Lorsque plusieurs défauts sont constatés sur un appareil, le Client peut accepter la réparation de certains éléments et refuser la réparation d'autres éléments.

Dans cette situation, {{boutique}} informe le Client, dans la mesure du possible, des conséquences éventuelles de la réparation partielle sur le fonctionnement général du matériel.

Le Client reconnaît qu'une réparation partielle peut ne pas permettre de restaurer intégralement les fonctionnalités du matériel.`,
  ),
  a(
    'data',
    'Données personnelles et données du client',
    `Le Client est responsable de la sauvegarde préalable de ses fichiers, documents, photos, vidéos, logiciels et autres données enregistrées sur le matériel. {{boutique}} recommande fortement au Client d'effectuer une sauvegarde avant toute intervention.

Sauf accord écrit spécifique, la prestation de réparation ne constitue pas une prestation de sauvegarde ou de récupération de données.

{{boutique}} ne saurait être tenue responsable de la perte ou de la corruption de données résultant d'une panne, d'une intervention technique nécessaire, d'un remplacement de disque, d'une réinstallation du système ou d'une opération rendue nécessaire par l'état du matériel, sous réserve des dispositions légales impératives applicables et des fautes directement imputables au prestataire.

Lorsque cela est techniquement possible, le Client est invité à retirer ou protéger ses données confidentielles avant de remettre son appareil.`,
  ),
  a(
    'passwords',
    'Mots de passe et accès au matériel',
    `Pour permettre le diagnostic, le Client peut être invité à fournir les informations nécessaires à l'accès au matériel.

Lorsque le Client refuse de fournir ces informations, {{boutique}} peut être dans l'impossibilité d'effectuer certains tests. Le Client peut, lorsque cela est techniquement possible, créer un compte temporaire destiné au diagnostic.

{{boutique}} s'engage à utiliser les informations d'accès communiquées uniquement dans le cadre de l'intervention autorisée par le Client.`,
  ),
  a(
    'customer-duties',
    'Responsabilité du client',
    `Le Client garantit qu'il dispose du droit de remettre le matériel à {{boutique}} pour diagnostic ou réparation.

Le Client doit notamment informer {{boutique}} de tout élément susceptible d'avoir une incidence sur l'intervention, notamment :
- choc antérieur ;
- présence de liquide ;
- réparation précédente ;
- modification du matériel ;
- remplacement de composants ;
- problème électrique ;
- dysfonctionnement intermittent ;
- perte ou corruption de données.

Toute information utile doit être communiquée avant l'intervention.`,
  ),
  a(
    'third-party',
    "Intervention d'un tiers après la garantie",
    `Après expiration de la garantie commerciale, le Client est libre de choisir le réparateur de son choix. {{boutique}} ne peut imposer au Client de faire réparer son matériel exclusivement par ses services lorsque la loi applicable ne prévoit pas une telle obligation.

Toutefois, lorsqu'une garantie légale ou commerciale est encore applicable, une intervention extérieure peut avoir des conséquences sur cette garantie lorsque cette intervention est à l'origine du dommage ou lorsque les conditions de garantie le prévoient légalement.

{{boutique}} ne pourra pas être tenue responsable d'une panne, d'une détérioration ou d'un dysfonctionnement résultant d'une intervention effectuée par un tiers.`,
  ),
  a(
    'own-repairs',
    'Réparations effectuées par le Vendeur après garantie',
    `Lorsqu'une réparation est effectuée par {{boutique}} après expiration de la garantie commerciale, cette réparation constitue une prestation distincte de la vente initiale. Les pièces et la main-d'œuvre sont facturées selon le devis accepté par le Client.

Lorsqu'une garantie particulière est accordée sur la réparation ou sur une pièce remplacée, sa durée et son périmètre sont indiqués sur la facture, le bon de réparation ou le document remis au Client.

Cette garantie sur la réparation ne peut être interprétée comme une nouvelle garantie générale portant sur l'ensemble du matériel.`,
  ),
  a(
    'impossible-repair',
    "Absence d'obligation de réparation lorsque la réparation est impossible",
    `{{boutique}} peut informer le Client qu'une réparation n'est pas techniquement réalisable lorsque, notamment :
- la pièce nécessaire est indisponible ;
- le produit est trop endommagé ;
- le coût de réparation est disproportionné par rapport à la valeur du matériel ;
- le fabricant ou fournisseur ne permet plus l'approvisionnement de la pièce ;
- les conditions techniques nécessaires à la réparation ne sont pas réunies.

Dans ce cas, {{boutique}} communique au Client les informations dont elle dispose afin de lui permettre de prendre une décision.`,
  ),
  a(
    'abandoned',
    'Matériel abandonné',
    `Le Client s'engage à récupérer son matériel dans un délai raisonnable après notification de la fin de l'intervention ou de la disponibilité du matériel. {{boutique}} informe le Client lorsque le matériel est disponible.

En cas de non-retrait prolongé du matériel, {{boutique}} adresse au Client une mise en demeure de le récupérer par tout moyen permettant d'en conserver la preuve.

Les éventuels frais de stockage raisonnables et légalement admissibles peuvent être facturés lorsque le Client a été préalablement informé de ces frais. Toute procédure de disposition ou de vente d'un matériel non récupéré devra respecter les dispositions légales applicables.`,
  ),
  a(
    'deposit',
    'Réserves et produits remis pour diagnostic',
    `Lors du dépôt d'un matériel, {{boutique}} peut établir un état contradictoire ou descriptif du matériel indiquant notamment :
- l'état extérieur ;
- les rayures visibles ;
- les fissures ;
- les accessoires remis ;
- le numéro de série ;
- l'état de fonctionnement constaté lors du dépôt lorsque cela est possible.

Le Client est invité à vérifier les informations figurant sur le bon de dépôt. Le bon de dépôt constitue un élément permettant d'établir l'état du matériel au moment de sa remise.`,
  ),
  a(
    'payment',
    'Paiement',
    `Toute prestation de réparation hors garantie est payable selon les conditions figurant sur le devis ou la facture.

Les pièces spéciales ou commandées spécifiquement pour le Client peuvent faire l'objet d'un paiement préalable ou d'un acompte lorsque cela est indiqué sur le devis. Le paiement d'un acompte ou d'une commande spéciale est soumis aux conditions indiquées sur le devis accepté par le Client.`,
  ),
  a(
    'quote-change',
    'Modification du devis',
    `Si, au cours de la réparation, une panne supplémentaire ou une pièce supplémentaire devient nécessaire et entraîne une augmentation du prix initialement accepté, {{boutique}} en informe le Client dans la mesure du possible.

Une intervention supplémentaire facturable ne sera réalisée qu'après accord du Client, sauf situation prévue expressément dans le devis initial.`,
  ),
  a(
    'liability',
    'Limitation de responsabilité',
    `{{boutique}} ne peut exclure ou limiter les responsabilités qui lui sont imposées par les dispositions légales impératives.

En dehors de ces responsabilités légales, {{boutique}} ne saurait être tenue responsable des dommages qui ne résultent pas directement d'une faute qui lui serait imputable, notamment des pertes de données, pertes d'exploitation ou dommages indirects résultant d'une panne du matériel, sauf lorsque la responsabilité du Vendeur est légalement engagée.

Toute limitation prévue au présent article est interprétée conformément aux dispositions impératives du droit applicable.`,
  ),
  a(
    'used',
    "Produits d'occasion et reconditionnés",
    `Pour les produits d'occasion ou reconditionnés, le Client reconnaît avoir été informé de la nature du produit et de son état général avant la vente.

Les éventuelles marques d'utilisation, traces d'usure ou particularités connues et signalées au Client ne constituent pas nécessairement des défauts cachés.

Les conditions particulières applicables au produit sont indiquées sur la facture, le bon de garantie ou le présent contrat.`,
  ),
  a(
    'proof',
    'Preuve de la vente',
    `La facture, le reçu, le bon de livraison, le bon de garantie, le numéro de série du produit et, lorsque cela est applicable, la preuve de paiement constituent des éléments permettant d'établir la vente.

Le Client doit conserver sa facture ou toute autre preuve d'achat. Le numéro de série enregistré par {{boutique}} lors de la vente permet en outre de retrouver l'achat en cas de perte de la facture.`,
  ),
  a(
    'claims',
    'Réclamations',
    `Toute réclamation doit être adressée à {{boutique}} dans les meilleurs délais après constatation du problème, aux coordonnées indiquées à l'article 1 (téléphone, e-mail ou adresse de la boutique).

{{boutique}} s'engage à examiner les réclamations de manière sérieuse et à apporter une réponse dans un délai raisonnable.`,
  ),
  a(
    'amicable',
    'Règlement amiable des litiges',
    `En cas de différend relatif à la vente ou à la réparation d'un produit, les parties s'efforceront en priorité de rechercher une solution amiable. Le Client peut adresser une réclamation écrite à {{boutique}} afin de permettre l'examen du dossier.

À défaut d'accord amiable, chaque partie conserve le droit d'exercer les recours prévus par la législation applicable.`,
  ),
  a(
    'law',
    'Droit applicable',
    `Le présent contrat est soumis au droit applicable {{droit}}. Les dispositions impératives de protection du consommateur prévalent sur toute stipulation contractuelle contraire.

Le présent contrat est établi en tenant compte des textes législatifs et réglementaires applicables{{loi}}.`,
  ),
  a(
    'severability',
    'Clauses contraires à la loi',
    `Si une disposition du présent contrat devait être déclarée nulle, inapplicable ou contraire à une disposition légale impérative, cette disposition serait écartée dans la mesure nécessaire, sans entraîner automatiquement la nullité de l'ensemble du contrat.

Les autres dispositions demeureraient applicables dans la mesure permise par la loi.`,
  ),
  a(
    'acceptance',
    'Acceptation du client',
    `Le Client déclare :
- avoir pris connaissance des caractéristiques essentielles du produit ;
- avoir été informé du prix du produit ;
- avoir reçu les informations relatives à la garantie ;
- avoir été informé de la durée de la garantie commerciale ;
- avoir pris connaissance des conditions applicables aux réparations hors garantie ;
- avoir compris que les réparations effectuées après expiration de la garantie commerciale sont, sauf disposition légale contraire, payantes ;
- avoir compris que la disponibilité des pièces détachées peut conditionner la possibilité de réparer le produit ;
- avoir compris qu'il demeure libre de choisir un autre réparateur après l'expiration de la garantie commerciale ;
- avoir été informé de l'importance de sauvegarder ses données avant toute intervention ;
- avoir reçu ou accepté de recevoir un exemplaire du présent document.

Le Client reconnaît que la signature du présent document ne constitue pas une renonciation à ses droits légaux impératifs.`,
  ),
  a(
    'documents',
    'Documents contractuels',
    `Les documents suivants peuvent être annexés au présent contrat :
- Annexe 1 : Facture d'achat
- Annexe 2 : Bon de garantie
- Annexe 3 : Bon de livraison
- Annexe 4 : Bon de dépôt pour réparation
- Annexe 5 : Devis de réparation
- Annexe 6 : Bon de restitution du matériel

En cas de contradiction entre les documents, les dispositions légales impératives applicables prévalent.`,
  ),
];

export const DEFAULT_CONTRACT: ContractSettings = {
  mode: 'default',
  legal: {
    legalName: '',
    legalForm: '',
    activity:
      'Vente de matériels informatiques, électroniques, ordinateurs portables, ordinateurs de bureau, accessoires et équipements associés.',
    rccm: '',
    taxId: '',
    representative: '',
  },
  title: 'Contrat de vente, garantie commerciale et conditions de service après-vente',
  subtitle: 'Vente de matériels informatiques, électroniques et accessoires',
  intro: `Le présent document définit les conditions applicables à la vente de matériels informatiques et électroniques par {{boutique}}, ainsi que les conditions de mise en œuvre de la garantie commerciale et des éventuelles prestations de réparation après expiration de cette garantie.

Il est remis au client au moment de l'achat et constitue, avec la facture ou le reçu de vente, le document de référence relatif aux conditions applicables au produit vendu.`,
  articles: DEFAULT_ARTICLES,
  warrantyCard: true,
  version: 0,
  updatedAt: null,
};

const FIXED_KINDS: ArticleKind[] = ['seller', 'customer', 'product'];

/** Paramètres effectifs : ceux de la boutique complétés par le modèle par défaut */
export function resolveContract(raw?: Partial<ContractSettings> | null): ContractSettings {
  const d = DEFAULT_CONTRACT;
  const c = raw || {};
  const custom = c.mode === 'custom' && Array.isArray(c.articles) && c.articles.length > 0;
  let articles = custom ? c.articles!.map((x) => ({ ...x, kind: x.kind || 'text' })) : d.articles;
  // Les blocs d'identification sont obligatoires : on les remet s'ils manquent
  for (const kind of FIXED_KINDS) {
    if (!articles.some((x) => x.kind === kind)) articles = [d.articles.find((x) => x.kind === kind)!, ...articles];
  }
  articles = articles.map((x) => (FIXED_KINDS.includes(x.kind) ? { ...x, enabled: true } : x));
  return {
    ...d,
    ...c,
    mode: custom ? 'custom' : 'default',
    legal: { ...d.legal, ...(c.legal || {}) },
    title: c.title?.trim() || d.title,
    subtitle: c.subtitle ?? d.subtitle,
    intro: c.intro?.trim() || d.intro,
    articles,
    warrantyCard: c.warrantyCard ?? d.warrantyCard,
    version: c.version || 0,
    updatedAt: c.updatedAt || null,
  };
}

// ─── Rendu ───

export interface ContractBlock {
  type: 'p' | 'li';
  text: string;
}

export interface Party {
  label: string;
  value: string | null;
}

export interface ContractItem {
  productName: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  serialNumber: string | null;
  reference: string | null;
  condition: 'new' | 'refurbished' | 'used';
  accessories: string | null;
  quantity: number;
  price: number;
  warrantyMonths: number;
  warrantyStart: string;
  warrantyEnd: string | null;
}

export interface RenderedArticle {
  number: number;
  id: string;
  kind: ArticleKind;
  title: string;
  blocks: ContractBlock[];
}

export interface ContractContext {
  shop: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    countryCode: string | null;
    countryName: string | null;
    currency: string;
  };
  customer: { name: string | null; phone: string | null; email: string | null; address: string | null } | null;
  sale: {
    id: string;
    invoiceNumber: number;
    date: string;
    subtotal: number;
    discount: number;
    total: number;
    creditNoteAmount: number;
    paymentLabel: string;
    sellerName: string | null;
  };
  items: ContractItem[];
  policy: ReturnPolicy;
}

export interface RenderedContract {
  documentNumber: string;
  version: number;
  sample: boolean;
  title: string;
  subtitle: string;
  lawReference: string | null;
  countryLine: string | null;
  intro: ContractBlock[];
  shop: ContractContext['shop'] & { displayName: string; legal: ContractLegal };
  customer: ContractContext['customer'];
  sale: ContractContext['sale'];
  items: ContractItem[];
  articles: RenderedArticle[];
  warrantyCard: boolean;
}

/** Loi de référence sur la consommation, quand on la connaît pour le pays */
const CONSUMER_LAW: Record<string, string> = {
  CI: 'Loi n° 2016-412 du 15 juin 2016 relative à la consommation',
};

/** « en Côte d'Ivoire », « au Sénégal »… : formulation neutre pour éviter les erreurs d'article */
const inCountry = (name: string | null) => (name ? `dans le pays du Vendeur (${name})` : 'dans le pays du Vendeur');

const plural = (n: number, w: string) => `${n} ${w}${n > 1 && !w.endsWith('s') ? 's' : ''}`;

export const conditionLabel = (c: ContractItem['condition']) =>
  c === 'refurbished' ? 'Reconditionné' : c === 'used' ? 'Occasion' : 'Neuf';

/** « 12 mois » si tous les produits ont la même garantie, sinon renvoi à l'article produit */
function warrantyPhrase(items: ContractItem[], productArticle: number) {
  const months = [...new Set(items.map((i) => i.warrantyMonths))];
  if (months.length === 1) return months[0] > 0 ? `${months[0]} mois` : 'zéro mois (produit vendu sans garantie commerciale)';
  return `indiquée pour chaque produit à l'article ${productArticle}`;
}

export function parseBlocks(text: string): ContractBlock[] {
  const blocks: ContractBlock[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[-•]\s+/.test(line)) blocks.push({ type: 'li', text: line.replace(/^[-•]\s+/, '') });
    else blocks.push({ type: 'p', text: line });
  }
  return blocks;
}

/** Texte de l'article « Retour et échange », tiré de la politique de la boutique */
export function returnsArticleText(p: ReturnPolicy, fmt: (n: number) => string): string {
  const solutions = (t: { creditNote: boolean; refund: boolean; exchange: boolean }) =>
    [t.exchange && 'un échange', t.creditNote && 'un avoir', t.refund && 'un remboursement'].filter(Boolean).join(', ') ||
    'aucune solution';
  const out: string[] = [];
  if (p.returnsEnabled) {
    out.push(
      `Retour pour changement d'avis : le Client peut rapporter le produit dans un délai de ${plural(p.returnWindowDays, 'jour')} après l'achat. {{boutique}} propose alors ${solutions(p.changeOfMind)}${p.changeOfMind.creditNote ? ` (avoir valable ${plural(p.creditNoteValidityDays, 'jour')})` : ''}.`,
    );
    if (p.conditions.length) {
      out.push('Le retour est accepté uniquement si les conditions suivantes sont réunies :');
      out.push(...p.conditions.map((c) => `- ${c} ;`));
    }
    if (p.restockingFeePercent > 0) {
      out.push(`Des frais de remise en stock de ${p.restockingFeePercent} % du prix (par exemple ${fmt(Math.round(100000 * p.restockingFeePercent) / 100)} pour un produit de ${fmt(100000)}) sont retenus.`);
    }
  } else {
    out.push("{{boutique}} n'accepte pas les retours pour simple changement d'avis lorsque le produit fonctionne normalement.");
  }
  out.push('');
  if (p.defective.exchangeWindowDays > 0) {
    out.push(
      `Panne constatée dans les ${plural(p.defective.exchangeWindowDays, 'jour')} suivant l'achat : après vérification, {{boutique}} propose ${solutions(p.defective.earlyActions)}.`,
    );
  }
  out.push(
    p.defective.warrantyRepair
      ? 'Panne survenant ensuite pendant la garantie commerciale : le produit est réparé gratuitement dans les conditions des articles relatifs à la garantie.'
      : 'Panne survenant ensuite pendant la garantie commerciale : la prise en charge est examinée au cas par cas, dans les conditions des articles relatifs à la garantie.',
  );
  if (p.defective.paidRepairOutOfWarranty) {
    out.push('Après la garantie : réparation payante sur devis accepté par le Client.');
  }
  if (p.refundMethods.length && (p.changeOfMind.refund || p.defective.earlyActions.refund)) {
    const m = p.refundMethods.map((x) => (x === 'cash' ? 'en espèces' : 'par Mobile Money')).join(' ou ');
    out.push(`Les remboursements éventuels sont effectués ${m}.`);
  }
  return out.join('\n');
}

export function renderContract(settings: ContractSettings, ctx: ContractContext, opts: { sample?: boolean } = {}): RenderedContract {
  const fmt = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n)} ${ctx.shop.currency}`;
  const legal = settings.legal;
  const displayName = (legal.legalName || ctx.shop.name).trim();
  const law = (ctx.shop.countryCode && CONSUMER_LAW[ctx.shop.countryCode]) || null;

  const enabled = settings.articles.filter((x) => x.enabled);
  const productNumber = enabled.findIndex((x) => x.kind === 'product') + 1;
  const vars: Record<string, string> = {
    boutique: displayName,
    garantie: warrantyPhrase(ctx.items, productNumber),
    pays: ctx.shop.countryName || '',
    droit: inCountry(ctx.shop.countryName),
    loi: law ? `, notamment la ${law.charAt(0).toLowerCase()}${law.slice(1)}` : '',
  };
  const fill = (t: string) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k] : m));

  const articles: RenderedArticle[] = enabled.map((x, i) => {
    const body = x.kind === 'returns' ? returnsArticleText(ctx.policy, fmt) : x.body;
    return { number: i + 1, id: x.id, kind: x.kind, title: fill(x.title), blocks: parseBlocks(fill(body)) };
  });

  return {
    documentNumber: `CV-${ctx.sale.invoiceNumber}`,
    version: settings.version,
    sample: !!opts.sample,
    title: fill(settings.title),
    subtitle: fill(settings.subtitle || ''),
    lawReference: law,
    countryLine: ctx.shop.countryName ? (ctx.shop.countryCode === 'CI' ? "République de Côte d'Ivoire" : ctx.shop.countryName) : null,
    intro: parseBlocks(fill(settings.intro)),
    shop: { ...ctx.shop, displayName, legal },
    customer: ctx.customer,
    sale: ctx.sale,
    items: ctx.items,
    articles,
    warrantyCard: settings.warrantyCard,
  };
}
