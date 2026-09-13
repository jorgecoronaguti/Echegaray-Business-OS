-- ═══ LAS HH DE UNA OBRA SON LAS DE JORNALES · OFICINA A VALOR HORA IMPLÍCITO (13/09/2026) ═════════
--
-- DOS DECISIONES DEL DUEÑO, en una sola migración porque tocan el mismo bloque de `pantalla_cliente`.
-- Se parte de las definiciones VIVAS (`pg_get_functiondef`): `pantalla_cliente` es plpgsql desde
-- `20260913T1100` y este archivo lo conserva; copiar la versión sql de un archivo viejo revertiría
-- el arreglo que destrabó la ficha.
--
-- ═══ 1 · EN EL CRM, LAS HH REALES SON SÓLO LAS DE LA PLANILLA ═══
--
-- «Están mal las HH de la obra Quattropani porque no leíste de JORNALES la quincena anterior, la
-- fecha de inicio y exactamente las personas involucradas; rehacer y revisar en todas las obras.»
-- JORNALES, celda por celda, tiene en Quattropani dos personas desde el bloque del 17/08; la ficha le
-- sumaba 114 h de filas cargadas en la app (Maldonado 80 h `web:asistencia-obra`, cuatro
-- `web:presencia-defecto` del 11/09, Agüero 2 h `web:obra`). Mismo patrón en pisos-industriales,
-- messina-playon-dilucion-acido, entrepiso-y-escalera e instalacion-electrica.
--
-- Regla: `hh_obra` (HH, registros, personas, inicio, última carga), `hh_de_obra` (quincenas, personas,
-- celdas) y `costo_obra.mano_obra` cuentan SÓLO `fuente_legacy = 'sheet:jornales'`. Lo demás NO se
-- borra: viaja en `sin_respaldo` (persona, horas, días) y la pantalla lo dice aparte. `hh_plan` sigue
-- saliendo de `obra_plan_vs_real`, que NO se toca: la usa el módulo Obras. Liquidación tampoco: ahí
-- la app carga el día en curso a propósito, antes de que exista en la planilla.
--
-- ═══ 2 · OFICINA SE CARGA A LA OBRA CON UN VALOR HORA IMPLÍCITO ═══
--
-- «El costo de obra incluye a quien la dirige.» Quien tiene `persona_tarifa.neto_mensual` y no
-- `valor_hora` se valoriza a:
--
--   neto_mensual vigente al DÍA 1 del mes ÷ horas TRABAJADAS de la planilla de esa persona en el mes
--
-- en todas sus obras; sin neto o con divisor 0 no se valoriza (sigue en `horas_sin_tarifa`, nunca
-- $ 0); después, el mismo multiplicador. La mano de obra de esa persona en el mes, sumada sobre sus
-- obras, cierra en neto × multiplicador. El neto es el del día 1 porque el mes necesita UN neto, y un
-- tramo que empieza el 20 no puede valer para el 5. La misma regla está en `valorHoraDeCosto`
-- (`costoHora.ts`).
--
-- HOY NO VALORIZA NINGUNA FILA, y es lo correcto: las horas de Maldonado y Nievas en la planilla son
-- de enero a agosto (san-francisco y la-estrella) y su único neto rige desde el 01/09/2026; sus
-- 80 h de septiembre en Quattropani y SF Pisos son `web:asistencia-obra`, sin respaldo en JORNALES.
-- `liquidacion_linea` no tiene quincenas selladas de Oficina, así que no hay de dónde probar un neto
-- anterior. La regla queda escrita para el primer mes que coincidan.
--
-- NO SE TOCA NINGUNA VISTA.

CREATE OR REPLACE FUNCTION public.pantalla_cliente(p_slug text, p_solapa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  return (
with elegido as (
    select c.cliente_id from public.cliente_panel c where c.slug = p_slug
  ),
  -- SUS OBRAS, UNA VEZ. Las usan tres claves: la lista de la ficha, la actividad y el recorte de
  -- los certificados. Sin el CTE, la misma vista se recorrería tres veces en el mismo viaje.
  sus_obras as (
    select o.* from public.obra_panel o
     where o.cliente_id = (select cliente_id from elegido)
  ),
  -- ═══ EL MULTIPLICADOR, UNA VEZ POR TRAMO Y NO UNA VEZ POR FILA ═══
  --
  -- `multiplicador_de_costo` es una función SQL con cláusula `SET search_path`, y una función con
  -- `SET` NO SE INLINEA: el planner no puede meter su cuerpo en la consulta, así que la llama de
  -- verdad, una vez por fila, y cada llamada escanea `costo_hora_alicuota` —que tiene RLS— y vuelve
  -- a evaluar el portero. El `SET` no se saca: es una propiedad de seguridad de la función.
  --
  -- Este CTE la llama una vez por cada `desde` DISTINTO de la tabla. Es exacto, no una aproximación:
  -- el conjunto de alícuotas vigentes sólo cambia en esos días, así que para cualquier fecha el
  -- multiplicador es el del mayor `desde` que ya empezó. Los dos totales coinciden al centavo.
  tramos_de_costo as (
    select d.desde, public.multiplicador_de_costo(d.desde, 1) as v
      from (select distinct a.desde from public.costo_hora_alicuota a) d
  ),
  -- ═══ EL DIVISOR DEL SUELDO MENSUAL (dueño, 13/09/2026) ═══
  --
  -- Las horas TRABAJADAS de la PLANILLA de cada persona con sueldo mensual, por mes calendario, en
  -- TODAS sus obras —no sólo las de este cliente—: con las de la ficha, cada cliente le cargaría a sus
  -- obras el sueldo entero. Es el mismo conjunto que se valoriza (`sheet:jornales`): con otro, el mes
  -- no cerraría. Licencia y ausencia no dividen.
  horas_del_mes as (
    select r.persona_id, date_trunc('month', r.fecha)::date as mes, sum(r.horas) as horas
      from public.registros_hh r
     where r.tipo_hora in ('normal', 'extra_50', 'extra_100')
       and r.fuente_legacy = 'sheet:jornales'
       and r.persona_id in (select p.persona_id from public.persona_tarifa p where p.neto_mensual is not null)
     group by 1, 2
  )
  select jsonb_build_object(

    -- LA FICHA. `null` = no existe o no la puedo ver; la pantalla ya distingue eso de un error.
    'cliente', (select to_jsonb(c) from public.cliente_panel c where c.slug = p_slug),

    'perfil', (
      select jsonb_build_object('id', p.id, 'rol', p.rol, 'nombre', p.nombre,
                                'created_at', p.created_at, 'updated_at', p.updated_at)
        from public.perfiles p
       where p.id = (select auth.uid())
    ),

    -- LOS RESPONSABLES POSIBLES, sin las identidades de prueba: nombrar responsable a una cuenta de
    -- QA es una decisión de negocio tomada por accidente. Se filtra por `es_prueba`, no por texto.
    'responsables', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol)
                                order by p.nombre), '[]'::jsonb)
        from public.perfiles p where p.es_prueba = false
    ),

    'contactos', (
      select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
        from public.cliente_contacto k
       where k.cliente_id = (select cliente_id from elegido)
    ),

    'obras', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from sus_obras o),

    -- LO QUE OBRAS PUBLICA POR OBRA. Sin recortar por cliente: la ficha usa el mapa completo, igual
    -- que la cartera, y recortarlo acá sería una regla nueva que nadie pidió.
    'economia_obras', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', e.obra_canonica_id, 'contratado', e.contratado,
                                  'obra_padre_id', e.obra_padre_id,
                                  -- EL CONTRATO EN SU MONEDA Y EL DÓLAR CON QUE SE VALUÓ: Quattropani
                                  -- se firmó en U$S y el peso equivalente cambia solo de un día para
                                  -- otro. Los dos viajan; la pantalla decide cuál muestra.
                                  'contratado_usd', e.contratado_usd, 'tipo_cambio', e.tipo_cambio,
                                  'origen', e.origen, 'referencia', e.referencia, 'nota', e.nota,
                                  -- LOS DOS TOTALES DE OC NO SE SUMAN: `ventana` es lo que el cliente
                                  -- emitió dentro del año que acota el contratado e `historico` lo de
                                  -- otros años, que en una obra fusionada son órdenes viejas.
                                  'oc_civa_ventana', e.oc_civa_ventana,
                                  'oc_civa_historico', e.oc_civa_historico,
                                  'oc_n_ventana', e.oc_n_ventana,
                                  'oc_n_historico', e.oc_n_historico,
                                  'contrato_mano_obra', e.contrato_mano_obra,
                                  'contrato_mano_obra_usd', e.contrato_mano_obra_usd,
                                  'contrato_materiales', e.contrato_materiales,
                                  'contrato_materiales_usd', e.contrato_materiales_usd,
                                  'contrato_total', e.contrato_total,
                                  'contrato_fuente', e.contrato_fuente,
                                  'contrato_fuente_drive_id', e.contrato_fuente_drive_id,
                                  'contrato_fuente_nombre', e.contrato_fuente_nombre,
                                  'contrato_cita', e.contrato_cita,
                                  'contrato_nota', e.contrato_nota)), '[]'::jsonb)
        from public.obra_economia_cartera e
    ),

    -- LO COBRADO POR TRABAJO — la MISMA vista y las MISMAS ocho columnas que `/clientes`. La ficha
    -- del CRM lo necesita para decir si un trabajo cobró; con una lectura propia, las dos pantallas
    -- del módulo volverían a poder decir números distintos sobre la misma obra.
    'cobrado_por_obra', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'obra_id', u.obra_id, 'cobrado_total', u.cobrado_total,
               'cobrado_neto', u.cobrado_neto, 'por_cobrar', u.por_cobrar, 'vencido', u.vencido,
               'proximo_cobro_fecha', u.proximo_cobro_fecha,
               'proximo_cobro_medio', u.proximo_cobro_medio,
               'imputacion', u.imputacion)), '[]'::jsonb)
        from public.obra_cuenta u
       where u.cliente_id = (select cliente_id from elegido)
    ),

    -- ═══ LAS HORAS DE CADA OBRA (dueño, 11/09/2026) ═══
    --
    -- `hh_real` y `hh_plan` NO se calculan acá: se leen de `obra_plan_vs_real`, la cara canónica de
    -- las HH por obra. Lo que se agrega es lo que ninguna vista publica —desde cuándo, cuántos
    -- registros, cuánta gente, hasta cuándo—, contando LAS MISMAS FILAS que la vista sumó.
    --
    -- Una obra sin horas ni plan NO viaja: la pantalla dibuja «—» por ausencia de fila, y mandar
    -- once filas de nulls sería peso para decir nada.
    'hh_obra', case
      when p_solapa is not null and p_solapa not in ('obras', 'actividad') then '[]'::jsonb
      -- LA GUARDA DE ROL: ver la cabecera. Media suma parece una suma.
      when not (select public.es_administracion()) then null::jsonb
      else (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'obra_id', v.obra_id, 'hh_real', v.hh_real, 'hh_plan', v.hh_plan,
                 'registros', v.registros, 'personas', v.personas,
                 'inicio_real', v.inicio_real, 'ultima_fecha', v.ultima_fecha,
                 -- LO CARGADO EN LA APP QUE JORNALES NO RESPALDA: no suma, se dice aparte.
                 'sin_respaldo', v.sin_respaldo)), '[]'::jsonb)
          from (
            -- ═══ LAS HH DE LA OBRA SON LAS DE JORNALES (dueño, 13/09/2026) ═══
            --
            -- `hh_plan` se sigue leyendo de `obra_plan_vs_real`. `hh_real`, registros, personas,
            -- inicio y última carga salen SÓLO de las filas `sheet:jornales`: la vista suma también lo
            -- cargado en la app, y en Quattropani eso eran 114 h y cinco personas que la planilla no
            -- tiene. La vista no se toca —la usa el módulo Obras—; el CRM lee la planilla.
            select w.obra_id, r.hh_real, w.hh_plan,
                   r.registros, r.personas, r.inicio_real, r.ultima_fecha, s.sin_respaldo
              from public.obra_plan_vs_real w
              left join lateral (
                select sum(x.horas)                         as hh_real,
                       count(*)::int                        as registros,
                       count(distinct x.persona_id)::int    as personas,
                       min(x.fecha)                         as inicio_real,
                       max(x.fecha)                         as ultima_fecha
                  from public.registros_hh x
                 where x.obra_canonica_id = w.obra_id
                   and x.tipo_hora in ('normal', 'extra_50', 'extra_100')
                   and x.fuente_legacy = 'sheet:jornales') r on true
              -- LO QUE LA APP CARGÓ Y LA PLANILLA NO TIENE: persona, horas y días. Nunca se borra.
              left join lateral (
                select jsonb_agg(jsonb_build_object('persona_id', y.persona_id, 'nombre', y.nombre,
                                                    'horas', y.horas, 'dias', y.dias)
                                 order by y.horas desc) as sin_respaldo
                  from (select x.persona_id,
                               (select pe.nombre_completo from public.personas pe where pe.id = x.persona_id) as nombre,
                               sum(x.horas) as horas,
                               to_jsonb(array_agg(distinct x.fecha order by x.fecha)) as dias
                          from public.registros_hh x
                         where x.obra_canonica_id = w.obra_id
                           and x.tipo_hora in ('normal', 'extra_50', 'extra_100')
                           and x.fuente_legacy is distinct from 'sheet:jornales'
                         group by x.persona_id) y) s on true
             where w.obra_id in (select o.obra_id from sus_obras o)
               and (r.hh_real is not null or w.hh_plan is not null or s.sin_respaldo is not null)
          ) v
      )
    end,

    -- ═══ LO QUE LLEVA GASTADO CADA OBRA (dueño, 12/09/2026) ═══
    --
    -- Dos columnas: MATERIALES (lo comprado e imputado a la obra) y MANO DE OBRA (sus horas
    -- valorizadas). De dónde sale cada una, qué se excluye y por qué, en la cabecera de esta
    -- migración. Una obra sin comprobantes y sin horas NO viaja: la pantalla dibuja «—» por ausencia
    -- de fila, y mandar trece filas de nulls es peso para no decir nada.
    'costo_obra', case
      when p_solapa is not null and p_solapa <> 'obras' then '[]'::jsonb
      -- LA GUARDA DE ROL: ver la cabecera. `null` = no puedo decirlo; `[]` = nadie gastó nada.
      when not (select public.es_administracion()) then null::jsonb
      else (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'obra_id', v.obra_id,
                 'materiales', v.materiales, 'subcontratos', v.subcontratos,
                 'n_comprobantes', v.n_comprobantes, 'ultimo_comprobante', v.ultimo_comprobante,
                 'mano_obra', v.mano_obra, 'horas_valorizadas', v.horas_valorizadas,
                 'horas_sin_tarifa', v.horas_sin_tarifa,
                 'personas_sin_tarifa', v.personas_sin_tarifa,
                 'multiplicador', v.multiplicador,
                 'puede_ver_tarifas', v.puede_ver_tarifas,
                 -- LOS SUELDOS MENSUALES REPARTIDOS, uno por persona y mes: el `title` de la celda
                 -- dice «neto mensual ÷ N h del mes» con estos números, no con otros.
                 'implicito', coalesce(v.implicito, '[]'::jsonb))), '[]'::jsonb)
          from (
            select o.obra_id,
                   k.materiales, k.subcontratos, k.n_comprobantes, k.ultimo_comprobante,
                   h.mano_obra, h.horas_valorizadas, h.horas_sin_tarifa, h.personas_sin_tarifa,
                   h.implicito,
                   -- EL MULTIPLICADOR DE HOY, para que la celda pueda decir QUÉ FALTA cuando no
                   -- puede valorizar. No es el que se usa en la cuenta —ahí se usa el vigente a la
                   -- fecha de CADA registro—: es el que explica el hueco.
                   public.multiplicador_de_costo(current_date) as multiplicador,
                   -- `persona_tarifa` y `costo_hora_alicuota` tienen RLS por `liquida_sueldos()`,
                   -- más angosto que `es_administracion()`. Sin este campo, «no tengo permiso» se
                   -- dibujaría igual que «falta cargar la tarifa».
                   public.liquida_sueldos() as puede_ver_tarifas
              from sus_obras o
              -- ── MATERIALES: LAS MISMAS FILAS QUE `obra_costo_real`, DESGLOSADAS ────────────────
              left join (
                select a.obra_id,
                       sum(c.total)   filter (where not x.es_subcontrato)          as materiales,
                       sum(c.total)   filter (where x.es_subcontrato)              as subcontratos,
                       count(*)       filter (where not x.es_subcontrato)::int     as n_comprobantes,
                       max(c.fecha)   filter (where not x.es_subcontrato)          as ultimo_comprobante
                  from public.costos_obra c
                  -- EL MISMO PUENTE QUE `obra_costo_real`: el eje canónico, nunca texto contra texto.
                  join public.obra_alias a
                    on a.alias = public.norm_obra(c.obra_texto)
                   and a.clasificacion in ('obra', 'mantenimiento')
                  -- EL ESTADO Y EL RUBRO NO ESTÁN EN EL ESPEJO: se leen de la fila del Sheet por
                  -- `referencia_externa`. El cruce cierra 893 de 893 (medido 12/09/2026); una fila
                  -- que no cruzara quedaría como material y NO desaparecería del total.
                  left join public.compra_sheet s
                    on c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
                  cross join lateral (select coalesce(s.familia_material, '') = 'Subcontratos y mano de obra'
                                        as es_subcontrato) x
                 where c.area is distinct from 'personas'
                   and c.area is distinct from 'contabilidad_legales'
                   and c.area is distinct from 'administracion_finanzas'
                   and coalesce(s.anulada, false) = false
                 group by a.obra_id) k on k.obra_id = o.obra_id
              -- ── MANO DE OBRA: LA REGLA DE «COSTO A LA OBRA», A LA FECHA DE CADA REGISTRO ───────
              --
              -- DOS PISOS. El de adentro valoriza por persona y mes —la unidad en la que un sueldo
              -- mensual se reparte—; el de afuera suma por obra. Sumar sumas numeric es exacto: para
              -- quien cobra por hora el total es EL MISMO, centavo por centavo, que el de 20260912T1300.
              left join (
                select g.obra_id,
                       sum(g.costo) as mano_obra,
                       sum(g.h_ok)  as horas_valorizadas,
                       -- LO QUE NO SE PUDO VALORIZAR, EN HORAS. Sin esto, «$ 1,2 M» de una obra a la
                       -- que le falta la tarifa de seis personas se leería como el costo completo.
                       sum(g.h_no)  as horas_sin_tarifa,
                       count(distinct g.persona_id) filter (where g.sin_tarifa)::int as personas_sin_tarifa,
                       jsonb_agg(jsonb_build_object(
                                   'persona_id', g.persona_id, 'mes', g.mes,
                                   'neto_mensual', g.neto_mensual, 'horas_mes', g.horas_mes,
                                   'horas', g.h_ok) order by g.mes, g.persona_id)
                         filter (where g.neto_mensual is not null and g.h_ok is not null) as implicito
                  from (
                    select r.obra_canonica_id as obra_id, r.persona_id, u.mes, u.neto_mensual, u.horas_mes,
                           sum(u.bolsillo * m.v)
                             filter (where u.bolsillo is not null and m.v is not null) as costo,
                           sum(r.horas)
                             filter (where u.bolsillo is not null and m.v is not null) as h_ok,
                           sum(r.horas)
                             filter (where u.bolsillo is null or m.v is null)         as h_no,
                           bool_or(u.bolsillo is null)                                as sin_tarifa
                      from public.registros_hh r
                      -- LA TARIFA VIGENTE A LA FECHA DEL REGISTRO, no la de hoy: una hora de marzo costó
                      -- lo que costaba en marzo, y valuar el acumulado a la tarifa de hoy lo infla con la
                      -- inflación del año. Es la MISMA regla de «la de mayor desde que ya empezó» que
                      -- aplica `getValorHoraVigente`, evaluada en la fecha que corresponde.
                      left join lateral (
                        select p.valor_hora from public.persona_tarifa p
                         where p.persona_id = r.persona_id and p.desde <= r.fecha
                         order by p.desde desc limit 1) t on true
                      -- ═══ EL SUELDO MENSUAL (dueño, 13/09/2026) ═══
                      --
                      -- Sólo cuando el tramo de la fecha no trae `valor_hora`: el `t.valor_hora is null`
                      -- es un filtro sobre la fila de afuera y el planner no escanea nada para quien
                      -- cobra por hora. El neto es el vigente al DÍA 1 del mes —uno solo por mes, para
                      -- que el mes cierre; y un tramo que empieza el 20 no vale para el 5—.
                      left join lateral (
                        select p.neto_mensual from public.persona_tarifa p
                         where t.valor_hora is null
                           and p.persona_id = r.persona_id and p.desde <= date_trunc('month', r.fecha)::date
                         order by p.desde desc limit 1) n on true
                      left join horas_del_mes hm
                        on hm.persona_id = r.persona_id and hm.mes = date_trunc('month', r.fecha)::date
                      -- EL BOLSILLO DE LA FILA. Por hora: horas × valor_hora. Mensual: horas × neto ÷
                      -- horas del mes, multiplicando ANTES de dividir para que el redondeo sea uno solo.
                      -- Sin neto, o con divisor 0, es null: la hora sale en `horas_sin_tarifa`, nunca $ 0.
                      cross join lateral (
                        select date_trunc('month', r.fecha)::date as mes,
                               case when t.valor_hora is null and hm.horas > 0 then n.neto_mensual end as neto_mensual,
                               case when t.valor_hora is null and n.neto_mensual is not null and hm.horas > 0
                                    then hm.horas end as horas_mes,
                               case when t.valor_hora is not null then r.horas * t.valor_hora
                                    when hm.horas > 0 then r.horas * n.neto_mensual / hm.horas end as bolsillo) u
                      -- EL TRAMO QUE REGÍA A LA FECHA DEL REGISTRO. La misma regla de «el de mayor
                      -- desde que ya empezó» que la tarifa de arriba, sobre un CTE de cinco filas en vez
                      -- de una llamada a función por cada uno de los 3.356 registros. Sin tramo que
                      -- empiece antes, `m.v` es null y esas horas salen en `horas_sin_tarifa`: es lo
                      -- mismo que devolvía la función, y sigue sin ser un 1.
                      left join lateral (
                        select x.v from tramos_de_costo x
                         where x.desde <= r.fecha
                         order by x.desde desc limit 1) m on true
                     where r.obra_canonica_id in (select o2.obra_id from sus_obras o2)
                       -- EL MISMO FILTRO DE TIPO DE HORA QUE `hh_obra` Y QUE LA SOLAPA: una ausencia no
                       -- se trabajó y una licencia la paga la empresa, no la obra.
                       and r.tipo_hora in ('normal', 'extra_50', 'extra_100')
                       -- SÓLO LA PLANILLA (dueño, 13/09/2026): lo cargado en la app sin respaldo en
                       -- JORNALES no le cuesta a la obra, igual que no le suma HH.
                       and r.fuente_legacy = 'sheet:jornales'
                     group by 1, 2, 3, 4, 5) g
                 group by g.obra_id) h on h.obra_id = o.obra_id
             where k.n_comprobantes is not null
                or h.horas_valorizadas is not null
                or h.horas_sin_tarifa is not null
          ) v
      )
    end,

    -- LO CONTRATADO Y LO COBRADO DEL CLIENTE, sumado por la base. `null` cuando el rol no ve
    -- economía (`ve_economia()` adentro de la vista) o cuando el cliente no tiene fila.
    'economia_cliente', (
      select jsonb_build_object(
               'cliente_id', x.cliente_id, 'contratado', x.contratado,
               'contratado_en_curso', x.contratado_en_curso, 'n_obras_en_curso', x.n_obras_en_curso,
               'n_obras_cerradas', x.n_obras_cerradas, 'n_obras_con_precio', x.n_obras_con_precio,
               'n_obras_sin_precio', x.n_obras_sin_precio, 'costo_real', x.costo_real,
               'facturado_90d', x.facturado_90d, 'cobrado_90d', x.cobrado_90d,
               'cobrado_total', x.cobrado_total, 'cobrado_neto_total', x.cobrado_neto_total,
               'saldo', x.saldo, 'vencido', x.vencido, 'por_vencer', x.por_vencer,
               'pendiente_contractual', x.pendiente_contractual)
        from public.cliente_economia x
       where x.cliente_id = (select cliente_id from elegido)
    ),

    -- LOS PAPELES DEL CLIENTE, con `atribucion`: la ficha muestra CÓMO se ató cada uno a su obra.
    'papeles', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'obra_id', r.obra_id, 'tipo', r.tipo, 'numero', r.numero,
               'fecha', r.fecha, 'importe', r.importe, 'moneda', r.moneda, 'cita', r.cita,
               'nombre_archivo', r.nombre_archivo, 'atribucion', r.atribucion,
               'drive_file_id', r.drive_file_id)), '[]'::jsonb)
        from public.cliente_orden r
       where r.cliente_id = (select cliente_id from elegido)
         and r.eliminado_en is null
    ),

    -- CUÁNTOS VÍNCULOS A DRIVE TIENE, SIEMPRE. La barra de solapas escribe «Documentos · N» en
    -- las nueve caras, y sin esta cuenta recortar las filas convertiría ese N en un cero falso —
    -- que es peor que el peso que se ahorra. `count(` no fabrica un número de negocio: es el
    -- `.length` del mismo array, con el mismo `where`, hecho antes del cable.
    'n_documentos', (
      -- ═══ EL N DE LA SOLAPA CUENTA LO QUE LA CARA DIBUJA (dueño, 11/09/2026 17:50) ═══
      --
      -- «El CRM dice documentos de drive (0) y está pésimo eso.» Contaba `cliente_documento` —los
      -- vínculos hechos a mano— y San Francisco tenía CERO con 63 archivos abajo. Ahora cuenta las
      -- tres fuentes que la cara dibuja, SIN CONTAR DOS VECES el mismo archivo: un `union` de ids,
      -- que es exactamente la regla de `armarCaraDocumentos` («la clave es el drive_file_id, y el
      -- papel del OS le gana al de Drive») expresada del otro lado del cable.
      --
      -- LAS DOS IMPLEMENTACIONES SE COMPARAN: `orquestador/lib/cara-documentos.pg.test.mjs` mide
      -- este número contra el que arma TypeScript sobre el MISMO payload, para los clientes reales.
      -- Sin esa comparación, el N de arriba y las filas de abajo se separan en el primer cambio.
      --
      -- Las órdenes SIN PDF se cuentan por su número canónico y no por su fila: dos copias del mismo
      -- mail son UNA orden, que es lo que agrupa `agruparPapeles()` en TypeScript.
      select count(*) from (
        select z.drive_file_id id from public.obra_papel_drive z
         where z.obra_id in (select o.obra_id from sus_obras o)
        union
        select d.drive_file_id from public.cliente_documento d
         where d.cliente_id = (select cliente_id from elegido)
        union
        select coalesce(r.drive_file_id, 'os:' || upper(btrim(coalesce(r.numero, r.id::text))) || ':' || r.tipo)
          from public.cliente_orden r
         where r.cliente_id = (select cliente_id from elegido)
           and r.eliminado_en is null and r.tipo in ('orden_compra', 'orden_pago')
        union
        -- LA CUARTA FUENTE: lo que está en la carpeta del CLIENTE y ninguna obra reclama. La cara lo
        -- dibuja al final («Carpeta del cliente · sin obra asignada») y sin esta rama el número de
        -- arriba sería MENOR que las filas de abajo — el defecto original dado vuelta. Messina tiene
        -- 37 archivos así.
        select a.drive_file_id from public.drive_index a
         where not a.is_folder and coalesce(a.trashed, false) = false
           and coalesce(a.ausente_en_drive, false) = false
           and a.path like (
             select p.path || '/%' from public.drive_index p
              where p.drive_file_id = (select c.drive_carpeta_id from public.cliente_panel c
                                        where c.slug = p_slug))
      ) t
    ),

    -- LOS VÍNCULOS A DRIVE, y APARTE los archivos. No se cruzan acá: ver la cabecera.
    'documentos', case when p_solapa is null or p_solapa in ('documentos', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', d.drive_file_id, 'rol', d.rol, 'origen', d.origen,
               'creado_en', d.creado_en)), '[]'::jsonb)
        from public.cliente_documento d
       where d.cliente_id = (select cliente_id from elegido)
    ) else '[]'::jsonb end,
    -- LA TERCERA OLA QUE DEJA DE SER UNA OLA: esto esperaba a que volvieran los ids de arriba.
    'drive', case when p_solapa is null or p_solapa in ('documentos', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', a.drive_file_id, 'name', a.name, 'path', a.path,
               'mime_type', a.mime_type, 'modified_time', a.modified_time)), '[]'::jsonb)
        from public.drive_index a
       where a.drive_file_id in (
               select d.drive_file_id from public.cliente_documento d
                where d.cliente_id = (select cliente_id from elegido))
    ) else '[]'::jsonb end,

    -- LAS NOTAS Y SUS AUTORES, por separado: una nota cuyo perfil ya no está queda SIN FIRMA, que
    -- es la verdad, en lugar de perderse. Ese cruce lo hace TypeScript y sigue siendo uno solo.
    'notas', case when p_solapa is null or p_solapa in ('obras', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', n.id, 'texto', n.texto, 'autor_id', n.autor_id, 'creado_en', n.creado_en)
               order by n.creado_en desc), '[]'::jsonb)
        from public.cliente_nota n
       where n.cliente_id = (select cliente_id from elegido)
    ) else '[]'::jsonb end,
    'autores', case when p_solapa is null or p_solapa in ('obras', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre)), '[]'::jsonb)
        from public.perfiles p
       where p.id in (
               select n.autor_id from public.cliente_nota n
                where n.cliente_id = (select cliente_id from elegido) and n.autor_id is not null)
    ) else '[]'::jsonb end,

    -- LAS FECHAS DEL CLIENTE PARA LA ACTIVIDAD salen de `clientes`, no de `cliente_panel`: la vista
    -- no las publica, y agregarlas ahí sería una migración para una solapa que no la necesita.
    'actividad_cliente', case when p_solapa is null or p_solapa in ('obras', 'actividad') then (
      select jsonb_build_object('nombre_comercial', c.nombre_comercial,
                                'created_at', c.created_at, 'updated_at', c.updated_at)
        from public.clientes c where c.id = (select cliente_id from elegido)
    ) else null::jsonb end,

    -- LOS CERTIFICADOS DE SUS OBRAS — la otra lectura que esperaba a la ola anterior.
    'certificados', case when p_solapa is null or p_solapa in ('obras', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'numero', t.numero, 'obra_canonica_id', t.obra_canonica_id,
               'fecha_certificacion', t.fecha_certificacion, 'monto_certificado', t.monto_certificado,
               'fecha_facturacion', t.fecha_facturacion, 'monto_facturado', t.monto_facturado,
               'fecha_cobranza', t.fecha_cobranza, 'monto_cobrado', t.monto_cobrado)), '[]'::jsonb)
        from public.certificados t
       where t.obra_canonica_id in (select o.obra_id from sus_obras o)
    ) else '[]'::jsonb end,

    -- ═══ LOS PAPELES QUE CONFORMARON CADA OBRA (dueño, 11/09/2026) ═══
    --
    -- «No encuentro las cotizaciones, los documentos, archivos y demás cuestiones que han conformado
    -- todas las obras.» Viajan SÓLO en la cara Documentos, que es la única que los dibuja: son 106
    -- filas en Messina y arrastrarlas por las otras ocho caras es el peso que 20260911T1200 acaba de
    -- sacar.
    'papeles_obra', case when p_solapa is null or p_solapa = 'documentos' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', z.drive_file_id, 'obra_id', z.obra_id, 'nombre', z.nombre,
               'ruta', z.ruta, 'mime_type', z.mime_type, 'size_bytes', z.size_bytes,
               'modified_time', z.modified_time, 'web_view_link', z.web_view_link,
               'via', z.via)), '[]'::jsonb)
        from public.obra_papel_drive z
       where z.obra_id in (select o.obra_id from sus_obras o)
    ) else '[]'::jsonb end,

    -- LAS CARPETAS VINCULADAS. Sin esto, «esta obra no tiene papeles» y «esta obra no tiene carpeta
    -- vinculada en Drive» se dibujan igual —una lista vacía— y son dos hechos opuestos: el primero
    -- es una obra sin documentar y el segundo, trabajo del OS que falta hacer.
    'carpetas_obra', case when p_solapa is null or p_solapa = 'documentos' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'obra_id', y.obra_id, 'drive_folder_id', y.drive_folder_id, 'ruta', y.ruta,
               'fuente', y.fuente)), '[]'::jsonb)
        from public.obra_carpeta_drive y
       where y.obra_id in (select o.obra_id from sus_obras o)
    ) else '[]'::jsonb end,

    -- LOS PRESUPUESTOS DE ESTE CLIENTE. La aplicación traía TODA la cartera vigente y descartaba en
    -- memoria; el filtro es el mismo predicado (`cliente_id`), sólo que antes del cable.
    'presupuestos', (
      select coalesce(jsonb_agg(to_jsonb(z) order by z.fecha_cotizacion desc), '[]'::jsonb)
        from public.cotizacion_cascada z
       where z.vigente = true and z.cliente_id = (select cliente_id from elegido)
    )
  )
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.hh_de_obra(p_obra text, p_desde date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with la_obra as (
    -- `obra_panel` es `security_invoker`: si el rol no puede ver la obra, acá no hay fila y la
    -- función devuelve `null`. El permiso no se resuelve con un `if` en la aplicación.
    select o.obra_id, o.nombre, o.cliente_id, o.cliente_slug, o.estado, o.fecha_inicio_plan
      from public.obra_panel o where o.obra_id = p_obra
  ),
  filas as (
    select r.fecha, r.persona_id, r.horas, r.tipo_hora,
           r.tipo_hora in ('normal', 'extra_50', 'extra_100') as es_trabajo,
           -- LA QUINCENA CALENDARIO (1–15 y 16–fin), que es con la que se liquidan los jornales.
           case when extract(day from r.fecha) <= 15
                then date_trunc('month', r.fecha)::date
                else (date_trunc('month', r.fecha) + interval '15 days')::date end as quincena
      from public.registros_hh r
     where r.obra_canonica_id = p_obra
       -- SÓLO LA PLANILLA (dueño, 13/09/2026): HH, personas, inicio, quincenas y celdas son las de
       -- JORNALES. Lo cargado en la app sale aparte, en `sin_respaldo`.
       and r.fuente_legacy = 'sheet:jornales'
  ),
  -- LA VENTANA QUE SE DIBUJA: la pedida, o la ÚLTIMA con trabajo cargado. Nunca la primera: lo que
  -- se quiere ver al abrir es qué pasó esta quincena.
  ventana as (
    select coalesce(p_desde, (select max(f.quincena) from filas f where f.es_trabajo)) as desde
  ),
  celda as (
    select f.persona_id, f.fecha,
           sum(f.horas) filter (where f.es_trabajo)                 as horas,
           count(*) filter (where f.tipo_hora = 'ausencia') > 0     as ausencia,
           count(*) filter (where f.tipo_hora = 'licencia') > 0     as licencia
      from filas f
     where f.quincena = (select desde from ventana)
     group by f.persona_id, f.fecha
  )
  select case
    -- Media grilla parece una grilla: ver la cabecera.
    when not (select public.es_administracion()) then null::jsonb
    when not exists (select 1 from la_obra) then null::jsonb
    else jsonb_build_object(
      'obra', (select to_jsonb(x) from la_obra x),

      'registros', (select count(*) from filas f where f.es_trabajo),
      'personas', (select count(distinct f.persona_id) from filas f where f.es_trabajo),
      'desde', (select min(f.fecha) from filas f where f.es_trabajo),
      'hasta', (select max(f.fecha) from filas f where f.es_trabajo),
      'ventana', (select desde from ventana),

      -- LO QUE LA APP CARGÓ Y JORNALES NO TIENE, por persona y con sus días. No suma a nada de lo
      -- de arriba; se publica para que no desaparezca en silencio.
      'sin_respaldo', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'persona_id', s.persona_id, 'nombre', s.nombre, 'horas', s.horas, 'dias', s.dias)
                 order by s.horas desc), '[]'::jsonb)
          from (select x.persona_id,
                       (select pe.nombre_completo from public.personas pe where pe.id = x.persona_id) as nombre,
                       sum(x.horas) as horas,
                       to_jsonb(array_agg(distinct x.fecha order by x.fecha)) as dias
                  from public.registros_hh x
                 where x.obra_canonica_id = p_obra
                   and x.tipo_hora in ('normal', 'extra_50', 'extra_100')
                   and x.fuente_legacy is distinct from 'sheet:jornales'
                 group by x.persona_id) s
      ),

      -- TODAS LAS QUINCENAS CON SU TOTAL: el índice del desglose. Una quincena vacía de trabajo
      -- pero con ausencias también aparece —tiene algo que contar— con `hh` en null.
      'periodos', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'desde', p.quincena, 'hh', p.hh, 'dias', p.dias, 'registros', p.n)
                 order by p.quincena), '[]'::jsonb)
          from (select f.quincena,
                       sum(f.horas) filter (where f.es_trabajo)              as hh,
                       count(distinct f.fecha) filter (where f.es_trabajo)    as dias,
                       count(*) filter (where f.es_trabajo)                   as n
                  from filas f group by f.quincena) p
      ),

      -- EL ACUMULADO POR PERSONA DE TODA LA OBRA, no de la quincena: es la respuesta a «quién puso
      -- las horas de esta obra». `nombre` en null = la fila no tiene persona (las 19 filas legacy de
      -- JORNALES), y eso se dice, no se esconde.
      'por_persona', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'persona_id', t.persona_id, 'nombre', t.nombre, 'hh', t.hh, 'dias', t.dias,
                 'primera', t.primera, 'ultima', t.ultima) order by t.hh desc nulls last), '[]'::jsonb)
          from (select f.persona_id,
                       (select p.nombre_completo from public.personas p where p.id = f.persona_id) as nombre,
                       sum(f.horas) filter (where f.es_trabajo)            as hh,
                       count(distinct f.fecha) filter (where f.es_trabajo) as dias,
                       min(f.fecha) filter (where f.es_trabajo)            as primera,
                       max(f.fecha) filter (where f.es_trabajo)            as ultima
                  from filas f group by f.persona_id) t
      ),

      -- LAS CELDAS DE LA VENTANA: una por persona y día, con las horas trabajadas y la marca de lo
      -- que no es trabajo. Un día con 0 h y una ausencia NO es un día de 0 horas trabajadas: es un
      -- día que la persona no estuvo, y la celda lo dice con una letra.
      'celdas', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'persona_id', c.persona_id, 'fecha', c.fecha, 'horas', c.horas,
                 'ausencia', c.ausencia, 'licencia', c.licencia)), '[]'::jsonb)
          from celda c
      )
    )
  end
$function$;

comment on function public.pantalla_cliente(text, text) is
  'LAS VEINTE LECTURAS DE LA FICHA EN UN VIAJE (plpgsql desde 20260913T1100). Desde 20260913T1400 '
  '`hh_obra` y `costo_obra.mano_obra` cuentan SÓLO filas sheet:jornales —lo cargado en la app viaja '
  'aparte en `sin_respaldo`— y quien cobra neto_mensual se valoriza a neto del mes ÷ horas de la '
  'planilla del mes (`implicito`). Las claves de costos y horas son `null` cuando quien pregunta no es '
  'Administración: la RLS le daría media suma, y media suma parece una suma.';

comment on function public.hh_de_obra(text, date) is
  'EL DESGLOSE DE HORAS DE UNA OBRA: quincenas, personas y celdas SÓLO de la planilla JORNALES '
  '(20260913T1400); lo cargado en la app sin respaldo viaja en `sin_respaldo`. `null` cuando quien '
  'pregunta no es Administración o no puede ver la obra.';

notify pgrst, 'reload schema';
