-- TIEMPO REAL PARA LA PANTALLA DE IMPUESTOS — las tres tablas de 20260916T2000 avisan cuando cambian.
--
-- Mismo mecanismo que 20260915T2100 (un aviso por sentencia, sin datos de filas) y la misma función
-- `avisar_cambio_de_tabla()`. Pueden llevar aviso porque el sincronizador NO borra y reinserta: hace
-- upsert por clave natural y borra sólo lo que desapareció de la fuente, así que una corrida que no
-- cambió nada sólo toca `sincronizado_en`, que es un sello y no avisa.
--
-- La lista va entre las mismas marcas que la migración original: `planDeRefresco.test.ts` junta las
-- listas de TODAS las migraciones marcadas y las compara con `src/shared/tiempo-real/tablas.ts`.

set local lock_timeout = '2s';

do $do$
declare
  t text;
begin
  foreach t in array array[
    -- TABLAS-CON-AVISO:inicio
    'impuesto_obligacion', 'impuesto_pago', 'impuesto_sincronizacion'
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
