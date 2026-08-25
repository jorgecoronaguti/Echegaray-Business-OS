-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL DOCUMENTO ES DE LA OBRA CUYA CARPETA LO CONTIENE — Y LA CARPETA COMPARTIDA NO IDENTIFICA A NADIE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL HECHO MEDIDO EN LA BASE VIVA (22/08/2026) ═══
--
--   drive_index          3.596 filas (471 carpetas)   — el espejo de Drive está entero
--   cliente_documento      214 vínculos               — los clientes SÍ tienen sus papeles
--   obra_documento           0 filas                  — ninguna obra tiene ninguno
--
-- Once obras tienen `drive_carpeta_id` cargado y las once están indexadas. Quattropani apunta a
-- «administracion/PRESUPUESTOS - CLIENTES/FRANCO QUATTROPANI», que cuelga 42 nodos (32 archivos +
-- 10 subcarpetas). La pantalla de documentos de la obra existe, lee `obra_documento` y muestra
-- cero: el dato está, el vínculo nunca se hizo.
--
-- ═══ LA EVIDENCIA ES LA CARPETA, Y ES FUERTE POR UN MOTIVO ═══
--
-- Que un archivo esté adentro de la carpeta de la obra no es un parecido de nombres: es que ALGUIEN
-- LO PUSO AHÍ. Es el mismo criterio (a) que ya usa `documentacion-obra-vinculo.mjs` para colgar un
-- documento de un frente, y el más fuerte que hay en un data room.
--
-- ═══ LAS DOS TRAMPAS QUE ESTA MIGRACIÓN EXISTE PARA EVITAR ═══
--
-- (1) CARPETAS DE OBRA ANIDADAS. Medido, no supuesto: la carpeta de `san-francisco` CONTIENE las
--     carpetas de `entrepiso-y-escalera`, `pisos-industriales` e `instalacion-electrica`, que son
--     tres obras distintas. Un descenso recursivo ingenuo le regala a san-francisco los papeles de
--     las otras tres, y desde ese momento su carpeta «documentos» miente sin dar ningún error. Por
--     eso el descenso SE CORTA en toda carpeta que sea la raíz declarada de otra obra: la carpeta
--     más específica gana, que es lo que quiso decir quien la creó adentro.
--
-- (2) CARPETA COMPARTIDA POR DOS OBRAS. También medido: `bsa-planta` y `bsa-adicional` declaran el
--     MISMO `drive_carpeta_id`. Ahí la carpeta deja de ser evidencia: no distingue una obra de la
--     otra. Esos archivos salen marcados `ambiguo` y la función NO los vincula — se confirman a
--     mano, con la acción que ya existe. Ambiguo no es un vínculo: es la misma regla del cruce
--     cheque↔factura y del vínculo documento↔actividad.
--
-- ═══ SÓLO ARCHIVOS, NO SUBCARPETAS ═══
--
-- De los 42 nodos de Quattropani se vinculan los 32 archivos. Las 10 subcarpetas son la ESTRUCTURA
-- por la que se baja, no documentos: vincularlas también mostraría dos veces lo mismo —la carpeta y
-- cada papel de adentro— en la misma lista. Vincular una carpeta a mano sigue siendo posible y es
-- una decisión distinta: la toma una persona cuando quiere el atajo, no el barrido.

-- ── 1 · el origen dice de dónde salió el vínculo ──────────────────────────────────────────────
--
-- `confirmado` (lo afirmó una persona) e `inferido` no alcanzan: un vínculo deducido de la carpeta
-- no es lo mismo que uno deducido del nombre, y el día que haya que revisar «cuáles hay que mirar»
-- la diferencia es toda la pregunta.
alter table public.obra_documento drop constraint if exists obra_documento_origen_check;
alter table public.obra_documento add constraint obra_documento_origen_check
  check (origen in ('confirmado', 'inferido', 'carpeta_drive'));

comment on column public.obra_documento.origen is
  'De dónde salió el vínculo. confirmado = lo afirmó una persona en la pantalla · carpeta_drive = '
  'el archivo está dentro de la carpeta de Drive declarada por la obra (evidencia dura: alguien lo '
  'puso ahí) · inferido = deducido del nombre o la ruta, sin confirmar.';

-- ── 2 · los candidatos, con su evidencia y su ambigüedad a la vista ───────────────────────────
--
-- `security_invoker` como el resto de las vistas del repositorio (68 de 85), y eso tiene una
-- consecuencia que NO es un defecto: `drive_index` está cerrada desde 20260821T5100 a `ve_economia()`
-- o a los archivos YA vinculados, así que para un jefe de obra esta vista vuelve vacía —todavía no
-- hay vínculo que la abra—. El catálogo de Drive no es público, y el barrido lo corre quien ve el
-- data room. Después de vincular, `drive_file_ids_vinculados()` le abre los archivos de SU obra.
create or replace view public.obra_documento_candidato
with (security_invoker = true) as
with recursive raiz as (
  select o.id as obra_id, o.drive_carpeta_id as carpeta
  from public.obra_canonica o
  where o.drive_carpeta_id is not null
),
arbol as (
  select r.obra_id, r.carpeta as nodo, r.carpeta as raiz, 0 as nivel
  from raiz r
  union all
  select a.obra_id, i.drive_file_id, a.raiz, a.nivel + 1
  from arbol a
  join public.drive_index i on i.parent_id = a.nodo
  where i.is_folder
    -- EL CORTE (trampa 1): no se baja por la carpeta raíz de otra obra.
    and not exists (
      select 1 from raiz r2 where r2.carpeta = i.drive_file_id and r2.obra_id <> a.obra_id
    )
    -- Un ciclo en parent_id colgaría la consulta para siempre. Drive no debería tenerlos; la base
    -- es un espejo y un espejo se puede desincronizar.
    and a.nivel < 20
)
select
  a.obra_id,
  f.drive_file_id,
  f.name,
  f.path,
  f.mime_type,
  f.modified_time,
  a.raiz                                  as carpeta_obra,
  a.nivel + 1                             as profundidad,
  'carpeta_drive'::text                   as origen,
  'el archivo está dentro de la carpeta de Drive de la obra: ' || f.path  as evidencia,
  -- AMBIGUO (trampa 2): la carpeta raíz la declaran dos obras, así que no identifica a ninguna.
  exists (
    select 1 from raiz r3 where r3.carpeta = a.raiz and r3.obra_id <> a.obra_id
  )                                       as ambiguo,
  exists (
    select 1 from public.obra_documento d
    where d.obra_id = a.obra_id and d.drive_file_id = f.drive_file_id
  )                                       as ya_vinculado
from arbol a
join public.drive_index f on f.parent_id = a.nodo and not f.is_folder;

comment on view public.obra_documento_candidato is
  'Los archivos de Drive que cuelgan de la carpeta declarada por cada obra, con su evidencia. El '
  'descenso SE CORTA en la carpeta raíz de otra obra (la de san-francisco contiene las de '
  'entrepiso-y-escalera, pisos-industriales e instalacion-electrica) y marca ambiguo cuando dos '
  'obras declaran la MISMA carpeta (bsa-planta y bsa-adicional): ahí la carpeta no es evidencia de '
  'ninguna de las dos. Sólo archivos: las subcarpetas son la estructura por la que se baja.';

grant select on public.obra_documento_candidato to authenticated;
grant select on public.obra_documento_candidato to service_role;

-- ── 3 · poblar el vínculo, idempotente y re-ejecutable ────────────────────────────────────────
--
-- `security definer` NO: quien corra esto tiene que tener permiso sobre las obras que toca. La
-- corrida real la hace administración o el proceso del OS, ambos con rol propio.
create or replace function public.vincular_documentos_por_carpeta(p_obra_id text default null)
returns table (obra_id text, vinculados integer, ya_estaban integer, ambiguos integer)
language plpgsql as $$
-- Las columnas de RETURNS TABLE son variables de plpgsql, y `obra_id` es además una columna de las
-- tres tablas que toca esta consulta. Sin esto, `returning obra_id` devolvería la VARIABLE (nula) y
-- la cuenta de vinculados daría cero para siempre, en verde.
#variable_conflict use_column
begin
  return query
  with candidatos as (
    select c.* from public.obra_documento_candidato c
    where p_obra_id is null or c.obra_id = p_obra_id
  ),
  -- ON CONFLICT DO NOTHING y no un UPDATE: un vínculo que ya existe puede haberlo puesto una
  -- persona con su rol y su actividad: pisarlo con 'carpeta_drive' borraría esa decisión.
  insertados as (
    insert into public.obra_documento (obra_id, drive_file_id, nombre, tipo, mime_type, origen)
    select k.obra_id, k.drive_file_id, k.name, 'archivo', k.mime_type, 'carpeta_drive'
    from candidatos k
    where not k.ambiguo and not k.ya_vinculado
    on conflict (obra_id, drive_file_id) do nothing
    returning obra_documento.obra_id, obra_documento.drive_file_id
  )
  select
    c.obra_id,
    count(*) filter (where i.drive_file_id is not null)::integer            as vinculados,
    count(*) filter (where c.ya_vinculado)::integer                        as ya_estaban,
    count(*) filter (where c.ambiguo)::integer                             as ambiguos
  from candidatos c
  left join insertados i
    on i.obra_id = c.obra_id and i.drive_file_id = c.drive_file_id
  group by c.obra_id
  order by c.obra_id;
end $$;

comment on function public.vincular_documentos_por_carpeta(text) is
  'Puebla obra_documento con los archivos que cuelgan de la carpeta de Drive de la obra, con '
  'origen=carpeta_drive. Idempotente: la segunda corrida devuelve 0 vinculados y los cuenta en '
  'ya_estaban. NO toca los ambiguos (carpeta compartida por dos obras) ni pisa un vínculo '
  'existente. Sin argumento corre sobre todas las obras con carpeta declarada.';

grant execute on function public.vincular_documentos_por_carpeta(text) to authenticated;
grant execute on function public.vincular_documentos_por_carpeta(text) to service_role;
