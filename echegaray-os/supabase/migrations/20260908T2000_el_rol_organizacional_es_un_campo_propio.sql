-- EL ROL ORGANIZACIONAL DEJA DE SER TEXTO LIBRE — PROPUESTA, NO APLICADA.
--
-- ═══ POR QUÉ EXISTE ESTE ARCHIVO ═══
--
-- Orden del dueño (08/09/2026): *«dividir en la pestaña asistencia y plantel a los jefes de obra
-- del resto de los obreros»*. La división YA FUNCIONA sin esta migración: el criterio es
-- `esJefeDeObra(personas.puesto)` —`src/features/administracion/services/vocabularioPersona.ts`—
-- y hoy acierta 2 de 2 contra `perfiles.rol = 'jefe_obra'`.
--
-- Lo que este archivo arregla no es el resultado de hoy, es la FRAGILIDAD de mañana. Medido el
-- 08/09/2026 sobre `personas`:
--
--   · `puesto` tiene UN solo valor no nulo en toda la tabla: 'JEFE DE OBRA', en 2 filas.
--   · Es texto libre, sin CHECK y sin catálogo. 'Jefe obra', 'JEFE DE OBRAS' o 'j. de obra'
--     entrarían sin que nada avise, y ninguna de las tres cae en el criterio: la persona pasaría
--     al grupo de los obreros en silencio.
--   · Y el mismo campo tiene otro uso: `oficioVisible()` lo publica como OFICIO cuando no es una
--     categoría del convenio. Hoy eso hace que NIEVAS diga «JEFE DE OBRA» en la columna de oficio
--     del legajo. Un campo, dos preguntas.
--
-- ═══ QUÉ CAMBIA, Y QUÉ NO ═══
--
-- Es ADITIVA: agrega una columna con default `false`, no toca `puesto`, no borra nada y no cambia
-- ninguna vista. Nada de lo que hoy lee `puesto` deja de funcionar el día que se aplique — lo que
-- habilita es mover el criterio de `esJefeDeObra` a un booleano, en UN solo lugar, con el `puesto`
-- como respaldo hasta que el dato esté cargado.
--
-- ═══ NO SE APLICA SOLA ═══
--
-- Declarar quién dirige una obra tiene efecto laboral y contractual: es la persona que responde por
-- la ejecución. La aplica el dueño, y la carga inicial es una decisión suya, no un UPDATE que
-- infiera de un texto. La sentencia de carga queda escrita abajo, comentada, para que se ejecute
-- deliberadamente y no como efecto colateral de una migración.

alter table public.personas
  add column if not exists es_jefe_de_obra boolean not null default false;

comment on column public.personas.es_jefe_de_obra is
  'ROL ORGANIZACIONAL: dirige una obra. NO es la categoría del convenio (`categoria`, lo que cobra) '
  'ni el oficio (`especialidad`, lo que sabe hacer) ni el rol de una asignación '
  '(`obra_asignacion.rol`, que no distingue jefe de capataz). Lo declara Dirección; hasta que esté '
  'cargado, el criterio del OS lee `puesto` — ver services/vocabularioPersona.ts.';

-- La carga inicial, con los dos únicos casos medidos el 08/09/2026. Se deja COMENTADA a propósito.
--
-- update public.personas set es_jefe_de_obra = true
--  where upper(trim(puesto)) = 'JEFE DE OBRA';
--
-- Verificación esperada después de correrla (dos fuentes independientes que tienen que coincidir):
--
--   select p.nombre_completo, p.es_jefe_de_obra, pf.rol
--     from public.personas p
--     left join public.perfiles pf on pf.persona_id = p.id
--    where p.es_jefe_de_obra or pf.rol = 'jefe_obra';
--
--   → MALDONADO BATISTA EMILIANO MIGUEL · true · jefe_obra
--   → NIEVAS VILLEGAS JUAN PABLO        · true · jefe_obra
--
-- Y para publicarlo a las pantallas hace falta además agregarlo a `persona_directorio` y a
-- `persona_plantel` (esta última hoy NO publica ni `puesto`: por eso la grilla de asistencia lee
-- el puesto de `persona_directorio`). Ese cambio de vistas NO está acá: se escribe cuando el campo
-- exista y esté cargado, no antes.
