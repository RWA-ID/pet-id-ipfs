#!/usr/bin/env node
import { readdirSync, statSync, createReadStream } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import FormData from "form-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

config({ path: join(root, ".env.local") });

const JWT = process.env.PINATA_JWT;
const OUT_DIR = join(root, "out");

if (!JWT) {
  console.error("Missing PINATA_JWT in .env.local");
  process.exit(1);
}

function collectFiles(dir) {
  const result = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) result.push(...collectFiles(full));
    else result.push(full);
  }
  return result;
}

function formToBuffer(form) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    form.on("data", (d) => chunks.push(typeof d === "string" ? Buffer.from(d) : d));
    form.on("end", () => resolve(Buffer.concat(chunks)));
    form.on("error", reject);
    // kick off the stream
    form.resume();
  });
}

console.log("Collecting files from out/...");
const files = collectFiles(OUT_DIR);
console.log(`Found ${files.length} files. Building multipart form...`);

const form = new FormData();

for (const file of files) {
  const rel = relative(OUT_DIR, file);
  form.append("file", createReadStream(file), {
    filepath: `petid/${rel}`,
    knownLength: statSync(file).size,
  });
}

form.append("pinataMetadata", JSON.stringify({ name: "petid-eth-ipfs" }));
form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

console.log("Buffering form data...");
const body = await formToBuffer(form);

console.log(`Uploading ${(body.length / 1024 / 1024).toFixed(1)} MB to Pinata...`);
const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${JWT}`,
    "Content-Type": `multipart/form-data; boundary=${form.getBoundary()}`,
  },
  body,
});

if (!res.ok) {
  const text = await res.text();
  console.error(`Upload failed (${res.status}):`, text);
  process.exit(1);
}

const json = await res.json();
const cid = json.IpfsHash;

console.log("\n✓ Uploaded successfully!\n");
console.log("CID:    ", cid);
/* The dedicated gateway, not gateway.pinata.cloud: the shared public gateway
   only serves pins on the caller's own plan and 403s ours, so a link built on
   it looks correct and resolves to nothing. */
const configured = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "";
const GATEWAY = /gateway\.pinata\.cloud/.test(configured) || !configured
  ? "https://ipfs.onchain-id.id"
  : configured;
console.log("URL:    ", `${GATEWAY.replace(/\/+$/, "")}/ipfs/${cid}/`);

/* Warm the gateway before anyone looks at it. A freshly pinned CID 504s on its
   largest blocks until the gateway has pulled them, and in a Next export those
   are the JS chunks — so an unwarmed release surfaces as a ChunkLoadError in
   the thing you just shipped, which reads as a broken build rather than a cold
   cache. Warming each gateway separately matters: warming one does nothing for
   another, and visitors arrive through eth.limo. */
const base = `${GATEWAY.replace(/\/+$/, "")}/ipfs/${cid}`;
const rel = files.map((f) => relative(OUT_DIR, f).split(/[\\/]/).join("/"));
console.log(`\nWarming ${rel.length} files…`);
let warm = 0;
const cold = [];
for (let i = 0; i < rel.length; i += 3) {
  await Promise.all(
    rel.slice(i, i + 3).map(async (r) => {
      try {
        const res = await fetch(`${base}/${r}`);
        if (res.ok) { warm++; await res.arrayBuffer(); } else cold.push(`${res.status} ${r}`);
      } catch { cold.push(`ERR ${r}`); }
    }),
  );
  process.stdout.write(`\r  ${Math.min(i + 3, rel.length)}/${rel.length}`);
}
console.log(`\r  warmed ${warm}/${rel.length}${cold.length ? ` — ${cold.length} still cold` : ""}`);

/* Retry the stragglers. A cold gateway answers 504 while it pulls the block and
   200 once it has it, so the first refusal is the pull starting, not a failure. */
for (let round = 1; round <= 3 && cold.length; round++) {
  await new Promise((r) => setTimeout(r, 5000));
  const again = [];
  for (const entry of cold) {
    const r = entry.replace(/^\S+ /, "");
    try {
      const res = await fetch(`${base}/${r}`);
      if (res.ok) { warm++; await res.arrayBuffer(); } else again.push(`${res.status} ${r}`);
    } catch { again.push(`ERR ${r}`); }
  }
  console.log(`  retry ${round}: ${cold.length - again.length} warmed, ${again.length} left`);
  cold.length = 0; cold.push(...again);
}
cold.slice(0, 8).forEach((c) => console.log("    " + c));
if (cold.length) console.log(`  ${cold.length} still cold — re-run in a minute.`);
else console.log("  ✓ all warm");
console.log("ENS:     Set this CID as the contenthash on petid.eth\n");
