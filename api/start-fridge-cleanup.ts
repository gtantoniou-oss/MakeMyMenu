import type {
  VercelRequest,
  VercelResponse
} from "@vercel/node";
import {
  isAuthorized
} from "./_meal-plan-config.js";
import {
  fridgeCleanupInstructions,
  fridgeCleanupSchema
} from "./_fridge-cleanup-config.js";

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

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is not configured."
    });
  }

  const body = req.body as {
    itemsOnHand?: string;
    recipeCount?: number;
  } | undefined;

  if (
    !body ||
    typeof body.itemsOnHand !== "string" ||
    body.itemsOnHand.trim().length === 0
  ) {
    return res.status(400).json({
      error: "Describe at least one item on hand."
    });
  }

  if (
    !Number.isInteger(body.recipeCount) ||
    (body.recipeCount ?? 0) < 1 ||
    (body.recipeCount ?? 0) > 3
  ) {
    return res.status(400).json({
      error: "recipeCount must be between 1 and 3."
    });
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model:
            process.env.OPENAI_MODEL ||
            "gpt-5-mini",
          background: true,
          store: true,
          instructions: fridgeCleanupInstructions,
          input: JSON.stringify(req.body),
          text: {
            format: {
              type: "json_schema",
              name: "make_my_menu_fridge_cleanup",
              strict: true,
              schema: fridgeCleanupSchema
            }
          }
        })
      }
    );

    const result = await response.json() as {
      id?: string;
      status?: string;
      error?: {
        message?: string;
      };
    };

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          result.error?.message ||
          "OpenAI rejected the request."
      });
    }

    if (!result.id) {
      return res.status(502).json({
        error:
          "OpenAI did not return a background response ID."
      });
    }

    return res.status(202).json({
      jobID: result.id,
      status: result.status || "queued"
    });
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
