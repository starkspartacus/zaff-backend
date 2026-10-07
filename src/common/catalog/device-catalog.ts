/**
 * Catalogue d'appareils connus : sert à remplir vite et sans faute la fiche d'un nouveau produit
 * (catégorie → marque → modèle → capacité / configuration → couleur). Ce ne sont que des suggestions :
 * toute valeur absente peut être saisie à la main dans le formulaire.
 * Clés de catégorie = slugs du catalogue de référence (`reference_categories`).
 */

export interface DeviceModel {
  name: string;
  /** Capacités / configurations proposées (sinon celles de la catégorie) */
  variants?: string[];
  /** Coloris officiels (sinon ceux de la catégorie) */
  colors?: string[];
}

export interface CategoryProfile {
  /** Libellé du champ « variante » : Capacité, Configuration, Taille… */
  variantLabel: string;
  variants: string[];
  colors: string[];
  /** Accessoires habituellement fournis, proposés en un clic */
  accessories: string[];
  /** Garantie habituelle (mois), suggérée au vendeur */
  warrantyMonths: number;
}

const PHONE_STORAGE = ['64 Go', '128 Go', '256 Go', '512 Go', '1 To'];
const BASIC_COLORS = ['Noir', 'Blanc', 'Gris', 'Argent', 'Bleu', 'Vert', 'Rouge', 'Or', 'Violet', 'Rose'];
const LAPTOP_CONFIGS = ['8 Go / 256 Go SSD', '8 Go / 512 Go SSD', '16 Go / 512 Go SSD', '16 Go / 1 To SSD', '32 Go / 1 To SSD'];

export const CATEGORY_PROFILES: Record<string, CategoryProfile> = {
  smartphones: {
    variantLabel: 'Capacité',
    variants: PHONE_STORAGE,
    colors: BASIC_COLORS,
    accessories: ['Câble de charge', 'Chargeur', 'Boîte', 'Coque', 'Écouteurs', 'Outil SIM'],
    warrantyMonths: 12,
  },
  'ordinateurs-portables': {
    variantLabel: 'Configuration (RAM / stockage)',
    variants: LAPTOP_CONFIGS,
    colors: ['Noir', 'Gris', 'Argent', 'Bleu'],
    accessories: ['Chargeur', 'Sacoche', 'Souris', 'Boîte', 'Licence Windows'],
    warrantyMonths: 12,
  },
  'ordinateurs-de-bureau': {
    variantLabel: 'Configuration (RAM / stockage)',
    variants: LAPTOP_CONFIGS,
    colors: ['Noir', 'Gris', 'Argent', 'Blanc'],
    accessories: ['Clavier', 'Souris', 'Câble d\'alimentation', 'Écran', 'Boîte'],
    warrantyMonths: 12,
  },
  tablettes: {
    variantLabel: 'Capacité',
    variants: ['64 Go', '128 Go', '256 Go', '512 Go', '1 To'],
    colors: ['Gris', 'Argent', 'Bleu', 'Noir', 'Rose'],
    accessories: ['Câble de charge', 'Chargeur', 'Boîte', 'Étui', 'Stylet'],
    warrantyMonths: 12,
  },
  ecrans: {
    variantLabel: 'Taille',
    variants: ['19"', '22"', '24"', '27"', '32"', '34"'],
    colors: ['Noir', 'Blanc', 'Argent'],
    accessories: ['Câble HDMI', 'Câble d\'alimentation', 'Pied', 'Boîte'],
    warrantyMonths: 12,
  },
  imprimantes: {
    variantLabel: 'Type',
    variants: ['Jet d\'encre', 'Laser monochrome', 'Laser couleur', 'Multifonction', 'Réservoirs d\'encre'],
    colors: ['Noir', 'Blanc', 'Gris'],
    accessories: ['Câble USB', 'Câble d\'alimentation', 'Cartouches de démarrage', 'Boîte'],
    warrantyMonths: 6,
  },
  'montres-connectees': {
    variantLabel: 'Taille du boîtier',
    variants: ['40 mm', '41 mm', '42 mm', '44 mm', '45 mm', '46 mm', '49 mm'],
    colors: ['Noir', 'Argent', 'Or', 'Rose', 'Bleu', 'Titane'],
    accessories: ['Câble de charge', 'Bracelet', 'Boîte'],
    warrantyMonths: 12,
  },
  audio: {
    variantLabel: 'Type',
    variants: ['Écouteurs sans fil', 'Casque', 'Enceinte portable', 'Barre de son'],
    colors: ['Noir', 'Blanc', 'Bleu', 'Rouge', 'Gris'],
    accessories: ['Câble de charge', 'Étui de charge', 'Embouts', 'Boîte'],
    warrantyMonths: 6,
  },
  reseau: {
    variantLabel: 'Type',
    variants: ['Routeur Wi-Fi', 'Routeur 4G', 'Routeur 5G', 'Modem de poche (MiFi)', 'Répéteur', 'Switch', 'Point d\'accès'],
    colors: ['Noir', 'Blanc'],
    accessories: ['Adaptateur secteur', 'Câble Ethernet', 'Boîte'],
    warrantyMonths: 6,
  },
  stockage: {
    variantLabel: 'Capacité',
    variants: ['32 Go', '64 Go', '128 Go', '256 Go', '512 Go', '1 To', '2 To', '4 To'],
    colors: ['Noir', 'Gris', 'Bleu', 'Rouge'],
    accessories: ['Câble USB', 'Adaptateur SD', 'Boîte'],
    warrantyMonths: 12,
  },
  composants: {
    variantLabel: 'Caractéristique',
    variants: ['8 Go', '16 Go', '32 Go', '256 Go', '512 Go', '1 To'],
    colors: [],
    accessories: ['Boîte', 'Vis de fixation'],
    warrantyMonths: 6,
  },
  accessoires: {
    variantLabel: 'Type',
    variants: ['USB-C', 'Lightning', 'Micro-USB', '20 W', '25 W', '45 W', '65 W', '10 000 mAh', '20 000 mAh'],
    colors: ['Noir', 'Blanc', 'Bleu', 'Rose'],
    accessories: ['Boîte'],
    warrantyMonths: 3,
  },
  'consoles-jeux': {
    variantLabel: 'Édition',
    variants: ['Standard', 'Digital (sans lecteur)', '512 Go', '825 Go', '1 To', '2 To'],
    colors: ['Blanc', 'Noir'],
    accessories: ['Manette', 'Câble HDMI', 'Câble d\'alimentation', 'Boîte'],
    warrantyMonths: 12,
  },
};

/** Profil par défaut pour une catégorie propre à la boutique */
export const DEFAULT_PROFILE: CategoryProfile = {
  variantLabel: 'Variante',
  variants: [],
  colors: BASIC_COLORS,
  accessories: ['Boîte', 'Câble', 'Chargeur'],
  warrantyMonths: 6,
};

const m = (name: string, variants?: string[], colors?: string[]): DeviceModel => ({ name, variants, colors });

// ─── Apple ───
const IPH_PRO_2025 = ['Argent', 'Orange cosmique', 'Bleu intense'];
const IPH_17 = ['Noir', 'Blanc', 'Bleu brume', 'Sauge', 'Lavande'];
const IPH_16_PRO = ['Titane noir', 'Titane blanc', 'Titane naturel', 'Titane sable'];
const IPH_16 = ['Noir', 'Blanc', 'Rose', 'Sarcelle', 'Outremer'];
const IPH_15_PRO = ['Titane naturel', 'Titane bleu', 'Titane blanc', 'Titane noir'];
const IPH_15 = ['Noir', 'Bleu', 'Vert', 'Jaune', 'Rose'];
const IPH_14_PRO = ['Noir sidéral', 'Argent', 'Or', 'Violet intense'];
const IPH_14 = ['Minuit', 'Lumière stellaire', 'Bleu', 'Mauve', 'Jaune', '(PRODUCT)RED'];
const IPH_13_PRO = ['Graphite', 'Or', 'Argent', 'Bleu Alpin', 'Vert Alpin'];
const IPH_13 = ['Minuit', 'Lumière stellaire', 'Bleu', 'Rose', 'Vert', '(PRODUCT)RED'];
const IPH_12 = ['Noir', 'Blanc', 'Bleu', 'Vert', 'Mauve', '(PRODUCT)RED'];
const IPH_11 = ['Noir', 'Blanc', 'Vert', 'Jaune', 'Mauve', '(PRODUCT)RED'];
const S128 = ['128 Go', '256 Go', '512 Go'];
const S256 = ['256 Go', '512 Go', '1 To'];

export const DEVICE_MODELS: Record<string, Record<string, DeviceModel[]>> = {
  smartphones: {
    Apple: [
      m('iPhone 17 Pro Max', ['256 Go', '512 Go', '1 To', '2 To'], IPH_PRO_2025),
      m('iPhone 17 Pro', S256, IPH_PRO_2025),
      m('iPhone Air', S256, ['Noir sidéral', 'Blanc nuage', 'Or clair', 'Bleu ciel']),
      m('iPhone 17', ['256 Go', '512 Go'], IPH_17),
      m('iPhone 16 Pro Max', S256, IPH_16_PRO),
      m('iPhone 16 Pro', ['128 Go', '256 Go', '512 Go', '1 To'], IPH_16_PRO),
      m('iPhone 16 Plus', S128, IPH_16),
      m('iPhone 16', S128, IPH_16),
      m('iPhone 16e', S128, ['Noir', 'Blanc']),
      m('iPhone 15 Pro Max', S256, IPH_15_PRO),
      m('iPhone 15 Pro', ['128 Go', '256 Go', '512 Go', '1 To'], IPH_15_PRO),
      m('iPhone 15 Plus', S128, IPH_15),
      m('iPhone 15', S128, IPH_15),
      m('iPhone 14 Pro Max', ['128 Go', '256 Go', '512 Go', '1 To'], IPH_14_PRO),
      m('iPhone 14 Pro', ['128 Go', '256 Go', '512 Go', '1 To'], IPH_14_PRO),
      m('iPhone 14 Plus', S128, IPH_14),
      m('iPhone 14', S128, IPH_14),
      m('iPhone 13 Pro Max', ['128 Go', '256 Go', '512 Go', '1 To'], IPH_13_PRO),
      m('iPhone 13 Pro', ['128 Go', '256 Go', '512 Go', '1 To'], IPH_13_PRO),
      m('iPhone 13', S128, IPH_13),
      m('iPhone 13 mini', S128, IPH_13),
      m('iPhone 12 Pro Max', ['128 Go', '256 Go', '512 Go'], ['Graphite', 'Argent', 'Or', 'Bleu Pacifique']),
      m('iPhone 12', ['64 Go', '128 Go', '256 Go'], IPH_12),
      m('iPhone 11 Pro Max', ['64 Go', '256 Go', '512 Go'], ['Gris sidéral', 'Argent', 'Or', 'Vert nuit']),
      m('iPhone 11', ['64 Go', '128 Go', '256 Go'], IPH_11),
      m('iPhone SE (2022)', ['64 Go', '128 Go', '256 Go'], ['Minuit', 'Lumière stellaire', '(PRODUCT)RED']),
      m('iPhone XR', ['64 Go', '128 Go'], ['Noir', 'Blanc', 'Bleu', 'Jaune', 'Corail', '(PRODUCT)RED']),
    ],
    Samsung: [
      m('Galaxy S25 Ultra', S256, ['Titane noir', 'Titane gris', 'Titane argent', 'Titane bleu']),
      m('Galaxy S25+', ['256 Go', '512 Go'], ['Bleu marine', 'Bleu glacier', 'Argent', 'Menthe']),
      m('Galaxy S25', ['128 Go', '256 Go'], ['Bleu marine', 'Bleu glacier', 'Argent', 'Menthe']),
      m('Galaxy S24 Ultra', S256, ['Titane noir', 'Titane gris', 'Titane violet', 'Titane jaune']),
      m('Galaxy S24', ['128 Go', '256 Go'], ['Noir onyx', 'Gris marbre', 'Violet cobalt', 'Jaune ambre']),
      m('Galaxy S24 FE', ['128 Go', '256 Go'], ['Bleu', 'Graphite', 'Gris', 'Menthe', 'Jaune']),
      m('Galaxy Z Fold7', S256),
      m('Galaxy Z Flip7', ['256 Go', '512 Go']),
      m('Galaxy Z Fold6', S256),
      m('Galaxy Z Flip6', ['256 Go', '512 Go']),
      m('Galaxy A56 5G', ['128 Go', '256 Go']),
      m('Galaxy A55 5G', ['128 Go', '256 Go']),
      m('Galaxy A36 5G', ['128 Go', '256 Go']),
      m('Galaxy A35 5G', ['128 Go', '256 Go']),
      m('Galaxy A26 5G', ['128 Go', '256 Go']),
      m('Galaxy A25 5G', ['128 Go', '256 Go']),
      m('Galaxy A16', ['128 Go', '256 Go']),
      m('Galaxy A15', ['128 Go', '256 Go']),
      m('Galaxy A06', ['64 Go', '128 Go']),
      m('Galaxy A05s', ['64 Go', '128 Go']),
      m('Galaxy A05', ['64 Go', '128 Go']),
    ],
    Tecno: [
      m('Camon 40 Pro', ['256 Go']),
      m('Camon 40', ['128 Go', '256 Go']),
      m('Camon 30 Pro', ['256 Go', '512 Go']),
      m('Camon 30', ['256 Go']),
      m('Spark 40 Pro', ['128 Go', '256 Go']),
      m('Spark 40', ['128 Go', '256 Go']),
      m('Spark 30 Pro', ['128 Go', '256 Go']),
      m('Spark 30', ['128 Go', '256 Go']),
      m('Spark 20 Pro', ['256 Go']),
      m('Spark 20', ['128 Go', '256 Go']),
      m('Spark Go 2025', ['64 Go', '128 Go']),
      m('Pova 7', ['128 Go', '256 Go']),
      m('Pova 6 Pro', ['256 Go']),
      m('Phantom V Fold2', ['512 Go']),
      m('Phantom V Flip2', ['256 Go']),
    ],
    Infinix: [
      m('Note 50 Pro', ['256 Go']),
      m('Note 50', ['128 Go', '256 Go']),
      m('Note 40 Pro', ['256 Go']),
      m('Note 40', ['256 Go']),
      m('Hot 60 Pro', ['128 Go', '256 Go']),
      m('Hot 60', ['128 Go', '256 Go']),
      m('Hot 50 Pro', ['128 Go', '256 Go']),
      m('Hot 50', ['128 Go', '256 Go']),
      m('Hot 40i', ['128 Go', '256 Go']),
      m('Smart 9', ['64 Go', '128 Go']),
      m('Smart 8', ['64 Go', '128 Go']),
      m('Zero 40', ['256 Go', '512 Go']),
      m('GT 30 Pro', ['256 Go']),
    ],
    Itel: [
      m('S25 Ultra', ['128 Go', '256 Go']),
      m('S25', ['128 Go', '256 Go']),
      m('S24', ['128 Go', '256 Go']),
      m('P55', ['128 Go', '256 Go']),
      m('P65', ['128 Go', '256 Go']),
      m('A80', ['64 Go', '128 Go']),
      m('A70', ['64 Go', '128 Go']),
      m('A50', ['64 Go']),
    ],
    Xiaomi: [
      m('Xiaomi 15T Pro', S256),
      m('Xiaomi 15T', ['256 Go', '512 Go']),
      m('Xiaomi 14T Pro', ['512 Go', '1 To']),
      m('Xiaomi 14T', ['256 Go', '512 Go']),
      m('Redmi Note 14 Pro+ 5G', ['256 Go', '512 Go']),
      m('Redmi Note 14 Pro', ['256 Go', '512 Go']),
      m('Redmi Note 14', ['128 Go', '256 Go']),
      m('Redmi Note 13 Pro', ['256 Go', '512 Go']),
      m('Redmi Note 13', ['128 Go', '256 Go']),
      m('Redmi 15C', ['128 Go', '256 Go']),
      m('Redmi 14C', ['128 Go', '256 Go']),
      m('Redmi 13', ['128 Go', '256 Go']),
      m('Redmi A5', ['64 Go', '128 Go']),
      m('Redmi A3', ['64 Go', '128 Go']),
      m('Poco X7 Pro', ['256 Go', '512 Go']),
      m('Poco M7 Pro', ['256 Go']),
    ],
    Oppo: [
      m('Reno14', ['256 Go', '512 Go']),
      m('Reno13', ['256 Go', '512 Go']),
      m('Reno12', ['256 Go', '512 Go']),
      m('A5 Pro', ['128 Go', '256 Go']),
      m('A60', ['128 Go', '256 Go']),
      m('A40', ['128 Go']),
      m('A3x', ['64 Go', '128 Go']),
    ],
    Huawei: [
      m('Pura 80 Pro', ['512 Go']),
      m('Pura 70 Pro', ['512 Go']),
      m('Mate X6', ['512 Go']),
      m('nova 13', ['256 Go', '512 Go']),
      m('nova 12 SE', ['256 Go']),
      m('nova Y72', ['128 Go', '256 Go']),
    ],
    Google: [
      m('Pixel 10 Pro XL', S256),
      m('Pixel 10 Pro', ['128 Go', '256 Go', '512 Go']),
      m('Pixel 10', ['128 Go', '256 Go']),
      m('Pixel 9 Pro', ['128 Go', '256 Go', '512 Go']),
      m('Pixel 9', ['128 Go', '256 Go']),
      m('Pixel 9a', ['128 Go', '256 Go']),
      m('Pixel 8a', ['128 Go', '256 Go']),
    ],
    Nokia: [m('G42 5G', ['128 Go']), m('C32', ['64 Go', '128 Go']), m('105 (4G)', ['—']), m('110 (4G)', ['—'])],
  },
  'ordinateurs-portables': {
    HP: [
      m('EliteBook 840 G11'), m('EliteBook 840 G10'), m('EliteBook 640 G10'), m('ProBook 450 G10'), m('ProBook 440 G10'),
      m('HP 250 G10'), m('HP 255 G10'), m('HP 15s'), m('Pavilion 15'), m('Pavilion x360 14'), m('Envy x360 15'),
      m('Victus 15'), m('Omen 16'), m('ZBook Firefly 14'),
    ],
    Dell: [
      m('Latitude 5450'), m('Latitude 5440'), m('Latitude 3550'), m('Latitude 3540'), m('Vostro 3520'), m('Vostro 3530'),
      m('Inspiron 15 3530'), m('Inspiron 15 3520'), m('Inspiron 14 5440'), m('XPS 13'), m('XPS 14'), m('G15 Gaming'),
      m('Precision 3580'),
    ],
    Lenovo: [
      m('ThinkPad E14 Gen 5'), m('ThinkPad E16 Gen 1'), m('ThinkPad T14 Gen 4'), m('ThinkPad X1 Carbon Gen 12'),
      m('ThinkBook 15 G4'), m('ThinkBook 14 G6'), m('IdeaPad Slim 3'), m('IdeaPad Slim 5'), m('IdeaPad 1'),
      m('Yoga 7'), m('LOQ 15'), m('Legion 5'), m('V15 G4'),
    ],
    Apple: [
      m('MacBook Air 13" M4', ['16 Go / 256 Go SSD', '16 Go / 512 Go SSD', '24 Go / 512 Go SSD'], ['Bleu ciel', 'Argent', 'Lumière stellaire', 'Minuit']),
      m('MacBook Air 15" M4', ['16 Go / 256 Go SSD', '16 Go / 512 Go SSD', '24 Go / 512 Go SSD'], ['Bleu ciel', 'Argent', 'Lumière stellaire', 'Minuit']),
      m('MacBook Air 13" M3', ['8 Go / 256 Go SSD', '16 Go / 512 Go SSD'], ['Gris sidéral', 'Argent', 'Lumière stellaire', 'Minuit']),
      m('MacBook Air 13" M2', ['8 Go / 256 Go SSD', '8 Go / 512 Go SSD'], ['Gris sidéral', 'Argent', 'Lumière stellaire', 'Minuit']),
      m('MacBook Air 13" M1', ['8 Go / 256 Go SSD'], ['Gris sidéral', 'Argent', 'Or']),
      m('MacBook Pro 14" M4', ['16 Go / 512 Go SSD', '16 Go / 1 To SSD', '24 Go / 1 To SSD'], ['Noir sidéral', 'Argent']),
      m('MacBook Pro 14" M4 Pro', ['24 Go / 512 Go SSD', '24 Go / 1 To SSD', '48 Go / 1 To SSD'], ['Noir sidéral', 'Argent']),
      m('MacBook Pro 16" M4 Pro', ['24 Go / 512 Go SSD', '48 Go / 512 Go SSD'], ['Noir sidéral', 'Argent']),
    ],
    Asus: [m('Vivobook 15'), m('Vivobook 16'), m('Vivobook Go 15'), m('Zenbook 14 OLED'), m('ExpertBook B1'), m('TUF Gaming A15'), m('TUF Gaming F15'), m('ROG Strix G16')],
    Acer: [m('Aspire 3'), m('Aspire 5'), m('Aspire Lite 15'), m('Swift Go 14'), m('Extensa 15'), m('TravelMate P2'), m('Nitro V 15')],
    MSI: [m('Modern 15'), m('Thin GF63'), m('Katana 15'), m('Cyborg 15')],
    Microsoft: [m('Surface Laptop 7'), m('Surface Pro 11'), m('Surface Laptop Go 3')],
  },
  'ordinateurs-de-bureau': {
    HP: [m('ProDesk 400 G9'), m('EliteDesk 800 G9'), m('HP All-in-One 24'), m('Pavilion Desktop TP01')],
    Dell: [m('OptiPlex 7010'), m('OptiPlex 3000'), m('Vostro 3020'), m('Inspiron 24 AIO')],
    Lenovo: [m('ThinkCentre M70s'), m('ThinkCentre neo 50s'), m('IdeaCentre AIO 3')],
    Apple: [
      m('iMac 24" M4', ['16 Go / 256 Go SSD', '16 Go / 512 Go SSD'], ['Bleu', 'Vert', 'Rose', 'Argent', 'Jaune', 'Orange', 'Violet']),
      m('Mac mini M4', ['16 Go / 256 Go SSD', '16 Go / 512 Go SSD', '24 Go / 512 Go SSD'], ['Argent']),
      m('Mac Studio'),
    ],
    Asus: [m('ExpertCenter D5'), m('Vivo AiO 24')],
    Acer: [m('Veriton'), m('Aspire C24 AIO')],
  },
  tablettes: {
    Apple: [
      m('iPad (A16)', ['128 Go', '256 Go', '512 Go'], ['Bleu', 'Rose', 'Jaune', 'Argent']),
      m('iPad (10e génération)', ['64 Go', '256 Go'], ['Bleu', 'Rose', 'Jaune', 'Argent']),
      m('iPad Air 11" M3', ['128 Go', '256 Go', '512 Go', '1 To'], ['Gris sidéral', 'Bleu', 'Mauve', 'Lumière stellaire']),
      m('iPad Air 13" M3', ['128 Go', '256 Go', '512 Go', '1 To'], ['Gris sidéral', 'Bleu', 'Mauve', 'Lumière stellaire']),
      m('iPad Pro 11" M4', ['256 Go', '512 Go', '1 To', '2 To'], ['Noir sidéral', 'Argent']),
      m('iPad Pro 13" M4', ['256 Go', '512 Go', '1 To', '2 To'], ['Noir sidéral', 'Argent']),
      m('iPad mini (A17 Pro)', ['128 Go', '256 Go', '512 Go'], ['Gris sidéral', 'Bleu', 'Mauve', 'Lumière stellaire']),
    ],
    Samsung: [m('Galaxy Tab S10 Ultra'), m('Galaxy Tab S10+'), m('Galaxy Tab S10 FE'), m('Galaxy Tab S9 FE'), m('Galaxy Tab A9+'), m('Galaxy Tab A9')],
    Lenovo: [m('Tab M11'), m('Tab M10 (3e gén.)'), m('Tab P12'), m('Idea Tab Pro')],
    Huawei: [m('MatePad 11.5'), m('MatePad SE 11'), m('MatePad Pro 13.2')],
    Xiaomi: [m('Redmi Pad 2'), m('Redmi Pad SE'), m('Xiaomi Pad 7'), m('Xiaomi Pad 6')],
    Tecno: [m('MegaPad 11'), m('MegaPad 10')],
  },
  'montres-connectees': {
    Apple: [m('Apple Watch Series 11'), m('Apple Watch Series 10'), m('Apple Watch SE (3e gén.)'), m('Apple Watch SE (2e gén.)'), m('Apple Watch Ultra 3'), m('Apple Watch Ultra 2')],
    Samsung: [m('Galaxy Watch8'), m('Galaxy Watch7'), m('Galaxy Watch Ultra'), m('Galaxy Fit3')],
    Huawei: [m('Watch GT 5'), m('Watch GT 4'), m('Watch Fit 4'), m('Band 9')],
    Xiaomi: [m('Redmi Watch 5'), m('Redmi Watch 4'), m('Smart Band 9')],
    Garmin: [m('Forerunner 265'), m('Venu 3'), m('Fenix 8')],
  },
  audio: {
    Apple: [m('AirPods 4', ['Écouteurs sans fil'], ['Blanc']), m('AirPods Pro 2', ['Écouteurs sans fil'], ['Blanc']), m('AirPods Max', ['Casque'])],
    Samsung: [m('Galaxy Buds3 Pro'), m('Galaxy Buds3'), m('Galaxy Buds FE')],
    JBL: [m('Flip 6', ['Enceinte portable']), m('Flip 7', ['Enceinte portable']), m('Charge 5', ['Enceinte portable']), m('Go 4', ['Enceinte portable']), m('PartyBox 110', ['Enceinte portable']), m('Tune 520BT', ['Casque']), m('Wave Beam', ['Écouteurs sans fil'])],
    Sony: [m('WH-1000XM5', ['Casque']), m('WH-CH520', ['Casque']), m('WF-C700N', ['Écouteurs sans fil']), m('ULT Field 1', ['Enceinte portable'])],
    Oraimo: [m('FreePods 4', ['Écouteurs sans fil']), m('FreePods Lite', ['Écouteurs sans fil']), m('Riff 2', ['Écouteurs sans fil']), m('BoomPop 2', ['Casque'])],
    Anker: [m('Soundcore Liberty 4', ['Écouteurs sans fil']), m('Soundcore Motion 300', ['Enceinte portable'])],
  },
  reseau: {
    'TP-Link': [m('Archer C6', ['Routeur Wi-Fi']), m('Archer C64', ['Routeur Wi-Fi']), m('Archer MR600', ['Routeur 4G']), m('Deco M4', ['Routeur Wi-Fi']), m('TL-WR840N', ['Routeur Wi-Fi']), m('TL-SG1008D', ['Switch']), m('M7200', ['Modem de poche (MiFi)'])],
    Huawei: [m('B311', ['Routeur 4G']), m('B535', ['Routeur 4G']), m('E5576', ['Modem de poche (MiFi)']), m('5G CPE Pro 5', ['Routeur 5G'])],
    Ubiquiti: [m('UniFi U6 Lite', ["Point d'accès"]), m('UniFi U6+', ["Point d'accès"]), m('LiteBeam 5AC', ["Point d'accès"])],
    Cisco: [m('CBS110-8T', ['Switch']), m('CBS250-24T', ['Switch'])],
    Netgear: [m('GS308', ['Switch']), m('Nighthawk M6', ['Routeur 5G'])],
  },
  imprimantes: {
    HP: [m('LaserJet M111w', ['Laser monochrome']), m('LaserJet Pro MFP M428fdw', ['Multifonction']), m('LaserJet Pro 4003dn', ['Laser monochrome']), m('DeskJet 2720e', ["Jet d'encre"]), m('Smart Tank 515', ["Réservoirs d'encre"]), m('Color LaserJet Pro M255dw', ['Laser couleur'])],
    Canon: [m('PIXMA G3410', ["Réservoirs d'encre"]), m('PIXMA G2430', ["Réservoirs d'encre"]), m('i-SENSYS LBP6030', ['Laser monochrome']), m('i-SENSYS MF3010', ['Multifonction'])],
    Epson: [m('EcoTank L3250', ["Réservoirs d'encre"]), m('EcoTank L3210', ["Réservoirs d'encre"]), m('EcoTank L5290', ["Réservoirs d'encre"]), m('WorkForce WF-2930', ["Jet d'encre"])],
    Brother: [m('HL-L2350DW', ['Laser monochrome']), m('DCP-L2540DW', ['Multifonction']), m('DCP-T420W', ["Réservoirs d'encre"])],
    Xerox: [m('B210', ['Laser monochrome']), m('B225', ['Multifonction'])],
  },
  ecrans: {
    Samsung: [m('Essential S3 (S36)'), m('Odyssey G5'), m('ViewFinity S6')],
    LG: [m('UltraGear 27GS'), m('24MR400'), m('27MR400')],
    Dell: [m('SE2425H'), m('P2425H'), m('S2725H')],
    HP: [m('M24f'), m('V24i G5'), m('P24 G5')],
    AOC: [m('24B2XH'), m('27G2SP')],
  },
  stockage: {
    SanDisk: [m('Ultra microSD'), m('Extreme microSD'), m('Ultra Flair (clé USB)'), m('Extreme Portable SSD')],
    Kingston: [m('A400 SSD'), m('NV3 NVMe'), m('DataTraveler Exodia (clé USB)'), m('Canvas Select Plus microSD')],
    Samsung: [m('T7 Portable SSD'), m('990 PRO NVMe'), m('870 EVO SSD'), m('EVO Plus microSD')],
    Seagate: [m('Expansion (disque externe)'), m('One Touch')],
    WD: [m('Elements (disque externe)'), m('My Passport'), m('Blue SN580 NVMe')],
    Toshiba: [m('Canvio Basics')],
  },
  'consoles-jeux': {
    Sony: [m('PlayStation 5 Pro', ['2 To'], ['Blanc']), m('PlayStation 5 Slim', ['Standard', 'Digital (sans lecteur)'], ['Blanc']), m('PlayStation 4 Slim', ['500 Go', '1 To'], ['Noir']), m('Manette DualSense', ['Standard'], ['Blanc', 'Noir', 'Rouge', 'Bleu'])],
    Microsoft: [m('Xbox Series X', ['1 To', '2 To'], ['Noir', 'Blanc']), m('Xbox Series S', ['512 Go', '1 To'], ['Blanc', 'Noir'])],
    Nintendo: [m('Switch 2', ['Standard']), m('Switch OLED', ['Standard'], ['Blanc', 'Néon']), m('Switch Lite', ['Standard'])],
  },
  accessoires: {
    Apple: [m('Chargeur USB-C 20 W', ['20 W'], ['Blanc']), m('Câble USB-C vers Lightning', ['Lightning'], ['Blanc']), m('Câble USB-C tressé', ['USB-C'], ['Blanc'])],
    Samsung: [m('Chargeur rapide 25 W', ['25 W']), m('Chargeur 45 W', ['45 W'])],
    Oraimo: [m('Power bank Traveler', ['10 000 mAh', '20 000 mAh']), m('Chargeur Firefly', ['20 W']), m('Câble PowerLine', ['USB-C', 'Micro-USB', 'Lightning'])],
    Anker: [m('PowerCore 10000', ['10 000 mAh']), m('Nano 20 W', ['20 W'])],
    Logitech: [m('Souris M185'), m('Souris M190'), m('Clavier K120'), m('Combo MK270')],
  },
};

/** Tout le catalogue en une réponse (≈ 30 Ko, mis en cache par le navigateur) */
export const deviceCatalog = () => ({ profiles: CATEGORY_PROFILES, defaultProfile: DEFAULT_PROFILE, models: DEVICE_MODELS });
