-- ERP OBRAS · SERIE B (diseño «De cero al final», 24/09/2026) — CINCO NIVELES CON NOMBRE Y EL PESO
-- DERIVADO DEL COSTO DE MANO DE OBRA.
--
-- QUÉ HABÍA Y POR QUÉ NO ALCANZA
--
-- El nivel de un ítem se deducía de su PROFUNDIDAD (`obra_wbs.nivel` 0..4). La serie B lo rompe por
-- tres lados, y los tres ya existen en la base o en el diseño:
--   · la conversión desde el presupuesto cuelga la PARTIDA (historia) directo del rubro, sin épica
--     («las épicas se arman después, a mano»): profundidad 1, nivel historia;
--   · dividir una tarea en frentes deja FRENTES a profundidad 4 que son tareas (van al cronograma y
--     se miden), no subtareas;
--   · las obras reales (san-francisco, messina, le-comedor, le-galpon-9…) tienen TAREAS colgadas del
--     rubro, sin épica ni historia. Leerlas como «épica» por estar a profundidad 1 las convertía en
--     contenedores que no son.
-- Y `obra_historia_peso` tomaba como historia «nivel 2 o con costo», promediaba TODAS las hojas
-- (una tarea partida en 2 frentes pesaba doble) y contaba las subtareas como hojas.
--
-- LO QUE HACE
--
-- 1. `obra_actividad.nivel` ∈ rubro · epica · historia · tarea · subtarea. Se rellena UNA vez desde
--    lo que la base ya dice (tipo + padre) y desde acá lo escribe la web. Quien no lo manda (el
--    sincronizador del Sheet, `convertir_partida_a_plan`, código viejo) lo recibe DEDUCIDO por el
--    trigger, sin rechazo: el código viejo sigue andando con la base nueva.
-- 2. Cuando llega explícito se VALIDA contra el padre (subtarea sólo de una tarea, historia de una
--    épica o de un rubro, etc.). Una tarea colgada del rubro o de la épica se admite —es lo que hay
--    en las obras reales— y la pantalla la marca «sin historia · revisar».
-- 3. `costo_mo` sólo en historias y nunca negativo. NULL = sin costo, no pesa: NULL nunca es 0.
-- 4. `obra_historia_peso` se rehace: historia = nivel 'historia'; su avance es el PROMEDIO SIMPLE DE
--    SUS TAREAS (una tarea partida en frentes vale lo que el promedio de sus frentes); las subtareas
--    no cuentan; una tarea sin registro aporta 0 al promedio (no avanzó) y se cuenta en n_medidas.
--    Días teóricos y HH plan de la historia salen de sus tareas cuando ella no los trae.
-- 5. Insumos cargados desde la web: la cantidad puede quedar sin cargar (antes NOT NULL obligaba a
--    inventar un número para un activo como «Mini excavadora»).
--
-- Mapa de lo existente (24/09, leído en producción): 240 ítems vivos en 8 obras; 0 con costo_mo, 0 con
-- ponderación a mano, todas en metodo_ponderacion = 'costo_mo'. Rubro = resumen raíz; épica =
-- resumen hijo de rubro (sólo entrepiso-y-escalera); TAREA = toda ejecutable hija de un contenedor o
-- raíz (quedan «sin historia»); SUBTAREA = ejecutable hija de ejecutable (hoy ninguna viva).

alter table public.obra_actividad add column if not exists nivel text;
alter table public.obra_actividad drop constraint if exists obra_actividad_nivel_check;
alter table public.obra_actividad add constraint obra_actividad_nivel_check
  check (nivel is null or nivel in ('rubro', 'epica', 'historia', 'tarea', 'subtarea'));
comment on column public.obra_actividad.nivel is
  'Serie B: rubro › épica › historia › tarea › subtarea. Lo escribe la web; si llega NULL lo deduce el trigger obra_actividad_nivel_t desde el padre.';
grant select (nivel), insert (nivel), update (nivel) on public.obra_actividad to authenticated;

-- LA DEDUCCIÓN (una sola definición: la usan el relleno y el trigger).
-- p_hay_padre distingue «raíz» de «padre sin nivel todavía».
create or replace function public.nivel_deducido(p_tipo text, p_hay_padre boolean, p_padre_nivel text, p_padre_tipo text)
returns text language sql immutable as $fn$
  select case
    when not p_hay_padre then case when p_tipo = 'resumen' then 'rubro' else 'tarea' end
    when p_padre_nivel is null or p_padre_nivel = 'rubro' then case when p_tipo = 'resumen' then 'epica' else 'tarea' end
    when p_padre_nivel = 'epica' then case when p_tipo = 'resumen' then 'historia' else 'tarea' end
    when p_padre_nivel = 'historia' then 'tarea'
    when p_padre_nivel = 'tarea' then case when p_padre_tipo = 'resumen' then 'tarea' else 'subtarea' end
    else 'subtarea'
  end
$fn$;

-- EL RELLENO, de la raíz hacia abajo.
do $fn$
declare v_n int;
begin
  update public.obra_actividad set nivel = public.nivel_deducido(tipo, false, null, null)
   where actividad_padre_id is null and nivel is null;
  loop
    update public.obra_actividad h
       set nivel = public.nivel_deducido(h.tipo, true, p.nivel, p.tipo)
      from public.obra_actividad p
     where p.id = h.actividad_padre_id and h.nivel is null and p.nivel is not null;
    get diagnostics v_n = row_count;
    exit when v_n = 0;
  end loop;
end $fn$;

-- EL TRIGGER: deduce si falta, valida si llega.
create or replace function public.obra_actividad_nivel()
returns trigger language plpgsql as $fn$
declare
  v_pn text;
  v_pt text;
begin
  if new.actividad_padre_id is not null then
    select nivel, tipo into v_pn, v_pt from public.obra_actividad where id = new.actividad_padre_id;
  end if;
  if new.nivel is null then
    new.nivel := public.nivel_deducido(new.tipo, new.actividad_padre_id is not null, v_pn, v_pt);
    return new;
  end if;
  if new.nivel = 'rubro' and new.actividad_padre_id is not null then
    raise exception 'un rubro no cuelga de otro ítem';
  elsif new.nivel = 'epica' and coalesce(v_pn, '') <> 'rubro' then
    raise exception 'una épica cuelga de un rubro';
  elsif new.nivel = 'historia' and coalesce(v_pn, '') not in ('epica', 'rubro') then
    raise exception 'una historia cuelga de una épica (o del rubro, hasta que se armen las épicas)';
  elsif new.nivel = 'tarea' and new.actividad_padre_id is not null
        and not (coalesce(v_pn, '') in ('rubro', 'epica', 'historia') or (v_pn = 'tarea' and v_pt = 'resumen')) then
    raise exception 'una tarea cuelga de una historia (o de una tarea dividida en frentes)';
  elsif new.nivel = 'subtarea' and not (coalesce(v_pn, '') = 'tarea' and coalesce(v_pt, '') <> 'resumen') then
    raise exception 'una subtarea cuelga de una tarea, y no tiene hijas';
  end if;
  return new;
end $fn$;

drop trigger if exists obra_actividad_nivel_t on public.obra_actividad;
create trigger obra_actividad_nivel_t
  before insert or update of nivel, actividad_padre_id on public.obra_actividad
  for each row execute function public.obra_actividad_nivel();

-- EL COSTO DE MO ES DE LA HISTORIA.
alter table public.obra_actividad drop constraint if exists obra_actividad_costo_mo_historia;
alter table public.obra_actividad add constraint obra_actividad_costo_mo_historia
  check (costo_mo is null or (costo_mo >= 0 and nivel = 'historia'));

-- INSUMOS DESDE LA WEB: la cantidad puede faltar.
alter table public.obra_actividad_insumo_plan alter column cantidad_unitaria drop not null;
alter table public.obra_actividad_insumo_plan alter column cantidad_plan drop not null;

-- LAS HISTORIAS DE CADA OBRA, CON SU PESO Y EL AVANCE POR PROMEDIO DE TAREAS.
create or replace view public.obra_historia_peso
with (security_invoker = true) as
with recursive historias as (
  select a.id as actividad_id, a.obra_id, a.nombre, a.costo_mo, a.hh_plan
    from public.obra_actividad a
   where a.nivel = 'historia' and not a.archivada
),
tareas_por_padre as (
  select actividad_padre_id as padre_id, count(*)::numeric as n
    from public.obra_actividad
   where nivel = 'tarea' and not archivada and actividad_padre_id is not null
   group by actividad_padre_id
),
-- Cada tarea con la fracción de la historia que representa: 1/n entre hermanas, y un frente 1/n de
-- lo que valía la tarea que se dividió. Así el promedio es SIMPLE entre tareas, no entre hojas.
arbol as (
  select h.actividad_id as historia_id, a.id, a.tipo, a.inicio_plan, a.fin_plan, a.hh_plan,
         1.0 / t.n as factor
    from historias h
    join public.obra_actividad a on a.actividad_padre_id = h.actividad_id and a.nivel = 'tarea' and not a.archivada
    join tareas_por_padre t on t.padre_id = h.actividad_id
  union all
  select r.historia_id, c.id, c.tipo, c.inicio_plan, c.fin_plan, c.hh_plan, r.factor / t.n
    from arbol r
    join public.obra_actividad c on c.actividad_padre_id = r.id and c.nivel = 'tarea' and not c.archivada
    join tareas_por_padre t on t.padre_id = r.id
   where r.tipo = 'resumen'
),
hojas as (
  select r.historia_id,
         sum(r.factor * coalesce(av.avance_pct, 0)) as avance_pct,
         count(*) filter (where av.avance_pct is not null) as n_medidas,
         count(*) as n_hojas,
         min(r.inicio_plan) as inicio_plan,
         max(r.fin_plan) as fin_plan,
         sum(r.hh_plan) as hh_plan
    from arbol r
    left join public.actividad_avance av on av.actividad_id = r.id
   where not exists (select 1 from tareas_por_padre t where t.padre_id = r.id)
   group by r.historia_id
),
base as (
  select h.actividad_id, h.obra_id, h.nombre, h.costo_mo,
         coalesce(h.hh_plan, l.hh_plan) as hh_plan,
         case when l.inicio_plan is not null and l.fin_plan is not null
              then public.dias_habiles(h.obra_id, l.inicio_plan, l.fin_plan) end as dias_teoricos,
         l.avance_pct, l.n_medidas, l.n_hojas
    from historias h
    left join hojas l on l.historia_id = h.actividad_id
),
-- El peso a mano de cada nodo: su ponderación por la de su padre, hasta la raíz (override «A mano»).
cadena as (
  select a.id, case when a.ponderacion is null then null else a.ponderacion / 100.0 end as peso_manual
    from public.obra_actividad a
   where a.actividad_padre_id is null and not a.archivada
  union all
  select a.id, case when a.ponderacion is null or c.peso_manual is null then null else c.peso_manual * a.ponderacion / 100.0 end
    from public.obra_actividad a
    join cadena c on c.id = a.actividad_padre_id
   where not a.archivada
),
totales as (
  select obra_id,
         sum(costo_mo) as costo_mo_total,
         sum(hh_plan) as hh_plan_total,
         sum(dias_teoricos) as dias_teoricos_total,
         count(*) as n_historias
    from base
   group by obra_id
)
select b.actividad_id, b.obra_id, b.nombre, b.costo_mo,
       o.metodo_ponderacion,
       case o.metodo_ponderacion
         when 'costo_mo' then case when b.costo_mo is not null and t.costo_mo_total > 0 then b.costo_mo / t.costo_mo_total end
         when 'parejo' then 1.0 / nullif(t.n_historias, 0)
         when 'hh_plan' then case when b.hh_plan is not null and t.hh_plan_total > 0 then b.hh_plan / t.hh_plan_total end
         when 'dias_teoricos' then case when b.dias_teoricos is not null and t.dias_teoricos_total > 0 then b.dias_teoricos::numeric / t.dias_teoricos_total end
         when 'manual' then c.peso_manual
         else null
       end as peso,
       (b.costo_mo is null) as sin_costo,
       round(coalesce(b.avance_pct, 0), 1) as avance_pct,
       coalesce(b.n_medidas, 0)::int as n_medidas,
       coalesce(b.n_hojas, 0)::int as n_hojas
  from base b
  join public.obra_canonica o on o.id = b.obra_id
  left join totales t on t.obra_id = b.obra_id
  left join cadena c on c.id = b.actividad_id;

grant select on public.obra_historia_peso to authenticated;
