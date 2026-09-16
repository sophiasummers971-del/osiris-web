-- Applied through Supabase MCP; filename uses the recorded migration version.
-- No vault file-upload consumer or stored objects exist at rollout.
-- Remove only the unrestricted authenticated INSERT grant; keep the bucket private.
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects) THEN
    RAISE EXCEPTION 'Storage objects appeared; review upload dependencies before continuing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Enable insert for authenticated users only' AND (cmd <> 'INSERT' OR roles <> ARRAY['authenticated']::name[] OR with_check <> 'true')) THEN
    RAISE EXCEPTION 'Target storage policy changed; manual review required';
  END IF;
END $guard$;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON storage.objects;
