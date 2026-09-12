-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UNA CUENTA DE PRUEBA VE A LAS PERSONAS DE PRUEBA · UNA CUENTA REAL NO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL PROBLEMA QUE ESTO DESTRABA ═══
--
-- Desde el 07/09/2026 las vistas del personal esconden lo que existe para probar (`es_prueba`), y
-- eso está bien: «[PRUEBA E2E] QA Campo» llegó a contarse como una persona más en un número de
-- exposición al convenio UOCRA. El efecto colateral es que la suite se quedó sin la evidencia más
-- importante del módulo: nadie puede probar por navegador que escribir una celda de horas escribe de
-- verdad en `registros_hh`, porque la única persona sobre la que un test PUEDE escribir sin ensuciar
-- una liquidación real no aparece en la pantalla donde se escribe.
--
-- La salida no es aflojar el filtro ni crear una persona real de mentira. Es que la regla mire
-- TAMBIÉN quién pregunta:
--
--     una fila se publica  ⇔  no es de prueba  ∨  quien pregunta es una cuenta de prueba
--
-- `perfiles.es_prueba` existe desde `20260822T6400` y ya está en true para las tres identidades de
-- `tests/util/identidades.ts` (verificado el 12/09/2026 contra la base: «Usuario de prueba E2E»
-- ·direccion·, «QA Jefe» ·jefe_obra· y «QA Campo» ·campo·). Ninguna cuenta de una persona real lo
-- tiene, y NADIE puede ponérselo desde la web: el `grant update (es_prueba)` es sólo del service
-- role. O sea: esto no abre una puerta nueva, usa una marca que ya estaba y que ya era de confianza.
--
-- ═══ POR QUÉ UNA FUNCIÓN Y NO EL MISMO SUBSELECT TRES VECES ═══
--
-- Porque son TRES vistas y el 11/09 ya se pagó el precio de tener el criterio escrito en dos:
-- `persona_directorio` filtraba y `persona_legajo` no, y por esa grieta la cuenta de Playwright
-- apareció en Convenios y en Recibos. Con la regla en un solo lugar, cambiarla es cambiarla en todas.
--
-- Va como `(select public.sesion_es_de_prueba())` —subconsulta, no llamada suelta— para que el
-- planificador la evalúe UNA vez por consulta (InitPlan) y no una por fila: es la misma razón por la
-- que los porteros de las RLS de este repo se escriben así.
--
-- ═══ LAS TRES VISTAS, Y POR QUÉ ESTAS TRES ═══
--
--   `persona_directorio`  Plantel, Asistencia, la grilla de Horas y la solapa Quincena. Es la que
--                         alimenta la pantalla donde se escriben las horas.
--   `persona_legajo`      Convenios y Recibos, y el CUIL de las dos anteriores. Su filtro lo trajo
--                         `20260911T1910`; acá se copia ENTERA con la condición nueva, así que el
--                         resultado es el mismo esté 1910 aplicada o no.
--   `persona_plantel`     Los selectores de personal de Obras. NO FILTRABA NADA: hoy publica
--                         «[PRUEBA E2E] QA Campo» a cualquier cuenta real que vaya a asignar gente a
--                         una obra. Es el agujero del 11/09 en otra vista más, y se cierra acá.
--
-- ═══ LO QUE ESTO NO HACE ═══
--
-- No da de baja a nadie, no borra una fila, no toca `en_la_empresa` ni el `es_prueba` de nadie.
-- Ninguna columna cambia de nombre, de tipo ni de orden: las tres vistas conservan su lista exacta
-- (por eso `create or replace view` las acepta) y sus GRANT.
--
-- ═══ ANTES DE APLICARLA · Y DESPUÉS ═══
--
-- ANTES — que ninguna persona REAL esté marcada como prueba. Si aparece una, esta migración NO se
-- aplica: esconder a alguien de la liquidación es peor que mostrar una cuenta de Playwright, porque
-- nadie nota a quien falta.
--
--   select id, nombre_completo, email, es_prueba from public.personas where es_prueba is true;
--
-- DESPUÉS — la evidencia del efecto, con las dos caras de la misma pregunta:
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid de una cuenta REAL>","role":"authenticated"}';
--   select count(*) from public.persona_directorio;   -- las reales, sin las de prueba
--   set local request.jwt.claims = '{"sub":"ede1fa51-517b-4f27-b6d9-09ce8a704aca","role":"authenticated"}';
--   select count(*) from public.persona_directorio;   -- una más
--   select count(*) from public.persona_directorio where nombre_completo ilike '%E2E%';  -- 1

-- ── 1 · LA REGLA, UNA VEZ ───────────────────────────────────────────────────────────────────────
--
-- `security definer` por lo mismo que `current_rol()`: tiene que poder leer `perfiles` sin depender
-- de que la policy de `perfiles` deje ver la fila propia en cada contexto. `stable` porque dentro de
-- una consulta la respuesta no cambia. Sin sesión (service role, cron, un JWT sin `sub`) devuelve
-- FALSE: falla cerrado, que del lado de esconder es el lado seguro.
create or replace function public.sesion_es_de_prueba()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select p.es_prueba from public.perfiles p where p.id = auth.uid()), false)
$$;

comment on function public.sesion_es_de_prueba() is
  'Si quien pregunta es una identidad que existe para probar el sistema (perfiles.es_prueba). Es el '
  'permiso para VER lo que está marcado como prueba: lo usan persona_directorio, persona_legajo y '
  'persona_plantel. Sin sesión devuelve false.';

revoke execute on function public.sesion_es_de_prueba() from public;
revoke execute on function public.sesion_es_de_prueba() from anon;
grant execute on function public.sesion_es_de_prueba() to authenticated, service_role;

-- ── 2 · EL DIRECTORIO ───────────────────────────────────────────────────────────────────────────
--
-- Copia exacta de `20260908T1500` —mismas columnas, mismo `security_invoker`, mismos join— con el
-- `where` final cambiado. Se copia entera y no se parchea: una vista no se altera por partes, y un
-- `create or replace` incompleto RETROCEDE lo que trajo la anterior (así se perdió `legajo` una vez).
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
  -- `is not true` y no `= false`: un NULL es una fila que nadie declaró como prueba, o sea una
  -- persona real, y tiene que seguir viéndose.
  WHERE p.es_prueba IS NOT TRUE OR (select public.sesion_es_de_prueba());

comment on view public.persona_directorio is
  'El plantel para las pantallas de Personal y Liquidación. NO publica las identidades de prueba, '
  'SALVO a una cuenta de prueba (sesion_es_de_prueba()): los E2E escriben sobre ellas y necesitan '
  'verlas en la pantalla donde se escribe.';

-- ── 3 · EL LEGAJO ───────────────────────────────────────────────────────────────────────────────
--
-- Copia exacta de `20260911T1910`. `security_invoker = false` y el `where public.es_administracion()`
-- se conservan TAL CUAL: esta vista es el único camino de la web a `dni`/`cuil` y cambiarle el
-- alcance acá sería colar otra decisión adentro de ésta.
create or replace view public.persona_legajo with (security_invoker = false) as
  select id, nombre_completo, dni, cuil, fecha_nacimiento, nacionalidad, telefono, email, domicilio,
         contacto_emergencia, contacto_emergencia_telefono, fecha_ingreso, fecha_egreso,
         convenio_colectivo, categoria, especialidad, puesto, modalidad_liquidacion, art,
         obra_social, drive_folder_id, notas,
         legajo, en_la_empresa
    from public.personas p
   where public.es_administracion()
     and (p.es_prueba is not true or (select public.sesion_es_de_prueba()));

comment on view public.persona_legajo is
  'EL legajo, para la ficha de Administración. Único camino a dni/cuil desde la web: el grant por '
  'columna se los niega a authenticated. NO publica retribucion_pactada. NO publica las identidades '
  'de prueba, salvo a una cuenta de prueba (sesion_es_de_prueba()), igual que persona_directorio.';

grant select on public.persona_legajo to authenticated;

-- ── 4 · EL PLANTEL DE LOS SELECTORES DE OBRA ────────────────────────────────────────────────────
--
-- Copia exacta de `20260819T3100` MÁS la condición, que nunca tuvo. Cinco columnas y ni una más: el
-- contrato de esta vista es ser la puerta angosta al nombre de una persona desde Obras.
create or replace view public.persona_plantel with (security_invoker = false) as
  select id, nombre_completo, categoria, especialidad, fecha_egreso
    from public.personas p
   where p.en_la_empresa
     and (p.es_prueba is not true or (select public.sesion_es_de_prueba()));

comment on view public.persona_plantel is
  'Quién está disponible para asignar a una obra. Publica sólo a quien sigue en la empresa y, desde '
  'el 12/09/2026, tampoco a las identidades de prueba —salvo a una cuenta de prueba '
  '(sesion_es_de_prueba())—: hasta hoy era la única vista de personal que no las filtraba.';

grant select on public.persona_plantel to authenticated;
