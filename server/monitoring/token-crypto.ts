const TOKEN_FORMAT_VERSION = "v1";

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array) {
  let binary = "";
  value.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importKey(encodedKey: string) {
  const rawKey = decodeBase64Url(encodedKey);
  if (rawKey.byteLength !== 32) {
    throw new Error("Monitoring token key must contain exactly 32 bytes");
  }
  return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptMonitoringToken(
  plaintext: string,
  encodedKey: string
) {
  if (!plaintext) throw new Error("Monitoring token must not be empty");
  const key = await importKey(encodedKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return [
    TOKEN_FORMAT_VERSION,
    encodeBase64Url(iv),
    encodeBase64Url(new Uint8Array(ciphertext)),
  ].join(".");
}

export async function decryptMonitoringToken(
  envelope: string,
  encodedKey: string
) {
  const [version, encodedIv, encodedCiphertext, extra] = envelope.split(".");
  if (
    version !== TOKEN_FORMAT_VERSION ||
    !encodedIv ||
    !encodedCiphertext ||
    extra
  ) {
    throw new Error("Unsupported monitoring token envelope");
  }
  const iv = decodeBase64Url(encodedIv);
  if (iv.byteLength !== 12) throw new Error("Invalid monitoring token nonce");
  const key = await importKey(encodedKey);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    decodeBase64Url(encodedCiphertext)
  );
  return new TextDecoder().decode(plaintext);
}
