-- ═══ LA FICHA DEL CLIENTE Y EL DESGLOSE DE HORAS SE LEEN DE UNA CACHÉ EN LA BASE (13/09/2026) ══════
--
-- ═══ EL PROBLEMA NO ES EJECUTAR: ES PLANIFICAR ═══
--
-- Medido en producción el 13/09/2026: `pantalla_cliente(p_slug, p_solapa)` EJECUTA en 130–400 ms con
-- el plan caliente, pero en una conexión que nunca la vio PLANIFICA 2–10 s (10,5 s la primera llamada
-- como Dirección tras reemplazarla; 3,4 / 1,1 / 0,3 s en conexiones nuevas). Aun en la MISMA conexión,
-- las primeras llamadas replanifican (`plan_cache_mode = auto` usa planes a medida las primeras cinco
-- veces): Quattropani/obras 2.905 → 2.007 → 989 ms. Supavisor reparte los pedidos entre backends, así
-- que el plan frío se paga seguido. Con la base cargada, la primera carga de Quattropani se cortó a
-- los 113 s y las siguientes tardaron 9,8 / 20,4 / 17,3 s; el desglose `hh_de_obra`, 13,2 s.
--
-- LO QUE SE PROBÓ Y NO SIRVIÓ: partir el cuerpo por solapa en ramas plpgsql. Cada rama sigue siendo
-- una consulta que se planifica la primera vez que un backend la ve, y se midió PEOR (7,4 s en frío).
--
-- ═══ LA SALIDA: LA CONSULTA CARA NO CORRE EN EL PEDIDO ═══
--
-- `ficha_cliente_cache` guarda el JSON por RPC × clave × solapa: `pantalla_cliente` por cliente y
-- cara, y `hh_de_obra` por obra (sólo la ventana por defecto, `p_desde = null`, que es la que abre el
-- clic). Las dos RPC pasan a ser envoltorios chicos en plpgsql: si quien pregunta es de la clase con
-- la que se calculó la caché y la fila tiene menos de 10 minutos, devuelven la fila SIN planificar el
-- cuerpo grande (plpgsql planifica cada sentencia recién cuando la ejecuta); si no, calculan en vivo
-- como hasta hoy. Los cuerpos de siempre viven intactos en `pantalla_cliente_en_vivo` y
-- `hh_de_obra_en_vivo`, copiados de las definiciones vivas (`20260913T1400`).
--
-- ═══ QUIÉN RECIBE LA CACHÉ, Y POR QUÉ NADIE MÁS ═══
--
-- Las dos RPC son SECURITY INVOKER: lo que ve cada uno lo recorta la RLS adentro de las vistas —desde
-- `20260913T1200`, además, el portero `ve_economia()` de `obra_economia_cartera` y otras cinco—, y
-- las claves de horas y costos dependen de `es_administracion()`. Un JSON calculado con los ojos de
-- Dirección NO puede servirse a otro rol. Por eso la fila guarda `rol_calculo` y sólo se entrega a
-- quien tiene EXACTAMENTE ese rol, sin sesión de prueba:
--
--   · jefe de obra y campo → siempre en vivo, con su RLS (lo mismo que hoy);
--   · administración       → en vivo. Hoy `ve_economia()`, `es_administracion()` y
--     `liquida_sueldos()` tratan igual a los dos roles, pero si un portero futuro separa Dirección de
--     Administración, servirle lo calculado como Dirección le mostraría lo que su RLS le niega. Falla
--     cerrado. Medido el 13/09/2026: no hay ningún perfil con rol `administracion`.
--   · identidades de prueba → en vivo: `sesion_es_de_prueba()` cambia lo que publican algunas vistas
--     de personas, y una caché compartida no puede cargar esa diferencia.
--
-- La clave `perfil` de `pantalla_cliente` es de quien pregunta: no se guarda, se agrega en la lectura
-- con la MISMA consulta del cuerpo en vivo. El orden de claves de `jsonb` es canónico, así que la
-- respuesta desde la caché es byte a byte la del cálculo en vivo más `cache_calculado_en`, que la
-- pantalla usa para decir de cuándo son los datos.
--
-- ═══ CÓMO SE CALCULA SIN SER NADIE ═══
--
-- `refrescar_ficha_cliente_cache()` NO es SECURITY DEFINER, y es a propósito: correría como
-- `postgres`, que tiene BYPASSRLS, y el JSON saldría calculado SIN la RLS de Dirección. Tampoco usa la
-- escapatoria `auth.uid() is null` de los porteros: sin uid, `es_administracion()` es falso y las
-- claves de horas y costos saldrían `null`. Corre como quien la llama (pg_cron → `postgres`), fija los
-- claims de un perfil REAL de Dirección (el más antiguo que no es de prueba; no se inventa ninguna
-- identidad) y hace `set local role authenticated` alrededor de cada cálculo — exactamente lo que hace
-- PostgREST con un usuario. Postgres prohíbe `SET ROLE` adentro de una función SECURITY DEFINER: ésa
-- es la otra razón.
--
-- ═══ FRESCURA Y CARGA ═══
--
--   · pg_cron cada minuto recalcula lo que FALTA o tiene más de 5 minutos. En régimen, las filas
--     vencen juntas y el trabajo real es un lote cada 5 minutos; los minutos sin nada vencido no
--     tocan ningún cuerpo grande.
--   · CADA CORRIDA ES UNA TRANSACCIÓN, y un `statement_timeout` no lo atrapa `exception when others`:
--     aborta la corrida entera y se pierde lo calculado en ella. Por eso la corrida corta a los 40 s
--     (lo que no entra queda para el minuto siguiente) y, fuera de lo que falta, elige AL AZAR: un
--     orden fijo reintentaría primero, cada minuto, la misma combinación que no entra.
--   · CEDE ANTE LA APP: con más de 8 backends activos la corrida no calcula nada. La instancia es chica
--     (60 conexiones, 224 MB de shared_buffers) y un refresco que compite con quien está usando la
--     pantalla empeora lo que vino a arreglar. El umbral es inicial, no medido bajo carga real.
--   · un lote que se superpone con otro no corre (candado de transacción).
--   · las acciones del CRM que escriben llaman `invalidar_ficha_cliente_cache(cliente_id)`: se borran
--     sus filas (ficha y desglose de sus obras), el próximo pedido calcula en vivo y el cron las repone
--     en menos de un minuto.
--   · lo que escriben los sincronizadores (Sheet, bancos, ARCA) NO invalida: lo cubre el vencimiento,
--     y la pantalla dice «datos de hace N min».
--
-- La solapa `null` (la ficha entera) no se guarda: la página nunca la pide y es la combinación más
-- cara. Tampoco las otras ventanas del desglose (`p_desde` con fecha). Las dos siguen en vivo.

create table if not exists public.ficha_cliente_cache (
  rpc           text        not null check (rpc in ('pantalla_cliente', 'hh_de_obra')),
  -- El slug del cliente para `pantalla_cliente`, el id de la obra para `hh_de_obra`.
  clave         text        not null,
  -- La cara de `pantalla_cliente`; '' para `hh_de_obra`, que no tiene.
  solapa        text        not null,
  json          jsonb       not null,
  calculado_en  timestamptz not null,
  -- CON LOS OJOS DE QUIÉN se calculó. Sólo se sirve a ese rol: ver la cabecera.
  rol_calculo   text        not null,
  -- Cuánto tardó el cálculo, para medir el costo del refresco sin EXPLAIN.
  ms            integer,
  primary key (rpc, clave, solapa)
);

-- RLS SIN POLICIES: nadie la lee por PostgREST. La lee `ficha_cliente_cache_leer`, que decide a quién.
alter table public.ficha_cliente_cache enable row level security;
revoke all on table public.ficha_cliente_cache from anon, authenticated;

comment on table public.ficha_cliente_cache is
  'La ficha del cliente (por cara) y el desglose de horas de cada obra, ya calculados con los ojos de '
  '`rol_calculo`. La escribe `refrescar_ficha_cliente_cache()` (pg_cron, cada minuto lo vencido) y la '
  'leen `pantalla_cliente` y `hh_de_obra` vía `ficha_cliente_cache_leer`. Sin policies (20260913T1500).';

-- ── LOS CÁLCULOS DE SIEMPRE, CON OTRO NOMBRE ───────────────────────────────────────────────────────
--
-- Copiados de `pg_get_functiondef` sobre la base viva el 13/09/2026 (definiciones de 20260913T1400),
-- cambiando SÓLO el nombre. El test pg compara sus respuestas contra las RPC anteriores, rol por rol.
--
-- UNA MIGRACIÓN QUE CAMBIE LO QUE CALCULA LA FICHA O EL DESGLOSE REDEFINE ESTAS DOS FUNCIONES, NO LOS
-- ENVOLTORIOS, y vacía la caché (`delete from public.ficha_cliente_cache`) para no servir el cálculo
-- viejo hasta diez minutos. Redefinir `pantalla_cliente` con el cuerpo entero borraría la caché en
-- silencio: `src/features/clientes/services/fichaCache.test.ts` lo impide.

CREATE OR REPLACE FUNCTION public.pantalla_cliente_en_vivo(p_slug text, p_solapa text)
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

CREATE OR REPLACE FUNCTION public.hh_de_obra_en_vivo(p_obra text, p_desde date DEFAULT NULL::date)
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

revoke all on function public.pantalla_cliente_en_vivo(text, text) from public, anon;
grant execute on function public.pantalla_cliente_en_vivo(text, text) to authenticated;
revoke all on function public.hh_de_obra_en_vivo(text, date) from public, anon;
grant execute on function public.hh_de_obra_en_vivo(text, date) to authenticated;

comment on function public.pantalla_cliente_en_vivo(text, text) is
  'EL CÁLCULO DE LA FICHA, sin caché: el cuerpo de `pantalla_cliente` de 20260913T1400. Lo llaman '
  '`pantalla_cliente` cuando no puede servir la caché y `refrescar_ficha_cliente_cache` (20260913T1500).';
comment on function public.hh_de_obra_en_vivo(text, date) is
  'EL DESGLOSE DE HORAS DE UNA OBRA, sin caché: el cuerpo de `hh_de_obra` de 20260913T1400. Lo llaman '
  '`hh_de_obra` cuando no puede servir la caché y `refrescar_ficha_cliente_cache` (20260913T1500).';

-- ── LA LECTURA ────────────────────────────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER porque la tabla no tiene policies. Todo lo que decide si se entrega está en el
-- `where`: vigencia, rol idéntico al del cálculo y sesión que no es de prueba. Cualquier otra cosa
-- devuelve `null` y la RPC calcula en vivo.
create or replace function public.ficha_cliente_cache_leer(p_rpc text, p_clave text, p_solapa text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select c.json || jsonb_build_object('cache_calculado_en', c.calculado_en)
    from public.ficha_cliente_cache c
   where c.rpc = p_rpc
     and c.clave = p_clave
     and c.solapa = p_solapa
     and c.calculado_en > now() - interval '10 minutes'
     and c.rol_calculo = public.current_rol()
     and not public.sesion_es_de_prueba()
$function$;

revoke all on function public.ficha_cliente_cache_leer(text, text, text) from public, anon;
grant execute on function public.ficha_cliente_cache_leer(text, text, text) to authenticated;

-- ── LAS RPC DE LA PANTALLA ────────────────────────────────────────────────────────────────────────
--
-- Mismas firmas, mismos defaults, mismo `stable`, mismo `search_path`, y SIGUEN SIENDO SECURITY
-- INVOKER: el camino en vivo tiene que ver lo que ve quien pregunta. `create or replace` conserva los
-- GRANT. Pasan a plpgsql para que la lectura de la caché no arrastre la planificación del cuerpo.
create or replace function public.pantalla_cliente(p_slug text, p_solapa text)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_cache jsonb;
begin
  if p_solapa is not null then
    v_cache := public.ficha_cliente_cache_leer('pantalla_cliente', p_slug, p_solapa);
    if v_cache is not null then
      -- EL PERFIL ES DE QUIEN PREGUNTA, con la misma consulta que el cuerpo en vivo.
      return v_cache || jsonb_build_object('perfil', (
        select jsonb_build_object('id', p.id, 'rol', p.rol, 'nombre', p.nombre,
                                  'created_at', p.created_at, 'updated_at', p.updated_at)
          from public.perfiles p
         where p.id = (select auth.uid())
      ));
    end if;
  end if;
  return public.pantalla_cliente_en_vivo(p_slug, p_solapa);
end
$function$;

comment on function public.pantalla_cliente(text, text) is
  'LA FICHA DEL CLIENTE EN UN VIAJE. Desde 20260913T1500 lee `ficha_cliente_cache` cuando quien pregunta '
  'tiene el rol con que se calculó (Dirección), no es sesión de prueba y la fila tiene menos de 10 min '
  '—la respuesta trae `cache_calculado_en`—; si no, calcula en vivo (`pantalla_cliente_en_vivo`) con la '
  'RLS de quien pregunta.';

create or replace function public.hh_de_obra(p_obra text, p_desde date default null::date)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_cache jsonb;
begin
  -- SÓLO LA VENTANA POR DEFECTO: es la que abre el clic. Navegar a otra quincena calcula en vivo.
  if p_desde is null then
    v_cache := public.ficha_cliente_cache_leer('hh_de_obra', p_obra, '');
    if v_cache is not null then
      return v_cache;
    end if;
  end if;
  return public.hh_de_obra_en_vivo(p_obra, p_desde);
end
$function$;

comment on function public.hh_de_obra(text, date) is
  'EL DESGLOSE DE HORAS DE UNA OBRA. Desde 20260913T1500, con `p_desde` null lee `ficha_cliente_cache` '
  'bajo las mismas reglas que `pantalla_cliente` (trae `cache_calculado_en`); si no, calcula en vivo '
  '(`hh_de_obra_en_vivo`): quincenas, personas y celdas SÓLO de la planilla JORNALES.';

-- ── EL REFRESCO ───────────────────────────────────────────────────────────────────────────────────
--
-- SECURITY INVOKER a propósito: ver la cabecera («cómo se calcula sin ser nadie»).
create or replace function public.refrescar_ficha_cliente_cache(p_slug text default null)
returns integer
language plpgsql
volatile
set search_path to 'public'
as $function$
declare
  v_uid     uuid;
  v_rpc     text;
  v_clave   text;
  v_solapa  text;
  v_json    jsonb;
  v_desde   timestamptz;
  v_inicio  timestamptz := clock_timestamp();
  v_n       integer := 0;
begin
  -- DOS LOTES A LA VEZ SON EL DOBLE DE CARGA PARA EL MISMO RESULTADO: el segundo no corre.
  if not pg_try_advisory_xact_lock(hashtext('public.refrescar_ficha_cliente_cache')) then
    return 0;
  end if;

  -- CEDE ANTE LA APP (sólo el cron; un refresco pedido por cliente es deliberado).
  if p_slug is null and (select count(*) from pg_stat_activity a
                          where a.state = 'active' and a.backend_type = 'client backend'
                            and a.pid <> pg_backend_pid()) > 8 then
    return 0;
  end if;

  -- UN PERFIL REAL DE DIRECCIÓN. Sin ninguno no hay con qué ojos calcular: no se llena nada y todo
  -- sigue en vivo, que es correcto y más lento, nunca incorrecto.
  select p.id into v_uid
    from public.perfiles p
   where p.rol = 'direccion' and p.es_prueba = false
   order by p.created_at, p.id
   limit 1;
  if v_uid is null then
    return 0;
  end if;

  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- Un cliente o una obra que ya no existen no dejan su caché servida.
  delete from public.ficha_cliente_cache c
   where (c.rpc = 'pantalla_cliente' and not exists (select 1 from public.clientes k where k.slug = c.clave))
      or (c.rpc = 'hh_de_obra' and not exists (select 1 from public.obra_canonica o where o.id = c.clave));

  for v_rpc, v_clave, v_solapa in
    select x.rpc, x.clave, x.solapa
      from (
        select 'pantalla_cliente'::text as rpc, k.slug as clave, s.solapa
          from public.clientes k
         cross join unnest(array['obras', 'ordenes', 'cobranzas', 'presupuestos', 'documentos', 'actividad'])
                 as s(solapa)
         where p_slug is null or k.slug = p_slug
        union all
        -- LAS OBRAS QUE LA FICHA LISTA: las que cuelgan de un cliente.
        select 'hh_de_obra', o.id, ''
          from public.obra_canonica o
          join public.clientes k on k.id = o.cliente_id
         where p_slug is null or k.slug = p_slug
      ) x
      left join public.ficha_cliente_cache c
        on c.rpc = x.rpc and c.clave = x.clave and c.solapa = x.solapa
     -- CON UN CLIENTE PEDIDO SE RECALCULA ENTERO; SIN CLIENTE, SÓLO LO QUE FALTA O VENCIÓ.
     where p_slug is not null or c.calculado_en is null
        or c.calculado_en < clock_timestamp() - interval '5 minutes'
     -- LO QUE FALTA PRIMERO (lo que alguien acaba de invalidar escribiendo); después, al azar.
     order by (c.calculado_en is not null), random()
  loop
    -- EL LOTE SE ESCALONA SOLO: lo que no entra en 40 s queda para el minuto siguiente.
    exit when p_slug is null and clock_timestamp() - v_inicio > interval '40 seconds';
    v_desde := clock_timestamp();
    begin
      set local role authenticated;
      if v_rpc = 'pantalla_cliente' then
        v_json := public.pantalla_cliente_en_vivo(v_clave, v_solapa) - 'perfil';
      else
        v_json := public.hh_de_obra_en_vivo(v_clave, null);
      end if;
      reset role;
    exception when others then
      -- UNA COMBINACIÓN QUE FALLA NO SE GUARDA NI TUMBA EL LOTE: su fila vieja vence y la pantalla
      -- calcula en vivo, que es lo que devolvería el error a quien de verdad pregunta.
      raise warning 'ficha_cliente_cache: % % % no se pudo calcular: %', v_rpc, v_clave, v_solapa, sqlerrm;
      continue;
    end;
    -- `null` = Dirección no ve esa obra o no existe: no hay nada que servir, calcula en vivo.
    continue when v_json is null;
    insert into public.ficha_cliente_cache as c (rpc, clave, solapa, json, calculado_en, rol_calculo, ms)
    values (v_rpc, v_clave, v_solapa, v_json, v_desde, 'direccion',
            (extract(epoch from clock_timestamp() - v_desde) * 1000)::integer)
    on conflict (rpc, clave, solapa) do update
       set json = excluded.json, calculado_en = excluded.calculado_en,
           rol_calculo = excluded.rol_calculo, ms = excluded.ms;
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$function$;

revoke all on function public.refrescar_ficha_cliente_cache(text) from public, anon, authenticated;

comment on function public.refrescar_ficha_cliente_cache(text) is
  'Llena `ficha_cliente_cache` calculando como un perfil real de Dirección con `set local role '
  'authenticated` (no SECURITY DEFINER: `postgres` tiene BYPASSRLS). Sin argumento: lo que falta o '
  'tiene más de 5 min, cortando a los 40 s y cediendo con más de 8 backends activos. Con slug: ese '
  'cliente entero, ficha y desglose de sus obras (20260913T1500).';

-- ── LA INVALIDACIÓN ───────────────────────────────────────────────────────────────────────────────
--
-- Borrar es inocuo —lo peor que produce es un cálculo en vivo—, así que alcanza con que quien la llame
-- sea de los que escriben el CRM. `null` = todas: las acciones de obra no saben de qué cliente es.
create or replace function public.invalidar_ficha_cliente_cache(p_cliente_id uuid default null)
returns void
language sql
volatile
security definer
set search_path to 'public'
as $function$
  delete from public.ficha_cliente_cache c
   where public.es_administracion()
     and (p_cliente_id is null
          or (c.rpc = 'pantalla_cliente'
              and c.clave = (select k.slug from public.clientes k where k.id = p_cliente_id))
          or (c.rpc = 'hh_de_obra'
              and c.clave in (select o.id from public.obra_canonica o where o.cliente_id = p_cliente_id)))
$function$;

revoke all on function public.invalidar_ficha_cliente_cache(uuid) from public, anon;
grant execute on function public.invalidar_ficha_cliente_cache(uuid) to authenticated;

comment on function public.invalidar_ficha_cliente_cache(uuid) is
  'Borra la ficha y el desglose cacheados de un cliente (o de todos con null) después de que el CRM '
  'escribe. El cron los repone en menos de un minuto (20260913T1500).';

-- ── EL CRON ───────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'refrescar_ficha_cliente_cache';
end
$$;

select cron.schedule('refrescar_ficha_cliente_cache', '* * * * *',
                     $$select public.refrescar_ficha_cliente_cache()$$);

notify pgrst, 'reload schema';
