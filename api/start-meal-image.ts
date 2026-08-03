import type {
  VercelRequest,
  VercelResponse
} from "@vercel/node";
import {
  buildMealImagePrompt,
  isMealImageAuthorized
} from "./_meal-image-config.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  if (!isMealImageAuthorized(
    req.headers["x-app-token"]
  )) {
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

  let prompt: string;

  try {
    prompt = buildMealImagePrompt(req.body);
  } catch (error) {
    return res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Invalid meal-image request."
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
          input: prompt,
          tools: [
            {
              type: "image_generation",
              model:
                process.env.OPENAI_IMAGE_MODEL ||
                "gpt-image-1-mini",
              size: "1024x1024",
              quality: "low",
              output_format: "jpeg",
              output_compression: 72,
              background: "opaque"
            }
          ],
          tool_choice: {
            type: "image_generation"
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
          "OpenAI rejected the meal-image request."
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
