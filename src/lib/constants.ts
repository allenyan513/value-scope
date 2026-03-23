/** ISR revalidation: 1 hour in production, no cache in development */
export const PAGE_REVALIDATE = process.env.NODE_ENV === "development" ? 0 : 3600;
