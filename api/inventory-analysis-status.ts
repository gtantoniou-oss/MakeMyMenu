import type {
  VercelRequest,
  VercelResponse
} from "@vercel/node";
import {
  extractOutputText,
  isAuthorized
} from "./_meal-plan-config.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  if (!isAuthorized(req.headers["x-app-token"])) {
    return res.status(401).json({
      error: "Unauthorized."
    });
  }

  const jobID =
    typeof req.query.id === "string"
      ? req.query.id
      : undefined;

  if (!jobID || !jobID.startsWith("resp_")) {
    return res.status(400).json({
      error: "A valid response ID is required."
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is not configured."
    });
  }

  try {
    const response = await fetch(
      `https://api.openai.com/v1/responses/${encodeURIComponent(jobID)}`,
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      }
    );

    const result = await response.json() as {
      id?: string;
      status?: string;
      error?: { message?: string };
      incomplete_details?: { reason?: string };
      [key: string]: unknown;
    };

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          result.error?.message ||
          "Unable to retrieve inventory analysis."
      });
    }

    const status = result.status || "in_progress";

    if (status !== "completed") {
      return res.status(200).json({
        jobID,
        status,
        inventoryAnalysis: null,
        error:
          result.error?.message ||
          result.incomplete_details?.reason ||
          null
      });
    }

    const outputText = extractOutputText(result);

    if (!outputText) {
      return res.status(502).json({
        error:
          "The completed response contained no inventory output."
      });
    }

    let inventoryAnalysis: unknown;

    try {
      inventoryAnalysis = JSON.parse(outputText);
    } catch {
      return res.status(502).json({
        error:
          "The completed response contained invalid inventory JSON."
      });
    }

    return res.status(200).json({
      jobID,
      status: "completed",
      inventoryAnalysis,
      error: null
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
