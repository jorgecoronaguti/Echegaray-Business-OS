-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL DIRECTORIO PUBLICA EL NÚMERO DE LEGAJO — el del recibo de sueldo
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Orden del dueño (08/09/2026): Plantel tiene que reflejar la categoría, la fecha de alta y el
-- número de legajo que salen en el recibo de sueldo. La lista lee `persona_directorio`, y la vista
-- no publicaba `legajo`: la columna existe en `personas` (text) y `authenticated` ya tiene GRANT
-- sobre ella a nivel de columna, así que lo único que faltaba era que la vista la nombrara.
--
-- Se recrea con la definición VIVA leída por pg_get_viewdef el 08/09/2026 más `p.legajo` al final
-- —`create or replace view` sólo admite agregar columnas al final— y con el `security_invoker`
-- que la vista tiene HOY en la base (`true`, leído de pg_class.reloptions), no el de un texto
-- viejo: 20260907T1800 ya pagó esa trampa.
--
-- Datos: los 16 activos con recibo tienen legajo y fecha de ingreso iguales a los del recibo de la
-- 2ª quincena 08/2026; OCHOA EDUARDO ARIEL se corrigió (legajo 95, ingreso 26/08/2026) con rastro
-- en `personas.notas`. CASTILLO BENITEZ no tiene recibo todavía: legajo NULL, y la lista lo dice.

create or replace view public.persona_directorio
with (security_invoker = true) as
 SELECT p.id,
    p.nombre_completo,
    p.categoria,
    p.especialidad,
    p.puesto,
    p.fecha_ingreso,
    p.fecha_egreso,
    ci.cuadrilla_id,
    cu.nombre AS cuadrilla,
    a.obra_id AS obra_actual_id,
    oc.nombre AS obra_actual,
    a.rol AS rol_en_obra,
    a.desde AS asignada_desde,
    p.en_la_empresa,
    p.legajo
   FROM personas p
     LEFT JOIN cuadrilla_integrante ci ON ci.persona_id = p.id AND ci.hasta IS NULL
     LEFT JOIN cuadrilla cu ON cu.id = ci.cuadrilla_id
     LEFT JOIN LATERAL ( SELECT oa.obra_id,
            oa.rol,
            oa.desde
           FROM obra_asignacion oa
          WHERE oa.persona_id = p.id AND asignacion_vigente(oa.desde, oa.hasta)
          ORDER BY oa.desde DESC NULLS LAST, oa.creado_en DESC
         LIMIT 1) a ON true
     LEFT JOIN obra_canonica oc ON oc.id = a.obra_id
  WHERE p.es_prueba IS NOT TRUE;

-- `create or replace view` conserva los GRANT existentes (SELECT a authenticated). Se verifica
-- después de aplicar: select legajo from persona_directorio where en_la_empresa limit 1;
