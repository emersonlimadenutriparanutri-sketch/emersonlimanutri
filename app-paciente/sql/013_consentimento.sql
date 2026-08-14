-- =====================================================================
-- App do Paciente — Fase 1
-- 013_consentimento.sql — registro de consentimento no aceite
--
-- POR QUE
-- O app trata dado de saúde, que a LGPD classifica como sensível, e o
-- titular (o paciente) não é o cliente contratante. O consentimento
-- precisa ficar registrado com data e com a VERSÃO do texto aceito —
-- sem a versão, não há como provar depois o que a pessoa concordou,
-- porque o texto muda com o tempo.
--
-- Fica em patient_users e não numa tabela à parte porque o
-- consentimento é do vínculo: se o paciente for atendido por outro
-- nutricionista assinante um dia, aquele vínculo tem o próprio aceite.
--
-- Rode depois da 012. É idempotente.
-- =====================================================================

alter table public.patient_users
  add column if not exists consentimento_em     timestamptz,
  add column if not exists consentimento_versao text;

comment on column public.patient_users.consentimento_em is
  'Quando o paciente aceitou os termos, no momento do aceite do convite.';

comment on column public.patient_users.consentimento_versao is
  'Versão do texto aceito. Sem isto não há como provar depois o que foi aceito.';


-- Verificação
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'patient_users'
order by ordinal_position;
