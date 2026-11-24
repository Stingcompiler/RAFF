import { extendTailwindMerge } from "tailwind-merge";

// These are the size tokens in styles/tokens.css. Keep a text size and a text color
// together when merging, while still allowing a caller to override either one.
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "caption",
            "label",
            "body",
            "lead",
            "section",
            "page",
            "metric",
            "total",
            "land-hero",
            "land-hero-lead",
            "land-section",
            "land-lead",
            "land-feature",
            "land-body",
          ],
        },
      ],
    },
  },
});

type ClassValue = string | false | null | undefined;

/** Join class names; later Tailwind utilities override earlier conflicting ones. */
export function cn(...classes: ClassValue[]): string {
  return merge(classes.filter(Boolean).join(" "));
}
