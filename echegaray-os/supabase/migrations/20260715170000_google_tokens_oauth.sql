-- ============================================================================
-- PRP-024 (OAuth por usuario) — TOKENS de Google por cuenta autorizada
-- ----------------------------------------------------------------------------
-- Guarda el refresh_token de cada usuario que autorizó el OS sobre su cuenta
-- ("Iniciar sesión con Google → Permitir"). Con esto el OS actúa COMO esa cuenta
-- (Drive/Gmail/Calendar) sin delegación de dominio ni admin. SECRETO: solo el
-- backend de servicio lo lee; NUNCA se expone a 'authenticated'. ADITIVA.
-- ============================================================================

create table if not exists orq.google_tokens (
  email          text primary key,
  refresh_token  text not null,
  scopes         text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table orq.google_tokens is 'refresh_token OAuth por email (PRP-024). Secreto: solo service_role.';

alter table orq.google_tokens enable row level security;
-- Sin grants a authenticated: contiene secretos. Solo el backend de servicio.
grant select, insert, update, delete on orq.google_tokens to service_role;
create policy google_tokens_srv on orq.google_tokens for all to service_role using (true) with check (true);
