-- EL COSTO COTIZADO DE LA OBRA VIVE EN `presupuestos`, ATADO A `obra_canonica`.
--
-- ═══ POR QUÉ (17/09/2026) ═══
--
-- Analíticas comparaba el gasto contra el CONTRATO porque `obra_economia.costo_objetivo` estaba en
-- NULL en las 10 obras activas. El dato existía: cada obra tiene en Drive su «cotización interna»
-- (.xlsm, pestaña Presupuesto) con el costo directo sobre el que se armó el precio. Esta migración
-- deja a `presupuestos` en condiciones de guardarlo para obras canónicas; la carga la hace
-- `orquestador/scripts/cargar-presupuestos-cotizados.mjs` con citas hoja!celda + drive id.
--
-- ═══ DOS MAGNITUDES QUE SE PARECEN Y NO SON LA MISMA ═══
--
--   COSTO COTIZADO TOTAL (esto: `presupuestos.costo_directo_presupuestado` → `obra_economia.costo_objetivo`)
--     Lo que la cotización APROBADA dijo que iba a costar la obra ENTERA: MO + cargas sociales +
--     materiales (incluye equipos, fletes y subcontratos, que la plantilla no separa). Sin gastos
--     generales, sin beneficio, sin impuestos, sin IVA. Se fija al cotizar y no cambia con el avance.
--     En una oferta «sólo mano de obra» construida sobre MO+CS (Presupuesto!R), es MO+CS.
--     Los gastos generales van en `costo_indirecto_presupuestado` y se muestran APARTE
--     (`obra_economia.costo_indirecto_objetivo`).
--
--   COSTO RESTANTE PROYECTADO (NO es esto: `orquestador/lib/obras-datos.mjs` → pestaña OBRAS
--   «Costo proyectado» → `obra_economia_cartera.costo_mo / costo_materiales`)
--     La explosión de gastos que declaró el dueño («Gastos - … .pdf»), YA ESCALADA por lo NO
--     ejecutado (BSA al 60% restante). Sirve para proyectar caja; no es la línea de base del margen.
--     Que en algunas obras coincidan (muro, ácido) es porque ahí la explosión se tomó de la misma
--     planilla y la obra no había empezado, no porque sean el mismo concepto.
--
-- ═══ QUÉ CAMBIA ═══
--
--   1. `presupuestos.obra_id` (tabla legacy `obras`) deja de ser obligatorio: se exige obra_id U
--      obra_canonica_id. Las obras canónicas no tienen fila en `obras`.
--   2. Unicidad (obra_canonica_id, version) y un solo 'aprobado' por obra canónica. Las filas legacy
--      tienen obra_canonica_id NULL y siguen gobernadas por sus índices sobre obra_id.
--   3. Estado 'cotizado': cotización entregada y NO aprobada (p. ej. el adicional del playón de
--      dilución de ácido). No entra en costo_objetivo.
--   4. Costo pendiente con motivo: una recotización vendida sin costo cotizado (messina-bsa 2026)
--      guarda su venta y deja el costo en NULL CON EL MOTIVO escrito — nunca un número inventado ni
--      el costo de otra época escalado.
--   5. Moneda original: una venta en U$S guarda el monto original y el tipo de cambio con su origen.
--   6. `obra_economia`: toma SÓLO el presupuesto aprobado (antes tomaba el de mayor versión aunque
--      estuviera reemplazado), expone los gastos generales aparte y `margen_cotizado` los RESTA:
--      un gasto general no es margen.
--
-- RLS: no se toca ninguna policy. `presupuestos_select`/`presupuestos_write` no miran obra_id.
-- Columnas nuevas: nacen sin GRANT (privilegios por defecto angostos), se conceden explícitamente.
-- `monto_moneda_original` NO se concede en SELECT, igual que `monto_presupuestado`: es precio de venta.

set local lock_timeout = '5s';

-- ── 1 · obra legacy u obra canónica ─────────────────────────────────────────────────────────────
alter table public.presupuestos alter column obra_id drop not null;
alter table public.presupuestos
  add constraint presupuestos_obra_legacy_o_canonica
  check (obra_id is not null or obra_canonica_id is not null);

-- ── 2 · unicidad por obra canónica ──────────────────────────────────────────────────────────────
alter table public.presupuestos
  add constraint presupuestos_canonica_version_key unique (obra_canonica_id, version);
create unique index presupuestos_un_aprobado_por_obra_canonica
  on public.presupuestos (obra_canonica_id)
  where estado = 'aprobado' and obra_canonica_id is not null;

-- ── 3 · estado 'cotizado' ───────────────────────────────────────────────────────────────────────
alter table public.presupuestos drop constraint presupuestos_estado_check;
alter table public.presupuestos
  add constraint presupuestos_estado_check
  check (estado = any (array['borrador', 'cotizado', 'aprobado', 'reemplazado']));

-- ── 4 · costo pendiente, con motivo ─────────────────────────────────────────────────────────────
alter table public.presupuestos add column costo_pendiente_motivo text;
alter table public.presupuestos alter column costo_directo_presupuestado drop not null;
alter table public.presupuestos alter column costo_indirecto_presupuestado drop not null;
alter table public.presupuestos alter column margen_esperado drop not null;
alter table public.presupuestos
  add constraint presupuestos_costo_o_motivo
  check ((costo_directo_presupuestado is null) = (nullif(btrim(costo_pendiente_motivo), '') is not null));
alter table public.presupuestos
  add constraint presupuestos_sin_costo_sin_derivados
  check (costo_directo_presupuestado is not null
         or (costo_indirecto_presupuestado is null and margen_esperado is null));
alter table public.presupuestos
  add constraint presupuestos_con_costo_con_indirecto
  check (costo_directo_presupuestado is null
         or (costo_indirecto_presupuestado is not null and margen_esperado is not null));

-- ── 5 · moneda original ─────────────────────────────────────────────────────────────────────────
alter table public.presupuestos add column moneda_original text;
alter table public.presupuestos add column monto_moneda_original numeric;
alter table public.presupuestos add column tipo_cambio numeric;
alter table public.presupuestos add column tipo_cambio_origen text;
alter table public.presupuestos
  add constraint presupuestos_moneda_original_check
  check (moneda_original is null or moneda_original = any (array['ARS', 'USD']));
alter table public.presupuestos
  add constraint presupuestos_moneda_original_completa
  check ((moneda_original is null and monto_moneda_original is null and tipo_cambio is null and tipo_cambio_origen is null)
      or (moneda_original is not null and monto_moneda_original > 0 and tipo_cambio > 0
          and nullif(btrim(tipo_cambio_origen), '') is not null));

grant select (costo_pendiente_motivo, moneda_original, tipo_cambio, tipo_cambio_origen)
  on public.presupuestos to authenticated;
grant insert (costo_pendiente_motivo, moneda_original, monto_moneda_original, tipo_cambio, tipo_cambio_origen),
      update (costo_pendiente_motivo, moneda_original, monto_moneda_original, tipo_cambio, tipo_cambio_origen)
  on public.presupuestos to authenticated;

comment on column public.presupuestos.costo_directo_presupuestado is
  'COSTO COTIZADO TOTAL: MO + cargas sociales + materiales (con equipos, fletes y subcontratos) sobre el que se armó el precio. Sin GG, beneficio, impuestos ni IVA. NULL sólo con costo_pendiente_motivo. No es el costo restante proyectado de obras-datos.mjs.';
comment on column public.presupuestos.costo_indirecto_presupuestado is
  'Gastos generales de la cotización. Se muestran aparte y se restan del margen cotizado.';
comment on column public.presupuestos.costo_pendiente_motivo is
  'Por qué una venta aprobada no tiene costo cotizado. Obligatorio si costo_directo_presupuestado es NULL.';
comment on column public.presupuestos.monto_moneda_original is
  'Venta en su moneda original (p. ej. U$S). monto_presupuestado es su equivalente en ARS con tipo_cambio.';

-- ── 6 · obra_economia: sólo lo aprobado, GG aparte, margen sin GG ───────────────────────────────
create or replace view public.obra_economia with (security_invoker = true) as
 WITH adic AS (
         SELECT adicionales.obra_canonica_id AS obra_id,
            sum(adicionales.monto_aprobado) AS adicionales_aprobados,
            (count(*))::integer AS n_adicionales_aprobados
           FROM adicionales
          WHERE ((adicionales.obra_canonica_id IS NOT NULL) AND (adicionales.fecha_aprobacion IS NOT NULL) AND (adicionales.monto_aprobado IS NOT NULL))
          GROUP BY adicionales.obra_canonica_id
        ), pres AS (
         -- SÓLO EL APROBADO. 'reemplazado' y 'cotizado' no son la línea de base de nadie.
         SELECT DISTINCT ON (p.obra_canonica_id) p.obra_canonica_id AS obra_id,
            p.costo_directo_presupuestado,
            p.costo_indirecto_presupuestado,
            p.costo_pendiente_motivo,
            p.version,
            p.estado
           FROM presupuestos p
          WHERE ((p.obra_canonica_id IS NOT NULL) AND (p.estado = 'aprobado'::text))
          ORDER BY p.obra_canonica_id, p.version DESC
        ), venta AS (
         SELECT oc_1.id AS obra_id,
            contratado_de_obra(oc_1.id) AS venta_contratada
           FROM obra_canonica oc_1
        )
 SELECT oc.id AS obra_id,
    oc.nombre AS obra,
    v.venta_contratada,
    a.adicionales_aprobados,
    COALESCE(a.n_adicionales_aprobados, 0) AS n_adicionales_aprobados,
        CASE
            WHEN (v.venta_contratada IS NOT NULL) THEN (v.venta_contratada + COALESCE(a.adicionales_aprobados, (0)::numeric))
            ELSE NULL::numeric
        END AS venta_total,
    COALESCE(fe.costo_cotizado, pr.costo_directo_presupuestado) AS costo_objetivo,
        CASE
            WHEN (fe.costo_cotizado IS NOT NULL) THEN (('partidas congeladas convertidas a esta obra ('::text || fe.n_partidas_congeladas) || ')'::text)
            WHEN (pr.costo_directo_presupuestado IS NOT NULL) THEN (((('costo directo del presupuesto v'::text || pr.version) || ' ('::text) || pr.estado) || ')'::text)
            WHEN (pr.costo_pendiente_motivo IS NOT NULL) THEN (((('presupuesto v'::text || pr.version) || ' aprobado sin costo cotizado: '::text) || pr.costo_pendiente_motivo))
            ELSE 'sin presupuesto congelado convertido y sin presupuesto cargado para esta obra'::text
        END AS costo_objetivo_origen,
    ocr.costo_real,
    ocr.n_comprobantes AS costo_real_n_comprobantes,
    ocr.costo_mano_de_obra AS costo_real_mano_de_obra,
    NULL::numeric AS costo_comprometido,
    'no hay fuente: obligaciones.obra_id apunta a la tabla legacy `obras` y está en NULL en las filas que existen, y cheques.obra guarda la unidad de negocio, no la obra'::text AS costo_comprometido_estado,
        CASE
            WHEN (fe.costo_proyectado_inferido IS NOT NULL) THEN round((fe.costo_proyectado_inferido - COALESCE(ocr.costo_real, (0)::numeric)), 2)
            ELSE NULL::numeric
        END AS costo_restante_proyectado,
    fe.costo_proyectado_inferido AS costo_final_proyectado,
    fe.base_de_la_proyeccion AS base_del_forecast,
        CASE
            -- Venta − costo directo − GASTOS GENERALES. Por la vía de partidas congeladas no hay GG
            -- declarados: ahí se resta sólo el costo cotizado (límite documentado, no un cero inventado).
            WHEN ((v.venta_contratada IS NOT NULL) AND (COALESCE(fe.costo_cotizado, pr.costo_directo_presupuestado) IS NOT NULL)) THEN (((v.venta_contratada + COALESCE(a.adicionales_aprobados, (0)::numeric)) - COALESCE(fe.costo_cotizado, pr.costo_directo_presupuestado)) -
            CASE
                WHEN (fe.costo_cotizado IS NULL) THEN COALESCE(pr.costo_indirecto_presupuestado, (0)::numeric)
                ELSE (0)::numeric
            END)
            ELSE NULL::numeric
        END AS margen_cotizado,
        CASE
            WHEN ((v.venta_contratada IS NOT NULL) AND (fe.costo_proyectado_inferido IS NOT NULL)) THEN ((v.venta_contratada + COALESCE(a.adicionales_aprobados, (0)::numeric)) - fe.costo_proyectado_inferido)
            ELSE NULL::numeric
        END AS margen_final_proyectado,
    ce.certificado,
    ce.facturado,
    cob.cobrado,
    cob.cobrado_neto,
    cob.por_cobrar_proyectado,
    COALESCE(cob.n_cobranzas, 0) AS n_cobranzas,
        CASE
            WHEN ((fe.costo_cotizado IS NULL) AND (pr.costo_directo_presupuestado IS NOT NULL)) THEN pr.costo_indirecto_presupuestado
            ELSE NULL::numeric
        END AS costo_indirecto_objetivo
   FROM (((((((obra_canonica oc
     JOIN venta v ON ((v.obra_id = oc.id)))
     LEFT JOIN adic a ON ((a.obra_id = oc.id)))
     LEFT JOIN pres pr ON ((pr.obra_id = oc.id)))
     LEFT JOIN obra_costo_real ocr ON ((ocr.obra_id = oc.id)))
     LEFT JOIN obra_forecast_economico fe ON ((fe.obra_id = oc.id)))
     LEFT JOIN obra_cobranza cob ON ((cob.obra_id = oc.id)))
     LEFT JOIN ( SELECT certificados.obra_canonica_id AS obra_id,
            sum(certificados.monto_certificado) AS certificado,
            sum(certificados.monto_facturado) AS facturado
           FROM certificados
          WHERE (certificados.obra_canonica_id IS NOT NULL)
          GROUP BY certificados.obra_canonica_id) ce ON ((ce.obra_id = oc.id)));

comment on column public.obra_economia.costo_objetivo is
  'COSTO COTIZADO TOTAL de la cotización aprobada (sin GG). No es el costo restante proyectado de obras-datos.mjs / obra_economia_cartera.';
comment on column public.obra_economia.margen_cotizado is
  'Venta total − costo objetivo − gastos generales (costo_indirecto_objetivo). Por la vía de partidas congeladas no hay GG: resta sólo el costo.';
comment on column public.obra_economia.costo_indirecto_objetivo is
  'Gastos generales de la cotización aprobada, mostrados aparte del costo objetivo. NULL si no hay presupuesto con costo o si el costo sale de partidas congeladas.';
