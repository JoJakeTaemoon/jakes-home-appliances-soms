/**
 * Jake's Home Appliances head-office contact constants.
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
export const HQ_EMAIL = "cs@jakeshomeappliances.com.vn";
