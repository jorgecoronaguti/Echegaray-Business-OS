-- 20260909T1740 · SEIS COLUMNAS PARA GUARDAR LO QUE EL DUEÑO ESCRIBE A MANO
--
-- ⚠ ESCRITA Y **NO APLICADA**. La aplica una persona; hasta entonces la pantalla dibuja esas seis
-- celdas como sólo lectura (`camposGuardables()` mira `information_schema` y decide sola). Una
-- migración en el repo no es una migración aplicada, y este archivo no se corre desde un agente.
--
-- ═══ POR QUÉ COLUMNAS NUEVAS Y NO LAS QUE YA ESTÁN ═══
--
-- Dueño, 09/09/2026: *«quiero más editables todas esas filas y columnas»*. `cobra`, `adelanto`,
-- `ya_transferido`, `por_banco`, `en_efectivo` y `total` YA EXISTEN, pero nacieron
-- `not null default 0` para guardar LA FOTO DEL CIERRE, y eso las inhabilita para guardar un
-- override por dos razones distintas:
--
--   1. **UN 0 AHÍ NO PUEDE DECIR «VACÍO».** El override tiene tres estados —sin escribir, escrito
--      en 0, escrito en otro número— y esas columnas sólo pueden representar dos. Peor: la fila que
--      crea `guardarEfectivoRedondeado` las deja en 0, así que TODA fila con redondeo escrito
--      pasaría a estar «pisada en cero» y la pantalla liquidaría a esa gente en $ 0 sin que nadie
--      lo haya escrito. Es el defecto de «recibo sin liquidación nunca es $ 0», con otra ropa.
--   2. **EL CHECK `total = por_banco + en_efectivo` ES DE LA FOTO, y tiene que seguir siéndolo.**
--      Un TOTAL escrito a mano que no cierra con la suma es legítimo —su edición es la verdad
--      definitiva— pero lo que se congela al cerrar no puede dejar de cuadrar. Las dos cosas sólo
--      conviven si viven en columnas distintas.
--
-- `horas` y `valor_hora` NO están acá: ya son nullable y NULL alcanza para decir «nadie la
-- escribió». `horas` es la única celda calculada que se puede pisar hoy sin esta migración.
--
-- ═══ EL GRANT NO SE AMPLÍA, Y ES A PROPÓSITO ═══
--
-- `authenticated` sigue con UPDATE sólo sobre `efectivo_redondeado`. Estas seis las escribe la
-- server action con la clave de servicio, DESPUÉS de preguntar `liquidaSueldos` y de releer que la
-- quincena esté abierta. Ampliar el grant abriría la reescritura de sueldos a cualquier llamada
-- directa a PostgREST con una sesión válida — que es justo lo que el grant por columna evita.

alter table public.liquidacion_linea
  add column if not exists cobra_manual          numeric(14,2),
  add column if not exists adelanto_manual       numeric(14,2),
  add column if not exists ya_transferido_manual numeric(14,2),
  add column if not exists por_banco_manual      numeric(14,2),
  add column if not exists en_efectivo_manual    numeric(14,2),
  add column if not exists total_manual          numeric(14,2);

comment on column public.liquidacion_linea.cobra_manual is
  'COBRA escrito a mano. NULL = no hay override y manda el cálculo (horas × $/h). Un 0 acá SÍ es una afirmación del dueño.';
comment on column public.liquidacion_linea.adelanto_manual is
  'ADELANTO escrito a mano. Hoy es la ÚNICA fuente posible: el adelanto en efectivo no deja movimiento bancario y no tiene tabla.';
comment on column public.liquidacion_linea.ya_transferido_manual is
  'YA TRANSFERIDO escrito a mano. NULL = manda lo que dice el extracto (nomina_adelanto).';
comment on column public.liquidacion_linea.por_banco_manual is
  'POR BANCO escrito a mano. NULL = manda el recibo confirmado contra el lote del extracto.';
comment on column public.liquidacion_linea.en_efectivo_manual is
  'EN EFECTIVO escrito a mano. NULL = manda COBRA − ADELANTO − YA TRANSFERIDO − POR BANCO.';
comment on column public.liquidacion_linea.total_manual is
  'TOTAL escrito a mano. NULL = manda POR BANCO + EN EFECTIVO. Puede NO cerrar con la suma: la edición manual es la verdad definitiva y la pantalla la marca.';
