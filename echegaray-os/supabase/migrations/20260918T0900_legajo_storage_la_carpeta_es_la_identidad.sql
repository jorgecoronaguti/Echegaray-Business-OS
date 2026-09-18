-- ============================================================================
-- EL BUCKET DEL LEGAJO SE ABRE POR CARPETA DE IDENTIDAD, NUNCA POR UN REGISTRO APARTE.
--
-- ═══ EL ROJO QUE ESTO CORRIGE (rls-perfil-empleado.test.mjs, «el bucket … es PRIVADO y por
-- carpeta de persona», 18/09/2026) ═══
--
-- La regla del test, fijada el 10/09: TODA policy de `documentos-legajo` ata la primera carpeta del
-- objeto a una identidad de la sesión —`mi_persona_id()` (subo/leo lo mío) o `auth.uid()` con
-- `es_administracion()` (Administración carga lo de otro en SU carpeta)—. Storage no tiene columnas
-- que mirar: la ruta ES el dato, y la cerradura tiene que poder leerse en la ruta.
--
-- `20260916T0100` agregó `documentos_legajo_lee_lo_que_le_subieron` sin correr este test: abre un
-- objeto si EXISTE una fila de `entidad_documento` que lo nombre a favor de `mi_persona_id()`. La
-- carpeta no se mira. Hoy no fuga —la fila sólo la escribe Administración y sólo bajo su propio uid—
-- pero son DOS cerraduras acopladas: el día que `entidad_documento_insert` se afloje (por ejemplo,
-- para que el empleado registre lo que sube), cualquier persona registra un `storage_path` ajeno a
-- su nombre y Storage se lo firma. Una policy de Storage que depende de la policy de otra tabla no
-- es una policy: es una promesa.
--
-- ═══ QUÉ DEJA DE PODER HACERSE, Y POR QUÉ NO ROMPE NADA HOY ═══
--
-- Medido en `src/` el 18/09: ninguna pantalla del empleado lee `entidad_documento` de persona ni
-- firma URLs de ese bucket con su sesión. El empleado sube a `<mi_persona_id>/…` (`empleado/
-- services/acciones.ts`) y lee su documentación por `mi_documento_legajo` (documentacion_legajo +
-- documento_presentacion). La ficha de Administración firma con `documentos_legajo_lee_lo_suyo`
-- (`es_administracion()`). Y el bucket real tiene 3 objetos, todos bajo el uid de Administración,
-- de dos personas SIN cuenta en el OS: no hay hoy un lector al que esta policy le sirva.
--
-- Cuando el empleado tenga la pantalla de «lo que Administración subió de mí», la forma correcta
-- es la del portal (`portal/(dentro)/documentos/[papelId]/route.ts`): el servidor lee
-- `entidad_documento` con la sesión del usuario —esa RLS ya lo acota a `entidad_id =
-- mi_persona_id()`— y firma con el cliente admin. La autorización queda en UNA cerradura, la de la
-- tabla, y Storage no necesita conocerla.
-- ============================================================================

set local lock_timeout = '3s';
set local statement_timeout = '20s';

drop policy if exists documentos_legajo_lee_lo_que_le_subieron on storage.objects;

-- Lo que queda vivo sobre el bucket (no se toca, se deja dicho):
--   documentos_legajo_lee_lo_suyo          SELECT  es_administracion() o carpeta[1] = mi_persona_id()
--   documentos_legajo_sube_lo_suyo         INSERT  carpeta[1] = mi_persona_id()
--   documentos_legajo_sube_administracion  INSERT  es_administracion() y carpeta[1] = auth.uid()
