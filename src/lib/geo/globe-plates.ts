/**
 * Stylized tectonic plate boundaries for the monitor globe (v1).
 * Approximate PB2002-inspired polylines — not survey-accurate GIS.
 * Points are [lat, lon] degrees.
 */

export type GlobePlate = {
  id: string;
  name: string;
  /** Spreading / transform / subduction / collision (hover hint). */
  kind: "ridge" | "transform" | "subduction" | "collision" | "rift";
  path: [number, number][];
};

/** Magma/rose — distinct from cyan cables and warn pipelines. */
export const PLATE_STYLE = {
  css: "rgb(251 113 133)",
  alpha: 0.55,
  width: 1.35,
} as const;

/**
 * Major boundaries only — enough to read the global pattern on a HUD globe.
 */
export const GLOBE_PLATES: GlobePlate[] = [
  // —— Mid-Atlantic Ridge ——
  {
    id: "mar-n",
    name: "Mittelatlantischer Rücken (N)",
    kind: "ridge",
    path: [
      [71.0, -8.0],
      [66.0, -18.0],
      [63.5, -24.0],
      [60.0, -28.0],
      [52.0, -32.0],
      [45.0, -28.0],
      [38.0, -30.0],
      [30.0, -40.0],
      [20.0, -45.0],
      [10.0, -40.0],
      [0.0, -25.0],
    ],
  },
  {
    id: "mar-s",
    name: "Mittelatlantischer Rücken (S)",
    kind: "ridge",
    path: [
      [0.0, -25.0],
      [-10.0, -14.0],
      [-20.0, -12.0],
      [-30.0, -14.0],
      [-40.0, -16.0],
      [-50.0, -20.0],
      [-54.0, -30.0],
      [-55.0, -40.0],
    ],
  },

  // —— East Pacific Rise / Chile Rise ——
  {
    id: "epr",
    name: "Ostpazifischer Rücken",
    kind: "ridge",
    path: [
      [25.0, -110.0],
      [15.0, -105.0],
      [5.0, -102.0],
      [-5.0, -105.0],
      [-15.0, -110.0],
      [-25.0, -112.0],
      [-35.0, -110.0],
      [-45.0, -100.0],
      [-55.0, -90.0],
    ],
  },

  // —— Pacific Ring (subduction arcs) ——
  {
    id: "aleutian",
    name: "Aleuten-Graben",
    kind: "subduction",
    path: [
      [55.0, 164.0],
      [52.0, 175.0],
      [51.5, -175.0],
      [52.0, -165.0],
      [54.0, -160.0],
      [58.0, -152.0],
      [59.5, -142.0],
    ],
  },
  {
    id: "kuril-japan",
    name: "Kurilen / Japan-Graben",
    kind: "subduction",
    path: [
      [50.0, 157.0],
      [45.0, 150.0],
      [40.0, 144.0],
      [35.0, 141.0],
      [30.0, 140.0],
      [25.0, 142.0],
    ],
  },
  {
    id: "mariana",
    name: "Marianen-Graben",
    kind: "subduction",
    path: [
      [25.0, 142.0],
      [20.0, 145.0],
      [15.0, 146.0],
      [12.0, 144.0],
      [10.0, 140.0],
    ],
  },
  {
    id: "sunda",
    name: "Sunda-Graben",
    kind: "subduction",
    path: [
      [18.0, 95.0],
      [10.0, 95.0],
      [5.0, 97.0],
      [0.0, 100.0],
      [-5.0, 105.0],
      [-8.0, 115.0],
      [-10.0, 125.0],
      [-8.0, 135.0],
    ],
  },
  {
    id: "tonga",
    name: "Tonga–Kermadec",
    kind: "subduction",
    path: [
      [-15.0, -173.0],
      [-20.0, -175.0],
      [-25.0, -176.0],
      [-30.0, -177.0],
      [-35.0, -179.0],
      [-40.0, 178.0],
      [-45.0, 175.0],
    ],
  },
  {
    id: "peru-chile",
    name: "Peru–Chile-Graben",
    kind: "subduction",
    path: [
      [5.0, -80.0],
      [0.0, -81.0],
      [-10.0, -79.0],
      [-20.0, -71.0],
      [-30.0, -72.0],
      [-40.0, -75.0],
      [-50.0, -76.0],
      [-55.0, -70.0],
    ],
  },
  {
    id: "cascadia",
    name: "Cascadia",
    kind: "subduction",
    path: [
      [40.0, -125.0],
      [42.0, -125.5],
      [46.0, -126.0],
      [48.5, -127.0],
      [50.0, -129.0],
    ],
  },
  {
    id: "middle-america",
    name: "Mittelamerika-Graben",
    kind: "subduction",
    path: [
      [20.0, -106.0],
      [16.0, -100.0],
      [14.0, -94.0],
      [12.0, -90.0],
      [10.0, -86.0],
      [8.0, -84.0],
    ],
  },

  // —— Transform / continental ——
  {
    id: "san-andreas",
    name: "San Andreas",
    kind: "transform",
    path: [
      [32.5, -115.5],
      [34.0, -118.0],
      [36.0, -120.5],
      [38.0, -122.5],
      [40.0, -124.0],
    ],
  },
  {
    id: "alpine-nz",
    name: "Alpine Fault (NZ)",
    kind: "transform",
    path: [
      [-44.5, 168.0],
      [-43.0, 170.5],
      [-41.5, 173.0],
      [-40.5, 175.0],
    ],
  },

  // —— Alpine–Himalayan collision ——
  {
    id: "alp-him",
    name: "Alpen–Himalaya",
    kind: "collision",
    path: [
      [36.0, -5.0],
      [37.0, 0.0],
      [40.0, 10.0],
      [42.0, 20.0],
      [40.0, 30.0],
      [38.0, 40.0],
      [36.0, 50.0],
      [34.0, 60.0],
      [30.0, 70.0],
      [28.0, 80.0],
      [28.0, 90.0],
      [26.0, 95.0],
    ],
  },
  {
    id: "zagros",
    name: "Zagros",
    kind: "collision",
    path: [
      [27.0, 52.0],
      [30.0, 50.0],
      [33.0, 48.0],
      [36.0, 45.0],
      [38.0, 42.0],
    ],
  },

  // —— East African Rift ——
  {
    id: "ear",
    name: "Ostafrikanischer Graben",
    kind: "rift",
    path: [
      [15.0, 40.0],
      [10.0, 40.5],
      [5.0, 38.0],
      [0.0, 36.0],
      [-5.0, 35.0],
      [-10.0, 34.0],
      [-15.0, 32.0],
      [-20.0, 30.0],
    ],
  },

  // —— Indian Ocean ridges ——
  {
    id: "cir",
    name: "Zentralindischer Rücken",
    kind: "ridge",
    path: [
      [-5.0, 68.0],
      [-15.0, 70.0],
      [-25.0, 72.0],
      [-35.0, 78.0],
      [-40.0, 85.0],
      [-45.0, 95.0],
      [-50.0, 110.0],
      [-52.0, 130.0],
      [-55.0, 145.0],
    ],
  },
  {
    id: "swir",
    name: "SW-Indischer Rücken",
    kind: "ridge",
    path: [
      [-30.0, 55.0],
      [-35.0, 50.0],
      [-40.0, 45.0],
      [-45.0, 40.0],
      [-50.0, 30.0],
      [-52.0, 20.0],
      [-54.0, 5.0],
    ],
  },
  {
    id: "carlsberg",
    name: "Carlsberg-Rücken",
    kind: "ridge",
    path: [
      [10.0, 57.0],
      [5.0, 60.0],
      [0.0, 65.0],
      [-5.0, 68.0],
    ],
  },

  // —— Caribbean / Scotia ——
  {
    id: "caribbean",
    name: "Karibik-Plattenrand",
    kind: "transform",
    path: [
      [18.0, -75.0],
      [18.5, -70.0],
      [16.0, -62.0],
      [14.0, -60.0],
      [12.0, -62.0],
      [12.0, -70.0],
      [14.0, -78.0],
      [16.0, -85.0],
    ],
  },
  {
    id: "scotia",
    name: "Scotia-Bogen",
    kind: "subduction",
    path: [
      [-55.0, -65.0],
      [-57.0, -55.0],
      [-58.0, -40.0],
      [-57.0, -30.0],
      [-55.0, -25.0],
      [-54.0, -30.0],
      [-55.0, -40.0],
      [-56.0, -55.0],
      [-55.0, -65.0],
    ],
  },

  // —— Philippine / Ryukyu ——
  {
    id: "philippine",
    name: "Philippinen-Graben",
    kind: "subduction",
    path: [
      [20.0, 122.0],
      [15.0, 125.0],
      [10.0, 127.0],
      [5.0, 128.0],
      [2.0, 127.0],
    ],
  },
  {
    id: "ryukyu",
    name: "Ryukyu-Graben",
    kind: "subduction",
    path: [
      [30.0, 132.0],
      [28.0, 130.0],
      [26.0, 128.0],
      [24.0, 125.0],
      [22.0, 122.0],
    ],
  },
];

const KIND_DE: Record<GlobePlate["kind"], string> = {
  ridge: "Spreizungszone",
  transform: "Transformstörung",
  subduction: "Subduktion",
  collision: "Kollision",
  rift: "Grabenbruch",
};

export function formatPlateKind(kind: GlobePlate["kind"]): string {
  return KIND_DE[kind];
}
