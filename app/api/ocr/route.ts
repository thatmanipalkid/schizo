// Gemini free tier is rate-limited per minute and per day; check Google AI Studio for current limits.
import { NextRequest, NextResponse } from "next/server";
import type { BillData } from "@/lib/ocr";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
};

const PROMPT = `Read the bill or receipt in this image and return ONLY valid JSON, with no markdown fences and no preamble, in exactly this shape:
{
  "items": [ { "name": string, "quantity": number, "price": number } ],
  "subtotal": number | null,
  "tax": number | null,
  "serviceCharge": number | null,
  "total": number | null
}

Extract every actual purchased item row, preserving the printed name, quantity, and line amount. The price is the amount for the whole line, not the unit rate. If the receipt has separate columns, align values by their printed row and do not shift values between rows. Only include an item when its name, quantity, and amount are visibly associated with the same row. If a field cannot be read confidently, use null rather than guessing. Do not include restaurant metadata, addresses, phone numbers, tax IDs, percentages, subtotal, tax, service charge, total, payment details, section/category headings, or recommendations as items.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          quantity: { type: "NUMBER" },
          price: { type: "NUMBER" },
        },
        required: ["name", "quantity", "price"],
      },
    },
    subtotal: { type: "NUMBER", nullable: true },
    tax: { type: "NUMBER", nullable: true },
    serviceCharge: { type: "NUMBER", nullable: true },
    total: { type: "NUMBER", nullable: true },
  },
  required: ["items", "subtotal", "tax", "serviceCharge", "total"],
};

export const runtime = "nodejs";

function stripCodeFences(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeBillData(value: unknown): BillData | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.items)) return null;

  const items = record.items
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      name: typeof item.name === "string" ? item.name.trim() : "",
      quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 1,
      price: typeof item.price === "number" && Number.isFinite(item.price) ? item.price : 0,
    }))
    .filter((item) => item.name && item.price >= 0)
    .filter((item) => !/^(?:service\s+charge|tax|gst|cgst|sgst|subtotal|sub\s*total|total|grand\s+total|amount\s+due|discount|round\s*off)$/i.test(item.name));

  const nullableNumber = (field: string) => {
    const value = record[field];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  return {
    items,
    subtotal: nullableNumber("subtotal"),
    tax: nullableNumber("tax"),
    serviceCharge: nullableNumber("serviceCharge"),
    total: nullableNumber("total"),
  };
}

function imageInput(body: FormData | { imageBase64?: string; mediaType?: string }) {
  if (body instanceof FormData) {
    const file = body.get("file") || body.get("image");
    if (!(file instanceof File)) return null;
    return file.arrayBuffer().then((buffer) => ({
      data: Buffer.from(buffer).toString("base64"),
      mimeType: file.type || "image/jpeg",
    }));
  }

  if (!body.imageBase64) return null;
  const match = body.imageBase64.match(/^data:([^;]+);base64,([\s\S]+)$/);
  return Promise.resolve({
    data: match?.[2] || body.imageBase64,
    mimeType: match?.[1] || body.mediaType || "image/jpeg",
  });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "Missing GEMINI_API_KEY" },
      { status: 500 }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let body: FormData | { imageBase64?: string; mediaType?: string };
    if (contentType.includes("multipart/form-data")) {
      body = await req.formData();
    } else {
      try {
        body = await req.json();
      } catch {
        return NextResponse.json(
          { success: false, error: "Expected JSON or multipart form data" },
          { status: 400 }
        );
      }
    }

    const image = await imageInput(body);
    if (!image) {
      return NextResponse.json(
        { success: false, error: "Missing image file or imageBase64" },
        { status: 400 }
      );
    }

    console.log("[OCR API DEBUG] Gemini request", {
      mimeType: image.mimeType,
      bytes: Buffer.byteLength(image.data, "base64"),
    });
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: image.mimeType, data: image.data } },
            { text: PROMPT },
          ],
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });

    const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: payload?.error?.message || "Gemini API request failed" },
        { status: 502 }
      );
    }
    const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("[OCR API DEBUG] Gemini response", rawText);
    if (!rawText) {
      return NextResponse.json(
        { success: false, error: "Gemini returned no bill data" },
        { status: 502 }
      );
    }

    let data: BillData | null = null;
    try {
      data = normalizeBillData(JSON.parse(stripCodeFences(rawText)));
    } catch {
      return NextResponse.json(
        { success: false, error: "Gemini returned malformed bill JSON" },
        { status: 502 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { success: false, error: "Gemini returned an invalid bill data shape" },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not process Gemini bill extraction request" },
      { status: 502 }
    );
  }
}
