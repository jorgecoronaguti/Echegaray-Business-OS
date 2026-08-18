-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LO QUE ROMPIÓ EL CIERRE POR COLUMNA, Y LO QUE DESTAPÓ
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `20260819T1600` le quitó a `authenticated` el SELECT sobre las columnas comerciales. La decisión
-- era correcta y la evidencia la respalda. Pero el efecto lateral fue más grande de lo declarado, y
-- lo encontró un test que no tenía nada que ver con el MVP:
--
--   `POST /rest/v1/rpc/detectar_senales_criticas_transversales`
--     → 403 · 42501 · "permission denied for table presupuestos"
--
-- La cadena: esa RPC corre seis detectores en UNA transacción; uno de ellos
-- (`detectar_deterioro_margen_obra`) lee la vista `obra_resumen_economico`, que es
-- `security_invoker = true` y proyecta `presupuestos.monto_presupuestado` y `margen_esperado`
-- DIRECTO. El 403 abortó la transacción entera, así que también dejó de detectar las acciones
-- vencidas — que era lo único que el test medía. **Un rojo lejano del cambio, causado por el cambio.**
--
-- ═══ Y EL PROBLEMA MÁS CARO, QUE NO ERA UN ERROR SINO UN SILENCIO ═══
--
-- `orquestador/lib/estado-empresa.mjs` lee `obra_panel.monto_contratado` por conexión directa a
-- Postgres, como `postgres`. Ahí no hay JWT: `auth.uid()` es null, `current_rol()` no encuentra
-- perfil, `es_administracion()` devuelve false —falla cerrado, como se diseñó— y
-- `contratado_de_obra()` devuelve NULL. Resultado: la línea
-- `count(*) filter (where monto_contratado is null) as sin_contratado` habría contado las OCHO obras
-- como "sin contrato", sin un solo error, en el estado de la empresa que el dueño lee.
--
-- Ése es el modo de falla peor de todos: no revienta, miente. Y no lo habría atrapado ningún test de
-- permisos, porque desde el punto de vista de los permisos estaba funcionando perfecto.

-- ── 1 · EL CONTEXTO INTERNO NO ES UN USUARIO SIN PRIVILEGIOS ────────────────────────────────────
--
-- `auth.uid() is null` significa exactamente una cosa: no hay un usuario final del otro lado. Es
-- pg_cron, el orquestador por conexión directa, o el `service_role` — tres contextos que YA tienen
-- acceso total por otra vía (`postgres` y `service_role` son dueños o `bypassrls`). Negarles el dato
-- no protege nada: sólo apaga las rutinas en silencio.
--
-- No abre nada nuevo: `anon` —el único rol sin usuario que llega por PostgREST— no tiene EXECUTE
-- sobre estas funciones, y el `revoke ... from public` de abajo lo mantiene así.
create or replace function public.contratado_de_obra(p_obra text)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.es_administracion() or auth.uid() is null
              then (select oc.monto_contratado from public.obra_canonica oc where oc.id = p_obra) end
$$;

create or replace function public.presupuesto_monto(p_presupuesto uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.es_administracion() or auth.uid() is null
              then (select p.monto_presupuestado from public.presupuestos p where p.id = p_presupuesto) end
$$;

create or replace function public.presupuesto_margen(p_presupuesto uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.es_administracion() or auth.uid() is null
              then (select p.margen_esperado from public.presupuestos p where p.id = p_presupuesto) end
$$;

revoke execute on function public.contratado_de_obra(text) from public;
revoke execute on function public.presupuesto_monto(uuid) from public;
revoke execute on function public.presupuesto_margen(uuid) from public;
grant execute on function public.contratado_de_obra(text)  to authenticated, service_role;
grant execute on function public.presupuesto_monto(uuid)   to authenticated, service_role;
grant execute on function public.presupuesto_margen(uuid)  to authenticated, service_role;

-- ── 2 · EL CONTRATO DE LA TABLA LEGACY TAMBIÉN ES UN CONTRATO ───────────────────────────────────
--
-- `public.obras` son cuatro filas, todas pausadas o cerradas, y el sistema entero se mudó a
-- `obra_canonica`. Pero su `monto_contratado` es un monto contratado, y quedaba legible. Cerrarlo
-- cuesta tres líneas; dejarlo abierto obliga a explicar por qué el mismo dato está cerrado en una
-- tabla y abierto en la de al lado — y esa explicación no existe.
--
-- Verificado antes de tocar: el único lugar de `src/` que lee `public.obras` es
-- `features/reportes/services/generadores.ts`, y pide `id, nombre, estado, fecha_fin_objetivo`.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'obras'
     and column_name not in ('monto_contratado');
  execute 'revoke select on public.obras from authenticated';
  execute format('grant select (%s) on public.obras to authenticated', cols);
end $$;

-- ── 3 · DOS VISTAS LEGACY QUE PUBLICABAN EL CUADRO COMERCIAL ENTERO ─────────────────────────────
--
-- `obra_resumen_economico` y `obra_ejecucion_financiera` proyectan contrato, presupuesto, margen y
-- pendiente de certificar de la tabla legacy, con `security_invoker = true`. Medido: NINGÚN archivo
-- de `src/` ni de `orquestador/` las consulta — su único consumidor es `detectar_deterioro_margen_obra`,
-- que a partir del paso 4 corre como su dueño.
--
-- Se les quita el SELECT a `authenticated` en vez de enmascararlas columna por columna: enmascarar
-- una vista que nadie mira es trabajo sin efecto, y dejarla enmascarada A MEDIAS es peor que
-- cerrarla. Si mañana una pantalla las necesita, se enmascaran como `obra_panel` y se documenta ahí.
revoke select on public.obra_resumen_economico from authenticated;
revoke select on public.obra_ejecucion_financiera from authenticated;
grant select on public.obra_resumen_economico, public.obra_ejecucion_financiera to service_role;

comment on view public.obra_resumen_economico is
  'LEGACY (public.obras). Publica presupuesto y margen enteros: authenticated NO la lee. Su único '
  'consumidor es detectar_deterioro_margen_obra(), que corre como su dueño.';
comment on view public.obra_ejecucion_financiera is
  'LEGACY (public.obras). Publica contrato y pendiente de certificar: authenticated NO la lee.';

-- ── 4 · EL DETECTOR DE MARGEN CORRE COMO SU DUEÑO, IGUAL QUE CUANDO LO LLAMA EL CRON ────────────
--
-- Es una rutina autónoma: su contexto natural es pg_cron, donde ya corre como `postgres`. Que además
-- se pueda disparar por RPC no debería cambiar QUÉ ve — y hasta ahora sí lo cambiaba, que es la
-- causa del 403. `search_path` fijado: una definer sin search_path fijo es una escalada esperando.
--
-- No devuelve datos: escribe hallazgos en `backlog_autonomo`. Por eso el paso 5.
create or replace function public.detectar_deterioro_margen_obra()
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into backlog_autonomo (
    tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo,
    recomendacion, nivel_autonomia_permitido, estado, origen_tabla, origen_id
  )
  select
    'riesgo',
    'Margen ' || (case when r.desvio_porcentual > 15 then 'crítico' else 'en atención' end) || ' — ' || r.obra_nombre,
    'Costo real desvía ' || r.desvio_porcentual || '% del presupuesto aprobado (margen actualizado $'
      || r.margen_actualizado || ', costo real acumulado $' || r.costo_real_acumulado || ').',
    'obra_resumen_economico (detección automática, pg_cron)',
    'calculado',
    case when r.desvio_porcentual > 15 then 'alta' else 'media' end,
    case when r.desvio_porcentual > 15 then 'alta' else 'media' end,
    'medio',
    'Abrir la ficha de ' || r.obra_nombre || ' y revisar qué costos explican el desvío antes de que siga creciendo.',
    'C',
    'abierto',
    'obras',
    r.obra_id
  from obra_resumen_economico r
  where r.presupuesto_id is not null
    and r.desvio_porcentual is not null
    and r.desvio_porcentual > 5
    and not exists (
      select 1 from backlog_autonomo b
      where b.origen_tabla = 'obras' and b.origen_id = r.obra_id and b.tipo = 'riesgo'
        and b.titulo like 'Margen%' and b.estado in ('abierto', 'en_curso')
    );
$$;

-- ── 5 · EL BACKLOG AUTÓNOMO ERA LA PUERTA DE ATRÁS DEL MARGEN ───────────────────────────────────
--
-- `backlog_autonomo_select` decía `using (true)`: cualquier autenticado leía los 70 hallazgos, y 17
-- de ellos llevan un importe en el texto de la evidencia —incluido *"margen actualizado $X"*, que es
-- exactamente el número que el dueño declaró secreto para el nivel Obras—. Enmascarar la columna en
-- la vista y dejar el mismo número escrito en prosa en otra tabla no protege nada.
--
-- Es una herramienta de Dirección y Administración: las dos pantallas que la leen
-- (`features/reportes`, `features/direccion`) ya viven en rutas que el nivel Obras no abre.
drop policy if exists backlog_autonomo_select on public.backlog_autonomo;
create policy backlog_autonomo_select on public.backlog_autonomo for select to authenticated
  using (public.es_administracion());
