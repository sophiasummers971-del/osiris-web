/** Cloudflare Access-provided identity is the only permitted controller identity source.
 * Never accept a client email header, query parameter, or request body as authority.
 */
export interface AccessExecutionContext {
  access?: {
    aud: string;
    getIdentity(): Promise<{ email?: string } | null>;
  };
}
export async function verifyControllerAccess(
  ctx: AccessExecutionContext | undefined,
  expectedEmail: string,
  expectedAudience: string
): Promise<boolean> {
  if (
    !ctx?.access ||
    !expectedEmail ||
    !expectedAudience ||
    ctx.access.aud !== expectedAudience
  ) {
    return false;
  }
  try {
    const identity = await ctx.access.getIdentity();
    return (
      typeof identity?.email === "string" &&
      identity.email.toLowerCase() === expectedEmail.toLowerCase()
    );
  } catch {
    return false;
  }
}
