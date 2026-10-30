// Adapter contract: db.query must execute SQL against a single authoritative
// PostgreSQL database. INSERT ON CONFLICT and DELETE RETURNING are atomic.
// A test double does not prove hosted concurrency, isolation or permissions.
export function createPostgresChallengeStore(db) {
  if (typeof db?.query !== "function") throw new Error("DATABASE_NOT_CONFIGURED");
  return {
    async putIfAbsent(key, value) {
      if (typeof key !== "string" || key.length > 160 || !key)
        throw new Error("INVALID_CHALLENGE_KEY");
      const result = await db.query(
        "INSERT INTO osiris_webauthn_challenges (challenge_key, payload) VALUES ($1, $2::jsonb) ON CONFLICT (challenge_key) DO NOTHING RETURNING challenge_key",
        [key, JSON.stringify(value)]
      );
      return result.rows.length === 1;
    },
    async take(key) {
      if (typeof key !== "string" || key.length > 160 || !key)
        throw new Error("INVALID_CHALLENGE_KEY");
      const result = await db.query(
        "DELETE FROM osiris_webauthn_challenges WHERE challenge_key = $1 RETURNING payload",
        [key]
      );
      return result.rows.length === 1 ? result.rows[0].payload : null;
    },
  };
}
