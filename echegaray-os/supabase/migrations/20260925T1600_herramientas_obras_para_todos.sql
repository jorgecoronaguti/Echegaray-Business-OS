-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · EL ÍNDICE DE OBRAS Y SU CLIENTE, IGUAL PARA TODOS LOS NIVELES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 25/09/2026 (regla de oro: revisar todo por nivel de usuario): en Ubicaciones el jefe y el
-- operario tienen que ver cada cliente con su nombre, igual que Dirección. Herramientas tiene permisos
-- iguales para todos los niveles (21/09).
--
-- Medido el 25/09 con la RLS de cada nivel: el operario (rol campo) ve UNA obra en `obra_canonica` (la
-- suya) y las ubicaciones de las otras once quedaban sin obra ni cliente: rotuladas «obra <id>», sin
-- agrupar, y fuera de los destinos de Mover. Esta función publica SÓLO lo que Herramientas dibuja de una
-- obra —id, código, nombre, estado, cliente_id y el nombre del cliente con la regla única del OS
-- (`src/shared/clientes/nombre.ts`: nombre comercial del CRM, si no la razón social; el texto de la
-- planilla sólo si la obra no tiene cliente vinculado)— sin abrir `obra_canonica` ni `clientes`.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create function public.obras_de_herramientas()
returns table (id text, codigo text, nombre text, estado text, cliente_id uuid, cliente text)
language sql stable security definer set search_path = public as $$
  select o.id, o.codigo, o.nombre, o.estado, o.cliente_id,
         coalesce(nullif(btrim(c.nombre_comercial), ''), nullif(btrim(c.razon_social), ''),
                  case when o.cliente_id is null then nullif(btrim(o.cliente_texto), '') end)
    from obra_canonica o
    left join clientes c on c.id = o.cliente_id
   where o.fusionada_en is null
     and auth.uid() is not null
$$;
comment on function public.obras_de_herramientas() is
  'El índice de obras que Herramientas dibuja (id, código, nombre, estado, cliente), igual para todos los niveles con sesión.';
revoke all on function public.obras_de_herramientas() from public, anon;
grant execute on function public.obras_de_herramientas() to authenticated;
