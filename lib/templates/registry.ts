import type { Template } from "@/types/templates";

export const TEMPLATES: Template[] = [
  {
    id: "dog-rustic",
    name: "Rustic Pup",
    species: "dog",
    description: "Warm earth tones, serif type, outdoorsy feel",
    swatch: ["#FBF5EC", "#3D2817", "#C87A2E"],
  },
  {
    id: "dog-modern",
    name: "Modern Woof",
    species: "dog",
    description: "Clean, minimal, bold typography. Urban aesthetic.",
    swatch: ["#F4F4F2", "#111111", "#F59E0B"],
  },
  {
    id: "cat-neon",
    name: "Neon Kitty",
    species: "cat",
    description: "Dark background, neon accents, mysterious vibe.",
    swatch: ["#0A0A0A", "#111111", "#00FF99"],
  },
  {
    id: "cat-soft",
    name: "Soft Paws",
    species: "cat",
    description: "Pastel colors, rounded shapes, gentle and cute.",
    swatch: ["#FDF6F9", "#F9C6D9", "#C86AA6"],
  },
];
