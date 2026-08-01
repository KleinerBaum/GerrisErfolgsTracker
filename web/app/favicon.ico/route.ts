export const dynamic = "force-static";

const FAVICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Gerris Kompass">
  <defs>
    <linearGradient id="bg" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
      <stop stop-color="#183c33"/>
      <stop offset="1" stop-color="#0b211b"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#bg)"/>
  <circle cx="32" cy="32" r="21" fill="none" stroke="#72dfbd" stroke-width="3"/>
  <path d="M39.7 16.9 34.6 29l-5.8 5.8-4.5 12.3 12.1-5.3 5.4-5.4 4.9-12.2-7 2.7Z" fill="#f2c66d" transform="rotate(18 35.5 32)"/>
  <circle cx="32" cy="32" r="4.5" fill="#f5f7f3"/>
</svg>`;

export function GET() {
  return new Response(FAVICON.trim(), {
    headers: {
      "cache-control": "public, max-age=86400, immutable",
      "content-type": "image/svg+xml; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
