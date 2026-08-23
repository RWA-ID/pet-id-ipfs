/**
 * Uploads, from the browser, via our worker.
 *
 * This module used to hold `NEXT_PUBLIC_PINATA_JWT` and POST straight to
 * Pinata. That prefix compiles the value into the JS bundle — and the bundle is
 * pinned to IPFS, which cannot be unpublished. So the key was readable by
 * anyone, permanently, in every version of the site ever pinned, and it was
 * shared with several other projects.
 *
 * The file now posts to `POST /upload` on the PetID worker, which holds an
 * upload-only key scoped to PetID as a Wrangler secret. Nothing secret reaches
 * the browser, and the key can be rotated without re-pinning anything.
 *
 * The exported signatures are unchanged on purpose: `app/register/page.tsx`
 * calls these in the middle of a paid mint, and this migration should not touch
 * the mint flow.
 */

const API = () => {
  const base = process.env.NEXT_PUBLIC_UPLOAD_API;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_UPLOAD_API is not set — uploads have no endpoint to reach."
    );
  }
  return base.replace(/\/+$/, "");
};

export async function uploadFileToPinata(
  file: File | Blob,
  filename: string
): Promise<string> {
  /* Pinata rejects an image whose filename carries no extension with a 400,
     and callers pass display names like `${subdomain}-photo`. A Blob has no
     name of its own, so the extension is derived from its MIME type; a File
     keeps whatever it already had. The pin's display name travels separately.
     HTML without an extension is accepted, which is why this only ever bit
     photos. */
  const ext =
    "name" in file && typeof file.name === "string" && /\.[A-Za-z0-9]+$/.test(file.name)
      ? ""
      : { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
          "image/gif": ".gif", "image/avif": ".avif", "text/html": ".html" }[file.type] ?? "";
  const sendName =
    "name" in file && typeof file.name === "string" && file.name ? file.name : filename + ext;

  const form = new FormData();
  form.append("file", file, sendName);
  form.append("name", filename);

  const res = await fetch(`${API()}/upload`, { method: "POST", body: form });

  if (!res.ok) {
    // The worker returns a short reason and never forwards Pinata's own error
    // text, which can echo the request — and the request carries the key.
    let reason = `${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) reason = body.error;
    } catch {
      /* non-JSON body; the status is enough */
    }
    throw new Error(`Upload failed: ${reason}`);
  }

  const json = (await res.json()) as { cid?: string };
  if (!json.cid) throw new Error("Upload failed: no CID returned");
  // CIDv1. Single files come back raw-codec (bafkrei…) rather than dag-pb
  // (bafybei…); cidToContenthash() calls .toV1() so either is fine.
  return json.cid;
}

export async function uploadHtmlToPinata(
  html: string,
  filename: string
): Promise<string> {
  // The type matters now: the worker allowlists content types, and a Blob with
  // no type is rejected rather than silently pinned as something unexpected.
  const blob = new Blob([html], { type: "text/html" });
  return uploadFileToPinata(blob, filename);
}

export function ipfsUrl(cid: string): string {
  // gateway.pinata.cloud is the shared public gateway and 403s content pinned
  // to our account — a URL built on it looks right and resolves to nothing.
  const gw = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://ipfs.onchain-id.id";
  return `${gw.replace(/\/+$/, "")}/ipfs/${cid}`;
}
