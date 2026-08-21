-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA ESTRUCTURA DE LA OBRA ES UN ÁRBOL, Y HASTA HOY ERA UNA LISTA CON ETIQUETAS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `obra_actividad.actividad_padre_id` existe desde 20260819T4700 y está **NULL en las 350 filas**.
-- La jerarquía la cargaban tres campos de texto heredados del scrape de Drive, y no cierran:
--
--     codigo         96 de 350        seccion        309 de 350
--     codigo_padre   56 de 350        partida_codigo   0 de 350
--
-- Peor que la cobertura es la forma. En `san-francisco` las tareas `1,01` a `1,08` llevan todas
-- `codigo_padre = '1'` aunque pertenecen a galpones distintos, y las filas 12 a 19 —tareas de obra,
-- no del galpón— arrastran `seccion = 'GALPON 4'` sólo porque venían escritas después. El arrastre
-- de sección era un "última vista" del importador, no una declaración de nadie.
--
-- Esta migración hace tres cosas y ninguna inventa un padre:
--
--   1. Convierte `actividad_padre_id` en una arista real: clave foránea, sin ciclos, dentro de la
--      misma obra, y **el padre tiene que ser un contenedor**. La distinción contenedor/ejecutable
--      ya existía en `tipo` ('resumen' contiene · 'tarea' y 'hito' se ejecutan): se hace cumplir en
--      vez de agregar una columna nueva que diga lo mismo.
--   2. Rellena el padre de las 161 actividades ejecutables que traen `seccion`, colgándolas del
--      `resumen` ANTERIOR MÁS CERCANO de la misma obra cuyo nombre coincide. Eso es exactamente lo
--      que significaba el arrastre; reconstruirlo no es adivinar. Las 36 ejecutables sin `seccion`
--      quedan colgando de la raíz y se ven como lo que son: estructura sin declarar. No se les
--      inventa un padre.
--   3. Publica `obra_wbs`, que recorre el árbol y devuelve nivel, camino y orden constructivo. El
--      nivel NO se guarda en una columna: se calcula. Una columna de nivel hay que mantenerla en
--      cada reparentado, y con 350 filas por obra el recorrido no cuesta nada.
--
-- Lo que esta migración NO hace: tocar `codigo`, `codigo_padre` ni `seccion`. Son el rastro de la
-- fuente y siguen ahí para poder auditar de dónde salió cada vínculo.

-- ── 1 · se retira el techo de tres niveles ────────────────────────────────────────────────────
-- `obra_actividad_tarea_un_nivel` prohibía que el padre tuviera padre: la jerarquía quedaba topada
-- en rubro → actividad → tarea. El contrato pide N niveles (obra → sector → frente → actividad),
-- así que el trigger se retira y su lugar lo toma uno que valida lo mismo SIN el techo.
drop trigger if exists obra_actividad_tarea_un_nivel on public.obra_actividad;
drop function if exists public.tarea_de_un_solo_nivel();

-- ── 2 · la arista ─────────────────────────────────────────────────────────────────────────────
alter table public.obra_actividad drop constraint if exists obra_actividad_padre_fk;
alter table public.obra_actividad add constraint obra_actividad_padre_fk
  foreign key (actividad_padre_id) references public.obra_actividad (id) on delete restrict;

alter table public.obra_actividad drop constraint if exists obra_actividad_padre_no_es_ella_misma;
alter table public.obra_actividad add constraint obra_actividad_padre_no_es_ella_misma
  check (actividad_padre_id is null or actividad_padre_id <> id);

create index if not exists obra_actividad_padre_idx
  on public.obra_actividad (actividad_padre_id) where actividad_padre_id is not null;

-- El padre tiene que existir, ser de la misma obra y no cerrar un ciclo. Además se conserva la
-- distinción que ya había decidido 20260819T4800: un 'resumen' AGRUPA (y puede anidarse sin límite),
-- mientras que la hija de una actividad ejecutable es una SUBTAREA — un ítem de la lista de la
-- actividad, que por eso mismo no entra en el rollup del avance. Una subtarea de una subtarea sería
-- ruido de lista, no estructura de obra: eso sí se sigue prohibiendo.
create or replace function public.obra_actividad_arista_valida()
returns trigger language plpgsql as $$
declare
  p record;
  cursor_id uuid;
  saltos int := 0;
begin
  if new.actividad_padre_id is null then return new; end if;
  if new.actividad_padre_id = new.id then
    raise exception 'una actividad no puede colgar de sí misma';
  end if;

  select a.id, a.obra_id, a.tipo, a.actividad_padre_id, abuelo.tipo as tipo_abuelo
    into p
    from public.obra_actividad a
    left join public.obra_actividad abuelo on abuelo.id = a.actividad_padre_id
   where a.id = new.actividad_padre_id;

  if not found then
    raise exception 'la actividad padre % no existe', new.actividad_padre_id;
  end if;
  if p.obra_id is distinct from new.obra_id then
    raise exception 'una actividad de la obra % no puede colgar de la obra %', new.obra_id, p.obra_id;
  end if;

  if p.tipo <> 'resumen' then
    -- el padre es ejecutable: la hija sólo puede ser una subtarea, y el padre no puede ser ya una
    if new.tipo <> 'tarea' then
      raise exception 'la actividad % es ejecutable: sólo puede tener subtareas, no un % ', p.id, new.tipo;
    end if;
    if p.tipo_abuelo is not null and p.tipo_abuelo <> 'resumen' then
      raise exception 'la actividad % ya es una subtarea: una subtarea no lleva subtareas', p.id;
    end if;
  end if;

  -- ciclos: se sube por el árbol desde el padre propuesto hasta la raíz.
  cursor_id := new.actividad_padre_id;
  while cursor_id is not null loop
    if cursor_id = new.id then
      raise exception 'el vínculo cierra un ciclo sobre la actividad %', new.id;
    end if;
    saltos := saltos + 1;
    if saltos > 100 then
      raise exception 'la estructura de la obra % supera los 100 niveles: hay un ciclo', new.obra_id;
    end if;
    select actividad_padre_id into cursor_id from public.obra_actividad where id = cursor_id;
  end loop;

  return new;
end $$;

drop trigger if exists obra_actividad_arista_valida_t on public.obra_actividad;
create trigger obra_actividad_arista_valida_t
  before insert or update of actividad_padre_id, obra_id, tipo on public.obra_actividad
  for each row execute function public.obra_actividad_arista_valida();

-- Un contenedor que ya tiene hijas no puede degradarse a ejecutable por un UPDATE de `tipo`.
create or replace function public.obra_actividad_contenedor_con_hijas()
returns trigger language plpgsql as $$
begin
  if new.tipo <> 'resumen' and old.tipo = 'resumen'
     and exists (select 1 from public.obra_actividad h where h.actividad_padre_id = new.id) then
    raise exception 'la actividad % tiene hijas: no puede dejar de ser contenedor', new.id;
  end if;
  return new;
end $$;

drop trigger if exists obra_actividad_contenedor_con_hijas_t on public.obra_actividad;
create trigger obra_actividad_contenedor_con_hijas_t
  before update of tipo on public.obra_actividad
  for each row execute function public.obra_actividad_contenedor_con_hijas();

-- ── 3 · el relleno, sólo donde el vínculo lo declaró alguien ───────────────────────────────────
update public.obra_actividad t
   set actividad_padre_id = (
        select r.id
          from public.obra_actividad r
         where r.tipo = 'resumen'
           and r.obra_id = t.obra_id
           and r.nombre = t.seccion
           and r.orden < t.orden
         order by r.orden desc
         limit 1)
 where t.tipo <> 'resumen'
   and t.seccion is not null
   and t.actividad_padre_id is null
   and exists (select 1
                 from public.obra_actividad r
                where r.tipo = 'resumen'
                  and r.obra_id = t.obra_id
                  and r.nombre = t.seccion
                  and r.orden < t.orden);

comment on column public.obra_actividad.actividad_padre_id is
  'El padre en la estructura operativa (obra → sector → frente → actividad, N niveles). El padre '
  'siempre es tipo=''resumen''. NULL significa que cuelga de la raíz de la obra, que es distinto de '
  '"no tiene estructura": las 36 ejecutables sin seccion quedaron ahí a propósito, sin inventarles '
  'un padre. Las columnas codigo/codigo_padre/seccion se conservan como rastro de la fuente.';

-- ── 4 · el árbol recorrido ─────────────────────────────────────────────────────────────────────
-- `ruta_orden` es el camino de posiciones desde la raíz: ordenar por ese arreglo devuelve la obra en
-- orden constructivo, con cada rama debajo de su padre, en una sola consulta.
create or replace view public.obra_wbs with (security_invoker = true) as
with recursive arbol as (
    select a.id, a.obra_id, a.actividad_padre_id, a.nombre, a.tipo, a.orden, a.archivada,
           0::int                              as nivel,
           array[a.orden, 0]                   as ruta_orden,
           a.nombre                            as camino,
           a.id                                as raiz_id
      from public.obra_actividad a
     where a.actividad_padre_id is null
    union all
    select h.id, h.obra_id, h.actividad_padre_id, h.nombre, h.tipo, h.orden, h.archivada,
           p.nivel + 1,
           p.ruta_orden || array[h.orden, 0],
           p.camino || ' › ' || h.nombre,
           p.raiz_id
      from public.obra_actividad h
      join arbol p on p.id = h.actividad_padre_id
)
select a.id as actividad_id, a.obra_id, a.actividad_padre_id, a.nombre, a.tipo, a.orden,
       a.archivada, a.nivel, a.ruta_orden, a.camino, a.raiz_id,
       (a.tipo = 'resumen')                                             as es_contenedor,
       exists (select 1 from public.obra_actividad h
                where h.actividad_padre_id = a.id and not h.archivada)  as tiene_hijas
  from arbol a;

comment on view public.obra_wbs is
  'La estructura operativa recorrida: nivel, camino y orden constructivo. Ordenar por ruta_orden '
  'devuelve el árbol aplanado con cada rama debajo de su padre. El nivel se calcula en cada lectura '
  'a propósito — guardarlo obliga a mantenerlo en cada reparentado y no compra nada a esta escala.';

grant select on public.obra_wbs to authenticated;
grant select on public.obra_wbs to service_role;

-- ── 5 · un contenedor no se mide, se agrega ────────────────────────────────────────────────────
-- Hay 6 registros de ejecución cargados contra filas 'resumen'. NO se borran: son trabajo declarado
-- por alguien y borrarlos sería destruir un dato para que cierre una regla nueva. La regla rige de
-- acá en adelante y los 6 quedan a la vista en `obra_ejecucion_sobre_contenedor` para que una
-- persona los reimpute a la actividad que corresponde.
create or replace function public.obra_ejecucion_no_va_al_contenedor()
returns trigger language plpgsql as $$
declare t text;
begin
  select tipo into t from public.obra_actividad where id = new.actividad_id;
  if t = 'resumen' then
    raise exception 'la actividad % es un contenedor: el avance se registra en las actividades que agrupa', new.actividad_id;
  end if;
  return new;
end $$;

drop trigger if exists obra_ejecucion_no_va_al_contenedor_t on public.obra_ejecucion;
create trigger obra_ejecucion_no_va_al_contenedor_t
  before insert on public.obra_ejecucion
  for each row execute function public.obra_ejecucion_no_va_al_contenedor();

create or replace view public.obra_ejecucion_sobre_contenedor with (security_invoker = true) as
select e.id, e.obra_id, e.actividad_id, a.nombre as actividad, e.fecha, e.cantidad, e.avance_pct,
       e.comentario, e.fuente, e.creado_en
  from public.obra_ejecucion e
  join public.obra_actividad a on a.id = e.actividad_id
 where a.tipo = 'resumen';

comment on view public.obra_ejecucion_sobre_contenedor is
  'Los avances que quedaron cargados contra un contenedor antes de que la regla existiera. No es un '
  'error del que los cargó: la pantalla se lo permitía. Se reimputan a mano; la lista se vacía sola.';

grant select on public.obra_ejecucion_sobre_contenedor to authenticated;
grant select on public.obra_ejecucion_sobre_contenedor to service_role;
