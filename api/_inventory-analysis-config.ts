export const inventoryAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "warnings",
    "items"
  ],
  properties: {
    summary: { type: "string" },
    warnings: {
      type: "array",
      items: { type: "string" }
    },
    items: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "quantity",
          "unit",
          "location",
          "confidence",
          "needsReview",
          "note"
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          quantity: {
            type: "number",
            exclusiveMinimum: 0
          },
          unit: { type: "string" },
          location: {
            type: "string",
            enum: [
              "Pantry",
              "Refrigerator",
              "Freezer",
              "Other"
            ]
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1
          },
          needsReview: { type: "boolean" },
          note: { type: "string" }
        }
      }
    }
  }
} as const;

export const inventoryAnalysisInstructions = `
You organize household food inventory for MakeMyMenu.

The user may provide free-form inventory text, one to three photos, or both.
Return a conservative, editable inventory proposal. Never claim certainty when
an item, label, quantity, or container contents are unclear.

For typed text:
- Parse every food item the user lists.
- Preserve stated quantities, package types, locations, and conditions.
- If no quantity is supplied, use quantity 1 and unit "on hand".
- Normalize names without removing useful details such as cooked, frozen,
  opened, low, or use soon. Put condition details in note when appropriate.

For images:
- Identify only food or cooking ingredients that are visibly supported.
- Do not identify people, personal information, medicines, cleaning products,
  or non-food objects.
- Do not infer the contents of opaque, unlabeled, or closed containers.
- Group obvious duplicates only when the count is reasonably clear.
- Use practical units such as each, can, jar, bottle, bag, box, carton,
  package, bunch, container, or on hand.
- Mark needsReview true whenever identity, count, unit, or location is uncertain.
- Set confidence between 0 and 1. Use lower values for partial labels,
  occlusion, glare, or ambiguous produce.
- Explain uncertainty briefly in note.

Use defaultLocation for items unless the user's text or image context clearly
indicates Pantry, Refrigerator, Freezer, or Other. Create stable unique string
IDs within this response. Remove exact duplicates across text and photos.

The app will show every result to the user before saving. Include concise
warnings about unreadable areas, ambiguous containers, or likely omissions.
Return only JSON matching the provided schema.
`;
