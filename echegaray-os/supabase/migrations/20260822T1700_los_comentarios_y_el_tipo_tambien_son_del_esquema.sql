-- ═══ LOS COMENTARIOS Y EL TIPO TAMBIÉN SON DEL ESQUEMA (22/08/2026) ═══
--
-- El comparador estricto del auditor de reproducibilidad encontró tres restos de drift que el
-- comparador original no miraba, y esta migración forward-only los converge en las dos direcciones:
--
--   1 · `banco_saldo_declarado.saldo` nació en producción como numeric(16,2) y la constancia
--       (20260822T1500) lo escribió como numeric a secas. En producción este ALTER es un no-op;
--       en una base reconstruida deja el tipo EXACTO.
--   2 · Tres comentarios de tabla existían sólo en producción (los escribieron los creadores de
--       runtime, por fuera de la cadena): acá quedan con constancia.
--   3 · Seis comentarios que la cadena define se habían PERDIDO en producción (los objetos se
--       recrearon por fuera en algún momento): acá se restauran — el texto es el de la migración
--       que los definió, verbatim.

alter table public.banco_saldo_declarado alter column saldo type numeric(16,2);

-- ── los tres que producción tenía y la cadena no ──
comment on table public.banco_saldo_declarado is
  'La línea "Saldo al DD/MM/AAAA" del extracto del Santander: cuánta plata declara el banco a esa fecha, incluidos los movimientos del día que el detalle todavía lista sin saldo corrido. Lo consume _BANCO_RAW (rangos con nombre SALDO_BANCO_DECLARADO / SALDO_BANCO_FECHA) y de ahí la disponibilidad de CAJA.';
comment on table public.chequeras is
  'Padrón de chequeras físicas de Echegaray (cuenta 179-091383/6). Marco para detectar cheques faltantes: qué chequeras hay y qué rango cubren. Los números USADOS viven en el Sheet Cheques Emitidos, no acá — se referencian, no se copian. Lo no verificado queda DESCONOCIDO.';
comment on table public.migracion_aplicada is
  'Qué migraciones corrió esta base. El hash es del archivo tal como se aplicó: si alguien lo edita después, deja de coincidir y aplicar-migracion.mjs --estado lo dice.';

-- ── los seis que la cadena define y producción había perdido ──
comment on column orq.chat_cost.motivo is
  'Motivo de la eleccion de modelo (para analizar el costo por tipo de operacion y decidir que mover a haiku/0-API).';
comment on table public.caja_conteo_observado is
  'Centinela de celdas que tipea una persona: qué valor vio el OS y desde cuándo. El momento del conteo es el intervalo (previo_visto_en, visto_desde]; su ancho es el período del timer, no una precisión real.';
comment on column public.caja_conteo_observado.previo_visto_en is
  'Última corrida que vio el valor ANTERIOR. Borde izquierdo del intervalo en que se tipeó el conteo. NULL = no hay marca previa: el intervalo queda abierto y se dice así.';
comment on column public.caja_conteo_observado.visto_desde is
  'Primera corrida que vio ESTE valor. Es el ancla del cálculo de efectivo: los movimientos posteriores descargan el cajón desde acá.';
comment on view public.obra_costo_real is
  'FUENTE ÚNICA del costo real por obra canónica. La consumen web, chat y cualquier otra herramienta del OS. No recalcular este concepto en ninguna cara: ver orquestador/scripts/canario-fuente-unica.mjs.';
comment on column public.sheet_huella_celda.abandonada_en is
  'El generador ocupó esta celda y su layout actual ya no la ocupa. Junto con forma, es la prueba de que un residuo publicado en esa coordenada es propio y se puede limpiar. NULL = la ocupo hoy, o nunca la ocupé.';
