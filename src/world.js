// ============================================================
// WORLD DATA — Islands, biomes, NPCs, crystals, shrines
// ============================================================

export const PALETTE = {
  softPurple:   '#9B9AE2', softPurpleN:   0x9B9AE2,
  coralRed:     '#EB6259', coralRedN:     0xEB6259,
  softLavender: '#C6C3DC', softLavenderN: 0xC6C3DC,
  goldenYellow: '#EBB21A', goldenYellowN: 0xEBB21A,
  warmCream:    '#F0DEC2', warmCreamN:    0xF0DEC2,
  deepPlum:     '#4F4261', deepPlumN:     0x4F4261,
  oliveGreen:   '#6F7E4A', oliveGreenN:   0x6F7E4A,
  softPink:     '#F29FD7', softPinkN:     0xF29FD7,
};

export const ISLANDS = [
  {
    id: 0, name: 'Mossy Forest',
    skyTop: '#9B9AE2', skyBot: '#C6C3DC',
    groundColor: 0x6F7E4A, accentColor: 0x9B9AE2,
    fogColor: 0xC6C3DC, fogNear: 18, fogFar: 35,
    ambientColor: 0xC6C3DC, ambientInt: 0.6,
    sunColor: 0xF0DEC2, sunInt: 0.5,
    unlocked: true, restored: false,
    crystalCount: 0, totalCrystals: 1,
    mapPos: { x: 0.5, y: 0.22 },
    mechanic: 'Find the crystal shards',
    tiles: buildTiles(0),
    crystalPositions: [{x:-5,z:-4},{x:5,z:2},{x:-2,z:5},{x:4,z:-5},{x:-4,z:4}],
    shrinePos: {x:0,z:0},
    npcs: [
      { name:'Elder Moss', x:2, z:-1, color:0x6F7E4A,
        lines:["The forest dims each day. Crystal shards hold the Star's lost light — seek them!", "My old bones sense the darkness creeping closer…"],
        quest: { type:'find_firefly', reward: 0, done: false },
        restoredLine:"The light returns! I can smell the blooms again!" },
      { name:'Fern', x:-3, z:2, color:0x9B9AE2,
        lines:["Fireflies vanished when the Star fell. I miss their glow.", "The glowing orbs scattered through the forest — those are the crystal shards!"],
        restoredLine:"It's warm again! Thank you, Lantern Bearer!" },
      { name:'Sprite', x:3, z:3, color:0xF29FD7,
        lines:["I'm Sprite! Your lantern pulses with light — press Space near the shrine!", "The shrine is at the forest center. Can you feel it calling?"],
        restoredLine:"SPARKLES! SO MANY SPARKLES! You did it!!" },
    ]
  },
  {
    id: 1, name: 'Sunflower Beach',
    skyTop: '#C6C3DC', skyBot: '#F0DEC2',
    groundColor: 0xF0E8D4, accentColor: 0xD4836A,
    fogColor: 0xF4EEE2, fogNear: 20, fogFar: 40,
    ambientColor: 0xF4EAD8, ambientInt: 0.65,
    sunColor: 0xF4EAD8, sunInt: 0.6,
    unlocked: false, restored: false,
    crystalCount: 0, totalCrystals: 3,
    mapPos: { x: 0.22, y: 0.25 },
    mechanic: 'Help the islanders',
    tiles: buildTiles(1),
    crystalPositions: [{x:-8,z:0},{x:8,z:1},{x:0,z:-3},{x:5,z:2},{x:-5,z:2}],
    shrinePos: {x:0,z:0},
    collectibles: [
      { type:'shell', x:6, z:-2, label:'Spiral Shell' },
      { type:'driftwood_note', x:-6, z:3, label:'Old Note' },
    ],
    npcs: [
      { name:'Sandy', x:2, z:-2, color:0xD4836A,
        lines:["Welcome! I lost my favorite shell somewhere on the eastern shore.", "If you find it, I'll share the crystal shard I've been guarding."],
        quest: { type:'find_shell', reward: 0, done: false },
        restoredLine:"The sunflowers are blooming again! Oh happy day!" },
      { name:'Crab', x:-2, z:1, color:0xEB6259,
        lines:["*click click* A note washed up near the rocks. Could you fetch it?", "*click* The tides brought something important. I just know it."],
        quest: { type:'fetch_note', reward: 1, done: false },
        restoredLine:"*happy clicking* The water is warm and golden again!" },
      { name:'Driftwood', x:3, z:3, color:0xC6C3DC,
        lines:["I drifted here from afar. Both quests done? Then the final shard is yours.", "The Guardian Star once made these waters glow at night."],
        quest: { type:'beach_elder', reward: 2, done: false, requires:['find_shell','fetch_note'] },
        restoredLine:"I can see the stars reflected in the water again!" },
    ]
  },
  {
    id: 2, name: 'Sakura Cove',
    skyTop: '#E8C4D8', skyBot: '#F2D8E8',
    groundColor: 0xD4A8C0, accentColor: 0xEB6259,
    fogColor: 0xEDD8E8, fogNear: 16, fogFar: 32,
    ambientColor: 0xF2D0E0, ambientInt: 0.7,
    sunColor: 0xFFEEF4, sunInt: 0.6,
    unlocked: false, restored: false,
    crystalCount: 0, totalCrystals: 3,
    mapPos: { x: 0.78, y: 0.25 },
    mechanic: 'Restore the blossom',
    tiles: buildTiles(2),
    crystalPositions: [{x:-5,z:-4},{x:5,z:3},{x:-4,z:4},{x:4,z:-4},{x:0,z:5}],
    shrinePos: {x:0,z:0},
    collectibles: [
      { type:'petal_bundle', x:4, z:-3, label:'Petal Bundle' },
      { type:'spring_water', x:-3, z:-4, label:'Spring Water' },
    ],
    npcs: [
      { name:'Blossom', x:-3, z:2, color:0xF29FD7,
        lines:["Cherry petals used to fall year-round here. Could you gather a bundle from the sacred tree?", "The petals are near the eastern grove. Your lantern makes them glow!"],
        quest: { type:'gather_petals', reward: 0, done: false },
        restoredLine:"Look! The petals are falling again! Just like before!" },
      { name:'Ashrock', x:3, z:3, color:0x9B8090,
        lines:["I've watched this cove for centuries. Bring spring water from the north pool — the shrine thirsts.", "The water glows faintly. That's the Star's blessing still lingering."],
        quest: { type:'fetch_spring', reward: 1, done: false },
        restoredLine:"…The grief lifts. Thank you, Lantern Bearer. Truly." },
      { name:'Ember', x:2, z:-2, color:0xEB6259,
        lines:["Both offerings gathered? Then the final shard can be freed.", "The shrine awaits your lantern's light."],
        quest: { type:'sakura_elder', reward: 2, done: false, requires:['gather_petals','fetch_spring'] },
        restoredLine:"The blossoms are beautiful again, not dangerous!" },
    ]
  },
  {
    id: 3, name: 'Cozy Village',
    skyTop: '#C6C3DC', skyBot: '#E8DECE',
    groundColor: 0xEEE4D0, accentColor: 0xEB6259,
    fogColor: 0xF2EBE0, fogNear: 20, fogFar: 40,
    ambientColor: 0xEDE4D4, ambientInt: 0.65,
    sunColor: 0xF4EAD8, sunInt: 0.55,
    unlocked: false, restored: false,
    crystalCount: 0, totalCrystals: 3,
    mapPos: { x: 0.38, y: 0.55 },
    mechanic: 'Help the villagers',
    tiles: buildTiles(3),
    crystalPositions: [{x:-5,z:-4},{x:5,z:3}],
    shrinePos: {x:0,z:0},
    collectibles: [
      { type:'mochi', x:4, z:-4, label:'Mochi the Cat' },
      { type:'water_jar', x:-4, z:5, label:'Water Jar' },
    ],
    npcs: [
      { name:'Baker Bun', x:2, z:-2, color:0xD4836A,
        lines:["My cat Mochi ran off again! Find her and I'll give you the shard I found."],
        quest: { type:'find_cat', reward: 0, done: false },
        restoredLine:"Mochi is safe AND the light is back! Best day ever!" },
      { name:'Gardener', x:-3, z:1, color:0x6F7E4A,
        lines:["My garden is wilting. Could you bring me a water jar from the well to the east?"],
        quest: { type:'fetch_water', reward: 1, done: false },
        restoredLine:"My flowers! They're blooming! Happy tears!" },
      { name:'Elder Owl', x:0, z:3, color:0x4F4261,
        lines:["Help the baker and the gardener first. Then return to me.", "The crystal shards respond to kindness, young one."],
        quest: { type:'elder_final', reward: 2, done: false, requires:['find_cat','fetch_water'] },
        restoredLine:"Hoo hoo… The warmth returns. The Star remembers us." },
    ]
  },
  {
    id: 4, name: 'Crystal Cave',
    skyTop: '#2A1A4A', skyBot: '#4F3A7A',
    groundColor: 0x2E1E45, accentColor: 0x9B9AE2,
    fogColor: 0x2A1A4A, fogNear: 12, fogFar: 25,
    ambientColor: 0x9B9AE2, ambientInt: 0.35,
    sunColor: 0xC6C3DC, sunInt: 0.4,
    unlocked: false, restored: false,
    crystalCount: 0, totalCrystals: 3,
    mapPos: { x: 0.65, y: 0.6 },
    mechanic: 'Awaken the cave',
    tiles: buildTiles(4),
    crystalPositions: [{x:-4,z:-3},{x:4,z:4},{x:-4,z:3},{x:4,z:-3},{x:0,z:-5}],
    shrinePos: {x:0,z:0},
    collectibles: [
      { type:'glowstone', x:-3, z:-4, label:'Glowstone' },
      { type:'crystal_dust', x:3, z:4, label:'Crystal Dust' },
    ],
    npcs: [
      { name:'Glimmer', x:2, z:-2, color:0xC6C3DC,
        lines:["Shh — sound travels far in here. A glowstone fell into the deep pool. Can you retrieve it?", "The bioluminescent pools used to light this cave naturally."],
        quest: { type:'fetch_glowstone', reward: 0, done: false },
        restoredLine:"The crystals are singing again! Do you hear it?" },
      { name:'Stalagmite', x:-3, z:2, color:0x9B9AE2,
        lines:["I've grown here ten thousand years. Scatter crystal dust on my base — it'll open the sealed chamber.", "The dust is somewhere in the eastern alcove."],
        quest: { type:'use_dust', reward: 1, done: false },
        restoredLine:"I glow again! After all these centuries… I glow!" },
      { name:'Echo', x:3, z:3, color:0xF29FD7,
        lines:["Both offerings placed? Then the final shard stirs.", "*whispers* The cave will answer your lantern's pulse."],
        quest: { type:'cave_elder', reward: 2, done: false, requires:['fetch_glowstone','use_dust'] },
        restoredLine:"*resonating warmth* The cave sings your name, Lantern Bearer." },
    ]
  },
  {
    id: 5, name: 'Lavender Highlands',
    skyTop: '#C6C3DC', skyBot: '#9B9AE2',
    groundColor: 0xB8B0CC, accentColor: 0x9B9AE2,
    fogColor: 0xC6C3DC, fogNear: 15, fogFar: 30,
    ambientColor: 0xC6C3DC, ambientInt: 0.6,
    sunColor: 0xF0DEC2, sunInt: 0.5,
    unlocked: false, restored: false,
    crystalCount: 0, totalCrystals: 3,
    mapPos: { x: 0.25, y: 0.75 },
    mechanic: 'The final island',
    tiles: buildTiles(5),
    crystalPositions: [{x:-3,z:-7},{x:3,z:-6},{x:-4,z:0},{x:4,z:2},{x:0,z:7}],
    shrinePos: {x:0,z:0},
    collectibles: [
      { type:'wind_chime', x:-4, z:-5, label:'Wind Chime' },
      { type:'highland_flower', x:4, z:3, label:'Highland Flower' },
    ],
    npcs: [
      { name:'Zephyr', x:2, z:-2, color:0xC6C3DC,
        lines:["A wind chime fell from the old tower. Retrieve it — its song awakens the windmill gates.", "The tower is north. You'll feel the breeze guiding you."],
        quest: { type:'find_chime', reward: 0, done: false },
        restoredLine:"The wind smells of lavender again. It smells like home." },
      { name:'Windkeeper', x:-3, z:1, color:0x9B9AE2,
        lines:["A highland flower blooms only in lantern light. Offer one to the shrine stone.", "Look near the southern ridge where your light touches the ground."],
        quest: { type:'offer_flower', reward: 1, done: false },
        restoredLine:"*tearfully* They're turning! Oh, listen to them sing!" },
      { name:'Ancient Keeper', x:0, z:3, color:0x4F4261,
        lines:["Young Lantern Bearer… I have waited so long. The prophecy spoke of one who carries light through six islands.", "This is the final island. Place the crystals. The Guardian Star awaits."],
        quest: { type:'highlands_elder', reward: 2, done: false, requires:['find_chime','offer_flower'] },
        restoredLine:"*smiles softly* The Star shines. And so do you, dear child." },
    ]
  }
];

function buildTiles(islandId) {
  const tiles = [];
  const size = 9;

  const shapes = [
    // 0: Mossy Forest — classic rounded oval
    (x, z) => {
      const dist = Math.sqrt(x*x*0.9 + z*z*1.1);
      return dist <= size - Math.abs(Math.sin(x*0.7+z*0.5))*1.5;
    },
    // 1: Sunflower Beach — long east-west strip
    (x, z) => {
      const dist = Math.sqrt(x*x*0.5 + z*z*1.8);
      return dist <= size - Math.abs(Math.sin(x*0.4))*1.2;
    },
    // 2: Sakura Cove — crescent opening east
    (x, z) => {
      const dist = Math.sqrt(x*x + z*z);
      if (dist < 3 && x > 0) return false;
      return dist <= size - Math.abs(Math.sin(z*0.8))*2;
    },
    // 3: Cozy Village — fat walkable square
    (x, z) => {
      const ax = Math.abs(x), az = Math.abs(z);
      return ax <= 7.5 && az <= 7.5 && (ax+az) <= 10.5;
    },
    // 4: Crystal Cave — compact jagged circle
    (x, z) => {
      const dist = Math.sqrt(x*x + z*z);
      const jag = Math.abs(Math.sin(Math.atan2(z,x)*4)) * 1.8;
      return dist <= 7 - jag;
    },
    // 5: Lavender Highlands — tall north-south ridge
    (x, z) => {
      const dist = Math.sqrt(x*x*1.9 + z*z*0.55);
      return dist <= size - Math.abs(Math.sin(z*0.5+x*0.3))*1.8;
    },
  ];

  const shapeFn = shapes[islandId] || shapes[0];

  for (let x = -size; x <= size; x++) {
    for (let z = -size; z <= size; z++) {
      if (shapeFn(x, z)) {
        const dist = Math.sqrt(x*x + z*z);
        tiles.push({ x, z, type: dist > size-2 ? 'water' : 'ground' });
      }
    }
  }
  return tiles;
}

export function getIsland(id) { return ISLANDS[id]; }
export function getUnlockedIslands() { return ISLANDS.filter(i=>i.unlocked); }
