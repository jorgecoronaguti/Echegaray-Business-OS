-- LO QUE UN DOCUMENTO DICE, NO SÓLO CÓMO SE LLAMA.
--
-- El Drive tiene 3.042 PDF indexados y el OS sólo sabe sus nombres: `drive_index` guarda ruta,
-- tamaño y fecha. «Pasame el certificado de YUMO» funciona; «¿cuánto se certificó en YUMO?» no,
-- porque el número está adentro del papel y nadie lo abrió nunca.
--
-- Medido el 04/09/2026 sobre 42 documentos reales tomados de las 14 carpetas del Drive: el 100% de
-- los PDF de negocio traen su capa de texto. No hacen falta modelos de OCR — el texto está escrito
-- y sólo había que leerlo.
--
-- ═══ POR QUÉ EL DOCUMENTO Y SUS FRAGMENTOS SON DOS TABLAS ═══
--
-- El documento es la unidad de VERDAD (qué es, de quién, de cuándo, cuánto). El fragmento es la
-- unidad de BÚSQUEDA: una página de libro de sueldos tiene 10.000 caracteres y buscar sobre eso
-- devuelve el documento entero como respuesta a cualquier pregunta. Se busca por fragmento y se
-- responde con su documento, citando página.

create table if not exists public.documento_leido (
  drive_file_id   text        primary key,
  hash            text        not null,          -- del CONTENIDO: el mismo papel subido dos veces es uno
  nombre          text        not null,
  path            text,
  formato         text        not null,          -- el REAL, por firma de bytes; no el mime que declaró Drive
  tipo            text,                          -- recibo_sueldo | f931 | factura | ... ; null = no reconocido
  tipo_confianza  numeric,
  tipo_metodo     text,                          -- 'regla' hoy; el día que haya modelo, se distingue
  tipo_por_que    text,
  sensibilidad    text        not null default 'confidencial',  -- gobierna a dónde puede viajar
  paginas         integer,
  paginas_con_texto integer,
  necesita_ocr    boolean     not null default false,
  caracteres      integer,
  tablas          integer,
  campos          jsonb,                         -- cuit, fecha, total, comprobante, periodo...
  evidencia       jsonb,                         -- por campo: página y el texto donde se leyó
  entidad_id      text,                          -- el proveedor canónico, vía la capa de identidad
  entidad_estado  text,                          -- auto_resuelto | sugerido | sin_match...
  ms              integer,
  leido_en        timestamptz not null default now(),
  error           text                           -- si no se pudo: se declara, no se calla
);

comment on table public.documento_leido is
  'Un renglón por documento del Drive que el OS abrió. Guarda qué es, qué dice y de dónde salió cada dato.';

create index if not exists documento_leido_tipo_idx on public.documento_leido (tipo, leido_en desc);
create index if not exists documento_leido_hash_idx on public.documento_leido (hash);
create index if not exists documento_leido_entidad_idx on public.documento_leido (entidad_id) where entidad_id is not null;

-- ── EL FRAGMENTO: LA UNIDAD QUE SE BUSCA Y SE CITA ──
create table if not exists public.documento_fragmento (
  id              bigserial   primary key,
  drive_file_id   text        not null references public.documento_leido(drive_file_id) on delete cascade,
  pagina          integer     not null,
  orden           integer     not null,
  texto           text        not null,
  -- El rectángulo del fragmento en su página. Es lo que permite señalar DÓNDE, no sólo en qué hoja.
  bbox            numeric[],
  caracteres      integer     not null,
  unique (drive_file_id, pagina, orden)
);

comment on table public.documento_fragmento is
  'Los pedazos buscables de un documento. Se busca acá y se responde con el documento, citando página.';

create index if not exists documento_fragmento_doc_idx on public.documento_fragmento (drive_file_id, pagina);
-- Búsqueda por palabras en español, sin modelo y sin costo. Es el piso: el semántico se suma encima.
create index if not exists documento_fragmento_texto_idx
  on public.documento_fragmento using gin (to_tsvector('spanish', texto));
