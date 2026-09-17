-- LA CACHÉ DE LA FICHA SE RENUEVA CADA ~8 MIN, NO CADA ~6 (17/09/2026).
--
-- Medido 16–17/09: el job `refrescar_ficha_cliente_cache` es la sentencia #1 de la base por tiempo total
-- (1.665 corridas, 1,9 s de media, 3.206 s). Lo que cuesta no es la frecuencia sino el vencimiento: con 5 min
-- cada combinación se recalcula cada ~6 min; las corridas sin nada vencido cuestan 0,12–0,17 s.
-- `ficha_cliente_cache_vigente` sirve filas de menos de 10 min (20260913T1500), así que alcanza con que
-- ninguna pase de 10: vencimiento 7 min + corrida cada 2 min → se renueva a los ~8 min, 2 min de margen
-- para una corrida que cede ante la app o corta a los 12 s. Recalcular baja ~25 % y las corridas, a la mitad.
-- Sólo cambia la antigüedad de lo servido dentro de la ventana que la ficha ya aceptaba.

CREATE OR REPLACE FUNCTION public.refrescar_ficha_cliente_cache(p_slug text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid     uuid;
  v_rpc     text;
  v_clave   text;
  v_solapa  text;
  v_json    jsonb;
  v_desde   timestamptz;
  v_inicio  timestamptz := clock_timestamp();
  v_n       integer := 0;
begin
  -- DOS LOTES A LA VEZ SON EL DOBLE DE CARGA PARA EL MISMO RESULTADO: el segundo no corre.
  if not pg_try_advisory_xact_lock(hashtext('public.refrescar_ficha_cliente_cache')) then
    return 0;
  end if;

  -- CEDE ANTE LA APP (sólo el cron; un refresco pedido por cliente es deliberado). Con 406 MB de RAM
  -- tres consultas activas ya son la app trabajando.
  if p_slug is null and (select count(*) from pg_stat_activity a
                          where a.state = 'active' and a.backend_type = 'client backend'
                            and a.pid <> pg_backend_pid()) > 3 then
    return 0;
  end if;

  -- UN PERFIL REAL DE DIRECCIÓN. Sin ninguno no hay con qué ojos calcular: no se llena nada y todo
  -- sigue en vivo, que es correcto y más lento, nunca incorrecto.
  select p.id into v_uid
    from public.perfiles p
   where p.rol = 'direccion' and p.es_prueba = false
   order by p.created_at, p.id
   limit 1;
  if v_uid is null then
    return 0;
  end if;

  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- Un cliente o una obra que ya no existen no dejan su caché servida.
  delete from public.ficha_cliente_cache c
   where (c.rpc = 'pantalla_cliente' and not exists (select 1 from public.clientes k where k.slug = c.clave))
      or (c.rpc = 'hh_de_obra' and not exists (select 1 from public.obra_canonica o where o.id = c.clave));

  for v_rpc, v_clave, v_solapa in
    select x.rpc, x.clave, x.solapa
      from (
        select 'pantalla_cliente'::text as rpc, k.slug as clave, s.solapa
          from public.clientes k
         cross join unnest(array['obras', 'ordenes', 'cobranzas', 'presupuestos', 'documentos', 'actividad'])
                 as s(solapa)
         where p_slug is null or k.slug = p_slug
        union all
        -- LAS OBRAS QUE LA FICHA LISTA: las que cuelgan de un cliente.
        select 'hh_de_obra', o.id, ''
          from public.obra_canonica o
          join public.clientes k on k.id = o.cliente_id
         where p_slug is null or k.slug = p_slug
      ) x
      left join public.ficha_cliente_cache c
        on c.rpc = x.rpc and c.clave = x.clave and c.solapa = x.solapa
     -- CON UN CLIENTE PEDIDO SE RECALCULA ENTERO; SIN CLIENTE, SÓLO LO QUE FALTA O VENCIÓ.
     where p_slug is not null or c.calculado_en is null
        -- 7 MIN (17/09/2026): con el cron cada 2 min la fila se renueva a los ~8 min; la ficha la sirve hasta 10.
        -- 8 no alcanza: la fila se guarda segundos después de arrancar la corrida y quedaría para la siguiente.
        or c.calculado_en < clock_timestamp() - interval '7 minutes'
     -- LO QUE FALTA PRIMERO (lo que alguien acaba de invalidar escribiendo); después, lo más viejo.
     order by (c.calculado_en is not null), c.calculado_en nulls first
  loop
    -- EL LOTE SE ESCALONA SOLO: lo que no entra en 12 s queda para el minuto siguiente.
    exit when p_slug is null and clock_timestamp() - v_inicio > interval '12 seconds';
    v_desde := clock_timestamp();
    begin
      set local role authenticated;
      if v_rpc = 'pantalla_cliente' then
        v_json := public.pantalla_cliente_en_vivo(v_clave, v_solapa) - 'perfil';
      else
        v_json := public.hh_de_obra_en_vivo(v_clave, null);
      end if;
      reset role;
    exception when others then
      -- UNA COMBINACIÓN QUE FALLA NO SE GUARDA NI TUMBA EL LOTE: su fila vieja vence y la pantalla
      -- calcula en vivo, que es lo que devolvería el error a quien de verdad pregunta.
      raise warning 'ficha_cliente_cache: % % % no se pudo calcular: %', v_rpc, v_clave, v_solapa, sqlerrm;
      continue;
    end;
    -- `null` = Dirección no ve esa obra o no existe: no hay nada que servir, calcula en vivo.
    continue when v_json is null;
    insert into public.ficha_cliente_cache as c (rpc, clave, solapa, json, calculado_en, rol_calculo, ms)
    values (v_rpc, v_clave, v_solapa, v_json, v_desde, 'direccion',
            (extract(epoch from clock_timestamp() - v_desde) * 1000)::integer)
    on conflict (rpc, clave, solapa) do update
       set json = excluded.json, calculado_en = excluded.calculado_en,
           rol_calculo = excluded.rol_calculo, ms = excluded.ms;
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$function$;

select cron.alter_job((select j.jobid from cron.job j where j.jobname = 'refrescar_ficha_cliente_cache'),
                      schedule := '*/2 * * * *');
