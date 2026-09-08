import { NextRequest, NextResponse } from "next/server";

function amount(value: string) {
  const normalized = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trailingAmount(line: string) {
  const match = line.match(/([₹$€£]?\s*[\d,]+(?:\.\d{1,2})?)\s*$/);
  return match ? amount(match[1]) : null;
}

function fieldAmount(line: string, labels: RegExp) {
  return labels.test(line) ? trailingAmount(line) : null;
}

function isMetadataLine(line: string) {
  return /(?:bill|invoice|receipt|table|date|time|cashier|server|phone|mobile|email|website|address|road|street|lane|avenue|floor|pincode|pin\s*code|postal|zip|gstin|tax\s*id|fssai|thank|subtotal|sub\s*total|round|change|payment|balance|order\s*(?:no|number)|invoice\s*(?:no|number))/i.test(line);
}

function isLikelyPincodeOrPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const hasDecimal = value.includes(".");
  return !hasDecimal && (digits.length === 5 || digits.length === 6 || digits.length >= 10);
}

function numericLine(line: string) {
  return /^\s*[\d,]+(?:\.\d{1,2})?\s*$/.test(line) ? amount(line) : null;
}

function columnarRows(lines: string[], start: number, end: number) {
  const section = lines.slice(start + 1, end);
  const names = section.filter(
    (line) => /[a-z]/i.test(line) && !isMetadataLine(line) && !/^(?:qty|rate|amount)\b/i.test(line)
  );
  const numbers = section.map(numericLine).filter((value) => value !== null);
  if (names.length === 0 || numbers.length < names.length * 2) return null;

  const rates = numbers.slice(0, names.length);
  const amounts = numbers.slice(-names.length);
  return names.map((name, index) => {
    const rate = rates[index];
    const lineAmount = amounts[index];
    const quantity = rate > 0 && lineAmount > 0 && lineAmount % rate === 0
      ? Math.max(1, lineAmount / rate)
      : 1;
    return { name, price: rate, quantity, lineAmount };
  });
}

function parseColumnarText(lines: string[]) {
  const items: { name: string; price: number; quantity: number }[] = [];
  let serviceCharge = 0;
  let total = 0;
  const itemHeader = lines.findIndex((line) => /^item\b/i.test(line));
  const foodTotal = lines.findIndex((line) => /food\s+total/i.test(line));
  const service = lines.findIndex((line) => /service\s+charge/i.test(line));

  if (itemHeader >= 0 && foodTotal > itemHeader && service > itemHeader && service < foodTotal) {
    const foodRows = columnarRows(lines, itemHeader, foodTotal);
    if (foodRows) {
      const serviceRow = foodRows.find((row) => /service\s+charge/i.test(row.name));
      items.push(...foodRows
        .filter((row) => row !== serviceRow)
        .map(({ name, price, quantity }) => ({ name, price, quantity })));
      serviceCharge = serviceRow?.lineAmount || 0;
    }
  }

  const liquorTotal = lines.findIndex((line, index) => index > foodTotal && /liquor\s+total/i.test(line));
  if (foodTotal >= 0 && liquorTotal > foodTotal) {
    const liquorRows = columnarRows(lines, foodTotal, liquorTotal);
    if (liquorRows) items.push(...liquorRows.map(({ name, price, quantity }) => ({ name, price, quantity })));
  }

  const totalStart = liquorTotal >= 0 ? liquorTotal : foodTotal;
  const trailingNumbers = lines.slice(totalStart + 1).map(numericLine).filter((value) => value !== null);
  if (trailingNumbers.length) total = trailingNumbers[trailingNumbers.length - 1];
  return items.length ? { items, tax: 0, serviceCharge, discount: 0, total } : null;
}

function parseOcrText(text: string) {
  const items: { name: string; price: number; quantity: number }[] = [];
  let tax = 0;
  let serviceCharge = 0;
  let discount = 0;
  let total = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;

    const lineTax = fieldAmount(line, /(?:tax|gst(?!\s*(?:in|no|number))|cgst|sgst)/i);
    const lineService = fieldAmount(line, /(?:service|svc|s\.c\.)/i);
    const lineDiscount = fieldAmount(line, /discount/i);
    const lineTotal = fieldAmount(line, /(?:grand\s+total|net\s+total|amount\s+due|total)/i);
    if (lineTax !== null) tax += lineTax;
    if (lineService !== null) serviceCharge += lineService;
    if (lineDiscount !== null) discount += lineDiscount;
    if (lineTotal !== null) total = lineTotal;
    if (lineTax !== null || lineService !== null || lineDiscount !== null || lineTotal !== null) continue;

    if (isMetadataLine(line)) continue;
    const priceMatch = line.match(/(?:^|\s)([₹$€£]?\s*[\d,]+(?:\.\d{1,2})?)\s*$/);
    if (!priceMatch) continue;
    if (isLikelyPincodeOrPhone(priceMatch[1])) continue;
    const name = line.slice(0, priceMatch.index).replace(/^\d+[.)]?\s+/, "").trim();
    if (!name || !/[a-z]/i.test(name)) continue;
    if (name.split(",").length > 1) continue;
    const quantityMatch =
      name.match(/^(\d+)\s*[xX*]\s+(.+)$/) ||
      name.match(/^(.+?)\s+(\d+)\s*[xX*]$/) ||
      name.match(/^(.+?)\s+(\d+)$/);
    const quantity = quantityMatch
      ? Number(quantityMatch[1].match(/^\d+$/) ? quantityMatch[1] : quantityMatch[2])
      : 1;
    const itemName = quantityMatch
      ? quantityMatch[1].match(/^\d+$/)
        ? quantityMatch[2]
        : quantityMatch[1]
      : name;
    items.push({
      name: itemName.trim(),
      price: amount(priceMatch[1]),
      quantity,
    });
  }

  if (items.length === 0) {
    return parseColumnarText(text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean)) || {
      items,
      tax,
      serviceCharge,
      discount,
      total,
    };
  }
  return { items, tax, serviceCharge, discount, total };
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { extractedText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const extractedText = body.extractedText?.trim();
  if (!extractedText) {
    return NextResponse.json(
      { error: "Missing extracted text" },
      { status: 400 }
    );
  }
  return NextResponse.json(parseOcrText(extractedText));
}
