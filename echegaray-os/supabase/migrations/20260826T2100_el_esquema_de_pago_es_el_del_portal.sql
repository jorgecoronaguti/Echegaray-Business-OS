-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LAS TRES COLUMNAS QUE `esquema_pago` NECESITA PARA SER TAMBIÉN LA DEL PORTAL
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ESCRITA Y SIN APLICAR. Aplicarla es una decisión del dueño; el script de migración de datos
-- (`orquestador/scripts/migrar-portal-al-crm.mjs`) se niega a escribir mientras no exista.
--
-- ═══ POR QUÉ ═══
--
-- El 26/08/2026 el portal del cliente dejó de leer `pago_programado` —una tabla propia que duplicaba
-- el cronograma— y pasó a leer `esquema_pago`, que es donde la ficha del cliente (pantalla 32) lo
-- administra de verdad. Al hacerlo aparecieron tres datos que el portal muestra y que `esquema_pago`
-- no tiene dónde guardar. Se agregan acá, aditivo: ninguna columna existente cambia.
--
-- Todo lo demás del portal YA estaba: `visible_portal` y `publicado_at` deciden qué ve el cliente,
-- `orden` y `fecha` lo ordenan, `reparo` y `estado = 'retenido'` marcan el fondo de reparo.

-- ── 1 · LA MONEDA DE CADA LÍNEA ───────────────────────────────────────────────────────────────
--
-- El contrato de Quattropani (Salón Comercial) está en DÓLARES: U$S 63.000 + IVA, con nueve
-- certificaciones de U$S 4.235 cada una. Sin esta columna, sumar el esquema de ese cliente mete
-- dólares en un total en pesos y el resultado está mal por tres órdenes de magnitud, sin dar ningún
-- error. `cronograma.ts` ya sabe no sumar monedas distintas —cuenta esas líneas aparte y lo dice—
-- pero necesita que la fila declare en qué moneda está.
--
-- DEFAULT 'ARS' y NOT NULL: la moneda de una obligación no puede ser desconocida. Todas las filas de
-- hoy son pesos salvo las de Quattropani, que el script de migración marca explícitamente.
alter table public.esquema_pago add column if not exists moneda text not null default 'ARS'
  check (moneda in ('ARS', 'USD'));

comment on column public.esquema_pago.moneda is
  'ARS salvo que el contrato diga otra cosa (Quattropani es en USD). Sumar monedas distintas es un '
  'error que no da error: el total sale mal y con cara de dato cierto.';

-- ── 2 · LOS NÚMEROS DE COMPROBANTE ────────────────────────────────────────────────────────────
--
-- La pantalla de Facturas del portal es una lista de NÚMEROS: el cliente entra a buscar «FA
-- 01-00000228», no a mirar un cronograma. Y el recibo va pegado a su factura porque juntos responden
-- la única pregunta que se hace ahí: «¿ésta ya la pagué?».
--
-- NULLABLE los dos, y a propósito: un certificado acordado y todavía sin emitir NO tiene número de
-- factura, y un pago no cobrado no tiene recibo. Un texto vacío diría que existe un comprobante sin
-- número, que es otra cosa.
--
-- No son espejo del Sheet como `fecha`/`monto`/`medio`/`estado`: la pestaña Cobranzas no tiene una
-- columna de número de comprobante separada. Se cargan desde la app, y por eso entran al grant de
-- UPDATE de abajo.
alter table public.esquema_pago add column if not exists factura_numero text;
alter table public.esquema_pago add column if not exists recibo_numero  text;

comment on column public.esquema_pago.factura_numero is
  'Número del comprobante emitido. NULL = todavía no se emitió; el portal lo muestra en Pagos como '
  '«sin factura», no como una factura sin número.';
comment on column public.esquema_pago.recibo_numero is
  'Número del recibo del cobro. NULL = no cobrado o sin recibo cargado.';

-- ── 3 · UNA COLUMNA NUEVA NACE SIN PERMISO ────────────────────────────────────────────────────
--
-- `esquema_pago` no tiene GRANT de tabla entera para escribir: tiene GRANT POR COLUMNA. Una columna
-- agregada después queda fuera de esa lista y el INSERT rebota con «permission denied», que Next
-- muestra como un 404 — un error de permiso disfrazado de «no existe», la peor pista posible.
--
-- `select` es de tabla entera y ya está otorgado, así que las tres se leen solas.
grant insert (moneda, factura_numero, recibo_numero) on public.esquema_pago to authenticated;
grant update (moneda, factura_numero, recibo_numero) on public.esquema_pago to authenticated;
