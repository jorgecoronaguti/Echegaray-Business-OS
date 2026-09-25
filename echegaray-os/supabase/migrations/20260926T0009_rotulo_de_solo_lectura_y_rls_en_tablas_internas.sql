-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `cliente_rotulo` SÓLO SE LEE, Y RLS EN LAS CINCO TABLAS INTERNAS QUE NO LA TENÍAN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Hallazgos de la verificación independiente del 25/09/2026:
--
-- #5 `cliente_rotulo` (20260926T0001) es una vista SECURITY DEFINER —a propósito: da el nombre del
--    cliente sin abrir `clientes`— y el privilegio por defecto del esquema le dio a `authenticated`
--    INSERT, UPDATE y DELETE. Una vista simple es actualizable: un UPDATE sobre ella corre con el dueño
--    (`postgres`, BYPASSRLS) y pisaría `clientes.nombre_comercial` salteando la RLS. Se revocan las
--    escrituras; queda SELECT.
--
-- #6 `documento_fragmento`, `documento_leido`, `migracion_aplicada`, `ml_embedding` y `sheet_rotulos`
--    tenían la RLS apagada. Hoy nadie fuera del servidor tiene grant, pero una tabla sin RLS queda a
--    un `grant` de distancia de estar abierta entera. Se enciende SIN policies para anon/authenticated:
--    denegado por defecto. Las usa sólo el orquestador, que se conecta como `postgres` (dueño de las
--    cinco, BYPASSRLS); ninguna pantalla, vista ni función de la app las lee.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.
revoke insert, update, delete, truncate, references, trigger on public.cliente_rotulo from authenticated, anon, public;
grant select on public.cliente_rotulo to authenticated;

alter table public.documento_fragmento enable row level security;
alter table public.documento_leido     enable row level security;
alter table public.migracion_aplicada  enable row level security;
alter table public.ml_embedding        enable row level security;
alter table public.sheet_rotulos       enable row level security;
