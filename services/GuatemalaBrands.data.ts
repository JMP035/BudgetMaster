// ─────────────────────────────────────────────────────────────
// DATOS DEL CATÁLOGO DE GUATEMALA (generado; módulo PURO)
// ─────────────────────────────────────────────────────────────
// Marcas, lugares y pasarelas que consume GuatemalaBrands.ts. Los alias van en minúsculas y
// sin tildes; coinciden por PREFIJO de palabras completas y las variantes sin espacios
// ("pollocampero") ya quedan cubiertas por el espacio opcional del índice.
// 'high' acepta la marca aunque sobre texto; 'medium' solo si el comercio es la marca exacta o lo
// que sobra parece una ubicación. Dos entradas con el mismo nombre = alias fuertes y alias débiles.
// Para ampliar: agregar objetos aquí (misma forma) — no hace falta tocar GuatemalaBrands.ts.

import type { GtBrand } from './GuatemalaBrands';

export const GT_BRANDS_DATA: GtBrand[] = [
  // ── Restaurantes y comida preparada (incluye delivery) ──
  { name: 'Ánfora', category: 'restaurant', confidence: 'high', aliases: ['anfora restaurante'] },
  { name: "Applebee's", category: 'restaurant', confidence: 'high', aliases: ['applebee'] },
  { name: "Bagelmen's", category: 'restaurant', confidence: 'medium', aliases: ['bagelmen'] },
  { name: 'Burger King', category: 'restaurant', confidence: 'high', aliases: ['burger k'] },
  { name: 'Burger King', category: 'restaurant', confidence: 'medium', aliases: ['bk'] },
  { name: 'Café Barista', category: 'restaurant', confidence: 'high', aliases: ['barista', 'barista coffee'] },
  {
    name: 'Café Condesa', category: 'restaurant', confidence: 'medium',
    aliases: [
      'condesa',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
  { name: "Carl's Jr", category: 'restaurant', confidence: 'high', aliases: ['carl jr', 'carls junior', 'carls'] },
  { name: "Chili's", category: 'restaurant', confidence: 'medium', aliases: ['chilis grill'] },
  { name: 'China Wok', category: 'restaurant', confidence: 'high', aliases: [] },
  { name: "Church's Chicken", category: 'restaurant', confidence: 'medium', aliases: ['churchs', 'church chicken'] },
  { name: 'Dairy Queen', category: 'restaurant', confidence: 'medium', aliases: ['dq'] },
  { name: "Denny's", category: 'restaurant', confidence: 'medium', aliases: [] },
  {
    name: "Domino's Pizza", category: 'restaurant', confidence: 'high',
    aliases: [
      'dominos', 'domino pizza', 'domino',
    ],
  },
  { name: "Dunkin'", category: 'restaurant', confidence: 'high', aliases: ['dunkin donuts', 'dunkin donut'] },
  { name: 'El Marinero', category: 'restaurant', confidence: 'medium', aliases: ['marinero'] },
  { name: 'El Portal', category: 'restaurant', confidence: 'medium', aliases: [] },
  { name: 'Go Green', category: 'restaurant', confidence: 'high', aliases: [] },
  { name: 'Gourmelt', category: 'restaurant', confidence: 'high', aliases: [] },
  { name: 'Hacienda de los Sánchez', category: 'restaurant', confidence: 'medium', aliases: ['hacienda sanchez'] },
  { name: 'Hacienda Real', category: 'restaurant', confidence: 'medium', aliases: [] },
  { name: 'Hooters', category: 'restaurant', confidence: 'medium', aliases: [] },
  { name: 'Hugo', category: 'restaurant', confidence: 'medium', aliases: ['hugo app', 'hugo tecnologia'] },
  { name: 'IHOP', category: 'restaurant', confidence: 'medium', aliases: [] },
  { name: 'Juan Valdez', category: 'restaurant', confidence: 'high', aliases: ['juan valdez cafe'] },
  { name: 'KFC', category: 'restaurant', confidence: 'high', aliases: ['kentucky fried chicken'] },
  { name: 'La Cocina', category: 'restaurant', confidence: 'medium', aliases: [] },
  {
    name: 'La Fonda de la Calle Real', category: 'restaurant', confidence: 'medium',
    aliases: [
      'fonda calle real', 'la fonda', 'fonda de la calle real',
    ],
  },
  { name: 'La Trama', category: 'restaurant', confidence: 'medium', aliases: [] },
  { name: 'Little Caesars', category: 'restaurant', confidence: 'high', aliases: ['little caesar', 'little ceasars'] },
  { name: 'Los Cebollines', category: 'restaurant', confidence: 'high', aliases: ['cebollines', 'cebollines grill'] },
  { name: "McDonald's", category: 'restaurant', confidence: 'high', aliases: ['mcdonald', 'mcdon'] },
  { name: "McDonald's", category: 'restaurant', confidence: 'medium', aliases: ['mcd'] },
  { name: 'Nacionsushi', category: 'restaurant', confidence: 'medium', aliases: [] },
  { name: "Papa John's", category: 'restaurant', confidence: 'high', aliases: ['papa john'] },
  { name: 'Parma', category: 'restaurant', confidence: 'medium', aliases: ['parma ristorante'] },
  { name: 'PedidosYa', category: 'restaurant', confidence: 'high', aliases: [] },
  { name: 'Pizza Hut', category: 'restaurant', confidence: 'high', aliases: ['pizza h'] },
  { name: 'Pollo Brujo', category: 'restaurant', confidence: 'high', aliases: [] },
  {
    name: 'Pollo Campero', category: 'restaurant', confidence: 'high',
    aliases: [
      'campero', 'p campero', 'pollo camp', 'campero express',
    ],
  },
  { name: 'Pollo Granjero', category: 'restaurant', confidence: 'high', aliases: ['granjero'] },
  { name: 'Pollolandia', category: 'restaurant', confidence: 'medium', aliases: [] },
  { name: 'Pollo Pinulito', category: 'restaurant', confidence: 'high', aliases: ['pinulito', 'grupo pinulito'] },
  { name: 'Pollo Rey', category: 'restaurant', confidence: 'medium', aliases: [] },
  { name: 'Rappi', category: 'restaurant', confidence: 'high', aliases: [] },
  {
    name: 'San Martín', category: 'restaurant', confidence: 'medium',
    aliases: [
      'san martin pan', 'san martin panaderia', 'san martin cafeteria', 'cafeterias san martin', 'sn martin',
      's martin',
    ],
    note: 'Panadería/cafetería San Martín (restaurante por decisión del usuario); "Hotel San Martin" no empieza con el alias.',
  },
  {
    name: 'Sarita', category: 'restaurant', confidence: 'high',
    aliases: [
      'restaurante sarita', 'sarita rest', 'heladeria sarita',
    ],
  },
  { name: 'Sbarro', category: 'restaurant', confidence: 'medium', aliases: [] },
  { name: 'Starbucks', category: 'restaurant', confidence: 'high', aliases: ['starbuck', 'sbux', 'starbucks coffee'] },
  { name: 'Subway', category: 'restaurant', confidence: 'high', aliases: [] },
  { name: 'Sushi Itto', category: 'restaurant', confidence: 'high', aliases: ['sushi ito', 'itto sushi'] },
  { name: 'Taco Bell', category: 'restaurant', confidence: 'high', aliases: [] },
  { name: 'Tarantella', category: 'restaurant', confidence: 'medium', aliases: [] },
  { name: 'TGI Fridays', category: 'restaurant', confidence: 'high', aliases: ['tgi friday', 'fridays', 'tgif'] },
  { name: "Tony Roma's", category: 'restaurant', confidence: 'medium', aliases: [] },
  { name: 'Tre Fratelli', category: 'restaurant', confidence: 'medium', aliases: [] },
  { name: 'Uber Eats', category: 'restaurant', confidence: 'high', aliases: ['uber eat'] },
  { name: "Wendy's", category: 'restaurant', confidence: 'high', aliases: ['wendy'] },

  // ── Comida: panaderías, pastelerías y mercados ──
  { name: 'Doña Luisa Xicotencatl', category: 'food', confidence: 'medium', aliases: ['dona luisa', 'xicotencatl'] },
  { name: 'Pastelería Milano', category: 'food', confidence: 'medium', aliases: ['milano pasteleria'] },

  // ── Supermercados y tiendas de conveniencia ──
  {
    name: 'Despensa de Don Juan', category: 'groceries', confidence: 'medium',
    aliases: [
      'despensa don juan', 'desp don juan', 'la despensa de don juan',
    ],
  },
  {
    name: 'Despensa Familiar', category: 'groceries', confidence: 'high',
    aliases: [
      'desp fam', 'desp familiar', 'despensa fam', 'despensa familiat', 'dispensa familiar',
    ],
  },
  { name: 'Dollar City', category: 'groceries', confidence: 'high', aliases: [] },
  { name: 'Econosuper', category: 'groceries', confidence: 'high', aliases: [] },
  {
    name: 'La Barata', category: 'groceries', confidence: 'medium',
    aliases: [
      'super la barata', 'supermercado la barata',
    ],
  },
  { name: 'La Bodegona', category: 'groceries', confidence: 'high', aliases: ['bodegona'] },
  {
    name: 'La Torre', category: 'groceries', confidence: 'medium',
    aliases: [
      'supermercados la torre', 'super la torre',
    ],
  },
  { name: 'Maxi Despensa', category: 'groceries', confidence: 'high', aliases: ['maxi desp', 'maxi despen'] },
  { name: 'Mi Súper Fresh', category: 'groceries', confidence: 'medium', aliases: ['super fresh'] },
  { name: 'Multimayoreo', category: 'groceries', confidence: 'medium', aliases: [] },
  { name: 'Paiz', category: 'groceries', confidence: 'high', aliases: ['hiper paiz', 'supermercados paiz'] },
  { name: 'PriceSmart', category: 'groceries', confidence: 'high', aliases: [] },
  { name: 'Shell Select', category: 'groceries', confidence: 'medium', aliases: ['select shell', 'tienda select'] },
  {
    name: 'Suma', category: 'groceries', confidence: 'medium',
    aliases: [
      'supermercados suma', 'super suma',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
  { name: 'Súper 24', category: 'groceries', confidence: 'high', aliases: ['super 24 horas', 'super veinticuatro'] },
  { name: 'Súper 7', category: 'groceries', confidence: 'medium', aliases: ['super siete'] },
  {
    name: 'Super del Barrio', category: 'groceries', confidence: 'high',
    aliases: [
      'super barrio', 'sup del barrio', 's del barrio',
    ],
  },
  { name: 'Tiendas 3B', category: 'groceries', confidence: 'medium', aliases: ['3b', 'tres b'] },
  { name: 'Unisuper', category: 'groceries', confidence: 'high', aliases: [] },
  { name: 'Walmart', category: 'groceries', confidence: 'high', aliases: ['walmart express'] },
  { name: 'Walmart', category: 'groceries', confidence: 'medium', aliases: ['wm'] },

  // ── Combustible ──
  { name: 'Chevron', category: 'fuel', confidence: 'high', aliases: [] },
  {
    name: 'Delta', category: 'fuel', confidence: 'medium',
    aliases: [
      'delta energy', 'gasolinera delta', 'delta gas',
    ],
    note: 'Fuel. "Delta Air Lines" es otra marca (alias más largo gana).',
  },
  { name: 'Esso', category: 'fuel', confidence: 'high', aliases: ['estacion esso'] },
  {
    name: 'Estación de Servicio', category: 'fuel', confidence: 'high',
    aliases: [
      'estaciones de servicio', 'estacion servicio', 'estacion serv', 'est de serv', 'est servicio', 'est serv',
    ],
  },
  { name: 'Gas Metropolitano', category: 'fuel', confidence: 'medium', aliases: [] },
  {
    name: 'Puma Energy', category: 'fuel', confidence: 'medium',
    aliases: [
      'puma', 'estacion puma', 'gasolinera puma',
    ],
    note: 'Fuel. "Puma Store"/"Puma Sport" (ropa deportiva) son otra marca; "Puma" suelto o con ubicación es la gasolinera.',
  },
  { name: 'Redipsa', category: 'fuel', confidence: 'high', aliases: [] },
  { name: 'Servicentro', category: 'fuel', confidence: 'high', aliases: [] },
  { name: 'Shell', category: 'fuel', confidence: 'high', aliases: ['e s shell', 'estacion shell', 'shell express'] },
  { name: 'Texaco', category: 'fuel', confidence: 'high', aliases: ['texaco express', 'estacion texaco'] },
  {
    name: 'Total', category: 'fuel', confidence: 'medium',
    aliases: [
      'totalenergies', 'gasolinera total',
    ],
    note: 'Fuel. "Total Play" no es combustible.',
  },
  { name: 'Tropigas', category: 'fuel', confidence: 'high', aliases: ['tropigas de guatemala'] },
  {
    name: 'Uno', category: 'fuel', confidence: 'medium',
    aliases: [
      'gasolinera uno', 'uno gasolineras', 'estacion uno', 'gasolineras uno',
    ],
    note: 'Gasolinera UNO: "uno" es una palabra común.',
  },
  { name: 'Zeta Gas', category: 'fuel', confidence: 'high', aliases: ['gas zeta', 'gas zeta sa'] },

  // ── Farmacias ──
  { name: 'Farmacias Batres', category: 'pharmacy', confidence: 'high', aliases: ['batres', 'farmacia batres'] },
  {
    name: 'Farmacias Carolina', category: 'pharmacy', confidence: 'medium',
    aliases: [
      'carolina', 'farmacia carolina',
    ],
  },
  {
    name: 'Farmacias Cruz Verde', category: 'pharmacy', confidence: 'high',
    aliases: [
      'cruz verde', 'farmacia cruz verde',
    ],
  },
  {
    name: 'Farmacias del Ahorro', category: 'pharmacy', confidence: 'medium',
    aliases: [
      'farmacia del ahorro', 'del ahorro',
    ],
  },
  { name: 'Farmacias Galeno', category: 'pharmacy', confidence: 'high', aliases: ['galeno', 'farmacia galeno'] },
  { name: 'Farmacias Kielsa', category: 'pharmacy', confidence: 'high', aliases: ['kielsa', 'farmacia kielsa'] },
  { name: 'Farmacias Meykos', category: 'pharmacy', confidence: 'high', aliases: ['meykos', 'farmacia meykos'] },
  { name: 'Farmacias Proam', category: 'pharmacy', confidence: 'medium', aliases: ['proam', 'farmacia proam'] },
  {
    name: 'Farmacias Similares', category: 'pharmacy', confidence: 'medium',
    aliases: [
      'similares', 'farmacia similar',
    ],
  },
  { name: 'Fayco', category: 'pharmacy', confidence: 'medium', aliases: ['farmacia fayco', 'farmacias fayco'] },

  // ── Salud ──
  { name: 'Centro Médico', category: 'health', confidence: 'medium', aliases: ['hospital centro medico'] },
  { name: 'Hospital Herrera Llerandi', category: 'health', confidence: 'medium', aliases: ['herrera llerandi'] },
  { name: 'Hospital La Paz', category: 'health', confidence: 'medium', aliases: [] },
  { name: 'Óptica Alpi', category: 'health', confidence: 'medium', aliases: ['alpi store', 'alpi'] },
  { name: 'Ópticas La Curacao', category: 'health', confidence: 'medium', aliases: ['optica la curacao'] },
  { name: 'Sanatorio El Pilar', category: 'health', confidence: 'medium', aliases: ['el pilar'] },

  // ── Compras ──
  { name: 'AliExpress', category: 'shopping', confidence: 'high', aliases: [] },
  {
    name: 'Amazon', category: 'shopping', confidence: 'high',
    aliases: [
      'amzn', 'amazon mktplace', 'amazon mktplace pmts', 'amazon com', 'amzn mktp',
    ],
  },
  { name: 'Artemis Edinter', category: 'shopping', confidence: 'medium', aliases: ['edinter'] },
  { name: 'Cemaco', category: 'shopping', confidence: 'high', aliases: [] },
  { name: 'Construrama', category: 'shopping', confidence: 'medium', aliases: [] },
  { name: 'eBay', category: 'shopping', confidence: 'high', aliases: [] },
  { name: 'Elektra', category: 'shopping', confidence: 'high', aliases: ['tiendas elektra'] },
  { name: 'La Curacao', category: 'shopping', confidence: 'high', aliases: ['curacao', 'la curacao cash'] },
  {
    name: 'Librería Sophos', category: 'shopping', confidence: 'medium',
    aliases: [
      'sophos',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
  {
    name: 'Max', category: 'shopping', confidence: 'medium',
    aliases: [
      'tiendas max', 'max tiendas', 'almacenes max',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
  { name: 'Mercado Libre', category: 'shopping', confidence: 'high', aliases: [] },
  { name: 'Novex', category: 'shopping', confidence: 'medium', aliases: [] },
  { name: 'Office Depot', category: 'shopping', confidence: 'medium', aliases: [] },
  { name: 'Pacifiko', category: 'shopping', confidence: 'high', aliases: [] },
  { name: 'Shein', category: 'shopping', confidence: 'high', aliases: [] },
  { name: 'Siman', category: 'shopping', confidence: 'high', aliases: ['almacenes siman', 'siman express'] },
  { name: 'Temu', category: 'shopping', confidence: 'high', aliases: [] },

  // ── Tecnología ──
  {
    name: 'Click', category: 'tech', confidence: 'medium',
    aliases: [
      'click tecnologia',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
  { name: 'Intelaf', category: 'tech', confidence: 'high', aliases: ['intelaf outlet'] },
  { name: 'iStore', category: 'tech', confidence: 'medium', aliases: [] },
  { name: 'Kemik', category: 'tech', confidence: 'medium', aliases: [] },
  { name: 'Macrosistemas', category: 'tech', confidence: 'medium', aliases: [] },
  { name: 'Punto Naranja', category: 'tech', confidence: 'medium', aliases: [] },
  { name: 'RadioShack', category: 'tech', confidence: 'medium', aliases: [] },
  { name: 'Steren', category: 'tech', confidence: 'medium', aliases: [] },

  // ── Ropa y calzado ──
  { name: 'Adidas', category: 'clothes', confidence: 'high', aliases: ['adidas store'] },
  { name: 'American Eagle', category: 'clothes', confidence: 'medium', aliases: ['american eagle outfitters'] },
  { name: 'Bershka', category: 'clothes', confidence: 'high', aliases: [] },
  { name: 'Bimba y Lola', category: 'clothes', confidence: 'medium', aliases: ['bimba lola'] },
  {
    name: 'Cuadra', category: 'clothes', confidence: 'medium',
    aliases: [
      'botas cuadra', 'cuadra boots',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
  { name: 'Forever 21', category: 'clothes', confidence: 'medium', aliases: ['f21'] },
  { name: 'H&M', category: 'clothes', confidence: 'medium', aliases: [] },
  { name: 'La Megapaca', category: 'clothes', confidence: 'high', aliases: ['megapaca', 'paca'] },
  { name: "Levi's", category: 'clothes', confidence: 'high', aliases: ['levi strauss'] },
  {
    name: 'Mango', category: 'clothes', confidence: 'medium',
    aliases: [
      'mango outlet',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
  { name: 'Nike', category: 'clothes', confidence: 'high', aliases: ['nike store'] },
  { name: 'Payless', category: 'clothes', confidence: 'medium', aliases: ['payless shoesource'] },
  { name: 'Pull&Bear', category: 'clothes', confidence: 'high', aliases: ['pull and bear'] },
  {
    name: 'Puma Store', category: 'clothes', confidence: 'medium',
    aliases: [
      'puma ropa deportiva', 'puma sport', 'puma tienda', 'puma outlet',
    ],
  },
  { name: 'Skechers', category: 'clothes', confidence: 'medium', aliases: ['sketchers'] },
  { name: 'Stradivarius', category: 'clothes', confidence: 'high', aliases: [] },
  {
    name: 'Tommy Hilfiger', category: 'clothes', confidence: 'medium',
    aliases: [
      'tommy',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
  { name: 'Zara', category: 'clothes', confidence: 'high', aliases: [] },

  // ── Entretenimiento ──
  { name: 'Cinemark', category: 'entertainment', confidence: 'high', aliases: [] },
  { name: 'Cinépolis', category: 'entertainment', confidence: 'high', aliases: ['cinepolis vip'] },
  { name: 'Epic Games', category: 'entertainment', confidence: 'medium', aliases: [] },
  {
    name: 'IRTRA', category: 'entertainment', confidence: 'high',
    aliases: [
      'irtra xetulul xocomil', 'xetulul', 'xocomil', 'xejuyup', 'mundo petapa',
    ],
  },
  { name: 'Nintendo', category: 'entertainment', confidence: 'high', aliases: ['nintendo eshop'] },
  {
    name: 'PlayStation', category: 'entertainment', confidence: 'high',
    aliases: [
      'playstation network', 'sony playstation',
    ],
  },
  { name: 'PlayStation', category: 'entertainment', confidence: 'medium', aliases: ['psn'] },
  { name: 'Riot Games', category: 'entertainment', confidence: 'medium', aliases: [] },
  { name: 'Roblox', category: 'entertainment', confidence: 'medium', aliases: [] },
  { name: 'Steam', category: 'entertainment', confidence: 'high', aliases: ['steam games', 'steampowered'] },
  { name: 'Xbox', category: 'entertainment', confidence: 'high', aliases: ['xbox game pass', 'xbox live'] },

  // ── Streaming ──
  { name: 'Amazon Prime Video', category: 'streaming', confidence: 'high', aliases: ['prime video', 'amazon prime'] },
  { name: 'Apple Music', category: 'streaming', confidence: 'medium', aliases: [] },
  { name: 'Apple TV', category: 'streaming', confidence: 'high', aliases: [] },
  { name: 'Audible', category: 'streaming', confidence: 'medium', aliases: [] },
  { name: 'Claro Video', category: 'streaming', confidence: 'medium', aliases: [] },
  { name: 'Crunchyroll', category: 'streaming', confidence: 'high', aliases: [] },
  { name: 'Deezer', category: 'streaming', confidence: 'medium', aliases: [] },
  { name: 'Disney+', category: 'streaming', confidence: 'high', aliases: ['disney plus'] },
  { name: 'HBO Max', category: 'streaming', confidence: 'high', aliases: ['hbo', 'max com'] },
  { name: 'Netflix', category: 'streaming', confidence: 'high', aliases: ['netflix com'] },
  { name: 'Paramount+', category: 'streaming', confidence: 'high', aliases: ['paramount plus'] },
  { name: 'Spotify', category: 'streaming', confidence: 'high', aliases: ['spotify ab'] },
  {
    name: 'Star Plus', category: 'streaming', confidence: 'medium',
    aliases: [
      'star',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
  { name: 'Twitch', category: 'streaming', confidence: 'medium', aliases: ['twitch interactive'] },
  { name: 'ViX', category: 'streaming', confidence: 'high', aliases: ['vix plus'] },
  { name: 'YouTube Premium', category: 'streaming', confidence: 'high', aliases: ['youtube', 'google youtube'] },

  // ── Suscripciones y software ──
  { name: '1Password', category: 'subscriptions', confidence: 'medium', aliases: ['one password'] },
  { name: 'Adobe', category: 'subscriptions', confidence: 'high', aliases: ['adobe creative cloud', 'adobe systems'] },
  { name: 'Amazon Web Services', category: 'subscriptions', confidence: 'medium', aliases: ['aws', 'amazon aws'] },
  {
    name: 'Anthropic', category: 'subscriptions', confidence: 'high',
    aliases: [
      'claude', 'anthropic claude', 'claude ai', 'anthropic pbc',
    ],
  },
  {
    name: 'Apple Services', category: 'subscriptions', confidence: 'high',
    aliases: [
      'apple app store icloud', 'apple com bill', 'itunes', 'app store',
    ],
  },
  { name: 'Canva', category: 'subscriptions', confidence: 'high', aliases: [] },
  {
    name: 'Cursor', category: 'subscriptions', confidence: 'medium',
    aliases: [
      'cursor ai', 'anysphere',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
  { name: 'Dropbox', category: 'subscriptions', confidence: 'high', aliases: [] },
  { name: 'Duolingo', category: 'subscriptions', confidence: 'high', aliases: [] },
  { name: 'ExpressVPN', category: 'subscriptions', confidence: 'medium', aliases: [] },
  { name: 'Figma', category: 'subscriptions', confidence: 'medium', aliases: [] },
  { name: 'GitHub', category: 'subscriptions', confidence: 'high', aliases: ['github inc', 'github copilot'] },
  { name: 'GoDaddy', category: 'subscriptions', confidence: 'medium', aliases: [] },
  {
    name: 'Google', category: 'subscriptions', confidence: 'medium',
    aliases: [
      'google one play', 'google storage', 'google workspace', 'google cloud',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
  { name: 'Google One', category: 'subscriptions', confidence: 'high', aliases: [] },
  { name: 'Google Play', category: 'subscriptions', confidence: 'high', aliases: [] },
  { name: 'Grammarly', category: 'subscriptions', confidence: 'medium', aliases: [] },
  { name: 'iCloud', category: 'subscriptions', confidence: 'high', aliases: [] },
  { name: 'LinkedIn', category: 'subscriptions', confidence: 'medium', aliases: ['linkedin premium'] },
  {
    name: 'Microsoft', category: 'subscriptions', confidence: 'high',
    aliases: [
      'office 365', 'microsoft 365', 'msft',
    ],
  },
  { name: 'Midjourney', category: 'subscriptions', confidence: 'medium', aliases: [] },
  { name: 'Namecheap', category: 'subscriptions', confidence: 'medium', aliases: [] },
  { name: 'NordVPN', category: 'subscriptions', confidence: 'medium', aliases: ['nordsec'] },
  { name: 'Notion', category: 'subscriptions', confidence: 'high', aliases: ['notion labs'] },
  {
    name: 'OpenAI', category: 'subscriptions', confidence: 'high',
    aliases: [
      'chatgpt', 'openai chatgpt', 'chatgpt subscr',
    ],
  },
  { name: 'Patreon', category: 'subscriptions', confidence: 'medium', aliases: [] },
  { name: 'Perplexity', category: 'subscriptions', confidence: 'medium', aliases: ['perplexity ai'] },
  { name: 'Replit', category: 'subscriptions', confidence: 'medium', aliases: [] },
  { name: 'Slack', category: 'subscriptions', confidence: 'medium', aliases: [] },
  { name: 'Substack', category: 'subscriptions', confidence: 'medium', aliases: [] },
  { name: 'Vercel', category: 'subscriptions', confidence: 'medium', aliases: [] },
  { name: 'Zoom', category: 'subscriptions', confidence: 'medium', aliases: ['zoom us'] },

  // ── Internet y telefonía ──
  { name: 'Cable Color', category: 'internet', confidence: 'medium', aliases: [] },
  {
    name: 'Claro', category: 'internet', confidence: 'medium',
    aliases: [
      'claro hogar', 'claro movil',
    ],
    note: 'Telefonía Claro; "claro" también es una palabra común.',
  },
  { name: 'Fibernet', category: 'internet', confidence: 'medium', aliases: [] },
  { name: 'Movistar', category: 'internet', confidence: 'high', aliases: ['telefonica'] },
  { name: 'Starlink', category: 'internet', confidence: 'high', aliases: ['starlink internet'] },
  { name: 'Telgua', category: 'internet', confidence: 'high', aliases: ['telgua agen', 'telgua agencia'] },
  {
    name: 'Tigo', category: 'internet', confidence: 'high',
    aliases: [
      'tigo residencial', 'tigo hogar', 'tigo star', 'tigo movil',
    ],
  },
  { name: 'Tigo', category: 'internet', confidence: 'medium', aliases: ['tgo'] },

  // ── Servicios (luz, agua, municipalidad) ──
  { name: 'Deocsa', category: 'utilities', confidence: 'high', aliases: [] },
  { name: 'Deorsa', category: 'utilities', confidence: 'high', aliases: [] },
  {
    name: 'EEGSA', category: 'utilities', confidence: 'high',
    aliases: [
      'empresa electrica de guatemala', 'eegsa web',
    ],
  },
  { name: 'Empagua', category: 'utilities', confidence: 'high', aliases: ['pago empagua'] },
  { name: 'Energuate', category: 'utilities', confidence: 'high', aliases: ['energuate web'] },
  {
    name: 'Municipalidad de Guatemala', category: 'utilities', confidence: 'medium',
    aliases: [
      'municipalidad', 'muni guate', 'muni de guatemala',
    ],
  },

  // ── Transporte ──
  {
    name: 'Autopista Palín-Escuintla', category: 'transport', confidence: 'medium',
    aliases: [
      'autopista palin', 'peaje palin', 'peaje escuintla',
    ],
  },
  { name: 'Avis', category: 'transport', confidence: 'medium', aliases: ['avis rent a car'] },
  { name: 'Budget Rent a Car', category: 'transport', confidence: 'medium', aliases: ['budget rent', 'budget car'] },
  { name: 'Fuente del Norte', category: 'transport', confidence: 'medium', aliases: ['transportes fuente del norte'] },
  { name: 'Hertz', category: 'transport', confidence: 'medium', aliases: ['hertz rent a car'] },
  { name: 'InDrive', category: 'transport', confidence: 'high', aliases: ['indriver'] },
  { name: 'Línea Dorada', category: 'transport', confidence: 'medium', aliases: [] },
  { name: 'Litegua', category: 'transport', confidence: 'medium', aliases: [] },
  { name: 'Transmetro', category: 'transport', confidence: 'high', aliases: [] },
  { name: 'TuMuni', category: 'transport', confidence: 'medium', aliases: ['muni transit'] },
  { name: 'Uber', category: 'transport', confidence: 'high', aliases: ['uber trip', 'uber technologies', 'uber bv'] },
  { name: 'Yango', category: 'transport', confidence: 'high', aliases: [] },

  // ── Viajes ──
  { name: 'Aeroméxico', category: 'travel', confidence: 'medium', aliases: [] },
  {
    name: 'Aeropuerto La Aurora', category: 'travel', confidence: 'medium',
    aliases: [
      'aeropuerto internacional la aurora', 'la aurora', 'aeropuerto',
    ],
  },
  { name: 'Airbnb', category: 'travel', confidence: 'high', aliases: [] },
  { name: 'American Airlines', category: 'travel', confidence: 'high', aliases: ['american air'] },
  { name: 'American Airlines', category: 'travel', confidence: 'medium', aliases: ['aa'] },
  { name: 'Avianca', category: 'travel', confidence: 'high', aliases: ['avianca taca', 'taca', 'avianca airlines'] },
  { name: 'Barceló Guatemala City', category: 'travel', confidence: 'medium', aliases: ['barcelo'] },
  { name: 'Booking.com', category: 'travel', confidence: 'high', aliases: ['booking'] },
  { name: 'Camino Real Antigua', category: 'travel', confidence: 'medium', aliases: ['hotel camino real antigua'] },
  { name: 'Casa Santo Domingo', category: 'travel', confidence: 'medium', aliases: [] },
  {
    name: 'Copa Airlines', category: 'travel', confidence: 'medium',
    aliases: [
      'copa air', 'copa',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
  { name: 'Delta Air Lines', category: 'travel', confidence: 'medium', aliases: ['delta air'] },
  { name: 'Despegar', category: 'travel', confidence: 'medium', aliases: ['despegar com'] },
  { name: 'Expedia', category: 'travel', confidence: 'high', aliases: [] },
  { name: 'Hilton', category: 'travel', confidence: 'medium', aliases: [] },
  { name: 'Holiday Inn', category: 'travel', confidence: 'medium', aliases: [] },
  { name: 'InterContinental Real', category: 'travel', confidence: 'medium', aliases: ['intercontinental'] },
  { name: 'Marriott', category: 'travel', confidence: 'medium', aliases: ['jw marriott'] },
  { name: 'Radisson', category: 'travel', confidence: 'medium', aliases: [] },
  { name: 'Spirit Airlines', category: 'travel', confidence: 'medium', aliases: ['spirit air'] },
  {
    name: 'TAG Airlines', category: 'travel', confidence: 'medium',
    aliases: [
      'tag',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
  { name: 'United Airlines', category: 'travel', confidence: 'high', aliases: ['united air'] },
  {
    name: 'United Airlines', category: 'travel', confidence: 'medium',
    aliases: [
      'united',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
  { name: 'Volaris', category: 'travel', confidence: 'high', aliases: ['volaris costa rica'] },
  {
    name: 'Westin Camino Real', category: 'travel', confidence: 'high',
    aliases: [
      'hotel camino real', 'camino real', 'westin guatemala', 'hotel westin',
    ],
  },

  // ── Educación ──
  {
    name: 'Colegio Americano de Guatemala', category: 'education', confidence: 'medium',
    aliases: [
      'colegio americano',
    ],
  },
  { name: 'Coursera', category: 'education', confidence: 'medium', aliases: [] },
  { name: 'Intecap', category: 'education', confidence: 'medium', aliases: [] },
  { name: 'Liceo Guatemala', category: 'education', confidence: 'medium', aliases: [] },
  { name: 'Platzi', category: 'education', confidence: 'medium', aliases: [] },
  { name: 'Udemy', category: 'education', confidence: 'medium', aliases: [] },
  { name: 'Universidad del Istmo', category: 'education', confidence: 'medium', aliases: ['unis'] },
  {
    name: 'Universidad del Valle de Guatemala', category: 'education', confidence: 'high',
    aliases: [
      'universidad del valle', 'uvg', 'udv',
    ],
  },
  {
    name: 'Universidad de San Carlos', category: 'education', confidence: 'high',
    aliases: [
      'usac', 'universidad san carlos', 'san carlos de guatemala',
    ],
  },
  {
    name: 'Universidad Francisco Marroquín', category: 'education', confidence: 'high',
    aliases: [
      'ufm', 'u francisco marroquin',
    ],
  },
  { name: 'Universidad Galileo', category: 'education', confidence: 'high', aliases: ['galileo', 'ug galileo'] },
  { name: 'Universidad Mariano Gálvez', category: 'education', confidence: 'high', aliases: ['umg', 'mariano galvez'] },
  { name: 'Universidad Mesoamericana', category: 'education', confidence: 'high', aliases: ['mesoamericana'] },
  { name: 'Universidad Panamericana', category: 'education', confidence: 'high', aliases: ['upana'] },
  {
    name: 'Universidad Rafael Landívar', category: 'education', confidence: 'high',
    aliases: [
      'url', 'rafael landivar', 'u rafael landivar',
    ],
  },
  { name: 'Universidad Rural', category: 'education', confidence: 'medium', aliases: [] },

  // ── Otros ──
  {
    name: 'SAT', category: 'other', confidence: 'medium',
    aliases: [
      'superintendencia de administracion tributaria',
    ],
    note: 'Alias corto o palabra común: solo si es el comercio exacto o sobra una ubicación.',
  },
];

/** Lugares inequívocos (colonias, centros comerciales, municipios, vías) y zonas. "Zona N"/"ZN" además se detectan por patrón. */
export const GT_PLACES_DATA: string[] = [
  '4g norte', '4 grados', '4 grados norte', '6a av', '6a avenida', '6 avenida', 'aguilar batres',
  'alta verapaz', 'amatitlan', 'anillo periferico', 'ant guatemala', 'antigua', 'antigua guatemala', 'Arkadia',
  'arkadia shopping', 'Atanasio Tzul', 'atitlan', 'ave las americas', 'avenida la reforma',
  'avenida las americas', 'avenida petapa', 'ave petapa', 'ave reforma', 'av la reforma', 'av las americas',
  'av petapa', 'ayampuc', 'baja verapaz', 'blvd liberacion', 'blvd los proceres', 'blvd vista hermosa',
  'bosques de san nicolas', 'bosques san nicolas', 'boulevard los proceres', 'bulevar liberacion',
  'bulevar los proceres', 'bulevar vista hermosa', 'ca 1', 'calle atanasio tzul', 'cal roosevelt',
  'calzada aguilar batres', 'calzada atanasio tzul', 'calzada la paz', 'calzada petapa', 'calzada roosevelt',
  'calzada san juan', 'calz aguilar batres', 'calz atanasio tzul', 'calz la paz', 'calz roosevelt',
  'calz san juan', 'car a el salvador', 'car atlantico', 'carr a el salvador', 'carr al atlantico',
  'carretera a el salv', 'Carretera a El Salvador', 'carretera al atlantico', 'carretera atlantico',
  'carretera el salvador', 'carretera interamericana', 'carr interamericana', 'catarina pinula', 'Cayalá',
  'cc miraflores', 'cc naranjo', 'cc pradera', 'cc proceres', 'cc tikal futura', 'cdad de guatemala',
  'cd de guatemala', 'cd guatemala', 'centro comercial los proceres', 'centro comercial miraflores',
  'centro comercial pradera', 'centro historico', 'chichicastenango', 'chimal', 'chimaltenango', 'chinautla',
  'chiquimula', 'ciudad cayala', 'Ciudad de Guatemala', 'ciudad guatemala', 'ciudad quetzal', 'coatepeque',
  'coban', 'cotzumalguapa', 'cuatro grados', 'cuatro grados norte', 'el rancho', 'Escuintla', 'esquipulas',
  'estados unidos', 'fontabella', 'Fraijanes', 'galerias prima', 'galerias primma', 'gran centro los proceres',
  'Guate', 'Guatemala', 'hotel tikal futura', 'huehue', 'huehuete', 'huehuetenango', 'interamericana', 'izabal',
  'jalapa', 'jocotenango', 'jutiapa', 'lago de atitlan', 'Las Américas', 'las majadas', 'las plazas majadas',
  'la zona viva', 'livingston', 'lomas de pamplona', 'Los Próceres', 'Majadas', 'mazate', 'mazatenango',
  'Metrocentro', 'metrocentro outlet', 'metrocentro villa nueva', 'Metronorte', 'metroplaza', 'miami',
  'Miraflores', 'miraflores mall', 'Mixco', 'mixco guate', 'mixco mall', 'mixco plaza', 'mixco z',
  'naranjo mall', 'novicentro', 'Oakland', 'oakland mall', 'oakland place', 'palencia', 'panajachel',
  'parque las americas', 'parque majadas', 'paseo cayala', 'paseo las americas', 'paseo la sexta',
  'paseo san sebas', 'paseo san sebastian', 'patzun', 'Periférico', 'periferico z11', 'peri roosevelt',
  'petapa', 'peten', 'plaza fontabella', 'plaza majadas', 'pradera chimaltenango', 'pradera conce',
  'pradera concep', 'pradera concepcion', 'pradera escuintla', 'pradera huehuetenango', 'pradera mall',
  'pradera quetzaltenango', 'pradera xela', 'pradera z10', 'pradera zona 10', 'primma', 'proceres',
  'puerto barrios', 'puerto san jose', 'Quetzaltenango', 'quezaltenango', 'quiche', 'retalhuleu', 'rio dulce',
  'sacatepequez', 'salama', 'San José Pinula', 'san juan sac', 'san juan sacatepequez', 'san lucas',
  'san lucas sacatepequez', 'san miguel petapa', 'san pedro ayampuc', 'san pedro la laguna', 'san pedro sac',
  'san pedro sacatepequez', 'san raymundo', 'santa catarina', 'Santa Catarina Pinula', 'santa cruz del quiche',
  'santa lucia cotzumalguapa', 'sayaxche', 'seattle', 'sexta av', 'sexta avenida', 'siquinala', 's jose pinula',
  'sj pinula', 's juan sacatepequez', 's lucas', 's miguel petapa', 'solola', 's pedro sacatepequez',
  'sta catarina pinula', 'sta cruz del quiche', 'sta lucia cotzumalguapa', 'suchitepequez', 'sumpango',
  'tecpan', 'tecpan guatemala', 'teculutan', 'tikal futura', 'totonicapan', 'usa', 'v canales', 'villa canales',
  'Villa Nueva', 'vil nueva', 'vista hermosa', 'v nueva', 'xela', 'z1', 'z10', 'z11', 'z12', 'z13', 'z14',
  'z15', 'z16', 'z17', 'z18', 'z19', 'z2', 'z20', 'z21', 'z22', 'z23', 'z24', 'z25', 'z3', 'z4', 'z5', 'z6',
  'z7', 'z8', 'z9', 'zacapa', 'zona 1', 'zona 10', 'zona 11', 'zona 12', 'zona 13', 'zona 14', 'zona 15',
  'zona 16', 'zona 17', 'zona 18', 'zona 19', 'zona 2', 'zona 20', 'zona 21', 'zona 22', 'zona 23', 'zona 24',
  'zona 25', 'zona 3', 'zona 4', 'zona 5', 'zona 6', 'zona 7', 'zona 8', 'zona 9', 'zona viva',
];

/**
 * Lugares que también son apellidos o palabras comunes: splitLocation solo los trata como ubicación si antes
 * hay al menos un token de marca/nombre, y NUNCA si el nombre quedaría vacío.
 */
export const GT_AMBIGUOUS_PLACES: string[] = [
  'aeropuerto internacional la aurora', 'aeropuerto la aurora', 'Aranda', 'barberena', 'cc la estacion',
  'cc portales', 'cc santa clara', 'cc utatlan', 'centra norte', 'centro comercial portales',
  'centro comercial santa clara', 'chiquimulilla', 'ciudad san cristobal', 'ciudad utatlan', 'ciudad vieja',
  'cuilapa', 'dublin', 'dublin ie', 'el progreso', 'guastatoya', 'Interplaza', 'interplaza escuintla',
  'interplaza xela', 'kilometro 15', 'km 15', 'la aurora', 'la democracia', 'la estacion', 'la florida',
  'la ronda', 'la sexta', 'las plazas', 'Montserrat', 'paseo la ronda', 'Peri', 'plaza san nicolas',
  'plz san nico', 'plz san nicolas', 'Portales', 'Pradera', 'Roosevelt', 'sanarate', 'San Cristóbal',
  'san francisco', 'san francisco ca', 'san marcos', 'san nicolas', 'sansare', 'santa clara', 'santa rosa',
  'Utatlán', 'villa hermosa',
];

/** Pasarelas de pago: prefijo del comercio real ("PAYPAL *SPOTIFY"); no clasifican por sí solas. */
export const GT_GATEWAYS_DATA: string[] = [
  'mercado pago', 'neonet', 'Pagadito', 'pagalo', 'pagalo gt', 'Paggo', 'Paggo App', 'PayPal', 'PG', 'shopify',
  'SQ', 'Square', 'Stripe', 'sumup', 'tigo money', 'tigo money tigo pay', 'tigo pay', 'visanet', 'visanet gt',
  'visanet guatemala',
];
