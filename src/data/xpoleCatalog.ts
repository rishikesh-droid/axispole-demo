import type {
  CeilingType,
  HeightUnit,
  PoleDiameterMm,
  PoleFinishId,
  PoleInstance,
  PriceTierId,
} from '../types/pole';

export interface XPolePriceSet {
  retail: number;
  wholesale20: number;
  wholesale30: number;
}

export interface XPolePartEntry {
  id: string;
  isCX: boolean;
  heightMinMm: number;
  heightMaxMm: number;
  heightInLabel: string;
  heightFtLabel: string;
  included: Record<PoleFinishId, string[]>;
  finishes: Record<PoleFinishId, XPolePriceSet | null>;
  materialMix?: boolean;
  importantNote?: string;
  siliconeExtraNote?: string;
}

export interface XPoleFinishMeta {
  key: PoleFinishId;
  label: string;
  shortLabel: string;
}

export interface XPoleCatalogData {
  priceTiers: {
    retail: { default: true; label: string; shortLabel: string; discountPct: number };
    wholesale20: { roles: string[]; label: string; shortLabel: string; discountPct: number };
    wholesale30: { roles: string[]; label: string; shortLabel: string; discountPct: number };
  };
  inputs: {
    diameters: { key: '40mm' | '45mm'; mm: PoleDiameterMm; label: string }[];
    ceilingTypes: { key: CeilingType; label: string }[];
    heightUnits: HeightUnit[];
  };
  finishes: XPoleFinishMeta[];
  alwaysIncluded: string[];
  materialMixFinishes: PoleFinishId[];
  parts: XPolePartEntry[];
}

export const XPOLE_FINISH_ORDER: PoleFinishId[] = [
  'chrome',
  'stainless',
  'powder',
  'silicone',
  'brass',
];

/**
 * Official X-POLE PX Build-a-Pole (2-PCS) Source-of-Truth Catalog
 * Synced verbatim with build-a-pole-price-v2.json and PX.Build-a-Pole March 2026 PDF notes.
 */
export const XPOLE_CATALOG: XPoleCatalogData = {
  priceTiers: {
    retail: {
      default: true,
      label: 'Retail',
      shortLabel: 'Retail',
      discountPct: 0,
    },
    wholesale20: {
      roles: ['xpole20'],
      label: 'Wholesale 20%',
      shortLabel: '20% Off',
      discountPct: 20,
    },
    wholesale30: {
      roles: ['xpole30'],
      label: 'Wholesale 30%',
      shortLabel: '30% Off',
      discountPct: 30,
    },
  },
  inputs: {
    diameters: [
      { key: '40mm', mm: 40, label: '40mm' },
      { key: '45mm', mm: 45, label: '45mm' },
    ],
    ceilingTypes: [
      { key: 'flat', label: 'Flat' },
      { key: 'vaulted', label: 'Vaulted/Slanted' },
    ],
    heightUnits: ['mm', 'ft'],
  },
  finishes: [
    { key: 'chrome', label: 'Chrome', shortLabel: 'Chrome' },
    { key: 'stainless', label: 'Stainless Steel', shortLabel: 'Stainless' },
    { key: 'powder', label: 'Powder Coated Black/White', shortLabel: 'Powder Coated' },
    { key: 'silicone', label: 'Silicone Black', shortLabel: 'Silicone' },
    { key: 'brass', label: 'Brass', shortLabel: 'Brass' },
  ],
  alwaysIncluded: ['Mount', 'Top insert', 'Base', 'Tool Pouch'],
  materialMixFinishes: ['stainless'],
  parts: [
    {
      id: 'only A pole',
      isCX: false,
      heightMinMm: 2641,
      heightMaxMm: 2718,
      heightInLabel: '104–107"',
      heightFtLabel: `8'8" – 8'11"`,
      importantNote: 'Extend top insert',
      siliconeExtraNote: '40mm for SN',
      included: {
        chrome: [],
        stainless: [],
        powder: [],
        silicone: [],
        brass: [],
      },
      finishes: {
        chrome: { retail: 749.95, wholesale20: 587.17, wholesale30: 513.77 },
        stainless: { retail: 859.95, wholesale20: 675.17, wholesale30: 590.77 },
        powder: { retail: 749.95, wholesale20: 587.17, wholesale30: 513.77 },
        silicone: { retail: 853.95, wholesale20: 670.37, wholesale30: 586.57 },
        brass: { retail: 983.95, wholesale20: 774.37, wholesale30: 677.57 },
      },
    },
    {
      id: '125',
      isCX: false,
      heightMinMm: 2717,
      heightMaxMm: 2820,
      heightInLabel: '107–111"',
      heightFtLabel: `8'11" – 9'3"`,
      importantNote: 'Reg top insert + 180 x-joint',
      siliconeExtraNote: '40mm for SN',
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: ['X-Joint'],
      },
      finishes: {
        chrome: { retail: 782.93, wholesale20: 613.55, wholesale30: 536.86 },
        stainless: { retail: 904.93, wholesale20: 711.15, wholesale30: 622.26 },
        powder: { retail: 782.93, wholesale20: 613.55, wholesale30: 536.86 },
        silicone: { retail: 891.93, wholesale20: 700.75, wholesale30: 613.16 },
        brass: { retail: 1028.93, wholesale20: 810.35, wholesale30: 709.06 },
      },
    },
    {
      id: '200',
      isCX: false,
      heightMinMm: 2819,
      heightMaxMm: 2921,
      heightInLabel: '111–115"',
      heightFtLabel: `9'3" – 9'7"`,
      importantNote: 'Ext top insert + 180 x-joint',
      siliconeExtraNote: '40mm for SN',
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: ['X-Joint'],
      },
      finishes: {
        chrome: { retail: 833.93, wholesale20: 654.35, wholesale30: 572.56 },
        stainless: { retail: 957.93, wholesale20: 753.55, wholesale30: 659.36 },
        powder: { retail: 837.93, wholesale20: 657.55, wholesale30: 575.36 },
        silicone: { retail: 944.93, wholesale20: 743.15, wholesale30: 650.26 },
        brass: { retail: 1080.93, wholesale20: 851.95, wholesale30: 745.46 },
      },
    },
    {
      id: '250',
      isCX: false,
      heightMinMm: 2870,
      heightMaxMm: 2972,
      heightInLabel: '113–117"',
      heightFtLabel: `9'5" – 9'9"`,
      importantNote: 'Ext top insert + 250 x-joint',
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: ['X-Joint'],
      },
      finishes: {
        chrome: { retail: 837.93, wholesale20: 657.55, wholesale30: 575.36 },
        stainless: { retail: 965.93, wholesale20: 759.95, wholesale30: 664.96 },
        powder: { retail: 837.93, wholesale20: 657.55, wholesale30: 575.36 },
        silicone: { retail: 950.93, wholesale20: 747.95, wholesale30: 654.46 },
        brass: { retail: 1088.93, wholesale20: 858.35, wholesale30: 751.06 },
      },
    },
    {
      id: '300',
      isCX: false,
      heightMinMm: 2921,
      heightMaxMm: 3023,
      heightInLabel: '115–119"',
      heightFtLabel: `9'7" – 9'11"`,
      importantNote: 'Stainless w/Chrome ext',
      materialMix: true,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: [],
        silicone: [],
        brass: [],
      },
      finishes: {
        chrome: { retail: 838.93, wholesale20: 658.35, wholesale30: 576.06 },
        stainless: { retail: 948.93, wholesale20: 746.35, wholesale30: 653.06 },
        powder: null,
        silicone: null,
        brass: null,
      },
    },
    {
      id: '400',
      isCX: false,
      heightMinMm: 3022,
      heightMaxMm: 3125,
      heightInLabel: '119–123"',
      heightFtLabel: `9'11" – 10'3"`,
      importantNote: 'Stainless w/Chrome ext',
      materialMix: true,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: [],
        silicone: [],
        brass: [],
      },
      finishes: {
        chrome: { retail: 843.93, wholesale20: 662.35, wholesale30: 579.56 },
        stainless: { retail: 953.93, wholesale20: 750.35, wholesale30: 656.56 },
        powder: null,
        silicone: null,
        brass: null,
      },
    },
    {
      id: '500',
      isCX: false,
      heightMinMm: 3124,
      heightMaxMm: 3226,
      heightInLabel: '123–127"',
      heightFtLabel: `10'3" – 10'7"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: ['X-Joint'],
      },
      finishes: {
        chrome: { retail: 846.93, wholesale20: 664.75, wholesale30: 581.66 },
        stainless: { retail: 979.93, wholesale20: 771.15, wholesale30: 674.76 },
        powder: { retail: 846.93, wholesale20: 664.75, wholesale30: 581.66 },
        silicone: { retail: 973.93, wholesale20: 766.35, wholesale30: 670.56 },
        brass: { retail: 1119.93, wholesale20: 883.15, wholesale30: 772.76 },
      },
    },
    {
      id: 'CX600',
      isCX: true,
      heightMinMm: 3225,
      heightMaxMm: 3328,
      heightInLabel: '127–131"',
      heightFtLabel: `10'7" – 10'11"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: [],
      },
      finishes: {
        chrome: { retail: 858.93, wholesale20: 674.35, wholesale30: 590.06 },
        stainless: { retail: 1015.93, wholesale20: 799.95, wholesale30: 699.96 },
        powder: { retail: 854.93, wholesale20: 671.15, wholesale30: 587.26 },
        silicone: { retail: 1009.93, wholesale20: 795.15, wholesale30: 695.76 },
        brass: null,
      },
    },
    {
      id: 'CX700',
      isCX: true,
      heightMinMm: 3327,
      heightMaxMm: 3429,
      heightInLabel: '131–135"',
      heightFtLabel: `10'11" – 11'3"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: [],
      },
      finishes: {
        chrome: { retail: 860.93, wholesale20: 675.95, wholesale30: 591.46 },
        stainless: { retail: 1017.93, wholesale20: 801.55, wholesale30: 701.36 },
        powder: { retail: 858.93, wholesale20: 674.35, wholesale30: 590.06 },
        silicone: { retail: 1011.93, wholesale20: 796.75, wholesale30: 697.16 },
        brass: null,
      },
    },
    {
      id: '750',
      isCX: false,
      heightMinMm: 3378,
      heightMaxMm: 3480,
      heightInLabel: '133–137"',
      heightFtLabel: `11'1" – 11'5"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: ['X-Joint'],
      },
      finishes: {
        chrome: { retail: 851.93, wholesale20: 668.75, wholesale30: 585.16 },
        stainless: { retail: 995.93, wholesale20: 783.95, wholesale30: 685.96 },
        powder: { retail: 851.93, wholesale20: 668.75, wholesale30: 585.16 },
        silicone: { retail: 989.93, wholesale20: 779.15, wholesale30: 681.76 },
        brass: { retail: 1135.93, wholesale20: 895.95, wholesale30: 783.96 },
      },
    },
    {
      id: 'CX800',
      isCX: true,
      heightMinMm: 3429,
      heightMaxMm: 3531,
      heightInLabel: '135–139"',
      heightFtLabel: `11'3" – 11'7"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: [],
      },
      finishes: {
        chrome: { retail: 864.93, wholesale20: 679.15, wholesale30: 594.26 },
        stainless: { retail: 1021.93, wholesale20: 804.75, wholesale30: 704.16 },
        powder: { retail: 860.93, wholesale20: 675.95, wholesale30: 591.46 },
        silicone: { retail: 1015.93, wholesale20: 799.95, wholesale30: 699.96 },
        brass: null,
      },
    },
    {
      id: 'CX900',
      isCX: true,
      heightMinMm: 3530,
      heightMaxMm: 3633,
      heightInLabel: '139–143"',
      heightFtLabel: `11'7" – 11'11"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: [],
      },
      finishes: {
        chrome: { retail: 867.93, wholesale20: 681.55, wholesale30: 596.36 },
        stainless: { retail: 1024.93, wholesale20: 807.15, wholesale30: 706.26 },
        powder: { retail: 864.93, wholesale20: 679.15, wholesale30: 594.26 },
        silicone: { retail: 1018.93, wholesale20: 802.35, wholesale30: 702.06 },
        brass: null,
      },
    },
    {
      id: '1000',
      isCX: false,
      heightMinMm: 3632,
      heightMaxMm: 3734,
      heightInLabel: '143–147"',
      heightFtLabel: `11'11" – 12'3"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: ['X-Joint'],
      },
      finishes: {
        chrome: { retail: 858.93, wholesale20: 674.35, wholesale30: 590.06 },
        stainless: { retail: 1011.93, wholesale20: 796.75, wholesale30: 697.16 },
        powder: { retail: 858.93, wholesale20: 674.35, wholesale30: 590.06 },
        silicone: { retail: 1005.93, wholesale20: 791.95, wholesale30: 692.96 },
        brass: { retail: 1150.93, wholesale20: 907.95, wholesale30: 794.46 },
      },
    },
    {
      id: 'CX1000',
      isCX: true,
      heightMinMm: 3632,
      heightMaxMm: 3734,
      heightInLabel: '143–147"',
      heightFtLabel: `11'11" – 12'3"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: ['X-Joint'],
      },
      finishes: {
        chrome: { retail: 869.93, wholesale20: 683.15, wholesale30: 597.76 },
        stainless: { retail: 1026.93, wholesale20: 808.75, wholesale30: 707.66 },
        powder: { retail: 867.93, wholesale20: 681.55, wholesale30: 596.36 },
        silicone: { retail: 1023.93, wholesale20: 806.35, wholesale30: 705.56 },
        brass: { retail: 1165.93, wholesale20: 919.95, wholesale30: 804.96 },
      },
    },
    {
      id: 'NS B/PX B',
      isCX: false,
      heightMinMm: 3733,
      heightMaxMm: 3836,
      heightInLabel: '147–151"',
      heightFtLabel: `12'3" – 12'7"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: [],
      },
      finishes: {
        chrome: { retail: 858.93, wholesale20: 674.35, wholesale30: 590.06 },
        stainless: { retail: 1011.93, wholesale20: 796.75, wholesale30: 697.16 },
        powder: { retail: 838.93, wholesale20: 658.35, wholesale30: 576.06 },
        silicone: { retail: 989.93, wholesale20: 779.15, wholesale30: 681.76 },
        brass: null,
      },
    },
    {
      id: 'CX1100',
      isCX: true,
      heightMinMm: 3733,
      heightMaxMm: 3836,
      heightInLabel: '147–151"',
      heightFtLabel: `12'3" – 12'7"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: [],
      },
      finishes: {
        chrome: { retail: 873.93, wholesale20: 686.35, wholesale30: 600.56 },
        stainless: { retail: 1030.93, wholesale20: 811.95, wholesale30: 710.46 },
        powder: { retail: 869.93, wholesale20: 683.15, wholesale30: 597.76 },
        silicone: { retail: 1031.93, wholesale20: 812.75, wholesale30: 711.16 },
        brass: null,
      },
    },
    {
      id: 'CX1200',
      isCX: true,
      heightMinMm: 3835,
      heightMaxMm: 3937,
      heightInLabel: '151–155"',
      heightFtLabel: `12'7" – 12'11"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: [],
      },
      finishes: {
        chrome: { retail: 876.93, wholesale20: 688.75, wholesale30: 602.66 },
        stainless: { retail: 1039.93, wholesale20: 819.15, wholesale30: 716.76 },
        powder: { retail: 873.93, wholesale20: 686.35, wholesale30: 600.56 },
        silicone: { retail: 1036.93, wholesale20: 816.75, wholesale30: 714.66 },
        brass: null,
      },
    },
    {
      id: 'CX1300',
      isCX: true,
      heightMinMm: 3937,
      heightMaxMm: 4039,
      heightInLabel: '155–159"',
      heightFtLabel: `12'11" – 13'3"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: [],
      },
      finishes: {
        chrome: { retail: 880.93, wholesale20: 691.95, wholesale30: 605.46 },
        stainless: { retail: 1048.93, wholesale20: 826.35, wholesale30: 723.06 },
        powder: { retail: 876.93, wholesale20: 688.75, wholesale30: 602.66 },
        silicone: { retail: 1044.93, wholesale20: 823.15, wholesale30: 720.26 },
        brass: null,
      },
    },
    {
      id: 'CX1400',
      isCX: true,
      heightMinMm: 4038,
      heightMaxMm: 4141,
      heightInLabel: '159–163"',
      heightFtLabel: `13'3" – 13'7"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: [],
      },
      finishes: {
        chrome: { retail: 884.93, wholesale20: 695.15, wholesale30: 608.26 },
        stainless: { retail: 1057.93, wholesale20: 833.55, wholesale30: 729.36 },
        powder: { retail: 880.93, wholesale20: 691.95, wholesale30: 605.46 },
        silicone: { retail: 1051.93, wholesale20: 828.75, wholesale30: 725.16 },
        brass: null,
      },
    },
    {
      id: 'CX1500',
      isCX: true,
      heightMinMm: 4140,
      heightMaxMm: 4242,
      heightInLabel: '163–167"',
      heightFtLabel: `13'7" – 13'11"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: ['X-Joint'],
        silicone: ['X-Joint'],
        brass: [],
      },
      finishes: {
        chrome: { retail: 888.93, wholesale20: 698.35, wholesale30: 611.06 },
        stainless: { retail: 1065.93, wholesale20: 839.95, wholesale30: 734.96 },
        powder: { retail: 878.93, wholesale20: 690.35, wholesale30: 604.06 },
        silicone: { retail: 1070.93, wholesale20: 843.95, wholesale30: 738.46 },
        brass: null,
      },
    },
    {
      id: 'CX1600',
      isCX: true,
      heightMinMm: 4241,
      heightMaxMm: 4344,
      heightInLabel: '167–171"',
      heightFtLabel: `13'11" – 14'3"`,
      included: {
        chrome: ['X-Joint'],
        stainless: ['X-Joint'],
        powder: [],
        silicone: [],
        brass: [],
      },
      finishes: {
        chrome: { retail: 890.93, wholesale20: 699.95, wholesale30: 612.46 },
        stainless: { retail: 1073.93, wholesale20: 846.35, wholesale30: 740.56 },
        powder: null,
        silicone: null,
        brass: null,
      },
    },
  ],
};

export const XPOLE_MIN_CATALOG_MM = 2641;
export const XPOLE_MAX_CATALOG_MM = 4344;

export interface XPoleResolution {
  heightMm: number;
  finish: PoleFinishId;
  priceTier: PriceTierId;
  /** Matched X-POLE part from the official catalog */
  part: XPolePartEntry;
  /** True when the chosen finish is priced and orderable at this height */
  available: boolean;
  /** Exact tier prices when available, otherwise null */
  prices: XPolePriceSet | null;
  /** Selected tier unit price in USD (0 if unavailable) */
  unitPriceUsd: number;
  /** Retail unit price in USD for savings comparison */
  retailPriceUsd: number;
  /** Savings vs retail in USD */
  savingsUsd: number;
  /** Full list of included hardware items (alwaysIncluded + part.included[finish]) */
  includedHardware: string[];
  /** True when stainless steel uses a Chrome extension (parts 300 & 400) */
  hasMaterialMixNotice: boolean;
  /** True when height is below 2641mm (8'8") and falls back to base 'only A pole' kit */
  belowCatalogMin: boolean;
  /** True when height exceeds 4344mm (14'3") */
  aboveCatalogMax: boolean;
  /** All finishes that ARE available at this exact height */
  availableFinishesAtHeight: PoleFinishId[];
  /** Human-readable engineering & PDF notes for this selection */
  notes: string[];
}

export interface XPoleQuoteLine {
  poleId: string;
  poleLabel: string;
  diameterMm: PoleDiameterMm;
  finish: PoleFinishId;
  finishLabel: string;
  powderTone?: 'black' | 'white';
  heightCm: number;
  heightMm: number;
  cushionHeightCm: number;
  isSpinning: boolean;
  resolution: XPoleResolution;
  lineTotalUsd: number;
  lineRetailUsd: number;
}

export interface XPoleQuoteSummary {
  priceTier: PriceTierId;
  priceTierLabel: string;
  ceilingType: CeilingType;
  roomWidthM: number;
  roomDepthM: number;
  ceilingHeightCm: number;
  lines: XPoleQuoteLine[];
  totalUsd: number;
  retailTotalUsd: number;
  savingsUsd: number;
  unavailableCount: number;
  allAvailable: boolean;
}

export function getXPoleFinishLabel(finish: PoleFinishId, powderTone?: 'black' | 'white'): string {
  if (finish === 'powder' && powderTone) {
    return powderTone === 'white' ? 'Powder Coated White' : 'Powder Coated Black';
  }
  return XPOLE_CATALOG.finishes.find((f) => f.key === finish)?.label ?? finish;
}

/**
 * Automatically selects the exact X-POLE PX Build-a-Pole part & extension kit
 * for any pole height (in mm) and finish, matching build-a-pole-price-v2.json verbatim.
 */
export function resolveXPoleConfiguration(
  heightMm: number,
  finish: PoleFinishId,
  priceTier: PriceTierId = 'retail'
): XPoleResolution {
  const safeMm = Math.round(heightMm);
  const belowCatalogMin = safeMm < XPOLE_MIN_CATALOG_MM;
  const aboveCatalogMax = safeMm > XPOLE_MAX_CATALOG_MM;
  const lookupMm = Math.max(XPOLE_MIN_CATALOG_MM, Math.min(XPOLE_MAX_CATALOG_MM, safeMm));

  // Find all parts covering this height band
  const candidates = XPOLE_CATALOG.parts.filter(
    (p) => lookupMm >= p.heightMinMm && lookupMm <= p.heightMaxMm
  );

  // Fallback to closest part by midpoint if a gap ever exists
  const matchingParts =
    candidates.length > 0
      ? candidates
      : [
          XPOLE_CATALOG.parts.reduce((best, cur) => {
            const bestMid = (best.heightMinMm + best.heightMaxMm) / 2;
            const curMid = (cur.heightMinMm + cur.heightMaxMm) / 2;
            return Math.abs(curMid - lookupMm) < Math.abs(bestMid - lookupMm) ? cur : best;
          }),
        ];

  // Collect all finishes available across matching parts at this height
  const finishSet = new Set<PoleFinishId>();
  for (const part of matchingParts) {
    for (const f of XPOLE_CATALOG.finishes) {
      if (part.finishes[f.key] !== null) {
        finishSet.add(f.key);
      }
    }
  }
  const availableFinishesAtHeight = XPOLE_CATALOG.finishes
    .map((f) => f.key)
    .filter((k) => finishSet.has(k));

  // Prefer matching parts where the chosen finish is available; among those prefer standard (non-CX) / lowest retail price
  const availableMatches = matchingParts.filter((p) => p.finishes[finish] !== null);
  const sortedPool = (availableMatches.length > 0 ? availableMatches : matchingParts).sort((a, b) => {
    if (a.isCX !== b.isCX) return a.isCX ? 1 : -1;
    const pa = a.finishes[finish]?.retail ?? Number.MAX_SAFE_INTEGER;
    const pb = b.finishes[finish]?.retail ?? Number.MAX_SAFE_INTEGER;
    return pa - pb;
  });

  const selectedPart = sortedPool[0];
  const prices = selectedPart.finishes[finish];
  const available = prices !== null && !aboveCatalogMax;

  const unitPriceUsd = available && prices ? prices[priceTier] : 0;
  const retailPriceUsd = available && prices ? prices.retail : 0;
  const savingsUsd = Number(Math.max(0, retailPriceUsd - unitPriceUsd).toFixed(2));

  const extraIncluded = selectedPart.included[finish] ?? [];
  const includedHardware = [...XPOLE_CATALOG.alwaysIncluded, ...extraIncluded];

  const hasMaterialMixNotice =
    Boolean(selectedPart.materialMix) &&
    XPOLE_CATALOG.materialMixFinishes.includes(finish) &&
    available;

  const notes: string[] = [];
  if (belowCatalogMin) {
    notes.push(`Standard ceiling (< 8'8" / 2641mm) — base PX A-Pole kit pricing applied.`);
  }
  if (aboveCatalogMax) {
    notes.push(`Exceeds 14'3" (4344mm) maximum PX Build-a-Pole catalog height.`);
  }
  if (!available && !aboveCatalogMax) {
    notes.push(
      `${getXPoleFinishLabel(finish)} is not available for ${selectedPart.id} (${selectedPart.heightFtLabel}).`
    );
  }
  if (hasMaterialMixNotice) {
    notes.push('Stainless pole supplied with Chrome extension (official X-POLE spec).');
  } else if (selectedPart.importantNote && !selectedPart.materialMix) {
    notes.push(selectedPart.importantNote);
  }
  if (finish === 'silicone' && selectedPart.siliconeExtraNote && available) {
    notes.push(`Silicone note: ${selectedPart.siliconeExtraNote}`);
  }

  return {
    heightMm: safeMm,
    finish,
    priceTier,
    part: selectedPart,
    available,
    prices: available ? prices : null,
    unitPriceUsd,
    retailPriceUsd,
    savingsUsd,
    includedHardware,
    hasMaterialMixNotice,
    belowCatalogMin,
    aboveCatalogMax,
    availableFinishesAtHeight,
    notes,
  };
}

/**
 * Generates an official multi-pole X-POLE quotation across all configured poles
 * using exact retail / wholesale20 / wholesale30 catalog pricing.
 */
export function generateXPoleQuote(
  poles: PoleInstance[],
  opts: {
    priceTier: PriceTierId;
    ceilingType: CeilingType;
    ceilingHeightCm: number;
    roomWidthM: number;
    roomDepthM: number;
  }
): XPoleQuoteSummary {
  const lines: XPoleQuoteLine[] = poles.map((pole) => {
    const heightMm = Math.round(pole.heightCm * 10);
    const resolution = resolveXPoleConfiguration(heightMm, pole.finish, opts.priceTier);
    const cushionHeightCm = Math.max(0, Math.round(opts.ceilingHeightCm - pole.heightCm));
    return {
      poleId: pole.id,
      poleLabel: pole.label,
      diameterMm: pole.diameterMm,
      finish: pole.finish,
      finishLabel: getXPoleFinishLabel(pole.finish, pole.powderTone),
      powderTone: pole.powderTone,
      heightCm: pole.heightCm,
      heightMm,
      cushionHeightCm,
      isSpinning: pole.isSpinning,
      resolution,
      lineTotalUsd: resolution.unitPriceUsd,
      lineRetailUsd: resolution.retailPriceUsd,
    };
  });

  const totalUsd = Number(lines.reduce((sum, l) => sum + l.lineTotalUsd, 0).toFixed(2));
  const retailTotalUsd = Number(lines.reduce((sum, l) => sum + l.lineRetailUsd, 0).toFixed(2));
  const savingsUsd = Number(Math.max(0, retailTotalUsd - totalUsd).toFixed(2));
  const unavailableCount = lines.filter((l) => !l.resolution.available).length;

  return {
    priceTier: opts.priceTier,
    priceTierLabel: XPOLE_CATALOG.priceTiers[opts.priceTier].label,
    ceilingType: opts.ceilingType,
    roomWidthM: opts.roomWidthM,
    roomDepthM: opts.roomDepthM,
    ceilingHeightCm: opts.ceilingHeightCm,
    lines,
    totalUsd,
    retailTotalUsd,
    savingsUsd,
    unavailableCount,
    allAvailable: unavailableCount === 0,
  };
}

export function formatUsdExact(amount: number): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function cmToFeetAndInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { feet, inches };
}

export function feetAndInchesToCm(feet: number, inches: number): number {
  const totalInches = Math.max(0, feet) * 12 + Math.max(0, inches);
  return Math.round(totalInches * 2.54);
}

export function formatFeetInches(cm: number): string {
  const { feet, inches } = cmToFeetAndInches(cm);
  return `${feet}'${inches}"`;
}

export function exportXPoleQuoteToCSV(quote: XPoleQuoteSummary): string {
  const header = [
    'Pole',
    'Auto-Selected PX Part/Ext',
    'Height Range',
    'Configured Height (mm)',
    'Finish',
    'Diameter',
    'Ceiling Type',
    'Included Hardware',
    'Notes',
    'Price Tier',
    'Unit Price (USD)',
  ];
  const rows = quote.lines.map((line) => [
    line.poleLabel,
    line.resolution.part.id,
    line.resolution.part.heightFtLabel,
    String(line.heightMm),
    line.finishLabel,
    `${line.diameterMm}mm`,
    quote.ceilingType === 'vaulted' ? 'Vaulted/Slanted' : 'Flat',
    line.resolution.includedHardware.join(' + '),
    line.resolution.notes.join(' | '),
    quote.priceTierLabel,
    line.resolution.available ? line.lineTotalUsd.toFixed(2) : 'UNAVAILABLE',
  ]);
  rows.push([
    'TOTAL',
    `${quote.lines.length} Pole(s)`,
    '',
    '',
    '',
    '',
    '',
    '',
    quote.savingsUsd > 0 ? `Wholesale savings $${quote.savingsUsd.toFixed(2)}` : '',
    quote.priceTierLabel,
    quote.totalUsd.toFixed(2),
  ]);

  return [header, ...rows]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}
