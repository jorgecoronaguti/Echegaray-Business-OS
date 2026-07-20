-- AUDITORÍA 2026-07-19 · HALLAZGO GRAVE: la web no muestra NINGUNA obra activa.
--
-- La web lista obras desde `public.obras` (legacy), que contiene 4 obras — todas pausadas o
-- cerradas (Galpones, Cambio de Pisos - RRHH, Galpón 9, Pisos). Las 4 obras que la empresa está
-- ejecutando HOY (ARCOR, La Estrella, San Francisco, Messina) viven en `obra_canonica` y **no
-- existen para la web**. La Estrella, con $168,7M de costo real acumulado, es invisible en pantalla.
--
-- POR QUÉ NO SE RESUELVE INSERTANDO LAS OBRAS REALES EN `public.obras`: esa tabla exige
-- cliente_id, monto_contratado (> 0), fecha_inicio y fecha_fin_objetivo, todos NOT NULL. El OS no
-- conoce el monto contratado ni las fechas de esas obras — insertarlas obligaría a INVENTAR datos
-- económicos, que es exactamente lo que el CLAUDE.md prohíbe. Se prefiere mostrar la obra con el
-- dato faltante declarado antes que fabricarlo, y antes que no mostrarla.
--
-- Esta vista es la fuente única del PANEL DE OBRAS para cualquier cara del OS: nombre y estado del
-- eje canónico, costo real de `obra_costo_real` (ya verificado al peso contra el chat), y NULL
-- explícito donde el dato todavía no existe. Lo que falta se ve como falta.
create or replace view public.obra_panel as
select oc.id                       as obra_id,
       oc.nombre                   as obra_nombre,
       oc.estado,
       oc.tipo,
       ocr.costo_real,
       ocr.n_comprobantes,
       -- Enlace al registro legacy SOLO cuando el nombre coincide de verdad; si no, null.
       -- No se fuerza una correspondencia que no existe.
       o.id                        as obra_legacy_id,
       o.monto_contratado,                       -- null si no hay registro legacy: dato desconocido
       o.fecha_inicio,
       o.fecha_fin_objetivo,
       -- El margen SOLO se calcula si hay las dos puntas: contratado Y costo real registrado.
       -- Sin costo, "margen 100%" no es un margen: es un dato faltante disfrazado de ganancia
       -- (caso real: Galpones, $204M contratado y $0 de costo cargado). Mejor null que mentir.
       case when o.monto_contratado is not null and o.monto_contratado > 0
                 and coalesce(ocr.costo_real, 0) > 0
            then round(((o.monto_contratado - ocr.costo_real) / o.monto_contratado) * 100, 1)
       end                         as margen_sobre_contratado_pct
  from public.obra_canonica oc
  left join public.obra_costo_real ocr on ocr.obra_id = oc.id
  left join public.obras o on public.norm_obra(o.nombre) = public.norm_obra(oc.nombre);

comment on view public.obra_panel is
  'FUENTE ÚNICA del panel de obras (chat y web). Obras REALES del eje canónico + costo real; monto contratado y fechas quedan NULL cuando no se conocen — el dato faltante se declara, no se inventa. La tabla legacy public.obras NO contiene las obras activas.';
