-- ============================================================================
-- EL CATÁLOGO DE DRIVE DEJA DE BORRAR — y empieza a saber del CONTENIDO.
--
-- `public.drive_index` (4.232 filas al 10/09/2026, timer cada 6 h) tenía dos defectos que
-- esta migración habilita a corregir en `orquestador/lib/drive-indice.mjs`:
--
--  (a) BORRABA lo que no veía en una corrida. El piso del 70% protege del caso grosero
--      —quedarse sin token a mitad del recorrido— pero no del caso real: UNA carpeta que
--      devuelve 403 y 200 filas buenas que desaparecen del catálogo para siempre. La
--      disciplina correcta ya existe en el repo desde el 19/08 y es la de
--      `documentacion_legajo`: NUNCA se borra, se MARCA ausente, y sólo de las carpetas que
--      se leyeron enteras. «Un control que no pudo mirar no dice que no está».
--
--  (b) SU `hash` ES DE METADATOS (nombre|ruta|fecha|mime). Alcanza para decidir si hay que
--      reescribir la fila de búsqueda, no para decir «este archivo es este contenido». Sin
--      md5 no hay forma de probar que lo que la app subió a Drive llegó igual (H3/H4 del
--      puente), ni de deduplicar dos copias del mismo papel en dos carpetas.
--
-- Aditiva y reversible: no borra ni renombra nada. Ninguna columna nueva es obligatoria para
-- el código viejo — el indexador anterior sigue funcionando contra esta tabla.
-- ============================================================================

alter table public.drive_index
  -- El md5 que informa Drive. NULL no es un error: los formatos nativos de Google (Docs,
  -- Sheets, Slides) no tienen bytes propios y Drive no devuelve checksum para ellos. Por eso
  -- el índice de abajo es PARCIAL y por eso ningún control puede exigir md5 para todo.
  add column if not exists md5             text,
  -- El enlace que abre el archivo en Drive. Se guarda en vez de armarlo: la URL de un archivo
  -- de una unidad compartida no es la misma que la de My Drive, y armarla a mano manda a
  -- alguien a un 404 que parece un problema de permisos.
  add column if not exists web_view_link   text,
  -- LA PAPELERA SE VE, NO SE ADIVINA. Un archivo en la papelera sigue existiendo, sigue
  -- teniendo su id y Drive lo devuelve al pedirlo por id: si el índice simplemente lo
  -- perdiera de vista, sería indistinguible de un archivo borrado de verdad o de una carpeta
  -- que no se pudo leer. Se indexa con la marca puesta.
  add column if not exists trashed         boolean not null default false,
  -- LA MARCA QUE REEMPLAZA AL DELETE. Mismo nombre y misma semántica que
  -- `documentacion_legajo.ausente_en_drive`: la fila se queda, con todo lo que colgaba de
  -- ella, y dice que en la última corrida confiable no estaba.
  add column if not exists ausente_en_drive boolean not null default false,
  -- Desde cuándo. Se fija UNA vez, cuando se marca, y no se pisa en cada corrida: sin esto
  -- no se puede contestar «¿desde cuándo falta?», que es la pregunta que decide si alguien
  -- lo movió ayer o si se perdió hace tres meses.
  add column if not exists ausente_desde   timestamptz,
  -- QUIÉN PUSO ESTA FILA. Hoy todas vienen del recorrido de Drive; desde H3 la app va a
  -- indexar lo que ella misma sube (`app`), y el worker lo que llega por Gmail o Mattermost.
  -- Sin esta columna, una fila escrita por la app y una descubierta por el timer son
  -- indistinguibles, y la primera corrida del indexador que no la vea la marcaría ausente
  -- sin que nadie pueda decir de dónde había salido.
  add column if not exists origen          text not null default 'drive'
    check (origen in ('drive','app','gmail','mattermost','script'));

-- Parcial a propósito: ver arriba por qué la mitad nativa de Drive no tiene md5. Un índice
-- completo indexaría miles de NULL que nadie consulta.
create index if not exists drive_index_md5_idx on public.drive_index (md5) where md5 is not null;

comment on column public.drive_index.md5 is
  'md5Checksum de Drive. NULL en los formatos nativos de Google (no tienen bytes propios). Es la huella de CONTENIDO: el hash de al lado es de metadatos y sirve para otra cosa.';
comment on column public.drive_index.trashed is
  'El archivo está en la papelera de Drive. Existe, se indexa y NO cuenta como ausente: son dos hechos distintos.';
comment on column public.drive_index.ausente_en_drive is
  'No estaba en la última corrida que pudo listar ENTERA su carpeta padre. El indexador NUNCA borra: marca. Vuelve a false solo cuando el archivo se ve otra vez.';
comment on column public.drive_index.ausente_desde is
  'Cuándo se marcó ausente por primera vez. No se pisa en cada corrida.';
comment on column public.drive_index.origen is
  'Quién puso la fila: drive (el recorrido), app (subida desde app.ecsas.com.ar), gmail, mattermost o script. El indexador no lo pisa al actualizar.';

-- ── Permisos ────────────────────────────────────────────────────────────────
-- El GRANT original (20260716120000) es de TABLA, así que las columnas nuevas ya quedan
-- cubiertas. Se repite igual, explícito e idempotente: una columna nueva nace sin permiso
-- cuando el grant vigente es por columna, y ese modo de falla —policy que permite, GRANT que
-- niega, y la pantalla mostrando cero filas sin error— ya se pagó en este repo.
-- La RLS de `drive_index` NO se toca: lectura para authenticated, todo para service_role.
grant select on public.drive_index to authenticated;
grant select, insert, update, delete on public.drive_index to service_role;
