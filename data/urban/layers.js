/**
 * The seven analytical layers of the Singapore urban analysis board.
 *
 * Geometry comes from OpenStreetMap via tools/bake_urban.py. Analytical
 * classifications (growth areas, the "core" box, density scores) are derived
 * or hand-traced and are marked indicative in the copy below.
 *
 * Layer order: L-01 is the top of the exploded stack, L-07 the bottom.
 */

export const SHEET = {
  designation: 'SINGAPORE',
  type: 'MULTI-DIMENSIONAL URBAN ANALYSIS',
  subtitle: 'Exploded axonometric · Seven analytical layers',
  docNo: 'SG-UA-001',
  rev: 'A',
  scale: '1 : 100 000',
  sheet: '01 / 01',
  status: 'ANALYTICAL',
};

export const COLORS = {
  plate: 0xf3ede2,
  plateRegion: 0xe9ebee,
  outline: 0x6b665c,
  natural: { forest: 0x7fb872, park: 0xa9cf9a, open: 0xcfe3c4, water: 0x8ccfc6, contour: 0xd9d9d9 },
  landuse: {
    residential: 0xe8562a, commercial: 0xf2a08a, mixed: 0x9b6fc3,
    institutional: 0x4a7fd1, park: 0x8cc27a, core: 0xd9480f,
  },
  transport: { primary: 0x111111, rail: 0x8e44ad, secondary: 0x3b6fd1 },
  growth: { recent: 0xf6b87a, future: 0xe8731a, renewal: 0xf29c8a },
  density: [0xdbe9f7, 0x9ec3e6, 0x5e96d1, 0x2f66b3, 0x123c80],
  fabric: 0x111111,
  region: { land: 0xd8dbcf, coast: 0x8a8f99 },
};

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export const GROUPS = [{ id: 'layers', label: 'Analysis layers' }];

export const PARTS = [
  {
    id: 'L-01', group: 'layers', name: 'Natural systems', qty: 1,
    material: 'OSM parks, reserves, water · SRTM contours', mass: 'Layer I',
    explode: [0, 30, 0], files: ['coast', 'water', 'parks', 'contours'],
    spec: 'The green and blue skeleton the city is built around: the central catchment reserves, the coastal parks, the reservoirs and the canalised rivers that drain them.',
    note: 'Contours are real, at 20 m intervals, derived from SRTM elevation via AWS Terrarium tiles. Park kinds follow OSM tagging, which is uneven outside the major reserves.',
    legend: [
      { swatch: hex(0x7fb872), label: 'Nature reserve / forest' },
      { swatch: hex(0xa9cf9a), label: 'Park / garden' },
      { swatch: hex(0xcfe3c4), label: 'Open green' },
      { swatch: hex(0x8ccfc6), label: 'Water body' },
      { swatch: hex(0xd9d9d9), label: 'Contour (20 m)' },
    ],
  },
  {
    id: 'L-02', group: 'layers', name: 'Land use functions', qty: 1,
    material: 'OSM landuse + amenity polygons', mass: 'Layer II',
    explode: [0, 25, 0], files: ['coast', 'landuse', 'parks'],
    spec: 'Functional zoning: the housing estates ringing the island, industrial Jurong and Tuas mapped as mixed, institutional campuses, and the CBD / Marina Bay core in deep orange.',
    note: 'The core box is hand-picked, not an official boundary. OSM landuse coverage is partial for commercial areas.',
    legend: [
      { swatch: hex(0xe8562a), label: 'Residential' },
      { swatch: hex(0xf2a08a), label: 'Commercial / office' },
      { swatch: hex(0x9b6fc3), label: 'Mixed / industrial' },
      { swatch: hex(0x4a7fd1), label: 'Institutional' },
      { swatch: hex(0x8cc27a), label: 'Park / open' },
      { swatch: hex(0xd9480f), label: 'Primary urban core' },
    ],
  },
  {
    id: 'L-03', group: 'layers', name: 'Transportation & connectivity', qty: 1,
    material: 'OSM drive network · MRT / LRT ways', mass: 'Layer III',
    explode: [0, 20, 0], files: ['coast', 'roads', 'rail'],
    spec: 'Expressways stitch the island east–west and north–south; the MRT network radiates from the core and loops through the new towns.',
    note: 'Primary = motorway, trunk and primary tags. Secondary = secondary and tertiary. Local streets are omitted for legibility.',
    legend: [
      { swatch: hex(0x111111), label: 'Expressway / primary road' },
      { swatch: hex(0x3b6fd1), label: 'Secondary road' },
      { swatch: hex(0x8e44ad), label: 'MRT / LRT line' },
    ],
  },
  {
    id: 'L-04', group: 'layers', name: 'Development evolution', qty: 1,
    material: 'Hand-traced from URA Master Plan regions', mass: 'Layer IV',
    explode: [0, 15, 0], files: ['coast', 'growth'],
    spec: 'Where the city is growing: recent completions in the north-east, planned towns in the west, and the renewal corridor along the southern waterfront.',
    note: 'INDICATIVE. Outlines are approximate boxes traced by hand for this board, not planning boundaries.',
    legend: [
      { swatch: hex(0xf6b87a), label: 'Recent growth area' },
      { swatch: hex(0xe8731a), label: 'Future growth area' },
      { swatch: hex(0xf29c8a), label: 'Redevelopment / renewal corridor' },
    ],
  },
  {
    id: 'L-05', group: 'layers', name: 'Building height & density', qty: 1,
    material: 'OSM footprints × building:levels, 500 m hex grid', mass: 'Layer V',
    explode: [0, 10, 0], files: ['coast', 'density', 'buildings'],
    spec: 'Floor-area intensity per hexagonal cell. The deepest blue marks the core and the tallest HDB towns; the periphery fades to pale blue.',
    note: 'Untagged buildings assume four storeys, so the map undercounts towers where OSM lacks level data. Building heights are exaggerated ×10 against the map scale; at true scale a 40-storey tower would be invisible.',
    legend: [
      { swatch: hex(0x9ec3e6), label: 'Low density' },
      { swatch: hex(0x5e96d1), label: 'Medium' },
      { swatch: hex(0x2f66b3), label: '' },
      { swatch: hex(0x123c80), label: 'Highest density' },
    ],
  },
  {
    id: 'L-06', group: 'layers', name: 'Urban fabric', qty: 1,
    material: 'OSM building footprints', mass: 'Layer VI',
    explode: [0, 5, 0], files: ['coast', 'fabric'],
    spec: 'Figure-ground: fine-grained shophouse blocks in the centre against the coarse slab-and-tower grain of the new towns and the industrial mega-blocks of the west.',
    note: 'Footprints under 40 m² are dropped by the bake to keep the file small.',
    legend: [{ swatch: hex(0x111111), label: 'Building footprint' }],
  },
  {
    id: 'L-07', group: 'layers', name: 'Regional context', qty: 1,
    material: 'Esri World Imagery mosaic · OSM islands', mass: 'Layer VII',
    explode: [0, 0, 0], files: ['coast', 'region', 'satellite'],
    spec: 'Singapore sits at the tip of the Malay Peninsula, across the Strait of Johor from Johor Bahru and across the Singapore Strait from Batam and Bintan.',
    note: 'Satellite imagery is an Esri World Imagery mosaic; the capture date is whatever Esri currently serves, not a fixed epoch. Coastline overlay outlines only; the neighbouring land is not filled.',
    legend: [
      { swatch: hex(0x8a8f99), label: 'Regional coastline' },
      { swatch: hex(0xf3ede2), label: 'Singapore' },
      { swatch: '#4a5b52', label: 'Satellite imagery (Esri)' },
    ],
  },
];

export const PART_BY_ID = Object.fromEntries(PARTS.map((p) => [p.id, p]));

// Named areas in scene units (x east, z south) for the observation thumbnails.
// cbd and punggol are nudged from the plan's first draft: the real core
// polygon and the tallest towers in buildings.json centre near (1.7, 2.2),
// and the Punggol growth polygon in growth.json sits at x 5.3-6.7 / z -7.1--6.0
// — both fall outside a straight x0-5/z4-9 or x7-14/z-11--5 box, which would
// render those two thumbnails as empty plate.
export const AREAS = {
  island: { x: [-20, 22], z: [-12, 14] },     // whole main island
  central: { x: [-6, 8], z: [-6, 8] },        // catchment + city
  cbd: { x: [-3, 7], z: [-3, 7] },            // Marina Bay / Raffles Place
  punggol: { x: [3, 10], z: [-9, -4] },       // north-east new town
};

export const OBSERVATIONS = [
  { layer: 'L-01', area: 'central', title: 'Strong ecological base', text: 'The central catchment sits at the centre of every layer; parks and reservoirs form a connected green core.' },
  { layer: 'L-02', area: 'cbd', title: 'Concentrated core functions', text: 'Commercial and civic functions cluster on the southern waterfront around Marina Bay; the deep-orange core is the pivot of the polycentric plan.' },
  { layer: 'L-03', area: 'central', title: 'Efficient transport network', text: 'Expressways stitch the island east–west; MRT lines radiate from the core and loop through the new towns.' },
  { layer: 'L-04', area: 'punggol', title: 'Continuous growth & renewal', text: 'Recent and future areas sit on the periphery — Punggol, Tengah, Woodlands — while renewal follows the old waterfront.' },
  { layer: 'L-05', area: 'cbd', title: 'High central density', text: 'Floor-area intensity peaks in the core and the tallest HDB towns, fading toward the coast.' },
  { layer: 'L-06', area: 'cbd', title: 'Compact & diverse fabric', text: 'Fine shophouse grain in the centre against the coarse slab-and-tower grain of the new towns.' },
  { layer: 'L-07', area: 'island', title: 'Strong regional connectivity', text: 'Singapore sits at the tip of the peninsula between the Johor and Singapore straits, a hub for the region.' },
];
