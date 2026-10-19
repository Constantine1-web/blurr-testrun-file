import { CareerEvent, TrackDefinition } from '../types/game';

export const TRACKS: TrackDefinition[] = [
  {
    id: 'neon-metropolis',
    name: 'HACKNEY & METRO EXPRESSWAY',
    subtitle: 'Urban Twilight Street Circuit & Suspension Viaduct',
    location: 'LONDON // HACKNEY CENTRAL',
    difficulty: 'ROOKIE',
    defaultLaps: 3,
    roadWidth: 21,
    skyColor: '#162038',
    fogColor: '#1e2942',
    accentNeon: '#38bdf8',
    secondaryNeon: '#f43f5e',
    description:
      'High-speed urban street circuit weaving past brick storefronts, illuminated corner chevrons, the suspension viaduct, and an underground expressway tunnel.',
    controlPoints: [
      { x: 0, y: 0, z: -320 },      // Start/Finish straight entry
      { x: 180, y: 0, z: -320 },    // Main straight mid
      { x: 360, y: 2, z: -290 },    // Fast sweeping Turn 1
      { x: 450, y: 14, z: -150 },   // Skyway Bridge ascent
      { x: 430, y: 22, z: 40 },     // Skyway Bridge crest
      { x: 310, y: 10, z: 200 },    // Bridge descent into Industrial zone
      { x: 140, y: 0, z: 260 },     // Industrial hairpin entry
      { x: 20, y: 0, z: 140 },      // Inner technical chicane
      { x: -120, y: 0, z: 250 },    // South docklands curve
      { x: -310, y: 0, z: 280 },    // West acceleration zone
      { x: -440, y: 0, z: 140 },    // Express Tunnel entry
      { x: -450, y: 0, z: -60 },    // Express Tunnel exit
      { x: -350, y: 0, z: -230 },   // Final apex corner
      { x: -170, y: 0, z: -315 },   // Pit straight merge
    ],
    landmarks: [
      { name: 'HACKNEY START GATE', progress: 0.02, type: 'STADIUM_ARCH' },
      { name: 'THAMES SUSPENSION BRIDGE', progress: 0.25, type: 'BRIDGE' },
      { name: 'EAST END HAIRPIN', progress: 0.46, type: 'REFINERY' },
      { name: 'BLACKWALL TUNNEL SECTOR', progress: 0.76, type: 'TUNNEL' },
    ],
  },
  {
    id: 'iron-harbor',
    name: 'LA RIVER & HARBOR DOCKS',
    subtitle: 'Concrete Spillway Channel & Container Terminal',
    location: 'LOS ANGELES // RIVER CHANNEL',
    difficulty: 'PRO',
    defaultLaps: 3,
    roadWidth: 21,
    skyColor: '#23293a',
    fogColor: '#333a4d',
    accentNeon: '#f59e0b',
    secondaryNeon: '#38bdf8',
    description:
      'Inspired by the Los Angeles River concrete channel and San Pedro docks—featuring weathered concrete retaining walls, high-voltage transmission towers, overhead steel bridges, and container yards.',
    controlPoints: [
      { x: 0, y: 0, z: -340 },
      { x: 220, y: 0, z: -340 },
      { x: 390, y: 0, z: -240 },
      { x: 420, y: 0, z: -60 },
      { x: 260, y: 0, z: 40 },
      { x: 360, y: 12, z: 200 },
      { x: 220, y: 18, z: 330 },
      { x: 0, y: 8, z: 310 },
      { x: -180, y: 0, z: 220 },
      { x: -360, y: 0, z: 290 },
      { x: -460, y: 0, z: 120 },
      { x: -340, y: 0, z: -40 },
      { x: -410, y: 0, z: -220 },
      { x: -210, y: 0, z: -335 },
    ],
    landmarks: [
      { name: 'SPILLWAY GATEWAY', progress: 0.02, type: 'STADIUM_ARCH' },
      { name: 'GOLIATH CRANE ROW', progress: 0.22, type: 'HARBOR_CRANES' },
      { name: '6TH STREET VIADUCT', progress: 0.45, type: 'BRIDGE' },
      { name: 'CONTAINER CANYON', progress: 0.78, type: 'REFINERY' },
    ],
  },
  {
    id: 'pacific-overpass',
    name: 'BARCELONA COASTAL HIGHWAY',
    subtitle: 'Dusk Mountain Coastline & Sub-Bay Tunnel',
    location: 'CATALONIA // COASTAL RING',
    difficulty: 'ELITE',
    defaultLaps: 3,
    roadWidth: 20,
    skyColor: '#1d1936',
    fogColor: '#2c2247',
    accentNeon: '#a855f7',
    secondaryNeon: '#facc15',
    description:
      'Ultra-fast dusk coastal highway featuring stone guardrails, sweeping S-curves, a multi-level coastal viaduct, and an illuminated sub-bay tunnel.',
    controlPoints: [
      { x: 0, y: 0, z: -360 },
      { x: 250, y: 0, z: -355 },
      { x: 460, y: 8, z: -240 },
      { x: 490, y: 22, z: -20 },
      { x: 350, y: 24, z: 190 },
      { x: 160, y: 12, z: 290 },
      { x: -40, y: 0, z: 340 },
      { x: -260, y: 0, z: 270 },
      { x: -420, y: 0, z: 110 },
      { x: -280, y: 0, z: -20 },
      { x: -430, y: 0, z: -170 },
      { x: -260, y: 0, z: -350 },
    ],
    landmarks: [
      { name: 'MIRAMAR ARCH', progress: 0.02, type: 'STADIUM_ARCH' },
      { name: 'COASTAL VIADUCT', progress: 0.28, type: 'BRIDGE' },
      { name: 'HARBOR PROMENADE', progress: 0.54, type: 'NEON_PLAZA' },
      { name: 'SUB-BAY EXPRESS TUNNEL', progress: 0.80, type: 'TUNNEL' },
    ],
  },
];

export const CAREER_EVENTS: CareerEvent[] = [
  {
    id: 'event-1-ignition',
    title: '01 // HACKNEY STREET IGNITION',
    subtitle: 'Prove your nerve on the London Hackney loop against rival street racers.',
    trackId: 'neon-metropolis',
    laps: 2,
    aiCount: 5,
    aiDifficulty: 0.82,
    rewardFans: 450,
    unlockFansRequired: 0,
    recommendedClass: 'Balanced Sports Coupe / Tuner',
  },
  {
    id: 'event-2-harbor-brawl',
    title: '02 // LA RIVER COMBAT BLITZ',
    subtitle: 'Heavy contact and ruthless power-up warfare through the LA River spillway and docks.',
    trackId: 'iron-harbor',
    laps: 3,
    aiCount: 6,
    aiDifficulty: 0.90,
    rewardFans: 650,
    unlockFansRequired: 300,
    recommendedClass: 'Heavy Widebody Brawler / Coupe',
  },
  {
    id: 'event-3-highway-velocity',
    title: '03 // BARCELONA TWILIGHT VELOCITY',
    subtitle: 'High-speed slipstream battle across the Barcelona Coastal Highway.',
    trackId: 'pacific-overpass',
    laps: 3,
    aiCount: 6,
    aiDifficulty: 0.96,
    rewardFans: 850,
    unlockFansRequired: 800,
    recommendedClass: 'High-Speed Supercar',
  },
  {
    id: 'event-4-metro-eliminator',
    title: '04 // HACKNEY NIGHT SHOWDOWN',
    subtitle: 'Aggressive 3-lap championship heat in the heart of East London.',
    trackId: 'neon-metropolis',
    laps: 3,
    aiCount: 6,
    aiDifficulty: 1.02,
    rewardFans: 1100,
    unlockFansRequired: 1400,
    recommendedClass: 'Armored V12 Interceptor / Supercar',
  },
  {
    id: 'event-5-overdrive-grand-prix',
    title: '05 // OVERDRIVE APEX FINALE',
    subtitle: '4-lap endurance combat showdown against elite rivals on the Coastal Ring.',
    trackId: 'pacific-overpass',
    laps: 4,
    aiCount: 6,
    aiDifficulty: 1.08,
    rewardFans: 1600,
    unlockFansRequired: 2200,
    recommendedClass: 'Apex Hypercar',
  },
];
