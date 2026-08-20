-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA IMPUTACIÓN AMBIGUA SE RESUELVE DESDE LA WEB, Y NO LA RESUELVE UN ALGORITMO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El dueño: *"Si la relación es confiable, canonicalizar. Si es ambigua: **PENDIENTE DE ASIGNACIÓN**.
-- Administración debe poder resolverla desde la web. **No inventar imputaciones.**"*
--
-- ═══ EL DICCIONARIO YA EXISTE Y ES UNO SOLO ═══
--
-- Compras, herramientas y movimientos guardan la obra como TEXTO, y `obra_alias` es lo que traduce
-- ese texto al eje canónico: `norm_obra(texto) = alias`. Es el mismo diccionario que usa
-- `obra_costo_real` y el mismo que usa la solapa Operación. Resolver un texto es agregar UNA fila
-- acá, y eso arregla de una vez TODAS las filas que dicen lo mismo — hoy, y las que entren mañana.
--
-- `obra_id` NULL no es un dato faltante: significa *"esto no es una obra"*. Administración, Taller,
-- Almacén, F931, UOCRA, IERIC, FODECO, Plan de pago, Crédito prendario y Sueldos son costos de
-- estructura, y están declarados así en 15 alias. Medido hoy, de todos los textos que aparecen en
-- las tres fuentes, **UNO SOLO** no tiene ninguna clasificación: «SERV. TECNICO», 2 filas.
--
-- ═══ DOS DEFECTOS QUE IMPEDÍAN HACERLO ═══
--
-- 1. `obra_alias_write` era `for all`, o sea que **incluía el SELECT**. Es la misma trampa que ya se
--    pagó en `obra_actividad` (una fuga de lectura de 39 filas) y en las cuatro tablas de Operación.
--    Se parte por comando.
-- 2. `authenticated` tenía SELECT pero **ni INSERT ni UPDATE**: la pantalla habría fallado con
--    `42501 permission denied`, que Next muestra como un 404 y manda a buscar el defecto al lugar
--    equivocado. RLS NO ES GRANT.
--
-- Escribir el diccionario redefine el costo de las obras, así que es de Administración y de nadie
-- más — ni siquiera de un jefe de obra sobre su propia obra.

drop policy if exists "obra_alias_write" on public.obra_alias;

create policy "obra_alias_insert" on public.obra_alias
  for insert to authenticated with check (public.es_administracion());

create policy "obra_alias_update" on public.obra_alias
  for update to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

create policy "obra_alias_delete" on public.obra_alias
  for delete to authenticated using (public.es_administracion());

grant select, insert, update, delete on public.obra_alias to authenticated;

-- ── LO QUE FALTA POR RESOLVER, COMO UNA SOLA PREGUNTA ──────────────────────────────────────────
--
-- Une los textos de las tres fuentes que NO tienen alias. No inventa nada: sólo cuenta cuántas filas
-- y cuánta plata están esperando que alguien diga a qué obra pertenecen (o que no pertenecen a
-- ninguna). `security_invoker` para que herede el RLS de las tablas de origen.
create or replace view public.imputacion_pendiente
  with (security_invoker = true) as
with textos as (
  select public.norm_obra(obra_texto) as clave, max(obra_texto) as texto,
         'compras'::text as fuente, count(*)::int as filas, coalesce(sum(total), 0) as monto
    from public.costos_obra where coalesce(btrim(obra_texto), '') <> '' group by 1
  union all
  select public.norm_obra(ubicacion_actual), max(ubicacion_actual),
         'herramientas', count(*)::int, 0
    from public.herramientas where coalesce(btrim(ubicacion_actual), '') <> '' group by 1
  union all
  select public.norm_obra(destino), max(destino),
         'movimientos', count(*)::int, 0
    from public.movimientos_herramienta where coalesce(btrim(destino), '') <> '' group by 1
)
select t.clave,
       max(t.texto)                          as texto,
       string_agg(distinct t.fuente, ' · ')  as fuentes,
       sum(t.filas)::int                     as filas,
       sum(t.monto)                          as monto
  from textos t
 where t.clave is not null and t.clave <> ''
   and not exists (select 1 from public.obra_alias a where a.alias = t.clave)
 group by t.clave
 order by sum(t.filas) desc;

comment on view public.imputacion_pendiente is
  'Textos de obra que aparecen en compras, herramientas o movimientos y que NADIE clasificó todavía. '
  'No confundir con obra_id NULL en obra_alias, que sí es una clasificación: significa que ese texto '
  'no es una obra (estructura).';

grant select on public.imputacion_pendiente to authenticated, service_role;
