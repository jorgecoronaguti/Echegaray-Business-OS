-- VUELTA ATRÁS DE 20260928T2330_ficha_cache_invalidacion_por_trigger.sql (28/09/2026).
--
-- Fuera de `supabase/migrations/` A PROPÓSITO: `aplicar-migracion.mjs` y `supabase db push` levantan
-- ese directorio, y una vuelta atrás que se aplica sola a continuación de la ida borra lo que la ida
-- acaba de crear. Se corre a mano, con el mismo orden que la ida: cron pausado, sincronizaciones
-- quietas, ensayo sin `--aplicar` y después `--aplicar`.
--
-- LAS TRES FUNCIONES QUE VUELVEN (`refrescar_ficha_cliente_cache(text)`, `ficha_cliente_cache_leer`,
-- `invalidar_ficha_cliente_cache`) son `pg_get_functiondef` de la base VIVA leído el 28/09, antes
-- de aplicar la ida: no una reconstrucción desde migraciones viejas, que podrían no ser lo que corre.
-- Sus permisos, los de `proacl` de esa misma lectura.
--
-- Qué queda: las filas de `ficha_cliente_cache` (la tabla es anterior). Qué se pierde: las marcas sin
-- consumir; da igual, el vencimiento de 20260917T1700 vuelve a ser la única vía.

set lock_timeout = '3s';

-- El cron vuelve a llamar a la función; mientras tanto está pausado (paso 1 de la ida).
select cron.alter_job(j.jobid, command := 'select public.refrescar_ficha_cliente_cache()')
  from cron.job j
 where j.jobname = 'refrescar_ficha_cliente_cache';

-- Los triggers primero: sin ellos, nada escribe en las tablas y funciones que se borran después.
drop trigger if exists trg_ficha_inv_al_commit on public.ficha_cliente_cache_tocada;
drop trigger if exists trg_ficha_inv on public.clientes;
drop trigger if exists trg_ficha_inv on public.cliente_contacto;
drop trigger if exists trg_ficha_inv on public.cliente_documento;
drop trigger if exists trg_ficha_inv on public.cliente_nota;
drop trigger if exists trg_ficha_inv on public.cliente_orden;
drop trigger if exists trg_ficha_inv on public.cotizaciones;
drop trigger if exists trg_ficha_inv on public.cliente_acceso;
drop trigger if exists trg_ficha_inv on public.certificado_cliente;
drop trigger if exists trg_ficha_inv on public.registros_hh;
drop trigger if exists trg_ficha_inv on public.certificados;
drop trigger if exists trg_ficha_inv on public.obra_contrato;
drop trigger if exists trg_ficha_inv on public.obra_carpeta_drive;
drop trigger if exists trg_ficha_inv on public.obra_restriccion;
drop trigger if exists trg_ficha_inv on public.obra_canonica;
drop trigger if exists trg_ficha_inv on public.obra_asignacion;
drop trigger if exists trg_ficha_inv on public.subcontrato;
drop trigger if exists trg_ficha_inv on public.costo_obra_quincena;
drop trigger if exists trg_ficha_inv on public.perfiles;
drop trigger if exists trg_ficha_inv on public.persona_tarifa;
drop trigger if exists trg_ficha_inv on public.costo_hora_alicuota;
drop trigger if exists trg_ficha_inv on public.obra_alias;
drop trigger if exists trg_ficha_inv on public.drive_index;
drop trigger if exists trg_ficha_inv on public.liquidacion_linea;
drop trigger if exists trg_ficha_inv on public.liquidacion_quincena;
drop trigger if exists trg_ficha_inv on public.recibo_sueldo_linea;
drop trigger if exists trg_ficha_inv on public.convenio_escala;
drop trigger if exists trg_ficha_inv on public.calendario_no_laborable;
drop trigger if exists trg_ficha_inv on public.presupuestos;
drop trigger if exists trg_ficha_inv on public.proveedores;
drop trigger if exists trg_ficha_inv on public.proveedor_alias;
drop trigger if exists trg_ficha_inv on public.cliente_alias;
drop trigger if exists trg_ficha_inv on public.personas;
drop trigger if exists trg_ficha_inv on public.compra_sheet;
drop trigger if exists trg_ficha_inv on public.compra_obra_asignada;
drop trigger if exists trg_ficha_inv on public.cobranzas;
drop trigger if exists trg_ficha_inv on public.costos_obra;
drop trigger if exists trg_ficha_inv on public.obra_papel;
drop trigger if exists trg_ficha_inv on public.obra_economia_sheet;
drop trigger if exists trg_ficha_inv on public.jornales_bloque_persona;

drop procedure if exists public.refrescar_ficha_cliente_cache();
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
revoke all on function public.refrescar_ficha_cliente_cache(text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ficha_cliente_cache_leer(p_rpc text, p_clave text, p_solapa text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.json || jsonb_build_object('cache_calculado_en', c.calculado_en)
    from public.ficha_cliente_cache c
   where c.rpc = p_rpc
     and c.clave = p_clave
     and c.solapa = p_solapa
     and c.calculado_en > now() - interval '10 minutes'
     and c.rol_calculo = public.current_rol()
     and not public.sesion_es_de_prueba()
$function$;
revoke all on function public.ficha_cliente_cache_leer(text, text, text) from public, anon;
grant execute on function public.ficha_cliente_cache_leer(text, text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.invalidar_ficha_cliente_cache(p_cliente_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from public.ficha_cliente_cache c
   where public.ve_economia()
     and (p_cliente_id is null
          or (c.rpc = 'pantalla_cliente'
              and c.clave = (select k.slug from public.clientes k where k.id = p_cliente_id))
          or (c.rpc = 'hh_de_obra'
              and c.clave in (select o.id from public.obra_canonica o where o.cliente_id = p_cliente_id)))
$function$;
revoke all on function public.invalidar_ficha_cliente_cache(uuid) from public, anon;
grant execute on function public.invalidar_ficha_cliente_cache(uuid) to authenticated;

-- Recién ahora: la lectura y la invalidación de arriba ya no las llaman.
drop function if exists public.tr_ficha_inv_fila();
drop function if exists public.tr_ficha_inv_marcar();
drop function if exists public.tr_ficha_inv_comparar();
drop function if exists public.ficha_cliente_cache_huellas(text);
drop function if exists public.ficha_cliente_cache_marcar(text[]);
drop function if exists public.ficha_cliente_cache_marcada(text, text);
drop function if exists public.ficha_cliente_cache_consumir();
drop function if exists public.ficha_cliente_cache_calcular(uuid, text, text, text);
drop function if exists public.ficha_cliente_cache_vigencia();

drop table if exists public.ficha_cliente_cache_pendiente;
drop table if exists public.ficha_cliente_cache_tocada;
drop table if exists public.ficha_cliente_cache_huella;
drop table if exists public.ficha_cliente_cache_cedida;

notify pgrst, 'reload schema';
