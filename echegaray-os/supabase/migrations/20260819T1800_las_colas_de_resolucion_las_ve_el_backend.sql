-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LAS DOS COLAS DE RESOLUCIÓN ERAN INVISIBLES PARA EL BACKEND — Y UN TEST SE PONÍA VERDE SIN MEDIR
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ CÓMO SE ENCONTRÓ ═══
--
-- Contando la cola de proveedores por conexión directa a Postgres:
--   `select count(*) from proveedor_nombre_pendiente`  →  0
--   `select count(*) from proveedor_nombre_resuelto`   →  0
--
-- Y la cola tiene 79 nombres por $382,8M. El cero no era el dato: era el filtro.
--
-- Las dos vistas cierran su `where` con `and es_administracion()`. Es la decisión correcta —la
-- resolución de un maestro es trabajo de Administración— pero el predicado se apoya en
-- `current_rol()`, que busca un perfil por `auth.uid()`. Sin JWT no hay `auth.uid()`, no hay perfil,
-- y `es_administracion()` devuelve false: FALLA CERRADO, como se diseñó. El problema es a quién le
-- cierra la puerta.
--
--   · `service_role` **saltea el RLS, pero no saltea un `where` escrito dentro de una vista.**
--   · el orquestador entra como `postgres` por conexión directa: tampoco tiene perfil.
--
-- Consecuencia medible: el recorrido `resolver un nombre lo saca de la cola de pendientes` lee la
-- cola con la service key, encuentra 0, y hace `test.skip('no hay nombres pendientes')`. **Se
-- reportaba como salteado, no como roto**, sobre una cola con 79 nombres adentro. Un test que se
-- pone verde sin medir es peor que un test que falta: ocupa el lugar de la evidencia.
--
-- ═══ EL ARREGLO ES EL MISMO QUE EN T1700, Y ESO ES A PROPÓSITO ═══
--
-- `auth.uid() is null` significa "no hay un usuario final del otro lado": pg_cron, el orquestador por
-- conexión directa, `service_role`. Tres contextos que ya tienen acceso total por otra vía. La misma
-- regla que las funciones del camino comercial, escrita igual, para que no haya dos criterios de qué
-- es "interno" conviviendo en la misma base.
--
-- Un jefe de obra sigue viendo CERO: tiene `auth.uid()` y no es Administración.

-- `create or replace view` que no repite la opción **la borra**: no se hereda. Es la misma trampa
-- que abrió `cliente_panel` el 19/08, y esta vez la atrapó `vistas-security-invoker.test.mjs` antes
-- de llegar a producción — que es exactamente el trabajo de ese test. Se re-declara al pie.
create or replace view public.proveedor_nombre_pendiente as
WITH nombres AS (
         SELECT normalizar_nombre_proveedor(c.proveedor) AS nombre_norm,
            min(btrim(c.proveedor)) AS nombre_origen,
            count(*) AS comprobantes,
            sum(COALESCE(c.total, 0::numeric)) AS total,
            min(c.fecha) AS primera_fecha,
            max(c.fecha) AS ultima_fecha
           FROM costos_obra c
          WHERE normalizar_nombre_proveedor(c.proveedor) IS NOT NULL
          GROUP BY (normalizar_nombre_proveedor(c.proveedor))
        )
 SELECT n.nombre_norm,
    n.nombre_origen,
    n.comprobantes,
    n.total,
    n.primera_fecha,
    n.ultima_fecha
   FROM nombres n
     LEFT JOIN proveedores p ON normalizar_nombre_proveedor(p.nombre) = n.nombre_norm
     LEFT JOIN proveedor_alias a ON a.nombre_norm = n.nombre_norm
  WHERE p.id IS NULL AND a.id IS NULL AND (public.es_administracion() OR auth.uid() IS NULL);

grant select on public.proveedor_nombre_pendiente to authenticated, service_role;

create or replace view public.proveedor_nombre_resuelto as
WITH nombres AS (
         SELECT normalizar_nombre_proveedor(c.proveedor) AS nombre_norm,
            count(*) AS comprobantes,
            sum(COALESCE(c.total, 0::numeric)) AS total
           FROM costos_obra c
          WHERE normalizar_nombre_proveedor(c.proveedor) IS NOT NULL
          GROUP BY (normalizar_nombre_proveedor(c.proveedor))
        )
 SELECT n.nombre_norm,
    n.comprobantes,
    n.total,
    COALESCE(a.estado, 'vinculado'::text) AS estado,
    COALESCE(a.proveedor_id, p.id) AS proveedor_id,
    COALESCE(pa.nombre, p.nombre) AS proveedor_nombre,
        CASE
            WHEN a.id IS NOT NULL THEN 'resolucion_manual'::text
            ELSE 'exacto'::text
        END AS via,
    a.id AS alias_id
   FROM nombres n
     LEFT JOIN proveedores p ON normalizar_nombre_proveedor(p.nombre) = n.nombre_norm
     LEFT JOIN proveedor_alias a ON a.nombre_norm = n.nombre_norm
     LEFT JOIN proveedores pa ON pa.id = a.proveedor_id
  WHERE (p.id IS NOT NULL OR a.id IS NOT NULL) AND (public.es_administracion() OR auth.uid() IS NULL);

grant select on public.proveedor_nombre_resuelto to authenticated, service_role;

comment on view public.proveedor_nombre_pendiente is
  'Los nombres de proveedor del Sheet que todavía no tienen dueño canónico. Sólo Administración —o '
  'un contexto sin usuario final: service_role, pg_cron, el orquestador— la lee.';
comment on view public.proveedor_nombre_resuelto is
  'Los nombres del Sheet que ya tienen dueño canónico. Mismo alcance que la cola de pendientes.';

alter view public.proveedor_nombre_pendiente set (security_invoker = true);
alter view public.proveedor_nombre_resuelto  set (security_invoker = true);
