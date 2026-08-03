import type {
  VercelRequest,
  VercelResponse
} from "@vercel/node";
import {
  isAuthorized
} from "./_meal-plan-config.js";
import {
  inventoryAnalysisInstructions,
  inventoryAnalysisSchema
} from "./_inventory-analysis-config.js";

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
    typedInventory?: string | null;
    imageDataURLs?: string[];
    defaultLocation?: string;
  } | undefined;

  const typedInventory =
    typeof body?.typedInventory === "string"
      ? body.typedInventory.trim()
      : "";

  const images = Array.isArray(body?.imageDataURLs)
    ? body!.imageDataURLs
    : [];

  if (!typedInventory && images.length === 0) {
    return res.status(400).json({
      error: "Provide inventory text or at least one image."
    });
  }

  if (images.length > 3) {
    return res.status(400).json({
      error: "A maximum of three images may be analyzed at once."
    });
  }

  if (
    images.some(
      image =>
        typeof image !== "string" ||
        !image.startsWith("data:image/")
    )
  ) {
    return res.status(400).json({
      error: "Every image must be a base64 image data URL."
    });
  }

  const defaultLocation =
    typeof body?.defaultLocation === "string"
      ? body.defaultLocation
      : "Other";

  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: JSON.stringify({
        typedInventory,
        defaultLocation,
        imageCount: images.length
      })
    }
  ];

  for (const image of images) {
    content.push({
      type: "input_image",
      image_url: image,
      detail: "low"
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
            process.env.OPENAI_VISION_MODEL ||
            process.env.OPENAI_MODEL ||
            "gpt-5-mini",
          background: true,
          store: true,
          instructions: inventoryAnalysisInstructions,
          input: [
            {
              role: "user",
              content
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "make_my_menu_inventory_analysis",
              strict: true,
              schema: inventoryAnalysisSchema
            }
          }
        })
      }
    );

    const result = await response.json() as {
      id?: string;
      status?: string;
      error?: { message?: string };
    };

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          result.error?.message ||
          "OpenAI rejected the inventory request."
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
