-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DOCE POLICIES DE ESCRITURA SEGUÍAN EN `true`, Y LA WEB YA LE ABRÍA ESAS PANTALLAS A CAMPO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL HALLAZGO ═══
--
-- Auditadas todas las policies de escritura de `public` para `authenticated`: 27 tenían la
-- condición en `true`. De ésas, **12 tenían además el GRANT puesto**, o sea que eran explotables:
--
--     acciones                   INSERT
--     avance_obra_legado         INSERT · UPDATE
--     comprobantes_arca          UPDATE
--     herramientas               INSERT · UPDATE · DELETE
--     movimientos_herramienta    INSERT · DELETE
--     pedidos_materiales         INSERT · UPDATE · DELETE
--
-- Las otras 15 son policies abiertas SIN grant: inertes hoy, y una bomba para el día que alguien
-- reponga el grant "porque la pantalla no guardaba". Quedan declaradas en el informe, no acá.
--
-- Y no es un riesgo teórico: `CAMPO_RUTAS_PERMITIDAS` le abre a un operario
-- `/integraciones/pedidos-materiales`, `/integraciones/herramientas` y `/integraciones/movimientos`,
-- que son pantallas con alta, edición y baja. Medido con el token de un usuario de campo antes de
-- esta migración: **insertó filas en las tres tablas apuntando a una obra que ni siquiera ve**, y
-- borró de la suya. El filtro por obra existía sólo para LEER.
--
-- ═══ EL CRITERIO: ROL + OBRA ASIGNADA + OPERACIÓN REAL ═══
--
-- No se reemplaza `true` por otro `true` con mejor nombre. Para cada policy se preguntó qué hace la
-- pantalla, quién tiene que poder hacerlo y si el objeto pertenece a una obra:
--
--   MAESTRO (existe sin obra: alta y baja de una herramienta, un cliente, un contacto, una obra)
--       → `es_administracion()`. Incluye al jefe de obra desde el 19/08. Campo, nunca.
--
--   OPERACIÓN SOBRE UNA OBRA (un pedido, mover una herramienta, registrar un movimiento)
--       → `ve_obra_texto(...)`, que YA ES la función canónica: devuelve true para quien administra
--         y, para el resto, traduce el nombre de la obra por `obra_alias` y pregunta `ve_obra()`.
--         Una sola expresión da las dos mitades —Administración global, campo acotado— sin escribir
--         una segunda autorización que mañana diga algo distinto.
--
--   EVENTO (un movimiento de herramienta ya ocurrido)
--       → no se borra. Se corrige con otro movimiento.
--
-- Ninguna función de autorización nueva: se reutilizan `es_administracion()`, `ve_economia()` y
-- `ve_obra_texto()`. Lo único que se agrega es un predicado PURO de diccionario, abajo.

-- ── UN LUGAR QUE NO ES DE NADIE ────────────────────────────────────────────────────────────────
--
-- Una herramienta vive en «ALMACEN», «TALLER» o en una obra. `almacen` y `taller` están en
-- `obra_alias` con `obra_id` NULL a propósito: no son obras. Si la regla fuera sólo
-- `ve_obra_texto(ubicacion_actual)`, un operario podría sacar una herramienta de su obra pero nunca
-- traerla del almacén ni devolverla — y eso es la operación que hace todos los días.
--
-- Por eso hace falta preguntar lo contrario: ¿este texto nombra una obra REAL? Es un predicado de
-- diccionario, no de autorización: no mira quién pregunta, no devuelve filas y no depende de la
-- sesión. Es `security definer` sólo porque `obra_alias` tiene RLS y si no, un usuario de campo
-- recibiría `false` para todo y quedaría sin poder mover nada. Su única salida es un booleano sobre
-- un texto que el llamador ya tiene en la mano.
create or replace function public.texto_es_de_obra(p_texto text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_texto is null or btrim(p_texto) = '' then false
    else exists (
      select 1 from public.obra_alias a
       where a.alias = public.norm_obra(p_texto) and a.obra_id is not null
    )
  end
$$;

comment on function public.texto_es_de_obra(text) is
  '¿Este texto nombra una obra real? Predicado de DICCIONARIO, no de autorización: no mira quién '
  'pregunta ni devuelve filas. Sirve para distinguir «esto es de una obra» de «esto es el almacén, '
  'el taller o la estructura», que es lo que permite que el nivel campo saque y devuelva una '
  'herramienta sin poder tocar la obra de otro.';

grant execute on function public.texto_es_de_obra(text) to authenticated;

-- ── 1 · EL MAESTRO DE CLIENTES Y DE OBRAS: LO ESCRIBE QUIEN ADMINISTRA ──────────────────────────
--
-- Las cuatro decían `current_rol() in ('direccion','administracion')`, escrito ANTES de que el
-- dueño metiera al jefe de obra en Administración (19/08). La lista literal no se movió con la
-- decisión, así que la pantalla le ofrecía al jefe cinco formularios que la base rechazaba.
--
-- Y las cuatro eran `for all`, que **incluye el SELECT**: la misma trampa que ya costó una fuga en
-- `obra_actividad` y otra en `obra_alias`. Se parten por comando. La lectura no cambia: la gobierna
-- la policy de SELECT que ya existía (`clientes_select`, `obra_canonica_select` = `ve_obra(id)`).
drop policy if exists "clientes_write" on public.clientes;
create policy "clientes_insert" on public.clientes
  for insert to authenticated with check (public.es_administracion());
create policy "clientes_update" on public.clientes
  for update to authenticated
  using (public.es_administracion()) with check (public.es_administracion());
create policy "clientes_delete" on public.clientes
  for delete to authenticated using (public.es_administracion());

drop policy if exists "cliente_contacto_write" on public.cliente_contacto;
create policy "cliente_contacto_insert" on public.cliente_contacto
  for insert to authenticated with check (public.es_administracion());
create policy "cliente_contacto_update" on public.cliente_contacto
  for update to authenticated
  using (public.es_administracion()) with check (public.es_administracion());
create policy "cliente_contacto_delete" on public.cliente_contacto
  for delete to authenticated using (public.es_administracion());

drop policy if exists "cliente_documento_write" on public.cliente_documento;
create policy "cliente_documento_insert" on public.cliente_documento
  for insert to authenticated with check (public.es_administracion());
create policy "cliente_documento_update" on public.cliente_documento
  for update to authenticated
  using (public.es_administracion()) with check (public.es_administracion());
create policy "cliente_documento_delete" on public.cliente_documento
  for delete to authenticated using (public.es_administracion());

drop policy if exists "obra_canonica_write" on public.obra_canonica;
create policy "obra_canonica_insert" on public.obra_canonica
  for insert to authenticated with check (public.es_administracion());
create policy "obra_canonica_update" on public.obra_canonica
  for update to authenticated
  using (public.es_administracion()) with check (public.es_administracion());
create policy "obra_canonica_delete" on public.obra_canonica
  for delete to authenticated using (public.es_administracion());

-- ── 2 · PEDIDOS DE MATERIALES: CADA UNO EN SU OBRA ─────────────────────────────────────────────
--
-- El pedido SIEMPRE pertenece a una obra (`obra_texto`; `obra_id` está 100% en NULL: 17 de 17
-- filas, así que no sirve como eje). `ve_obra_texto` da las dos mitades de una sola vez.
--
-- El `with check` del UPDATE no es una repetición del `using`: sin él, alguien podría tomar un
-- pedido de su obra y MOVERLO a otra, que es la forma elegante de escribir donde no se puede.
drop policy if exists "pedidos_materiales_insert" on public.pedidos_materiales;
create policy "pedidos_materiales_insert" on public.pedidos_materiales
  for insert to authenticated with check (public.ve_obra_texto(obra_texto));

drop policy if exists "pedidos_materiales_update" on public.pedidos_materiales;
create policy "pedidos_materiales_update" on public.pedidos_materiales
  for update to authenticated
  using (public.ve_obra_texto(obra_texto)) with check (public.ve_obra_texto(obra_texto));

drop policy if exists "pedidos_materiales_delete" on public.pedidos_materiales;
create policy "pedidos_materiales_delete" on public.pedidos_materiales
  for delete to authenticated using (public.ve_obra_texto(obra_texto));

-- ── 3 · HERRAMIENTAS: EL MAESTRO ES DE ADMINISTRACIÓN, LA UBICACIÓN ES DE LA OBRA ──────────────
--
-- Las tres operaciones de la pantalla no son la misma cosa:
--
--   dar de ALTA una herramienta y darla de BAJA   → el maestro global. Administración.
--   moverla de lugar y cambiarle el estado        → operación. La hace quien tiene la obra.
--
-- La regla de la operación es «la herramienta tiene que estar en mi obra, o en ningún lado»: un
-- operario saca del almacén, trabaja, y devuelve al almacén. Lo que no puede es tomar una que está
-- en la obra de otro, ni empujar una directamente a la obra de otro — para eso pasa por el almacén,
-- que es justamente lo que deja rastro.
drop policy if exists "herramientas_insert" on public.herramientas;
create policy "herramientas_insert" on public.herramientas
  for insert to authenticated with check (public.es_administracion());

drop policy if exists "herramientas_delete" on public.herramientas;
create policy "herramientas_delete" on public.herramientas
  for delete to authenticated using (public.es_administracion());

-- Y LA LECTURA TIENE QUE ACOMPAÑAR, O LA ESCRITURA NO SIRVE. Medido antes de escribir esto: mover
-- una herramienta de la obra al almacén daba **403 «new row violates row-level security policy»**
-- incluso con la policy en `true`. La causa no es la escritura: PostgREST cierra el `UPDATE` con un
-- `RETURNING`, y la fila NUEVA tiene que pasar la policy de SELECT. Con `ve_obra_texto('ALMACEN')`
-- en false, el operario podía sacar la herramienta de su obra pero no depositarla en ningún lado.
--
-- Y del otro lado, lo mismo al revés: hoy un operario **no ve una sola herramienta del almacén**
-- —56 de 149—, así que tampoco puede tomar una para llevarla a su obra. La pantalla existe, está en
-- `CAMPO_RUTAS_PERMITIDAS`, y el flujo completo está roto de lectura.
--
-- La línea correcta no es «lo de mi obra»: es **«lo de mi obra, más lo que no es de nadie»**. Una
-- herramienta en el almacén o en el taller no es de ninguna obra y es justamente el stock del que
-- se toma. Lo que sigue sin verse —y sin tocarse— es lo que está en la obra de otro.
drop policy if exists "herramientas_select" on public.herramientas;
create policy "herramientas_select" on public.herramientas
  for select to authenticated using (
    public.ve_obra_texto(ubicacion_actual) or not public.texto_es_de_obra(ubicacion_actual)
  );

drop policy if exists "herramientas_update" on public.herramientas;
create policy "herramientas_update" on public.herramientas
  for update to authenticated
  using (
    public.ve_obra_texto(ubicacion_actual) or not public.texto_es_de_obra(ubicacion_actual)
  )
  with check (
    public.ve_obra_texto(ubicacion_actual) or not public.texto_es_de_obra(ubicacion_actual)
  );

-- Y LA RLS NO CORTA POR COLUMNA: lo que corta es el GRANT. El nombre de la herramienta es el
-- maestro y no se edita desde ninguna pantalla —sólo se fija en el alta—, así que sacarlo del grant
-- no le quita nada a nadie y cierra el último resquicio: cambiarle el nombre a la herramienta de
-- otro sin poder darla de alta ni de baja.
revoke update on public.herramientas from authenticated;
grant update (ubicacion_actual, estado, estado_nota, estado_actualizado_en, imagen_url,
              origen, updated_at) on public.herramientas to authenticated;

-- ── 4 · MOVIMIENTOS: SON UN HECHO, Y UN HECHO NO SE BORRA ──────────────────────────────────────
--
-- `registrar_movimiento_herramienta` es `security invoker` —lo verifiqué— así que hereda estas
-- policies: no hay una puerta de atrás por RPC. El destino se acota igual que la ubicación.
drop policy if exists "mov_herr_insert" on public.movimientos_herramienta;
create policy "mov_herr_insert" on public.movimientos_herramienta
  for insert to authenticated
  with check (public.ve_obra_texto(destino) or not public.texto_es_de_obra(destino));

-- El DELETE se retira entero. Un movimiento es un evento del historial: si estuvo mal, se corrige
-- con OTRO movimiento, que es lo que deja la corrección a la vista. Borrar lo tapa. Ninguna
-- pantalla lo usaba: no hay un solo `delete` sobre esta tabla en `src/`.
drop policy if exists "mov_herr_delete" on public.movimientos_herramienta;
revoke delete on public.movimientos_herramienta from authenticated;

-- Y LA LECTURA TENÍA UN TROMPO: `mov_herr_select` decía
-- `ve_obra_texto(destino) OR ve_obra_texto(origen)`, pero `origen` NO es un lugar — es el sistema
-- que trajo la fila ('appsheet_sheet' en las 53 que hay hoy, 'os' en las que crea la web). Comparar
-- un nombre de sistema contra el diccionario de obras no devuelve nada hoy y abre una fuga el día
-- que exista un alias que se llame igual que un origen. Se saca la mitad que no significa nada.
--
-- Y se le agrega la misma mitad que a herramientas —«o el destino no es de ninguna obra»— por el
-- mismo motivo medido: el `RETURNING` del INSERT exige que la fila nueva pase el SELECT, así que
-- sin esto registrar la devolución de una herramienta al almacén fallaría con un 403 que parece un
-- problema de permisos y es un problema de visibilidad.
drop policy if exists "mov_herr_select" on public.movimientos_herramienta;
create policy "mov_herr_select" on public.movimientos_herramienta
  for select to authenticated using (
    public.ve_obra_texto(destino) or not public.texto_es_de_obra(destino)
  );

-- ── 5 · IMPUTAR UN COMPROBANTE A UNA OBRA ES REDEFINIR EL COSTO DE ESA OBRA ────────────────────
--
-- La única escritura de la web sobre `comprobantes_arca` es asignar/desasignar la obra, desde
-- `/control-obras/costos`, que es una pantalla de Administración. Mismo criterio que `obra_alias`.
-- El sync de ARCA entra por `service_role` y no lo toca esta policy.
drop policy if exists "comprobantes_arca_update" on public.comprobantes_arca;
create policy "comprobantes_arca_update" on public.comprobantes_arca
  for update to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

-- ── 6 · `avance_obra_legado`: NADIE LA ESCRIBE DESDE LA WEB ────────────────────────────────────
--
-- Buscado en todo el repo: cero escrituras en `src/` y cero en `orquestador/` por PostgREST. Es
-- una tabla legada que llena un sync. Mismo criterio que `costos_obra`: si ninguna pantalla la
-- escribe, no hay permiso que acotar — hay permiso que retirar.
drop policy if exists "avance_obra_upsert" on public.avance_obra_legado;
drop policy if exists "avance_obra_update" on public.avance_obra_legado;
revoke insert, update on public.avance_obra_legado from authenticated;

-- ── 7 · `acciones`: LA CREA QUIEN CARGA UN SALDO ───────────────────────────────────────────────
--
-- El único INSERT de la web está en `cargarSaldoAction`, que vive en `/flujo-caja` — una ruta de
-- `RUTAS_SOLO_ECONOMIA`. O sea que quien de verdad la escribe es dirección o administración, y el
-- predicado que ya gobierna esa pantalla es `ve_economia()`. El UPDATE y el DELETE ya estaban
-- acotados a esos dos roles desde antes: esto sólo alinea el INSERT con sus dos hermanos.
drop policy if exists "creacion_autenticados" on public.acciones;
create policy "acciones_insert" on public.acciones
  for insert to authenticated with check (public.ve_economia());
