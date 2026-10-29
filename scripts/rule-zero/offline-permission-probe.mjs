// Fixed untrusted probe: no credentials or execution callbacks.
import { readFileSync } from "node:fs";
let readDenied = false;
try {
  readFileSync(process.env.OSIRIS_OFFLINE_PROBE_PATH);
} catch (e) {
  readDenied = ["ERR_ACCESS_DENIED", "EACCES"].includes(e.code);
}
let sqliteDenied = false;
try {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(process.env.OSIRIS_OFFLINE_PROBE_PATH, {
    readOnly: true,
  });
  db.prepare("SELECT * FROM effects").all();
  db.close();
} catch (e) {
  sqliteDenied = [
    "ERR_UNKNOWN_BUILTIN_MODULE",
    "ERR_ACCESS_DENIED",
    "EACCES",
  ].includes(e.code);
}
console.log(JSON.stringify({ readDenied, sqliteDenied }));
