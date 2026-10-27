import "server-only";

/** `RAFF_ROOT=marketing` makes "/" the Raff product page (the demo domain); default: the shop. */
export const rootIsMarketing = () => process.env.RAFF_ROOT === "marketing";

/** Where "home" points inside the shop. */
export const shopHome = () => (rootIsMarketing() ? "/shop" : "/");
