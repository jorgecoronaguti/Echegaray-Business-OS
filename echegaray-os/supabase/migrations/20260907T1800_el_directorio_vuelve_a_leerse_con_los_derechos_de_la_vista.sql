-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL DIRECTORIO VUELVE A LEERSE CON LOS DERECHOS DE LA VISTA — REVIERTE UN DEFECTO PROPIO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Roto por mí hace veinte minutos. La migración 20260907T1600 recreó `persona_directorio` para
-- agregarle el filtro de `es_prueba`, y al reescribir el `create or replace view` copió el
-- `security_invoker = true` del texto ORIGINAL de agosto — sin mirar qué tenía la vista VIVA, que
-- alguna migración posterior había dejado en `false`.
--
-- Efecto inmediato y total: `/administracion/personas` dejó de cargar con
--
--     No pude leer el legajo · permission denied for table personas
--
-- Con `security_invoker = true` la lectura de la vista se hace con los permisos y la RLS del que
-- consulta, y `personas` sólo la lee Administración a nivel de GRANT — que es distinto de la RLS.
-- La vista existe justamente para eso: publicar el plantel SIN PII (ni DNI, ni CUIL, ni teléfono, ni
-- retribución) a quien no puede leer la tabla. Es la misma decisión, ya escrita y explicada, de
-- `persona_plantel`: «`security_invoker = false` es deliberado: la vista tiene que poder leer la
-- tabla». Acá se restituye.
--
-- LA LECCIÓN, PORQUE ES LA PARTE CARA: `create or replace view` no preserva las `reloptions` — las
-- reemplaza por las del texto nuevo. Un `create or replace` copiado de la migración original arrastra
-- la configuración del día que se escribió, no la que la vista tiene hoy. Antes de recrear una vista
-- hay que leer `pg_class.reloptions` de la vista VIVA, no el SQL de origen.

alter view public.persona_directorio set (security_invoker = false);

-- El filtro de `es_prueba` que trajo 20260907T1600 SE MANTIENE: ese cambio era correcto y sigue en
-- pie — lo que se revierte es únicamente cómo se resuelven los permisos al leerla.
