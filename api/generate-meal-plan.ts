import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";

const requestSchema = z.object({
  weekStarting: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  household: z.object({
    adults: z.number().int().min(1).max(20),
    children: z.number().int().min(0).max(20),
    defaultServings: z.number().int().min(1).max(40),
    dietaryRestrictions: z.array(z.string().max(100)).max(30),
    allergies: z.array(z.string().max(100)).max(30),
    dislikedFoods: z.array(z.string().max(100)).max(50)
  }),
  inspirations: z.array(
    z.object({
      name: z.string().min(1).max(200),
      type: z.string().min(1).max(100),
      likedAttributes: z.array(z.string().max(150)).max(30),
      priority: z.string().min(1).max(30),
      notes: z.string().max(1000).nullable().optional()
    })
  ).max(100),
  inventory: z.array(
    z.object({
      name: z.string().min(1).max(200),
      quantity: z.number().nonnegative().max(100000),
      unit: z.string().min(1).max(50),
      location: z.string().min(1).max(50)
    })
  ).max(1000),
  schedule: z.array(
    z.object({
      day: z.string().min(1).max(20),
      breakfastRequired: z.boolean(),
      lunchRequired: z.boolean(),
      dinnerRequired: z.boolean(),
      otherRequired: z.boolean(),
      dinnerComplexity: z.string().min(1).max(50),
      maximumDinnerMinutes: z.number().int().min(0).max(360),
      leftoversFrom: z.string().max(20).nullable().optional()
    })
  ).length(7),
  preferences: z.object({
    useInventoryFirst: z.boolean(),
    reuseIngredients: z.boolean(),
    planLeftovers: z.boolean(),
    highProtein: z.boolean(),
    costcoAvailable: z.boolean(),
    sundayPrepMinutes: z.number().int().min(0).max(480),
    weeklyBudget: z.number().nonnegative().max(100000).nullable().optional(),
    additionalGoals: z.array(z.string().max(200)).max(50)
  })
});

const shoppingItemSchema = {
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

const ingredientSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "quantity",
    "unit",
    "preparation"
  ],
  properties: {
    name: { type: "string" },
    quantity: { type: "number" },
    unit: { type: "string" },
    preparation: { type: "string" }
  }
} as const;

const mealPlanSchema = {
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
    weekStarting: {
      type: "string"
    },
    overview: {
      type: "string"
    },
    nutritionSummary: {
      type: "string"
    },
    days: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "date",
          "meals"
        ],
        properties: {
          date: {
            type: "string"
          },
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
                id: {
                  type: "string"
                },
                mealType: {
                  type: "string",
                  enum: [
                    "Breakfast",
                    "Lunch",
                    "Dinner",
                    "Other"
                  ]
                },
                name: {
                  type: "string"
                },
                recipeID: {
                  type: [
                    "string",
                    "null"
                  ]
                },
                servings: {
                  type: "integer",
                  minimum: 1
                },
                notes: {
                  type: "string"
                },
                leftoverPurpose: {
                  type: [
                    "string",
                    "null"
                  ]
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
          id: {
            type: "string"
          },
          title: {
            type: "string"
          },
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
            items: {
              type: "string"
            }
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
                  type: [
                    "string",
                    "null"
                  ]
                },
                temperatureFahrenheit: {
                  type: [
                    "integer",
                    "null"
                  ]
                }
              }
            }
          },
          makeAhead: {
            type: "string"
          },
          storage: {
            type: "string"
          },
          reheating: {
            type: "string"
          },
          leftoverStrategy: {
            type: "string"
          },
          estimatedNutrition: {
            type: "string"
          }
        }
      }
    },
    shoppingSections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "items"
        ],
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
              title: {
                type: "string"
              },
              estimatedMinutes: {
                type: "integer",
                minimum: 0
              },
              instructions: {
                type: "array",
                items: {
                  type: "string"
                }
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
            required: [
              "item",
              "reason"
            ],
            properties: {
              item: {
                type: "string"
              },
              reason: {
                type: "string"
              }
            }
          }
        }
      }
    }
  }
} as const;

const systemInstructions = `
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
Front-load sauces, spice blends, durable vegetables, grains, protein
portioning, suitable marinades, yogurt sauces, toasted components, and
labeling when quality will not suffer. Use parallel tasks where practical.
Identify ingredients that should not be cut or mixed too early.

Return only JSON matching the provided schema.
`;

type ResponsesAPIResult = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

function extractOutputText(result: ResponsesAPIResult): string | undefined {
  if (result.output_text) {
    return result.output_text;
  }

  for (const item of result.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }

  return undefined;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  const expectedToken = process.env.APP_SHARED_TOKEN;
  const suppliedToken = req.headers["x-app-token"];

  if (
    !expectedToken ||
    typeof suppliedToken !== "string" ||
    suppliedToken !== expectedToken
  ) {
    return res.status(401).json({
      error: "Unauthorized."
    });
  }

  const parsedRequest = requestSchema.safeParse(req.body);

  if (!parsedRequest.success) {
    return res.status(400).json({
      error: "The request did not match the expected planner format.",
      details: parsedRequest.error.flatten()
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is not configured."
    });
  }

  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

  try {
    const openAIResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          store: false,
          instructions: systemInstructions,
          input: JSON.stringify(parsedRequest.data),
          text: {
            format: {
              type: "json_schema",
              name: "make_my_menu_plan",
              strict: true,
              schema: mealPlanSchema
            }
          }
        })
      }
    );

    const result = await openAIResponse.json() as ResponsesAPIResult;

    if (!openAIResponse.ok) {
      const message =
        result.error?.message ||
        "OpenAI rejected the meal-plan request.";

      return res.status(openAIResponse.status).json({
        error: message
      });
    }

    const outputText = extractOutputText(result);

    if (!outputText) {
      return res.status(502).json({
        error: "OpenAI returned no structured meal-plan output."
      });
    }

    let mealPlan: unknown;

    try {
      mealPlan = JSON.parse(outputText);
    } catch {
      return res.status(502).json({
        error: "OpenAI returned invalid JSON."
      });
    }

    return res.status(200).json(mealPlan);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Unknown backend error."
    });
  }
}
