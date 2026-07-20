-- OPERATING REVIEW — la estructura que convierte hallazgo en decisión con dueño y fecha.
--
-- Hoy el OS DETECTA bien y ahí se corta: al 20/07 hay 11 acciones abiertas de los especialistas
-- sólo en Administración y Finanzas (deuda ARCA vencida, echeqs de ARCOR sin evidencia de cobro,
-- 3 totales de deuda a proveedores distintos en la misma hoja) que nadie consumió. Detectar no
-- cobra ni paga: falta el paso donde un hallazgo se mira contra lo esperado, se le busca la causa
-- y sale una decisión con responsable y fecha.
--
-- Estructura obligatoria del CLAUDE.md raíz, respetada tal cual:
--   resultado esperado → resultado real → desvío → causa → impacto → decisión → responsable →
--   fecha → resultado posterior
--
-- NO se inventa nada: un review nace VACÍO y se llena con los hallazgos que ya existen en
-- acciones/backlog_autonomo. Los campos de análisis (causa, decisión) los completa una persona o
-- el OS con evidencia; quedan NULL hasta entonces y eso se ve.

create table if not exists public.operating_reviews (
  id            uuid primary key default gen_random_uuid(),
  area          text not null references public.area_canonica(clave),
  periodo_desde date not null,
  periodo_hasta date not null,
  estado        text not null default 'abierta',   -- abierta | cerrada
  -- Contexto económico del período, tomado de las fuentes únicas al abrir el review. Se guarda
  -- para poder comparar contra el próximo: sin foto no hay "esperado vs real".
  snapshot      jsonb,
  conclusion    text,                               -- la lectura integrada, al cerrar
  fecha_cierre  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists operating_reviews_area_idx on public.operating_reviews (area, periodo_hasta desc);

comment on table public.operating_reviews is
  'Revisión operativa por área: esperado vs real → causa → decisión → responsable → fecha. Convierte hallazgos ya detectados en decisiones.';

-- Cada punto del review. Un hallazgo entra acá y NO sale hasta tener decisión o descarte explícito.
create table if not exists public.operating_review_puntos (
  id                uuid primary key default gen_random_uuid(),
  review_id         uuid not null references public.operating_reviews(id) on delete cascade,
  -- De dónde vino el hallazgo. Se referencia, no se copia el texto como verdad nueva.
  origen_tabla      text,                      -- acciones | backlog_autonomo | (manual)
  origen_id         text,
  titulo            text not null,
  -- La estructura del CLAUDE.md. NULL = todavía no se analizó, y se ve como tal.
  resultado_esperado text,
  resultado_real     text,
  desvio_monto       numeric,                  -- el impacto en $ cuando se puede medir
  causa              text,
  impacto            text,
  decision           text,
  responsable        text,
  fecha_limite       date,
  resultado_posterior text,                    -- se completa en el review siguiente
  estado            text not null default 'pendiente',  -- pendiente | decidido | descartado | cerrado
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists orp_review_idx on public.operating_review_puntos (review_id, estado);

comment on table public.operating_review_puntos is
  'Un punto del review. Sin decision+responsable+fecha_limite NO se considera resuelto: detectar no es decidir.';

comment on column public.operating_review_puntos.desvio_monto is
  'Impacto en $ cuando la evidencia lo permite. NULL = no cuantificable con lo que hay, NO cero.';

-- ── RLS, mismo criterio que el resto (20260719170000) ──
alter table public.operating_reviews enable row level security;
drop policy if exists operating_reviews_select on public.operating_reviews;
create policy operating_reviews_select on public.operating_reviews for select to authenticated using (true);
drop policy if exists operating_reviews_write on public.operating_reviews;
create policy operating_reviews_write on public.operating_reviews for all to authenticated using (true) with check (true);

alter table public.operating_review_puntos enable row level security;
drop policy if exists orp_select on public.operating_review_puntos;
create policy orp_select on public.operating_review_puntos for select to authenticated using (true);
drop policy if exists orp_write on public.operating_review_puntos;
create policy orp_write on public.operating_review_puntos for all to authenticated using (true) with check (true);
