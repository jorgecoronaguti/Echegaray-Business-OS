-- EL LEGAJO ESPEJA TODA LA CARPETA DE DRIVE — Y DICE CUANDO UN PAPEL YA NO ESTÁ.
--
-- 08/09/2026, orden del dueño: «no están actualizados los documentos de cada una de las personas
-- del plantel, activas e inactivas; esto es algo automático». Medido antes de esta migración:
-- 963 archivos en las 74 carpetas de Drive contra 933 filas en `documentacion_legajo`. El script
-- corría a mano (última vez 01/09), sólo veía dos niveles y no sabía decir que un archivo desapareció.
--
-- Lo que se agrega es lo que Drive sabe del archivo y el espejo no guardaba. NADA se borra: un papel
-- que ya no está en Drive se MARCA (`ausente_en_drive`), porque un vínculo roto es información y un
-- borrado es una pérdida silenciosa.
alter table public.documentacion_legajo
  add column if not exists subcarpeta        text,
  add column if not exists mime              text,
  add column if not exists bytes             bigint,
  add column if not exists modificado_drive  timestamptz,
  add column if not exists ausente_en_drive  boolean not null default false,
  add column if not exists sincronizado_en   timestamptz;

comment on column public.documentacion_legajo.subcarpeta is
  'Ruta dentro de la carpeta de la persona en Drive («RECIBOS DE SUELDO»); vacío si está en la raíz.';
comment on column public.documentacion_legajo.ausente_en_drive is
  'La última corrida que leyó ENTERA la carpeta de la persona no encontró este archivo. No se borra: se marca.';
comment on column public.documentacion_legajo.sincronizado_en is
  'Última vez que el espejo (legajos-sincronizar.mjs) vio este archivo en Drive.';

-- La corrida queda registrada donde ya se registran las del espejo de clientes: un solo lugar para
-- preguntar «¿cuándo corrió por última vez el espejo y con qué resultado?».
-- `documento_espejo_corrida` ya existe (20260826T2200); el ámbito nuevo es 'legajos'.
