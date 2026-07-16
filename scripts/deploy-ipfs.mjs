#!/usr/bin/env node
import { readdirSync, statSync, createReadStream } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import FormData from "form-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

config({ path: join(root, ".env.local") });

const JWT = process.env.NEXT_PUBLIC_PINATA_JWT;
const OUT_DIR = join(root, "out");

if (!JWT) {
  console.error("Missing NEXT_PUBLIC_PINATA_JWT in .env.local");
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
console.log("URL:    ", `https://gateway.pinata.cloud/ipfs/${cid}/`);
console.log("ENS:     Set this CID as the contenthash on petid.eth\n");
