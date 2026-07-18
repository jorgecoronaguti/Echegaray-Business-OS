-- F0.1 INSTRUMENTAR (plan de acción 18/07). El OS era CIEGO: no guardaba QUÉ se le pide, solo la
-- respuesta (orq.chat_result) y el costo (orq.chat_cost). Sin el pedido no se puede medir qué se
-- pide más, qué tarda, qué falla, ni qué convertir en capacidad determinística. Esta tabla es EL
-- INSTRUMENTO: un registro por pedido con su texto, quién, capacidad, modelo, costo, latencia y
-- desenlace. Con esto dejamos de adivinar: en 1 semana hay una lista real de los pedidos frecuentes.
create table if not exists orq.chat_request (
  rid          text primary key,     -- text, no uuid: el server genera rids 'srv-...' no-uuid (igual que orq.chat_result.rid)
  directive    text,                 -- el pedido REAL (lo que hoy no se guardaba en ningún lado)
  user_email   text,                 -- quién lo pidió (jorge / rodrigo / anon)
  surface      text,                 -- de qué cara del OS vino: extension | web | claude_code
  capability   text,                 -- a qué se ruteó (general, advise.finance, escritura_sheet…)
  model        text,                 -- haiku | sonnet | (determinístico: '0api')
  cost_usd     numeric,
  latency_ms   integer,
  outcome      text,                 -- normal | corte_costo | corte_iter | error | corta | async
  ext_version  text,
  created_at   timestamptz not null default now()
);
create index if not exists chat_request_created_idx on orq.chat_request (created_at desc);
create index if not exists chat_request_outcome_idx on orq.chat_request (outcome);
create index if not exists chat_request_cap_idx on orq.chat_request (capability);
comment on table orq.chat_request is
  'F0.1 instrumentación: un registro por pedido del chat (directiva, usuario, capacidad, modelo, costo, latencia, desenlace). El instrumento para medir qué se pide/tarda/falla y decidir qué hacer determinístico.';
