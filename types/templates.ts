export type Template = {
  id: string;
  name: string;
  species: "dog" | "cat";
  description: string;
  /** theme preview: [page background, surface, accent] */
  swatch: [string, string, string];
};
