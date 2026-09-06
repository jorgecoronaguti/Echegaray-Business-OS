-- EL VOLANTE DE APRENDIZAJE: LA CORRECCIÓN DE UNA PERSONA SE GUARDA COMO EJEMPLO.
--
-- ═══ EL AGUJERO QUE CIERRA ═══
--
-- `orq.chat_cost` guarda quién contestó y cuánto costó; `orq.ml_traza` guarda con qué método se
-- resolvió. Ninguna guarda QUÉ se preguntó ni QUÉ se contestó, y está bien: son tablas de costo.
-- El efecto es que cuando una persona corrige una salida de un modelo, la corrección se aplica y
-- se pierde. Sin pares (entrada → corrección) no hay dataset y no hay fine-tune posible: sólo
-- queda cambiar de modelo y esperar.
--
-- ═══ POR QUÉ ES UNA TABLA APARTE Y NO UNA COLUMNA EN chat_cost ═══
--
-- Porque las dos tablas tienen políticas de contenido OPUESTAS. `chat_cost` no puede guardar el
-- prompt: es de costo y la mira cualquiera que audite el gasto. Ésta SÍ tiene que guardarlo —sin
-- la entrada no hay ejemplo— y por eso nace con lectura restringida y con la sensibilidad del dato
-- marcada en cada fila. Mezclarlas habría hecho que la tabla del gasto heredara la sensibilidad de
-- la del aprendizaje.
--
-- ═══ SE GUARDA EL ACIERTO, NO SÓLO EL ERROR ═══
--
-- `acerto` distingue la corrección de la confirmación. Un conjunto compuesto sólo de fallos le
-- enseña al modelo una distribución que no existe y lo empuja a desconfiar de sus aciertos.

create table if not exists orq.llm_ejemplo (
  id            bigserial primary key,
  ts            timestamptz not null default now(),

  tarea         text not null,          -- resolver-identidad · completar-argumentos · rutear · elegir-herramienta
  dominio       text,
  -- La sensibilidad se CONGELA al guardar. Si se dedujera al exportar, un cambio de política
  -- reclasificaría hacia atrás filas que ya se habían compartido con ese criterio.
  sensibilidad  text not null,

  entrada       text not null,          -- lo que se le dio al modelo
  contexto      text,                   -- lo que además había delante (json serializado)
  propuesto     text,                   -- lo que el OS contestó; null = no contestó nada
  esperado      text not null,          -- lo que la persona dijo que era

  -- null cuando el OS no propuso nada: una abstención etiquetada no es ni acierto ni error.
  acerto        boolean,

  metodo        text,
  modelo        text,
  confianza     numeric,

  -- SIN AUTOR NO ES UNA CORRECCIÓN HUMANA. Un ejemplo sin persona detrás sería el OS entrenándose
  -- con su propia salida, que es la forma más silenciosa de fabricar un dataset.
  corregido_por text not null,

  constraint llm_ejemplo_autor_ck check (length(btrim(corregido_por)) > 0),
  constraint llm_ejemplo_entrada_ck check (length(btrim(entrada)) > 0)
);

comment on table orq.llm_ejemplo is
  'Pares (entrada → corrección humana) de las decisiones que toman los modelos del OS. Es el único dato de entrenamiento que no se puede fabricar: una persona mirando la salida y diciendo cuál era la correcta. Guarda también las confirmaciones (acerto = true): un conjunto de puros fallos entrena una distribución falsa.';
comment on column orq.llm_ejemplo.sensibilidad is
  'La clasificación de lib/ml/politica.mjs congelada al momento de guardar. Ninguna exportación puede salir sin pasar por esPublicable(): esta tabla SÍ guarda contenido.';
comment on column orq.llm_ejemplo.acerto is
  'true = la persona confirmó lo que el OS propuso · false = lo corrigió · null = el OS no propuso nada.';

create index if not exists llm_ejemplo_tarea_ix on orq.llm_ejemplo (tarea, ts desc);
create index if not exists llm_ejemplo_semana_ix on orq.llm_ejemplo (date_trunc('week', ts));

-- ── RLS + GRANTS. LAS DOS: UNA POLICY SIN GRANT DEVUELVE «PERMISSION DENIED» ─────────────────
--
-- Y acá el default es MÁS cerrado que en el resto del OS a propósito: esta tabla guarda el
-- contenido de lo que se le preguntó al modelo. No se le da lectura a `authenticated` —ningún
-- usuario de la app necesita leer el dataset de entrenamiento— y sí a `service_role`, que es el
-- que corre los scripts del OS. Un dataset legible por toda la app es una fuga esperando.

alter table orq.llm_ejemplo enable row level security;

do $$ begin
  create policy llm_ejemplo_servicio on orq.llm_ejemplo
    for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

grant select, insert on orq.llm_ejemplo to service_role;
grant usage on sequence orq.llm_ejemplo_id_seq to service_role;
