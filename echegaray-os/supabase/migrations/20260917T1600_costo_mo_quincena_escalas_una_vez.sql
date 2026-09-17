-- LA MANO DE OBRA POR QUINCENA SE CALCULABA PERSONA POR PERSONA CONTRA TODA LA ESCALA (17/09/2026).
--
-- «app.ecsas.com.ar súper lenta» (dueño, 17/09). Medido: `pantalla_clientes()` 2,9 s, de los que 2,45 s
-- son `costo_mo_de_obras` — 18 quincenas recalculadas en vivo porque `costo_obra_quincena` no tiene
-- ninguna foto sellada (se sella cuando el dueño confirma la base de costo). EXPLAIN ANALYZE de UNA
-- quincena: 252 ms, de los que 207 ms son el LATERAL de `escalas`. Referenciada una sola vez, Postgres
-- la inlineaba y corría translate + regexp_replace sobre las 184 filas de `convenio_escala` para cada
-- una de las 46 personas. Otros 22 ms: la mediana neto/bruto del plantel, que no depende de la persona,
-- recalculada 46 veces.
--
-- Con `escalas` materializada, el mismo costo reaparecía del otro lado: `personas_q` (una sola referencia,
-- inlineada) normalizaba el convenio y la categoría de la persona en cada fila de la escala.
--
-- EL CAMBIO ES SÓLO DE PLAN: `escalas` y `personas_q` pasan a MATERIALIZED y la mediana del plantel a una
-- CTE materializada. Misma consulta, mismos resultados (md5 del jsonb idéntico antes y después, por obra,
-- por quincena y la pantalla entera). No se tocan permisos: CREATE OR REPLACE conserva dueño y grants.
-- La sospecha sobre `cuenta_corriente_de_clientes` (20260917T1200) se descartó: la vista tarda 61 ms.

CREATE OR REPLACE FUNCTION public.costo_mo_quincena_calculo(p_desde date, p_obras text[] DEFAULT NULL::text[])
 RETURNS TABLE(quincena_desde date, quincena_hasta date, obra_canonica_id text, persona_id uuid, horas numeric, costo_blanco numeric, costo_negro numeric, costo_total numeric, estado text, origen text, destino text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
-- SE CALCULA UNA VEZ POR QUINCENA (17/09/2026): inlineada, la normalización corría por cada persona.
escalas as materialized (
  select e.desde, e.valor_hora,
         btrim(regexp_replace(lower(translate(e.convenio, 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç', 'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')), '[^a-z0-9]+', '_', 'g'), '_') as conv,
         btrim(regexp_replace(lower(translate(e.categoria, 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç', 'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')), '[^a-z0-9]+', '_', 'g'), '_') as cat
    from public.convenio_escala e where e.valor_hora > 0
),
-- LA MEDIANA NETO/BRUTO DEL PLANTEL no depende de la persona: una vez por quincena (17/09/2026).
cociente_plantel as materialized (
  select percentile_cont(0.5) within group (order by r.neto / r.bruto)::numeric as v
    from recibos r cross join q
   where r.orden is not null and left(r.orden, 4) = left(q.orden, 4) and r.orden < q.orden
     and r.bruto > 0 and r.neto is not null and r.neto / r.bruto between 0.6 and 0.9
),
-- UNA VEZ POR PERSONA (17/09/2026): inlineada, su convenio y categoría se normalizaban por cada fila de la escala.
personas_q as materialized (
  select p.id, regexp_replace(coalesce(p.cuil, ''), '\D', '', 'g') as cuil,
         btrim(regexp_replace(lower(translate(coalesce(p.convenio_colectivo, ''), 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç', 'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')), '[^a-z0-9]+', '_', 'g'), '_') as conv,
         btrim(regexp_replace(lower(translate(coalesce(p.categoria, ''), 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç', 'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')), '[^a-z0-9]+', '_', 'g'), '_') as cat,
         p.fecha_ingreso, p.fecha_egreso,
         -- TALLER POR EL PUESTO: hoy sólo los jefes tienen puesto cargado, así que casi todo cae en ES-ADM.
         coalesce(p.puesto, '') ~* '(taller|mec[aáÁ]nic)' as es_taller,
         -- EL JEFE DE OBRA: el corte de `esJefeDeObra(puesto)` y de `hh_que_cuentan_en_obra` (20260915T0840).
         coalesce(regexp_replace(lower(trim(p.puesto)), '[[:space:]_-]+', '_', 'g') in ('jefe_de_obra', 'jefe_obra'), false) as es_jefe,
         -- LA CUADRILLA DE UN SUBCONTRATISTA (20260915T0910): la obra de su subcontrato.
         sc.obra_id as sub_obra
    from public.persona_para_costo() p
    left join public.subcontrato sc on sc.id = p.subcontrato_id
),
base as (
  select p.id, p.es_taller, p.es_jefe, p.sub_obra, q.desde, q.hasta, q.periodo, q.cerrada,
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
         (p.fecha_ingreso is not null and p.fecha_ingreso <= q.hasta) and (p.fecha_egreso is null or p.fecha_egreso >= q.desde) as activo
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
             cociente_plantel pl
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
-- LA CUADRILLA DE UN SUBCONTRATISTA (dueño, 15/09/2026): su costo va ENTERO a la obra del subcontrato, nunca a
-- Estructura, tenga o no horas. Gana sobre la regla del jefe y sobre el reparto por horas.
repartido_obra as (
  select pc.desde, pc.hasta, coalesce(pc.sub_obra, ho.obra) as obra, pc.id as persona,
         case when pc.sub_obra is not null or pc.es_jefe then pc.horas else coalesce(ho.horas, 0) end::numeric as horas_,
         pc.c_blanco * k.k as blanco, pc.c_negro * k.k as negro, pc.c_total * k.k as total, pc.estado_, pc.origen_,
         -- ESTRUCTURA: sin obra → Administración (o Taller si el puesto lo dice); una obra de tipo taller /
         -- estructura / administracion tampoco es una obra. Los jefes: lo que no tiene obra, a Administración.
         case when pc.sub_obra is not null then 'obra'
              when pc.es_jefe then 'ES-ADM'
              when ho.obra is null then case when pc.es_taller then 'ES-TAL' else 'ES-ADM' end
              when lower(coalesce(oc.tipo, '')) = 'taller' then 'ES-TAL'
              when lower(coalesce(oc.tipo, '')) in ('estructura', 'administracion') then 'ES-ADM'
              else 'obra' end as destino_
    from personas_costo pc
    left join horas_obra ho on pc.horas > 0 and not pc.es_jefe and pc.sub_obra is null and ho.persona_id = pc.id and ho.horas > 0
    left join public.obra_canonica oc on oc.id = ho.obra
    cross join lateral (select case when pc.horas > 0 and not pc.es_jefe and pc.sub_obra is null then ho.horas / pc.horas else 1 end as k) k
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
