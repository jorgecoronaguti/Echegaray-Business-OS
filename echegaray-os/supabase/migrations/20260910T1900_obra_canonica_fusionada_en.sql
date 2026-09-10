-- FUSIÓN DE OBRAS DUPLICADAS — la marca que saca la obra vieja de las pantallas.
--
-- Decisión del dueño (10/09/2026): «BSA - Planta» y «ME - BSA» son la misma obra, y «Pisos 120m2» y
-- «ME - PISOS 120 M² Y RAMPA» también. Los DATOS ya se movieron con
-- `orquestador/scripts/obras-fusionar.mjs --de <viejo> --en <activo> --aplicar`; lo que falta es
-- que la ficha del cliente deje de contar dos veces la misma obra.
--
-- POR QUÉ NO SE BORRA LA FILA VIEJA: su nombre sigue escrito en documentos, en el Sheet y en la
-- cabeza de la gente. `obra_alias` la resuelve al slug activo; la fila vieja queda como registro de
-- que ese slug existió y a dónde fue. Borrarla dejaría huérfano cualquier texto que la nombre.
--
-- La columna es NULL para toda obra viva: el filtro de `obra_panel` no cambia nada para las demás.

alter table public.obra_canonica
  add column if not exists fusionada_en text references public.obra_canonica(id);

comment on column public.obra_canonica.fusionada_en is
  'Si no es NULL, esta obra es la MISMA que la apuntada: quedó como alias histórico y no se muestra.';

-- Una obra fusionada no puede apuntarse a sí misma ni encadenarse: el destino tiene que estar vivo.
alter table public.obra_canonica drop constraint if exists obra_canonica_fusionada_en_chk;
alter table public.obra_canonica add constraint obra_canonica_fusionada_en_chk
  check (fusionada_en is null or fusionada_en <> id);

update public.obra_canonica set fusionada_en = 'messina-bsa' where id = 'bsa-planta';
update public.obra_canonica set fusionada_en = 'messina-pisos-120-rampa' where id = 'pisos-120m2';

-- `obra_panel` es lo que lee la ficha del cliente (getObrasDelCliente). Mismo cuerpo que ya tenía,
-- con el único agregado del filtro final.
create or replace view public.obra_panel as
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
    contratado_de_obra(oc.id) AS monto_contratado,
    f.inicio_plan AS fecha_inicio_plan,
    f.fin_plan AS fecha_fin_plan,
    f.inicio_real AS fecha_inicio_real,
    f.fin_real AS fecha_fin_real,
    oc.drive_carpeta_id,
    ocr.costo_real,
    ocr.n_comprobantes,
    ocr.costo_mano_de_obra,
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
          WHERE r.obra_id = oc.id AND r.estado <> 'liberada'::text AND r.fecha_compromiso IS NOT NULL AND r.fecha_compromiso < CURRENT_DATE) AS restricciones_vencidas,
    f.inicio_plan_declarado AS fecha_inicio_plan_declarado,
    f.fin_plan_declarado AS fecha_fin_plan_declarado,
    f.inicio_real_declarado AS fecha_inicio_real_declarado,
    f.fin_real_declarado AS fecha_fin_real_declarado,
    f.origen_fechas_plan,
    f.origen_inicio_real,
    f.forecast_fin,
    f.n_sin_fecha AS n_actividades_sin_fecha,
    oc.created_at AS creada_en
   FROM obra_canonica oc
     LEFT JOIN clientes cl ON cl.id = oc.cliente_id
     LEFT JOIN obra_costo_real ocr ON ocr.obra_id = oc.id
     LEFT JOIN obra_avance av ON av.obra_id = oc.id
     LEFT JOIN obra_fechas f ON f.obra_id = oc.id
  where oc.fusionada_en is null;
