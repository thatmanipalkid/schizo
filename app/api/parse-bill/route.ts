import { NextRequest, NextResponse } from "next/server";

const PROMPT = `Extract all line items, prices, and quantities from this restaurant bill image.
Also extract tax amount, service charge amount, discount amount (if any), and the
final total. Return ONLY valid JSON in this exact shape, no other text:
{"items": [{"name": string, "price": number, "quantity": number}],
"tax": number, "serviceCharge": number, "discount": number, "total": number}.
If a field isn't present on the bill, use 0.`;

function stripFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const unfenced = (fenced ? fenced[1] : trimmed).trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  return start >= 0 && end > start
    ? unfenced.slice(start, end + 1)
    : unfenced;
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ANTHROPIC_API_KEY" },
      { status: 500 }
    );
  }

  let body: { imageBase64?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const imageBase64 = body.imageBase64?.replace(
    /^data:image\/[a-zA-Z0-9+.-]+;base64,/,
    ""
  );
  if (!imageBase64) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }

  const mediaType =
    body.mediaType === "image/png" ||
    body.mediaType === "image/gif" ||
    body.mediaType === "image/webp"
      ? body.mediaType
      : "image/jpeg";

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not connect to bill reader" },
      { status: 502 }
    );
  }

  if (!anthropicRes.ok) {
    const providerError = (await anthropicRes.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return NextResponse.json(
      { error: providerError?.error?.message || "Could not parse bill" },
      { status: 502 }
    );
  }

  const payload = (await anthropicRes.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = payload.content?.find((c) => c.type === "text")?.text ?? "";

  try {
    const parsed = JSON.parse(stripFences(text)) as {
      items?: { name: string; price: number; quantity: number }[];
      tax?: number;
      serviceCharge?: number;
      discount?: number;
      total?: number;
    };
    return NextResponse.json({
      items: parsed.items ?? [],
      tax: Number(parsed.tax) || 0,
      serviceCharge: Number(parsed.serviceCharge) || 0,
      discount: Number(parsed.discount) || 0,
      total: Number(parsed.total) || 0,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not parse bill JSON" },
      { status: 502 }
    );
  }
}
