-- STAGING DESIGN ONLY: DO NOT RUN AGAINST PRODUCTION.
-- Dedicated locked-down database role must hold only INSERT and DELETE/SELECT
-- rights for this specific table, with tenant boundary enforced at the trusted
-- service layer. Never expose these operations to client credentials.
CREATE TABLE IF NOT EXISTS osiris_webauthn_challenges (
  challenge_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON osiris_webauthn_challenges FROM PUBLIC;
-- Expired challenge cleanup must be scheduled with a trusted DB identity.
-- Consuming a challenge is destructive; an outage after DELETE can leave an
-- uncertain verification state. Never retry an authorization as approved.
