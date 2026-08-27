-- LO QUE EL OS SABE AHORA LLEVA ESCRITA SU NATURALEZA, Y LO APRENDIDO SU EVIDENCIA.
--
-- ═══ EL DEFECTO QUE ESTO CORRIGE (27/08/2026) ═══
--
-- `conocimiento_empresa` guardaba 62 afirmaciones sin decir de dónde salía cada una. Cincuenta las
-- había escrito `vigilancia-autonoma.mjs`: son la SALIDA DEL DIRECTOR, o sea del modelo. Doce las
-- enseñó el dueño. Las dos cosas se leían igual, así que una hipótesis de un modelo pesaba lo mismo
-- que un hecho declarado por el dueño — y cualquiera que consultara la tabla no tenía forma de
-- distinguirlas. La regla del OS es de una línea: **salida de un modelo no es un hecho**.
--
-- No se borra nada: una hipótesis del Director puede ser buena y perderla sería tirar trabajo. Se
-- CLASIFICA, que es lo que faltaba.
--
-- ═══ Y EL RENDIMIENTO APRENDIDO NECESITA MÁS QUE UN NÚMERO ═══
--
-- `rendimiento_historico` tenía diez filas, todas de un script de siembra desde un xlsm. Para poder
-- recibir rendimiento observado en obra hacen falta cuatro cosas que no estaban: de dónde salió
-- (`evidencia`), cuánto vale (`confianza`), en qué punto del camino está (`estado`) y contra qué se
-- lo compara (`hs_unitarias_plan`). Sin `estado`, una observación aislada pisaría la referencia
-- maestra — que es exactamente lo que no puede pasar.

-- ── 1. LA NATURALEZA DE CADA AFIRMACIÓN ──────────────────────────────────────────────────────

alter table public.conocimiento_empresa
  add column if not exists tipo      text,
  add column if not exists evidencia jsonb,
  add column if not exists fuente    text;

-- La clasificación de lo que ya estaba, deducida de un hecho verificable y no de una lectura del
-- texto: `origen_task_id` no nulo significa que la escribió un trabajo del Work Fabric, y hoy el
-- único que escribe conocimiento desde un trabajo es el Director. Eso es INFERENCIA. Lo que no
-- viene de un trabajo lo enseñó el dueño en el chat: eso es HECHO, porque él es la fuente.
update public.conocimiento_empresa
   set tipo   = case when origen_task_id is not null then 'INFERENCIA' else 'HECHO' end,
       fuente = case when origen_task_id is not null then 'director:vigilancia-autonoma' else 'dueño' end
 where tipo is null;

-- ═══ Y EL CONTADOR DE CONFIRMACIONES VUELVE A DECIR LA VERDAD ═══
--
-- 46 de las 50 inferencias figuraban «confirmadas 2 o más veces». No las confirmó nadie: la
-- vigilancia corre a diario, el Director repetía la misma conclusión y el `on conflict` le sumaba
-- uno cada vez. Un modelo repitiéndose no es evidencia, y ese contador es justo el que el OS usa
-- para ordenar qué sabe mejor. Se vuelve a 1: un caso, el suyo.
update public.conocimiento_empresa
   set veces_confirmado = 1
 where origen_task_id is not null and veces_confirmado > 1;

alter table public.conocimiento_empresa alter column tipo set default 'CANDIDATO';
alter table public.conocimiento_empresa alter column tipo set not null;

do $$ begin
  alter table public.conocimiento_empresa add constraint conocimiento_empresa_tipo_ck
    check (tipo in ('HECHO', 'INFERENCIA', 'CANDIDATO', 'VALIDADO', 'DESCARTADO'));
exception when duplicate_object then null; end $$;

create index if not exists conocimiento_empresa_tipo_ix
  on public.conocimiento_empresa (tipo) where vigente is not false;

comment on column public.conocimiento_empresa.tipo is
  'HECHO (observado o declarado por el dueño) · INFERENCIA (lo dedujo un modelo) · CANDIDATO (aprendizaje con un solo caso) · VALIDADO (confirmado por un segundo caso comparable) · DESCARTADO. Un modelo NUNCA escribe HECHO ni VALIDADO.';
comment on column public.conocimiento_empresa.evidencia is
  'De dónde salió: tabla, filas, obra, actividad, números. Una afirmación sin evidencia no se puede verificar y por eso no puede ser HECHO.';

-- ── 2. EL RENDIMIENTO APRENDIDO ──────────────────────────────────────────────────────────────

alter table public.rendimiento_historico
  add column if not exists estado                  text,
  add column if not exists confianza               text,
  add column if not exists veces_confirmado        integer not null default 1,
  add column if not exists dotacion                numeric,
  add column if not exists dias                    numeric,
  add column if not exists evidencia               jsonb,
  add column if not exists hs_unitarias_plan       numeric,
  add column if not exists desvio_hs_unitarias_pct numeric,
  add column if not exists avance_pct              numeric,
  add column if not exists clave                   text,
  add column if not exists actualizado_en          timestamptz;

-- LAS DIEZ SEMILLAS SE CONSERVAN COMO REFERENCIA BASE. No son observaciones de una obra nuestra:
-- son la tabla de rendimientos del xlsm con la que se venía cotizando. Siguen valiendo como piso, y
-- por eso llevan un estado propio que ningún aprendizaje puede pisar.
-- Y no todas son semilla: la fila que YA tiene `actividad_id` es la observación de una actividad
-- concreta de una obra nuestra, no una tabla de referencia. Marcarla REFERENCIA la habría vuelto
-- intocable por el aprendizaje justo a ella, que es la única que sí tiene que aprender.
update public.rendimiento_historico
   set estado    = case when actividad_id is null then 'REFERENCIA' else 'CANDIDATO' end,
       confianza = coalesce(confianza, 'media')
 where estado is null;

alter table public.rendimiento_historico alter column estado set default 'CANDIDATO';
alter table public.rendimiento_historico alter column estado set not null;

do $$ begin
  alter table public.rendimiento_historico add constraint rendimiento_historico_estado_ck
    check (estado in ('REFERENCIA', 'CANDIDATO', 'VALIDADO', 'DESCARTADO'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.rendimiento_historico add constraint rendimiento_historico_confianza_ck
    check (confianza is null or confianza in ('alta', 'media', 'baja'));
exception when duplicate_object then null; end $$;

-- IDEMPOTENCIA: el ciclo corre varias veces por día sobre las mismas actividades. Sin esta clave,
-- cada corrida agregaría una observación nueva de un hecho que no cambió, y el conteo de casos
-- —que es lo que decide si algo se valida— quedaría inflado por el reloj.
create unique index if not exists rendimiento_historico_clave_uk
  on public.rendimiento_historico (clave) where clave is not null;

comment on column public.rendimiento_historico.estado is
  'REFERENCIA (la semilla del xlsm: piso de cotización, intocable por el aprendizaje) · CANDIDATO (un solo caso real) · VALIDADO (dos o más casos comparables y consistentes) · DESCARTADO.';
comment on column public.rendimiento_historico.clave is
  'Identidad del hecho observado, no de la corrida: misma actividad y mismo corte ⇒ misma fila.';

