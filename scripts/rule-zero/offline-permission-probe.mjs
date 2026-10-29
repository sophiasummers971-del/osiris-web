// Fixed untrusted probe: no credentials or execution callbacks.
import { readFileSync } from "node:fs";
let readDenied = false;
try {
  readFileSync(process.env.OSIRIS_OFFLINE_PROBE_PATH);
} catch (e) {
  readDenied = ["ERR_ACCESS_DENIED", "EACCES"].includes(e.code);
}
console.log(JSON.stringify({ readDenied }));
