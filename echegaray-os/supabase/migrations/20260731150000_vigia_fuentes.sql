-- EL VIGÍA: QUE EL FLUJO DE FONDOS SE DÉ CUENTA SOLO DE LAS NOVEDADES QUE LO AFECTAN.
--
-- ═══ POR QUÉ (31/07) ═══
--
-- El dueño: "necesito que todo el sheet flujo de caja sea un documento vivo, que si hay cuestiones
-- nuevas a considerar se dé cuenta por sí solo: nuevos archivos en Drive en las carpetas claves,
-- modificaciones que impactan de AFIP, cambios en CCT de UOCRA, modificaciones en los otros sheet que
-- puede estar vinculado, se agregan comprobantes a carpetas de Drive las tiene que poder traer y
-- actualizar. Necesito más autonomía, sino es un sheet que yo sigo actualizando por mi cuenta."
--
-- El OS ya sabía RECONSTRUIR el Sheet y ya sabía si una fuente estaba ATRASADA (`fuentes_datos` +
-- `recalcular_frescura_fuentes()`). Lo que faltaba es el escalón del medio: DARSE CUENTA DE QUÉ
-- CAMBIÓ. La frescura contesta "esta fuente está vieja"; no contesta "entraron cuatro facturas
-- emitidas que el espejo de ARCA no tiene, y por eso el IVA débito del mes está corto".
--
-- ═══ POR QUÉ DOS TABLAS Y NO UNA COLUMNA MÁS EN fuentes_datos ═══
--
-- `fuentes_datos` es el CATÁLOGO de la empresa: qué fuentes existen, quién las usa, de qué área son.
-- Se cura a mano y su estado es en parte juicio humano ('error', 'conflicto', 'cobertura_parcial').
-- Meterle acá la última señal técnica vista (un modifiedTime, un techo de numeración, un hash) sería
-- mezclar el catálogo con el puntero de lectura de un proceso, y el día que el vigía se equivoque
-- estaría corrompiendo el catálogo del que dependen la web y el Motor de Decisiones.
--
-- Así que se separa:
--   · `vigia_fuentes`    = el PUNTERO. Qué vi la última vez, en cada fuente. Lo escribe sólo el vigía.
--   · `vigia_novedades`  = el HALLAZGO. Qué cambió, con su evidencia, su clasificación y qué propone.
--
-- Y el vínculo con el catálogo se mantiene por `fuente_datos_nombre` (el nombre exacto de la fila de
-- `fuentes_datos`, cuando la fuente ya está catalogada), para no duplicar la definición del dato.
--
-- ═══ LA HUELLA: POR QUÉ UNA NOVEDAD NO SE REPITE ═══
--
-- El vigía corre cada pocas horas. Sin dedupe, la misma factura 220 sin bajar de ARCA se registraría
-- ocho veces por día y la lista sería inservible en una semana — el mismo defecto que hizo que la
-- alerta de frescura se volviera ruido. La `huella` es determinística (fuente + tipo + identidad del
-- hecho, NO la fecha de detección) y única: la segunda vez que se ve el mismo hecho sube
-- `visto_veces` en vez de insertar. `visto_veces` alto es información: "esto lleva ocho rondas sin
-- que nadie lo resuelva".
--
-- ═══ NIVEL E: LO QUE EL VIGÍA NO DECIDE ═══
--
-- `clasificacion` separa lo que el OS puede aplicar solo (determinístico, reversible, sin efecto
-- económico/fiscal/laboral externo — ej. bajar de ARCA un período faltante a su tabla espejo) de lo
-- que requiere al dueño (plata, impuestos, laboral, criterio). El vigía DETECTA y ENRUTA; no ejecuta
-- lo que tiene efecto externo, y no escribe nunca en el Sheet real por su cuenta.
--
-- Y una tercera clasificación que no es una falla escondida: 'ciega'. Si una fuente no se puede leer
-- (falta la credencial de Google, no hay API, el índice de Drive está viejo), eso ES una novedad y se
-- registra con su motivo. Un vigía que no puede ver una fuente y se calla es peor que no tener vigía.

create table if not exists public.vigia_fuentes (
  -- Clave estable declarada en el código (orquestador/lib/vigia-fuentes.mjs). No es un uuid a
  -- propósito: el registro de fuentes vigiladas se lee y se escribe desde una declaración versionada,
  -- y una clave legible hace que un log o una novedad se entiendan sin joins.
  clave                 text        primary key,
  tipo                  text        not null
                        check (tipo in ('drive_carpeta', 'sheet_vinculado', 'arca', 'uocra_cct', 'banco')),
  nombre                text        not null,
  -- QUÉ DECIDE EN EL SHEET. Es la columna que justifica que la fuente esté vigilada: si nadie puede
  -- escribir acá qué pestaña/línea del Flujo depende de esta fuente, la fuente no debería vigilarse.
  que_decide            text        not null,
  -- Cada cuánto DEBERÍA moverse. No es cada cuánto se la mira: es la cadencia esperada del dato, y de
  -- ella sale el silencio sospechoso (una fuente diaria muda cinco días es una novedad).
  cadencia_horas        integer,
  -- El nombre exacto de la fila de public.fuentes_datos, cuando la fuente ya está catalogada ahí.
  -- Sirve para no duplicar la definición del dato y para poder registrar la lectura contra el catálogo.
  fuente_datos_nombre   text,
  -- LA ÚLTIMA SEÑAL VISTA. jsonb porque cada tipo tiene su propia forma de "hasta acá vi":
  --   drive_carpeta   → {corte_modified_time, archivos_vistos}
  --   sheet_vinculado → {modified_time, celdas: {rango: valor}}
  --   arca            → {periodo_maximo, techos: {"1-1": 216}}
  --   uocra_cct       → {vigencia_desde, basicos: {...}}
  --   banco           → {ultima_fecha}
  -- Nace vacío ({}): la PRIMERA corrida no inventa un pasado, declara la línea de base y no grita.
  ultima_senal          jsonb       not null default '{}'::jsonb,
  ultima_revision       timestamptz,
  -- Si la última revisión no pudo ver la fuente, acá queda el motivo (falta credencial, sin API…).
  ultimo_motivo_ciega   text,
  activa                boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.vigia_novedades (
  id                uuid        primary key default gen_random_uuid(),
  fuente_clave      text        not null references public.vigia_fuentes(clave) on delete cascade,
  tipo              text        not null
                    check (tipo in ('archivo_nuevo', 'archivo_modificado', 'sin_correlato',
                                    'sheet_modificado', 'cobertura_atrasada', 'valor_cambiado',
                                    'silencio', 'ciega')),
  -- Determinística: mismo hecho ⇒ misma huella. NO incluye la fecha de detección (si la incluyera,
  -- cada ronda insertaría un duplicado y la lista se volvería ruido en dos días).
  huella            text        not null unique,
  titulo            text        not null,
  -- La evidencia CRUDA del hecho (fileId, nombre, modifiedTime, números, techos, fechas). Sin esto la
  -- novedad es una opinión: con esto cualquiera puede ir a verificarla a la fuente.
  evidencia         jsonb       not null default '{}'::jsonb,
  -- 'aplicable_solo'  = determinístico, reversible, sin efecto externo (Nivel A–D).
  -- 'requiere_dueno'  = plata, impuestos, laboral, criterio, o toca el Sheet real (Nivel E o juicio).
  -- 'ciega'           = no se pudo ver la fuente; el motivo va en el título y la evidencia.
  clasificacion     text        not null check (clasificacion in ('aplicable_solo', 'requiere_dueno', 'ciega')),
  accion_propuesta  text        not null,
  -- A qué cargador YA EXISTENTE va el dato. El vigía detecta y enruta: no reimplementa la carga.
  ruta_carga        text,
  que_decide        text        not null,
  estado            text        not null default 'abierta'
                    check (estado in ('abierta', 'aplicada', 'descartada', 'resuelta')),
  -- Cuántas rondas lleva vista. Alto = lleva tiempo sin que nadie la resuelva (es información).
  visto_veces       integer     not null default 1,
  detectada_en      timestamptz not null default now(),
  vista_en          timestamptz not null default now(),
  resuelta_en       timestamptz,
  nota_cierre       text
);

create index if not exists vigia_novedades_abiertas
  on public.vigia_novedades (fuente_clave, detectada_en desc) where estado = 'abierta';
create index if not exists vigia_novedades_clasif
  on public.vigia_novedades (clasificacion, estado);

alter table public.vigia_fuentes   enable row level security;
alter table public.vigia_novedades enable row level security;

drop policy if exists vigia_fuentes_lectura on public.vigia_fuentes;
create policy vigia_fuentes_lectura on public.vigia_fuentes
  for select using (auth.role() = 'authenticated');
drop policy if exists vigia_fuentes_escritura on public.vigia_fuentes;
create policy vigia_fuentes_escritura on public.vigia_fuentes
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists vigia_novedades_lectura on public.vigia_novedades;
create policy vigia_novedades_lectura on public.vigia_novedades
  for select using (auth.role() = 'authenticated');
drop policy if exists vigia_novedades_escritura on public.vigia_novedades;
create policy vigia_novedades_escritura on public.vigia_novedades
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

comment on table public.vigia_fuentes is
  'Registro de las fuentes que el vigía mira para que el Flujo de Fondos sea un documento vivo. Guarda el PUNTERO de lectura (última señal vista) — deliberadamente separado de public.fuentes_datos, que es el catálogo curado de la empresa y cuyo estado es en parte juicio humano.';
comment on column public.vigia_fuentes.que_decide is
  'Qué pestaña/línea del Flujo depende de esta fuente. Si no se puede escribir, la fuente no debería vigilarse.';
comment on column public.vigia_fuentes.ultima_senal is
  'Hasta dónde vi la última vez. Nace {} a propósito: la primera corrida declara la línea de base y NO grita novedades falsas por todo el histórico.';

comment on table public.vigia_novedades is
  'Novedades detectadas por el vigía, con evidencia, clasificación (aplicable_solo / requiere_dueno / ciega) y a qué cargador existente enrutan. Dedupe por huella determinística: la misma novedad no se repite, sube visto_veces.';
comment on column public.vigia_novedades.clasificacion is
  'aplicable_solo = el OS puede hacerlo (determinístico, reversible, sin efecto externo). requiere_dueno = plata/impuestos/laboral/criterio o toca el Sheet real (Nivel E). ciega = no se pudo ver la fuente, con su motivo — es información, no una falla escondida.';
