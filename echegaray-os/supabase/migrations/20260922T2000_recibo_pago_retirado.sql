-- RECIBOS DE PAGO (20260922T1600): SE RETIRAN (22/09/2026).
--
-- El dueño no quiso un módulo aparte: «tiene q ser algo q aparezca al hacerle click al nombre de cada uno
-- [...] un boton q sea "recibo" y se tiene q abrir la opcion de ir armando lo q se quiere imprimir o guardar».
-- Eso se hizo en el panel de Liquidación (`cuadro/ArmarRecibo.tsx`) y no guarda nada en la base. Esta
-- tabla, sus funciones, su vista y su bucket quedaron sin consumidor. Al retirarlas: 0 recibos, 0 archivos.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.
do $$
begin
  if exists (select 1 from public.recibo_pago) then
    raise exception 'recibo_pago tiene filas: no se retira sin mirarlas';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'recibos') then
    raise exception 'el bucket recibos tiene archivos: no se retira sin mirarlos';
  end if;
end $$;

drop view if exists public.recibo_pago_estado;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('recibo_pago_desactualizado', '_recibo_exigir_liquidacion', 'emitir_recibos_pago',
                                '_recibo_firmable', 'firmar_recibo_pago', 'subir_papel_recibo_pago',
                                'archivar_recibo_pago', 'observar_recibo_pago')
  loop
    execute format('drop function %s cascade', f.firma);
  end loop;
end $$;
-- TABLAS-CON-AVISO:retirada 'recibo_pago'
drop table if exists public.recibo_pago cascade;

drop policy if exists recibos_sube on storage.objects;
drop policy if exists recibos_lee on storage.objects;
-- El bucket «recibos» (vacío) se borra por la API de Storage: la base no deja borrarlo por SQL.

notify pgrst, 'reload schema';
