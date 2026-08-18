-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `usuario_obra_write` ERA `FOR ALL`, Y `FOR ALL` INCLUYE SELECT
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Es la cuarta vez que aparece este patrón en el módulo: `obra_actividad` (una fuga de 39 filas),
-- `obra_dependencia`, las cuatro tablas de Operación con `using (true)`, y ahora ésta.
--
-- Hoy no filtra de más —la policy de SELECT ya deja ver las filas propias y Administración ve
-- todas, y las permisivas se suman con OR—, así que esto NO es una fuga activa: es la trampa
-- armada. El día que alguien endurezca el SELECT, la `for all` va a seguir dejando pasar la lectura
-- a cualquiera con permiso de escritura y el endurecimiento va a ser cosmético sin que nadie lo note.
--
-- `usuario_obra` es la tabla de la que cuelga TODO el acceso por obra (`ve_obra()` la consulta en
-- cada fila de cada consulta del módulo). Es la última donde conviene dejar una policy que dice más
-- de lo que quiso decir.

drop policy if exists "usuario_obra_write" on public.usuario_obra;

create policy "usuario_obra_insert" on public.usuario_obra
  for insert to authenticated with check (public.es_administracion());

create policy "usuario_obra_update" on public.usuario_obra
  for update to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

create policy "usuario_obra_delete" on public.usuario_obra
  for delete to authenticated using (public.es_administracion());

grant select, insert, update, delete on public.usuario_obra to authenticated;
