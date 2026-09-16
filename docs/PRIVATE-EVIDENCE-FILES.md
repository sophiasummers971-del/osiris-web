# Private evidence file workflow

Authenticated case owners may attach PDF, PNG, JPEG or UTF-8 text files up to 1 MiB from the Evidence Vault. Notes-only evidence remains available.

The server verifies case ownership, validates base64, size, extension, MIME and basic signatures, calculates SHA-256, and generates an unpredictable owner/case-specific path. It uploads to the existing private `osiris-evidence` bucket without overwriting objects. File metadata and an audit event containing the hash are then recorded transactionally. No client-supplied storage path is accepted.

The server requires the existing `SUPABASE_SECRET_KEY` and Supabase URL; the secret is never exposed in runtime configuration. Broad authenticated browser uploads remain blocked by the preceding storage policy migration. No new storage policy or binding is created by this feature.

Download requests recheck case ownership and evidence ownership, bucket and path. Links request attachment disposition and expire after 60 seconds. A signed link is a bearer capability: do not share it or log its URL. No inline preview is provided.

Basic signature checks are not malware scanning, full format validation or data-loss prevention. Files can contain sensitive information; only upload material you are authorized to retain. Downloaded files should be handled as untrusted.

If upload succeeds but the database transaction fails, the private object may be orphaned. Automatic deletion is deliberately avoided because an ambiguous commit could already have created evidence. Check the case before retrying and reconcile orphaned objects through an authorized maintenance process. There is no deduplication, per-account quota or resumable upload in this first workflow.

Worker upload routes enforce a 2 MiB request-body cap (including batches containing this route); decoded files are separately capped at 1 MiB. The Express development server retains its existing JSON request cap.

Release verification must include an authenticated synthetic upload/download, foreign-account denial and private-bucket checks. Local mocked tests are not proof of live storage permission or actual browser download behavior.
