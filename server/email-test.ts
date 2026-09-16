import { TRPCError } from "@trpc/server";

export const EMAIL_TEST_RECIPIENT = "sophiasummers971@gmail.com";
export const EMAIL_TEST_SENDER = "osiris-alerts@iron-fire.uk";

export async function sendOwnerEmailTest(
  email: string | null,
  send: (() => Promise<void>) | undefined
) {
  if (email?.toLowerCase() !== EMAIL_TEST_RECIPIENT)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Email test is owner-only",
    });
  if (!send)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Email test is not configured",
    });
  try {
    await send();
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Email test failed",
    });
  }
  return { accepted: true } as const;
}
