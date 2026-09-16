-- 20260915T2340 · LO QUE SE LE PAGÓ DE VERDAD, Y LA CUENTA QUE ESCRIBIÓ QUIEN LO ESCRIBIÓ
--
-- ⚠ ESCRITA Y **NO APLICADA**. La aplica una persona desde main. Hasta entonces las celdas «Pagado» se dibujan de
-- sólo lectura y las fórmulas se guardan como el número que dieron: `camposGuardables()` y `hayColumnaDeFormulas`
-- miran las columnas que la base REALMENTE tiene, no los archivos de `migrations/`.
--
-- Dueño, 15/09/2026, textual: *«necesito al lado de banco y negro lo que se le ha pagado efectivamente y que vaya
-- restando al total o incrementando en el otro llegado el caso; así no sirve, rehacer — pésimo: no considera
-- adelantos en efectivo y resta del efectivo total»*.
--
-- ═══ POR QUÉ HACEN FALTA DOS COLUMNAS Y NO ALCANZAN LAS QUE YA ESTÁN ═══
--
-- `adelanto_manual` y `ya_transferido_manual` (20260909T1740) guardan ESLABONES DE UNA RESTA: lo que se descuenta
-- del cobra antes de repartirlo entre banco y efectivo. No son «lo pagado»: un giro del lote de haberes ya
-- entregado NO es un adelanto, y sin embargo baja el saldo igual. Reusarlas obligaría a que «pagado» y «adelanto»
-- fueran la misma afirmación, y son dos —la primera es un hecho de tesorería, la segunda una decisión sobre cómo
-- se compone el sueldo—. `pagado_banco` y `pagado_efectivo` arrancan CALCULADAS desde los adelantos (el valor
-- inicial es lo que ya se entregó) y se corrigen a mano cuando alguien registra un pago más.
--
-- ═══ LOS SALDOS NO SE PERSISTEN ═══
--
-- saldo = corresponde − pagado, y «corresponde» se recalcula en cada lectura (el neto del recibo puede llegar
-- mañana, las horas pueden corregirse hoy). Guardar el saldo congelaría hoy una resta que cambia sola y dejaría
-- dos respuestas a «cuánto falta pagarle». La cuenta vive en `pagoDeLaQuincena.ts`, pura y con sus tests.
--
-- ═══ `formulas`: LA CUENTA SE GUARDA AL LADO DEL RESULTADO ═══
--
-- *«la planilla de liq de hs tiene que poder calcular dentro de las celdas, como hace sheet»*. El resultado va en
-- la columna de siempre —es lo que se paga y lo que suma el pie— y la expresión va acá, en un objeto
-- `{ campo: "=340909,09+197272,73" }`. Guardar sólo el número dejaría una celda que nadie puede explicar después
-- frente al recibo; guardar sólo la fórmula obligaría a evaluarla en cada consulta y en cada motor que lea esta
-- tabla. Se guardan las dos, y la que manda para la plata es SIEMPRE el número.
--
-- ═══ EL GRANT NO SE AMPLÍA, Y ES A PROPÓSITO ═══
--
-- Igual que `negro_manual`, `horas_manual` y `horas_recibo_manual`: `authenticated` NO recibe UPDATE sobre estas
-- columnas. El GRANT de esta tabla sigue acotado a `efectivo_redondeado`, que es lo que impide que alguien con
-- una sesión válida reescriba lo pagado llamando a PostgREST a mano. Las escribe `guardarCeldaLiquidacion` con la
-- clave de servicio, DESPUÉS de preguntar `liquida_sueldos()` y de releer que la quincena esté abierta. La RLS de
-- `liquidacion_linea` no se toca: sigue siendo la de 20260909T1200 + `liquidacion_linea_edita_abierta`.

alter table public.liquidacion_linea
  add column if not exists pagado_banco    numeric(14,2),
  add column if not exists pagado_efectivo numeric(14,2),
  add column if not exists formulas        jsonb not null default '{}'::jsonb;

-- UN PAGO NEGATIVO NO ES UNA DEVOLUCIÓN: es un error de tipeo que inflaría el saldo. Una devolución se carga
-- bajando el pagado, no escribiendo un menos.
alter table public.liquidacion_linea
  drop constraint if exists liquidacion_linea_pagado_banco_no_negativo,
  add constraint liquidacion_linea_pagado_banco_no_negativo
    check (pagado_banco is null or pagado_banco >= 0),
  drop constraint if exists liquidacion_linea_pagado_efectivo_no_negativo,
  add constraint liquidacion_linea_pagado_efectivo_no_negativo
    check (pagado_efectivo is null or pagado_efectivo >= 0),
  -- `formulas` ES UN OBJETO, NO UN ARRAY NI UN NÚMERO: un jsonb sin forma sería imposible de leer sin adivinar.
  drop constraint if exists liquidacion_linea_formulas_es_objeto,
  add constraint liquidacion_linea_formulas_es_objeto
    check (jsonb_typeof(formulas) = 'object');

comment on column public.liquidacion_linea.pagado_banco is
  'LO TRANSFERIDO DE VERDAD en esta quincena (adelantos por banco, embargos, giros registrados). NULL = manda lo calculado desde los adelantos. Saldo banco = neto del recibo − esto; si queda negativo, el exceso se descuenta del efectivo.';
comment on column public.liquidacion_linea.pagado_efectivo is
  'LO ENTREGADO EN MANO de verdad en esta quincena, adelantos incluidos. NULL = manda lo calculado desde los adelantos. Saldo efectivo = negro − esto; si queda negativo, el exceso se descuenta del banco. NO es un descuento del sueldo: es un pago.';
comment on column public.liquidacion_linea.formulas is
  'La CUENTA que escribió una persona en cada celda editable, por campo: {"pagadoEfectivo": "=340909,09+197272,73"}. El valor evaluado vive en la columna del campo y es el que manda para la plata; esto existe para poder reabrir la celda y ver de dónde salió.';
