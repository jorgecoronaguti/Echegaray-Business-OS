-- ============================================================================
-- RESULTADO DEL CHAT PERSISTENTE — que una directiva larga sobreviva un reinicio.
-- Hasta ahora el resultado de una tarea async vivía solo en memoria (RESULTS): si el
-- server se reiniciaba, se perdía y el dueño veía "se perdió esta tarea". Con esta tabla,
-- al terminar se guarda acá y /result lo recupera aunque el proceso haya muerto entremedio.
-- Filas chicas y efímeras (la extensión las consume enseguida); el cleanup las borra.
-- ============================================================================

create table if not exists orq.chat_result (
  rid        text primary key,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_result_created on orq.chat_result (created_at desc);
