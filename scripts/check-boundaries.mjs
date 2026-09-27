import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// A bounded architecture check, not a replacement for general-purpose ESLint.
const forbidden = new Set([
  "server/db.ts",
  "server/notifications.ts",
  "server/supporters.ts",
  "server/stripe.ts",
  "server/coinbase.ts",
  "server/emailService.ts",
  "server/emailServiceIntegration.ts",
  "server/_core/sdk.ts",
  "server/_core/oauth.ts",
  "server/_core/storageProxy.ts",
  "server/storage.ts",
  "server/_core/notification.ts",
]);
const seen = new Set();
function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  if (forbidden.has(file))
    throw new Error(`Legacy module reachable from Worker: ${file}`);
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  function walk(node) {
    let specifier;
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly)
      specifier = node.moduleSpecifier;
    if (ts.isExportDeclaration(node) && !node.isTypeOnly)
      specifier = node.moduleSpecifier;
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    )
      specifier = node.arguments[0];
    if (specifier && ts.isStringLiteral(specifier)) {
      const name = specifier.text;
      if (
        [
          "mysql2",
          "stripe",
          "@vercel/analytics",
          "@vercel/speed-insights",
        ].some(x => name === x || name.startsWith(x + "/"))
      )
        throw new Error(`Legacy dependency: ${name}`);
      if (name.startsWith(".")) {
        const stem = path
          .normalize(path.join(path.dirname(file), name))
          .replace(/\.js$/, "");
        const resolved = [
          stem,
          `${stem}.ts`,
          `${stem}.tsx`,
          `${stem}/index.ts`,
        ].find(x => fs.existsSync(x) && fs.statSync(x).isFile());
        if (!resolved)
          throw new Error(`Unresolved local runtime import ${name} in ${file}`);
        visit(resolved);
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
}
visit("worker/index.ts");
console.log(
  `PASS: ${seen.size} Worker runtime modules have no legacy database/provider dependency.`
);
