-- La ficha lee `persona_legajo`, no la tabla: `authenticated` es un solo rol de Postgres para los
-- cuatro roles de la aplicación, así que el grant por columna le niega `dni` y `cuil` a todo el
-- mundo y esta vista —que corre como su dueño y lleva el portero adentro— es el único camino.
-- Dos columnas nuevas tienen que atravesarla: el número de legajo de la nómina y si la persona
-- sigue en la empresa. `create or replace` sólo puede AGREGAR columnas, y por eso van al final.
create or replace view public.persona_legajo with (security_invoker = false) as
  select id, nombre_completo, dni, cuil, fecha_nacimiento, nacionalidad, telefono, email, domicilio,
         contacto_emergencia, contacto_emergencia_telefono, fecha_ingreso, fecha_egreso,
         convenio_colectivo, categoria, especialidad, puesto, modalidad_liquidacion, art,
         obra_social, drive_folder_id, notas,
         legajo, en_la_empresa
    from public.personas p
   where public.es_administracion();
