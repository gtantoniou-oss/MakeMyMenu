export const ingredientSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "quantity", "unit", "preparation"],
  properties: {
    name: { type: "string" },
    quantity: { type: "number" },
    unit: { type: "string" },
    preparation: { type: "string" }
  }
} as const;

export const shoppingItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "totalRequired",
    "unit",
    "quantityOnHand",
    "quantityToBuy",
    "usedByRecipeIDs",
    "storeRecommendation"
  ],
  properties: {
    name: { type: "string" },
    totalRequired: { type: "number" },
    unit: { type: "string" },
    quantityOnHand: { type: "number" },
    quantityToBuy: { type: "number" },
    usedByRecipeIDs: {
      type: "array",
      items: { type: "string" }
    },
    storeRecommendation: {
      type: ["string", "null"]
    }
  }
} as const;

export const mealPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "weekStarting",
    "overview",
    "days",
    "recipes",
    "shoppingSections",
    "alreadyHave",
    "prepPlan",
    "nutritionSummary"
  ],
  properties: {
    weekStarting: { type: "string" },
    overview: { type: "string" },
    nutritionSummary: { type: "string" },
    days: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "meals"],
        properties: {
          date: { type: "string" },
          meals: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "id",
                "mealType",
                "name",
                "recipeID",
                "servings",
                "notes",
                "leftoverPurpose"
              ],
              properties: {
                id: { type: "string" },
                mealType: {
                  type: "string",
                  enum: [
                    "Breakfast",
                    "Lunch",
                    "Dinner",
                    "Other"
                  ]
                },
                name: { type: "string" },
                recipeID: {
                  type: ["string", "null"]
                },
                servings: {
                  type: "integer",
                  minimum: 1
                },
                notes: { type: "string" },
                leftoverPurpose: {
                  type: ["string", "null"]
                }
              }
            }
          }
        }
      }
    },
    recipes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "servings",
          "prepMinutes",
          "cookMinutes",
          "equipment",
          "ingredients",
          "instructions",
          "makeAhead",
          "storage",
          "reheating",
          "leftoverStrategy",
          "estimatedNutrition"
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
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
          makeAhead: { type: "string" },
          storage: { type: "string" },
          reheating: { type: "string" },
          leftoverStrategy: { type: "string" },
          estimatedNutrition: { type: "string" }
        }
      }
    },
    shoppingSections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "items"],
        properties: {
          name: {
            type: "string",
            enum: [
              "Produce",
              "Meat and Seafood",
              "Dairy and Refrigerated",
              "Bakery",
              "Frozen",
              "Canned and Jarred",
              "Grains and Dry Goods",
              "Condiments and Oils",
              "Spices and Seasonings",
              "Herbs",
              "Already Have / Check Pantry"
            ]
          },
          items: {
            type: "array",
            items: shoppingItemSchema
          }
        }
      }
    },
    alreadyHave: {
      type: "array",
      items: shoppingItemSchema
    },
    prepPlan: {
      type: "object",
      additionalProperties: false,
      required: [
        "totalEstimatedMinutes",
        "tasks",
        "doNotPrepEarly"
      ],
      properties: {
        totalEstimatedMinutes: {
          type: "integer",
          minimum: 0
        },
        tasks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "sequence",
              "title",
              "estimatedMinutes",
              "instructions",
              "ingredients",
              "storageInstructions",
              "parallelWithNextTask"
            ],
            properties: {
              sequence: {
                type: "integer",
                minimum: 1
              },
              title: { type: "string" },
              estimatedMinutes: {
                type: "integer",
                minimum: 0
              },
              instructions: {
                type: "array",
                items: { type: "string" }
              },
              ingredients: {
                type: "array",
                items: ingredientSchema
              },
              storageInstructions: {
                type: "string"
              },
              parallelWithNextTask: {
                type: "boolean"
              }
            }
          }
        },
        doNotPrepEarly: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["item", "reason"],
            properties: {
              item: { type: "string" },
              reason: { type: "string" }
            }
          }
        }
      }
    }
  }
} as const;

export const systemInstructions = `
You are the meal-planning engine for MakeMyMenu.

Produce a complete, practical weekly family meal-plan package, not a list
of meal ideas.

Create original recipes with bold flavor, reliable technique, approachable
home cooking, efficient preparation, and restaurant-inspired results without
unnecessary complexity.

Use available inventory first. Match recipe complexity to the supplied
schedule. Reuse ingredients intentionally. Plan leftovers in advance and
make source recipes yield enough servings for every designated leftover use.
Respect no-meal days and disabled meal slots exactly.

Named chefs, recipes, cookbooks, YouTube channels, restaurants, publications,
and cooking styles are broad taste references only. Infer general preferences
such as flavor intensity, efficiency, cuisine, texture, or technical rigor.
Do not reproduce protected recipe wording, distinctive presentation,
branding, photography, or a creator's recognizable voice.

Every recipe must include realistic quantities, preparation and cooking
times, equipment, numbered instructions, doneness cues, useful internal
temperatures where applicable, make-ahead guidance, storage, reheating,
leftover strategy, and estimated nutrition.

Create one consolidated grocery list. Use only the allowed store sections.
Separate already-have items from items to buy. Consolidate quantities across
all recipes. Do not add an inventory item to the buy list unless more is
required.

Create a chronological Sunday prep workflow within the available prep time.
Use parallel tasks where practical and identify ingredients that should not
be cut or mixed too early.

When the input contains "mode": "revision", treat it as a revision request.
The input will include the original planning request, the current complete
plan, and feedback at the overall, day, and meal levels.

Respect every requested deletion, move, substitution, complexity change,
leftover change, or preference exactly. Rebuild the complete package rather
than patching isolated text. Recalculate recipes, servings, ingredient
quantities, shopping requirements, already-have quantities, nutrition,
leftovers, and Sunday prep tasks. Preserve unaffected choices when practical.

Return only JSON matching the provided schema.
`;

export function isAuthorized(
  suppliedToken: string | string[] | undefined
): boolean {
  const expectedToken = process.env.APP_SHARED_TOKEN;

  return Boolean(
    expectedToken &&
    typeof suppliedToken === "string" &&
    suppliedToken === expectedToken
  );
}

export function extractOutputText(
  result: Record<string, unknown>
): string | undefined {
  const direct = result.output_text;

  if (typeof direct === "string") {
    return direct;
  }

  const output = result.output;

  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const item of output) {
    if (
      typeof item !== "object" ||
      item === null
    ) {
      continue;
    }

    const content = (
      item as { content?: unknown }
    ).content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type ===
          "output_text" &&
        typeof (part as { text?: unknown }).text ===
          "string"
      ) {
        return (part as { text: string }).text;
      }
    }
  }

  return undefined;
}
