-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `obra_panel` Y `obra_costo_real` VUELVEN A CORRER CON EL RLS DE QUIEN PREGUNTA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL AGUJERO, MEDIDO ═══
--
-- `20260910T1900_obra_canonica_fusionada_en.sql` rehízo la vista con `create or replace view` sin
-- repetir `with (security_invoker = true)`. Postgres NO hereda la opción: la BORRA. Desde entonces
-- `obra_panel` corre como su dueño (`postgres`) y saltea la RLS de `obra_canonica`.
--
-- Medido el 10/09/2026 contra la base real, como `authenticated` con la sesión de un perfil de rol
-- `campo` y `select * from public.obra_panel`:
--
--     sin security_invoker → 24 obras   ← la cartera ENTERA para personal de campo
--     con security_invoker →  1 obra    ← la que su asignación vigente le habilita
--
-- Es exactamente el defecto que `orquestador/lib/vistas-security-invoker.test.mjs` vigila y que
-- estaba en rojo. No es teórico: `authenticated` tiene `grant select` sobre la vista.
--
-- ═══ POR QUÉ TAMBIÉN `obra_costo_real` ═══
--
-- Nunca tuvo la opción, y tiene `grant select on ... to authenticated` por su cuenta. Publica
-- `costo_real`, `n_comprobantes` y `costo_mano_de_obra` leyendo `costos_obra`, cuya policy es de
-- Administración. Sin invoker, esos tres números salteaban esa policy DOS VECES: pedida directa y
-- a través de `obra_panel`, que la lee por `left join` — y arreglar sólo la de arriba habría dejado
-- la fuga abierta por abajo, con el test en verde.
--
-- ═══ LO QUE NO CUESTA ═══
--
-- Los `grant select` de las tablas que las dos vistas leen (`obra_canonica`, `clientes`,
-- `obra_restriccion`, `costos_obra`, `obra_alias`) ya existen — «RLS no es GRANT»: sin ellos el
-- invoker daría 42501 y la pantalla se vería como «no existe». Se verificó antes de escribir esto.
--
-- Medido como Dirección, `select * from obra_panel` completo: 507 ms sin invoker → 103 ms con
-- invoker (86 ms en caliente). No es un precio, es una mejora: la RLS recorta filas antes.

alter view public.obra_panel      set (security_invoker = true);
alter view public.obra_costo_real set (security_invoker = true);

comment on view public.obra_panel is
  'La cartera de obras. security_invoker = true: cada quien ve las obras que su RLS le deja. '
  'Un create or replace que no repita la opción la BORRA — ya pasó el 10/09/2026.';
comment on view public.obra_costo_real is
  'Costo real por obra desde costos_obra. security_invoker = true: hereda la policy de Administración.';
