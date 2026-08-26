-- UN MAIL PUEDE ALCANZAR VARIOS CLIENTES.
--
-- ═══ QUÉ ESTABA MAL ═══
--
-- El índice único era `(mail, coalesce(obra_id, ZERO))`. Con `obra_id NULL` —que es «todas las obras
-- de este cliente»— el mail entraba UNA sola vez en toda la tabla: habilitarlo para un segundo
-- cliente devolvía «duplicate key». La tabla decía tener `cliente_id` y en la práctica no lo usaba.
--
-- No es un caso de laboratorio: el dueño de la empresa tiene que poder entrar con su propio mail y
-- ver todas las obras de todos los clientes para revisar lo que cada uno está viendo. Con el índice
-- viejo eso exigía tres casillas distintas.
--
-- ═══ POR QUÉ NO AFLOJA NADA ═══
--
-- Lo que el índice tiene que impedir es cargar DOS VECES el mismo permiso —eso deja dos filas que
-- decir «dale de baja» apaga sólo a medias—. Ese permiso es la terna (mail, cliente, alcance), no el
-- par (mail, alcance). Sigue siendo imposible duplicar un permiso; ahora es posible tener dos
-- permisos distintos.
--
-- La autorización de fondo NO vive en este índice: vive en que el portal vuelve a preguntarle a esta
-- tabla, por mail, en cada carga de pantalla.

drop index if exists public.cliente_mail_unico;

create unique index if not exists cliente_mail_unico
  on public.cliente_mail (mail, cliente_id, coalesce(obra_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- El portal resuelve el alcance por MAIL en cada request. Sin este índice esa consulta es un scan de
-- la tabla en cada pantalla que el cliente abre.
create index if not exists cliente_mail_por_mail_activo
  on public.cliente_mail (mail) where activo;

-- ── EL CÓDIGO EMITIDO A MANO ─────────────────────────────────────────────────────────────────
--
-- El código de acceso sale por el Gmail de la empresa, y eso necesita el JSON del service account:
-- un ARCHIVO que vive en la VM y NO existe en Vercel, donde corre la web. En producción el envío
-- falla y el cliente queda mirando «no pude enviarte el código», sin ninguna otra puerta.
--
-- `emitido_por` deja el código emitido desde la consola de administración: se genera, se lo dicta
-- por teléfono, y entra. La columna existe para que quede el RASTRO —quién le dio entrada a quién—,
-- que es exactamente lo que un código dictado por teléfono se lleva puesto si no se registra.
alter table public.portal_codigo add column if not exists emitido_por uuid references public.perfiles(id);

comment on column public.portal_codigo.emitido_por is
  'Perfil que generó el código desde la consola. NULL = lo pidió el cliente por la pantalla de ingreso.';

-- ── LA ENTRADA SIN CÓDIGO ────────────────────────────────────────────────────────────────────
--
-- El paso del código de seis dígitos se retiró (decisión del dueño, 26/08/2026): el requisito era
-- «entra con el mail que el administrador cargó en su ficha», y el envío por Gmail no funciona desde
-- Vercel de todos modos. `portal_acceso` tiene que poder registrar la entrada directa.
--
-- Los valores viejos se CONSERVAN: son el historial de lo que ya pasó, y borrarlos de la restricción
-- rompería la lectura de las filas existentes.
alter table public.portal_acceso drop constraint if exists portal_acceso_resultado_check;
alter table public.portal_acceso add constraint portal_acceso_resultado_check
  check (resultado in ('entro', 'no_habilitado', 'habilitado', 'codigo_ok', 'codigo_malo', 'codigo_vencido'));
