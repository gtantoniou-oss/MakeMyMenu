import {
  ingredientSchema
} from "./_meal-plan-config.js";

export const fridgeCleanupSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "overview",
    "wasteReductionNotes",
    "unusedItems",
    "recipes"
  ],
  properties: {
    overview: { type: "string" },
    wasteReductionNotes: { type: "string" },
    unusedItems: {
      type: "array",
      items: { type: "string" }
    },
    recipes: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "mealType",
          "style",
          "servings",
          "prepMinutes",
          "cookMinutes",
          "equipment",
          "onHandItemsUsed",
          "additionalIngredients",
          "ingredients",
          "instructions",
          "whyItWorks",
          "substitutions",
          "storage",
          "reheating",
          "estimatedNutrition"
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          mealType: { type: "string" },
          style: { type: "string" },
          servings: {
            type: "integer",
            minimum: 1
          },
          prepMinutes: {
            type: "integer",
            minimum: 0
          },
          cookMinutes: {
            type: "integer",
            minimum: 0
          },
          equipment: {
            type: "array",
            items: { type: "string" }
          },
          onHandItemsUsed: {
            type: "array",
            items: { type: "string" }
          },
          additionalIngredients: {
            type: "array",
            items: ingredientSchema
          },
          ingredients: {
            type: "array",
            items: ingredientSchema
          },
          instructions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "stepNumber",
                "instruction",
                "donenessCue",
                "temperatureFahrenheit"
              ],
              properties: {
                stepNumber: {
                  type: "integer",
                  minimum: 1
                },
                instruction: {
                  type: "string"
                },
                donenessCue: {
                  type: ["string", "null"]
                },
                temperatureFahrenheit: {
                  type: ["integer", "null"]
                }
              }
            }
          },
          whyItWorks: { type: "string" },
          substitutions: {
            type: "array",
            items: { type: "string" }
          },
          storage: { type: "string" },
          reheating: { type: "string" },
          estimatedNutrition: { type: "string" }
        }
      }
    }
  }
} as const;

export const fridgeCleanupInstructions = `
You are the Fridge Cleanup Wizard for MakeMyMenu.

The user supplies itemsOnHand as free-form natural language. Parse that text
carefully, preserving any stated quantities, conditions, locations, and urgency
such as "must use today," "frozen," "already cooked," or "nearly expired."
Reason conservatively when quantities are vague; do not invent a large supply.

Create the exact number of complete recipes requested by recipeCount, using
as much of the user's listed food as practical. Prioritize ingredients the user
says must be used first or are close to expiring. Do not claim an item is used
unless it appears in the recipe ingredients in a meaningful quantity.

Respect the requested meal type, cuisine or cooking style, servings, maximum
total time, complexity, available equipment, dietary restrictions,
allergies, disliked foods, and additional notes. Never recommend an allergen
or unsafe substitution.

When useOnlyOnHand is true, use only listed items plus ordinary water, salt,
pepper, and a basic neutral cooking oil. When it is false, use no more than
maximumAdditionalIngredients unique extra ingredients across the generated
recipes. List every extra ingredient in additionalIngredients for the recipe
that needs it. Keep extras inexpensive and broadly useful.

If multiple recipes are requested, make them meaningfully different and
allocate the available ingredients realistically. Do not use more of an item
than the user states or reasonably implies is available unless the recipe
explicitly identifies the shortfall as an additional ingredient. State any
listed items not used in unusedItems.

Every recipe must be practical, fully cookable, and include complete
quantities, equipment, numbered instructions, doneness cues, safe internal
temperatures where relevant, substitutions, storage, reheating, and estimated
nutrition.

Every ingredient in ingredients and additionalIngredients must include BOTH:
1. A practical conventional kitchen quantity and unit.
2. A corresponding numeric weight in grams.

Use ingredient-specific density for volume-to-weight conversions. Give
realistic approximate gram weights for count-based items. Never place words
inside the grams field and never use zero grams for an ingredient that is
actually used.

Use sound food-safety judgment. If the supplied description suggests an item
may be spoiled, do not instruct the user to eat it; explain that it should be
discarded in wasteReductionNotes.

Return only JSON matching the provided schema.
`;
