const JWT = () => process.env.NEXT_PUBLIC_PINATA_JWT!;

export async function uploadFileToPinata(file: File | Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("network", "public");

  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${JWT()}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata upload failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.data.cid as string; // CIDv1 bafy...
}

export async function uploadHtmlToPinata(html: string, filename: string): Promise<string> {
  const blob = new Blob([html], { type: "text/html" });
  return uploadFileToPinata(blob, filename);
}

export function ipfsUrl(cid: string): string {
  const gw = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud";
  return `${gw}/ipfs/${cid}`;
}
