-- LA MEMORIA SEMÁNTICA DEL OS. Una tabla, no una por dominio.
--
-- POR QUÉ UNA SOLA TABLA. Los vectores de un proveedor, de un material y de un documento se
-- comparan igual y se buscan igual; separarlos por dominio obligaría a repetir el índice, la
-- migración y la consulta cinco veces, y a decidir en el código a cuál preguntarle. La entidad se
-- distingue por (entidad, entidad_id), que es también lo que impide guardar un vector suelto: sin
-- vínculo con su origen, un vector no se puede explicar ni corregir.
--
-- POR QUÉ EL MODELO Y LA DIMENSIÓN VIVEN EN LA FILA. Un vector sólo se puede comparar con otro del
-- MISMO modelo: mezclarlos devuelve una distancia sin significado, y no da ningún error. Guardarlo
-- al lado del vector es lo que permite cambiar de modelo sin borrar todo y sin comparar peras con
-- manzanas mientras convive la transición.

create extension if not exists vector;

create table if not exists public.ml_embedding (
  id            bigserial primary key,
  entidad       text        not null,          -- 'proveedor' | 'material' | 'documento' | 'obra' | ...
  entidad_id    text        not null,          -- la clave en SU tabla de origen: nunca un vector huérfano
  fragmento     integer     not null default 0,-- un documento largo entra en varios trozos
  texto         text        not null,          -- lo que se embebió, tal cual: sin esto no se puede auditar un match
  modelo        text        not null,
  dimensiones   integer     not null,
  vector        vector(384) not null,
  origen        text,                          -- de qué tabla/pestaña salió
  actualizado   timestamptz not null default now(),
  unique (entidad, entidad_id, fragmento, modelo)
);

comment on table public.ml_embedding is
  'Memoria semántica: un vector por (entidad, entidad_id, fragmento, modelo). El texto original se guarda para poder explicar por qué dos cosas se parecieron.';

-- El índice ANN. `lists` chico porque el corpus del OS es chico (883 filas de conocimiento contra
-- 1.951 archivos): con pocos vectores, demasiadas listas empeoran el recall sin ganar velocidad.
create index if not exists ml_embedding_vector_idx
  on public.ml_embedding using ivfflat (vector vector_cosine_ops) with (lists = 100);

create index if not exists ml_embedding_entidad_idx on public.ml_embedding (entidad, entidad_id);

-- ── LO QUE EL OS DECIDIÓ CON UN MODELO, PARA PODER MEDIRLO DESPUÉS ──
-- No guarda el prompt ni el contenido: guarda QUÉ capacidad, con qué modelo, cuánto tardó y con qué
-- confianza. Es la contraparte de `orq.chat_cost` para lo que NO es Claude.
create table if not exists orq.ml_traza (
  id              bigserial primary key,
  ts              timestamptz not null default now(),
  trace_id        uuid        not null,
  capacidad       text        not null,
  modulo          text,
  metodo          text        not null,
  modelo          text,
  proveedor       text,
  ms              integer,
  confianza       numeric,
  accion          text,
  hubo_fallback   boolean     not null default false,
  costo_usd       numeric,
  sensibilidad    text,
  ok              boolean     not null default true,
  error_kind      text
);

create index if not exists ml_traza_ts_idx on orq.ml_traza (ts desc);
create index if not exists ml_traza_capacidad_idx on orq.ml_traza (capacidad, ts desc);

comment on table orq.ml_traza is
  'Una fila por operación de la capa ML. Contesta "qué modelos usa hoy producción y cuánto cuestan" sin guardar el contenido que se procesó.';
