// Fail closed until signed release receipts can be verified.
console.error("RELEASE_BLOCKED: approval verification unavailable.");
process.exitCode = 1;
