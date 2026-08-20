-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA SOLAPA «OPERACIÓN» FILTRABA POR OBRA; LA BASE NO. ESO ES SEGURIDAD COSMÉTICA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL HALLAZGO ═══
--
-- Las cuatro tablas que alimentan Operación —pedidos, compras, herramientas y movimientos— tenían
-- todas la misma policy de lectura:
--
--     costos_obra_select · pedidos_materiales_select · herramientas_select · mov_herr_select
--     for select to authenticated using (TRUE)
--
-- La pantalla filtra por obra, pero un filtro de PRESENTACIÓN no es un permiso: un jefe de obra
-- acotado a una sola obra por `usuario_obra` podía leer las cuatro tablas enteras con un `GET` a
-- PostgREST — todos los pedidos, todas las compras y todos los movimientos de las ocho obras.
--
-- Es exactamente el defecto que el dueño nombró: *"Supabase Auth + RLS real. No seguridad
-- cosmética. No alcanza con esconder UI"*. Y es el mismo que ya se encontró el 18/08 en
-- `obra_actividad`, ahí por un `for all` que incluía el SELECT. La lección no se había aplicado a
-- las tablas operativas porque nadie las había mirado con este criterio todavía.
--
-- ═══ EL PUENTE ES POR TEXTO, Y ESO NO SE PUEDE EVITAR ═══
--
-- Ninguna de las cuatro tiene `obra_canonica_id`: guardan el nombre de la obra como TEXTO
-- (`costos_obra.obra_texto`, `pedidos_materiales.obra_texto`, `herramientas.ubicacion_actual`,
-- `movimientos_herramienta.destino`). El diccionario que los resuelve ya existe y es el mismo que
-- usa `obra_costo_real`: `norm_obra(texto)` contra `obra_alias.alias`.
--
-- `ve_obra_texto` se apoya en ese diccionario y NO inventa un segundo criterio de resolución.
--
-- ═══ LO QUE NO MAPEA NO SE MUESTRA AL NIVEL OBRAS, Y ES A PROPÓSITO ═══
--
-- `obra_alias` tiene filas con `obra_id` nulo: «administracion», «taller», «f931», «uocra»,
-- «vehiculos maquinas», «sueldos»… Son gastos de estructura, no de obra. Un texto que no resuelve a
-- ninguna obra visible queda fuera para el nivel OBRAS y adentro para ADMINISTRACIÓN. Falla cerrado:
-- ante la duda, no se muestra.

create or replace function public.ve_obra_texto(p_texto text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.es_administracion() then true
    when p_texto is null or btrim(p_texto) = '' then false
    else exists (
      select 1
        from public.obra_alias a
       where a.alias = public.norm_obra(p_texto)
         and a.obra_id is not null
         and public.ve_obra(a.obra_id)
    )
  end
$$;

comment on function public.ve_obra_texto(text) is
  'Traduce el nombre de obra guardado como texto al eje canónico por obra_alias y pregunta si el '
  'usuario ve esa obra. Administración ve todo; un texto que no resuelve a ninguna obra visible '
  'queda fuera. Mismo diccionario que obra_costo_real: no hay un segundo criterio de resolución.';

grant execute on function public.ve_obra_texto(text) to authenticated;

-- ── LAS CUATRO LECTURAS ────────────────────────────────────────────────────────────────────────
-- Se reemplaza SÓLO el SELECT. La escritura de estas tablas ya la gobiernan sus propias policies y
-- la hace el sync con `service_role`, que salta RLS: tocarla acá rompería la sincronización sin
-- cerrar ninguna fuga.

drop policy if exists "costos_obra_select" on public.costos_obra;
create policy "costos_obra_select" on public.costos_obra
  for select to authenticated using (public.ve_obra_texto(obra_texto));

drop policy if exists "pedidos_materiales_select" on public.pedidos_materiales;
create policy "pedidos_materiales_select" on public.pedidos_materiales
  for select to authenticated using (public.ve_obra_texto(obra_texto));

drop policy if exists "herramientas_select" on public.herramientas;
create policy "herramientas_select" on public.herramientas
  for select to authenticated using (public.ve_obra_texto(ubicacion_actual));

drop policy if exists "mov_herr_select" on public.movimientos_herramienta;
create policy "mov_herr_select" on public.movimientos_herramienta
  for select to authenticated using (
    public.ve_obra_texto(destino) or public.ve_obra_texto(origen)
  );

-- RLS NO ES GRANT. Los grants ya estaban; se dejan explícitos porque una policy nueva sin su grant
-- devuelve `42501 permission denied`, que Next muestra como un 404 y manda a buscar el defecto al
-- lugar equivocado. Ya costó una tarde el 17/08.
grant select on public.costos_obra, public.pedidos_materiales,
                public.herramientas, public.movimientos_herramienta to authenticated;
