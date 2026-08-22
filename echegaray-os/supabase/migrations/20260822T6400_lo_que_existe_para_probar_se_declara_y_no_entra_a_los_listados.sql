-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LO QUE EXISTE PARA PROBAR SE DECLARA, Y NO ENTRA A LOS LISTADOS DEL PRODUCTO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- NO APLICADA. La aplica el coordinador; este trabajo sólo la escribe.
--
-- ── EL HECHO ────────────────────────────────────────────────────────────────────────────────────
--
-- El 22/08/2026, en la base productiva, conviven con los datos reales:
--
--   · `perfiles` — «Usuario de prueba E2E» (rol dirección), «QA Jefe», «QA Campo». Son las tres
--     identidades de `tests/util/identidades.ts`: sin ellas no se puede medir una sola cerradura.
--     No sobran. Lo que sobra es que aparezcan como opción elegible en el selector de responsable
--     de un cliente, al lado de Rodrigo y de Jorge.
--   · `proveedores` — cuatro «QA NO DEBE ENTRAR <epoch>», restos de un test negativo del 20/08 que
--     esperaba un 4xx, no lo obtuvo, se puso rojo (hizo su trabajo) y dejó las filas.
--   · `personas` — dos «e2e-hh-<epoch>» de `hh-fuente-canonica.spec.ts`, que no limpia nada.
--
-- Los dos últimos grupos se borran (SQL aparte, lo corre el coordinador). Las tres identidades NO:
-- borrarlas sin reemplazo deja la suite sin con qué medir el RLS.
--
-- ── POR QUÉ UNA COLUMNA Y NO UNA CONVENCIÓN DE NOMBRE ───────────────────────────────────────────
--
-- «El que se llame QA algo no cuenta» ya fracasó: hay un proveedor real llamado CHAPA SEMILLA MELO,
-- archivos reales llamados «Ejemplo Percepciones DDJJ IB», un agente del Fabric llamado
-- `reviewer-qa` y cuarenta alias con `origen = 'semilla'`. Filtrar por texto es filtrar datos
-- reales. Lo que hace de prueba a una fila es una DECISIÓN, y una decisión se escribe.
--
-- ── POR QUÉ NO SE ESCONDEN EN TODAS PARTES ─────────────────────────────────────────────────────
--
-- En `/administracion/usuarios` estas tres cuentas TIENEN que seguir viéndose: pueden entrar. Una
-- cuenta que entra y no aparece en ninguna pantalla es exactamente lo que esa pantalla existe para
-- que no pase — está escrito en `usuariosService.ts`. Y en una auditoría, el autor de una fila se
-- muestra siempre, sea quien sea. El flag NO oculta: marca, y los SELECTORES lo respetan.
--
-- ── LA TRAMPA DEL GRANT ────────────────────────────────────────────────────────────────────────
--
-- Estas tres tablas tienen privilegios POR COLUMNA. Una columna nueva nace sin permiso: la web la
-- leería vacía —no con error— y el filtro seguiría de largo con el default. Por eso cada `add
-- column` viene con su `grant` pegado.

-- ── 1 · LA COLUMNA ──────────────────────────────────────────────────────────────────────────────

alter table public.perfiles     add column if not exists es_prueba boolean not null default false;
alter table public.personas     add column if not exists es_prueba boolean not null default false;
alter table public.proveedores  add column if not exists es_prueba boolean not null default false;

comment on column public.perfiles.es_prueba is
  'Esta identidad existe para que la suite pueda medir la cerradura, no para trabajar. Sigue '
  'visible en /administracion/usuarios y en cualquier rastro de auditoría —puede entrar, así que '
  'tiene que verse— pero NO se ofrece en los selectores del producto. Lo pone una decisión '
  'explícita, nunca el texto del nombre.';

comment on column public.personas.es_prueba is
  'La creó una prueba automática, no Administración. Existe para que un fixture pueda marcar lo '
  'que crea y el producto no lo muestre aunque la limpieza falle.';

comment on column public.proveedores.es_prueba is
  'Lo creó una prueba automática, no Administración. El 20/08/2026 cuatro «QA NO DEBE ENTRAR» '
  'llegaron al maestro real porque un test negativo no limpia lo que «no iba a crear».';

-- ── 2 · EL PERMISO, PEGADO A LA COLUMNA ────────────────────────────────────────────────────────

grant select (es_prueba) on public.perfiles    to authenticated, service_role;
grant select (es_prueba) on public.personas    to authenticated, service_role;
grant select (es_prueba) on public.proveedores to authenticated, service_role;

-- Quién puede MARCAR: sólo el service role. Un fixture escribe con service role; nadie desde la web
-- convierte una fila real en «de prueba» para que desaparezca de los listados.
grant update (es_prueba) on public.perfiles    to service_role;
grant update (es_prueba) on public.personas    to service_role;
grant update (es_prueba) on public.proveedores to service_role;
grant insert (es_prueba) on public.personas    to service_role;
grant insert (es_prueba) on public.proveedores to service_role;

-- ── 3 · LAS TRES IDENTIDADES QUE LA INFRA NECESITA ─────────────────────────────────────────────
--
-- Por id, no por nombre: el nombre se edita desde /mi-cuenta y el día que alguien renombre «QA
-- Jefe» a «Emiliano», el marcado por texto se desharía solo y en silencio.
--
--   ede1fa51  jorge.o.corona+direccion-test-1783513222134@gmail.com  · ADMIN de identidades.ts
--   825e31d4  qa.jefe.obra@ecsas.com.ar                              · JEFE
--   cf0fb54c  qa.campo@ecsas.com.ar                                  · CAMPO
--
-- La primera es la que el `backlog_autonomo` ya declaraba conflictiva el 08/07: la comparten la
-- suite y el dueño. Se marca igual —es la cuenta con la que corre la suite— y esto NO la deshabilita
-- ni le saca el rol: sólo la deja fuera de los selectores. Si el dueño la usa para trabajar, la
-- salida buena es que trabaje con jorge@ecsas.com.ar, que ya existe y ya entra.
update public.perfiles set es_prueba = true
 where id in ('ede1fa51-517b-4f27-b6d9-09ce8a704aca',
              '825e31d4-ea03-48b5-a886-ee6ee0024a0d',
              'cf0fb54c-5fc6-4107-981a-c7d7eb891c1d');

-- `personas` y `proveedores` NO se marcan acá: sus filas de prueba se BORRAN (no hay nada que
-- preservar en ellas). La columna queda para que los fixtures marquen lo que creen de ahora en más.
