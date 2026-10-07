export interface CityDef {
  name: string;
  /** Communes / arrondissements proposés pour cette ville */
  communes?: string[];
  /** La commune doit obligatoirement être choisie (ex. Abidjan) */
  communeRequired?: boolean;
}

const n = (prefix: string, count: number, suffix = '') => Array.from({ length: count }, (_, i) => `${prefix}${i + 1}${suffix}`);
const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/**
 * Villes principales des 54 pays africains (marché cible). Pour les autres pays, la ville est saisie librement.
 * Abidjan : la commune est obligatoire.
 */
export const CITIES: Record<string, CityDef[]> = {
  CI: [
    {
      name: 'Abidjan',
      communeRequired: true,
      communes: ['Abobo', 'Adjamé', 'Anyama', 'Attécoubé', 'Bingerville', 'Cocody', 'Koumassi', 'Marcory', 'Plateau', 'Port-Bouët', 'Songon', 'Treichville', 'Yopougon'],
    },
    ...['Bouaké', 'Yamoussoukro', 'Daloa', 'San-Pédro', 'Korhogo', 'Man', 'Gagnoa', 'Divo', 'Abengourou', 'Soubré', 'Grand-Bassam', 'Séguéla',
      'Odienné', 'Bondoukou', 'Agboville', 'Dabou', 'Adzopé', 'Issia', 'Sinfra', 'Ferkessédougou', 'Dimbokro', 'Katiola', 'Bouaflé', 'Toumodi',
      'Tiassalé', 'Aboisso', 'Sassandra', 'Guiglo', 'Duékoué', 'Danané', 'Boundiali', 'Mankono', 'Daoukro', 'Bongouanou', 'Jacqueville',
      'Grand-Lahou', 'Tabou', 'Méagui', 'Lakota', 'Oumé', 'Agnibilékrou', 'Bouna', 'Assinie-Mafia'].map((name) => ({ name })),
  ],
  SN: [
    {
      name: 'Dakar',
      communes: ['Biscuiterie', 'Cambérène', 'Dieuppeul-Derklé', 'Fann-Point E-Amitié', 'Gorée', 'Grand Dakar', 'Grand Yoff', 'Gueule Tapée-Fass-Colobane',
        'Hann Bel-Air', 'HLM', 'Médina', 'Mermoz-Sacré-Cœur', 'Ngor', 'Ouakam', 'Parcelles Assainies', "Patte d'Oie", 'Plateau', 'Sicap-Liberté', 'Yoff'],
    },
    ...['Pikine', 'Guédiawaye', 'Rufisque', 'Thiès', 'Touba', 'Mbour', 'Saint-Louis', 'Kaolack', 'Ziguinchor', 'Diourbel', 'Louga', 'Tambacounda',
      'Kolda', 'Fatick', 'Kaffrine', 'Kédougou', 'Matam', 'Sédhiou', 'Richard-Toll', 'Tivaouane'].map((name) => ({ name })),
  ],
  ML: [{ name: 'Bamako', communes: roman.slice(0, 6).map((r) => `Commune ${r}`) }, ...['Sikasso', 'Ségou', 'Mopti', 'Koutiala', 'Kayes', 'Gao', 'Kati', 'San', 'Tombouctou', 'Kidal', 'Koulikoro'].map((name) => ({ name }))],
  BF: [{ name: 'Ouagadougou', communes: n('Arrondissement ', 12) }, ...['Bobo-Dioulasso', 'Koudougou', 'Ouahigouya', 'Banfora', 'Kaya', 'Tenkodogo', "Fada N'Gourma", 'Dédougou', 'Ziniaré', 'Dori', 'Gaoua'].map((name) => ({ name }))],
  BJ: [{ name: 'Cotonou', communes: n('', 13, 'e arrondissement').map((s) => s.replace(/^1e /, '1er ')) }, ...['Porto-Novo', 'Abomey-Calavi', 'Parakou', 'Djougou', 'Bohicon', 'Natitingou', 'Ouidah', 'Lokossa', 'Abomey', 'Kandi', 'Sèmè-Podji'].map((name) => ({ name }))],
  TG: [{ name: 'Lomé', communes: [...n('Golfe ', 7), ...n('Agoè-Nyivé ', 6)] }, ...['Sokodé', 'Kara', 'Kpalimé', 'Atakpamé', 'Dapaong', 'Tsévié', 'Aného', 'Bassar', 'Mango'].map((name) => ({ name }))],
  NE: [{ name: 'Niamey', communes: roman.slice(0, 5).map((r) => `Commune ${r}`) }, ...['Zinder', 'Maradi', 'Agadez', 'Tahoua', 'Dosso', 'Tillabéri', 'Diffa', 'Arlit', 'Birni-N\'Konni'].map((name) => ({ name }))],
  GN: [{ name: 'Conakry', communes: ['Kaloum', 'Dixinn', 'Matam', 'Ratoma', 'Matoto'] }, ...['Nzérékoré', 'Kankan', 'Kindia', 'Labé', 'Boké', 'Mamou', 'Faranah', 'Siguiri', 'Kissidougou', 'Guéckédou', 'Coyah', 'Dubréka'].map((name) => ({ name }))],
  GW: ['Bissau', 'Bafatá', 'Gabú', 'Bissorã', 'Bolama', 'Cacheu', 'Canchungo', 'Farim'].map((name) => ({ name })),
  CM: [
    { name: 'Douala', communes: roman.slice(0, 6).map((r) => `Douala ${r}`) },
    { name: 'Yaoundé', communes: roman.slice(0, 7).map((r) => `Yaoundé ${r}`) },
    ...['Garoua', 'Bamenda', 'Maroua', 'Bafoussam', 'Ngaoundéré', 'Bertoua', 'Kumba', 'Buea', 'Limbé', 'Nkongsamba', 'Ebolowa', 'Kribi', 'Edéa', 'Dschang'].map((name) => ({ name })),
  ],
  GA: [{ name: 'Libreville', communes: n('', 6, 'e arrondissement').map((s) => s.replace(/^1e /, '1er ')) }, ...['Port-Gentil', 'Franceville', 'Oyem', 'Moanda', 'Mouila', 'Lambaréné', 'Tchibanga', 'Koulamoutou', 'Makokou', 'Owendo', 'Akanda'].map((name) => ({ name }))],
  CG: ['Brazzaville', 'Pointe-Noire', 'Dolisie', 'Nkayi', 'Owando', 'Ouesso', 'Impfondo', 'Madingou', 'Sibiti', 'Kinkala', 'Oyo'].map((name) => ({ name })),
  CD: [
    {
      name: 'Kinshasa',
      communes: ['Bandalungwa', 'Barumbu', 'Bumbu', 'Gombe', 'Kalamu', 'Kasa-Vubu', 'Kimbanseke', 'Kinshasa', 'Kintambo', 'Kisenso', 'Lemba', 'Limete',
        'Lingwala', 'Makala', 'Maluku', 'Masina', 'Matete', 'Mont-Ngafula', 'Ndjili', 'Ngaba', 'Ngaliema', 'Ngiri-Ngiri', 'Nsele', 'Selembao'],
    },
    ...['Lubumbashi', 'Mbuji-Mayi', 'Kananga', 'Kisangani', 'Bukavu', 'Goma', 'Kolwezi', 'Likasi', 'Tshikapa', 'Matadi', 'Mbandaka', 'Uvira', 'Butembo', 'Kikwit', 'Boma', 'Bunia'].map((name) => ({ name })),
  ],
  CF: ['Bangui', 'Bimbo', 'Berbérati', 'Carnot', 'Bambari', 'Bouar', 'Bossangoa', 'Bria', 'Bangassou'].map((name) => ({ name })),
  TD: ["N'Djamena", 'Moundou', 'Sarh', 'Abéché', 'Kélo', 'Koumra', 'Pala', 'Am Timan', 'Bongor', 'Mongo'].map((name) => ({ name })),
  GQ: ['Malabo', 'Bata', 'Ebebiyín', 'Aconibe', 'Añisoc', 'Luba', 'Mongomo', 'Ciudad de la Paz'].map((name) => ({ name })),
  ST: ['São Tomé', 'Santo Amaro', 'Neves', 'Santana', 'Trindade', 'Santo António'].map((name) => ({ name })),
  NG: ['Lagos', 'Abuja', 'Kano', 'Ibadan', 'Port Harcourt', 'Benin City', 'Kaduna', 'Enugu', 'Onitsha', 'Aba', 'Jos', 'Ilorin', 'Warri', 'Owerri', 'Calabar', 'Abeokuta', 'Uyo', 'Maiduguri', 'Zaria', 'Sokoto'].map((name) => ({ name })),
  GH: ['Accra', 'Kumasi', 'Tamale', 'Takoradi', 'Tema', 'Cape Coast', 'Sunyani', 'Ho', 'Koforidua', 'Obuasi', 'Techiman', 'Wa', 'Bolgatanga', 'Kasoa'].map((name) => ({ name })),
  LR: ['Monrovia', 'Gbarnga', 'Kakata', 'Buchanan', 'Harper', 'Zwedru', 'Voinjama', 'Ganta'].map((name) => ({ name })),
  SL: ['Freetown', 'Bo', 'Kenema', 'Makeni', 'Koidu', 'Port Loko', 'Waterloo', 'Kabala'].map((name) => ({ name })),
  GM: ['Banjul', 'Serekunda', 'Brikama', 'Bakau', 'Farafenni', 'Lamin', 'Basse Santa Su', 'Soma'].map((name) => ({ name })),
  CV: ['Praia', 'Mindelo', 'Santa Maria', 'Assomada', 'Espargos', 'São Filipe', 'Porto Novo', 'Tarrafal'].map((name) => ({ name })),
  MR: ['Nouakchott', 'Nouadhibou', 'Kiffa', 'Kaédi', 'Zouérat', 'Rosso', 'Atar', 'Néma', 'Sélibaby', 'Aleg'].map((name) => ({ name })),
  MA: ['Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Meknès', 'Oujda', 'Kénitra', 'Tétouan', 'Salé', 'Laâyoune', 'Nador', 'El Jadida', 'Béni Mellal'].map((name) => ({ name })),
  DZ: ['Alger', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Batna', 'Sétif', 'Sidi Bel Abbès', 'Biskra', 'Tlemcen', 'Béjaïa', 'Tizi Ouzou', 'Ouargla', 'Djelfa'].map((name) => ({ name })),
  TN: ['Tunis', 'Sfax', 'Sousse', 'Kairouan', 'Bizerte', 'Gabès', 'Ariana', 'Gafsa', 'Monastir', 'Nabeul', 'Ben Arous', 'Médenine'].map((name) => ({ name })),
  LY: ['Tripoli', 'Benghazi', 'Misrata', 'Tarhuna', 'Al Bayda', 'Zawiya', 'Sabha', 'Tobrouk', 'Syrte'].map((name) => ({ name })),
  EG: ['Le Caire', 'Alexandrie', 'Gizeh', 'Port-Saïd', 'Suez', 'Louxor', 'Assouan', 'Mansourah', 'Tanta', 'Ismaïlia', 'Zagazig', 'Hurghada'].map((name) => ({ name })),
  EH: ['Laâyoune', 'Dakhla', 'Smara', 'Boujdour'].map((name) => ({ name })),
  SD: ['Khartoum', 'Omdurman', 'Port-Soudan', 'Kassala', 'El Obeid', 'Nyala', 'Wad Madani', 'Al-Fashir', 'Gedaref'].map((name) => ({ name })),
  SS: ['Djouba', 'Wau', 'Malakal', 'Yei', 'Aweil', 'Bor', 'Rumbek', 'Torit'].map((name) => ({ name })),
  ET: ['Addis-Abeba', 'Dire Dawa', 'Mekele', 'Gondar', 'Adama', 'Hawassa', 'Bahir Dar', 'Jimma', 'Dessie', 'Jijiga'].map((name) => ({ name })),
  ER: ['Asmara', 'Keren', 'Massaoua', 'Assab', 'Mendefera', 'Barentu'].map((name) => ({ name })),
  DJ: ['Djibouti', 'Ali Sabieh', 'Tadjourah', 'Obock', 'Dikhil', 'Arta'].map((name) => ({ name })),
  SO: ['Mogadiscio', 'Hargeisa', 'Bosaso', 'Kismayo', 'Baidoa', 'Berbera', 'Galkayo', 'Garowe'].map((name) => ({ name })),
  KE: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika', 'Malindi', 'Kitale', 'Garissa', 'Nyeri', 'Machakos', 'Meru'].map((name) => ({ name })),
  UG: ['Kampala', 'Gulu', 'Lira', 'Mbarara', 'Jinja', 'Mbale', 'Masaka', 'Entebbe', 'Arua', 'Kasese', 'Fort Portal'].map((name) => ({ name })),
  TZ: ['Dar es Salam', 'Dodoma', 'Mwanza', 'Arusha', 'Zanzibar', 'Mbeya', 'Morogoro', 'Tanga', 'Moshi', 'Tabora', 'Kigoma'].map((name) => ({ name })),
  RW: [{ name: 'Kigali', communes: ['Gasabo', 'Kicukiro', 'Nyarugenge'] }, ...['Butare (Huye)', 'Gisenyi (Rubavu)', 'Ruhengeri (Musanze)', 'Muhanga', 'Byumba', 'Cyangugu (Rusizi)', 'Nyagatare', 'Rwamagana'].map((name) => ({ name }))],
  BI: ['Gitega', 'Bujumbura', 'Ngozi', 'Rumonge', 'Muyinga', 'Kayanza', 'Makamba', 'Bururi'].map((name) => ({ name })),
  AO: ['Luanda', 'Huambo', 'Lobito', 'Benguela', 'Lubango', 'Kuito', 'Malanje', 'Namibe', 'Cabinda', 'Uíge', 'Saurimo'].map((name) => ({ name })),
  ZM: ['Lusaka', 'Kitwe', 'Ndola', 'Kabwe', 'Chingola', 'Mufulira', 'Livingstone', 'Luanshya', 'Kasama', 'Chipata'].map((name) => ({ name })),
  ZW: ['Harare', 'Bulawayo', 'Chitungwiza', 'Mutare', 'Gweru', 'Kwekwe', 'Kadoma', 'Masvingo', 'Victoria Falls'].map((name) => ({ name })),
  MW: ['Lilongwe', 'Blantyre', 'Mzuzu', 'Zomba', 'Kasungu', 'Mangochi', 'Karonga', 'Salima'].map((name) => ({ name })),
  MZ: ['Maputo', 'Matola', 'Beira', 'Nampula', 'Chimoio', 'Nacala', 'Quelimane', 'Tete', 'Xai-Xai', 'Pemba', 'Inhambane', 'Lichinga'].map((name) => ({ name })),
  NA: ['Windhoek', 'Rundu', 'Walvis Bay', 'Swakopmund', 'Oshakati', 'Katima Mulilo', 'Rehoboth', 'Otjiwarongo', 'Keetmanshoop'].map((name) => ({ name })),
  BW: ['Gaborone', 'Francistown', 'Molepolole', 'Maun', 'Serowe', 'Selebi-Phikwe', 'Kanye', 'Mahalapye', 'Lobatse'].map((name) => ({ name })),
  ZA: ['Johannesburg', 'Le Cap', 'Durban', 'Pretoria', 'Port Elizabeth (Gqeberha)', 'Bloemfontein', 'East London', 'Soweto', 'Polokwane', 'Nelspruit (Mbombela)', 'Kimberley', 'Pietermaritzburg'].map((name) => ({ name })),
  LS: ['Maseru', 'Teyateyaneng', 'Mafeteng', 'Hlotse', "Mohale's Hoek", 'Maputsoe', 'Qacha\'s Nek'].map((name) => ({ name })),
  SZ: ['Mbabane', 'Manzini', 'Lobamba', 'Siteki', 'Nhlangano', 'Piggs Peak'].map((name) => ({ name })),
  MG: ['Antananarivo', 'Toamasina', 'Antsirabe', 'Fianarantsoa', 'Mahajanga', 'Toliara', 'Antsiranana', 'Ambovombe', 'Morondava', 'Nosy Be'].map((name) => ({ name })),
  MU: ['Port-Louis', 'Beau-Bassin Rose-Hill', 'Vacoas-Phoenix', 'Curepipe', 'Quatre Bornes', 'Mahébourg', 'Grand Baie', 'Triolet'].map((name) => ({ name })),
  SC: ['Victoria', 'Anse Boileau', 'Beau Vallon', 'Takamaka', 'Anse Royale', 'Praslin', 'La Digue'].map((name) => ({ name })),
  KM: ['Moroni', 'Mutsamudu', 'Fomboni', 'Domoni', 'Mitsamiouli', 'Ouani'].map((name) => ({ name })),
};
