-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA RETENCIÓN NO ES UNA ORDEN DE PAGO, Y EL MISMO PDF REENVIADO NO ES OTRO DOCUMENTO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- MEDIDO el 10/09/2026 sobre `public.cliente_orden` (16 filas por la mañana, 42 después de la carga
-- del histórico de rodrigo@):
--
--   · doce filas son CERTIFICADOS DE RETENCIÓN que Messina manda junto con el pago
--     (`O_P_0000000004865_G00002208.pdf`): citan el número de la orden, no traen importe propio, y
--     quedaron guardados unos como `orden_pago` —la cartera declaraba dos pagos donde hubo uno, una
--     afirmación falsa sobre plata cobrada— y otros como `otro`, que no dice qué son.
--   · el importador leía UNA casilla (jorge@, que arranca en 07/2026) y las órdenes originales
--     llegan a rodrigo@ (8.186 mensajes desde 2021). Al leer las dos, el MISMO adjunto entra dos
--     veces: rodrigo lo recibe de Messina y lo reenvía a jorge, y la clave de idempotencia
--     `(message_id, nombre_archivo, tamano_bytes)` no puede verlo porque son dos mensajes.
--
-- ═══ QUÉ AGREGA, Y POR QUÉ LA REGLA NO SE ESCRIBE EN SQL ═══
--
-- El número canónico de una orden («00002-00002162», «OC 02- 00002162» y «02-00002097» son la misma
-- identidad) lo define `numeroCanonico()` en `orquestador/lib/ordenes-cliente.mjs`, con sus pruebas.
-- Escribirlo otra vez como función SQL inmutable para un índice por expresión crearía la SEGUNDA
-- definición del mismo concepto, y el día que una cambie la otra seguiría mintiendo en silencio.
-- Por eso la columna `numero_canonico` se ESCRIBE desde el OS y la base sólo la hace única: una
-- definición, un guardián.
--
-- ═══ SE PUEDE APLICAR SOBRE LOS DATOS DE HOY ═══
--
-- Los dos índices únicos nuevos son PARCIALES sobre columnas que hoy son NULL en todas las filas,
-- así que no hay conflicto al crearlos. El punto 7 reclasifica los certificados por su nombre; el
-- número propio de cada uno lo escribe después `reatribuir-ordenes-clientes.mjs --aplicar`, que
-- relee el PDF del bucket.

-- ── 1. LA RETENCIÓN ES UN TIPO ──────────────────────────────────────────────────────────────────
alter table public.cliente_orden drop constraint if exists cliente_orden_tipo_check;
alter table public.cliente_orden add constraint cliente_orden_tipo_check
  check (tipo in ('orden_compra', 'orden_pago', 'retencion', 'factura', 'otro'));

comment on column public.cliente_orden.tipo is
  'orden_compra / orden_pago = lo emitió el CLIENTE. retencion = certificado de retención impositiva '
  'que acompaña al pago: prueba un impuesto retenido, NUNCA suma como una orden. factura = comprobante '
  'nuestro que cita la orden: es evidencia de la obra, no una orden. otro = el adjunto que vino en el mismo mail.';

-- ── 2. CÓMO SE SUPO DE QUIÉN ES ─────────────────────────────────────────────────────────────────
--
-- Las dos vías nuevas son las FUERTES, y por eso importa que queden distinguidas de `texto`:
--   · `cuit`    → el CUIT impreso en el PDF coincide con `public.clientes.cuit`. Es prueba, no
--                 deducción, y es lo que atribuye NUESTRA factura por el CUIT del RECEPTOR.
--   · `archivo` → la forma del nombre con que el sistema del cliente emite (`OC_32_…`, `6A_5…`).
alter table public.cliente_orden drop constraint if exists cliente_orden_atribucion_check;
alter table public.cliente_orden add constraint cliente_orden_atribucion_check
  check (atribucion in ('remitente', 'cuit', 'archivo', 'texto', 'manual'));

comment on column public.cliente_orden.atribucion is
  'remitente = lo prueba el dominio del mail · cuit = lo prueba el CUIT impreso en el PDF contra el '
  'padrón · archivo = la firma del nombre con que emite ese cliente · texto = deducido del asunto de '
  'un reenvío interno · manual = lo afirmó una persona.';

-- ── 3. DE QUÉ CASILLA VINO ──────────────────────────────────────────────────────────────────────
--
-- No es cosmético: cuando una orden aparece o falta, la primera pregunta es en qué buzón se buscó.
-- Con una sola casilla la respuesta era obvia y no hacía falta guardarla; con dos, dejó de serlo.
alter table public.cliente_orden add column if not exists casilla text
  check (casilla is null or casilla ~ '^[^@[:space:]]+@[^@[:space:]]+$');

comment on column public.cliente_orden.casilla is
  'La casilla de Gmail donde el OS encontró este adjunto. NULL = se cargó antes de que se leyeran dos.';

-- ── 4. EL MISMO ARCHIVO NO ENTRA DOS VECES ──────────────────────────────────────────────────────
--
-- SHA-256 de los BYTES. Es certeza, no parecido: un reenvío no toca el adjunto. La unicidad va por
-- cliente y no global a propósito — dos clientes distintos pueden mandar el mismo formulario en
-- blanco, y eso son dos papeles.
alter table public.cliente_orden add column if not exists hash_sha256 text
  check (hash_sha256 is null or hash_sha256 ~ '^[0-9a-f]{64}$');

create unique index if not exists cliente_orden_hash_idx
  on public.cliente_orden (cliente_id, hash_sha256)
  where hash_sha256 is not null;

comment on column public.cliente_orden.hash_sha256 is
  'SHA-256 de los bytes del adjunto. La clave (message_id, nombre, tamaño) no ve el mismo PDF llegando '
  'por dos casillas: son dos mensajes. Ésta sí.';

-- ── 5. LA MISMA ORDEN NO ENTRA DOS VECES, AUNQUE EL PDF SEA OTRO ────────────────────────────────
--
-- El cliente reemite la orden y el PDF cambia de metadatos: mismos datos, otro hash. Lo que no
-- cambia es la identidad de la orden — (cliente, tipo, número canónico) —.
--
-- SÓLO CON NÚMERO. Dos papeles sin número no son el mismo papel, y unirlos por «ninguno de los dos
-- tiene número» sería el peor de los inventos. Por eso el índice es parcial y lo escribe el OS con
-- la única definición que existe de «número canónico».
--
-- `eliminado_en is null` adentro del índice: dar de baja una orden y volver a bajarla es una
-- decisión legítima, y un índice que no lo contemple la bloquearía para siempre.
alter table public.cliente_orden add column if not exists numero_canonico text
  check (numero_canonico is null or length(btrim(numero_canonico)) between 1 and 60);

create unique index if not exists cliente_orden_numero_unico_idx
  on public.cliente_orden (cliente_id, tipo, numero_canonico)
  where numero_canonico is not null and eliminado_en is null;

comment on column public.cliente_orden.numero_canonico is
  'El número de la orden sin ceros a la izquierda («2-2162»). Lo escribe numeroCanonico() de '
  'orquestador/lib/ordenes-cliente.mjs — UNA definición; la base sólo lo hace único.';

-- ── 6. RLS NO ES GRANT, Y UNA COLUMNA NUEVA NACE SIN PERMISO ────────────────────────────────────
--
-- El grant de lectura de esta tabla es de tabla entera y ya cubre las tres columnas nuevas; se
-- repite igual para que el día que alguien lo acote por columna, esta migración siga diciendo la
-- verdad sobre quién lee qué. El de escritura sigue siendo sólo del service_role: el escritor es el
-- script del OS y desde la web lo único posible sigue siendo la baja lógica.
grant select on public.cliente_orden to authenticated;
grant select, insert, update, delete on public.cliente_orden to service_role;

-- ── 7. LAS FILAS QUE YA ESTÁN GUARDADAS COMO OTRA COSA ──────────────────────────────────────────
--
-- Al 10/09/2026 hay doce certificados de retención en la tabla, cargados como `otro` (los cuatro
-- primeros habían entrado como `orden_pago`, duplicando la OP). Todos tienen la firma con que
-- Messina los emite: `O_P_<orden>_G<certificado>.pdf`. Se reclasifican acá —es una afirmación sobre
-- QUÉ ES el papel, y la prueba está en su nombre— y nada más.
--
-- EL NÚMERO NO SE TOCA ACÁ. Estas filas siguen guardando el número de la ORDEN de pago, no el del
-- certificado, y corregirlo exige leer el PDF: lo hace `reatribuir-ordenes-clientes.mjs --aplicar`,
-- que después de esta migración les pone su `G00000347` y su `numero_canonico`. Escribir en SQL una
-- segunda versión de esa regla —«el número es lo que va después del _G»— es exactamente la doble
-- definición que el resto de esta migración evita.
update public.cliente_orden
   set tipo = 'retencion'
 where eliminado_en is null
   and tipo in ('otro', 'orden_pago')
   and nombre_archivo ~ '^O_P_[0-9]+_G[0-9]+\.pdf$';
