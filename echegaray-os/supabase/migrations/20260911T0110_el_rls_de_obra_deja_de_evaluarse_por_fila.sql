-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL PORTERO DEJA DE PREGUNTARLE A CADA FILA — `(select fn())` COMO INITPLAN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ DE DÓNDE SALEN LOS SEGUNDOS, MEDIDO ═══
--
-- `explain (analyze)` sobre la base real, como `authenticated` con sesión de un perfil `campo` y
-- `obra_costo_real` ya corriendo con `security_invoker` (migración 20260911T0100):
--
--     Seq Scan on costos_obra  (actual time=560.687..560.687 rows=0 loops=1)
--       Filter: ((InitPlan 3).col1 OR ve_obra_texto(obra_texto))
--       Rows Removed by Filter: 938
--
-- 560,7 ms para 938 filas: 0,6 ms POR FILA. `ve_obra_texto` recibe una COLUMNA, así que no puede
-- ser un initplan — se ejecuta una vez por fila, y adentro llama `es_administracion()`,
-- `current_rol()` y un `exists` sobre `obra_alias` que a su vez llama `ve_obra()`. Son cuatro
-- funciones `security definer` por fila de la tabla.
--
-- El mismo predicado escrito como pertenencia a un conjunto se evalúa UNA vez y se hashea:
--
--     938 filas — viejo 698 ms · nuevo 67 ms      (10,4× menos)
--
-- Y devuelve LO MISMO, medido con una asignación vigente del perfil `campo` a una obra con costos:
--
--     count(*) filter (where ve_obra_texto(obra_texto))                      → 347
--     count(*) filter (where norm_obra(obra_texto) in (select mis_alias…))   → 347
--     count(*) filter (where los dos difieren)                               →   0
--
-- ═══ POR QUÉ NO SE TOCA `ve_obra()` NI `ve_obra_texto()` ═══
--
-- Las llaman otras veinte policies y varias vistas. Lo que se cambia es la FORMA de preguntar en
-- las tres policies que barren tablas grandes; las funciones siguen siendo la definición única de
-- «qué obra veo» y las dos funciones nuevas las respetan.
--
-- ═══ QUIÉN PAGABA ESTO ═══
--
-- Nadie con rol `direccion`, `administracion` o `jefe_obra`: `es_administracion()` es el primer
-- término del OR, es un initplan, da `true` y el OR corta. Lo pagaba el personal de CAMPO — y lo
-- iba a empezar a pagar TODO EL MUNDO en cuanto `obra_panel` recuperara `security_invoker`. Cerrar
-- el agujero de seguridad sin esto habría cambiado una fuga por un `statement timeout`.
--
-- ═══ LO QUE ESTA MIGRACIÓN NO ARREGLA ═══
--
-- Siguen evaluando una función por fila, y quedan declaradas acá porque no se tocan a ciegas:
-- `cliente_orden_select`, `actividades_semanales_select` y `personas_select` (dentro de sus
-- `exists`). En las tres el término por fila está detrás de un `current_rol() = 'jefe_obra'` que
-- para el usuario real de esas pantallas ya devuelve `true` sin mirar la fila. Se miden aparte.

-- ── LAS OBRAS QUE LA SESIÓN TIENE ATADAS, COMO CONJUNTO ─────────────────────────────────────────
-- No incluye las de administración ni las del jefe de obra a propósito: esos dos casos son un
-- booleano que la policy resuelve ANTES, con un initplan, sin tocar esta lista.
-- No lee `obra_canonica`: si lo hiciera, una policy de `obra_canonica` que la llame se estaría
-- llamando a sí misma.
create or replace function public.mis_obras()
returns setof text
language sql
stable
security definer
set search_path to 'public'
as $$
  select uo.obra_canonica_id
    from public.usuario_obra uo
   where uo.usuario_id = auth.uid()
  union
  select a.obra_id
    from public.obra_asignacion a
   where a.persona_id = public.mi_persona_id()
     and public.asignacion_vigente(a.desde, a.hasta)
$$;

comment on function public.mis_obras() is
  'Las obras atadas a la sesión (usuario_obra + obra_asignacion vigente), como conjunto. '
  'Existe para que una policy pregunte `id in (select mis_obras())` —un initplan hasheado— '
  'en vez de `ve_obra(id)`, que es una función security definer por cada fila de la tabla.';

-- ── LOS ALIAS DE ESAS OBRAS ─────────────────────────────────────────────────────────────────────
-- `costos_obra` no se ata a la obra por id sino por el TEXTO normalizado del Sheet. El alias vacío
-- queda afuera: `ve_obra_texto` devuelve `false` explícitamente para el texto vacío, y sin esta
-- exclusión un alias '' haría pasar toda fila sin obra.
create or replace function public.mis_alias_de_obra()
returns setof text
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.alias
    from public.obra_alias a
   where a.obra_id is not null
     and btrim(coalesce(a.alias, '')) <> ''
     and (public.es_administracion()
          or public.current_rol() = 'jefe_obra'
          or a.obra_id in (select public.mis_obras()))
$$;

comment on function public.mis_alias_de_obra() is
  'Los alias de `obra_alias` de las obras que la sesión puede ver. Es `ve_obra_texto` dado vuelta: '
  'en vez de preguntar por cada texto, publica el conjunto una sola vez.';

-- ── LAS TRES POLICIES ───────────────────────────────────────────────────────────────────────────

drop policy if exists obra_canonica_select on public.obra_canonica;
create policy obra_canonica_select on public.obra_canonica for select to authenticated using (
  (select public.es_administracion())
  or (select public.current_rol()) = 'jefe_obra'
  or id in (select public.mis_obras())
);

drop policy if exists obra_restriccion_select on public.obra_restriccion;
create policy obra_restriccion_select on public.obra_restriccion for select to authenticated using (
  (select public.es_administracion())
  or (select public.current_rol()) = 'jefe_obra'
  or obra_id in (select public.mis_obras())
);

drop policy if exists costos_obra_select on public.costos_obra;
create policy costos_obra_select on public.costos_obra for select to authenticated using (
  (select public.es_administracion())
  or public.norm_obra(obra_texto) in (select public.mis_alias_de_obra())
);

-- ── ASISTENCIA: EL MISMO DEFECTO, LA MISMA FORMA ────────────────────────────────────────────────
--
-- `asistencia_dia` y `asistencia_dia_retiro` son las dos únicas tablas del módulo cuyas policies
-- quedaron con las funciones DESNUDAS. Medido hoy (55 filas) son 6,8 ms — todavía no duele. Pero
-- son una fila por persona y por día: 80 personas × 250 días son 20.000 filas, y a los 0,12 ms por
-- fila que se midieron eso son 2,4 s de portero para dibujar una pantalla. Se corrige ahora, que
-- cuesta una migración, y no cuando la pantalla se caiga.
--
-- NO es la causa de los 13,9 s de `/administracion/personas?vista=asistencia` del 10/09 18:41: con
-- 55 filas no puede serlo. Esa medición está en el informe; esto es el defecto estructural que
-- estaba al lado.

drop policy if exists asistencia_dia_select on public.asistencia_dia;
create policy asistencia_dia_select on public.asistencia_dia for select to authenticated using (
  (select public.es_administracion()) or persona_id = (select public.mi_persona_id())
);

drop policy if exists asistencia_dia_update on public.asistencia_dia;
create policy asistencia_dia_update on public.asistencia_dia for update to authenticated
  using ((select public.es_administracion()))
  with check ((select public.es_administracion()));

drop policy if exists asistencia_dia_delete on public.asistencia_dia;
create policy asistencia_dia_delete on public.asistencia_dia for delete to authenticated using ((select public.es_administracion()));

drop policy if exists asistencia_dia_retiro_select on public.asistencia_dia_retiro;
create policy asistencia_dia_retiro_select on public.asistencia_dia_retiro for select to authenticated using (
  (select public.es_administracion()) or persona_id = (select public.mi_persona_id())
);

-- Las policies se evalúan con los privilegios de QUIEN CONSULTA: sin este grant la lectura moriría
-- con «permission denied for function». Y las tres se recrean con `to authenticated` porque así
-- estaban: un `create policy` sin `to` vale para PUBLIC, y eso las abriría también a `anon`.
grant execute on function public.mis_obras()         to authenticated, service_role;
grant execute on function public.mis_alias_de_obra() to authenticated, service_role;
