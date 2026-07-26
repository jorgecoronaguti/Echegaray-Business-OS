-- CAPA DE RECONCILIACIÓN SOBRE LA FIRMA — de "congelar+preguntar" a "entender+reconciliar".
--
-- POR QUÉ (25/07). La firma ya detecta CUALQUIER edición del dueño y candá la pestaña. Pero candar +
-- pedirle al dueño "elegí qué pestañas clavar" no es inteligente: es tercerizarle la decisión. El
-- fusible (detección) debe seguir tonto y determinista para ser confiable; lo que pasa DESPUÉS de que
-- salta debe ser inteligente. Esta migración habilita esa capa:
--
--   1. La firma pasa a guardar el GRID que el OS dejó (no sólo el hash), para poder diffear celda por
--      celda contra lo que hay ahora. Sin grid previo, la reconciliación NO adivina: se queda con el
--      comportamiento actual (candado). Falla del lado seguro, igual que siempre.
--   2. Cada celda que el dueño cambió se clasifica (dato nuevo / fórmula corregida / override) y se
--      registra acá. Las 'activa' las RE-INYECTA el choke point sobre lo que produce el generador: el
--      generador regenera todo, pero esas celdas conservan el valor del dueño. Las 'pendiente' son
--      conflictos reales que generan UNA pregunta puntual por celda (no "elegí qué pestañas clavar").

-- ── 1. La firma guarda también el grid previo (para diffear) ──
alter table public.sheet_tab_firma add column if not exists grid jsonb;

comment on column public.sheet_tab_firma.grid is
  'El grid (A1:BZ, FORMULA) que el OS dejó escrito, para diffear celda por celda cuando el dueño edita. Null en filas viejas: sin él, la reconciliación no entiende el cambio y se queda con el candado (fail-closed).';

-- ── 2. El aprendizaje por celda: qué corrigió/cargó/pisó el dueño y qué hacemos ──
create table if not exists public.sheet_reconciliacion_celda (
  file_id      text        not null,
  pestana      text        not null,
  celda        text        not null,               -- A1 dentro de la pestaña, p.ej. "F12"
  valor_dueno  text,                               -- el valor/fórmula del dueño a preservar/re-inyectar
  valor_os     text,                               -- lo que el OS tenía (para la traza y la pregunta)
  causa        text        not null,               -- dato_nuevo | formula_corregida | override | conflicto
  accion       text        not null,               -- adoptar | aprender | preguntar
  estado       text        not null default 'activa', -- activa (se re-inyecta) | pendiente (pregunta) | resuelta
  pregunta     text,                               -- la pregunta puntual, cuando accion = preguntar
  detectado_en timestamptz not null default now(),
  resuelto_en  timestamptz,
  primary key (file_id, pestana, celda)
);

comment on table public.sheet_reconciliacion_celda is
  'Reconciliación celda por celda de las ediciones del dueño sobre pestañas derivadas del OS. Las activa se re-inyectan en el choke point (el generador no las pisa); las pendiente generan una pregunta puntual y mantienen la pestaña candada.';

create index if not exists sheet_reconciliacion_celda_activas
  on public.sheet_reconciliacion_celda (file_id, pestana) where estado = 'activa';

alter table public.sheet_reconciliacion_celda enable row level security;
drop policy if exists sheet_reconciliacion_celda_service on public.sheet_reconciliacion_celda;
create policy sheet_reconciliacion_celda_service
  on public.sheet_reconciliacion_celda for all to service_role using (true) with check (true);
