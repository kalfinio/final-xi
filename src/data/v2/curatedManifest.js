// ---------------------------------------------------------------------------
// Curated catalogue manifest — LITERAL ordered membership.
//
// This is the single authority for which players belong to the curated Modern
// Mix pool, in exactly which order. It is a committed literal list generated
// once from the original (pre-correction) curated catalogue at commit 897efff
// and is NEVER calculated from tier, role, club, league or any other mutable
// player data at runtime: a quality/role correction can change how a member
// plays, never whether or where the member appears. Future membership changes
// must be explicit id additions/removals in a NEW catalogue revision with
// their own justification. (The historical tier/role admission predicate that
// originally chose these ids survives only as documentation in dbV2.test.js.)
// ---------------------------------------------------------------------------

export const MODERN_CURATED_R1_ORDERED_IDS = Object.freeze([
  'casillas', 'buffon', 'schmeichel', 'vandersar', 'kahn', 'valdes',
  'ricardo', 'cafu', 'danialves', 'lahm', 'zanetti', 'cannavaro',
  'robertocarlos', 'ashleycole', 'maldini', 'ramos', 'puyol', 'beckenbauer',
  'pepe', 'desailly', 'costacurta', 'stam', 'vidic', 'ferdinand',
  'thuram', 'makelele', 'pirlo', 'gattuso', 'deschamps', 'xabialonso',
  'yaya', 'vidal', 'khedira', 'keane', 'vieira', 'xavi',
  'iniesta', 'modric', 'kroos', 'gerrard', 'lampard', 'ballack',
  'seedorf', 'scholes', 'davids', 'deco', 'ozil', 'kaka',
  'zidane', 'ronaldinho', 'rivaldo', 'fabregas', 'robben', 'ribery',
  'bale', 'ronaldo', 'messi', 'henry', 'etoo', 'ibra',
  'inzaghi', 'shevchenko', 'benzema', 'torres', 'owen', 'drogba',
  'gerdmuller', 'vanbasten', 'romario', 'suarez', 'neymar', 'weah',
  'vannistelrooy', 'crespo', 'eusebio', 'cruyff', 'delpiero', 'raul',
  'maradona', 'pele', 'nazario', 'distefano', 'platini', 'alisson',
  'courtois', 'ederson', 'oblak', 'donnarumma', 'terstegen', 'maignan',
  'raya', 'bounou', 'hakimi', 'trent', 'walker', 'dumfries',
  'frimpong', 'wan_bissaka', 'kounde', 'theo', 'robertson', 'cucurella',
  'grimaldo', 'davies', 'gvardiol', 'balde', 'vandijk', 'saliba',
  'rudiger', 'konate', 'bastoni', 'marquinhos', 'dias', 'araujo',
  'cubarsi', 'schlotterbeck', 'tah', 'bremer', 'upamecano', 'gabrielmagalhaes',
  'rodri', 'caicedo', 'rice', 'zubimendi', 'wharton', 'gravenberch',
  'joaoneves', 'vitinha', 'onana_a', 'bissouma', 'bellingham', 'debruyne',
  'pedri', 'gavi', 'valverde', 'tchouameni', 'camavinga', 'wirtz',
  'musiala', 'odegaard', 'kimmich', 'stiller', 'mainoo', 'szoboszlai',
  'mac_allister', 'barella', 'bruno', 'frenkie', 'xavisimons', 'olise',
  'rogers', 'baleba', 'reijnders', 'salah', 'vinicius', 'saka',
  'rodrygo', 'yamal', 'raphinha', 'doue', 'kvara', 'nico',
  'gordon', 'mbeumo', 'cunha', 'son', 'leao', 'nkunku',
  'olmo', 'nusa', 'doku', 'bernardo', 'savinho', 'haaland',
  'mbappe', 'kane', 'lautaro', 'osimhen', 'gyokeres', 'isak',
  'sesko', 'jonathandavid', 'lewandowski', 'ekitike', 'watkins', 'thuram_m',
  'milinkovic', 'busquets', 'foden', 'palmer', 'endrick', 'guler',
  'havertz', 'timber', 'lewisskelly', 'marmoush', 'cherki', 'lookman',
  'mctominay', 'dybala', 'nicopaz', 'julianalvarez', 'griezmann', 'militao',
  'mendy_f', 'brahim', 'joangarcia', 'ferran', 'fermin', 'casado',
  'jmgimenez', 'baena', 'unaisimon', 'kubo', 'isco', 'trafford',
  'akanji', 'ake', 'stones', 'aitnouri', 'endo', 'calafiori',
  'white_b', 'merino', 'eze', 'nwaneri', 'sanchez_r', 'colwill',
  'james_r', 'enzo', 'lavia', 'joaopedro', 'estevao', 'onana_andre',
  'deligt', 'yoro', 'lisandro', 'casemiro', 'ugarte', 'diallo',
  'vicario', 'vandeven', 'romero_c', 'kudus', 'mateusfernandes', 'botman',
  'brunog', 'tonali', 'woltemade', 'emimartinez', 'kamara', 'paqueta',
  'bowen', 'verbruggen', 'mitoma', 'gibbs_white', 'murillo', 'guehi',
  'pickford', 'branthwaite', 'semenyo', 'huijsen', 'neuer', 'kim',
  'pavlovic', 'coman', 'luisdiaz', 'kobel', 'bensebaini', 'brandt',
  'adeyemi', 'guirassy', 'gulacsi', 'tapsoba', 'andrich', 'nubel',
  'undav', 'calhanoglu', 'dimarco', 'darmian', 'pulisic', 'yildiz',
  'locatelli', 'cambiaso', 'khthuram', 'conceicao', 'buongiorno', 'politano',
  'lukaku', 'svilar', 'kone_m', 'deketelaere', 'ederson_m', 'kean',
  'orsolini', 'chevalier', 'dembele', 'nunomendes', 'ruiz', 'zaireemery',
  'barcola', 'pacho', 'greenwood', 'hojbjerg', 'akliouche', 'zakaria',
  'malickfofana', 'andre_b', 'trubin', 'antonio_silva', 'samu', 'inacio',
  'morita', 'trincao', 'pote', 'perisic', 'saibari', 'icardi',
  'torreira', 'rubenneves', 'brozovic', 'joaofelix', 'kante', 'fabinho',
  'mahrez', 'depaul', 'pedro_fla', 'arrascaeta', 'rios', 'vitorroque',
  'ricolewis', 'mastantuono', 'udogie', 'mykolenko', 'wieffer', 'gakpo',
  'zabarnyi', 'raum', 'jashari', 'hjulmand', 'schouten',
])
