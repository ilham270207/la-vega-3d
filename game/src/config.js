// La Vega 3D — world data + tuning (round 7 re-author).
//
// Every number in this file is the game's single source of truth for the
// world layout, the dealer catalog, the weapon tiers and the 12-mission
// campaign. It was written from the design document (REFERENCE.md): a 400 m
// island city, a 260 m street grid, four districts, and a campaign that
// takes Jax from a penniless ferry arrival to the Harbor Heist.
//
// Coordinates use (x, y) where y is the north-south axis (the world's z).

// Fixed physics timestep (seconds). The main loop accumulates real time
// and steps the simulation in STEP slices so the game plays the same on
// a fast desktop and a slow phone.
export const STEP = 1 / 60;

// The island: 400 x 400 metres of terrain. The street grid runs 0..260;
// the sea starts west of x = 15, with a sand beach from 15 to 30.
export const WORLD = {
  size: 400, // terrain extent on each axis (metres)
  grid: 260, // street grid extent (the built-up city)
  seaX: 15, // everything west of this is open sea
  sandMax: 30, // sand strip ends here, grass/city begins
  roadWidth: 10, // carriageway width (metres)
  sidewalk: 2.5, // pavement on each side of a road
};

// Street centrelines, both axes. Blocks sit between neighbouring lines,
// so a block centre is always a midpoint (52, 78, 104, 130, 156, 182,
// 208, 234). Nine lines give an 8 x 8 block grid.
export const ROADS = [39, 65, 91, 117, 143, 169, 195, 221, 247];

// Street names, in road order. North-south roads first, then east-west.
export const STREET_NS = [
  'Shoreline Dr', 'Palm Row', 'Marina Blvd', 'Neon Ave', 'Casino Row',
  'Market St', 'Harbor Blvd', 'Sunset Ave', 'Bayview Dr',
];
export const STREET_EW = [
  'Ferry St', 'Club Row', 'Hotel Row', 'Pier Ave', 'City Hall Blvd',
  'Garden St', 'Depot Rd', 'Forest Rd', 'Ridge Rd',
];

// The four districts (quadrants of the grid). Standing starts at 0% in
// each and rises 8% for every job finished while the player stands there.
export const DISTRICTS = [
  { key: 'marina', name: 'MARINA', x0: 0, x1: 130, z0: 0, z1: 130 },
  { key: 'downtown', name: 'DOWNTOWN', x0: 130, x1: 260, z0: 0, z1: 130 },
  { key: 'neon', name: 'NEON ROW', x0: 0, x1: 130, z0: 130, z1: 260 },
  { key: 'beach', name: 'SOUTH BEACH', x0: 130, x1: 260, z0: 130, z1: 260 },
];

// Named places. x/y are the building centre (y = world z). `name` is the
// display name shown on the sign board and in the "Inside ..." prompt.
// Keys in the skip set of the city builder (beach, harbor, pierPickup,
// dock, park, airport, bridgeN, bridgeS) get no generic building: they
// are terrain features or have a bespoke builder.
export const PLACES = {
  club: { x: 156, y: 104, name: "La Rosa's Club" },
  garage: { x: 78, y: 156, name: "Manny's Garage" },
  warehouse: { x: 52, y: 208, name: 'Old Cannery Warehouse' },
  hospital: { x: 208, y: 52, name: 'La Vega General' },
  pierPickup: { x: 8.2, y: 130, name: 'Pier 9 Drop' },
  dock: { x: 23.5, y: 130, name: 'The Docks' },
  park: { x: 104, y: 78, name: 'Palm Court Park' },
  beach: { x: 23, y: 78, name: 'La Vega Beach' },
  cityHall: { x: 182, y: 182, name: 'City Hall' },
  casino: { x: 117, y: 65, name: 'Neon Palm Casino' },
  dealer: { x: 65, y: 91, name: 'Auto Palms' },
  gunShop: { x: 143, y: 117, name: 'Vega Arms' },
  villa: { x: 52, y: 52, name: 'Villa La Vega' },
  gas: { x: 30, y: 200, name: 'Petro Vega' },
  harbor: { x: 20, y: 130, name: 'La Vega Harbor' },
  station: { x: 130, y: 156, name: 'LVPD Station' },
  petshop: { x: 78, y: 130, name: 'Paws & Claws' },
  restaurant: { x: 195, y: 130, name: 'Warung La Vega' },
  villaDelMar: { x: 221, y: 221, name: 'Villa del Mar' },
  mall: { x: 104, y: 156, name: 'La Vega Mall' },
  airport: { x: 330, y: 130, name: 'La Vega Air' },
  safehouse: { x: 52, y: 182, name: 'Safehouse' },
  bridgeN: { x: 278, y: 39, name: 'North Bridge' },
  bridgeS: { x: 278, y: 247, name: 'South Bridge' },
  bank: { x: 182, y: 104, name: 'La Vega Bank' },
  jewelry: { x: 208, y: 78, name: 'Vega Jewelers' },
  minimarket: { x: 104, y: 182, name: 'Mini Market' },
  workshop: { x: 156, y: 208, name: 'Tune-Up Workshop' },
  clotheshop: { x: 78, y: 104, name: 'Neon Threads' },
  salon: { x: 104, y: 130, name: 'Palm Salon' },
  tattoo: { x: 130, y: 182, name: 'Ink Parlor' },
};

// Building footprints (width x depth, metres) for the named places.
// The door sits on the south face, d/2 + 1 m out, so dims also drive the
// interaction radius for entering a place.
export const PLACE_DIMS = {
  club: { w: 22, d: 16 },
  garage: { w: 18, d: 14 },
  warehouse: { w: 24, d: 16 },
  hospital: { w: 20, d: 14 },
  pierPickup: { w: 10, d: 6 },
  dock: { w: 16, d: 10 },
  park: { w: 20, d: 16 },
  beach: { w: 16, d: 10 },
  cityHall: { w: 22, d: 16 },
  casino: { w: 20, d: 14 },
  dealer: { w: 24, d: 16 },
  gunShop: { w: 14, d: 11 },
  villa: { w: 16, d: 12 },
  gas: { w: 16, d: 12 },
  harbor: { w: 18, d: 10 },
  station: { w: 20, d: 14 },
  petshop: { w: 12, d: 10 },
  restaurant: { w: 14, d: 11 },
  villaDelMar: { w: 18, d: 14 },
  mall: { w: 26, d: 18 },
  airport: { w: 60, d: 30 },
  safehouse: { w: 14, d: 11 },
  bridgeN: { w: 40, d: 12 },
  bridgeS: { w: 40, d: 12 },
  bank: { w: 18, d: 14 },
  jewelry: { w: 14, d: 11 },
  minimarket: { w: 14, d: 11 },
  workshop: { w: 18, d: 14 },
  clotheshop: { w: 12, d: 10 },
  salon: { w: 12, d: 10 },
  tattoo: { w: 12, d: 10 },
};

// Ground + paint palette (hex). The city painter reads these, never
// literals, so a palette pass is a one-line change here.
export const PALETTE = {
  grass: 0x8fce62,
  sand: 0xf2d492,
  sea: 0x2f9fd8,
  deep: 0x1e7fc0,
  swamp: 0x5a7a4a,
  road: 0x4a505c,
  roadLine: 0xf5d76e,
  sidewalk: 0xc9c2b4,
  park: 0x69b455,
  pond: 0x3a7a9a,
  pier: 0xa97c50,
};

// City generation dice. parkChance is the chance a generic block becomes
// a park instead of buildings; twoBuildingChance is the chance a block
// holds two buildings side by side instead of one.
export const CITY_TUNING = {
  parkChance: 0.12,
  twoBuildingChance: 0.3,
};

// The three land biomes outside the street grid, as rectangles.
// FOREST is the wooded north-west, DESERT the sandy east, ROCKY HILLS
// the boulder country in the south-east.
export const BIOMES = {
  forest: { x0: 0, x1: 260, z0: 260, z1: 400 },
  desert: { x0: 260, x1: 400, z0: 0, z1: 260 },
  rocky: { x0: 260, x1: 400, z0: 260, z1: 400 },
};

// The player on foot. All speeds are m/s; the punch is the fists weapon.
export const PLAYER = {
  health: 100,
  walk: 4.2,
  run: 7.0,
  radius: 0.45,
  punchRange: 2.2,
  punchDamage: 34,
};

// Wanted tops out at five stars: patrol, roadblocks, helicopter, SWAT.
export const WANTED_MAX = 5;

// localStorage prefix for the three save slots ("<key>-slot1" ...).
export const SAVE_KEY = 'lavega';

// ---------------------------------------------------------------------------
// Weapons — five tiers. `mag` is the magazine size (0 = melee, infinite),
// `pack` is the ammo in one shop pack, `interval` the seconds between
// shots, `range` the metres a shot can reach, `reload` the reload time.
// The starting pistol holds 12 in the mag and 5 spare mags (60 reserve):
// giveWeapon('pistol', 0) gives mag * 5 reserve, so the HUD reads
// "PISTOL 12 / 60" on a fresh game.
export const WEAPONS = {
  fists: {
    name: 'FISTS', price: 0, damage: 34, range: 2.2,
    mag: 0, reload: 0, interval: 0.4, pack: 0,
  },
  pistol: {
    name: 'PISTOL', price: 600, damage: 50, range: 40,
    mag: 12, reload: 1.1, interval: 0.25, pack: 24,
  },
  smg: {
    name: 'SMG', price: 1500, damage: 22, range: 30,
    mag: 30, reload: 1.5, interval: 0.09, pack: 60,
  },
  shotgun: {
    name: 'SHOTGUN', price: 2500, damage: 110, range: 18,
    mag: 6, reload: 2.0, interval: 0.8, pack: 12,
  },
  rifle: {
    name: 'RIFLE', price: 4000, damage: 80, range: 70,
    mag: 30, reload: 1.7, interval: 0.12, pack: 30,
  },
};

// ---------------------------------------------------------------------------
// Vehicles. One entry per drivable model. Fields:
//   name, price — dealer display + purchase cost (0 = not for sale)
//   len, wid — footprint in metres (collision + parking)
//   accel — m/s^2, top — top speed m/s, turn — steering rate
//   colors — paint palette the spawner picks from
//   hp — body hit points before the car dies
//   file — GLB path under game/models/ (loaded on demand for buycars)
//   glb — key into MODELS.cars once the model is loaded
//   proc — procedural builder to use when there is no GLB
//          ('truck' | 'van' | 'bus' | 'ambulance' | 'firetruck')
//   buycar — true when Auto Palms sells this model
//
// The five street cars (sedan, suv, truck, sport, pickup) are the
// everyday traffic and the mission-9 purchase options. The eleven
// showroom cars are the dealer's GLB catalog. Service vehicles
// (taxi, police, van, bus, ambulance, firetruck, motor) are not sold.
export const CAR_MODELS = {
  sedan: {
    name: 'Vega Sedan', price: 800, len: 4.6, wid: 1.9,
    accel: 12, top: 32, turn: 2.2, hp: 100,
    colors: [0xd92038, 0x2a6fd6, 0xe8e8e8, 0x222222, 0xffd34d],
    file: 'qcars/sedan.glb', glb: 'sedan', buycar: true,
  },
  suv: {
    name: 'Vega SUV', price: 1200, len: 4.7, wid: 2.0,
    accel: 11, top: 35, turn: 2.0, hp: 120,
    colors: [0x2a2a2e, 0xe8e8e8, 0x2a6fd6, 0x8a5a3a],
    file: 'qcars/suv.glb', glb: 'suv', buycar: true,
  },
  truck: {
    name: 'Vega Hauler', price: 1000, len: 6.4, wid: 2.4,
    accel: 8, top: 24, turn: 1.8, hp: 150,
    colors: [0xd92038, 0x2a6fd6, 0xe8e8e8, 0xffd34d],
    proc: 'truck', buycar: true,
  },
  sport: {
    name: 'Vega Comet', price: 1500, len: 4.4, wid: 1.9,
    accel: 16, top: 44, turn: 2.6, hp: 100,
    colors: [0xe01e37, 0xffd34d, 0x2a6fd6, 0xf2f5f7],
    file: 'qcars/sports-car.glb', glb: 'sports-car', buycar: true,
  },
  pickup: {
    name: 'Vega Pickup', price: 1100, len: 4.8, wid: 2.0,
    accel: 12, top: 33, turn: 2.1, hp: 120,
    colors: [0x8a5a3a, 0x2a2a2e, 0xd92038, 0xe8e8e8],
    file: 'qcars/pickup.glb', glb: 'pickup', buycar: true,
  },
  taxi: {
    name: 'City Taxi', price: 0, len: 4.6, wid: 1.9,
    accel: 12, top: 33, turn: 2.2, hp: 100,
    colors: [0xffd34d],
    file: 'qcars/taxi.glb', glb: 'taxi',
  },
  police: {
    name: 'LVPD Cruiser', price: 0, len: 4.8, wid: 2.0,
    accel: 14, top: 40, turn: 2.4, hp: 120,
    colors: [0x1a1a1a],
    file: 'qcars/police-car.glb', glb: 'police-car',
  },
  van: {
    name: 'Vega Van', price: 0, len: 5.0, wid: 2.2,
    accel: 10, top: 30, turn: 2.0, hp: 120,
    colors: [0xe8e8e8, 0x2a6fd6, 0x8a8a92],
    proc: 'van',
  },
  bus: {
    name: 'City Bus', price: 0, len: 10.0, wid: 2.6,
    accel: 6, top: 22, turn: 1.6, hp: 200,
    colors: [0x2a6fd6, 0xe8e8e8],
    proc: 'bus',
  },
  ambulance: {
    name: 'Ambulance', price: 0, len: 5.4, wid: 2.3,
    accel: 12, top: 34, turn: 2.1, hp: 120,
    colors: [0xf2f5f7],
    proc: 'ambulance',
  },
  firetruck: {
    name: 'Fire Truck', price: 0, len: 6.0, wid: 2.4,
    accel: 9, top: 30, turn: 1.9, hp: 150,
    colors: [0xd92038],
    proc: 'firetruck',
  },
  motor: {
    name: 'Motorbike', price: 0, len: 2.0, wid: 0.7,
    accel: 18, top: 38, turn: 3.0, hp: 60,
    colors: [0xd92038, 0x2a6fd6, 0x222222],
  },
  // -- Auto Palms showroom (GLB catalog) ----------------------------------
  wedge: {
    name: 'Countach Wedge', price: 8000, len: 4.4, wid: 2.0,
    accel: 20, top: 52, turn: 2.8, hp: 100,
    colors: [0x8a2be2],
    file: 'cars/supercar-wedge-purple.glb', buycar: true,
  },
  dominus: {
    name: 'Dominus GT', price: 6000, len: 4.5, wid: 2.0,
    accel: 18, top: 48, turn: 2.7, hp: 100,
    colors: [0x1a1a1a],
    file: 'cars/supercar-dominus.glb', buycar: true,
  },
  formula: {
    name: 'Vega Formula', price: 5000, len: 5.2, wid: 2.0,
    accel: 24, top: 55, turn: 3.0, hp: 80,
    colors: [0xd92038],
    file: 'cars/racecar-f1.glb',
  },
  convertible: {
    name: 'Marina Convertible', price: 3500, len: 4.4, wid: 1.9,
    accel: 15, top: 40, turn: 2.5, hp: 100,
    colors: [0x2a6fd6],
    file: 'cars/convertible-blue.glb', buycar: true,
  },
  roadster: {
    name: 'Sunset Roadster', price: 3200, len: 4.3, wid: 1.9,
    accel: 15, top: 42, turn: 2.5, hp: 100,
    colors: [0xff7a1a],
    file: 'cars/convertible-roadster.glb', buycar: true,
  },
  sportster: {
    name: 'Retro Sportster', price: 3000, len: 4.3, wid: 1.9,
    accel: 14, top: 42, turn: 2.5, hp: 100,
    colors: [0xf2f5f7],
    file: 'cars/sportster-white.glb', buycar: true,
  },
  pinkcabrio: {
    name: 'Pink Wedge Cabrio', price: 2800, len: 4.4, wid: 2.0,
    accel: 15, top: 44, turn: 2.6, hp: 100,
    colors: [0xff2a9d],
    file: 'cars/convertible-wedge-pink.glb', buycar: true,
  },
  mustang: {
    name: 'Mustang Muscle', price: 2500, len: 4.6, wid: 1.9,
    accel: 15, top: 46, turn: 2.4, hp: 100,
    colors: [0xffd34d],
    file: 'cars/muscle-yellow.glb', buycar: true,
  },
  hatch: {
    name: 'City Hatch', price: 2200, len: 4.0, wid: 1.8,
    accel: 13, top: 34, turn: 2.4, hp: 100,
    colors: [0x8a8a92],
    file: 'cars/hatchback-grey.glb', buycar: true,
  },
  orangesedan: {
    name: 'Orange Sport Sedan', price: 1800, len: 4.6, wid: 1.9,
    accel: 14, top: 38, turn: 2.4, hp: 100,
    colors: [0xff7a1a],
    file: 'cars/sports-sedan-orange.glb', buycar: true,
  },
  vip: {
    name: 'VIP Classic', price: 1500, len: 4.6, wid: 1.9,
    accel: 12, top: 36, turn: 2.3, hp: 100,
    colors: [0x8a1a1a],
    file: 'cars/sedan-red-vip.glb', buycar: true,
  },
};

// The Auto Palms showroom, in display order: the five street cars first,
// then the ten showroom cars. The dealer lot shows the first eight; the
// dealer panel lists all fifteen.
export const CAR_CATALOG = [
  'sedan', 'suv', 'truck', 'sport', 'pickup',
  'wedge', 'dominus', 'convertible', 'roadster', 'sportster',
  'pinkcabrio', 'mustang', 'hatch', 'orangesedan', 'vip',
];

// ---------------------------------------------------------------------------
// Campaign — 12 missions in 4 acts.
//
// A mission: id, name, act (shown on the intro card), intro (briefing
// line), dialogueBefore / dialogueAfter (arrays of {who, text} shown as
// the dialogue sequence), reward (cash on completion, 0 = the prize is
// the thing itself), onComplete (outro line), steps.
//
// A step: type, text (the HUD objective line), marker ({x, y} — optional
// for 'steal', which points at the nearest parked car), time (seconds
// on the clock, optional), count (enemies to defeat), wanted (stars to
// reach), needCar (the step only counts inside a vehicle).
//
// Types: steal, reach, checkpoint, bridge, deliver, evade, reachWanted,
// heat, killAll, defeat, buy. The mission runner handles them all; a
// 'buy' step completes when any car is bought at Auto Palms.
export const MISSIONS = [
  {
    id: 1, name: 'First Wheels', act: 'ACT I — FRESH OFF THE FERRY',
    reward: 300,
    intro: 'You step off the ferry with one ticket and no cash. La Rosa needs a driver — start by bringing her a car.',
    dialogueBefore: [
      { who: 'LA ROSA', text: 'Jax Vega. Fresh off the ferry, no money, no wheels. I like that — hungry people work hard.' },
      { who: 'JAX', text: 'I just need a start, La Rosa. One job.' },
      { who: 'LA ROSA', text: 'Then take a parked car and bring it to Manny\'s Garage. Don\'t get caught admiring it.' },
    ],
    dialogueAfter: [
      { who: 'MANNY', text: 'Not bad for a ferry rat. The old girl runs again.' },
      { who: 'LA ROSA', text: 'You\'ve got the touch, Jax. Here — a pistol. You\'ll need it in this town.' },
    ],
    onComplete: 'PISTOL unlocked — La Rosa trusts you now.',
    steps: [
      { type: 'steal', text: 'Steal a parked car — press E near one' },
      { type: 'deliver', text: "Deliver the car to Manny's Garage", marker: { x: 78, y: 156 }, needCar: true },
    ],
  },
  {
    id: 2, name: 'Dock Run', act: 'ACT I — FRESH OFF THE FERRY',
    reward: 500,
    intro: 'A package is waiting at Pier 9. La Rosa wants it at the club — no questions, no delays.',
    dialogueBefore: [
      { who: 'LA ROSA', text: 'A package came in on the morning boat. Pier 9. Bring it to the club, and Jax — don\'t open it.' },
      { who: 'JAX', text: 'Pier 9. Got it.' },
    ],
    dialogueAfter: [
      { who: 'LA ROSA', text: 'On time, no trouble. You might last in La Vega after all.' },
    ],
    onComplete: 'Package delivered. The club is warming up to you.',
    steps: [
      { type: 'reach', text: 'Pick up the package at Pier 9', marker: { x: 8, y: 130 } },
      { type: 'deliver', text: "Deliver the package to La Rosa's Club", marker: { x: 156, y: 104 } },
    ],
  },
  {
    id: 3, name: "The Vultures' Warning", act: 'ACT I — FRESH OFF THE FERRY',
    reward: 400,
    intro: 'Two Vultures are leaning on the club door. La Rosa wants them gone — fists will do.',
    dialogueBefore: [
      { who: 'LA ROSA', text: 'The Vultures think my club is their turf now. Show them it isn\'t.' },
      { who: 'VULTURE', text: 'Look at this — the ferry boy wants to play tough.' },
    ],
    dialogueAfter: [
      { who: 'LA ROSA', text: 'That\'s how you answer in La Vega. They won\'t be back tonight.' },
    ],
    onComplete: 'The club door is yours again.',
    steps: [
      { type: 'reach', text: "Get to La Rosa's Club", marker: { x: 156, y: 104 } },
      { type: 'defeat', text: 'Chase off the Vultures (2)', marker: { x: 156, y: 104 }, count: 2 },
    ],
  },
  {
    id: 4, name: 'Neon Street Race', act: 'ACT II — HEAT RISING',
    reward: 900,
    intro: 'The club is staking a race coupe on you. Four checkpoints across Neon Row and South Beach — 150 seconds.',
    dialogueBefore: [
      { who: 'LA ROSA', text: 'Neon Row is racing tonight and my money is on you. Take the coupe. Don\'t scratch it — actually, scratch it, just win.' },
      { who: 'JAX', text: 'Four checkpoints, one coupe. Easy.' },
    ],
    dialogueAfter: [
      { who: 'LA ROSA', text: 'Nine hundred dollars and the whole street saw it. You\'re not a ferry rat anymore, Jax.' },
    ],
    onComplete: 'Race won — the street knows your name now.',
    steps: [
      { type: 'reach', text: 'Pick up the race coupe at the club', marker: { x: 156, y: 104 } },
      { type: 'checkpoint', text: 'Checkpoint 1 — Neon Row north', marker: { x: 65, y: 221 }, time: 150 },
      { type: 'checkpoint', text: 'Checkpoint 2 — Neon Row east', marker: { x: 117, y: 195 } },
      { type: 'checkpoint', text: 'Checkpoint 3 — South Beach', marker: { x: 208, y: 208 } },
      { type: 'checkpoint', text: 'Finish — back at the club', marker: { x: 156, y: 104 } },
    ],
  },
  {
    id: 5, name: 'Shake the Tail', act: 'ACT II — HEAT RISING',
    reward: 400,
    intro: 'The LVPD is on you. Break line of sight, duck down an alley, and stay hidden until the heat dies.',
    dialogueBefore: [
      { who: 'MANNY', text: 'Two stars, Jax. They saw the plates. Lose them — hide, don\'t fight.' },
    ],
    dialogueAfter: [
      { who: 'MANNY', text: 'Clean. The LVPD is chasing ghosts tonight.' },
    ],
    onComplete: 'Heat lost — the LVPD is chasing ghosts.',
    steps: [
      { type: 'evade', text: 'Lose the heat — break line of sight' },
    ],
  },
  {
    id: 6, name: 'Warehouse Payback', act: 'ACT II — HEAT RISING',
    reward: 700,
    intro: 'The Vultures torched a delivery at the Old Cannery Warehouse. Return the favour — all four of them.',
    dialogueBefore: [
      { who: 'LA ROSA', text: 'They burned my shipment at the cannery. Go to the warehouse and settle it.' },
      { who: 'JAX', text: 'Four of them. I\'ll bring the receipt.' },
    ],
    dialogueAfter: [
      { who: 'LA ROSA', text: 'The cannery is quiet again. The Vultures will think twice now.' },
    ],
    onComplete: 'The warehouse is yours again.',
    steps: [
      { type: 'reach', text: 'Get to the Old Cannery Warehouse', marker: { x: 52, y: 208 } },
      { type: 'defeat', text: 'Take down the Vultures (4)', marker: { x: 52, y: 208 }, count: 4 },
    ],
  },
  {
    id: 7, name: 'The Getaway Driver', act: 'ACT III — THE SETUP',
    reward: 800,
    intro: 'A courier is waiting at La Vega General. Get them to the Neon Palm Casino in two minutes — the LVPD is watching the roads.',
    dialogueBefore: [
      { who: 'COURIER', text: 'You\'re the driver? Two minutes to the casino. Drive like the whole island is watching — because it is.' },
    ],
    dialogueAfter: [
      { who: 'COURIER', text: 'Two minutes, not a scratch. La Rosa picks good drivers.' },
    ],
    onComplete: 'Courier delivered — on time, no scratches.',
    steps: [
      { type: 'reach', text: 'Pick up the courier at La Vega General', marker: { x: 208, y: 52 } },
      { type: 'deliver', text: 'Drop the courier at Neon Palm Casino — 2:00', marker: { x: 117, y: 65 }, needCar: true, time: 120 },
    ],
  },
  {
    id: 8, name: 'Grand Theft Marina', act: 'ACT III — THE SETUP',
    reward: 600,
    intro: 'A red sport is sitting on the Auto Palms lot in broad daylight. Take it, and bring it to Manny\'s.',
    dialogueBefore: [
      { who: 'MANNY', text: 'That red Comet on the lot? The dealer polishes it every morning. Steal it in daylight — the whole marina will see you do it.' },
      { who: 'JAX', text: 'Daylight it is.' },
    ],
    dialogueAfter: [
      { who: 'MANNY', text: 'Beautiful. And the SMG in the trunk is yours — call it a bonus.' },
    ],
    onComplete: 'The red Comet is yours. SMG stashed in the trunk.',
    steps: [
      { type: 'steal', text: 'Steal the red sport at Auto Palms', marker: { x: 65, y: 91 } },
      { type: 'deliver', text: "Deliver it to Manny's Garage", marker: { x: 78, y: 156 }, needCar: true },
    ],
  },
  {
    id: 9, name: 'Clean Wheels', act: 'ACT III — THE SETUP',
    reward: 0,
    intro: 'No more stolen cars for the big job — you need clean wheels in your own name. Buy one at Auto Palms.',
    dialogueBefore: [
      { who: 'LA ROSA', text: 'The last job needs a car nobody can trace. Buy one, Jax. A sedan, a truck, a sport — your call.' },
    ],
    dialogueAfter: [
      { who: 'LA ROSA', text: 'Clean plates, clean conscience. Almost.' },
    ],
    onComplete: 'Your own car — parked at Manny\'s Garage.',
    steps: [
      { type: 'buy', text: 'Buy a car at Auto Palms — press 1 sedan, 2 truck, 3 sport' },
    ],
  },
  {
    id: 10, name: 'The Distraction', act: 'ACT IV — THE LA VEGA SCORE',
    reward: 500,
    intro: 'The crew needs the LVPD looking the other way. Make noise until you hit three stars — then vanish.',
    dialogueBefore: [
      { who: 'LA ROSA', text: 'Tonight the crew moves. I need every cop in La Vega chasing YOU. Three stars, Jax — then disappear.' },
      { who: 'JAX', text: 'Three stars and a disappearing act. On it.' },
    ],
    dialogueAfter: [
      { who: 'LA ROSA', text: 'They never saw the crew. You bought us the whole night.' },
    ],
    onComplete: 'The LVPD chased ghosts while the crew moved.',
    steps: [
      { type: 'reachWanted', text: 'Make some noise — get to 3 stars', wanted: 3 },
      { type: 'evade', text: 'Now lose the heat' },
    ],
  },
  {
    id: 11, name: 'The La Vega Score', act: 'ACT IV — THE LA VEGA SCORE',
    reward: 1200,
    intro: 'Five drops across the whole island, 150 seconds. Marina Gate, Palm Court, the hospital, the docks, back to the club.',
    dialogueBefore: [
      { who: 'LA ROSA', text: 'Five drops, one run, no mistakes. The whole score rides on this route, Jax.' },
    ],
    dialogueAfter: [
      { who: 'LA ROSA', text: 'Every drop landed. You drive like the city owes you — and tonight, it paid.' },
    ],
    onComplete: 'All five drops landed. The score is real.',
    steps: [
      { type: 'deliver', text: 'Drop 1 — Marina Gate', marker: { x: 65, y: 39 }, needCar: true, time: 150 },
      { type: 'deliver', text: 'Drop 2 — Palm Court Park', marker: { x: 104, y: 78 }, needCar: true },
      { type: 'deliver', text: 'Drop 3 — La Vega General', marker: { x: 208, y: 52 }, needCar: true },
      { type: 'deliver', text: 'Drop 4 — South Docks', marker: { x: 23, y: 130 }, needCar: true },
      { type: 'deliver', text: 'Drop 5 — back at the club', marker: { x: 156, y: 104 }, needCar: true },
    ],
  },
  {
    id: 12, name: 'Harbor Heist', act: 'ACT IV — THE LA VEGA SCORE',
    reward: 8000,
    intro: 'The final job. Grab the cargo at the harbor, ride out five stars, and bring it home to the club. Everything you built leads here.',
    dialogueBefore: [
      { who: 'LA ROSA', text: 'This is it, Jax. The harbor cargo, five stars, one bridge. Maya is with you. Bring it home.' },
      { who: 'MAYA', text: 'I\'ve got the wheel when you need it. Let\'s finish this.' },
    ],
    dialogueAfter: [
      { who: 'LA ROSA', text: 'Eight thousand dollars. The harbor, the heat, the whole island — yours, Jax. La Vega is yours.' },
      { who: 'JAX', text: 'We came off the ferry with nothing. Look at us now.' },
    ],
    onComplete: 'THE HARBOR HEIST IS DONE — La Vega is yours.',
    steps: [
      { type: 'reach', text: 'Get to La Vega Harbor', marker: { x: 20, y: 130 } },
      { type: 'heat', text: 'Grab the cargo — the harbor patrol is on you', marker: { x: 20, y: 130 }, wanted: 5 },
      { type: 'evade', text: 'Lose the 5-star heat' },
      { type: 'deliver', text: "Deliver the cargo to La Rosa's Club", marker: { x: 156, y: 104 }, needCar: true },
    ],
  },
];
