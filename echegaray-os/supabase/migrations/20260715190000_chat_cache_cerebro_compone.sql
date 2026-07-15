-- ============================================================================
-- CEREBRO QUE COMPONE — caché de respuestas del chat (misión: usar cada vez MENOS API)
-- ----------------------------------------------------------------------------
-- Cada pregunta informativa/asesora que llega a la API deja su respuesta acá. La
-- próxima pregunta idéntica (normalizada) se responde desde la caché con 0 API.
-- Solo entra el subconjunto SEGURO (lo decide el interactive-server): preguntas
-- standalone, sin hilo de conversación, sin adjunto, sin escritura, sin
-- presupuestación interactiva. Los datos vivos (caja, avance, briefing) ya se
-- responden por detección determinística y NUNCA pasan por acá. TTL corto (env
-- ORQ_CHAT_CACHE_TTL_MIN, default 360=6h) para no servir algo viejo.
-- ============================================================================

create table if not exists orq.chat_cache (
  id            uuid primary key default gen_random_uuid(),
  rol           text not null default 'super_admin',
  pregunta_norm text not null,
  pregunta      text not null,
  respuesta     text not null,
  model         text,
  hits          integer not null default 0,
  created_at    timestamptz not null default now(),
  last_hit_at   timestamptz
);

create unique index if not exists chat_cache_key on orq.chat_cache (rol, pregunta_norm);
create index if not exists chat_cache_created on orq.chat_cache (created_at desc);
