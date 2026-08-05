import type { Metadata } from "next";

/**
 * Every route's metadata goes through pageMetadata().
 *
 * Next *replaces* the `openGraph` and `twitter` objects rather than deep-merging
 * them, so a page that declares `openGraph: { title }` silently drops the
 * inherited `images` and ships a card with no picture. Nothing errors and the
 * source looks fine — routing everything through one helper is what stops that
 * from regressing.
 */

export const SITE = "https://petid.eth.link";
export const SITE_NAME = "PetID";
export const TWITTER = "@petidentity";

/** Share cards live in public/og/ and are rendered by scripts/og/render.sh. */
export type OgCard = "home" | "register" | "partner" | "apply";

interface PageMeta {
  title: string;
  description: string;
  /** Route path with a trailing slash, e.g. "/partner/". */
  path: string;
  card: OgCard;
  /** Alt text for the share image — screen readers on X and Slack read it. */
  imageAlt: string;
  index?: boolean;
}

export function pageMetadata({
  title,
  description,
  path,
  card,
  imageAlt,
  index = true,
}: PageMeta): Metadata {
  const image = {
    url: `/og/${card}.png`,
    width: 1200,
    height: 630,
    type: "image/png",
    alt: imageAlt,
  };
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: path,
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      site: TWITTER,
      creator: TWITTER,
      title,
      description,
      images: [{ url: image.url, alt: imageAlt }],
    },
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}
