-- LA AUSENCIA NO ES UNA HORA DE APOYO AL SUBCONTRATO (07/09/2026).
--
-- `registros_hh` guarda la ausencia CON horas y `tipo_hora = 'ausencia'` (el CHECK exige horas > 0):
-- una ausencia tiene horas y no es trabajo. Las vistas que suman HH reales de la obra
-- (`obra_plan_vs_real`, `xsas_actividad`, `actividad_fechas`) ya filtran las trabajadas desde el
-- 21/08. Estas dos no: `subcontrato_costo` sumaba TODA fila enlazada por `subcontrato_aporte` como
-- «hh propias de apoyo», y `subcontrato_aporte_detalle` publicaba sus horas. Con la carga de
-- asistencia por obra la ausencia pasa a ser un gesto diario, y una ausencia enlazada a un aporte
-- inflaría el costo del subcontrato. Misma lista de trabajadas que `tipoHora.ts` (TRABAJADAS).
--
-- Sólo cambia el filtro: mismas columnas, mismos nombres, mismo RLS (ve_obra + ve_economia).

create or replace view public.subcontrato_aporte_detalle as
 SELECT a.id,
    a.subcontrato_id,
    a.tipo,
    a.descripcion,
    a.cantidad,
    a.unidad,
    a.monto,
    a.fecha,
    a.registros_hh_id,
    CASE WHEN r.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text]) THEN r.horas ELSE NULL::numeric END AS horas_hh
   FROM subcontrato_aporte a
     JOIN subcontrato s ON s.id = a.subcontrato_id
     LEFT JOIN registros_hh r ON r.id = a.registros_hh_id
  WHERE ve_obra(s.obra_id) AND ve_economia();

create or replace view public.subcontrato_costo as
 SELECT s.id AS subcontrato_id,
    s.obra_id,
    s.nombre,
    s.estado,
    s.cantidad,
    s.unidad,
    s.precio_contratado,
    COALESCE(s.proveedor_texto, pr.razon_social) AS proveedor,
    COALESCE(ap.aportes, 0::numeric) AS aportes,
    COALESCE(s.precio_contratado, 0::numeric) + COALESCE(ap.aportes, 0::numeric) AS costo_real,
    ap.n_aportes,
    COALESCE(hh.horas, 0::numeric) AS hh_propias_de_apoyo,
    COALESCE(ex.n_personas, 0) AS personas_externas,
    COALESCE(ex.sin_art, 0) AS externas_sin_art,
    s.documentacion_ok,
        CASE
            WHEN s.cantidad > 0::numeric AND s.precio_contratado IS NOT NULL THEN round(s.precio_contratado / s.cantidad, 2)
            ELSE NULL::numeric
        END AS precio_unitario
   FROM subcontrato s
     LEFT JOIN proveedores pr ON pr.id = s.proveedor_id
     LEFT JOIN LATERAL ( SELECT sum(a.monto) AS aportes,
            count(*)::integer AS n_aportes
           FROM subcontrato_aporte a
          WHERE a.subcontrato_id = s.id) ap ON true
     LEFT JOIN LATERAL ( SELECT sum(r.horas) AS horas
           FROM subcontrato_aporte a
             JOIN registros_hh r ON r.id = a.registros_hh_id
          WHERE a.subcontrato_id = s.id
            AND (r.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text]))) hh ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_personas,
            count(*) FILTER (WHERE e.art_vigente_hasta IS NULL OR e.art_vigente_hasta < CURRENT_DATE)::integer AS sin_art
           FROM persona_externa e
          WHERE e.subcontrato_id = s.id AND e.activo) ex ON true
  WHERE ve_obra(s.obra_id) AND ve_economia();

-- LA EVIDENCIA ES DEL EFECTO: las cinco vistas que leen registros_hh tienen que filtrar tipo_hora.
do $$
declare v text; d text; sin int := 0;
begin
  foreach v in array array['obra_plan_vs_real','xsas_actividad','actividad_fechas','subcontrato_costo','subcontrato_aporte_detalle'] loop
    d := pg_get_viewdef(('public.'||v)::regclass, true);
    if position('tipo_hora' in d) = 0 then sin := sin + 1; raise notice 'sin filtro de tipo_hora: %', v; end if;
  end loop;
  if sin > 0 then raise exception '% vista(s) que leen registros_hh siguen sin filtrar tipo_hora', sin; end if;
end $$;
