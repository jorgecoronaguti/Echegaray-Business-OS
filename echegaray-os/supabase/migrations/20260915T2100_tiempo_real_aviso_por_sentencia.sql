-- TIEMPO REAL: UN AVISO POR SENTENCIA, SIN DATOS DE FILAS.
--
-- El dueño (15/09/2026): «necesito que la plataforma app.ecsas.com.ar se actualice en tiempo real
-- cuando más de un usuario está editando cosas al mismo tiempo en ella».
--
-- ═══ POR QUÉ NO `postgres_changes` ═══
--
-- `postgres_changes` manda UN evento por FILA y Realtime vuelve a chequear la RLS de esa fila para
-- CADA suscriptor. El importador de horas mueve cientos de filas de `registros_hh` por hora: cientos
-- de filas × cada pestaña abierta, cada una con su consulta de RLS, sobre una base Small de 2 GB que
-- el 13/09 ya se cayó tres veces por carga. No se usa.
--
-- Acá cada SENTENCIA que escribe una tabla con pantalla manda un aviso de 40 bytes al tópico
-- `os:cambios`: `{tabla, op}`. Ningún dato de fila viaja. El navegador no muestra lo que llega: lo
-- usa como señal para volver a pedir la página al servidor (`router.refresh()`), y esa lectura pasa
-- por la misma RLS de siempre. El aviso no abre ninguna puerta a los datos.
--
-- ═══ UN AVISO POR TABLA POR TRANSACCIÓN ═══
--
-- Una transacción que hace 300 UPDATE sueltos sobre la misma tabla mandaría 300 avisos idénticos.
-- La marca `os_aviso.<tabla>` es LOCAL a la transacción (`set_config(…, true)`): el primer aviso la
-- pone y los siguientes la ven. Mandarlo al principio y no al final no adelanta nada: `realtime.send`
-- inserta en `realtime.messages`, y Realtime lo lee de la replicación, o sea recién al COMMIT. Si la
-- transacción aborta, el aviso se va con ella. Y deja UNA sola subtransacción (el bloque `exception`)
-- por tabla por transacción, no una por sentencia.
--
-- ═══ EL AVISO NUNCA ROMPE LA ESCRITURA ═══
--
-- Si Realtime no está, si `realtime.send` cambió de firma o si falla por lo que sea, la escritura del
-- usuario sigue: se deja un warning en el log y nada más. Una pantalla que se refresca sola es una
-- comodidad; una liquidación que no se guarda porque falló la comodidad es un incidente.
--
-- ═══ QUIÉN ESCUCHA ═══
--
-- `realtime.messages` tiene RLS activa y ninguna política: hoy nadie puede unirse a un canal privado.
-- Se agrega UNA: `authenticated` puede LEER el tópico `os:cambios` de la extensión broadcast. Ninguna
-- política de INSERT: un navegador no puede publicar avisos falsos en ese tópico. No se toca ninguna
-- otra RLS.
--
-- ═══ SE ENSAYA SIN BLOQUEAR LA APP ═══
--
-- `create trigger` toma SHARE ROW EXCLUSIVE en cada tabla: no frena lecturas, sí escrituras. Con
-- `lock_timeout` corto, si una tabla está ocupada la migración falla rápido en vez de encolar detrás
-- a todas las escrituras de la app (ver la memoria «DDL en horario del dueño traba la app»).

set local lock_timeout = '2s';

create or replace function public.avisar_cambio_de_tabla()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  marca text := 'os_aviso.' || tg_table_name;
begin
  if pg_catalog.current_setting(marca, true) is distinct from '1' then
    perform pg_catalog.set_config(marca, '1', true);
    begin
      perform realtime.send(
        pg_catalog.jsonb_build_object('tabla', tg_table_name, 'op', tg_op),
        'cambio',
        'os:cambios',
        true
      );
    exception when others then
      raise warning 'aviso de tiempo real no enviado (%): %', tg_table_name, sqlerrm;
    end;
  end if;
  return null;
end;
$fn$;

revoke all on function public.avisar_cambio_de_tabla() from public, anon, authenticated;

comment on function public.avisar_cambio_de_tabla() is
  'Trigger FOR EACH STATEMENT: avisa por Realtime (tópico os:cambios) que una tabla cambió. Sin datos '
  'de filas; un aviso por tabla por transacción; un fallo del aviso nunca hace fallar la escritura.';

-- LA LISTA ES EL CONTRATO CON EL NAVEGADOR. `src/shared/tiempo-real/tablas.ts` declara las mismas
-- tablas y un test compara las dos listas: una pantalla no puede declarar que depende de una tabla
-- que nunca avisa. Una tabla que no existe (o es una vista) se saltea: la cadena se reconstruye
-- desde una base vacía y no todas las bases tienen todo.
do $do$
declare
  t text;
begin
  foreach t in array array[
    -- TABLAS-CON-AVISO:inicio
    'analisis', 'analisis_linea', 'asistencia_dia', 'asistencia_marca',
    'certificado_cliente', 'certificados', 'cliente_acceso', 'cliente_actividad_portal',
    'cliente_contacto', 'cliente_documento', 'cliente_nota', 'clientes',
    'cobranza', 'cobranza_cambio', 'cobranzas',
    'compra_adjunto', 'compra_sheet', 'comprobante_entrada', 'comprobantes_arca',
    'convenio_escala', 'costo_hora_alicuota', 'cotizacion_partida', 'cotizaciones',
    'cuadrilla', 'cuadrilla_integrante', 'documentacion_legajo', 'documento_presentacion',
    'esquema_pago', 'herramientas', 'liquidacion_linea', 'liquidacion_quincena', 'liquidacion_reapertura',
    'movimientos_herramienta', 'obra_actividad', 'obra_actividad_nota', 'obra_actividad_paso',
    'obra_adjunto_cliente', 'obra_asignacion', 'obra_canonica', 'obra_dependencia', 'obra_documento',
    'obra_ejecucion', 'obra_ejecucion_equipo', 'obra_restriccion', 'pago_informado', 'pedidos_materiales',
    'persona_adelanto', 'persona_externa', 'persona_nota', 'persona_tarifa', 'persona_tarifa_correccion',
    'personas', 'proveedor_alias', 'proveedor_documento', 'proveedores', 'recurso', 'recurso_precio',
    'registro_hh_correccion', 'registros_hh', 'solicitud_correccion_asistencia', 'subcontrato',
    'subcontrato_alcance', 'subcontrato_aporte', 'subcontrato_documento', 'tarea_tipo', 'usuario_obra'
    -- TABLAS-CON-AVISO:fin
  ]
  loop
    if exists (
      select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind in ('r', 'p')
    ) then
      execute format('drop trigger if exists zz_avisar_cambio on public.%I', t);
      execute format(
        'create trigger zz_avisar_cambio after insert or update or delete on public.%I '
        'for each statement execute function public.avisar_cambio_de_tabla()', t);
    else
      raise notice 'tiempo real: public.% no es una tabla en esta base, sin aviso', t;
    end if;
  end loop;
end;
$do$;

do $do$
begin
  if to_regclass('realtime.messages') is null or to_regprocedure('realtime.topic()') is null then
    raise notice 'tiempo real: esta base no tiene realtime.messages, sin política';
    return;
  end if;
  execute 'drop policy if exists os_cambios_leer_autenticados on realtime.messages';
  execute $pol$
    create policy os_cambios_leer_autenticados on realtime.messages
      for select to authenticated
      using (realtime.topic() = 'os:cambios' and realtime.messages.extension = 'broadcast')
  $pol$;
end;
$do$;
