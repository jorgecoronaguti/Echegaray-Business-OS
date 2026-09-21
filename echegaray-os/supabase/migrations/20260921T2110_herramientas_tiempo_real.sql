-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · TIEMPO REAL — el aviso de cambio en las cuatro tablas del módulo
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Va DESPUÉS de 20260921T2100 (que crea las tablas) y la aplica el dueño, igual que aquella. Separada
-- para no tocar el contrato de la etapa 1: esto sólo agrega los triggers de aviso de 20260915T2100.
--
-- Por qué hace falta: desde 20260921T2100, `herramientas` y `movimientos_herramienta` son VISTAS; una
-- vista no emite eventos, y los triggers viejos quedaron en las tablas *_legado, que ya no cambian.
-- Sin esto, lo que mueve el jefe desde el teléfono no aparece en la pantalla de la oficina hasta que
-- alguien recarga.
--
-- Nadie borra y reinserta estas tablas (toda escritura es por las funciones del módulo), así que el
-- aviso por sentencia avisa sólo cuando una persona cambió algo. La lista entre marcas la lee
-- `planDeRefresco.test.ts` y tiene que coincidir con `src/shared/tiempo-real/tablas.ts`.
do $do$
declare
  t text;
begin
  foreach t in array array[
    -- TABLAS-CON-AVISO:inicio
    'activo', 'activo_movimiento', 'activo_incidencia', 'ubicacion'
    -- TABLAS-CON-AVISO:fin
  ]
  loop
    if exists (
      select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind in ('r', 'p')
    ) then
      execute format('drop trigger if exists zz_avisar_insert on public.%I', t);
      execute format('drop trigger if exists zz_avisar_update on public.%I', t);
      execute format('drop trigger if exists zz_avisar_delete on public.%I', t);
      execute format(
        'create trigger zz_avisar_insert after insert on public.%I referencing new table as nuevas '
        'for each statement execute function public.avisar_cambio_de_tabla()', t);
      execute format(
        'create trigger zz_avisar_update after update on public.%I referencing old table as viejas new table as nuevas '
        'for each statement execute function public.avisar_cambio_de_tabla()', t);
      execute format(
        'create trigger zz_avisar_delete after delete on public.%I referencing old table as viejas '
        'for each statement execute function public.avisar_cambio_de_tabla()', t);
    else
      raise notice 'tiempo real: public.% no es una tabla en esta base, sin aviso', t;
    end if;
  end loop;
end;
$do$;

-- PostgREST recarga su caché de esquema: sin esto, los primeros minutos contesta PGRST205.
notify pgrst, 'reload schema';
