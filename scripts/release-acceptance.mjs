import { existsSync, readFileSync } from "node:fs";

const expected = ["SCHEMA_BOOTSTRAP_VERIFIED", "HOSTED_INTEGRATION_VERIFIED", "BRIDGE_CONTRACT_VERIFIED", "RULE_ZERO_APPROVED", "TRUSTED_APPROVAL_VERIFIED", "PRODUCTION_CHANGE_APPROVED"];
const path = process.env.OSIRIS_RELEASE_ATTESTATION_PATH;
const fail = (message) => {
  console.error("RELEASE_BLOCKED: " + message);
  process.exitCode = 1;
};
if (!path || !existsSync(path)) {
  fail("No independently signed release attestation supplied. All six acceptance receipts required.");
} else {
  let attestation;
  try {
    attestation = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("Release attestation cannot be parsed.");
  }
  if (attestation) {
    // A locally authored JSON file, including a list of "verified" values,
    // is NOT independently authenticated proof of release approval.
    fail("Release attestation trust verification not implemented; refuse all approvals.");
    for (const requirement of expected) {
      if (!attestation.receipts?.[requirement]) {
        console.error("UNVERIFIED: " + requirement);
      }
    }
  }
}
