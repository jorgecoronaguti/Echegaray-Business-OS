-- EL CLIENTE ES UNA RELACIÓN, NO UN AGRUPADOR DE OBRAS.
--
-- ═══ QUÉ FALTABA DE VERDAD ═══
--
-- Verificado contra el catálogo de la base viva (no contra `migrations/`) el 19/08/2026:
--
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='clientes';
--   → id, nombre, created_at, updated_at, creado_por, actualizado_por, actualizado_en,
--     slug, cuit, drive_carpeta_id, activo, notas
--
-- O sea: la ficha no tiene DÓNDE queda el cliente, ni CÓMO se lo llama, ni QUIÉN de la empresa lo
-- atiende. Las tres primeras son datos de contacto de la relación; la cuarta es la que convierte
-- "un cliente" en "un cliente de alguien". Todo lo demás que pide el encargo —contactos, obras,
-- documentos, historia— YA EXISTE en la base y no se toca acá.
--
-- ═══ POR QUÉ `responsable_id` APUNTA A `perfiles` Y NO ES UN TEXTO LIBRE ═══
--
-- Un texto libre produce "Rodrigo", "R. Echegaray" y "rodri" como tres responsables distintos, y
-- entonces la pregunta "¿de quién es este cliente?" deja de tener respuesta. `perfiles` es la tabla
-- de las personas del OS —la misma que lee `current_rol()`— y hoy tiene cuatro filas reales.
--
-- EL LÍMITE, DECLARADO: sólo se puede asignar a alguien que tenga perfil en el OS. Si el dueño
-- necesita responsable a una persona de administración sin acceso, primero hay que darle el perfil.
-- Esa es una decisión de él, no un dato que se pueda inventar acá.
--
-- `on delete set null`: borrar un perfil no puede llevarse puesto un cliente.
--
-- ═══ LO QUE ESTA MIGRACIÓN NO HACE ═══
--
-- No crea ninguna tabla de eventos de auditoría. La solapa Actividad se DERIVA de las fechas que ya
-- existen (`clientes.created_at`, `cliente_contacto.creado_en`, `obra_canonica.created_at`,
-- `cliente_documento.creado_en`, `certificados`). Una tabla de eventos nueva arranca vacía y le
-- mostraría "sin actividad" a un cliente de tres años, que es una mentira con formato de dato.

-- APLICADA Y VERIFICADA EL 19/08/2026 CONTRA EL CATÁLOGO, no contra la pantalla:
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='clientes'
--      and column_name in ('direccion','telefono','email','responsable_id');   → las cuatro
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='public.clientes'::regclass and contype='f';
--     → clientes_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES perfiles(id) ON DELETE SET NULL
--   cliente_panel quedó con sus 20 columnas y con `grant select` a `authenticated`.
--   Los cinco clientes reales conservaron su `n_obras`: 1, 3, 1, 1, 1.

alter table public.clientes add column if not exists direccion      text;
alter table public.clientes add column if not exists telefono       text;
alter table public.clientes add column if not exists email          text;
alter table public.clientes add column if not exists responsable_id uuid
  references public.perfiles(id) on delete set null;

create index if not exists clientes_responsable_idx on public.clientes (responsable_id)
  where responsable_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- `cliente_panel` — los campos nuevos, sin tocar una sola suma
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Se rehace SÓLO `cliente_panel`. `obra_panel` queda intacta: no cambió nada de lo que calcula, y
-- soltarla y rehacerla sin necesidad es la forma de perder sus grants por tercera vez.
--
-- El `grant` del final NO es opcional: `drop view` se lleva los privilegios con él, y una policy sin
-- grant devuelve `permission denied` que Next muestra como un 404 — el módulo 01 entero ya estuvo
-- caído por exactamente esto.
drop view if exists public.cliente_panel;

create view public.cliente_panel as
select
  c.id                                                    as cliente_id,
  c.slug,
  c.nombre,
  c.cuit,
  c.direccion,
  c.telefono,
  c.email,
  c.responsable_id,
  p.nombre                                                as responsable_nombre,
  c.drive_carpeta_id,
  c.activo,
  c.notas,
  count(op.obra_id)::int                                  as n_obras,
  count(op.obra_id) filter (where op.estado = 'activa')::int as n_obras_activas,
  sum(op.monto_contratado)                                as contratado,
  sum(op.costo_real)                                      as costo_real,
  sum(op.restricciones_abiertas)::int                     as restricciones_abiertas,
  max(op.avance_sincronizado_en)                          as avance_sincronizado_en,
  (select count(*)::int from public.cliente_contacto ct where ct.cliente_id = c.id)  as n_contactos,
  (select count(*)::int from public.cliente_documento cd where cd.cliente_id = c.id) as n_documentos
from public.clientes c
left join public.perfiles p    on p.id = c.responsable_id
left join public.obra_panel op on op.cliente_id = c.id
group by c.id, c.slug, c.nombre, c.cuit, c.direccion, c.telefono, c.email,
         c.responsable_id, p.nombre, c.drive_carpeta_id, c.activo, c.notas;

grant select on public.cliente_panel to authenticated;

-- `clientes` ya tiene select/insert/update/delete para `authenticated` desde la fundación y sus dos
-- policies (`clientes_select` abierta, `clientes_write` acotada a dirección/administración): las
-- columnas nuevas heredan ese permiso, no hace falta un grant por columna.
--
-- `perfiles` ya tiene `grant select` + `authenticated_read_perfiles` (using true): el desplegable de
-- responsable lee de ahí sin abrir nada nuevo. Verificado en `information_schema.role_table_grants`
-- y en `pg_policies` antes de escribir esto.
