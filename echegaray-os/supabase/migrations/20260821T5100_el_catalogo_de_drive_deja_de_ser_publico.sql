-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL CATÁLOGO DE DRIVE DEJA DE SER PÚBLICO — §26
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `areas.ts` lo dejó escrito el 21/08 y no se corrigió: *«ACÁ LA PUERTA NO TIENE CERRADURA DETRÁS.
-- La policy de `drive_index` es `using (true)` para todo `authenticated`: cualquiera con sesión
-- puede pedirle a PostgREST el catálogo completo de nombres y rutas sin pasar por esta ruta.»*
--
-- Son 3.593 filas y sus tres carpetas raíz, medidas: `administracion` (3.025), `archivo-fiscal`
-- (436) y `libro-sueldos` (132). El nombre de archivo ES el dato: un `libro-sueldos/2026-07 …` o un
-- `archivo-fiscal/DDJJ IVA …` cuenta qué se liquidó y cuándo sin abrir nada.
--
-- ═══ POR QUÉ `ve_economia()` Y NO `es_administracion()` PARA EL «VE TODO» ═══
--
-- `es_administracion()` incluye al jefe de obra. La pantalla que muestra este catálogo —`/documentos`—
-- está en `RUTAS_SOLO_ECONOMIA`, o sea cerrada al jefe de obra, y el motivo escrito ahí es
-- literalmente `libro-sueldos`. Poner `es_administracion()` en la policy dejaría la base MÁS ANCHA
-- QUE LA PANTALLA en el único rol que la pantalla quiso excluir — el defecto simétrico al de
-- «pantalla más ancha que la base», y el que la 3400 acaba de pagar en `subcontrato`. La base y la
-- ruta dicen lo mismo: el catálogo entero es de quien ve economía.
--
-- ═══ QUÉ SIGUE VIENDO EL QUE NO VE ECONOMÍA ═══
--
-- Lo que tiene VÍNCULO propio, y sólo eso. `drive_index` no tiene columna de obra ni de persona: el
-- vínculo vive en otras tablas y se resuelve por `drive_file_id`, que es la clave del índice.
--
--   · su legajo          — `documentacion_legajo` de su `mi_persona_id()` (847 filas, las 847 en el
--                          índice). Es lo que hace que el empleado pueda ver el nombre de SU apto
--                          médico y de ningún otro.
--   · sus obras          — `obra_documento` acotado por `ve_obra()`. Hoy la tabla está VACÍA (0
--                          filas), así que la rama no devuelve nada — está escrita para que el día
--                          que se cargue un documento de obra el jefe lo vea sin otra migración.
--   · los del cliente    — `cliente_documento` (214 filas), acotado por `es_administracion()`, que
--                          es exactamente quién tiene la ficha de cliente. La tabla NO guarda el
--                          nombre del archivo: sin esta rama, la ficha del cliente de un jefe de
--                          obra se queda sin los nombres de sus 214 documentos.
--
-- LO QUE NO SE PUDO SEGMENTAR: **por obra**. Se verificó contra las columnas reales — `drive_index`
-- es (drive_file_id, name, path, mime_type, is_folder, tipo, size_bytes, modified_time, parent_id,
-- depth, indexed_at, nombre_norm, path_norm, tokens, owner_email, hash, actualizado_at) — y `path`
-- sólo tiene tres raíces, ninguna de obra. No hay por dónde inferir la obra de un archivo sin
-- fabricar la relación, así que la única segmentación honesta hoy es por VÍNCULO EXPLÍCITO.
--
-- `service_role` no pasa por acá: `drive_index_srv` es `for all to service_role using (true)` y los
-- ~12 consumidores del orquestador entran por ahí. No se toca.

-- ── 1 · el vínculo se resuelve con permisos de dueño ──────────────────────────────────────────
-- Tiene que ser `security definer`: `documentacion_legajo_select` exige `es_administracion()`, así
-- que un empleado consultándola desde el USING de la policy no encontraría ni sus propias filas y
-- la rama sería un cero silencioso — la peor clase de cierre, el que parece que funciona.
-- Devuelve un conjunto (y no un booleano por fila) para que el planificador lo evalúe UNA vez y no
-- 3.593.
create or replace function public.drive_file_ids_vinculados()
returns setof text
language sql
stable
security definer
set search_path to 'public'
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
$$;

comment on function public.drive_file_ids_vinculados() is
  'Los archivos de Drive que un usuario alcanza POR VÍNCULO: su legajo, los de las obras que ve y '
  'los de clientes si administra. Definer a propósito — documentacion_legajo exige '
  'es_administracion() y desde el USING de una policy la rama daría cero sin decir por qué.';

revoke execute on function public.drive_file_ids_vinculados() from public, anon;
grant execute on function public.drive_file_ids_vinculados() to authenticated, service_role;

-- ── 2 · la policy ─────────────────────────────────────────────────────────────────────────────
drop policy if exists drive_index_read on public.drive_index;
create policy drive_index_read on public.drive_index
  for select to authenticated
  using (
    public.ve_economia()
    or drive_file_id in (select public.drive_file_ids_vinculados())
  );

comment on table public.drive_index is
  'Espejo del Drive (3.593 filas: administracion, archivo-fiscal, libro-sueldos). Desde la 5100 el '
  'catálogo COMPLETO es de ve_economia(); el resto ve sólo lo que tiene vínculo propio. El nombre '
  'del archivo es el dato: no hace falta abrirlo para saber qué dice.';

-- ── 3 · la puerta de atrás: una vista definer sobre la misma tabla ────────────────────────────
-- `v_drive_busqueda_documentos` no declara `security_invoker`, o sea que corre como su dueño y
-- SALTEA la policy de arriba — y `authenticated` tenía SELECT sobre ella. Cerrar la tabla dejando
-- abierta la vista no cierra nada. Su único consumidor es `orquestador/lib/drive-busqueda/
-- metricas.mjs`, que entra por `service_role`.
revoke select on public.v_drive_busqueda_documentos from authenticated;

-- Y TRUNCATE, que no pasa por ninguna policy, venía en el ACL por defecto del proyecto — la misma
-- limpieza que la 2900 §4 hizo con las tablas de personal.
revoke truncate on public.drive_index, public.v_drive_busqueda_documentos from authenticated;
