-- LOS TICKETS DE PRUEBA TAMPOCO CUENTAN (auditoría de cierre, tercera vuelta, 22/09/2026).
--
-- La 2200 sacó las entregas de prueba de `efectivo_entrega_saldo`, pero `efectivo_comprobante_estado` no
-- filtraba: un ticket de una persona de prueba sumaría en «Por imputar» y en la campanita, apuntando a una
-- entrega que la lista ya no muestra — un contador que no se puede abrir. Hoy hay 0 tickets: esto cierra la
-- puerta antes de que entre alguno. Misma función `security definer` y mismo criterio que la 2200.
--
-- La vista se copia TAL CUAL de la 20260922T1500 (mismas columnas y mismo orden: recrear una vista con otras
-- columnas la rechaza Postgres) y sólo se le agrega el `where`.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.
create or replace view public.efectivo_comprobante_estado with (security_invoker = true) as
  select c.id, c.entrega_id, e.codigo as entrega, e.persona_id, c.canal, c.enviado_en,
         ce.storage_path, ce.nombre_archivo, ce.media_type, ce.estado as estado_cola, ce.motivo,
         ce.resultado, r.compra_clave, r.monto as monto_rendido,
         c.observacion, c.observado_en, c.respuesta, c.respondido_en, c.descartado_en, c.descartado_motivo,
         case
           when c.descartado_en is not null then 'descartado'
           when r.id is not null then 'en_compras'
           when c.observacion is not null and c.respondido_en is null then 'observado'
           when ce.estado in ('pendiente', 'procesando') then 'leyendo'
           when ce.estado = 'ya_estaba' then 'duplicado'
           when c.respondido_en is not null and ce.estado in ('en_espera', 'rechazado') then 'respondido'
           when ce.estado in ('en_espera', 'rechazado') then 'observado'
           when ce.estado = 'error' then 'error'
           when ce.estado = 'cargado' then 'leyendo'   -- escrito, falta el vínculo (lo pone el worker)
           else 'leyendo'
         end as estado
    from public.efectivo_comprobante c
    join public.efectivo_entrega e on e.id = c.entrega_id
    left join public.comprobante_entrada ce on ce.id = c.entrada_id
    left join lateral (
      select r.* from public.efectivo_rendicion r
       where r.entrega_id = c.entrega_id
         and (r.compra_clave = any (select x->>'clave' from jsonb_array_elements(coalesce(ce.resultado->'comprobantes', '[]'::jsonb)) x)
              or r.comprobante_id = c.id)
       limit 1) r on true
   where not public.persona_es_prueba(e.persona_id);
grant select on public.efectivo_comprobante_estado to authenticated;
notify pgrst, 'reload schema';
