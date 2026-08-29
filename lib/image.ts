export async function fileToBase64Image(file: File): Promise<{
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}> {
  const dataUrl = await readFile(file);
  const compressed = await compressDataUrl(dataUrl);
  const { base64, mediaType } = splitDataUrl(compressed);
  return { base64, mediaType };
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function splitDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Could not read image");
  }
  const mediaType = match[1] as
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp";
  return { mediaType, base64: match[2] };
}

function compressDataUrl(dataUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = dataUrl;
  });
}
