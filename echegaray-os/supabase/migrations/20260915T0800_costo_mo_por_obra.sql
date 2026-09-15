-- UNA SOLA DEFINICIÓN DEL COSTO DE MANO DE OBRA POR OBRA, Y LA FOTO DE CADA QUINCENA CERRADA.
--
-- ═══ POR QUÉ (auditoría del 14/09/2026) ═══
--
-- Quattropani 01–14/09: el OS cargaba $6,15 M de mano de obra; el modelo del dueño da ≈ $3,86 M. Cinco
-- defectos, todos de `costo_de_obras_a_la_fecha` (20260913T2300) y de la solapa «Costo a la obra»:
--
--   1. el jefe mensual cargaba el MES ENTERO a la fecha (neto ÷ horas del mes hasta hoy) × 1,671;
--   2. el multiplicador promedio 1,671 se aplicaba al $/h TOTAL, incluida la parte en negro;
--   3. las horas sin tarifa quedaban en «parcial»;
--   4. las quincenas cerradas no se sellaban: el costo de enero cambiaba con la tarifa de hoy;
--   5. la página Obras leía `obra_costo_real.costo_mano_de_obra` (compras con área «personas») y
--      decía $0 para Quattropani.
--
-- ═══ EL MODELO (decisiones del dueño, 14/09/2026) ═══
--
--   OBRERO  costo = costo_total_empleador del recibo (bruto + contribuciones) + negro.
--           negro = (horas − horas del recibo) × $/h negro, más el recargo de extras de la planilla.
--           Sin recibo del período: blanco = mitad de las horas × piso de la categoría; costo empleador
--           = bruto × factor costo_total/bruto (mediana de SUS recibos o, si no hay, del plantel).
--   JEFE    (persona_tarifa.neto_mensual) costo = costo_total_empleador + (neto_mensual/2 − neto del
--           recibo). MEDIO sueldo por quincena, no el mes a la fecha. Sin recibo: estimado igual.
--   REPARTO proporcional a las horas de la persona en cada obra, con la cuenta de `horasDelDia`:
--           (EL JEFE DE OBRA NO SE REPARTE — dueño, 14/09/2026: entero a Estructura – Administración)
--           lo trabajado de todas las fuentes (también lo completado por la app); un día sin trabajo
--           vale la licencia/ausencia PAGA de más horas. Esa licencia va a la obra de la fila o a la
--           ASIGNADA ese día (regla de `asignacion-del-dia.mjs`); sin ninguna, a Estructura (obra null).
--   SIN TARIFA → estado 'falta_dato', con sus horas y el blanco que sí se sabe; el total queda null.
--   CERRADA quincena con todos sus grupos cerrados = LO PAGADO REAL (dueño, 14/09/2026): costo empleador del
--           recibo + (cobra − neto) de la línea de la liquidación. Jefe sin línea: + (neto_mensual/2 − neto).
--           Recibo sin línea: sólo el recibo. Línea sin recibo: lo pagado. Todo lo incompleto, «estimado».
--   ABIERTA el modelo de arriba, siempre «estimado».
--   A MANO  lo escrito en Liquidación manda: `negro_manual` (importe), `horas_negro_manual` y `horas_manual`
--           (20260915T0300 y T0510). El reparto entre obras sigue siendo por las horas cargadas.
--
-- El espejo en JS es `orquestador/lib/costo-mo-quincena.mjs`; `costo-mo-quincena.pg.test.mjs` compara
-- las dos sobre los datos reales. El multiplicador (`multiplicador_de_costo`, `costo-hora-derivado.mjs`)
-- deja de intervenir en la mano de obra por obra; sigue existiendo para la solapa Costo hora, la caja de
-- nómina y el cotizador.
--
-- NO se borra `ficha_cliente_cache` (un refresco masivo ya tumbó Postgres): se invalidan a mano los
-- clientes afectados después de aplicar.

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. LA FOTO
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.costo_obra_quincena (
  id              uuid primary key default gen_random_uuid(),
  quincena_desde  date not null,
  quincena_hasta  date not null,
  -- null = ESTRUCTURA: horas pagas sin obra. Sin FK: las obras se fusionan y la foto no se reescribe.
  obra_canonica_id text,
  -- null = horas de una fila sin persona (legacy): FALTA_DATO.
  persona_id      uuid references public.personas(id),
  horas           numeric not null,
  costo_blanco    numeric,
  costo_negro     numeric,
  costo_total     numeric,
  estado          text not null,
  origen          text not null,
  -- «obra» o ESTRUCTURA: ES-ADM (Administración) · ES-TAL (Taller). «tenemos q considerar la unidad de
  -- negocio estructura taller admin, al momento de asignar un gasto» (dueño, 14/09/2026).
  destino         text not null default 'obra',
  sellado_en      timestamptz not null default now(),
  constraint costo_obra_quincena_estado check (estado in ('real', 'estimado', 'falta_dato')),
  constraint costo_obra_quincena_destino check (
    destino in ('obra', 'ES-ADM', 'ES-TAL') and (destino = 'obra') = (obra_canonica_id is not null)),
  constraint costo_obra_quincena_es_quincena check (
    extract(day from quincena_desde) in (1, 16) and quincena_hasta >= quincena_desde),
  -- UN FALTA_DATO NO TIENE TOTAL: un número ahí sería el «parcial» que esta migración elimina.
  constraint costo_obra_quincena_total_coherente check (
    (estado = 'falta_dato') = (costo_total is null))
);

-- NULLS NOT DISTINCT: Estructura y las filas sin persona son NULL, y un único común no las restringiría.
create unique index if not exists costo_obra_quincena_clave
  on public.costo_obra_quincena (quincena_desde, obra_canonica_id, persona_id, destino) nulls not distinct;
create index if not exists costo_obra_quincena_obra
  on public.costo_obra_quincena (obra_canonica_id, quincena_desde);

comment on table public.costo_obra_quincena is
  'Foto sellada del costo de mano de obra de cada quincena cerrada, por obra (null = Estructura) y persona. '
  'La escribe sellar_costo_obra_quincena (service_role). Modelo: 20260915T0800.';

alter table public.costo_obra_quincena enable row level security;

-- LEE QUIEN VE SUELDOS: es la suma de recibos y tarifas, que ya tienen esta puerta (`liquida_sueldos()`).
-- `ve_economia()` hoy es el mismo conjunto de roles; se nombran las dos para que ninguna pantalla de
-- economía quede en cero si algún día se separan.
drop policy if exists costo_obra_quincena_lee on public.costo_obra_quincena;
create policy costo_obra_quincena_lee on public.costo_obra_quincena
  for select to authenticated
  using ((select public.liquida_sueldos()) or (select public.ve_economia()));
drop policy if exists costo_obra_quincena_srv on public.costo_obra_quincena;
create policy costo_obra_quincena_srv on public.costo_obra_quincena
  for all to service_role using (true) with check (true);

revoke all on public.costo_obra_quincena from public, anon;
grant select on public.costo_obra_quincena to authenticated;
revoke insert, update, delete on public.costo_obra_quincena from authenticated;
grant all on public.costo_obra_quincena to service_role;

-- LA HISTORIA DE LAS FOTOS (auditoría 14/09/2026): re-sellar NUNCA borra sin rastro. Cada foto reemplazada se
-- copia acá con el momento en que se reemplazó.
create table if not exists public.costo_obra_quincena_historia (
  historia_id      uuid primary key default gen_random_uuid(),
  id               uuid not null,
  quincena_desde   date not null,
  quincena_hasta   date not null,
  obra_canonica_id text,
  persona_id       uuid,
  horas            numeric not null,
  costo_blanco     numeric,
  costo_negro      numeric,
  costo_total      numeric,
  estado           text not null,
  origen           text not null,
  destino          text not null,
  sellado_en       timestamptz not null,
  reemplazado_en   timestamptz not null default now()
);
create index if not exists costo_obra_quincena_historia_quincena
  on public.costo_obra_quincena_historia (quincena_desde, reemplazado_en);
alter table public.costo_obra_quincena_historia enable row level security;
drop policy if exists costo_obra_quincena_historia_lee on public.costo_obra_quincena_historia;
create policy costo_obra_quincena_historia_lee on public.costo_obra_quincena_historia
  for select to authenticated
  using ((select public.liquida_sueldos()) or (select public.ve_economia()));
drop policy if exists costo_obra_quincena_historia_srv on public.costo_obra_quincena_historia;
create policy costo_obra_quincena_historia_srv on public.costo_obra_quincena_historia
  for all to service_role using (true) with check (true);
revoke all on public.costo_obra_quincena_historia from public, anon;
grant select on public.costo_obra_quincena_historia to authenticated;
revoke insert, update, delete on public.costo_obra_quincena_historia from authenticated;
grant all on public.costo_obra_quincena_historia to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. EL CÁLCULO (la definición)
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- `security invoker`: corre con la RLS de quien pregunta. Sin `liquida_sueldos()` las tarifas y los
-- recibos no se leen y todo sale 'falta_dato'; los consumidores ya publican `puede_ver_tarifas`.
-- El cuerpo sólo lee tablas (ninguna función propia) para que el cotejo pueda correrlo como SELECT.

create or replace function public.costo_mo_quincena_calculo(p_desde date, p_obras text[] default null)
 returns table (quincena_desde date, quincena_hasta date, obra_canonica_id text, persona_id uuid,
                horas numeric, costo_blanco numeric, costo_negro numeric, costo_total numeric,
                estado text, origen text, destino text)
 language sql
 stable
 set search_path to 'public'
as $function$
with q as (
  select p_desde as desde,
         case when extract(day from p_desde) = 1 then p_desde + 14
              else (date_trunc('month', p_desde) + interval '1 month - 1 day')::date end as hasta,
         case when extract(day from p_desde) = 1 then 'Q1-' else 'Q2-' end || to_char(p_desde, 'MM/YYYY') as periodo,
         to_char(p_desde, 'YYYY-MM') || case when extract(day from p_desde) = 1 then '-1' else '-2' end as orden,
         -- CERRADA = todos sus grupos de liquidación cerrados: se costea con lo pagado real.
         coalesce((select bool_and(lq.estado = 'cerrada') from public.liquidacion_quincena lq where lq.desde = p_desde), false) as cerrada
   where extract(day from p_desde) in (1, 16)
),
filas as (
  select r.persona_id, r.fecha, r.obra_canonica_id, r.horas, r.tipo_hora, r.notas,
         r.tipo_hora in ('normal', 'extra_50', 'extra_100') as trabajada,
         -- EL COEFICIENTE DE EXTRAS DE LA PLANILLA (`coeficienteDeLaFila`): «extras =4+3*1,5» → 1,5.
         case when r.tipo_hora not in ('extra_50', 'extra_100') then 1::numeric
              when x.m is not null then coalesce(replace(x.m[1], ',', '.')::numeric, 1)
              when r.tipo_hora = 'extra_100' then 2::numeric else 1.5 end as coef
    from public.registros_hh r
    cross join q
    left join lateral (select regexp_match(coalesce(r.notas, ''),
      'extras\s*=\s*[0-9]+(?:[.,][0-9]+)?\s*\+\s*[0-9]+(?:[.,][0-9]+)?(?:\s*\*\s*([0-9]+(?:[.,][0-9]+)?))?') as m) x on true
   where r.fecha between q.desde and q.hasta
     and r.fecha <= current_date
),
dias as (
  select f.persona_id, f.fecha, bool_or(f.trabajada) as con_trabajo
    from filas f where f.persona_id is not null group by 1, 2
),
trabajo as (
  select f.persona_id, f.obra_canonica_id as obra, sum(f.horas) as horas, sum(f.horas * f.coef) as equivalentes
    from filas f where f.trabajada and f.persona_id is not null group by 1, 2
),
-- UN DÍA NO TRABAJADO VALE UN DÍA: la fila PAGA de más horas; entre iguales, la que trae obra.
declarada as (
  select distinct on (f.persona_id, f.fecha) f.persona_id, f.fecha, f.horas, f.obra_canonica_id
    from filas f
    join dias d on d.persona_id = f.persona_id and d.fecha = f.fecha and not d.con_trabajo
   where f.tipo_hora in ('ausencia', 'licencia')
     and btrim(coalesce(f.notas, '')) in ('enfermedad', 'accidente', 'accidente_in_itinere', 'vacaciones', 'licencia_especial', 'franco', 'lluvia', 'sin_tarea', 'permiso')
     and f.horas > 0
   order by f.persona_id, f.fecha, f.horas desc, (f.obra_canonica_id is null)
),
licencia as (
  select d.persona_id, coalesce(d.obra_canonica_id, a.obra) as obra, d.horas
    from declarada d
    left join lateral (
      -- LA ASIGNACIÓN DEL DÍA (`asignacion-del-dia.mjs`): la más corta; empatadas, la de `desde` más
      -- reciente; empate total, ninguna.
      select case when count(distinct t.obra_id) = 1 then min(t.obra_id) end as obra
        from (select x.obra_id,
                     rank() over (order by case when x.desde is null or x.hasta is null then null
                                               else x.hasta - x.desde + 1 end asc nulls last,
                                           x.desde desc nulls last) as rk
                from public.obra_asignacion x
               where x.persona_id = d.persona_id and x.obra_id is not null
                 and (x.desde is null or x.desde <= d.fecha)
                 and (x.hasta is null or d.fecha <= x.hasta)) t
       where t.rk = 1
    ) a on d.obra_canonica_id is null
),
horas_obra as (
  select u.persona_id, u.obra, sum(u.horas) as horas
    from (select t.persona_id, t.obra, t.horas from trabajo t
          union all select l.persona_id, l.obra, l.horas from licencia l) u
   group by 1, 2
),
horas_persona as (
  select u.persona_id, sum(u.horas) as horas, sum(u.equivalentes) as equivalentes
    from (select t.persona_id, t.horas, t.equivalentes from trabajo t
          union all select l.persona_id, l.horas, l.horas from licencia l) u
   group by 1
),
recibos as (
  select r.id, r.persona_id, regexp_replace(coalesce(r.cuil, ''), '\D', '', 'g') as cuil, btrim(r.periodo) as periodo,
         r.horas_blanco, r.bruto, r.neto, r.costo_total_empleador,
         case when btrim(r.periodo) ~ '^Q[12]-[0-9]{2}/[0-9]{4}$'
              then substr(btrim(r.periodo), 7, 4) || '-' || substr(btrim(r.periodo), 4, 2) || '-' || substr(btrim(r.periodo), 2, 1) end as orden
    from public.recibo_sueldo_linea r
),
escalas as (
  select e.desde, e.valor_hora,
         btrim(regexp_replace(lower(translate(e.convenio, 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç', 'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')), '[^a-z0-9]+', '_', 'g'), '_') as conv,
         btrim(regexp_replace(lower(translate(e.categoria, 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç', 'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')), '[^a-z0-9]+', '_', 'g'), '_') as cat
    from public.convenio_escala e where e.valor_hora > 0
),
personas_q as (
  select p.id, regexp_replace(coalesce(p.cuil, ''), '\D', '', 'g') as cuil,
         btrim(regexp_replace(lower(translate(coalesce(p.convenio_colectivo, ''), 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç', 'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')), '[^a-z0-9]+', '_', 'g'), '_') as conv,
         btrim(regexp_replace(lower(translate(coalesce(p.categoria, ''), 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç', 'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')), '[^a-z0-9]+', '_', 'g'), '_') as cat,
         p.fecha_ingreso, p.fecha_egreso,
         -- TALLER POR EL PUESTO: hoy sólo los jefes tienen puesto cargado, así que casi todo cae en ES-ADM.
         coalesce(p.puesto, '') ~* '(taller|mec[aáÁ]nic)' as es_taller,
         -- EL JEFE DE OBRA: el corte de `esJefeDeObra(puesto)` y de `hh_que_cuentan_en_obra` (20260915T0840).
         coalesce(regexp_replace(lower(trim(p.puesto)), '[[:space:]_-]+', '_', 'g') in ('jefe_de_obra', 'jefe_obra'), false) as es_jefe
    from public.personas p
   where coalesce(p.es_prueba, false) = false
),
base as (
  select p.id, p.es_taller, p.es_jefe, q.desde, q.hasta, q.periodo, q.cerrada,
         coalesce(hp.horas, 0) as horas, coalesce(hp.equivalentes, 0) as equivalentes,
         rc.id is not null as con_recibo, rc.horas_blanco as r_hb, rc.bruto as r_bruto, rc.neto as r_neto,
         rc.costo_total_empleador as r_cte,
         ll.horas_recibo_manual as m_hb, ll.valor_hora_recibo_manual as m_vh, ll.valor_hora as l_vh,
         ll.negro_manual as m_negro, ll.horas_negro_manual as m_hneg,
         -- LAS HORAS ESCRITAS A MANO mandan para el blanco estimado y el negro; el reparto sigue por las cargadas.
         coalesce(ll.horas_manual, hp.horas, 0) as horas_c,
         tf.valor_hora as t_vh, tf.neto_mensual as t_nm_vig,
         case when tf.vigente is null then tp.neto_mensual else tf.neto_mensual end as t_nm,
         (tf.vigente is null and tp.neto_mensual is not null) as nm_retro, ll.cobra as l_cobra,
         coalesce(fp.v, fpl.v) as factor,
         case when fp.v is not null then 'persona' when fpl.v is not null then 'plantel' end as factor_origen,
         pi.valor_hora as piso, cn.valor as cociente, cn.origen as cociente_origen,
         (p.fecha_ingreso is null or p.fecha_ingreso <= q.hasta) and (p.fecha_egreso is null or p.fecha_egreso >= q.desde) as activo
    from personas_q p
    cross join q
    left join horas_persona hp on hp.persona_id = p.id
    left join lateral (
      select r.* from recibos r
       where r.periodo = q.periodo and (r.persona_id = p.id or (r.persona_id is null and r.cuil <> '' and r.cuil = p.cuil))
       order by (r.persona_id = p.id) desc nulls last limit 1) rc on true
    left join lateral (
      select l.horas_recibo_manual, l.valor_hora_recibo_manual, l.valor_hora,
             l.negro_manual, l.horas_manual, l.horas_negro_manual, coalesce(l.cobra_manual, l.cobra) as cobra
        from public.liquidacion_linea l join public.liquidacion_quincena lq on lq.id = l.liquidacion_id
       where lq.desde = q.desde and l.persona_id = p.id
       order by l.sellado_en desc nulls last limit 1) ll on true
    left join lateral (
      select t.persona_id as vigente, t.valor_hora, t.neto_mensual from public.persona_tarifa t
       where t.persona_id = p.id and t.desde <= q.hasta order by t.desde desc limit 1) tf on true
    -- SIN NINGÚN TRAMO VIGENTE, EL PRIMER NETO MENSUAL HACIA ATRÁS: «el 1,8 M es el TOTAL que cobran» (dueño) rige
    -- antes del 01/09, día en que se cargó en el OS. Se marca estimado.
    left join lateral (
      select t.neto_mensual from public.persona_tarifa t
       where t.persona_id = p.id and t.neto_mensual is not null order by t.desde limit 1) tp on true
    -- EL FACTOR costo_total/bruto: la mediana de SUS recibos quincenales con costo empleador.
    left join lateral (
      select percentile_cont(0.5) within group (order by r.costo_total_empleador / r.bruto)::numeric as v
        from recibos r
       where r.orden is not null and r.costo_total_empleador is not null and r.bruto > 0
         and (r.persona_id = p.id or (r.persona_id is null and r.cuil <> '' and r.cuil = p.cuil))) fp on true
    -- …o la del plantel.
    left join lateral (
      select percentile_cont(0.5) within group (order by r.costo_total_empleador / r.bruto)::numeric as v
        from recibos r
       where r.orden is not null and r.costo_total_empleador is not null and r.bruto > 0) fpl on true
    left join lateral (
      select e.valor_hora from escalas e
       where p.conv <> '' and p.cat <> '' and e.conv = p.conv and e.cat = p.cat and e.desde <= q.hasta
       order by e.desde desc limit 1) pi on true
    -- EL COCIENTE NETO/BRUTO DEL NETO ESTIMADO (`proporcionDelNeto`): la mediana de hasta sus últimos 6
    -- recibos quincenales del año anteriores al período (≥ 2 y dentro de [0,60; 0,90]); si no, la del plantel.
    left join lateral (
      select case when s.v between 0.6 and 0.9 then s.v else pl.v end as valor,
             case when s.v between 0.6 and 0.9 then 'persona' when pl.v is not null then 'plantel' end as origen
        from (select case when count(*) >= 2 then percentile_cont(0.5) within group (order by z.c)::numeric end as v
                from (select r.neto / r.bruto as c from recibos r
                       where r.orden is not null and left(r.orden, 4) = left(q.orden, 4) and r.orden < q.orden
                         and r.bruto > 0 and r.neto is not null
                         and (r.persona_id = p.id or (r.persona_id is null and r.cuil <> '' and r.cuil = p.cuil))
                       order by r.orden desc limit 6) z) s,
             (select percentile_cont(0.5) within group (order by r.neto / r.bruto)::numeric as v from recibos r
               where r.orden is not null and left(r.orden, 4) = left(q.orden, 4) and r.orden < q.orden
                 and r.bruto > 0 and r.neto is not null and r.neto / r.bruto between 0.6 and 0.9) pl
    ) cn on true
),
-- EL PLANTEL DE LA QUINCENA: horas pagas, recibo del período, o sueldo mensual vigente estando activo.
plantel as (
  select b.*,
         case when b.con_recibo then coalesce(b.m_hb, b.r_hb) else coalesce(b.m_hb, b.horas_c / 2) end as hb,
         case when b.con_recibo then null else coalesce(b.m_vh, b.piso) end as vh_est
    from base b
   where b.horas > 0 or b.con_recibo or (b.cerrada and b.l_cobra is not null) or (b.activo and b.t_nm_vig is not null)
),
valores as (
  select x.*,
         case when x.con_recibo and x.r_cte is not null then x.r_cte
              when x.con_recibo then x.r_bruto * x.factor
              -- CERRADA SIN RECIBO: no se estima con el modelo; el costo es lo pagado.
              when x.cerrada then null
              else x.hb * x.vh_est * x.factor end as c_blanco,
         (x.con_recibo and x.r_cte is not null) as blanco_real,
         case when x.con_recibo then x.r_neto when x.cerrada then null else x.hb * x.vh_est * x.cociente end as neto,
         coalesce(x.l_vh, x.t_vh) as vh_negro,
         coalesce(x.m_hneg, greatest(0, x.horas_c - x.hb) + greatest(0, x.equivalentes - x.horas)) as unidades_negro
    from plantel x
),
costeado as (
  select v.*,
         case
           -- QUINCENA CERRADA = LO PAGADO REAL (dueño, 14/09/2026): cobra − neto de la línea de la liquidación.
           when v.cerrada and v.l_cobra is not null then v.l_cobra - coalesce(v.r_neto, 0)
           when v.cerrada and v.t_nm is not null and v.neto is not null then v.t_nm / 2 - v.neto
           when v.cerrada and v.con_recibo then 0
           when v.cerrada then null
           -- QUINCENA ABIERTA = MODELO. El importe negro escrito a mano manda: no hace falta tarifa para saberlo.
           when v.m_negro is not null then v.m_negro
           when v.vh_negro is not null then v.unidades_negro * v.vh_negro
           when v.t_nm is not null then v.t_nm / 2 - v.neto
           -- sin tarifa y sin horas: no hay horas fuera del recibo que pagar
           when v.horas_c = 0 and v.equivalentes = v.horas then 0
         end as c_negro,
         case when v.cerrada then not (v.l_cobra is not null and v.r_neto is not null)
              else v.m_negro is null and v.vh_negro is null and v.t_nm is not null and (not v.con_recibo or v.nm_retro) end as negro_estimado
    from valores v
),
personas_costo as (
  select c.*,
         case when c.c_negro is null then null
              when c.c_blanco is not null then c.c_blanco + c.c_negro
              -- LÍNEA SIN RECIBO EN UNA CERRADA: lo pagado es el costo (Jofre, Sosa).
              when c.cerrada and c.l_cobra is not null and not c.con_recibo then c.c_negro end as c_total,
         case when c.c_negro is null or (c.c_blanco is null and not (c.cerrada and c.l_cobra is not null and not c.con_recibo)) then 'falta_dato'
              -- REAL SÓLO EN UNA CERRADA CON RECIBO Y LÍNEA: la quincena abierta es modelo.
              when c.cerrada and c.blanco_real and c.l_cobra is not null and not c.negro_estimado then 'real'
              else 'estimado' end as estado_,
         concat_ws(' · ',
           case when c.blanco_real then 'blanco: recibo ' || c.periodo || ' costo total empleador'
                when c.cerrada and not c.con_recibo then 'blanco: sin recibo del período'
                when c.con_recibo then format('blanco: bruto recibo %s × factor %s (%s)', c.periodo, round(c.factor, 4), coalesce(c.factor_origen, 'sin factor'))
                else format('blanco: estimado %s h × piso %s × factor %s (%s)', round(c.hb, 2), round(c.vh_est, 2), round(c.factor, 4), coalesce(c.factor_origen, 'sin factor')) end,
           case when c.cerrada and c.l_cobra is not null then format('negro: pagado fuera del recibo (cobra %s − neto %s)', c.l_cobra, coalesce(c.r_neto, 0))
                when c.cerrada and c.t_nm is not null and c.neto is not null then format('negro: sin línea sellada, %s − neto %s%s', c.t_nm / 2, c.neto,
                  case when c.nm_retro then ' · primer tramo de neto mensual, hacia atrás' else '' end)
                when c.cerrada and c.con_recibo then 'negro: sin línea sellada — sólo el costo del recibo'
                when c.cerrada then 'sin recibo ni línea de la quincena cerrada (FALTA_DATO)'
                when c.m_negro is not null then 'negro: escrito a mano en Liquidación'
                when c.vh_negro is not null then format('negro: %s h × $/h %s', round(c.unidades_negro, 2), c.vh_negro)
                when c.t_nm is null then 'negro: sin tarifa (FALTA_DATO)'
                when c.neto is null then 'negro: sin neto del recibo ni estimado'
                when c.con_recibo then format('negro: %s − neto recibo %s', c.t_nm / 2, c.neto)
                else format('negro: %s − neto est. (cociente %s %s) %s', c.t_nm / 2, round(c.cociente, 4), c.cociente_origen, round(c.neto, 2)) end
         ) as origen_
    from costeado c
),
-- EL REPARTO: por las horas de la persona en cada obra. Sin horas, entero a Estructura.
-- EL JEFE DE OBRA NUNCA ES COSTO DE UNA OBRA: «quitar los jefes de obra de la consideración de horas de cualquiera
-- de las horas» (dueño, 14/09/2026). Su costo entero va a Estructura – Administración con todas sus horas, aunque
-- las haya cargado en una obra. Lo que se paga no cambia: Liquidación lo sigue calculando igual.
repartido_obra as (
  select pc.desde, pc.hasta, ho.obra, pc.id as persona,
         case when pc.es_jefe then pc.horas else coalesce(ho.horas, 0) end::numeric as horas_,
         pc.c_blanco * k.k as blanco, pc.c_negro * k.k as negro, pc.c_total * k.k as total, pc.estado_, pc.origen_,
         -- ESTRUCTURA: sin obra → Administración (o Taller si el puesto lo dice); una obra de tipo taller /
         -- estructura / administracion tampoco es una obra. Los jefes: lo que no tiene obra, a Administración.
         case when pc.es_jefe then 'ES-ADM'
              when ho.obra is null then case when pc.es_taller then 'ES-TAL' else 'ES-ADM' end
              when lower(coalesce(oc.tipo, '')) = 'taller' then 'ES-TAL'
              when lower(coalesce(oc.tipo, '')) in ('estructura', 'administracion') then 'ES-ADM'
              else 'obra' end as destino_
    from personas_costo pc
    left join horas_obra ho on pc.horas > 0 and not pc.es_jefe and ho.persona_id = pc.id and ho.horas > 0
    left join public.obra_canonica oc on oc.id = ho.obra
    cross join lateral (select case when pc.horas > 0 and not pc.es_jefe then ho.horas / pc.horas else 1 end as k) k
),
repartido as (
  select r.desde, r.hasta, case when r.destino_ = 'obra' then r.obra end as obra, r.persona, sum(r.horas_) as horas_,
         sum(r.blanco) as blanco, sum(r.negro) as negro, sum(r.total) as total, r.estado_, r.origen_, r.destino_
    from repartido_obra r
   group by r.desde, r.hasta, case when r.destino_ = 'obra' then r.obra end, r.persona, r.estado_, r.origen_, r.destino_
),
-- LAS HORAS SIN PERSONA (filas legacy) NO SE PIERDEN: FALTA_DATO por obra.
sin_persona as (
  select q.desde, q.hasta, case when d.destino = 'obra' then f.obra_canonica_id end as obra, null::uuid as persona,
         sum(f.horas)::numeric as horas_, null::numeric as blanco, null::numeric as negro, null::numeric as total,
         'falta_dato'::text as estado_, 'horas sin persona (FALTA_DATO)'::text as origen_, d.destino as destino_
    from filas f cross join q
    left join public.obra_canonica oc on oc.id = f.obra_canonica_id
    cross join lateral (select case when lower(coalesce(oc.tipo, '')) = 'taller' then 'ES-TAL'
                                    when lower(coalesce(oc.tipo, '')) in ('estructura', 'administracion') then 'ES-ADM'
                                    else 'obra' end as destino) d
   where f.persona_id is null and f.trabajada
   group by q.desde, q.hasta, case when d.destino = 'obra' then f.obra_canonica_id end, d.destino
)
select t.desde, t.hasta, t.obra, t.persona, t.horas_, t.blanco, t.negro, t.total, t.estado_, t.origen_, t.destino_
  from (select * from repartido union all select * from sin_persona) t
 where p_obras is null or t.obra = any (p_obras)
 order by t.persona nulls last, t.obra nulls last
$function$;

revoke all on function public.costo_mo_quincena_calculo(date, text[]) from public, anon;
grant execute on function public.costo_mo_quincena_calculo(date, text[]) to authenticated, service_role;

comment on function public.costo_mo_quincena_calculo(date, text[]) is
  'EL COSTO DE MANO DE OBRA DE UNA QUINCENA por obra (null = Estructura) y persona, en vivo. Modelo del '
  'dueño 14/09/2026 (20260915T0800). Espejo JS: orquestador/lib/costo-mo-quincena.mjs.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. LA LECTURA: la foto si la quincena está sellada; si no, el cálculo en vivo
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.costo_mo_quincena(p_desde date, p_obras text[] default null)
 returns table (quincena_desde date, quincena_hasta date, obra_canonica_id text, persona_id uuid,
                horas numeric, costo_blanco numeric, costo_negro numeric, costo_total numeric,
                estado text, origen text, destino text, sellado_en timestamptz, reabierta boolean)
 language sql
 stable
 set search_path to 'public'
as $function$
  with foto as (
    -- LA FOTO SÓLO VALE MIENTRAS LA QUINCENA SIGA CERRADA: reabierta, se calcula en vivo y se marca.
    select exists (select 1 from public.costo_obra_quincena s where s.quincena_desde = p_desde) as hay,
           not exists (select 1 from public.liquidacion_quincena lq
                        where lq.desde = p_desde and lq.estado <> 'cerrada') as sigue_cerrada
  )
  select s.quincena_desde, s.quincena_hasta, s.obra_canonica_id, s.persona_id, s.horas, s.costo_blanco,
         s.costo_negro, s.costo_total, s.estado, s.origen, s.destino, s.sellado_en, false as reabierta
    from foto f, public.costo_obra_quincena s
   where f.hay and f.sigue_cerrada and s.quincena_desde = p_desde
     and (p_obras is null or s.obra_canonica_id = any (p_obras))
  union all
  select c.quincena_desde, c.quincena_hasta, c.obra_canonica_id, c.persona_id, c.horas, c.costo_blanco,
         c.costo_negro, c.costo_total, c.estado, c.origen, c.destino, null::timestamptz, f.hay as reabierta
    from foto f, public.costo_mo_quincena_calculo(p_desde, p_obras) c
   where not (f.hay and f.sigue_cerrada)
$function$;

revoke all on function public.costo_mo_quincena(date, text[]) from public, anon;
grant execute on function public.costo_mo_quincena(date, text[]) to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. EL SELLADO: delete + insert en la misma transacción, idempotente
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.sellar_costo_obra_quincena(p_desde date)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
declare
  n integer;
begin
  if p_desde is null or extract(day from p_desde) not in (1, 16) then
    raise exception 'sellar_costo_obra_quincena: % no es el primer día de una quincena', p_desde;
  end if;
  -- DOS CIERRES A LA VEZ DE LA MISMA QUINCENA NO SE PISAN: el segundo espera y reescribe la misma foto.
  perform pg_advisory_xact_lock(20260915, (extract(epoch from p_desde) / 86400)::int);
  -- LA FOTO ANTERIOR NO SE PIERDE: pasa a la historia antes de reescribirse.
  insert into public.costo_obra_quincena_historia
         (id, quincena_desde, quincena_hasta, obra_canonica_id, persona_id, horas, costo_blanco, costo_negro,
          costo_total, estado, origen, destino, sellado_en)
  select h.id, h.quincena_desde, h.quincena_hasta, h.obra_canonica_id, h.persona_id, h.horas, h.costo_blanco,
         h.costo_negro, h.costo_total, h.estado, h.origen, h.destino, h.sellado_en
    from public.costo_obra_quincena h where h.quincena_desde = p_desde;
  delete from public.costo_obra_quincena where quincena_desde = p_desde;
  insert into public.costo_obra_quincena
         (quincena_desde, quincena_hasta, obra_canonica_id, persona_id, horas, costo_blanco, costo_negro,
          costo_total, estado, origen, destino, sellado_en)
  select c.quincena_desde, c.quincena_hasta, c.obra_canonica_id, c.persona_id, c.horas, c.costo_blanco,
         c.costo_negro, c.costo_total, c.estado, c.origen, c.destino, now()
    from public.costo_mo_quincena_calculo(p_desde, null) c;
  get diagnostics n = row_count;
  return n;
end
$function$;

-- LA ESCRIBE SÓLO LA CLAVE DE SERVICIO (la acción de cierre, después de preguntar el rol).
revoke all on function public.sellar_costo_obra_quincena(date) from public, anon, authenticated;
grant execute on function public.sellar_costo_obra_quincena(date) to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 5. LA MANO DE OBRA A LA FECHA (build sobre la definición viva, md5 f38551e32aa46d6873fb615f2526b440,
--    igual a 20260913T2300). Materiales: sin cambios. Mano de obra: selladas + abiertas en vivo.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.costo_de_obras_a_la_fecha(p_obras text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  -- ── MATERIALES: LAS COMPRAS ASIGNADAS A LA OBRA, A LA FECHA ─────────────────────────────────────
  materiales as (
    select a.obra_id,
           sum(c.total) filter (where not x.es_subcontrato and not x.futuro)      as materiales,
           sum(c.total) filter (where x.es_subcontrato and not x.futuro)          as subcontratos,
           count(*)     filter (where not x.es_subcontrato and not x.futuro)::int as n_comprobantes,
           max(c.fecha) filter (where not x.es_subcontrato and not x.futuro)      as ultimo_comprobante,
           -- LO COMPRADO CON FECHA FUTURA NO ES COSTO A LA FECHA: viaja aparte y el `title` lo dice.
           sum(c.total) filter (where x.futuro)                                   as comprometido_futuro
      from public.costos_obra c
      -- EL PUENTE ES LA ASIGNACIÓN, NO EL TEXTO DE LA COLUMNA J.
      join public.compra_obra_asignada a on a.referencia = c.referencia_externa
      left join public.compra_sheet s on c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
      cross join lateral (
        select coalesce(s.familia_material, '') = 'Subcontratos y mano de obra' as es_subcontrato,
               coalesce(c.fecha > current_date, false)                          as futuro) x
     where c.origen = 'compras_sheet'
       and a.obra_id = any (p_obras)
       and c.area is distinct from 'personas'
       and c.area is distinct from 'contabilidad_legales'
       and c.area is distinct from 'administracion_finanzas'
       and coalesce(s.anulada, false) = false
       and upper(trim(coalesce(s.estado, ''))) <> 'ELIMINADO'
     group by a.obra_id
  ),
  -- ── MANO DE OBRA: LA DEFINICIÓN ÚNICA (20260915T0800), QUINCENA POR QUINCENA ────────────────────
  -- Desde la quincena de la primera hora de estas obras hasta hoy. Cada quincena sale de la foto si
  -- está sellada o del cálculo en vivo si no; el costo del jefe es medio sueldo por quincena, no el mes.
  quincenas as (
    select g::date as desde
      from (select min(r.fecha) as primera from public.hh_que_cuentan_en_obra r
             where r.obra_canonica_id = any (p_obras) and r.fecha <= current_date) m
      cross join lateral generate_series(date_trunc('month', m.primera), current_date::timestamp, interval '1 day') g
     where m.primera is not null and extract(day from g) in (1, 16)
  ),
  mo as (
    select x.* from quincenas qq cross join lateral public.costo_mo_quincena(qq.desde, p_obras) x
  ),
  mano_obra as (
    select m.obra_canonica_id as obra_id,
           sum(m.costo_total) filter (where m.estado <> 'falta_dato') as mano_obra,
           sum(m.costo_total) filter (where m.estado = 'real')        as mano_obra_real,
           sum(m.costo_total) filter (where m.estado = 'estimado')    as mano_obra_estimada,
           sum(m.horas)       filter (where m.estado <> 'falta_dato') as horas_valorizadas,
           sum(m.horas)       filter (where m.estado = 'falta_dato')  as horas_sin_tarifa,
           count(distinct m.persona_id) filter (where m.estado = 'falta_dato')::int as personas_sin_tarifa,
           -- QUIÉN FALTA Y POR QUÉ: nunca un cero en silencio.
           jsonb_agg(jsonb_build_object('persona_id', m.persona_id, 'nombre', pe.nombre_completo,
                                        'quincena', m.quincena_desde, 'horas', m.horas, 'origen', m.origen)
                     order by m.quincena_desde, pe.nombre_completo)
             filter (where m.estado = 'falta_dato') as falta_dato,
           max(m.quincena_hasta) filter (where m.sellado_en is not null) as sellado_hasta
      from mo m
      left join public.personas pe on pe.id = m.persona_id
     where m.obra_canonica_id is not null
     group by m.obra_canonica_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'obra_id', o.obra_id,
           'materiales', k.materiales, 'subcontratos', k.subcontratos,
           'n_comprobantes', k.n_comprobantes, 'ultimo_comprobante', k.ultimo_comprobante,
           'comprometido_futuro', k.comprometido_futuro,
           'mano_obra', h.mano_obra, 'mano_obra_real', h.mano_obra_real,
           'mano_obra_estimada', h.mano_obra_estimada, 'horas_valorizadas', h.horas_valorizadas,
           'horas_sin_tarifa', h.horas_sin_tarifa, 'personas_sin_tarifa', coalesce(h.personas_sin_tarifa, 0),
           'falta_dato', coalesce(h.falta_dato, '[]'::jsonb), 'sellado_hasta', h.sellado_hasta,
           'puede_ver_tarifas', public.liquida_sueldos(),
           -- LA FECHA DE CORTE VIAJA CON EL DATO: el `title` dice «a la fecha dd/mm» con ésta.
           'corte', current_date)), '[]'::jsonb)
    from (select distinct unnest(p_obras) as obra_id) o
    left join materiales k on k.obra_id = o.obra_id
    left join mano_obra h on h.obra_id = o.obra_id
   -- Una obra sin compras y sin horas NO viaja: la pantalla dibuja «—» por ausencia de fila.
   where k.obra_id is not null or h.obra_id is not null
$function$;

revoke all on function public.costo_de_obras_a_la_fecha(text[]) from public;
grant execute on function public.costo_de_obras_a_la_fecha(text[]) to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 6. EL SELLADO NO CORRE AL APLICAR (auditoría 14/09/2026)
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Esta migración sólo crea la tabla, la historia y las funciones. Las quincenas ya cerradas las sella una
-- persona, cuando el dueño confirme la base de costo, con `orquestador/scripts/sellar-costo-obra-dry.mjs`
-- (dry por defecto). De acá en adelante también la sella `cerrarQuincenaAction` al cerrar.

notify pgrst, 'reload schema';
