-- UN VECTOR SIN PROCEDENCIA NO SE PUEDE REEMPLAZAR NI AUDITAR.
--
-- `ml_embedding` guardaba el modelo pero no su REVISIÓN, ni de qué página salió el texto, ni el
-- hash de lo que se embebió. Las tres faltas son la misma falta: el día que se cambie de modelo
-- —que es el día que este proyecto está preparando— no hay forma de saber qué filas quedaron
-- viejas, y una búsqueda que mezcla vectores de dos modelos devuelve cualquier cosa sin fallar.
--
-- La revisión fijada es además requisito de la política de modelos: un modelo sin revisión no puede
-- ir a producción, porque «el mismo modelo» de la semana que viene puede ser otro.

alter table public.ml_embedding
  add column if not exists revision   text,
  add column if not exists pagina     integer,
  add column if not exists hash       text,
  add column if not exists creado_en  timestamptz not null default now();

comment on column public.ml_embedding.revision is
  'El commit del modelo en Hugging Face. Sin esto no se puede saber qué filas quedaron viejas al cambiar de modelo.';
comment on column public.ml_embedding.hash is
  'SHA-1 del texto embebido. Si el fragmento cambia, el vector queda obsoleto y se ve.';

create index if not exists ml_embedding_modelo_idx on public.ml_embedding (modelo, entidad);
