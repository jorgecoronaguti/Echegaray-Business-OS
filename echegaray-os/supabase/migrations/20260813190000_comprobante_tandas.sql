-- UN SOLO MENSAJE POR TANDA DE COMPROBANTES — el estado mínimo para poder EDITAR un post en vez de
-- publicar uno nuevo por cada post con fotos.
--
-- ═══ EL PEDIDO, TEXTUAL (13/08) ═══
--
--   «no quiero mensajes del bot en la carga de comprobantes, necesito q la experiencia sea sin
--    fisuras. solo quiero q confirme q termino todo»
--   «me envie solo mensaje de confirmacion de q fue cargado ok, cuantos fueron cargados»
--
-- Hoy cada post con adjuntos dispara una tarea y cada tarea PUBLICA. Doce fotos en tres posts son
-- tres mensajes (más las tarjetas con botones). Lo que hace falta para que sea UNO es poder guardar
-- el `id` del post del bot y volver a escribirlo — y poder saber si TODAVÍA queda algo en curso,
-- porque «terminó todo» no se puede afirmar mientras un post siga leyéndose.
--
-- ═══ POR QUÉ NO ALCANZA `comprobante_fajos` ═══
--
-- El fajo ya agrupa, pero se CONSUME: desde que la carga es automática, `tomarParaConfirmar` lo pasa
-- a `confirmado` y lo cierra en la misma pasada. El segundo post de la tanda ya no encuentra un fajo
-- abierto y abre uno nuevo — o sea que `comprobante_fajos.aviso_post_id` vive lo que vive UN post.
-- La conversación dura más que el fajo, así que su estado no puede vivir adentro del fajo.
--
-- ═══ DOS TABLAS, Y POR QUÉ DOS ═══
--
--   1. `comprobante_tandas` — la identidad de la conversación y el post que se reescribe.
--   2. `comprobante_partes` — UNA fila por post procesado, con lo que ese post produjo.
--
-- El acumulado NO se guarda como un contador que se lee y se reescribe: se SUMA a partir de las
-- partes. Dos posts procesados a la vez con read-modify-write se pisarían el contador y el mensaje
-- diría menos comprobantes de los que entraron — el defecto es exactamente el que este mensaje
-- existe para no tener. Sumar filas no se pisa.
--
-- Y `post_id` es único dentro de la tanda: si el worker reejecuta la tarea (ya pasó con el lease de
-- 30 s), la parte no se cuenta dos veces. La idempotencia del CONTEO es tan necesaria como la de la
-- escritura: un mensaje que dice 16 cuando entraron 8 destruye la confianza igual que una fila
-- duplicada.
--
-- ADITIVA. El código anda ANTES y DESPUÉS: `tanda.mjs` pregunta si las tablas existen y, si no
-- están, el especialista responde como siempre (un mensaje por post). El deploy y la migración no
-- caen juntos.

create table if not exists comunicacion.comprobante_tandas (
  id                  uuid primary key default gen_random_uuid(),
  plataforma          text not null default 'mattermost',
  plataforma_user_id  text not null,
  channel_id          text not null,
  -- El hilo donde vive el mensaje único: el primer post de la tanda. Los posts 2 y 3 son otros
  -- hilos, y a propósito no se les contesta nada — ése es todo el punto.
  root_post_id        text,
  -- EL POST DEL BOT. Es el único valor que esta tabla existe para guardar.
  aviso_post_id       text,
  estado              text not null default 'abierta' check (estado in ('abierta','cerrada')),
  creado_at           timestamptz not null default now(),
  ultimo_at           timestamptz not null default now(),
  cerrado_at          timestamptz
);

-- UNA SOLA TANDA ABIERTA POR PERSONA Y CANAL. Es lo que hace que el post 2 encuentre el mensaje del
-- post 1 en vez de publicar otro. Parcial sobre `estado='abierta'`: las cerradas quedan de historial.
create unique index if not exists comprobante_tandas_abierta_idx
  on comunicacion.comprobante_tandas (plataforma, plataforma_user_id, channel_id)
  where estado = 'abierta';

create index if not exists comprobante_tandas_ultimo_idx
  on comunicacion.comprobante_tandas (estado, ultimo_at desc);

comment on table comunicacion.comprobante_tandas is
  'La conversación de una carga de comprobantes por chat: varios posts con fotos, UN mensaje del bot que se reescribe. Dura más que un fajo (el fajo se consume al cargar), por eso el aviso_post_id vive acá.';

-- ── LA PARTE DE CADA POST ────────────────────────────────────────────────────
-- `parte` es el recuento de ESE post: cuántos entraron, cuántos ya estaban, qué no se pudo leer, qué
-- quedó sin imputar. Su forma la define `lib/comprobantes/parte.mjs` (núcleo puro), no esta tabla:
-- por eso es jsonb y no catorce columnas que habría que migrar cada vez que cambia un renglón.
create table if not exists comunicacion.comprobante_partes (
  id          bigint generated always as identity primary key,
  tanda_id    uuid not null references comunicacion.comprobante_tandas(id) on delete cascade,
  post_id     text not null,
  -- `en_curso` es lo que permite decir «todavía estoy leyendo» y, sobre todo, lo que impide decir
  -- «terminé» cuando no terminó. Se cierra pase lo que pase: también cuando el post falla.
  estado      text not null default 'en_curso' check (estado in ('en_curso','listo')),
  parte       jsonb not null default '{}'::jsonb,
  creado_at   timestamptz not null default now(),
  cerrado_at  timestamptz
);

create unique index if not exists comprobante_partes_post_idx
  on comunicacion.comprobante_partes (tanda_id, post_id);

create index if not exists comprobante_partes_tanda_idx
  on comunicacion.comprobante_partes (tanda_id, estado);

comment on table comunicacion.comprobante_partes is
  'Una fila por post con adjuntos. El acumulado de la tanda se SUMA de acá en vez de guardarse como contador: dos posts a la vez con read-modify-write se pisarían el número. `post_id` único por tanda para que una reejecución de la tarea no cuente dos veces.';
