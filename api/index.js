// Keep Vercel's function entry in JavaScript so its platform-specific
// TypeScript pass does not reinterpret the fully type-checked Express app.
export { default } from "../server/vercel-app.js";
