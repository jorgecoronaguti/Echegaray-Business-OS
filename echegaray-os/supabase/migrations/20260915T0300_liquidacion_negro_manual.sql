-- 20260915T0300 · EL IMPORTE NEGRO SE CORRIGE A MANO
--
-- ⚠ ESCRITA Y **NO APLICADA**. La aplica una persona desde main. Hasta entonces la celda «Importe» del negro se
-- dibuja de sólo lectura: `camposGuardables()` mira las columnas que la base realmente tiene.
--
-- Dueño, 15/09/2026: *«dejame editable todas las columnas de dinero de la seccion liquidacion en liq hs»*. Cobra
-- total y Total efectivo ya tienen dónde guardarse (`cobra_manual`, `en_efectivo_manual`, de 20260909T1740); el
-- importe del negro, no. `total_manual` NO sirve: guarda banco + efectivo, que no es una columna del cuadro.
--
-- ═══ NULL = SIN CORRECCIÓN ═══
--
-- NULL dice «manda el cálculo» (horas que el recibo no paga × $/h negro). Un número es lo que alguien escribió.
-- Con el negro manual, Cobra total = Banco + negro manual, salvo que Cobra total también esté escrita.
--
-- ═══ EL GRANT NO SE AMPLÍA, Y ES A PROPÓSITO ═══
--
-- Igual que `cobra_manual` y `horas_recibo_manual`: `authenticated` NO recibe UPDATE sobre esta columna. La
-- escribe `guardarCeldaLiquidacion` con la clave de servicio, DESPUÉS de preguntar `liquidaSueldos` y de releer
-- que la quincena esté abierta.

alter table public.liquidacion_linea
  add column if not exists negro_manual numeric(14,2);

-- UN IMPORTE NEGATIVO NO ES UNA CORRECCIÓN: es un error de tipeo que liquidaría mal.
alter table public.liquidacion_linea
  drop constraint if exists liquidacion_linea_negro_manual_no_negativo,
  add constraint liquidacion_linea_negro_manual_no_negativo
    check (negro_manual is null or negro_manual >= 0);

comment on column public.liquidacion_linea.negro_manual is
  'IMPORTE NEGRO escrito a mano. NULL = manda el cálculo (horas que el recibo no paga × $/h negro). Mueve Cobra total salvo que esté escrita; si la fila deja de cerrar, la pantalla lo marca.';
