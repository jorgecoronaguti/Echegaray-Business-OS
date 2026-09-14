-- 20260915T0510 · HORAS Y HS NEGRO SE CORRIGEN A MANO
--
-- ⚠ ESCRITA Y **NO APLICADA**. La aplica una persona desde main. Hasta entonces «Horas» y «Hs negro» se dibujan de
-- sólo lectura: `camposGuardables()` mira las columnas que la base realmente tiene.
--
-- Dueño, 15/09/2026: «todas las celdas editables». Después de 20260915T0300 las únicas derivadas del cuadro eran
-- Horas (el total de la fila) y Hs negro.
--
-- ═══ POR QUÉ `horas_manual` Y NO `horas` ═══
--
-- `liquidacion_linea.horas` es la cifra SELLADA: `cerrarQuincena` la escribe en cada línea que congela (sondeo del
-- 15/09/2026: 274 de 274 líneas cerradas la tienen, 0 de las abiertas). Usarla también como override hacía que, al
-- reabrir una quincena, las horas selladas volvieran como «escritas a mano» sin que nadie las escribiera. Sin
-- líneas abiertas con `horas`, no hay nada que copiar: esta migración no mueve datos.
--
-- ═══ NULL = SIN CORRECCIÓN ═══
--
-- `horas_manual` NULL: mandan los días. Con número: recalcula blanco estimado, Hs negro, negro y total, salvo lo que
-- ya esté escrito; si difiere de la suma de los días, la pantalla avisa en ámbar y se guarda igual.
-- `horas_negro_manual` NULL: manda el cálculo (horas − horas del recibo). Con número: Importe negro = Hs negro ×
-- $/h negro, salvo que `negro_manual` también esté escrito.
--
-- ═══ EL GRANT NO SE AMPLÍA, Y ES A PROPÓSITO ═══
--
-- Igual que `negro_manual` y `horas_recibo_manual`: `authenticated` NO recibe UPDATE sobre estas columnas. Las escribe
-- `guardarCeldaLiquidacion` con la clave de servicio, DESPUÉS de preguntar `liquidaSueldos` y de releer que la
-- quincena esté abierta.

alter table public.liquidacion_linea
  add column if not exists horas_manual numeric(8,2),
  add column if not exists horas_negro_manual numeric(8,2);

-- UNAS HORAS NEGATIVAS NO SON UNA CORRECCIÓN: son un error de tipeo que liquidaría mal.
alter table public.liquidacion_linea
  drop constraint if exists liquidacion_linea_horas_manual_no_negativa,
  add constraint liquidacion_linea_horas_manual_no_negativa
    check (horas_manual is null or horas_manual >= 0),
  drop constraint if exists liquidacion_linea_horas_negro_manual_no_negativa,
  add constraint liquidacion_linea_horas_negro_manual_no_negativa
    check (horas_negro_manual is null or horas_negro_manual >= 0);

comment on column public.liquidacion_linea.horas_manual is
  'HORAS de la quincena escritas a mano. NULL = mandan los días. No es `horas` (la sellada del cierre). Recalcula blanco estimado, Hs negro, negro y total salvo lo escrito.';
comment on column public.liquidacion_linea.horas_negro_manual is
  'HS NEGRO escritas a mano. NULL = manda el cálculo. Importe negro = esto × $/h negro, salvo negro_manual.';
