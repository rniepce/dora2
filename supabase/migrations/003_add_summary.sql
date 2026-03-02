-- ============================================================================
-- Adiciona coluna para persistir o resumo gerado pela IA
-- Execute este SQL no Supabase Dashboard > SQL Editor
-- ============================================================================

ALTER TABLE transcriptions ADD COLUMN summary TEXT;
