-- LA HUELLA POR CELDA — evidencia POSITIVA de lo que el generador escribió, celda por celda.
--
-- POR QUÉ (05/08). El dueño: "no podés volver a escribir algo si yo ya lo borré, pasó en los dos cash
-- flows". `sheet_rotulos` guarda TEXTOS, y con un texto no se puede distinguir "lo borró él" de "nunca
-- existió" ni de "el rótulo lleva la fecha de hoy adentro". Medido sobre el Cash Flow Semanal: de 92
-- borrados registrados, 53 eran rótulos vivos en la pestaña que el dueño nunca borró.
--
-- Acá se guarda otra cosa: la POSICIÓN de cada celda que el generador escribió y la FORMA de lo que
-- puso (el contenido con fechas, importes y contadores enmascarados, para que "el mismo rótulo con
-- otra fecha" no cuente como cambio). Con eso el veredicto es determinístico:
--
--   huella propia + celda vacía hoy      → la vació el dueño   → el generador NO la vuelve a escribir
--   sin huella    + celda con contenido  → nunca fue del OS    → el generador NO la pisa
--
-- `borrada_en` es la decisión del dueño y NO se limpia con el barrido de cada corrida: sólo se levanta
-- cuando esa celda vuelve a tener contenido. Si se limpiara con el resto, la celda volvería sola.

create table if not exists public.sheet_huella_celda (
  file_id    text not null,
  pestana    text not null,
  fila       int  not null,
  col        int  not null,
  forma      text not null,
  huella     text not null,
  borrada_en timestamptz,
  escrito_en timestamptz not null default now(),
  primary key (file_id, pestana, fila, col)
);

create index if not exists sheet_huella_celda_tab on public.sheet_huella_celda (file_id, pestana);

comment on table public.sheet_huella_celda is
  'Huella por celda de la última escritura propia de cada generador: posición + forma normalizada. Prueba que una celda es del OS, y por lo tanto que si hoy está vacía la vació el dueño. borrada_en = el dueño la vació y no se vuelve a escribir.';
comment on column public.sheet_huella_celda.forma is
  'Contenido con las partes variables enmascaradas (<F> fecha, <$> importe, <%> porcentaje, <N> número). Inmune al contenido variable: un rótulo con la fecha de hoy adentro tiene la misma forma todos los días.';

alter table public.sheet_huella_celda enable row level security;
drop policy if exists sheet_huella_celda_service on public.sheet_huella_celda;
create policy sheet_huella_celda_service on public.sheet_huella_celda for all to service_role using (true) with check (true);
