// Dev utility: renders one sample profile per template to /tmp/petid-previews.
// Run with: bun scripts/preview-templates.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { generateProfileHtml } from "../lib/profile-html";
import { TEMPLATES } from "../lib/templates/registry";

const OUT = "/tmp/petid-previews";
mkdirSync(OUT, { recursive: true });

for (const t of TEMPLATES) {
  const dog = t.species === "dog";
  const html = generateProfileHtml({
    name: dog ? "Max" : "Luna",
    ens: dog ? "max.dogid.eth" : "luna.catid.eth",
    photoUrl: undefined,
    breed: dog ? "Golden Retriever" : "British Shorthair",
    color: dog ? "Golden, white chest" : "Silver tabby",
    ageYears: "3",
    sex: dog ? "male" : "female",
    microchip: "985112004532192",
    neutered: true,
    weight: dog ? "65" : "9",
    vetName: "Happy Paws Clinic",
    vaccinated: true,
    favFood: dog ? "Chicken treats" : "Salmon pâté",
    favToy: dog ? "Tennis ball" : "Feather wand",
    bio: `A very good ${dog ? "boy" : "girl"} who loves long walks & belly rubs. Friendly with kids <and other pets>.`,
    emergencyNotes: "Allergic to penicillin. Needs daily thyroid medication.",
    ownerName: "Hector M.",
    ownerPhone: "+1 555 010 2030",
    ownerEmail: "owner@example.com",
    ownerWhatsapp: "+1 (555) 010-2030",
    ownerTelegram: "@hectorpets",
    ownerWallet: "0x1234567890abcdef1234567890abcdef12345678",
    templateId: t.id,
  });
  writeFileSync(`${OUT}/${t.id}.html`, html);
  console.log(`wrote ${OUT}/${t.id}.html`);
}
