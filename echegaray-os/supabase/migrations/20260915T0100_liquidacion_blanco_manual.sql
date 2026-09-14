-- 20260915T0100 · LAS HORAS DEL RECIBO Y EL $/H DE CATEGORÍA SE CORRIGEN A MANO
--
-- ⚠ ESCRITA Y **NO APLICADA**. La aplica una persona desde main. Hasta entonces las dos celdas se dibujan
-- de sólo lectura: `camposGuardables()` mira las columnas que la base realmente tiene.
--
-- Dueño, 14/09/2026: *«dejame editable las h/recibo tb quiero mover los numeros como desee en liq hs»*. El
-- cuadro de la quincena abierta muestra el BLANCO (horas del recibo, $/h de categoría, neto) y el NEGRO. El
-- neto ya tiene dónde guardarse (`por_banco_manual`); las horas del recibo y el $/h de categoría, no.
--
-- ═══ NULL = SIN CORRECCIÓN ═══
--
-- Mismo modelo que las `*_manual` de 20260909T1740: NULL dice «manda el recibo (o el estimado)», y un número
-- es lo que alguien escribió. Precedencia en `sueldoBlancoNegro`: manual > recibo real > estimado.
--
-- ═══ EL GRANT NO SE AMPLÍA, Y ES A PROPÓSITO ═══
--
-- Igual que `adelanto_manual` y `por_banco_manual`: `authenticated` NO recibe UPDATE sobre estas columnas.
-- Las escribe `guardarCeldaLiquidacion` con la clave de servicio, DESPUÉS de preguntar `liquidaSueldos` y de
-- releer que la quincena esté abierta. Abrir el grant dejaría reescribir sueldos con cualquier sesión válida.

alter table public.liquidacion_linea
  add column if not exists horas_recibo_manual      numeric(8,2),
  add column if not exists valor_hora_recibo_manual numeric(14,2);

-- UNA CANTIDAD NEGATIVA NO ES UNA CORRECCIÓN: es un error de tipeo que liquidaría mal.
alter table public.liquidacion_linea
  drop constraint if exists liquidacion_linea_horas_recibo_manual_no_negativa,
  add constraint liquidacion_linea_horas_recibo_manual_no_negativa
    check (horas_recibo_manual is null or horas_recibo_manual >= 0),
  drop constraint if exists liquidacion_linea_valor_hora_recibo_manual_no_negativo,
  add constraint liquidacion_linea_valor_hora_recibo_manual_no_negativo
    check (valor_hora_recibo_manual is null or valor_hora_recibo_manual >= 0);

comment on column public.liquidacion_linea.horas_recibo_manual is
  'HORAS DEL RECIBO (blanco) escritas a mano. NULL = manda recibo_sueldo_linea.horas_blanco, o la mitad de las horas si no hay recibo. Mueve las horas y el importe del negro; el neto NO se recalcula solo.';
comment on column public.liquidacion_linea.valor_hora_recibo_manual is
  '$/H DE CATEGORÍA (blanco) escrito a mano. NULL = manda recibo_sueldo_linea.valor_hora, o el piso vigente de la categoría si no hay recibo. Mueve el bruto; el neto NO se recalcula solo.';
