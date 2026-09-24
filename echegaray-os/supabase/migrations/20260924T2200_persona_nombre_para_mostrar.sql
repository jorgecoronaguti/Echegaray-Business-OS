-- EL NOMBRE CON QUE SE LLAMA A UNA PERSONA EN LA APP (dueño, 24/09/2026: «¿Querés los nombres como
-- "Emiliano Maldonado" en lugar de "Maldonado Batista Emiliano Miguel"?» → «sí»).
--
-- `nombre_completo` es el LEGAJO (el nombre legal: recibos, alta, ARCA) y no cambia de significado.
-- `nombre_para_mostrar` es como se lo nombra en toda pantalla que no sea legal: «Emiliano Maldonado».
-- Es un dato CURADO: se precarga (20260924T2210) y se corrige a mano desde la ficha de la persona.
-- `nombre_para_mostrar_fuente` dice de dónde salió cada uno, para que el dueño sepa cuáles revisar:
--   cuenta     · el nombre de su cuenta de usuario (perfiles.nombre)
--   jornales   · cómo la escribe la planilla JORNALES
--   heuristica · primer nombre + primer apellido deducidos del legajo (confianza baja)
--   manual     · lo escribió una persona en la ficha
-- Sin `nombre_para_mostrar`, las pantallas caen al legajo (src/shared/personas/nombre.ts).
alter table public.personas add column if not exists nombre_para_mostrar text;
alter table public.personas add column if not exists nombre_para_mostrar_fuente text;
alter table public.personas drop constraint if exists personas_nombre_para_mostrar_fuente_check;
alter table public.personas add constraint personas_nombre_para_mostrar_fuente_check
  check (nombre_para_mostrar_fuente is null or nombre_para_mostrar_fuente in ('cuenta', 'jornales', 'heuristica', 'manual'));

-- `personas` tiene grant POR COLUMNA: una columna nueva nace sin permiso (memoria «columna nueva nace
-- sin permiso»). La política de la tabla sigue decidiendo QUÉ filas.
grant select (nombre_para_mostrar, nombre_para_mostrar_fuente) on public.personas to authenticated;
grant insert (nombre_para_mostrar, nombre_para_mostrar_fuente) on public.personas to authenticated;
grant update (nombre_para_mostrar, nombre_para_mostrar_fuente) on public.personas to authenticated;

-- Un usuario se llama como su persona: ahora por su nombre para mostrar; sin él, el legajo; sin
-- persona, el nombre de la cuenta.
create or replace function public.nombres_de_usuarios()
returns table (id uuid, nombre text, persona_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select pf.id,
         coalesce(nullif(btrim(pe.nombre_para_mostrar), ''), nullif(btrim(pe.nombre_completo), ''), nullif(btrim(pf.nombre), '')) as nombre,
         pf.persona_id
    from public.perfiles pf
    left join public.personas pe on pe.id = pf.persona_id
   where (select auth.uid()) is not null
      or (select auth.role()) = 'service_role'
$$;
revoke all on function public.nombres_de_usuarios() from public, anon;
grant execute on function public.nombres_de_usuarios() to authenticated, service_role;

-- Las vistas que publican el legajo publican también el nombre para mostrar, AL FINAL (create or
-- replace sólo permite agregar columnas al final) y con su security_invoker de siempre, explícito:
-- un create or replace sin `with` lo pierde (memoria «vista que pierde security_invoker»).
create or replace view public.mi_legajo with (security_invoker = false) as
 SELECT id,
    nombre_completo,
    dni,
    cuil,
    fecha_nacimiento,
    nacionalidad,
    telefono,
    email,
    domicilio,
    contacto_emergencia,
    contacto_emergencia_telefono,
    categoria,
    especialidad,
    puesto,
    convenio_colectivo,
    art,
    obra_social,
    fecha_ingreso,
    fecha_egreso,
    en_la_empresa,
    legajo,
    p.nombre_para_mostrar
   FROM personas p
  WHERE id = mi_persona_id();

create or replace view public.presencia_del_dia with (security_invoker = true) as
 SELECT m.persona_id,
    p.nombre_completo,
    p.categoria,
    p.puesto,
    m.fecha,
    m.obra_id,
    o.nombre AS obra,
    min(m.momento) FILTER (WHERE m.tipo = 'entrada'::text) AS entrada,
    min(m.momento) FILTER (WHERE m.tipo = 'salida'::text) AS salida,
    count(*) FILTER (WHERE m.tipo = 'incidencia'::text)::integer AS incidencias,
    max(m.motivo) FILTER (WHERE m.tipo = 'incidencia'::text) AS motivo,
    (array_agg(m.lat ORDER BY m.momento) FILTER (WHERE m.tipo = 'entrada'::text))[1] AS lat,
    (array_agg(m.lon ORDER BY m.momento) FILTER (WHERE m.tipo = 'entrada'::text))[1] AS lon,
    (array_agg(m.precision_m ORDER BY m.momento) FILTER (WHERE m.tipo = 'entrada'::text))[1] AS precision_m,
    (array_agg(m.origen ORDER BY m.momento) FILTER (WHERE m.tipo = 'entrada'::text))[1] AS origen,
        CASE
            WHEN min(m.momento) FILTER (WHERE m.tipo = 'entrada'::text) IS NULL THEN 'sin_registrar'::text
            WHEN min(m.momento) FILTER (WHERE m.tipo = 'salida'::text) IS NOT NULL THEN 'cerrada'::text
            WHEN m.fecha = CURRENT_DATE THEN 'activo'::text
            ELSE 'falta_salida'::text
        END AS estado,
    max(p.nombre_para_mostrar) AS nombre_para_mostrar
   FROM asistencia_marca m
     JOIN personas p ON p.id = m.persona_id
     LEFT JOIN obra_canonica o ON o.id = m.obra_id
  GROUP BY m.persona_id, p.nombre_completo, p.categoria, p.puesto, m.fecha, m.obra_id, o.nombre;

create or replace view public.mi_cuadrilla with (security_invoker = false) as
 SELECT c.id AS cuadrilla_id,
    c.nombre AS cuadrilla,
    p.nombre_completo,
    COALESCE(p.puesto, p.categoria) AS rol,
    p.id = c.responsable_id AS es_responsable,
    p.id = mi_persona_id() AS soy_yo,
    p.nombre_para_mostrar
   FROM cuadrilla_integrante mia
     JOIN cuadrilla c ON c.id = mia.cuadrilla_id
     JOIN cuadrilla_integrante ci ON ci.cuadrilla_id = c.id AND ci.hasta IS NULL
     JOIN personas p ON p.id = ci.persona_id
  WHERE mia.persona_id = mi_persona_id() AND mia.hasta IS NULL;

create or replace view public.persona_hh_dia with (security_invoker = true) as
 SELECT h.id,
    h.persona_id,
    p.nombre_completo,
    p.categoria,
    h.fecha,
    h.fecha_inicio_semana,
    h.obra_canonica_id AS obra_id,
    o.nombre AS obra,
    h.actividad_id,
    a.nombre AS actividad,
    h.tipo_hora,
    h.horas,
    h.notas,
    h.created_at,
    p.nombre_para_mostrar
   FROM registros_hh h
     JOIN personas p ON p.id = h.persona_id
     LEFT JOIN obra_canonica o ON o.id = h.obra_canonica_id
     LEFT JOIN obra_actividad a ON a.id = h.actividad_id
  WHERE h.persona_id IS NOT NULL;

create or replace view public.correccion_asistencia_bandeja with (security_invoker = true) as
 SELECT s.id,
    s.persona_id,
    p.nombre_completo,
    s.fecha,
    s.tipo,
    s.hora_propuesta,
    s.motivo,
    s.estado,
    s.nota_resolucion,
    s.resuelta_en,
    s.marca_id,
    s.creado_en,
    ( SELECT min(m.momento) AS min
           FROM asistencia_marca m
          WHERE m.persona_id = s.persona_id AND m.fecha = s.fecha AND m.tipo = 'entrada'::text) AS entrada,
    ( SELECT min(m.momento) AS min
           FROM asistencia_marca m
          WHERE m.persona_id = s.persona_id AND m.fecha = s.fecha AND m.tipo = 'salida'::text) AS salida,
    p.nombre_para_mostrar
   FROM solicitud_correccion_asistencia s
     JOIN personas p ON p.id = s.persona_id;

create or replace view public.persona_directorio with (security_invoker = true) as
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
    p.legajo,
    p.subcontrato_id,
    p.nombre_para_mostrar
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
  WHERE p.es_prueba IS NOT TRUE OR ( SELECT sesion_es_de_prueba() AS sesion_es_de_prueba);

create or replace view public.persona_legajo with (security_invoker = false) as
 SELECT id,
    nombre_completo,
    dni,
    cuil,
    fecha_nacimiento,
    nacionalidad,
    telefono,
    email,
    domicilio,
    contacto_emergencia,
    contacto_emergencia_telefono,
    fecha_ingreso,
    fecha_egreso,
    convenio_colectivo,
    categoria,
    especialidad,
    puesto,
    modalidad_liquidacion,
    art,
    obra_social,
    drive_folder_id,
    notas,
    legajo,
    en_la_empresa,
    p.nombre_para_mostrar
   FROM personas p
  WHERE es_administracion() AND (es_prueba IS NOT TRUE OR ( SELECT sesion_es_de_prueba() AS sesion_es_de_prueba));

create or replace view public.persona_plantel with (security_invoker = false) as
 SELECT id,
    nombre_completo,
    categoria,
    especialidad,
    fecha_egreso,
    p.nombre_para_mostrar
   FROM personas p
  WHERE en_la_empresa AND (es_prueba IS NOT TRUE OR ( SELECT sesion_es_de_prueba() AS sesion_es_de_prueba));
