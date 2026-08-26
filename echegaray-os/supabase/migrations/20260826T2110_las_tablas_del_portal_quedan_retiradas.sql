-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LAS TRES TABLAS QUE EL PORTAL DUPLICABA QUEDAN MARCADAS COMO RETIRADAS — NO SE BORRAN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ESCRITA Y SIN APLICAR. Aplicarla es una decisión del dueño.
--
-- ═══ QUÉ PASÓ ═══
--
-- El portal del cliente (26/08/2026) se construyó con tablas propias sin ver que la ficha del cliente
-- ya administraba exactamente esos conceptos. Convivieron dos definiciones de lo mismo:
--
--   quién entra al portal      `cliente_mail`      →  `cliente_acceso`            (pantalla 31)
--   cronograma que ve el cliente `pago_programado` →  `esquema_pago`              (pantalla 32)
--   actividad del portal       `portal_acceso`     →  `cliente_actividad_portal`  (pantalla 31)
--
-- El código del portal ya NO las lee (salvo un caso declarado, ver abajo). Esta migración deja
-- escrito en la base cuál es la buena, para que el próximo que abra `pago_programado` en un cliente
-- de SQL lo lea ahí y no tenga que reconstruirlo del historial de git.
--
-- ═══ POR QUÉ `comment on table` Y NO `drop table` ═══
--
-- `pago_programado` tiene 31 filas reales sembradas desde la pestaña Cobranzas del Sheet y
-- `cliente_mail` tiene 5 accesos vivos. Borrar una tabla con datos es irreversible, no es una
-- decisión de quien escribe el código, y hasta que la migración de datos esté verificada contra el
-- destino el origen es la única copia que hay. El día que se decida el DROP, se decide con el dato
-- ya leído del otro lado.
--
-- ═══ LO QUE TODAVÍA LEE `pago_programado` — DECLARADO ═══
--
-- `src/app/portal/(dentro)/terminadas/cierre.ts`. `esquema_pago.obra_id` apunta a
-- `public.obra_canonica` (id de texto) y la pantalla de obras terminadas se apoya en `public.obras`
-- (uuid). Son DOS registros de obra distintos, con distinta granularidad, sin mapeo entre ellos:
-- emparejarlos por nombre inventaría a qué obra pertenece cada cobro. Hasta que los dos registros se
-- unifiquen —decisión del dueño—, esa pantalla no puede seguir al esquema. Hoy no cuesta nada:
-- ninguna obra cerrada tiene filas en `pago_programado`.

comment on table public.cliente_mail is
  'RETIRADA (26/08/2026). Duplicaba public.cliente_acceso, que es la lista de invitados del portal '
  'que administra la pantalla 31 de la ficha del cliente. El portal ya NO la lee. No se borra: '
  'tiene los accesos originales y son la única copia hasta que la migración esté verificada.';

comment on table public.pago_programado is
  'RETIRADA (26/08/2026). Duplicaba public.esquema_pago, que es el cronograma que administra y '
  'publica la pantalla 32 de la ficha del cliente. El portal ya NO la lee, salvo terminadas/cierre.ts '
  'mientras public.obras y public.obra_canonica sigan siendo dos registros de obra sin mapeo. '
  'No se borra: tiene 31 filas sembradas desde la pestaña Cobranzas del Sheet.';

comment on table public.portal_acceso is
  'RETIRADA (26/08/2026). El ingreso al portal se registra en public.cliente_actividad_portal, que '
  'es el libro que la pantalla 31 le muestra al admin. LO QUE SE PIERDE, dicho: esa tabla no puede '
  'guardar un intento RECHAZADO —su cliente_id es NOT NULL y un mail no habilitado no tiene '
  'cliente—. Hoy el rechazo queda sólo en el log del servidor. Volver a hacerlo consultable necesita '
  'una tabla de intentos que no es cliente_actividad_portal.';

comment on table public.portal_codigo is
  'RETIRADA (26/08/2026). El código de seis dígitos se quitó de la puerta el mismo día que se creó: '
  'el requisito era entrar con el mail cargado en la ficha, y el envío por Gmail no funciona desde '
  'Vercel. La tabla queda vacía y sin lector.';
