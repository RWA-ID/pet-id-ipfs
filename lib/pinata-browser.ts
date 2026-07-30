const JWT = () => process.env.NEXT_PUBLIC_PINATA_JWT!;

export async function uploadFileToPinata(file: File | Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("pinataMetadata", JSON.stringify({ name: filename }));
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  // v1 pinFileToIPFS rather than the v3 uploads API: the shared upload-only
  // key is scoped to this endpoint, and v3 is a separate permission.
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${JWT()}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata upload failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  // CIDv1. Single files come back raw-codec (bafkrei…) rather than dag-pb
  // (bafybei…); cidToContenthash() calls .toV1() so either is fine.
  return json.IpfsHash as string;
}

export async function uploadHtmlToPinata(html: string, filename: string): Promise<string> {
  const blob = new Blob([html], { type: "text/html" });
  return uploadFileToPinata(blob, filename);
}

export function ipfsUrl(cid: string): string {
  const gw = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud";
  return `${gw}/ipfs/${cid}`;
}
