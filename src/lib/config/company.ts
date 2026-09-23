/**
 * Seoul Aqua head-office contact constants.
 *
 * Centralised so the "Call HQ" action, SMS/email templates, and PDFs all use
 * one source of truth. Two formats are kept because notifications historically
 * use the international form while customer-facing UI prefers the local form.
 */

/** Local dialing format — shown in UI and most documents. */
export const HQ_PHONE = "028-1234-5678";

/** International (+84) format — used in some SMS/email templates. */
export const HQ_PHONE_INTL = "+84-28-1234-5678";

/** Bare digits suitable for a `tel:` href. */
export const HQ_PHONE_TEL = "02812345678";

/** Customer-service mailbox. */
export const HQ_EMAIL = "cs@seoulaqua.com.vn";

/**
 * The one host the whole system is served from (decision 2026-09-23).
 *
 * Office, field and customer-portal realms are paths on a single Next app
 * (`/o`, `/f`, `/`), so they share this host — there is no separate portal
 * deployment. Notifications that link a customer somewhere use
 * `PORTAL_URL`; it is written without a scheme because SMS bodies are
 * character-budgeted and the carrier registers the literal string.
 */
export const APP_HOST = "soms.seoulaqua.com.vn";

/** Customer-facing entry point, as it appears in SMS bodies. */
export const PORTAL_URL = APP_HOST;

/** Same target with a scheme, for email bodies and anchor hrefs. */
export const PORTAL_URL_HTTPS = `https://${APP_HOST}`;
