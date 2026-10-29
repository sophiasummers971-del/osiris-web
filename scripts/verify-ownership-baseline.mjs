import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const result = JSON.parse(readFileSync(process.argv[2], "utf8"));
const assertions = result.testResults.flatMap(test => test.assertionResults);
for (const name of [
  "denies own-operator audit injection into another owner's case",
  "denies own-owner evidence injection into another owner's case",
]) {
  const assertion = assertions.find(test => test.title === name);
  assert.equal(
    assertion?.status,
    "failed",
    `${name}: baseline did not reproduce`
  );
  assert.ok(
    assertion.failureMessages.some(message =>
      message.includes("promise resolved")
    ),
    `${name}: failure was not an accepted unauthorized append`
  );
}
console.log(
  `CONFIRMED: both cross-case appends accepted before repair; ${result.numFailedTests} failed / ${result.numPassedTests} passed baseline checks.`
);
