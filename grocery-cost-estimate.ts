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

type KrogerLocation = {
  locationId?: string;
  name?: string;
  chain?: string;
  address?: {
    addressLine1?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
};

type KrogerProduct = {
  productId?: string;
  upc?: string;
  description?: string;
  brand?: string;
  items?: Array<{
    size?: string;
    price?: {
      regular?: number;
      promo?: number;
    };
  }>;
};

type PricedCandidate = {
  product: KrogerProduct;
  size: string;
  regularPrice: number;
  promoPrice?: number;
  effectivePrice: number;
  relevance: number;
};

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

const COUNT_UNITS = new Set([
  "each",
  "ea",
  "ct",
  "count",
  "counts",
  "piece",
  "pieces",
  "item",
  "items",
  "can",
  "cans",
  "package",
  "packages",
  "pack",
  "packs",
  "bunch",
  "bunches",
  "loaf",
  "loaves",
  "clove",
  "cloves"
]);

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

  const clientID = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    return res.status(503).json({
      error:
        "Local grocery pricing is not configured. Add KROGER_CLIENT_ID and KROGER_CLIENT_SECRET in Vercel."
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
    .slice(0, 60);

  if (items.length === 0) {
    return res.status(200).json({
      zipCode,
      store: {
        locationID: "",
        name: "No store lookup required",
        chain: "",
        address: "",
        city: "",
        state: "",
        zipCode
      },
      estimatedTotal: 0,
      matchedItemCount: 0,
      totalItemCount: 0,
      coveragePercent: 100,
      items: [],
      unmatchedItems: [],
      disclaimer:
        "No grocery purchases were required for this plan."
    });
  }

  try {
    const accessToken = await krogerAccessToken(
      clientID,
      clientSecret
    );

    const store = await nearestStore(
      zipCode,
      accessToken
    );

    if (!store.locationId) {
      return res.status(404).json({
        error:
          "No Kroger-family store with pricing data was found near this ZIP code."
      });
    }

    const priced = await mapWithConcurrency(
      items,
      6,
      async (item) => priceItem(
        item,
        store.locationId as string,
        accessToken
      )
    );

    const matched = priced.filter(
      (item): item is NonNullable<typeof item> =>
        item !== null
    );

    const matchedIDs = new Set(
      matched.map((item) => item.shoppingItemID)
    );

    const unmatchedItems = items
      .filter((item) => !matchedIDs.has(item.id))
      .map((item) => item.name);

    const estimatedTotal = roundCurrency(
      matched.reduce(
        (sum, item) => sum + item.estimatedCost,
        0
      )
    );

    return res.status(200).json({
      zipCode,
      store: {
        locationID: store.locationId,
        name: store.name || "Kroger-family store",
        chain: store.chain || "",
        address: store.address?.addressLine1 || "",
        city: store.address?.city || "",
        state: store.address?.state || "",
        zipCode: store.address?.zipCode || zipCode
      },
      estimatedTotal,
      matchedItemCount: matched.length,
      totalItemCount: items.length,
      coveragePercent: roundNumber(
        (matched.length / items.length) * 100,
        1
      ),
      items: matched,
      unmatchedItems,
      disclaimer:
        "Prices are based on currently available Kroger-family store listings. Package matching is estimated. Taxes, loyalty pricing, digital coupons, substitutions, weight-variable items, and unmatched items may change the final total."
    });
  } catch (error) {
    console.error(error);

    return res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "Unable to retrieve local grocery prices."
    });
  }
}

async function krogerAccessToken(
  clientID: string,
  clientSecret: string
): Promise<string> {
  const credentials = Buffer.from(
    `${clientID}:${clientSecret}`
  ).toString("base64");

  const response = await fetch(
    "https://api.kroger.com/v1/connect/oauth2/token",
    {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "product.compact"
      })
    }
  );

  const result = await response.json() as {
    access_token?: string;
    error_description?: string;
  };

  if (!response.ok || !result.access_token) {
    throw new Error(
      result.error_description
        || "Kroger authentication failed."
    );
  }

  return result.access_token;
}

async function nearestStore(
  zipCode: string,
  accessToken: string
): Promise<KrogerLocation> {
  const url = new URL(
    "https://api.kroger.com/v1/locations"
  );
  url.searchParams.set(
    "filter.zipCode.near",
    zipCode
  );
  url.searchParams.set(
    "filter.radiusInMiles",
    "50"
  );
  url.searchParams.set("filter.limit", "10");

  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });

  const result = await response.json() as {
    data?: KrogerLocation[];
    errors?: unknown;
  };

  if (!response.ok) {
    throw new Error(
      "Unable to find a grocery store near the saved ZIP code."
    );
  }

  return result.data?.[0] || {};
}

async function priceItem(
  item: GroceryRequestItem,
  locationID: string,
  accessToken: string
) {
  const url = new URL(
    "https://api.kroger.com/v1/products"
  );
  url.searchParams.set(
    "filter.term",
    cleanSearchTerm(item.name)
  );
  url.searchParams.set(
    "filter.locationId",
    locationID
  );
  url.searchParams.set("filter.limit", "10");

  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    return null;
  }

  const result = await response.json() as {
    data?: KrogerProduct[];
  };

  const candidate = chooseCandidate(
    item.name,
    result.data || []
  );

  if (!candidate) {
    return null;
  }

  const packagesNeeded = estimatePackageCount(
    item.quantity,
    item.unit,
    candidate.size
  );

  const estimatedCost = roundCurrency(
    candidate.effectivePrice * packagesNeeded
  );

  return {
    id: `${item.id}-${candidate.product.productId || candidate.product.upc || "product"}`,
    shoppingItemID: item.id,
    requestedName: item.name,
    requestedQuantity: item.quantity,
    requestedUnit: item.unit,
    matchedProductName:
      candidate.product.description || item.name,
    brand: candidate.product.brand || "",
    packageSize: candidate.size || "1 package",
    packagesNeeded,
    unitPrice: roundCurrency(candidate.effectivePrice),
    estimatedCost,
    priceType:
      candidate.promoPrice !== undefined
        && candidate.promoPrice > 0
        && candidate.promoPrice < candidate.regularPrice
        ? "promo"
        : "regular",
    matchQuality:
      candidate.relevance >= 4
        ? "strong"
        : candidate.relevance >= 2
          ? "approximate"
          : "broad"
  };
}

function chooseCandidate(
  requestedName: string,
  products: KrogerProduct[]
): PricedCandidate | null {
  const candidates: PricedCandidate[] = [];

  for (const product of products) {
    for (const item of product.items || []) {
      const regular = Number(item.price?.regular || 0);
      const promo = Number(item.price?.promo || 0);
      const effective = promo > 0
        ? Math.min(
            regular > 0 ? regular : promo,
            promo
          )
        : regular;

      if (!Number.isFinite(effective) || effective <= 0) {
        continue;
      }

      candidates.push({
        product,
        size: item.size || "1 package",
        regularPrice: regular > 0 ? regular : effective,
        promoPrice: promo > 0 ? promo : undefined,
        effectivePrice: effective,
        relevance: relevanceScore(
          requestedName,
          `${product.description || ""} ${product.brand || ""}`
        )
      });
    }
  }

  candidates.sort((a, b) => {
    if (b.relevance !== a.relevance) {
      return b.relevance - a.relevance;
    }

    return a.effectivePrice - b.effectivePrice;
  });

  return candidates[0] || null;
}

function relevanceScore(
  requestedName: string,
  productText: string
): number {
  const requestedTokens = meaningfulTokens(
    requestedName
  );
  const normalizedProduct = normalizeText(productText);

  let score = 0;

  for (const token of requestedTokens) {
    if (normalizedProduct.includes(token)) {
      score += token.length >= 6 ? 2 : 1;
    }
  }

  const requested = normalizeText(requestedName);

  if (normalizedProduct.includes(requested)) {
    score += 4;
  }

  return score;
}

function meaningfulTokens(value: string): string[] {
  const ignored = new Set([
    "fresh",
    "organic",
    "chopped",
    "diced",
    "sliced",
    "minced",
    "ground",
    "large",
    "small",
    "medium",
    "boneless",
    "skinless",
    "optional"
  ]);

  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2)
    .filter((token) => !ignored.has(token));
}

function cleanSearchTerm(value: string): string {
  const tokens = meaningfulTokens(value);
  return tokens.slice(0, 5).join(" ") || value;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function estimatePackageCount(
  requestedQuantity: number,
  requestedUnit: string,
  packageSize: string
): number {
  const requested = normalizedAmount(
    requestedQuantity,
    requestedUnit
  );
  const packaged = parsePackageSize(packageSize);

  if (
    requested
    && packaged
    && requested.dimension === packaged.dimension
    && packaged.amount > 0
  ) {
    return clampPackageCount(
      Math.ceil(requested.amount / packaged.amount)
    );
  }

  if (requested?.dimension === "count") {
    return clampPackageCount(
      Math.ceil(requested.amount)
    );
  }

  return 1;
}

function normalizedAmount(
  quantity: number,
  rawUnit: string
): { dimension: string; amount: number } | null {
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

  if (COUNT_UNITS.has(unit)) {
    return {
      dimension: "count",
      amount: quantity
    };
  }

  return null;
}

function parsePackageSize(
  packageSize: string
): { dimension: string; amount: number } | null {
  const normalized = packageSize
    .toLowerCase()
    .replace(/fluid ounces?/g, "fl oz")
    .replace(/fl\. ?oz\.?/g, "fl oz")
    .replace(/ounces?/g, "oz")
    .replace(/pounds?/g, "lb")
    .replace(/grams?/g, "g")
    .replace(/kilograms?/g, "kg")
    .replace(/counts?/g, "ct")
    .replace(/pieces?/g, "ct")
    .replace(/[^a-z0-9. /]/g, " ");

  const matches = Array.from(
    normalized.matchAll(
      /(\d+(?:\.\d+)?)\s*(fl oz|floz|oz|lb|lbs|g|kg|ml|l|ct|count|pack|each|ea)\b/g
    )
  );

  for (const match of matches) {
    const quantity = Number(match[1]);
    const unit = normalizeUnit(match[2]);
    const parsed = normalizedAmount(quantity, unit);

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function normalizeUnit(value: string): string {
  return value
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clampPackageCount(value: number): number {
  return Math.max(1, Math.min(24, value));
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

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  transform: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= values.length) {
        return;
      }

      results[index] = await transform(values[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker()
    )
  );

  return results;
}
