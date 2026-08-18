-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LO COMERCIAL NO SALE DE POSTGRES SI QUIEN PREGUNTA NO ES ADMINISTRACIÓN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL PEDIDO, Y POR QUÉ NO ALCANZA CON SACAR LA COLUMNA ═══
--
-- El dueño, textual: *"«Contratado» sólo puede verlo Administración. **No alcanza con ocultar la
-- columna. El dato no debe viajar al usuario Obras desde query/API/server component.**"*
--
-- La distinción es exacta. Un `<th>` que no se renderiza no protege nada: la fila ya salió de la
-- base, viajó por PostgREST o quedó serializada en el payload del server component, y se lee con las
-- devtools abiertas. Es la misma familia de defecto que ya se pagó tres veces en este repo:
-- `obra_actividad` con un `for all`, las cuatro tablas de Operación con `using (true)`, y las cuatro
-- vistas del módulo sin `security_invoker`.
--
-- ═══ POR QUÉ `NULL` Y NO UNA SEGUNDA VISTA ═══
--
-- La alternativa era una vista "para obras". Se descarta: dos vistas del mismo concepto se
-- desincronizan —una recibe la corrección y la otra no— y ése es exactamente el defecto que se acaba
-- de pagar en Proveedores, donde convivían DOS definiciones de la deuda y el control contradecía al
-- cuadro de arriba.
--
-- Acá la columna sigue siendo UNA. Lo que cambia es que devuelve NULL cuando quien consulta no es
-- Administración. Y NULL, en todo este módulo, ya significa una cosa precisa: *no hay dato*. Las
-- pantallas nunca lo convierten en cero (`plata(null)` da `—`, jamás `$0`), así que un jefe de obra
-- ve el mismo guión que ante un contrato sin cargar — sin un cartel que anuncie "acá hay plata que
-- no podés ver".
--
-- ═══ QUÉ SE ENMASCARA Y QUÉ NO, DECLARADO ═══
--
-- SE ENMASCARA lo COMERCIAL: lo que se le cobra al cliente y lo que la empresa gana.
--   obra_panel        · monto_contratado · margen_sobre_contratado_pct
--   obra_plan_vs_real · monto_contratado · monto_presupuestado · margen_esperado · margen_actual
--                     · certificado · facturado · cobrado · pendiente_certificar · pendiente_cobrar
--
-- NO SE ENMASCARA el COSTO REAL ni el presupuesto de COSTO, y es una decisión declarada, no un
-- olvido. El dueño pidió *"si existe contradicción, resolverla a favor de seguridad y documentar la
-- decisión"*. No hay contradicción: la política vigente del MVP ya le da a Obras el costo de SUS
-- obras, acotado por `ve_obra()` en `costos_obra` — medido, 149 de 845 filas. Lo que gastó mi obra
-- es lo que necesito para ejecutarla; lo que la empresa le cobra al cliente, no.
--
-- `es_administracion()` es `stable` y `security definer`; sobre 8 obras el costo es irrelevante.
-- `security_invoker = true` se conserva: sin él las vistas correrían como su dueño y saltarían el
-- RLS de las tablas, que es cómo se descubrió la primera fuga el 18/08.


-- ═══ CÓMO SE ESCRIBE, Y POR QUÉ ASÍ ═══
--
-- El cuerpo ORIGINAL de cada vista queda intacto como subconsulta y el enmascarado va en la
-- proyección de afuera. El primer intento reescribía las columnas dentro del cuerpo con una
-- expresión regular y partió al medio un `CASE` de varias líneas (`THEN END END`): Postgres lo
-- rechazó, que es lo correcto, pero el modo de falla podría haber sido peor —una vista que compila y
-- calcula otra cosa—. Envolver no puede corromper una expresión que no toca.

-- Y el `::numeric(14,2)` no es cosmético: `create or replace view` exige que cada columna conserve
-- SU TIPO EXACTO, y un `CASE` sin cast devuelve `numeric` a secas. Postgres se negó — bien.

create or replace view public.obra_panel
  with (security_invoker = true) as
select
  b.obra_id,
  b.nombre,
  b.cliente_id,
  b.cliente_slug,
  b.cliente_nombre,
  b.cliente_texto,
  b.estado,
  b.tipo,
  b.etapa,
  b.jefe_obra,
  b.orden,
  case when public.es_administracion() then b.monto_contratado end as monto_contratado,
  b.fecha_inicio_plan,
  b.fecha_fin_plan,
  b.fecha_inicio_real,
  b.fecha_fin_real,
  b.drive_carpeta_id,
  b.costo_real,
  b.n_comprobantes,
  case when public.es_administracion() then b.margen_sobre_contratado_pct end as margen_sobre_contratado_pct,
  b.avance_pct,
  b.n_actividades_medidas,
  b.n_actividades,
  b.n_actividades_sin_planificar,
  b.avance_sincronizado_en,
  b.restricciones_abiertas,
  b.restricciones_vencidas
from (
SELECT oc.id AS obra_id,
    oc.nombre,
    oc.cliente_id,
    cl.slug AS cliente_slug,
    COALESCE(cl.nombre, oc.cliente_texto) AS cliente_nombre,
    oc.cliente_texto,
    oc.estado,
    oc.tipo,
    oc.etapa,
    oc.jefe_obra,
    oc.orden,
    oc.monto_contratado,
    oc.fecha_inicio_plan,
    oc.fecha_fin_plan,
    oc.fecha_inicio_real,
    oc.fecha_fin_real,
    oc.drive_carpeta_id,
    ocr.costo_real,
    ocr.n_comprobantes,
        CASE
            WHEN oc.monto_contratado > 0::numeric AND COALESCE(ocr.costo_real, 0::numeric) > 0::numeric THEN round((oc.monto_contratado - ocr.costo_real) / oc.monto_contratado * 100::numeric, 1)
            ELSE NULL::numeric
        END AS margen_sobre_contratado_pct,
    av.avance_pct,
    av.n_medidas::integer AS n_actividades_medidas,
    av.n_actividades::integer AS n_actividades,
    av.n_sin_planificar::integer AS n_actividades_sin_planificar,
    av.sincronizado_en AS avance_sincronizado_en,
    ( SELECT count(*)::integer AS count
           FROM obra_restriccion r
          WHERE r.obra_id = oc.id AND r.estado <> 'liberada'::text) AS restricciones_abiertas,
    ( SELECT count(*)::integer AS count
           FROM obra_restriccion r
          WHERE r.obra_id = oc.id AND r.estado <> 'liberada'::text AND r.fecha_compromiso IS NOT NULL AND r.fecha_compromiso < CURRENT_DATE) AS restricciones_vencidas
   FROM obra_canonica oc
     LEFT JOIN clientes cl ON cl.id = oc.cliente_id
     LEFT JOIN obra_costo_real ocr ON ocr.obra_id = oc.id
     LEFT JOIN obra_avance av ON av.obra_id = oc.id
) b;

create or replace view public.obra_plan_vs_real
  with (security_invoker = true) as
select
  b.obra_id,
  b.nombre,
  b.cliente_id,
  b.cliente_nombre,
  b.estado,
  b.etapa,
  b.inicio_plan,
  b.fin_plan,
  b.inicio_base,
  b.fin_base,
  b.desvio_plazo_dias,
  b.actividades_atrasadas,
  b.actividades_con_baseline,
  b.avance_pct,
  b.n_actividades_medidas,
  b.n_actividades,
  b.hh_plan,
  b.hh_estimada,
  b.hh_real,
  b.desvio_hh_pct,
  b.presupuesto_id,
  (case when public.es_administracion() then b.monto_presupuestado end)::numeric(14,2) as monto_presupuestado,
  b.costo_presupuestado,
  b.costo_real,
  b.desvio_costo_pct,
  case when public.es_administracion() then b.monto_contratado end as monto_contratado,
  (case when public.es_administracion() then b.margen_esperado end)::numeric(14,2) as margen_esperado,
  case when public.es_administracion() then b.margen_actual end as margen_actual,
  case when public.es_administracion() then b.certificado end as certificado,
  case when public.es_administracion() then b.facturado end as facturado,
  case when public.es_administracion() then b.cobrado end as cobrado,
  case when public.es_administracion() then b.pendiente_certificar end as pendiente_certificar,
  case when public.es_administracion() then b.pendiente_cobrar end as pendiente_cobrar
from (
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
            presupuestos.monto_presupuestado,
            presupuestos.costo_directo_presupuestado,
            presupuestos.margen_esperado,
            presupuestos.hh_estimada
           FROM presupuestos
          WHERE presupuestos.obra_canonica_id IS NOT NULL
          ORDER BY presupuestos.obra_canonica_id, (presupuestos.estado = 'aprobado'::text) DESC, presupuestos.version DESC
        ), cert AS (
         SELECT certificados.obra_canonica_id AS obra_id,
            sum(certificados.monto_certificado) AS certificado,
            sum(certificados.monto_facturado) AS facturado,
            sum(certificados.monto_cobrado) AS cobrado
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
        CASE
            WHEN op.monto_contratado > 0::numeric AND op.costo_real > 0::numeric THEN op.monto_contratado - op.costo_real
            ELSE NULL::numeric
        END AS margen_actual,
    cert.certificado,
    cert.facturado,
    cert.cobrado,
        CASE
            WHEN op.monto_contratado IS NOT NULL THEN op.monto_contratado - COALESCE(cert.certificado, 0::numeric)
            ELSE NULL::numeric
        END AS pendiente_certificar,
    COALESCE(cert.certificado, 0::numeric) - COALESCE(cert.cobrado, 0::numeric) AS pendiente_cobrar
   FROM obra_panel op
     LEFT JOIN hh ON hh.obra_id = op.obra_id
     LEFT JOIN hh_plan ON hh_plan.obra_id = op.obra_id
     LEFT JOIN pres ON pres.obra_id = op.obra_id
     LEFT JOIN cert ON cert.obra_id = op.obra_id
     LEFT JOIN plazo ON plazo.obra_id = op.obra_id
) b;
comment on view public.obra_plan_vs_real is
  'Plan contra real. Contrato, venta, margen y todo el ciclo de certificación/cobranza devuelven '
  'NULL a quien no es Administración. Plazo, avance, HH y costo quedan visibles: son la ejecución.';

grant select on public.obra_panel, public.obra_plan_vs_real to authenticated, service_role;
