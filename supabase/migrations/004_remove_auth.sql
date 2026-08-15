-- ============================================================================
-- Protótipo sem autenticação — remove o acoplamento com auth.users
--
-- ATENÇÃO: depois desta migração o banco fica aberto para a chave anon.
-- Use apenas em ambiente de protótipo/teste dos motores de speech-to-text.
-- ============================================================================

-- ─── Policies antigas (dependem de shared_transcriptions) ──────────────────
DROP POLICY IF EXISTS "Users can CRUD own transcriptions" ON transcriptions;
DROP POLICY IF EXISTS "Shared users can read transcriptions" ON transcriptions;
DROP POLICY IF EXISTS "Users can CRUD own utterances" ON utterances;
DROP POLICY IF EXISTS "Shared users can read utterances" ON utterances;

-- ─── Compartilhamento não faz sentido sem contas de usuário ─────────────────
DROP TABLE IF EXISTS shared_transcriptions;
DROP FUNCTION IF EXISTS get_user_id_by_email(TEXT);
DROP FUNCTION IF EXISTS get_user_emails_by_ids(UUID[]);

-- ─── transcriptions.user_id deixa de ser obrigatório e some a FK ────────────
ALTER TABLE transcriptions DROP CONSTRAINT IF EXISTS transcriptions_user_id_fkey;
ALTER TABLE transcriptions ALTER COLUMN user_id DROP NOT NULL;

-- ─── RLS: acesso liberado para anon/authenticated ───────────────────────────
CREATE POLICY "Prototype open access on transcriptions"
  ON transcriptions FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Prototype open access on utterances"
  ON utterances FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─── Storage: bucket "media" acessível sem sessão ───────────────────────────
DROP POLICY IF EXISTS "Prototype open access on media bucket" ON storage.objects;

CREATE POLICY "Prototype open access on media bucket"
  ON storage.objects FOR ALL
  USING (bucket_id = 'media')
  WITH CHECK (bucket_id = 'media');
