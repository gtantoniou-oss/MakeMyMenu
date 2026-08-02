import type { VercelRequest } from "@vercel/node";

export function isMealImageAuthorized(
  token: string | string[] | undefined
): boolean {
  const expected = process.env.APP_SHARED_TOKEN;

  if (!expected) {
    return false;
  }

  const supplied = Array.isArray(token)
    ? token[0]
    : token;

  return supplied === expected;
}

export function buildMealImagePrompt(body: unknown): string {
  const request = (body ?? {}) as {
    mealID?: unknown;
    mealType?: unknown;
    mealName?: unknown;
    mealNotes?: unknown;
    recipeTitle?: unknown;
    ingredientSummary?: unknown;
  };

  const mealName = cleanString(request.mealName, 160);
  const mealType = cleanString(request.mealType, 40);
  const mealNotes = cleanString(request.mealNotes, 500);
  const recipeTitle = cleanString(request.recipeTitle, 160);
  const ingredients = Array.isArray(request.ingredientSummary)
    ? request.ingredientSummary
        .slice(0, 10)
        .map((value) => cleanString(value, 100))
        .filter(Boolean)
    : [];

  if (!mealName) {
    throw new Error("A meal name is required.");
  }

  return `
Create one tasteful, simple food drawing for a meal-planning iPhone app.

Meal: ${mealName}
Meal type: ${mealType || "Meal"}
Recipe title: ${recipeTitle || mealName}
Notes: ${mealNotes || "None"}
Key ingredients: ${ingredients.length ? ingredients.join(", ") : "Use the meal name as the guide."}

Art direction:
- Show one clearly recognizable plated serving of the specified meal.
- Use a restrained editorial illustration style: hand-drawn gouache and ink, simplified shapes, clean outlines, and a lightly textured paper feel.
- Keep details selective and elegant rather than literal or highly rendered.
- Warm ivory background, muted charcoal linework, natural food colors, and very restrained brass-gold accents.
- Centered square composition with generous breathing room and a small soft painted shadow beneath the plate.
- Family-friendly, appetizing, calm, and tasteful.
- No photorealism, photography, camera effects, depth of field, glossy CGI, 3D rendering, hyper-detailed textures, or dramatic studio lighting.
- No people, hands, packaging, logos, labels, lettering, or text.
- Do not add unrelated side dishes or ingredients.
- Keep the meal readable as a small rounded thumbnail in an iPhone app.
`.trim();
}

export function extractMealImageBase64(
  result: Record<string, unknown>
): string | null {
  const output = result.output;

  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    if (
      item &&
      typeof item === "object" &&
      (item as { type?: unknown }).type ===
        "image_generation_call" &&
      typeof (item as { result?: unknown }).result ===
        "string"
    ) {
      return (item as { result: string }).result;
    }
  }

  return null;
}

function cleanString(
  value: unknown,
  maxLength: number
): string {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}
