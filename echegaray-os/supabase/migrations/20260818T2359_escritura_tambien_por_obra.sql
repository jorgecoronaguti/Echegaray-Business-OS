-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA POLICY DE ESCRITURA ERA `FOR ALL`, Y `FOR ALL` INCLUYE SELECT
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ CÓMO APARECIÓ ═══
--
-- La migración anterior puso `obra_actividad_select using (ve_obra(obra_id))` y el chequeo manual dio
-- verde. El test de aceptación —`tests/autorizacion-por-obra.spec.ts`, que le pega a PostgREST con el
-- token del jefe de obra— lo puso en ROJO al día siguiente de escribirse:
--
--     obra_actividad?obra_id=eq.<obra ajena>  →  39 filas
--
-- La causa no se ve leyendo la policy de SELECT, porque no está ahí. Está en la de al lado:
--
--     create policy obra_actividad_write on obra_actividad FOR ALL
--       using (current_rol() = any (array['direccion','administracion','jefe_obra']))
--
-- `FOR ALL` en Postgres significa los CUATRO comandos, SELECT incluido. Y varias policies permisivas
-- sobre el mismo comando se combinan con OR. Entonces cualquier `jefe_obra` leía TODAS las filas por
-- la puerta de la escritura, sin importar lo que dijera la de lectura.
--
-- El comentario de la migración anterior decía, textual: *"La de ESCRITURA no se toca en esta
-- migración: ya exige rol"*. Exigir rol era cierto; lo que no era cierto es que sólo gobernara la
-- escritura. Es la misma familia de error que RLS ≠ GRANT: dos mecanismos que se leen parecido y
-- deciden cosas distintas.
--
-- ═══ LA CURA ═══
--
-- La escritura también se acota a la obra. No es sólo tapar la fuga de lectura: un jefe de obra
-- tampoco debe poder EDITAR el cronograma de una obra que no es suya, y hasta hoy podía.
--
-- `with check` además de `using`: `using` decide qué filas puede tocar, `with check` qué filas puede
-- DEJAR. Sin el segundo, un update podría mover una actividad a otra obra — escribir en la obra ajena
-- por la puerta de la propia.

-- obra_actividad — el cronograma.
drop policy if exists obra_actividad_write on public.obra_actividad;
create policy obra_actividad_write on public.obra_actividad for all to authenticated
  using (
    public.ve_obra(obra_id)
    and public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra'])
  )
  with check (
    public.ve_obra(obra_id)
    and public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra'])
  );

-- obra_asignacion — quién trabaja en la obra.
drop policy if exists obra_asignacion_write on public.obra_asignacion;
create policy obra_asignacion_write on public.obra_asignacion for all to authenticated
  using (
    public.ve_obra(obra_id)
    and public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra'])
  )
  with check (
    public.ve_obra(obra_id)
    and public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra'])
  );

-- obra_restriccion — los impedimentos.
drop policy if exists obra_restriccion_write on public.obra_restriccion;
create policy obra_restriccion_write on public.obra_restriccion for all to authenticated
  using (
    public.ve_obra(obra_id)
    and public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra'])
  )
  with check (
    public.ve_obra(obra_id)
    and public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra'])
  );

-- obra_documento — los vínculos a Drive de la obra.
drop policy if exists obra_documento_write on public.obra_documento;
create policy obra_documento_write on public.obra_documento for all to authenticated
  using (
    public.ve_obra(obra_id)
    and public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra'])
  )
  with check (
    public.ve_obra(obra_id)
    and public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra'])
  );

-- ── EL MISMO DEFECTO EN EL ÁREA ADMINISTRACIÓN ──────────────────────────────────────────────────
--
-- `clientes_write`, `cliente_contacto_write` y `cliente_documento_write` también son `FOR ALL`, pero
-- ahí NO hay fuga: su rol es `direccion|administracion`, que es exactamente quien puede leer. Se
-- dejan como están y se dice por qué — un cambio sin motivo en una policy es una superficie nueva.
--
-- `certificados` sí se revisa: su política de escritura tenía que quedar alineada con la de lectura,
-- que desde ayer exige nivel Administración.
drop policy if exists certificados_write on public.certificados;
create policy certificados_write on public.certificados for all to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

-- ── LA QUE FALTABA: `obra_dependencia` ──────────────────────────────────────────────────────────
--
-- El barrido que buscó otras policies `FOR ALL` con `jefe_obra` sin acotar a la obra encontró ésta
-- —las dependencias entre actividades del Gantt— con el mismo defecto Y con su SELECT todavía en
-- `true`. No la había visto ninguna de las dos migraciones anteriores porque la tabla no aparece en
-- ninguna pantalla todavía. Una tabla que nadie mira es donde un permiso se queda abierto por años.
drop policy if exists obra_dependencia_select on public.obra_dependencia;
create policy obra_dependencia_select on public.obra_dependencia for select to authenticated
  using (public.ve_obra(obra_id));

drop policy if exists obra_dependencia_write on public.obra_dependencia;
create policy obra_dependencia_write on public.obra_dependencia for all to authenticated
  using (
    public.ve_obra(obra_id)
    and public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra'])
  )
  with check (
    public.ve_obra(obra_id)
    and public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra'])
  );
