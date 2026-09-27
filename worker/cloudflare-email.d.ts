// Minimal contract used here; deployment/runtime validation still belongs to Wrangler/Cloudflare.
declare module "cloudflare:email" {
  export class EmailMessage {
    constructor(from: string, to: string, raw: string | ReadableStream);
  }
}
