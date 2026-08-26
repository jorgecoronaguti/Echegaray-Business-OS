-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- OPCIONAL · SIN APLICAR · REQUIERE UNA DECISIÓN DEL DUEÑO — NO ES UN PASO MÁS DE LA MIGRACIÓN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL CONFLICTO QUE ESTA MIGRACIÓN RESUELVE, Y EL QUE ABRE ═══
--
-- Al pasar el portal de `cliente_mail` a `cliente_acceso` (26/08/2026) apareció una contradicción
-- entre las dos tablas que NO es un detalle de implementación:
--
--   `cliente_mail`   permite un mail en VARIOS clientes. La migración `20260826T1900` lo habilitó a
--                    propósito: el dueño entra con su propio mail y mira lo que ve cada cliente.
--                    Hoy las CINCO filas de la tabla son `jorge@ecsas.com.ar` en cinco clientes.
--
--   `cliente_acceso` lo PROHÍBE: `cliente_acceso_email_key UNIQUE (email)`. Un mail entra una sola
--                    vez en toda la tabla y pertenece a UN cliente.
--
-- Consecuencia concreta y medida: de los 5 accesos de `cliente_mail`, el script de migración puede
-- llevar UNO. Los otros cuatro rebotan contra ese UNIQUE.
--
-- ═══ POR QUÉ EL UNIQUE NO ES UN DESCUIDO ═══
--
-- El otro portal —el de `/portal-anterior`, que entra por link mágico de Supabase Auth— asume que un
-- mail es UN cliente, en dos lugares:
--
--   · `public.cliente_de_sesion()` traduce `auth.uid()` a un `cliente_id` con `limit 1`. Es el
--     portero de TODAS las policies del portal.
--   · `completarIngresoPortal()` busca el acceso con `.eq('email', ...).maybeSingle()`, que con más
--     de una fila devuelve error y deja al cliente sin poder entrar.
--
-- `cliente_acceso.auth_user_id` sigue siendo UNIQUE después de este cambio, así que
-- `cliente_de_sesion()` no se vuelve ambigua por sí sola: un usuario de Auth sigue atado a una fila.
-- Lo que se rompe es el ALTA — el mail con cinco filas no sabe a cuál atarse— y ahí sí hay que
-- decidir: o el portal por Auth pide elegir cliente como ya lo hace el de cookie, o se acepta que un
-- mail multi-cliente sólo entre por `/portal`.
--
-- ═══ LAS TRES SALIDAS, PARA QUE LA DECISIÓN SEA UNA ELECCIÓN Y NO UN DEFAULT ═══
--
--   A · APLICAR ESTO. El dueño conserva su acceso a los cinco clientes desde `/portal`, y hay que
--       arreglar `completarIngresoPortal` antes de que alguien use el link mágico con ese mail.
--   B · NO APLICAR y darle al dueño una casilla por cliente. Es lo que había antes de la migración
--       `20260826T1900`, que se hizo justamente para no tener que hacer eso.
--   C · NO APLICAR y aceptar que el dueño mira el portal de un solo cliente. Es perder capacidad.
--
-- Mientras no se decida, el script de migración informa los cuatro accesos que no puede mover y no
-- los fuerza. Un acceso a medio migrar es peor que uno sin migrar.

-- ── EL CAMBIO, SI SE ELIGE A ─────────────────────────────────────────────────────────────────
--
-- Lo que el índice tiene que impedir es cargar DOS VECES el mismo permiso —eso deja dos filas que
-- «dar de baja» apaga sólo a medias—. Ese permiso es el par (cliente, mail), no el mail solo. Sigue
-- siendo imposible duplicar un permiso; pasa a ser posible tener dos permisos distintos.

alter table public.cliente_acceso drop constraint if exists cliente_acceso_email_key;

create unique index if not exists cliente_acceso_cliente_email_key
  on public.cliente_acceso (cliente_id, email);

-- El portal resuelve el alcance por MAIL en cada carga de pantalla. Sin este índice esa consulta es
-- un scan de la tabla cada vez que el cliente abre algo.
create index if not exists cliente_acceso_por_email_vivo
  on public.cliente_acceso (email) where revocado_at is null;

comment on index public.cliente_acceso_cliente_email_key is
  'Un permiso es (cliente, mail): no se puede cargar dos veces el mismo, y SÍ se puede habilitar un '
  'mismo mail en clientes distintos. Reemplaza al UNIQUE(email), que impedía lo segundo. '
  'auth_user_id sigue siendo UNIQUE, así que cliente_de_sesion() no se vuelve ambigua.';
