-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL MARGEN NO ES LA VENTA MENOS LO GASTADO HASTA HOY
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL DEFECTO, MEDIDO EN PRODUCCIÓN (22/08/2026) ═══
--
-- `obra_plan_vs_real.margen_actual = monto_contratado − costo_real`, y la ficha lo rotula
-- «MARGEN ACTUAL». Sobre la obra `quattropani` (Salón Comercial):
--
--     contratado   $ 97.650.000
--     costo real   $ 32.937.000   ← TRES facturas, todas de Alumetal, todas de materiales
--     «margen»     $ 64.713.000   ← 66% de rentabilidad sobre una obra al 86% de avance
--
-- No es margen. Es la venta menos lo que se alcanzó a imputar. Le falta TODO lo que queda por
-- gastar, y encima el costo que sí está es estructuralmente parcial: las 15 filas `indirecto` de
-- `obra_alias` incluyen `sueldos`, `uocra`, `f931`, `fcl` e `ieric`, así que la mano de obra que se
-- carga con esos rótulos NUNCA llega a una obra. Medido: quattropani tiene 1 (una) hora en
-- `registros_hh` y $0 de `area = 'personas'` imputados. El número no está mal calculado: la resta da
-- eso. Está mal NOMBRADO, y el nombre es lo que decide.
--
-- La misma mentira, en porcentaje, vivía en `obra_panel.margen_sobre_contratado_pct` —
-- `(contratado − costo_real) / contratado` — que es la columna que lee el portafolio. Se va también:
-- dejar la versión en porcentaje habría sido renombrar el cartel y conservar la afirmación.
--
-- ═══ LAS MAGNITUDES QUE SÍ SON, CADA UNA CON SU REGLA ═══
--
--   VENTA CONTRATADA          contrato + adicionales aprobados. Lo que el cliente debe pagar.
--   COSTO OBJETIVO            lo que se cotizó que iba a costar. De las partidas congeladas
--                             convertidas a la obra; si no hay, del presupuesto aprobado.
--   COSTO REAL A HOY          lo imputado por Compras. NO es «lo que va costando la obra»: es lo
--                             que se logró imputar, y la vista publica su cobertura al lado.
--   COSTO COMPROMETIDO        lo pedido y no facturado. NO EXISTE FUENTE (ver abajo): NULL.
--   COSTO RESTANTE (ETC)      lo que falta gastar = EAC − costo real.
--   COSTO FINAL (EAC)         lo que va a costar terminarla.
--   MARGEN COTIZADO           venta − costo objetivo. Sólo con presupuesto.
--   MARGEN FINAL PROYECTADO   venta − costo final proyectado. Sólo con forecast.
--
-- Ninguna se rellena con otra cuando falta. `EAC = AC + ETC` con un `AC` incompleto da un EAC
-- incompleto con nombre de proyección — el Principio de Control de `planificacion-produccion` lo
-- prohíbe textualmente, y es el mismo error que el «margen actual» con otro sombrero.
--
-- ═══ POR QUÉ EL EAC NO SE EXTRAPOLA DEL AVANCE ═══
--
-- La tentación es `EAC = BAC/CPI`, que con `EV = BAC × avance` se simplifica a `costo_real / avance`.
-- Para quattropani daría $32.937.000 / 0,86 = $38.298.837 y un «margen proyectado» de $59.351.163:
-- el mismo número cómodo, con un nombre más respetable y una fórmula de libro detrás. Un AC al que
-- le falta la nómina entera no se arregla dividiéndolo. El EAC sale del forecast de abajo hacia
-- arriba (`obra_forecast_economico`: partidas congeladas × factor de HH) o no sale — y cuando no
-- sale, `base_del_forecast` dice qué falta para que salga.
--
-- ═══ EL COSTO COMPROMETIDO NO SE INVENTA ═══
--
-- Se buscó fuente y no hay, medido:
--   · `obligaciones.obra_id` es un FK a la tabla LEGACY `obras` (uuid), no al eje canónico. Y las 10
--     filas que existen tienen `obra_id` NULL: son deuda agregada del Flujo de Caja, no de una obra.
--   · `cheques.obra` no es una obra: sus valores son «Civil», «Mantenimiento», «MESSINA» — unidad de
--     negocio. Resolverlo contra `obra_alias` emparejaría por parecido y afirmaría compromiso donde
--     no lo hay.
-- Entonces la columna existe, vale NULL y `costo_comprometido_estado` dice por qué. Publicar 0 sería
-- afirmar «no hay nada comprometido», que es una afirmación sobre la empresa que nadie verificó.
--
-- ═══ QUÉ SE ROMPE Y QUIÉN SE ACTUALIZA ═══
--
-- Consumidores de `margen_actual`: `TabEconomia.tsx`, `planVsReal.ts`, `types/index.ts`,
-- `tests/autorizacion-por-obra.spec.ts`, `tests/control-obra-permisos.spec.ts`. De
-- `margen_sobre_contratado_pct`: `types/index.ts` y `control-obra-permisos.spec.ts`. Los cinco
-- archivos se cambian en este mismo commit — una columna que se va sin sus consumidores deja la
-- pantalla en 400 y el defecto «arreglado» en el papel.
--
-- `drop` + `create` y no `create or replace`: `replace` no deja sacar una columna, y además borra
-- `security_invoker` cuando no se repite —así se le abrió `cliente_panel` a un jefe de obra el
-- 19/08—. `cliente_panel` entra al drop porque cuelga de `obra_panel`, y se la recrea IDÉNTICA.

-- ── 1 · el costo real dice cuánta mano de obra tiene adentro ───────────────────────────────────
--
-- `create or replace` con las seis columnas viejas en el mismo orden y la nueva al final: es lo
-- único que `replace` acepta, y evita el drop en cascada de una vista que consumen cinco pantallas.
--
-- La partición sale de `costos_obra.area`, que es la columna que ya clasifica el gasto ('obras',
-- 'compras', 'personas', 'contabilidad_legales', 'administracion_finanzas'). No es una segunda
-- definición del costo: es el MISMO join, mirado por dentro. Medido hoy: 19 filas de `personas`
-- llegan a una obra por $64.489.347, y ninguna es de quattropani.
create or replace view public.obra_costo_real as
select oc.id            as obra_id,
       oc.nombre        as obra_nombre,
       oc.estado,
       oc.tipo,
       count(c.*)::int  as n_comprobantes,
       coalesce(sum(c.total), 0)::numeric as costo_real,
       -- SIN FILAS DE MANO DE OBRA, 0 — y el 0 acá es el dato que importa: dice que el costo real de
       -- esta obra no tiene una hora adentro, que es lo que vuelve indefendible cualquier margen.
       coalesce(sum(c.total) filter (where c.area = 'personas'), 0)::numeric as costo_mano_de_obra
  from public.obra_canonica oc
  left join public.obra_alias a
         on a.obra_id = oc.id
        and a.clasificacion in ('obra', 'mantenimiento')
  left join public.costos_obra c
         on public.norm_obra(c.obra_texto) = a.alias
 group by oc.id, oc.nombre, oc.estado, oc.tipo;

comment on view public.obra_costo_real is
  'FUENTE ÚNICA del costo real por obra canónica. La consumen web, chat y cualquier otra herramienta '
  'del OS. No recalcular este concepto en ninguna cara: ver orquestador/scripts/canario-fuente-unica.mjs. '
  '`costo_mano_de_obra` es la porción con area=''personas'': en 0 significa que el costo de esta obra '
  'no incluye una sola hora, y ningún margen calculado sobre él es defendible.';

-- ── 2 · las tres vistas del eje, sin el falso margen ───────────────────────────────────────────
drop view if exists public.cliente_panel;
drop view if exists public.obra_plan_vs_real;
drop view if exists public.obra_panel;

create view public.obra_panel with (security_invoker = true) as
SELECT oc.id AS obra_id,
    oc.nombre,
    oc.cliente_id,
    cl.slug AS cliente_slug,
    COALESCE(cl.nombre_comercial, oc.cliente_texto) AS cliente_nombre,
    oc.cliente_texto,
    oc.estado,
    oc.tipo,
    oc.etapa,
    oc.jefe_obra,
    oc.orden,
    public.contratado_de_obra(oc.id) AS monto_contratado,
    oc.fecha_inicio_plan,
    oc.fecha_fin_plan,
    oc.fecha_inicio_real,
    oc.fecha_fin_real,
    oc.drive_carpeta_id,
    ocr.costo_real,
    ocr.n_comprobantes,
    ocr.costo_mano_de_obra,
    -- `margen_sobre_contratado_pct` NO ESTÁ Y NO VUELVE: era `(contratado − costo_real)/contratado`,
    -- el mismo «margen» de la venta menos lo gastado, en porcentaje. El margen vive en
    -- `obra_economia` y sólo cuando hay contra qué proyectar.
    av.avance_pct,
    av.n_medidas::integer AS n_actividades_medidas,
    av.n_actividades::integer AS n_actividades,
    av.n_sin_planificar::integer AS n_actividades_sin_planificar,
    av.sincronizado_en AS avance_sincronizado_en,
    ( SELECT count(*)::integer
           FROM obra_restriccion r
          WHERE r.obra_id = oc.id AND r.estado <> 'liberada'::text) AS restricciones_abiertas,
    ( SELECT count(*)::integer
           FROM obra_restriccion r
          WHERE r.obra_id = oc.id AND r.estado <> 'liberada'::text AND r.fecha_compromiso IS NOT NULL AND r.fecha_compromiso < CURRENT_DATE) AS restricciones_vencidas
   FROM obra_canonica oc
     LEFT JOIN clientes cl ON cl.id = oc.cliente_id
     LEFT JOIN obra_costo_real ocr ON ocr.obra_id = oc.id
     LEFT JOIN obra_avance av ON av.obra_id = oc.id;

comment on view public.obra_panel is
  'Una fila por obra. `monto_contratado` sale de contratado_de_obra(): NULL para quien no ve la '
  'economía, y la columna cruda no está al alcance de authenticated. NO publica margen: la venta '
  'menos lo gastado hasta hoy no es margen y se la sacó el 22/08 — está en `obra_economia`.';

create view public.cliente_panel with (security_invoker = true) as
 SELECT c.id AS cliente_id,
    c.slug,
    c.nombre_comercial,
    c.razon_social,
    c.cuit,
    c.direccion,
    c.telefono,
    c.email,
    c.responsable_id,
    p.nombre AS responsable_nombre,
    c.drive_carpeta_id,
    c.activo,
    c.notas,
    count(op.obra_id)::integer AS n_obras,
    count(op.obra_id) FILTER (WHERE op.estado = 'activa'::text)::integer AS n_obras_activas,
    sum(op.monto_contratado) AS contratado,
    sum(op.costo_real) AS costo_real,
    sum(op.restricciones_abiertas)::integer AS restricciones_abiertas,
    max(op.avance_sincronizado_en) AS avance_sincronizado_en,
    ( SELECT count(*)::integer AS count
           FROM cliente_contacto ct
          WHERE ct.cliente_id = c.id) AS n_contactos,
    ( SELECT count(*)::integer AS count
           FROM cliente_documento cd
          WHERE cd.cliente_id = c.id) AS n_documentos
   FROM clientes c
     LEFT JOIN perfiles p ON p.id = c.responsable_id
     LEFT JOIN obra_panel op ON op.cliente_id = c.id
  GROUP BY c.id, c.slug, c.nombre_comercial, c.razon_social, c.cuit, c.direccion, c.telefono, c.email, c.responsable_id, p.nombre, c.drive_carpeta_id, c.activo, c.notas;

create view public.obra_plan_vs_real with (security_invoker = true) as
WITH hh AS (
         SELECT registros_hh.obra_canonica_id AS obra_id,
            sum(registros_hh.horas) AS hh_real
           FROM registros_hh
          WHERE registros_hh.obra_canonica_id IS NOT NULL
          GROUP BY registros_hh.obra_canonica_id
        ), hh_plan AS (
         SELECT obra_actividad.obra_id,
            sum(obra_actividad.hh_plan) AS hh_plan
           FROM obra_actividad
          WHERE obra_actividad.hh_plan IS NOT NULL AND NOT obra_actividad.archivada
          GROUP BY obra_actividad.obra_id
        ), pres AS (
         SELECT DISTINCT ON (presupuestos.obra_canonica_id) presupuestos.obra_canonica_id AS obra_id,
            presupuestos.id AS presupuesto_id,
            presupuesto_monto(presupuestos.id) AS monto_presupuestado,
            presupuestos.costo_directo_presupuestado,
            presupuesto_margen(presupuestos.id) AS margen_esperado,
            presupuestos.hh_estimada
           FROM presupuestos
          WHERE presupuestos.obra_canonica_id IS NOT NULL
          ORDER BY presupuestos.obra_canonica_id, (presupuestos.estado = 'aprobado'::text) DESC, presupuestos.version DESC
        ), cert AS (
         -- CERTIFICADO Y FACTURADO Y NADA MÁS. `cobrado` salía de acá y por eso el panel decía NULL
         -- con $79,3M cobrados en `cobranzas`: la tabla `certificados` está vacía. Ver
         -- 20260822T6200 — tres hechos, tres fuentes, no se fusionan.
         SELECT certificados.obra_canonica_id AS obra_id,
            sum(certificados.monto_certificado) AS certificado,
            sum(certificados.monto_facturado) AS facturado
           FROM certificados
          WHERE certificados.obra_canonica_id IS NOT NULL
          GROUP BY certificados.obra_canonica_id
        ), plazo AS (
         SELECT obra_actividad.obra_id,
            min(obra_actividad.inicio_plan) AS inicio_plan,
            max(obra_actividad.fin_plan) AS fin_plan,
            min(obra_actividad.inicio_base) AS inicio_base,
            max(obra_actividad.fin_base) AS fin_base,
            count(*) FILTER (WHERE NOT obra_actividad.archivada AND obra_actividad.tipo <> 'resumen'::text AND obra_actividad.fin_plan IS NOT NULL AND obra_actividad.fin_plan < CURRENT_DATE AND COALESCE(obra_actividad.pct, 0::numeric) < 100::numeric) AS atrasadas,
            count(*) FILTER (WHERE NOT obra_actividad.archivada AND obra_actividad.inicio_base IS NOT NULL) AS con_baseline
           FROM obra_actividad
          WHERE NOT obra_actividad.archivada
          GROUP BY obra_actividad.obra_id
        )
 SELECT op.obra_id,
    op.nombre,
    op.cliente_id,
    op.cliente_nombre,
    op.estado,
    op.etapa,
    plazo.inicio_plan,
    plazo.fin_plan,
    plazo.inicio_base,
    plazo.fin_base,
        CASE
            WHEN plazo.fin_base IS NOT NULL AND plazo.fin_plan IS NOT NULL THEN plazo.fin_plan - plazo.fin_base
            ELSE NULL::integer
        END AS desvio_plazo_dias,
    plazo.atrasadas::integer AS actividades_atrasadas,
    plazo.con_baseline::integer AS actividades_con_baseline,
    op.avance_pct,
    op.n_actividades_medidas,
    op.n_actividades,
    hh_plan.hh_plan,
    pres.hh_estimada,
    hh.hh_real,
        CASE
            WHEN COALESCE(hh_plan.hh_plan, pres.hh_estimada) > 0::numeric AND hh.hh_real IS NOT NULL THEN round((hh.hh_real - COALESCE(hh_plan.hh_plan, pres.hh_estimada)) / COALESCE(hh_plan.hh_plan, pres.hh_estimada) * 100::numeric, 1)
            ELSE NULL::numeric
        END AS desvio_hh_pct,
    pres.presupuesto_id,
    pres.monto_presupuestado,
    pres.costo_directo_presupuestado AS costo_presupuestado,
    op.costo_real,
        CASE
            WHEN pres.costo_directo_presupuestado > 0::numeric AND op.costo_real > 0::numeric THEN round((op.costo_real - pres.costo_directo_presupuestado) / pres.costo_directo_presupuestado * 100::numeric, 1)
            ELSE NULL::numeric
        END AS desvio_costo_pct,
    op.monto_contratado,
    pres.margen_esperado,
    -- `margen_actual` NO ESTÁ Y NO VUELVE. Ver el encabezado de este archivo.
    cert.certificado,
    cert.facturado,
    cob.cobrado,
    cob.cobrado_neto,
        CASE
            WHEN es_administracion() AND op.monto_contratado IS NOT NULL THEN op.monto_contratado - COALESCE(cert.certificado, 0::numeric)
            ELSE NULL::numeric
        END AS pendiente_certificar,
    -- `pendiente_cobrar` era `certificado − cobrado` y daba 0 sobre dos tablas vacías: afirmaba que
    -- no quedaba nada por cobrar con $59M agendados. Lo reemplaza el dato de Cobranzas, con el
    -- nombre puesto — es una PROYECCIÓN de entrada, no una resta contable.
    cob.por_cobrar_proyectado,
    cob.n_cobranzas
   FROM obra_panel op
     LEFT JOIN hh ON hh.obra_id = op.obra_id
     LEFT JOIN hh_plan ON hh_plan.obra_id = op.obra_id
     LEFT JOIN pres ON pres.obra_id = op.obra_id
     LEFT JOIN cert ON cert.obra_id = op.obra_id
     LEFT JOIN plazo ON plazo.obra_id = op.obra_id
     LEFT JOIN obra_cobranza cob ON cob.obra_id = op.obra_id;

comment on view public.obra_plan_vs_real is
  'Plan contra real de cada obra: plazo, avance, HH, costo y ciclo comercial. NO publica margen — '
  '`margen_actual` (contratado − costo real) se retiró el 22/08 por no ser margen. El margen vive en '
  '`obra_economia`. `cobrado` y `por_cobrar_proyectado` salen de `obra_cobranza`, no de la tabla '
  '`certificados`, que está vacía.';

grant select on public.obra_panel to authenticated, service_role;
grant select on public.cliente_panel to authenticated, service_role;
grant select on public.obra_plan_vs_real to authenticated, service_role;

-- ── 3 · el panel económico de la obra ──────────────────────────────────────────────────────────
--
-- `security_invoker = true`: cada fuente aplica SU portero y esta vista no agrega ninguno propio.
-- La venta pasa por `contratado_de_obra()`; `adicionales` y `presupuestos` tienen RLS `ve_economia()`;
-- `obra_forecast_economico` y `obra_cobranza` corren como dueñas con `ve_economia()` adentro. El
-- costo real queda abierto a propósito: es la decisión del 19/08 —el jefe de obra ve lo que se
-- gastó en su obra, no cuánto se vendió—.
create view public.obra_economia with (security_invoker = true) as
with adic as (
  -- APROBADO, NO COTIZADO. Un adicional cotizado y no aprobado todavía no es venta: es una
  -- expectativa, y sumarla al contrato infla el margen antes de que el cliente diga que sí.
  select obra_canonica_id as obra_id,
         sum(monto_aprobado)                       as adicionales_aprobados,
         count(*)::int                             as n_adicionales_aprobados
    from public.adicionales
   where obra_canonica_id is not null
     and fecha_aprobacion is not null
     and monto_aprobado is not null
   group by obra_canonica_id
), pres as (
  select distinct on (p.obra_canonica_id)
         p.obra_canonica_id as obra_id,
         p.costo_directo_presupuestado,
         p.version,
         p.estado
    from public.presupuestos p
   where p.obra_canonica_id is not null
   order by p.obra_canonica_id, (p.estado = 'aprobado') desc, p.version desc
), venta as (
  select oc.id as obra_id,
         public.contratado_de_obra(oc.id) as venta_contratada
    from public.obra_canonica oc
)
select oc.id                                        as obra_id,
       oc.nombre                                    as obra,

       -- ═══ VENTA ═══
       v.venta_contratada,
       a.adicionales_aprobados,
       coalesce(a.n_adicionales_aprobados, 0)       as n_adicionales_aprobados,
       case when v.venta_contratada is not null
            then v.venta_contratada + coalesce(a.adicionales_aprobados, 0) end
                                                    as venta_total,

       -- ═══ COSTO ═══
       coalesce(fe.costo_cotizado, pr.costo_directo_presupuestado) as costo_objetivo,
       case
         when fe.costo_cotizado is not null
           then 'partidas congeladas convertidas a esta obra (' || fe.n_partidas_congeladas || ')'
         when pr.costo_directo_presupuestado is not null
           then 'costo directo del presupuesto v' || pr.version || ' (' || pr.estado || ')'
         else 'sin presupuesto congelado convertido y sin presupuesto cargado para esta obra'
       end                                          as costo_objetivo_origen,

       ocr.costo_real,
       ocr.n_comprobantes                           as costo_real_n_comprobantes,
       ocr.costo_mano_de_obra                       as costo_real_mano_de_obra,

       -- NULL SIEMPRE, HASTA QUE EXISTA FUENTE. Ver el encabezado: `obligaciones.obra_id` apunta a
       -- la tabla legacy y está vacío, y `cheques.obra` es unidad de negocio.
       null::numeric                                as costo_comprometido,
       'no hay fuente: obligaciones.obra_id apunta a la tabla legacy `obras` y está en NULL en las '
       'filas que existen, y cheques.obra guarda la unidad de negocio, no la obra'
                                                    as costo_comprometido_estado,

       -- ETC = EAC − AC, y sólo cuando hay EAC. Nunca al revés: un ETC inventado produce un EAC
       -- inventado con cara de suma.
       case when fe.costo_proyectado_inferido is not null
            then round(fe.costo_proyectado_inferido - coalesce(ocr.costo_real, 0), 2) end
                                                    as costo_restante_proyectado,
       fe.costo_proyectado_inferido                 as costo_final_proyectado,
       fe.base_de_la_proyeccion                     as base_del_forecast,

       -- ═══ MARGEN ═══ las dos únicas restas que son margen, y las dos pueden ser NULL.
       case when v.venta_contratada is not null
             and coalesce(fe.costo_cotizado, pr.costo_directo_presupuestado) is not null
            then v.venta_contratada + coalesce(a.adicionales_aprobados, 0)
                 - coalesce(fe.costo_cotizado, pr.costo_directo_presupuestado) end
                                                    as margen_cotizado,
       case when v.venta_contratada is not null and fe.costo_proyectado_inferido is not null
            then v.venta_contratada + coalesce(a.adicionales_aprobados, 0)
                 - fe.costo_proyectado_inferido end as margen_final_proyectado,

       -- ═══ CICLO COMERCIAL ═══ tres hechos distintos, tres fuentes, ninguna suplanta a la otra.
       ce.certificado,
       ce.facturado,
       cob.cobrado,
       cob.cobrado_neto,
       cob.por_cobrar_proyectado,
       coalesce(cob.n_cobranzas, 0)                 as n_cobranzas
  from public.obra_canonica oc
  join venta v                          on v.obra_id  = oc.id
  left join adic a                      on a.obra_id  = oc.id
  left join pres pr                     on pr.obra_id = oc.id
  left join public.obra_costo_real ocr  on ocr.obra_id = oc.id
  left join public.obra_forecast_economico fe on fe.obra_id = oc.id
  left join public.obra_cobranza cob    on cob.obra_id = oc.id
  left join (
    select obra_canonica_id as obra_id,
           sum(monto_certificado) as certificado,
           sum(monto_facturado)   as facturado
      from public.certificados
     where obra_canonica_id is not null
     group by obra_canonica_id
  ) ce on ce.obra_id = oc.id;

comment on view public.obra_economia is
  'EL PANEL ECONÓMICO DE LA OBRA. Ocho magnitudes con su regla y su disponibilidad honesta: venta '
  'contratada (+adicionales aprobados), costo objetivo, costo real a hoy (con su cobertura al lado), '
  'costo comprometido (sin fuente: NULL), ETC, EAC, margen cotizado y margen final proyectado. NO '
  'existe «margen actual»: contratado − costo real no es margen, le falta lo que queda por gastar y '
  'el costo real de esta casa no incluye la mano de obra imputada como Estructura. Donde falta base, '
  'NULL y la columna `*_origen`/`base_del_forecast` dice qué falta.';

grant select on public.obra_economia to authenticated;
grant select on public.obra_economia to service_role;
