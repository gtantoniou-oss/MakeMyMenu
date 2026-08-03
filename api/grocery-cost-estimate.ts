import type {
  VercelRequest,
  VercelResponse
} from "@vercel/node";
import { isAuthorized } from "./_meal-plan-config.js";

type GroceryRequestItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
};

type Dimension = "mass" | "volume" | "count";

type PriceBasis = {
  dimension: Dimension;
  amount: number;
  label: string;
};

type CatalogEntry = {
  itemCode: string;
  label: string;
  basis: PriceBasis;
  purchaseUnits: number;
  packageLabel: string;
  exactPatterns: RegExp[];
  broadPatterns?: RegExp[];
  exclusions?: RegExp[];
  densityGramsPerMl?: number;
  gramsPerEach?: number;
  millilitersPerEach?: number;
};

type CatalogMatch = {
  entry: CatalogEntry;
  matchQuality: "strong" | "approximate" | "broad";
};

type BLSPricePoint = {
  seriesID: string;
  value: number;
  year: number;
  month: number;
  periodLabel: string;
  geography: string;
};

type Region = {
  areaCode: "0000" | "0100" | "0200" | "0300" | "0400";
  label: string;
};

type CachedPrices = {
  loadedAt: number;
  prices: Map<string, BLSPricePoint>;
};

const BLS_FOOD_DATA_URL =
  "https://download.bls.gov/pub/time.series/ap/ap.data.3.Food";
const BLS_API_URL =
  "https://api.bls.gov/publicAPI/v1/timeseries/data/";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

let cachedPrices: CachedPrices | null = null;
let priceLoadPromise: Promise<Map<string, BLSPricePoint>> | null = null;

const MASS_UNITS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592
};

const VOLUME_UNITS: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  "fl oz": 29.5735,
  floz: 29.5735,
  "fluid ounce": 29.5735,
  "fluid ounces": 29.5735,
  cup: 236.588,
  cups: 236.588,
  tbsp: 14.7868,
  tablespoon: 14.7868,
  tablespoons: 14.7868,
  tsp: 4.92892,
  teaspoon: 4.92892,
  teaspoons: 4.92892,
  pint: 473.176,
  pints: 473.176,
  pt: 473.176,
  quart: 946.353,
  quarts: 946.353,
  qt: 946.353,
  gallon: 3785.41,
  gallons: 3785.41,
  gal: 3785.41
};

const COUNT_MULTIPLIERS: Record<string, number> = {
  each: 1,
  ea: 1,
  ct: 1,
  count: 1,
  counts: 1,
  piece: 1,
  pieces: 1,
  item: 1,
  items: 1,
  can: 1,
  cans: 1,
  package: 1,
  packages: 1,
  pack: 1,
  packs: 1,
  bunch: 1,
  bunches: 1,
  loaf: 1,
  loaves: 1,
  clove: 1,
  cloves: 1,
  head: 1,
  heads: 1,
  breast: 1,
  breasts: 1,
  thigh: 1,
  thighs: 1,
  leg: 1,
  legs: 1,
  chop: 1,
  chops: 1,
  slice: 1,
  slices: 1,
  stick: 1,
  sticks: 1,
  dozen: 12,
  dozens: 12,
  doz: 12
};

const CATALOG: CatalogEntry[] = [
  {
    itemCode: "701111",
    label: "White all-purpose flour",
    basis: massBasis("per lb."),
    purchaseUnits: 5,
    packageLabel: "5 lb bag",
    exactPatterns: [/\ball[ -]?purpose flour\b/, /\bwhite flour\b/],
    broadPatterns: [/\bflour\b/],
    exclusions: [/almond|coconut|corn|chickpea|oat flour/],
    densityGramsPerMl: 0.51
  },
  {
    itemCode: "701312",
    label: "White long-grain rice",
    basis: massBasis("per lb."),
    purchaseUnits: 2,
    packageLabel: "2 lb bag",
    exactPatterns: [/\bwhite rice\b/, /\bjasmine rice\b/, /\bbasmati rice\b/],
    broadPatterns: [/\brice\b/],
    exclusions: [/rice vinegar|rice noodle|rice paper|rice flour/],
    densityGramsPerMl: 0.78
  },
  {
    itemCode: "701322",
    label: "Spaghetti and macaroni",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb package",
    exactPatterns: [/\bspaghetti\b/, /\bmacaroni\b/, /\bpenne\b/, /\blinguine\b/, /\bfettuccine\b/],
    broadPatterns: [/\bpasta\b/, /\bnoodles?\b/],
    densityGramsPerMl: 0.45
  },
  {
    itemCode: "702212",
    label: "Whole-wheat bread",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb loaf",
    exactPatterns: [/\bwhole[ -]?wheat bread\b/, /\bwheat bread\b/],
    gramsPerEach: 28
  },
  {
    itemCode: "702111",
    label: "White bread",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb loaf",
    exactPatterns: [/\bwhite bread\b/, /\bsandwich bread\b/],
    broadPatterns: [/\bbread\b/, /\bbuns?\b/, /\brolls?\b/],
    exclusions: [/bread crumbs|breadcrumb/],
    gramsPerEach: 28
  },
  {
    itemCode: "702421",
    label: "Chocolate-chip cookies",
    basis: massBasis("per lb."),
    purchaseUnits: 0.75,
    packageLabel: "12 oz package",
    exactPatterns: [/\bchocolate[ -]?chip cookies?\b/],
    broadPatterns: [/\bcookies?\b/],
    gramsPerEach: 16
  },
  {
    itemCode: "FC1101",
    label: "Uncooked ground beef",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb package",
    exactPatterns: [/\bground beef\b/, /\bground chuck\b/, /\bhamburger meat\b/],
    densityGramsPerMl: 0.95
  },
  {
    itemCode: "FC2101",
    label: "Uncooked beef roast",
    basis: massBasis("per lb."),
    purchaseUnits: 2,
    packageLabel: "2 lb roast",
    exactPatterns: [/\bbeef roast\b/, /\bchuck roast\b/, /\bround roast\b/, /\bpot roast\b/],
    broadPatterns: [/\broast beef\b/],
    gramsPerEach: 907
  },
  {
    itemCode: "703432",
    label: "Boneless beef for stew",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb package",
    exactPatterns: [/\bstew beef\b/, /\bbeef for stew\b/, /\bbeef stew meat\b/],
    gramsPerEach: 453.592
  },
  {
    itemCode: "FC3101",
    label: "Uncooked beef steak",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb package",
    exactPatterns: [/\bsirloin steak\b/, /\bribeye\b/, /\brib eye\b/, /\bstrip steak\b/, /\bflank steak\b/, /\bskirt steak\b/, /\bt[ -]?bone\b/],
    broadPatterns: [/\bbeef steak\b/, /\bsteak\b/],
    gramsPerEach: 227
  },
  {
    itemCode: "FC4101",
    label: "Other uncooked beef",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb package",
    exactPatterns: [/\bbeef short ribs?\b/, /\bbeef cubes?\b/],
    broadPatterns: [/\bbeef\b/],
    exclusions: [/broth|stock|bouillon/],
    gramsPerEach: 227
  },
  {
    itemCode: "704111",
    label: "Sliced bacon",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb package",
    exactPatterns: [/\bbacon\b/],
    gramsPerEach: 28
  },
  {
    itemCode: "FD3101",
    label: "Pork chops",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb package",
    exactPatterns: [/\bpork chops?\b/],
    gramsPerEach: 170
  },
  {
    itemCode: "FD2101",
    label: "Ham",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb package",
    exactPatterns: [/\bham\b/],
    exclusions: [/hamburger/],
    gramsPerEach: 28
  },
  {
    itemCode: "FD4101",
    label: "Other uncooked pork",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb package",
    exactPatterns: [/\bpork tenderloin\b/, /\bpork shoulder\b/, /\bpork loin\b/, /\bpork sausage\b/],
    broadPatterns: [/\bpork\b/],
    exclusions: [/pork broth|pork stock/],
    gramsPerEach: 227
  },
  {
    itemCode: "FF1101",
    label: "Boneless chicken breast",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb package",
    exactPatterns: [/\bchicken breasts?\b/, /\bboneless chicken\b/, /\bchicken cutlets?\b/],
    gramsPerEach: 227
  },
  {
    itemCode: "706212",
    label: "Bone-in chicken legs",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb package",
    exactPatterns: [/\bchicken legs?\b/, /\bchicken thighs?\b/, /\bdrumsticks?\b/],
    gramsPerEach: 170
  },
  {
    itemCode: "706111",
    label: "Fresh whole chicken",
    basis: massBasis("per lb."),
    purchaseUnits: 4,
    packageLabel: "4 lb chicken",
    exactPatterns: [/\bwhole chicken\b/, /\broasting chicken\b/],
    broadPatterns: [/\bchicken\b/],
    exclusions: [/broth|stock|bouillon/],
    gramsPerEach: 1814
  },
  {
    itemCode: "706311",
    label: "Frozen whole turkey",
    basis: massBasis("per lb."),
    purchaseUnits: 12,
    packageLabel: "12 lb turkey",
    exactPatterns: [/\bwhole turkey\b/, /\bfrozen turkey\b/],
    exclusions: [/ground turkey|turkey breast|deli/],
    gramsPerEach: 5443
  },
  {
    itemCode: "708111",
    label: "Grade A large eggs",
    basis: countBasis(12, "per dozen"),
    purchaseUnits: 1,
    packageLabel: "1 dozen carton",
    exactPatterns: [/\beggs?\b/],
    exclusions: [/eggplant|egg noodles/],
    gramsPerEach: 50
  },
  {
    itemCode: "709112",
    label: "Fresh whole milk",
    basis: volumeBasis(3785.41, "per gallon"),
    purchaseUnits: 1,
    packageLabel: "1 gallon",
    exactPatterns: [/\bwhole milk\b/],
    densityGramsPerMl: 1.03,
    millilitersPerEach: 3785.41
  },
  {
    itemCode: "FJ1101",
    label: "Fresh low-fat or skim milk",
    basis: volumeBasis(3785.41, "per gallon"),
    purchaseUnits: 1,
    packageLabel: "1 gallon",
    exactPatterns: [/\bskim milk\b/, /\blow[ -]?fat milk\b/, /\breduced[ -]?fat milk\b/, /\b2% milk\b/, /\b1% milk\b/],
    broadPatterns: [/\bmilk\b/],
    exclusions: [/almond|oat|soy|coconut|evaporated|condensed|powder/],
    densityGramsPerMl: 1.03,
    millilitersPerEach: 3785.41
  },
  {
    itemCode: "FS1101",
    label: "Stick butter",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb box",
    exactPatterns: [/\bbutter\b/],
    exclusions: [/peanut butter|almond butter|apple butter/],
    densityGramsPerMl: 0.96,
    gramsPerEach: 113.4
  },
  {
    itemCode: "FJ4101",
    label: "Yogurt",
    basis: massBasis("per 8 oz.", 226.8),
    purchaseUnits: 1,
    packageLabel: "8 oz container",
    exactPatterns: [/\byogurt\b/, /\bgreek yoghurt\b/, /\byoghurt\b/],
    densityGramsPerMl: 1.03,
    gramsPerEach: 226.8
  },
  {
    itemCode: "710212",
    label: "Natural cheddar cheese",
    basis: massBasis("per lb."),
    purchaseUnits: 0.5,
    packageLabel: "8 oz package",
    exactPatterns: [/\bcheddar\b/],
    broadPatterns: [/\bcheese\b/],
    exclusions: [/cream cheese|cottage cheese|cheesecake/],
    densityGramsPerMl: 0.97,
    gramsPerEach: 28
  },
  {
    itemCode: "710211",
    label: "American processed cheese",
    basis: massBasis("per lb."),
    purchaseUnits: 0.75,
    packageLabel: "12 oz package",
    exactPatterns: [/\bamerican cheese\b/, /\bprocessed cheese\b/],
    gramsPerEach: 21
  },
  {
    itemCode: "710411",
    label: "Prepackaged ice cream",
    basis: volumeBasis(1892.71, "per half gallon"),
    purchaseUnits: 1,
    packageLabel: "half-gallon container",
    exactPatterns: [/\bice cream\b/],
    densityGramsPerMl: 0.55,
    millilitersPerEach: 1892.71
  },
  produce("711211", "Bananas", [/\bbananas?\b/], 118),
  produce("711311", "Navel oranges", [/\boranges?\b/], 140),
  produce("711411", "Grapefruit", [/\bgrapefruits?\b/], 246),
  produce("711412", "Lemons", [/\blemons?\b/], 84),
  produce("711413", "Pears", [/\bpears?\b/], 178),
  produce("711414", "Peaches", [/\bpeaches?\b/], 150),
  {
    itemCode: "711415",
    label: "Strawberries",
    basis: massBasis("per 12 oz.", 340.2),
    purchaseUnits: 1,
    packageLabel: "12 oz container",
    exactPatterns: [/\bstrawberries?\b/],
    gramsPerEach: 12
  },
  produce("711417", "Seedless grapes", [/\bgrapes?\b/], 5),
  produce("711418", "Cherries", [/\bcherries?\b/], 8),
  produce("712112", "White potatoes", [/\bpotatoes?\b/, /\brusset potatoes?\b/], 213),
  produce("712211", "Iceberg lettuce", [/\biceberg lettuce\b/], 539),
  produce("FL2101", "Romaine lettuce", [/\bromaine\b/], 539),
  {
    ...produce("712211", "Lettuce", [/\blettuce\b/], 539),
    broadPatterns: [/\blettuce\b/]
  },
  produce("712311", "Field-grown tomatoes", [/\btomatoes?\b/], 123),
  produce("712406", "Sweet peppers", [/\bbell peppers?\b/, /\bsweet peppers?\b/], 164),
  produce("712412", "Broccoli", [/\bbroccoli\b/], 300),
  {
    itemCode: "713111",
    label: "Frozen orange-juice concentrate",
    basis: volumeBasis(473.176, "per 16 fl. oz."),
    purchaseUnits: 1,
    packageLabel: "16 fl. oz. equivalent",
    exactPatterns: [/\borange juice\b/],
    densityGramsPerMl: 1.04,
    millilitersPerEach: 473.176
  },
  {
    itemCode: "714221",
    label: "Canned corn",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "approximately 1 lb can",
    exactPatterns: [/\bcanned corn\b/, /\bcan of corn\b/],
    broadPatterns: [/\bcorn kernels\b/],
    gramsPerEach: 425
  },
  {
    itemCode: "714233",
    label: "Dried beans",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb bag",
    exactPatterns: [/\bdried beans?\b/, /\bdry beans?\b/],
    broadPatterns: [/\bblack beans?\b/, /\bpinto beans?\b/, /\bkidney beans?\b/],
    exclusions: [/green beans|canned beans/],
    densityGramsPerMl: 0.76,
    gramsPerEach: 453.592
  },
  {
    itemCode: "715211",
    label: "White sugar",
    basis: massBasis("per lb."),
    purchaseUnits: 4,
    packageLabel: "4 lb bag",
    exactPatterns: [/\bwhite sugar\b/, /\bgranulated sugar\b/],
    broadPatterns: [/\bsugar\b/],
    exclusions: [/brown sugar|powdered sugar|sugar snap/],
    densityGramsPerMl: 0.85
  },
  {
    itemCode: "716116",
    label: "Soft margarine",
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "1 lb tub",
    exactPatterns: [/\bmargarine\b/],
    densityGramsPerMl: 0.96
  },
  {
    itemCode: "717311",
    label: "Ground roast coffee",
    basis: massBasis("per lb."),
    purchaseUnits: 0.75,
    packageLabel: "12 oz bag",
    exactPatterns: [/\bground coffee\b/, /\bcoffee beans?\b/],
    broadPatterns: [/\bcoffee\b/],
    exclusions: [/brewed coffee|coffee drink/],
    densityGramsPerMl: 0.36
  },
  {
    itemCode: "718311",
    label: "Potato chips",
    basis: massBasis("per 16 oz.", 453.592),
    purchaseUnits: 0.5,
    packageLabel: "8 oz bag",
    exactPatterns: [/\bpotato chips?\b/],
    broadPatterns: [/\bchips?\b/],
    exclusions: [/chocolate chips|wood chips/],
    gramsPerEach: 2
  },
  {
    itemCode: "FN1101",
    label: "Soft drinks",
    basis: volumeBasis(2000, "per 2 liters"),
    purchaseUnits: 1,
    packageLabel: "2 liter bottle",
    exactPatterns: [/\bsoft drinks?\b/, /\bsoda\b/, /\bcola\b/],
    millilitersPerEach: 2000
  }
];

const AREA_CODES: Region[] = [
  { areaCode: "0000", label: "U.S. city average" },
  { areaCode: "0100", label: "Northeast region" },
  { areaCode: "0200", label: "Midwest region" },
  { areaCode: "0300", label: "South region" },
  { areaCode: "0400", label: "West region" }
];

const ALL_SERIES_IDS = new Set(
  CATALOG.flatMap((entry) =>
    AREA_CODES.map((region) =>
      seriesID(region.areaCode, entry.itemCode)
    )
  )
);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  if (!isAuthorized(req.headers["x-app-token"])) {
    return res.status(401).json({
      error: "Unauthorized."
    });
  }

  const zipCode = typeof req.body?.zipCode === "string"
    ? req.body.zipCode.trim()
    : "";

  const rawItems = Array.isArray(req.body?.items)
    ? req.body.items
    : [];

  if (!/^\d{5}$/.test(zipCode)) {
    return res.status(400).json({
      error: "A valid 5-digit ZIP code is required."
    });
  }

  const items: GroceryRequestItem[] = rawItems
    .filter((item: unknown): item is GroceryRequestItem => {
      if (typeof item !== "object" || item === null) {
        return false;
      }

      const value = item as Partial<GroceryRequestItem>;

      return typeof value.id === "string"
        && typeof value.name === "string"
        && typeof value.quantity === "number"
        && Number.isFinite(value.quantity)
        && value.quantity > 0
        && typeof value.unit === "string";
    })
    .slice(0, 80);

  const region = regionForZip(zipCode);

  if (items.length === 0) {
    return res.status(200).json(
      emptyEstimate(zipCode, region)
    );
  }

  const matchedRequests = items.map((item) => ({
    item,
    match: matchCatalog(item.name)
  }));

  const desiredSeries = new Set<string>();

  for (const request of matchedRequests) {
    if (!request.match) {
      continue;
    }

    desiredSeries.add(
      seriesID(region.areaCode, request.match.entry.itemCode)
    );
    desiredSeries.add(
      seriesID("0000", request.match.entry.itemCode)
    );
  }

  try {
    const prices = desiredSeries.size > 0
      ? await loadBLSPrices(desiredSeries)
      : new Map<string, BLSPricePoint>();

    const pricedItems = matchedRequests
      .map(({ item, match }) => {
        if (!match) {
          return null;
        }

        return priceItem(
          item,
          match,
          region,
          prices
        );
      })
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== null
      );

    const matchedIDs = new Set(
      pricedItems.map((item) => item.shoppingItemID)
    );

    const unmatchedItems = items
      .filter((item) => !matchedIDs.has(item.id))
      .map((item) => item.name);

    const estimatedTotal = roundCurrency(
      pricedItems.reduce(
        (sum, item) => sum + item.estimatedCost,
        0
      )
    );

    const latestPeriod = latestPeriodLabel(
      pricedItems.map((item) => item.sourcePeriod)
    );

    return res.status(200).json({
      zipCode,
      store: {
        locationID: `BLS-${region.areaCode}`,
        name: "BLS average retail prices",
        chain: "BLS",
        address: "",
        city: "",
        state: region.label,
        zipCode,
        dataPeriod: latestPeriod,
        methodology:
          "Selected BLS average-price series are matched to the grocery list. Regional values are used when sufficiently current; otherwise the U.S. city average is used."
      },
      estimatedTotal,
      matchedItemCount: pricedItems.length,
      totalItemCount: items.length,
      coveragePercent: roundNumber(
        (pricedItems.length / items.length) * 100,
        1
      ),
      items: pricedItems,
      unmatchedItems,
      disclaimer:
        "This is a market-average estimate, not a store quote. It uses current U.S. Bureau of Labor Statistics average retail prices for selected foods, package-size assumptions, and the saved ZIP code to select a Census region. Unmatched specialty items, taxes, coupons, brand choices, delivery fees, and local store differences are excluded."
    });
  } catch (error) {
    console.error("BLS grocery estimate failed", error);

    return res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "Unable to retrieve current BLS food prices."
    });
  }
}

function emptyEstimate(
  zipCode: string,
  region: Region
) {
  return {
    zipCode,
    store: {
      locationID: `BLS-${region.areaCode}`,
      name: "BLS average retail prices",
      chain: "BLS",
      address: "",
      city: "",
      state: region.label,
      zipCode,
      dataPeriod: "",
      methodology:
        "No grocery purchases were required for this plan."
    },
    estimatedTotal: 0,
    matchedItemCount: 0,
    totalItemCount: 0,
    coveragePercent: 100,
    items: [],
    unmatchedItems: [],
    disclaimer:
      "No grocery purchases were required for this plan."
  };
}

function priceItem(
  item: GroceryRequestItem,
  match: CatalogMatch,
  region: Region,
  prices: Map<string, BLSPricePoint>
) {
  const regionalID = seriesID(
    region.areaCode,
    match.entry.itemCode
  );
  const nationalID = seriesID(
    "0000",
    match.entry.itemCode
  );

  const regionalPoint = region.areaCode === "0000"
    ? undefined
    : prices.get(regionalID);
  const nationalPoint = prices.get(nationalID);

  const selectedPoint = chooseCurrentPoint(
    regionalPoint,
    nationalPoint
  );

  if (!selectedPoint) {
    return null;
  }

  const conversion = requestedBasisUnits(
    item,
    match.entry
  );

  const rawBasisUnits = conversion?.basisUnits ?? 1;
  const purchasedBasisUnits = roundUpToIncrement(
    Math.max(rawBasisUnits, match.entry.purchaseUnits),
    match.entry.purchaseUnits
  );
  const packagesNeeded = Math.max(
    1,
    Math.round(
      purchasedBasisUnits / match.entry.purchaseUnits
    )
  );

  const estimatedCost = roundCurrency(
    selectedPoint.value * purchasedBasisUnits
  );

  const quality = conversion === null
    ? "broad"
    : match.matchQuality;

  return {
    id: `${item.id}-${selectedPoint.seriesID}`,
    shoppingItemID: item.id,
    requestedName: item.name,
    requestedQuantity: item.quantity,
    requestedUnit: item.unit,
    matchedProductName: match.entry.label,
    brand: "U.S. Bureau of Labor Statistics",
    packageSize: match.entry.packageLabel,
    packagesNeeded,
    unitPrice: roundCurrency(selectedPoint.value),
    estimatedCost,
    priceType:
      selectedPoint.seriesID === regionalID
        ? "regional_average"
        : "national_average",
    matchQuality: quality,
    basisQuantity: roundNumber(
      purchasedBasisUnits,
      3
    ),
    basisUnit: match.entry.basis.label,
    sourcePeriod: selectedPoint.periodLabel,
    geography: selectedPoint.geography
  };
}

async function loadBLSPrices(
  desiredSeries: Set<string>
): Promise<Map<string, BLSPricePoint>> {
  const now = Date.now();

  if (
    cachedPrices
    && now - cachedPrices.loadedAt < CACHE_TTL_MS
  ) {
    return cachedPrices.prices;
  }

  if (priceLoadPromise) {
    return priceLoadPromise;
  }

  priceLoadPromise = loadFlatFilePrices();

  try {
    const loaded = await priceLoadPromise;
    cachedPrices = {
      loadedAt: Date.now(),
      prices: loaded
    };
    return loaded;
  } catch (flatFileError) {
    console.warn(
      "BLS flat-file download failed; trying the unregistered public API.",
      flatFileError
    );

    const fallback = await loadPublicAPIPrices(
      Array.from(desiredSeries)
    );

    return fallback;
  } finally {
    priceLoadPromise = null;
  }
}

async function loadFlatFilePrices(): Promise<
  Map<string, BLSPricePoint>
> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    25000
  );

  try {
    const response = await fetch(
      BLS_FOOD_DATA_URL,
      {
        headers: {
          "Accept": "text/plain",
          "User-Agent":
            "MakeMyMenu/1.0 BLS public-data grocery estimator"
        },
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(
        `BLS data download returned ${response.status}.`
      );
    }

    const text = await response.text();

    if (!text.includes("series_id")) {
      throw new Error(
        "BLS returned an unexpected data format."
      );
    }

    return parseBLSFlatFile(text, ALL_SERIES_IDS);
  } finally {
    clearTimeout(timeout);
  }
}

function parseBLSFlatFile(
  text: string,
  desired: Set<string>
): Map<string, BLSPricePoint> {
  const prices = new Map<string, BLSPricePoint>();
  const lines = text.split(/\r?\n/);

  for (let index = 1; index < lines.length; index += 1) {
    const columns = lines[index]
      .split("\t")
      .map((column) => column.trim());

    if (columns.length < 4) {
      continue;
    }

    const [seriesIDValue, yearText, period, valueText] = columns;

    if (
      !desired.has(seriesIDValue)
      || !/^M(0[1-9]|1[0-2])$/.test(period)
    ) {
      continue;
    }

    const year = Number(yearText);
    const month = Number(period.slice(1));
    const value = Number(valueText);

    if (
      !Number.isFinite(year)
      || !Number.isFinite(month)
      || !Number.isFinite(value)
      || value <= 0
    ) {
      continue;
    }

    const existing = prices.get(seriesIDValue);

    if (
      !existing
      || periodIndex(year, month)
        > periodIndex(existing.year, existing.month)
    ) {
      prices.set(seriesIDValue, {
        seriesID: seriesIDValue,
        value,
        year,
        month,
        periodLabel: formatPeriod(year, month),
        geography: geographyForSeries(seriesIDValue)
      });
    }
  }

  if (prices.size === 0) {
    throw new Error(
      "No current BLS food-price records were available."
    );
  }

  return prices;
}

async function loadPublicAPIPrices(
  seriesIDs: string[]
): Promise<Map<string, BLSPricePoint>> {
  const prices = new Map<string, BLSPricePoint>();

  for (const batch of chunks(seriesIDs, 25)) {
    const response = await fetch(BLS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ seriesid: batch })
    });

    if (!response.ok) {
      throw new Error(
        `BLS public API returned ${response.status}.`
      );
    }

    const result = await response.json() as {
      status?: string;
      message?: string[];
      Results?: {
        series?: Array<{
          seriesID?: string;
          data?: Array<{
            year?: string;
            period?: string;
            value?: string;
          }>;
        }>;
      };
    };

    if (result.status !== "REQUEST_SUCCEEDED") {
      throw new Error(
        result.message?.join(" ")
          || "BLS public API request failed."
      );
    }

    for (const series of result.Results?.series || []) {
      const seriesIDValue = series.seriesID;

      if (!seriesIDValue) {
        continue;
      }

      const point = (series.data || [])
        .map((datum) => {
          const year = Number(datum.year);
          const period = datum.period || "";
          const month = /^M(0[1-9]|1[0-2])$/.test(period)
            ? Number(period.slice(1))
            : 0;
          const value = Number(datum.value);

          return { year, month, value };
        })
        .filter((datum) =>
          Number.isFinite(datum.year)
          && datum.month > 0
          && Number.isFinite(datum.value)
          && datum.value > 0
        )
        .sort((a, b) =>
          periodIndex(b.year, b.month)
          - periodIndex(a.year, a.month)
        )[0];

      if (point) {
        prices.set(seriesIDValue, {
          seriesID: seriesIDValue,
          value: point.value,
          year: point.year,
          month: point.month,
          periodLabel: formatPeriod(
            point.year,
            point.month
          ),
          geography: geographyForSeries(
            seriesIDValue
          )
        });
      }
    }
  }

  if (prices.size === 0) {
    throw new Error(
      "BLS average-price data is temporarily unavailable."
    );
  }

  return prices;
}

function matchCatalog(name: string): CatalogMatch | null {
  const normalized = normalizeText(name);

  for (const entry of CATALOG) {
    if (
      entry.exclusions?.some((pattern) =>
        pattern.test(normalized)
      )
    ) {
      continue;
    }

    if (
      entry.exactPatterns.some((pattern) =>
        pattern.test(normalized)
      )
    ) {
      return {
        entry,
        matchQuality: "strong"
      };
    }
  }

  for (const entry of CATALOG) {
    if (
      entry.exclusions?.some((pattern) =>
        pattern.test(normalized)
      )
    ) {
      continue;
    }

    if (
      entry.broadPatterns?.some((pattern) =>
        pattern.test(normalized)
      )
    ) {
      return {
        entry,
        matchQuality: "approximate"
      };
    }
  }

  return null;
}

function requestedBasisUnits(
  item: GroceryRequestItem,
  entry: CatalogEntry
): { basisUnits: number } | null {
  const amount = normalizedAmount(
    item.quantity,
    item.unit
  );

  if (!amount) {
    return null;
  }

  let amountInBasisDimension: number | null = null;

  switch (entry.basis.dimension) {
  case "mass":
    if (amount.dimension === "mass") {
      amountInBasisDimension = amount.amount;
    } else if (
      amount.dimension === "volume"
      && entry.densityGramsPerMl
    ) {
      amountInBasisDimension =
        amount.amount * entry.densityGramsPerMl;
    } else if (
      amount.dimension === "count"
      && entry.gramsPerEach
    ) {
      amountInBasisDimension =
        amount.amount * entry.gramsPerEach;
    }
    break;

  case "volume":
    if (amount.dimension === "volume") {
      amountInBasisDimension = amount.amount;
    } else if (
      amount.dimension === "mass"
      && entry.densityGramsPerMl
    ) {
      amountInBasisDimension =
        amount.amount / entry.densityGramsPerMl;
    } else if (
      amount.dimension === "count"
      && entry.millilitersPerEach
    ) {
      amountInBasisDimension =
        amount.amount * entry.millilitersPerEach;
    }
    break;

  case "count":
    if (amount.dimension === "count") {
      amountInBasisDimension = amount.amount;
    } else if (
      amount.dimension === "mass"
      && entry.gramsPerEach
    ) {
      amountInBasisDimension =
        amount.amount / entry.gramsPerEach;
    } else if (
      amount.dimension === "volume"
      && entry.millilitersPerEach
    ) {
      amountInBasisDimension =
        amount.amount / entry.millilitersPerEach;
    }
    break;
  }

  if (
    amountInBasisDimension === null
    || !Number.isFinite(amountInBasisDimension)
    || amountInBasisDimension <= 0
  ) {
    return null;
  }

  return {
    basisUnits:
      amountInBasisDimension / entry.basis.amount
  };
}

function normalizedAmount(
  quantity: number,
  rawUnit: string
): { dimension: Dimension; amount: number } | null {
  const unit = normalizeUnit(rawUnit);

  if (MASS_UNITS[unit]) {
    return {
      dimension: "mass",
      amount: quantity * MASS_UNITS[unit]
    };
  }

  if (VOLUME_UNITS[unit]) {
    return {
      dimension: "volume",
      amount: quantity * VOLUME_UNITS[unit]
    };
  }

  if (COUNT_MULTIPLIERS[unit]) {
    return {
      dimension: "count",
      amount: quantity * COUNT_MULTIPLIERS[unit]
    };
  }

  return null;
}

function chooseCurrentPoint(
  regional: BLSPricePoint | undefined,
  national: BLSPricePoint | undefined
): BLSPricePoint | undefined {
  if (!regional) {
    return national;
  }

  if (!national) {
    return regional;
  }

  const regionalLag =
    periodIndex(national.year, national.month)
    - periodIndex(regional.year, regional.month);

  return regionalLag <= 4
    ? regional
    : national;
}

function regionForZip(zipCode: string): Region {
  const prefix = Number(zipCode.slice(0, 3));

  if (
    prefix === 5
    || (prefix >= 10 && prefix <= 196)
  ) {
    return {
      areaCode: "0100",
      label: "Northeast region"
    };
  }

  if (
    (prefix >= 197 && prefix <= 427)
    || (prefix >= 700 && prefix <= 799)
    || prefix === 885
  ) {
    return {
      areaCode: "0300",
      label: "South region"
    };
  }

  if (
    (prefix >= 430 && prefix <= 588)
    || (prefix >= 600 && prefix <= 693)
  ) {
    return {
      areaCode: "0200",
      label: "Midwest region"
    };
  }

  if (
    (prefix >= 590 && prefix <= 599)
    || (prefix >= 800 && prefix <= 999)
  ) {
    return {
      areaCode: "0400",
      label: "West region"
    };
  }

  return {
    areaCode: "0000",
    label: "U.S. city average"
  };
}

function seriesID(
  areaCode: Region["areaCode"],
  itemCode: string
): string {
  return `APU${areaCode}${itemCode}`;
}

function geographyForSeries(series: string): string {
  const areaCode = series.slice(3, 7);

  return AREA_CODES.find(
    (area) => area.areaCode === areaCode
  )?.label || "U.S. city average";
}

function massBasis(
  label: string,
  grams = 453.592
): PriceBasis {
  return {
    dimension: "mass",
    amount: grams,
    label
  };
}

function volumeBasis(
  milliliters: number,
  label: string
): PriceBasis {
  return {
    dimension: "volume",
    amount: milliliters,
    label
  };
}

function countBasis(
  count: number,
  label: string
): PriceBasis {
  return {
    dimension: "count",
    amount: count,
    label
  };
}

function produce(
  itemCode: string,
  label: string,
  patterns: RegExp[],
  gramsPerEach: number
): CatalogEntry {
  return {
    itemCode,
    label,
    basis: massBasis("per lb."),
    purchaseUnits: 1,
    packageLabel: "approximately 1 lb",
    exactPatterns: patterns,
    gramsPerEach
  };
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUnit(value: string): string {
  return value
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function roundUpToIncrement(
  value: number,
  increment: number
): number {
  return Math.ceil(value / increment) * increment;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundNumber(
  value: number,
  digits: number
): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function periodIndex(
  year: number,
  month: number
): number {
  return year * 12 + month;
}

function formatPeriod(
  year: number,
  month: number
): string {
  const monthName = new Intl.DateTimeFormat(
    "en-US",
    { month: "long", timeZone: "UTC" }
  ).format(new Date(Date.UTC(year, month - 1, 1)));

  return `${monthName} ${year}`;
}

function latestPeriodLabel(
  labels: string[]
): string {
  const parsed = labels
    .map((label) => {
      const date = new Date(`1 ${label}`);
      return {
        label,
        value: Number.isNaN(date.getTime())
          ? 0
          : date.getTime()
      };
    })
    .sort((a, b) => b.value - a.value);

  return parsed[0]?.label || "Latest available month";
}

function chunks<T>(
  values: T[],
  size: number
): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }

  return result;
}
