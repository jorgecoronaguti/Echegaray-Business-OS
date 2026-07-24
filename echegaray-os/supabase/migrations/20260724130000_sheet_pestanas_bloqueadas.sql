-- CANDADO DE PESTAÑA — la decisión del dueño sobre una pestaña entera es definitiva.
--
-- POR QUÉ (24/07). La preservación existente es de nivel CELDA/RÓTULO: protege textos que el dueño
-- cambió, columnas y notas que agregó. Pero NO puede honrar una reescritura ESTRUCTURAL entera de una
-- pestaña (nuevo orden, nuevas secciones, eliminación de bloques): cada generador es dueño de su
-- pestaña y la regenera cada 2h reimponiendo su diseño. El dueño lo dijo sin ambigüedad: "toda
-- modificación manual (texto, estructura, nombres, orden, eliminaciones, criterios o diseño) es
-- definitiva; adaptá el resto a ella". El único mecanismo a la altura de esa regla es un candado por
-- pestaña: cuando el dueño toma una pestaña, NINGÚN generador la vuelve a tocar.
--
-- Es la fuente única de qué pestañas están bajo control del dueño. La consultan el runner del timer
-- (saltea el generador), el portón de escritura (se niega a escribir) y los escritores por rango.

create table if not exists public.sheet_pestanas_bloqueadas (
  file_id      text        not null,
  pestana      text        not null,
  motivo       text,
  bloqueada_por text,
  bloqueada_en timestamptz not null default now(),
  primary key (file_id, pestana)
);

comment on table public.sheet_pestanas_bloqueadas is
  'Pestañas que el dueño tomó bajo su control: ningún generador del OS las escribe. Fuente única del candado.';

alter table public.sheet_pestanas_bloqueadas enable row level security;

-- El OS opera con la service key (bypassa RLS). La política explícita deja la puerta cerrada para
-- cualquier rol anónimo/autenticado: esta tabla es control interno, no dato de la app.
drop policy if exists sheet_pestanas_bloqueadas_service ON public.sheet_pestanas_bloqueadas;
create policy sheet_pestanas_bloqueadas_service
  on public.sheet_pestanas_bloqueadas
  for all
  to service_role
  using (true)
  with check (true);
