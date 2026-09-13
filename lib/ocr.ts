export type BillData = {
  items: { name: string; quantity: number; price: number }[];
  subtotal: number | null;
  tax: number | null;
  serviceCharge: number | null;
  total: number | null;
};

export type OcrExtractionResult = {
  success: boolean;
  data?: BillData;
  error?: string;
};

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image file"));
    };
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

function isHeic(file: File) {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name)
  );
}

function fileMimeType(file: File) {
  if (file.type) return file.type;
  if (/\.(heic|heif)$/i.test(file.name)) return "image/heic";
  if (/\.png$/i.test(file.name)) return "image/png";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  return "image/jpeg";
}

async function prepareImage(file: File) {
  let source: Blob = file;
  if (isHeic(file)) {
    try {
      const { default: heic2any } = await import("heic2any");
      const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.85,
      });
      source = Array.isArray(converted) ? converted[0] : converted;
    } catch (error) {
      console.warn("[OCR DEBUG] HEIC conversion failed; trying native decoder", error);
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare HEIC image");
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        source = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("Could not convert HEIC image"))),
            "image/jpeg",
            0.85
          );
        });
      } catch {
        throw new Error("This HEIC image could not be decoded in the browser. Try exporting it as JPG or PNG.");
      }
    }
  }

  const dataUrl = await fileToBase64(
    new File([source], "image.jpg", { type: source.type || "image/jpeg" })
  );
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Could not load image for OCR"));
    element.src = dataUrl;
  });
  const maxDimension = 2400;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare image for OCR");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not compress image for OCR"))),
      "image/jpeg",
      0.88
    );
  });
  return new File([jpegBlob], file.name.replace(/\.(heic|heif|png|webp)$/i, ".jpg"), {
    type: "image/jpeg",
  });
}

export async function extractBillData(file: File): Promise<OcrExtractionResult> {
  const controller = new AbortController();
  const timeoutMs = 60_000;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const preparedFile = await prepareImage(file);
    const imageBase64 = await fileToBase64(preparedFile);
    const response = await fetch("/api/ocr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageBase64, mediaType: preparedFile.type }),
      signal: controller.signal,
    });
    const result = (await response.json().catch(() => null)) as OcrExtractionResult | null;

    if (!result) {
      return { success: false, error: "OCR service returned an invalid response" };
    }
    if (!response.ok || !result.success || !result.data) {
      return { success: false, error: result.error || "Could not extract bill data" };
    }
    console.log("[OCR DEBUG] Gemini bill data", result.data);
    return { success: true, data: result.data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { success: false, error: "OCR timed out after 60 seconds" };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not extract bill data",
    };
  } finally {
    window.clearTimeout(timeout);
  }
}