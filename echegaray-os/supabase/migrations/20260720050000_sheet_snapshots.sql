-- SNAPSHOTS DE PESTAÑA — la red de seguridad que faltaba antes de que el OS escriba en un Sheet.
--
-- Por qué: el OS edita planillas REALES de la empresa y hasta hoy no había marcha atrás. El
-- 2026-07-19 una edición de la pestaña Caja frenó por tope de costo a mitad de camino y la dejó
-- medio reescrita, sin forma de volver. Escribir sin poder deshacer no es una funcionalidad
-- incompleta: es un riesgo sobre el sistema de gestión de la empresa.
--
-- Guarda la grilla (valores Y fórmulas) de la pestaña ANTES de cada escritura. Es append-only:
-- restaurar no borra el snapshot, crea uno nuevo del estado previo a restaurar.
create table if not exists orq.sheet_snapshots (
  id            uuid primary key default gen_random_uuid(),
  file_id       text        not null,
  pestana       text        not null,
  -- Grilla completa tal como estaba: [[{formula,valor}, ...], ...]
  grid          jsonb       not null,
  filas         int         not null default 0,
  columnas      int         not null default 0,
  -- Qué la provocó, para poder decirle al dueño "esto fue por tal pedido".
  tool          text,
  directive     text,
  run_id        text,
  restaurado_en timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists sheet_snapshots_file_tab_idx
  on orq.sheet_snapshots (file_id, pestana, created_at desc);

comment on table orq.sheet_snapshots is
  'Estado de una pestaña ANTES de que el OS la modifique. Permite deshacer una escritura y es la red de seguridad que hace tolerable que el OS toque planillas reales.';
