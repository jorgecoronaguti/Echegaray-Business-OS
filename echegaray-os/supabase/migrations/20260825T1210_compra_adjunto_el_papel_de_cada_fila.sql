-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL PAPEL DE CADA FILA DE COMPRAS — los comprobantes que ya se mandaron por chat, guardados
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pedido del dueño, 25/08/2026, textual: «debés analizar en canal carga de comprobantes del chat
-- cuáles fueron las fotos o comprobantes que han sido enviados históricamente para que la sección
-- Compras de app.ecsas quede actualizada con todo, incluida foto o lo que sea que se haya enviado
-- del comprobante».
--
-- ═══ QUÉ PROBLEMA RESUELVE ═══
--
-- Hoy el respaldo de un gasto vive en el canal de Mattermost, mezclado con la conversación, y se
-- busca a mano scrolleando. Si el canal se purga —y los canales se purgan— el gasto queda sin papel.
-- Al 25/08 son 110 archivos y 429 MB en el canal «Comprobantes-gastos», de los que sólo 53 dejaron
-- rastro en el registro de idempotencia: el resto existe únicamente como mensaje.
--
-- Esta tabla NO es la verdad del gasto (ésa es la fila de la pestaña Compras) ni el comprobante
-- fiscal (ése es ARCA). Es DÓNDE ESTÁ EL ARCHIVO y CON QUÉ CONFIANZA se sabe de qué fila es.
--
-- ═══ POR QUÉ SE ATA A LA CLAVE Y NO AL RENGLÓN ═══
--
-- El renglón de Compras se mueve: el «ID» de la pestaña es `=ROW()-4`, así que insertar una fila
-- arriba recorre todas las de abajo y un adjunto atado al renglón 810 pasaría a mostrarse en la
-- factura de otro proveedor sin que nada avise. `compra_clave` es `c:<cuit>|<número>` — la MISMA que
-- escribe `comunicacion.comprobantes_cargados`— y esa no se mueve. `fila_compras` se guarda como
-- pista de la última posición conocida, nunca como vínculo.
--
-- ═══ POR QUÉ `vinculado_por` ES UNA COLUMNA Y NO UN BOOLEANO ═══
--
-- «Este archivo es de esta compra» se puede saber de tres maneras que NO valen lo mismo, y la
-- pantalla tiene que poder decir cuál:
--   · `registro`     — el bot lo cargó él mismo y dejó el fileId junto a la clave. Es un HECHO.
--   · `match_numero` — se leyó el papel y coincidió número + CUIT/proveedor + importe. Es un CÁLCULO
--                      con `confianza`, y puede estar mal.
--   · `match_manual` — lo asignó una persona de Administración. Le gana a los dos anteriores.
--   · `sin_vincular` — no se pudo. Se lista para que alguien lo asigne. NO se adivina.
-- Un booleano «vinculado» pondría los cuatro en la misma bolsa y la pantalla presentaría una
-- inferencia con la misma cara que un hecho.

create table if not exists public.compra_adjunto (
  id                uuid primary key default gen_random_uuid(),

  -- La compra a la que pertenece. NULL = todavía nadie sabe de cuál es, y eso se muestra.
  compra_clave      text,
  -- Última posición conocida en la pestaña. Pista para abrir el renglón, NUNCA el vínculo.
  fila_compras      integer,

  -- LA RUTA ES LA IDENTIDAD DEL OBJETO EN EL BUCKET Y ES ÚNICA: dos filas apuntando al mismo archivo
  -- serían el mismo papel mostrado dos veces bajo la misma compra.
  storage_path      text not null unique,
  nombre            text not null,
  media_type        text not null,
  bytes             bigint not null check (bytes > 0),

  -- De qué puerta entró el archivo.
  origen            text not null check (origen in ('mattermost', 'web')),
  origen_post_id    text,
  -- EL `file_id` DE MATTERMOST ES LA IDEMPOTENCIA DEL BACKFILL: es lo que permite volver a correrlo
  -- sin re-bajar ni re-subir los 429 MB. Único PARCIAL —sólo donde no es nulo— porque un índice
  -- único sobre columnas que aceptan NULL no restringe nada, y en este repo ya convivió con 206
  -- NULLs sin quejarse.
  origen_file_id    text,

  subido_at         timestamptz not null default now(),

  vinculado_por     text not null default 'sin_vincular'
                    check (vinculado_por in ('registro', 'match_numero', 'match_manual', 'sin_vincular')),
  -- Sólo tiene sentido para `match_numero`. 0..1.
  confianza         numeric check (confianza is null or (confianza >= 0 and confianza <= 1)),
  vinculado_at      timestamptz,
  -- Quién lo asignó a mano. Sin `on delete cascade`: borrar una cuenta no puede borrar el rastro.
  vinculado_por_usuario uuid references auth.users(id),

  -- Lo que la lectura entendió del papel (cuit, número, fecha, importe) cuando hubo que leerlo. Es
  -- jsonb porque su forma la define el circuito de visión, no esta tabla. Sirve para auditar un
  -- match dudoso sin volver a gastar el modelo.
  lectura           jsonb,

  creado_at         timestamptz not null default now()
);

create unique index if not exists compra_adjunto_file_id_uidx
  on public.compra_adjunto (origen_file_id) where origen_file_id is not null;
create index if not exists compra_adjunto_clave_idx
  on public.compra_adjunto (compra_clave) where compra_clave is not null;
-- La sub-vista «Comprobantes sin vincular» pide exactamente esto.
create index if not exists compra_adjunto_sueltos_idx
  on public.compra_adjunto (subido_at desc) where compra_clave is null;

comment on table public.compra_adjunto is
  'Dónde está el archivo del comprobante de cada fila de Compras, y con qué confianza se sabe de cuál es. No es la verdad del gasto (la pestaña Compras) ni el comprobante fiscal (ARCA).';
comment on column public.compra_adjunto.compra_clave is
  'c:<cuit>|<numero> — la misma clave de comunicacion.comprobantes_cargados y de public.compra_sheet.clave. NULL = sin vincular.';
comment on column public.compra_adjunto.vinculado_por is
  'registro = HECHO (el bot lo cargó y dejó el fileId) · match_numero = CÁLCULO con confianza · match_manual = lo dijo una persona y le gana a los dos · sin_vincular = no se pudo y se muestra.';

-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────────
alter table public.compra_adjunto enable row level security;

drop policy if exists compra_adjunto_select on public.compra_adjunto;
create policy compra_adjunto_select on public.compra_adjunto
  for select to authenticated using ((select public.es_administracion()));

-- EL ÚNICO CAMBIO QUE PUEDE HACER UNA PERSONA ES VINCULAR, y queda marcado como suyo. El `with
-- check` obliga a que toda escritura desde la web se declare `match_manual` y a nombre propio: sin
-- eso, alguien podría reescribir un vínculo dejándolo con cara de `registro`, o sea presentar su
-- decisión como si la hubiera hecho el bot.
--
-- El `using` NO restringe por `vinculado_por` a propósito: una persona tiene que poder corregir un
-- `match_numero` equivocado, que es justamente para lo que existe la sub-vista.
drop policy if exists compra_adjunto_vincular on public.compra_adjunto;
create policy compra_adjunto_vincular on public.compra_adjunto
  for update to authenticated
  using ((select public.es_administracion()))
  with check (
    (select public.es_administracion())
    and vinculado_por = 'match_manual'
    and vinculado_por_usuario = (select auth.uid())
  );

-- NO HAY INSERT NI DELETE para `authenticated`: los archivos los deposita el backfill/worker por
-- DATABASE_URL. Poder insertar una fila acá sería poder afirmar que existe un respaldo que nadie
-- subió.

-- Una columna nueva NACE SIN PERMISO y el grant es POR COLUMNA. El de update se acota a las cuatro
-- que la acción de vincular toca: sin eso, un update legítimo podría reescribir `storage_path` y
-- apuntar la fila a otro archivo.
grant select on public.compra_adjunto to authenticated;
grant update (compra_clave, fila_compras, vinculado_por, vinculado_por_usuario, vinculado_at)
  on public.compra_adjunto to authenticated;
