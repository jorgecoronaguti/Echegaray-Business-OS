-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `os_runtime` DEJA DE SER PÚBLICA: sólo Dirección y el servidor
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Medido el 25/09/2026: con la clave ANÓNIMA (está en el JS del sitio) PostgREST devolvía las 4 filas
-- de `os_runtime`, entre ellas las URLs de los túneles del chat (`xsas_endpoint`) y del motor
-- interactivo (`interactive_endpoint`). La policy `os_runtime_public_read` (using true) y el grant a
-- `anon` los había puesto `os-endpoint.mjs` para que la web leyera el túnel sin credenciales.
--
-- QUIÉN LA LEE, y por qué sigue andando:
--   · la web (/api/os/*, /api/oauth/*): desde 583f1cd5 con la clave de servicio (lib/os/endpointInteractivo);
--   · /api/xsas (shared/xsas/puerta.ts): ya leía con la clave de servicio;
--   · el orquestador, el bot, el túnel y la alarma de crédito: conexión directa como `postgres`.
-- Ninguno pasa por `anon` ni por la sesión de una persona. Se deja lectura a Dirección para mirarla.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.
drop policy if exists os_runtime_public_read on public.os_runtime;
drop policy if exists os_runtime_direccion_lee on public.os_runtime;
create policy os_runtime_direccion_lee on public.os_runtime for select to authenticated
  using ((select public.current_rol()) = 'direccion');
revoke all on public.os_runtime from anon;
revoke insert, update, delete on public.os_runtime from authenticated;
grant select on public.os_runtime to authenticated;
