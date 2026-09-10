-- ============================================================================
-- EL JEFE DE OBRA VE LOS ARCHIVOS DE LA CARPETA DE SU OBRA.
--
-- La ficha de la obra pasó a listar lo que hay EN LA CARPETA de Drive —no sólo lo que alguien
-- vinculó a mano en `obra_documento`—. Pero la policy de `drive_index` dice:
--
--     ve_economia() OR drive_file_id IN (select drive_file_ids_vinculados())
--
-- y `drive_file_ids_vinculados()` sólo conoce tres orígenes: el legajo propio, `obra_documento` y
-- `cliente_documento`. Resultado medido: a Dirección y Administración la ficha les muestra los 39
-- papeles de Quattropani; a un jefe de obra le muestra los que alguien haya vinculado —hoy, de 4.232
-- archivos indexados, hay 32 filas en `obra_documento` para 26 obras—. La lista sale recortada y
-- nadie puede distinguir un papel que no existe de uno que no se puede ver.
--
-- Esta migración agrega el CUARTO origen: los descendientes de la carpeta que la obra DECLARA en
-- `obra_canonica.drive_carpeta_id`, para las obras que `ve_obra()` ya deja ver. No abre nada nuevo:
-- quien podía abrir la ficha de la obra ya podía abrir esa carpeta en Drive con su cuenta.
--
-- ═══ EL COSTO, MEDIDO ANTES DE ESCRIBIRLA ═══
--
-- `EXPLAIN ANALYZE` del peor caso (las 11 carpetas declaradas contra los 4.232 archivos, SIN el
-- filtro de rol, o sea como si el que consulta viera todas las obras): **28,8 ms**, 3.717 filas.
-- La subconsulta de una policy se evalúa una vez por consulta (InitPlan), no por fila. Si algún día
-- las carpetas declaradas son cien, esto hay que volver a medirlo.
--
-- ═══ POR QUÉ `LIKE` SOBRE `path` Y CON LOS COMODINES ESCAPADOS ═══
--
-- La descendencia por `parent_id` son N consultas encadenadas —una por nivel—; el índice ya guarda
-- la ruta armada por el mismo recorrido. Y `_` en LIKE es «una letra cualquiera»: sin escapar, una
-- carpeta llamada `SF_PISOS` daría permiso sobre lo que cuelga de `SFXPISOS`. En una policy eso no
-- es una fila de más en una tabla: es un permiso de más. Mismo escape que hace la app.
--
-- ADITIVA Y REVERSIBLE: sólo agrega un `union` a una función existente. Ningún archivo deja de
-- verse. Para revertir, se reemplaza la función por la versión de tres uniones.
-- ============================================================================

create or replace function public.drive_file_ids_vinculados()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select d.drive_file_id
    from public.documentacion_legajo d
   where d.drive_file_id is not null
     and public.mi_persona_id() is not null
     and d.persona_id = public.mi_persona_id()
  union
  select od.drive_file_id
    from public.obra_documento od
   where od.drive_file_id is not null
     and public.ve_obra(od.obra_id)
  union
  select cd.drive_file_id
    from public.cliente_documento cd
   where cd.drive_file_id is not null
     and public.es_administracion()
  union
  -- ── EL CUARTO ORIGEN: LO QUE CUELGA DE LA CARPETA QUE LA OBRA DECLARA ──
  -- La carpeta se toma de `obra_canonica`, que es la tabla que lee la ficha `/obras/[obra]`.
  -- `obras` tiene una columna con el mismo nombre y otro contenido: usar aquélla daría permiso
  -- sobre las carpetas equivocadas.
  --
  -- Una carpeta EN LA PAPELERA no habilita nada. No es una precaución de permisos —el archivo
  -- seguiría siendo el mismo— sino de sentido: si la carpeta está en la papelera, lo que cuelga de
  -- ella ya no es «la carpeta de la obra».
  select d.drive_file_id
    from public.obra_canonica o
    join public.drive_index c
      on c.drive_file_id = o.drive_carpeta_id
     and not coalesce(c.trashed, false)
    join public.drive_index d
      on not d.is_folder
     and d.path like replace(replace(c.path, '\', '\\'), '_', '\_') || '/%'
   where o.drive_carpeta_id is not null
     and public.ve_obra(o.id)
$$;

comment on function public.drive_file_ids_vinculados() is
  'Los archivos de Drive que el usuario actual puede ver sin ver economía: su legajo, los vinculados a sus obras, los del cliente si es administración, y los que cuelgan de la carpeta declarada por una obra que puede ver. La policy de drive_index la usa como IN (...) — se evalúa una vez por consulta.';
