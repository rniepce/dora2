-- ============================================================================
-- JusScribe — Compartilhamento de Degravações
-- Execute este SQL no Supabase Dashboard > SQL Editor
-- ============================================================================

-- ─── Tabela: shared_transcriptions ──────────────────────────────────────────
CREATE TABLE shared_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcription_id UUID NOT NULL REFERENCES transcriptions(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(transcription_id, shared_with)
);

-- ─── Índices ────────────────────────────────────────────────────────────────
CREATE INDEX idx_shared_transcription_id ON shared_transcriptions(transcription_id);
CREATE INDEX idx_shared_with ON shared_transcriptions(shared_with);
CREATE INDEX idx_shared_by ON shared_transcriptions(shared_by);

-- ─── RLS: shared_transcriptions ─────────────────────────────────────────────
ALTER TABLE shared_transcriptions ENABLE ROW LEVEL SECURITY;

-- Dono pode gerenciar compartilhamentos das suas transcrições
CREATE POLICY "Owner can manage shares"
  ON shared_transcriptions FOR ALL
  USING (shared_by = auth.uid())
  WITH CHECK (shared_by = auth.uid());

-- Destinatário pode ver compartilhamentos recebidos
CREATE POLICY "Recipient can view shares"
  ON shared_transcriptions FOR SELECT
  USING (shared_with = auth.uid());

-- ─── Atualizar RLS de transcriptions ────────────────────────────────────────
-- Remover policy antiga e recriar (mantendo CRUD para dono)
DROP POLICY IF EXISTS "Users can CRUD own transcriptions" ON transcriptions;

CREATE POLICY "Users can CRUD own transcriptions"
  ON transcriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Permitir leitura para usuários com compartilhamento
CREATE POLICY "Shared users can read transcriptions"
  ON transcriptions FOR SELECT
  USING (
    id IN (
      SELECT transcription_id FROM shared_transcriptions
      WHERE shared_with = auth.uid()
    )
  );

-- ─── Atualizar RLS de utterances ────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can CRUD own utterances" ON utterances;

CREATE POLICY "Users can CRUD own utterances"
  ON utterances FOR ALL
  USING (transcription_id IN (SELECT id FROM transcriptions WHERE user_id = auth.uid()))
  WITH CHECK (transcription_id IN (SELECT id FROM transcriptions WHERE user_id = auth.uid()));

-- Permitir leitura de utterances para usuários com compartilhamento
CREATE POLICY "Shared users can read utterances"
  ON utterances FOR SELECT
  USING (
    transcription_id IN (
      SELECT transcription_id FROM shared_transcriptions
      WHERE shared_with = auth.uid()
    )
  );

-- ─── RPC Functions para lookup de usuários ──────────────────────────────────

-- Buscar user_id pelo email (para compartilhamento)
CREATE OR REPLACE FUNCTION get_user_id_by_email(target_email TEXT)
RETURNS TABLE(id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT au.id FROM auth.users au WHERE au.email = lower(target_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Buscar emails de múltiplos user_ids (para listar compartilhamentos)
CREATE OR REPLACE FUNCTION get_user_emails_by_ids(user_ids UUID[])
RETURNS TABLE(id UUID, email TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT au.id, au.email::TEXT FROM auth.users au WHERE au.id = ANY(user_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
