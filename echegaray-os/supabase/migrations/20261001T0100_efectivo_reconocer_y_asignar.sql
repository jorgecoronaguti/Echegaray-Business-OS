-- EFECTIVO: RECONOCER UN TICKET A MANO, ASIGNAR CUALQUIER COMPRA YA CARGADA, Y RENDIR SIN FOTO DESDE EL CHAT
-- (dueño, 01/10/2026).
--
--   A · «no estoy conforme con lo hecho en módulo de efectivo porque quiero poder modificar todo como sea; por
--       ejemplo acá en el adjunto quiero reconocer ese gasto, dárselo por ok y listo» (ER-0021, un remito de
--       $5.000 que el bot no cargó porque el proveedor es nuevo y el papel no es una factura).
--   B · «no está contemplado el caso de que la compra haya sido cargada a través del canal del bot comprobantes
--       gastos y después asignársela a la rendición de una persona».
--   C · «gasto que se pagó en efectivo y no generó comprobante» y «pago a subcontratistas que se le imputa a
--       efectivo ya entregado», por el canal Efectivo del chat.
--
-- Una rendición SIGUE siendo siempre una fila de Compras. Lo que cambia es quién puede darla por buena y con
-- qué fila se ata:
--
--   A · `reconocer_comprobante_efectivo`: Administración escribe (o corrige) lo que dice el papel y lo da por
--       rendido. Es la rendición manual de la 20261001T0010 con la foto colgada: saca el ticket de la cola del
--       lector, cierra su fajo en espera y manda el gasto a Compras «A rendir» por el cargador de siempre.
--   B · `_efectivo_imputar_fila` sin la traba «sólo Efectivo»: se ata cualquier compra PAGADA, con cualquier
--       medio de pago, con o sin número de comprobante. La que ya dice «A rendir» se ata sin tocar el Sheet.
--       Una fila sin número no tiene clave: se ata por FILA (`compra_clave = 'f:<fila>'`, `fila = <fila>`).
--   C · `rendir_gasto_sin_foto_del_chat`: la puerta del bot (sin sesión, usuario explícito) al mismo gasto a mano.
--
-- DOS DEFECTOS DE LA 20261001T0010 QUE ESTO CIERRA (nunca llegaron a verse: no hay rendiciones manuales cargadas):
--   · borrar o corregir una manual ya escrita encolaba el cambio con la clave `m:<id>`, que Compras no conoce:
--     el worker lo rechazaba por `huella_distinta`. Ahora viaja la clave real de la fila (o NULL → por fila).
--   · anular una entrega o descartar un ticket con una manual adentro buscaba la fila por esa misma clave y
--     quedaba esperando un sync que nunca la iba a traer.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

set local lock_timeout = '5s';

-- ─── 0 · la idempotencia del chat y un permiso que sobraba ────────────────────────────────────────────────
alter table public.efectivo_rendicion add column if not exists clave_chat text;
comment on column public.efectivo_rendicion.clave_chat is
  'Rendición sin foto cargada desde el chat: `chat:<id del mensaje>`. El mismo mensaje reintentado no carga dos veces.';
grant select (clave_chat) on public.efectivo_rendicion to authenticated;
create unique index if not exists efectivo_rendicion_clave_chat_uq
  on public.efectivo_rendicion (clave_chat) where clave_chat is not null;

-- La 20261001T0010 la dejó con EXECUTE para PUBLIC (exige sesión adentro, pero el permiso no es de anon).
revoke all on function public.rendir_gasto_manual(uuid, date, numeric, text, text, text) from public, anon;
grant execute on function public.rendir_gasto_manual(uuid, date, numeric, text, text, text) to authenticated;

-- ─── 1 · EL GASTO A MANO, UNA SOLA VEZ ────────────────────────────────────────────────────────────────────
-- La pieza común de las tres puertas (app sin foto, ticket reconocido, chat). Los permisos los decide cada
-- puerta; acá viven las validaciones de la entrega y del gasto, el fajo y el vínculo.
--   p_extra  claves del comprobante que la puerta ya resolvió: numero, tipo, proveedor (del padrón: va a la
--            celda del proveedor), obra (gana a la de la entrega), concepto (ya armado), cuit.
--   p_item   lo que viaja al lado del comprobante: `origen` y `copias` (la foto del ticket reconocido).
create or replace function public._efectivo_cargar_gasto_a_mano(
  p_entrega uuid, p_usr uuid, p_fecha date, p_total numeric, p_concepto text,
  p_proveedor text default null, p_cuit text default null,
  p_extra jsonb default '{}'::jsonb, p_item jsonb default '{}'::jsonb,
  p_comprobante uuid default null, p_clave_chat text default null, p_post text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.efectivo_entrega;
  r public.efectivo_rendicion;
  v_rend uuid := gen_random_uuid();
  v_fajo uuid := gen_random_uuid();
  v_lote text := gen_random_uuid()::text;
  v_nombre text;
  v_concepto text := nullif(btrim(coalesce(p_concepto, '')), '');
  v_proveedor text := nullif(btrim(coalesce(p_proveedor, '')), '');
  v_cuit text := nullif(regexp_replace(coalesce(p_cuit, ''), '\D', '', 'g'), '');
  v_extra jsonb;
  v_obra text;
  v_texto text;
  v_comp jsonb;
  v_item jsonb;
begin
  if p_usr is null then raise exception 'falta quién lo carga' using errcode = '42501'; end if;
  -- EL MISMO MENSAJE DEL CHAT, REINTENTADO: devuelve lo ya hecho.
  if p_clave_chat is not null then
    select * into r from public.efectivo_rendicion where clave_chat = p_clave_chat;
    if r.id is not null then
      return jsonb_build_object('ya_estaba', true, 'rendicion', r.id, 'fajo', r.fajo_id, 'entrega_id', r.entrega_id,
        'codigo', (select codigo from public.efectivo_entrega where id = r.entrega_id), 'monto', r.monto,
        'persona', (select p.nombre_completo from public.efectivo_entrega en join public.personas p on p.id = en.persona_id where en.id = r.entrega_id),
        'en_su_poder', (select en_su_poder from public.efectivo_entrega_saldo where id = r.entrega_id));
    end if;
  end if;

  select * into e from public.efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'esa entrega no existe' using errcode = 'P0001'; end if;
  if e.anulada_en is not null or e.cerrada_en is not null then
    raise exception 'la entrega % está cerrada: no se le rinde más', e.codigo using errcode = 'P0001';
  end if;
  if coalesce(e.es_prueba, false) or public.persona_es_prueba(e.persona_id) then
    raise exception 'una entrega de prueba no se rinde' using errcode = 'P0001';
  end if;
  if p_fecha is null then raise exception 'poné la fecha del gasto' using errcode = 'P0001'; end if;
  if p_fecha > current_date + 1 then raise exception 'la fecha no puede ser futura' using errcode = 'P0001'; end if;
  if p_total is null or p_total <= 0 then raise exception 'el importe tiene que ser mayor que cero' using errcode = 'P0001'; end if;
  if v_concepto is null then raise exception 'escribí qué se pagó' using errcode = 'P0001'; end if;

  -- Sólo las claves conocidas, y sólo texto con algo adentro: lo demás no llega al Sheet.
  select coalesce(jsonb_object_agg(x.key, to_jsonb(btrim(x.value #>> '{}'))), '{}'::jsonb) into v_extra
    from jsonb_each(coalesce(p_extra, '{}'::jsonb)) x
   where x.key in ('numero', 'tipo', 'proveedor', 'obra', 'concepto', 'cuit')
     and jsonb_typeof(x.value) = 'string' and btrim(x.value #>> '{}') <> '';
  if v_cuit is null then v_cuit := nullif(regexp_replace(coalesce(v_extra ->> 'cuit', ''), '\D', '', 'g'), ''); end if;
  if v_cuit is not null and length(v_cuit) <> 11 then v_cuit := null; end if;

  select nombre into v_nombre from public.perfiles where id = p_usr;
  v_nombre := coalesce(nullif(btrim(v_nombre), ''), 'app');

  -- El proveedor escrito a mano NO va a la celda E (desplegable estricto): viaja en el concepto, igual que la
  -- libreta. El del padrón (`p_extra.proveedor`) sí va a su celda. «sin comprobante» sólo cuando no hay papel.
  v_texto := coalesce(v_extra ->> 'concepto',
    v_concepto
    || case when v_proveedor is not null and not (v_extra ? 'proveedor') then ' · ' || v_proveedor else '' end
    || case when p_comprobante is null then ' · sin comprobante' else '' end);
  v_comp := jsonb_build_object(
    'fecha', to_char(p_fecha, 'DD/MM/YYYY'),
    'concepto', v_texto,
    'total', round(p_total, 2),
    'formaPago', 'A rendir',
    'condicion', 'Contado',
    'pagado', round(p_total, 2));
  if v_cuit is not null then v_comp := v_comp || jsonb_build_object('cuit', v_cuit); end if;
  if v_extra ? 'obra' then
    -- El rótulo que acepta el desplegable de Compras, si la obra dicha es una obra canónica; si no, lo dicho.
    select public._efectivo_obra_para_compras(o.id) into v_obra
      from public.obra_canonica o where lower(o.nombre) = lower(v_extra ->> 'obra') limit 1;
    v_comp := v_comp || jsonb_build_object('obra', coalesce(v_obra, v_extra ->> 'obra'));
  elsif e.estructura then
    v_comp := v_comp || jsonb_build_object('unidad', 'Estructura');
  elsif e.obra_id is not null and public._efectivo_obra_para_compras(e.obra_id) is not null then
    v_comp := v_comp || jsonb_build_object('obra', public._efectivo_obra_para_compras(e.obra_id));
  end if;
  v_comp := v_comp || (v_extra - 'obra' - 'concepto' - 'cuit');

  v_item := jsonb_build_object(
      'origenCarga', 'libreta',
      'clave', 'm:' || v_rend::text,
      'postId', v_lote,
      'leidoEn', now(),
      'proveedorNuevo', false,
      'rendicionManual', v_rend,
      'comprobante', v_comp)
    || (select coalesce(jsonb_object_agg(x.key, x.value), '{}'::jsonb)
          from jsonb_each(coalesce(p_item, '{}'::jsonb)) x
         where x.key in ('origen', 'copias') and jsonb_typeof(x.value) in ('object', 'array'));

  insert into comunicacion.comprobante_fajos
    (id, plataforma, plataforma_user_id, plataforma_username, channel_id, root_post_id, post_ids, items,
     estado, intentos, proximo_intento_at, creado_at, ultimo_at)
  values
    (v_fajo, 'web', p_usr::text, v_nombre, v_lote, v_lote, '{}'::text[], jsonb_build_array(v_item),
     'reintento', 0, now(), now(), now());

  insert into public.efectivo_rendicion
    (id, entrega_id, compra_clave, monto, imputada_por, origen, fajo_id, fecha, concepto, proveedor,
     comprobante_id, clave_chat, origen_post_id)
  values
    (v_rend, e.id, 'm:' || v_rend::text, round(p_total, 2), p_usr, 'manual', v_fajo, p_fecha, v_concepto,
     coalesce(v_proveedor, v_extra ->> 'proveedor'), p_comprobante, p_clave_chat, p_post);

  return jsonb_build_object('ya_estaba', false, 'rendicion', v_rend, 'fajo', v_fajo, 'codigo', e.codigo,
    'entrega_id', e.id, 'monto', round(p_total, 2),
    'persona', (select nombre_completo from public.personas where id = e.persona_id),
    'en_su_poder', (select en_su_poder from public.efectivo_entrega_saldo where id = e.id));
end $$;
revoke all on function public._efectivo_cargar_gasto_a_mano(uuid, uuid, date, numeric, text, text, text, jsonb, jsonb, uuid, text, text)
  from public, anon, authenticated;

-- La puerta de la app (20261001T0010): misma firma, mismos permisos; el cuerpo es la pieza común.
create or replace function public.rendir_gasto_manual(
  p_entrega uuid, p_fecha date, p_total numeric, p_concepto text,
  p_proveedor text default null, p_cuit text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := auth.uid();
  v_persona uuid;
begin
  if v_usr is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  select persona_id into v_persona from public.efectivo_entrega where id = p_entrega;
  if not found then raise exception 'esa entrega no existe' using errcode = 'P0001'; end if;
  if not coalesce(public._efectivo_actua_por(v_persona), false) then
    raise exception 'sólo rinde quien tiene la entrega, o Administración' using errcode = '42501';
  end if;
  return public._efectivo_cargar_gasto_a_mano(p_entrega, v_usr, p_fecha, p_total, p_concepto, p_proveedor, p_cuit);
end $$;

-- ─── 2 · C · LA PUERTA DEL BOT ────────────────────────────────────────────────────────────────────────────
-- El bot escribe por la conexión directa, sin sesión: el usuario viaja explícito. Rinde el jefe de obra que tiene
-- la entrega; Dirección y Administración, por cualquiera. Idempotente por `p_clave` (`chat:<id del mensaje>`).
create or replace function public.rendir_gasto_sin_foto_del_chat(
  p_usuario uuid, p_entrega uuid, p_fecha date, p_total numeric, p_concepto text,
  p_proveedor text, p_comprobante jsonb, p_clave text, p_post text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pf record;
  v_persona uuid;
begin
  if p_clave is null or p_clave not like 'chat:%' or length(p_clave) < 6 then
    raise exception 'clave del mensaje inválida' using errcode = 'P0001';
  end if;
  select id, rol, persona_id into pf from public.perfiles where id = p_usuario;
  if pf.id is null then raise exception 'no encuentro el usuario que escribe' using errcode = '42501'; end if;
  select persona_id into v_persona from public.efectivo_entrega where id = p_entrega;
  if not found then raise exception 'esa entrega no existe' using errcode = 'P0001'; end if;
  -- 01/10/2026 (dueño): «sólo los usuarios con nivel jefe de obra y admin rinden gastos». El jefe, lo suyo;
  -- Dirección y Administración, lo de cualquiera. Un operario con una entrega no rinde: se la rinde Administración.
  if not (coalesce(pf.rol in ('direccion', 'administracion'), false)
          or (coalesce(pf.rol = 'jefe_obra', false) and coalesce(pf.persona_id = v_persona, false))) then
    raise exception 'sólo rinde el jefe de obra que tiene la entrega, o Administración' using errcode = '42501';
  end if;
  return public._efectivo_cargar_gasto_a_mano(
    p_entrega, p_usuario, p_fecha, p_total, p_concepto, p_proveedor, null, p_comprobante, '{}'::jsonb, null, p_clave, p_post);
end $$;
revoke all on function public.rendir_gasto_sin_foto_del_chat(uuid, uuid, date, numeric, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.rendir_gasto_sin_foto_del_chat(uuid, uuid, date, numeric, text, text, jsonb, text, text)
  to service_role;

-- ─── 3 · A · LO QUE EL LECTOR LEYÓ DEL TICKET ─────────────────────────────────────────────────────────────
-- Un ticket que quedó esperando (proveedor nuevo, remito, sin CUIT) no deja lo leído en `comprobante_entrada`:
-- vive en el ítem del fajo, que es tabla de `comunicacion`. Se busca por la foto (web) o por el post (canal).
create or replace function public._efectivo_fajo_del_ticket(p_comprobante uuid)
returns table (fajo_id uuid, estado text, item jsonb, posicion integer, items integer)
language sql stable security definer set search_path = public as $$
  select f.id, f.estado, it.value, (it.ordinality - 1)::integer, jsonb_array_length(f.items)
    from public.efectivo_comprobante c
    left join public.comprobante_entrada ce on ce.id = c.entrada_id
    join comunicacion.comprobante_fajos f
      on (ce.id is not null and (f.id = ce.fajo_id or (f.plataforma = 'web' and f.channel_id = ce.lote::text)))
      or (c.mm_post_id is not null and f.plataforma = 'mattermost' and c.mm_post_id = any (f.post_ids))
   cross join lateral jsonb_array_elements(coalesce(f.items, '[]'::jsonb)) with ordinality it(value, ordinality)
   where c.id = p_comprobante
     and it.value ->> 'rendicionManual' is null
     and ((ce.id is not null and (it.value #>> '{origen,fileId}' = ce.id::text
            or exists (select 1 from jsonb_array_elements(coalesce(it.value -> 'copias', '[]'::jsonb)) cp
                        where cp ->> 'fileId' = ce.id::text)))
       or (c.mm_post_id is not null and it.value ->> 'postId' = c.mm_post_id))
   -- El fajo VIVO primero: al mudarse un pendiente (flujo.mjs) el fajo viejo queda `descartado` con sus ítems
   -- adentro, y el mismo ticket vive en dos fajos. Cerrar el muerto y dejar el vivo lo cargaría después.
   order by (f.estado in ('descartado', 'cargado')), f.ultimo_at desc nulls last
   limit 1
$$;
revoke all on function public._efectivo_fajo_del_ticket(uuid) from public, anon, authenticated;

create or replace function public.lectura_del_ticket_efectivo(p_comprobante uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t record;
  k jsonb;
  v_fecha text;
begin
  perform public._efectivo_exigir_administracion();
  select * into t from public._efectivo_fajo_del_ticket(p_comprobante);
  if t.fajo_id is null then return null; end if;
  k := coalesce(t.item -> 'comprobante', '{}'::jsonb);
  v_fecha := k ->> 'fecha';
  return jsonb_strip_nulls(jsonb_build_object(
    'proveedor', nullif(btrim(coalesce(k ->> 'proveedor', '')), ''),
    'cuit', nullif(regexp_replace(coalesce(k ->> 'cuit', ''), '\D', '', 'g'), ''),
    'tipo', nullif(btrim(coalesce(k ->> 'tipo', '')), ''),
    'numero', nullif(btrim(coalesce(k ->> 'numero', '')), ''),
    'concepto', nullif(btrim(coalesce(k ->> 'concepto', '')), ''),
    'total', case when jsonb_typeof(k -> 'total') = 'number' then k -> 'total' end,
    'fecha', case when v_fecha ~ '^\d{2}/\d{2}/\d{4}$' then to_char(to_date(v_fecha, 'DD/MM/YYYY'), 'YYYY-MM-DD')
                  when v_fecha ~ '^\d{4}-\d{2}-\d{2}' then left(v_fecha, 10) end));
end $$;
revoke all on function public.lectura_del_ticket_efectivo(uuid) from public, anon;
grant execute on function public.lectura_del_ticket_efectivo(uuid) to authenticated;

-- ─── 4 · A · RECONOCER EL GASTO ───────────────────────────────────────────────────────────────────────────
create or replace function public.reconocer_comprobante_efectivo(
  p_comprobante uuid, p_fecha date, p_total numeric, p_concepto text,
  p_proveedor text default null, p_cuit text default null, p_numero text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  c public.efectivo_comprobante;
  t record;
  v_estado text;
  v_estado_fajo text;
  v_item jsonb := '{}'::jsonb;
  v_extra jsonb := '{}'::jsonb;
  v_res jsonb;
  v_vuelta integer;
begin
  select * into c from public.efectivo_comprobante where id = p_comprobante for update;
  if c.id is null then raise exception 'ese ticket no existe' using errcode = 'P0001'; end if;
  if c.descartado_en is not null then raise exception 'ese ticket está descartado: no se reconoce' using errcode = 'P0001'; end if;
  -- Por si el cargador lo escribió mientras la pantalla estaba abierta: reconocerlo encima lo rendiría dos veces.
  perform public.vincular_rendiciones_pendientes();
  select estado into v_estado from public.efectivo_comprobante_estado where id = c.id;
  if v_estado = 'en_compras' or exists (select 1 from public.efectivo_rendicion where comprobante_id = c.id) then
    raise exception 'ese ticket ya está rendido: corregilo desde la ficha de la entrega' using errcode = 'P0001';
  end if;

  -- EL FAJO QUE EL LECTOR DEJÓ ESPERANDO: se cierra, para que una respuesta tardía no lo cargue por segunda vez.
  -- El mismo ticket puede vivir en más de un fajo (uno mudado y su original): se cierran todos los vivos.
  for v_vuelta in 1..6 loop
    select * into t from public._efectivo_fajo_del_ticket(c.id);
    exit when t.fajo_id is null;
    select estado into v_estado_fajo from comunicacion.comprobante_fajos where id = t.fajo_id for update;
    if v_estado_fajo = 'confirmado' then
      raise exception 'ese ticket se está escribiendo en Compras ahora mismo: esperá un minuto y mirá de nuevo' using errcode = 'P0001';
    end if;
    if v_estado_fajo in ('cargado', 'encolado') then
      raise exception 'ese ticket ya salió hacia Compras: en unos minutos aparece rendido solo' using errcode = 'P0001';
    end if;
    if v_item = '{}'::jsonb then
      v_item := jsonb_strip_nulls(jsonb_build_object('origen', t.item -> 'origen', 'copias', t.item -> 'copias'));
    end if;
    exit when v_estado_fajo = 'descartado';
    if t.items <= 1 then
      -- Los ítems se conservan: es lo que `lectura_del_ticket_efectivo` vuelve a mostrar si esto se deshace.
      update comunicacion.comprobante_fajos
         set estado = 'descartado', error = 'reconocido a mano en la app', ultimo_at = now()
       where id = t.fajo_id;
    else
      update comunicacion.comprobante_fajos set items = items - t.posicion, ultimo_at = now() where id = t.fajo_id;
    end if;
  end loop;
  perform public._efectivo_sacar_de_la_cola(c.id, 'reconocido a mano por Administración');

  if nullif(btrim(coalesce(p_numero, '')), '') is not null then
    v_extra := jsonb_build_object('numero', btrim(p_numero));
  end if;
  v_res := public._efectivo_cargar_gasto_a_mano(
    c.entrega_id, v_usr, p_fecha, p_total, p_concepto, p_proveedor, p_cuit, v_extra, v_item, c.id, null, null);
  update public.efectivo_comprobante
     set confirmado_en = coalesce(confirmado_en, now()), confirmado_por = coalesce(confirmado_por, v_usr)
   where id = c.id;
  return v_res;
end $$;
comment on function public.reconocer_comprobante_efectivo(uuid, date, numeric, text, text, text, text) is
  'Administración da por rendido un ticket que el lector no cargó: lo saca de la cola, cierra su fajo en espera y '
  'manda el gasto a Compras «A rendir» con los datos escritos a mano. El saldo de la entrega baja en el acto.';
revoke all on function public.reconocer_comprobante_efectivo(uuid, date, numeric, text, text, text, text) from public, anon;
grant execute on function public.reconocer_comprobante_efectivo(uuid, date, numeric, text, text, text, text) to authenticated;

-- ─── 5 · BAJA DE UNA MANUAL: el cambio viaja con la clave REAL de la fila ─────────────────────────────────
-- Copia de la 20261001T0010 con una línea distinta: `clave` del cambio = la del espejo (NULL si la fila no
-- tiene número → el worker la prueba por proveedor/fecha/total/concepto), no `m:<id>`.
create or replace function public._efectivo_soltar_manual(p_rendicion uuid, p_motivo text, p_usr uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.efectivo_rendicion;
  f record;
  s record;
  v_nombre text;
begin
  perform public._efectivo_resolver_filas_manuales();
  select * into r from public.efectivo_rendicion where id = p_rendicion for update;
  if r.id is null then return; end if;
  select estado, error into f from comunicacion.comprobante_fajos where id = r.fajo_id for update;
  if r.fila is null then
    if f.estado = 'confirmado' then
      raise exception 'esa rendición se está escribiendo en Compras ahora mismo: esperá un minuto y volvé a intentar' using errcode = 'P0001';
    end if;
    if f.estado in ('cargado', 'encolado') then
      raise exception 'el gasto ya salió hacia Compras y su fila todavía no volvió al espejo: esperá el próximo sync (minutos) y volvé a intentar' using errcode = 'P0001';
    end if;
    -- reintento · error · abierto · descartado: la fila nunca se escribió. Se descarta el fajo y listo.
    update comunicacion.comprobante_fajos
       set estado = 'descartado', error = left('rendición borrada en la app: ' || coalesce(p_motivo, 'sin motivo'), 500), ultimo_at = now()
     where id = r.fajo_id and estado <> 'descartado';
    delete from public.efectivo_rendicion where id = p_rendicion;
    return;
  end if;
  select fila, clave, sheet_id, estado, anulada into s from public.compra_sheet where fila = r.fila limit 1;
  if s.fila is null then
    raise exception 'la fila % de Compras todavía no está en el espejo: esperá el próximo sync (minutos) y volvé a intentar', r.fila using errcode = 'P0001';
  end if;
  if not coalesce(s.anulada, false) then
    select nombre into v_nombre from public.perfiles where id = p_usr;
    insert into public.compra_obra_cambio
      (fila, clave, sheet_id, pestana, tipo, valor_anterior, valor_nuevo, origen, pedido_por, pedido_por_nombre)
    values
      (s.fila, s.clave, s.sheet_id, 'Compras', 'anular', s.estado, 'Cancelado', 'app', p_usr, v_nombre);
  end if;
  delete from public.efectivo_rendicion where id = p_rendicion;
end $$;
revoke all on function public._efectivo_soltar_manual(uuid, text, uuid) from public, anon, authenticated;

-- Descartar un ticket reconocido a mano: su rendición es manual y se suelta como manual.
create or replace function public.descartar_comprobante_rendicion(p_comprobante uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  r record;
  s record;
  v_nombre text;
begin
  if nullif(trim(p_motivo), '') is null then raise exception 'descartar pide el motivo' using errcode = 'P0001'; end if;
  select * into r from efectivo_rendicion where comprobante_id = p_comprobante;
  if r.id is not null and r.origen = 'manual' then
    perform public._efectivo_soltar_manual(r.id, trim(p_motivo), v_usr);
  elsif r.id is not null then
    select fila, sheet_id, estado, anulada into s from public.compra_sheet where clave = r.compra_clave limit 1;
    if s.fila is null then
      raise exception 'la fila de Compras del comprobante % todavía no está en el espejo: esperá el próximo sync', r.compra_clave
        using errcode = 'P0001';
    end if;
    select nombre into v_nombre from public.perfiles where id = v_usr;
    if not coalesce(s.anulada, false) then
      insert into public.compra_obra_cambio
        (fila, clave, sheet_id, pestana, tipo, valor_anterior, valor_nuevo, origen, pedido_por, pedido_por_nombre)
      values
        (s.fila, r.compra_clave, s.sheet_id, 'Compras', 'anular', s.estado, 'Cancelado', 'app', v_usr, v_nombre);
    end if;
    delete from efectivo_rendicion where id = r.id;
  end if;
  update efectivo_comprobante set descartado_en = now(), descartado_motivo = trim(p_motivo) where id = p_comprobante;
  if not found then raise exception 'el comprobante no existe' using errcode = 'P0001'; end if;
end $$;

-- ─── 6 · B · IMPUTAR CUALQUIER COMPRA PAGADA ──────────────────────────────────────────────────────────────
-- Copia de la 20260925T1000 sin la traba «sólo Efectivo» y sin exigir número:
--   · cualquier medio de pago, mientras la fila esté PAGADA (una sin pagar no se rinde: primero el pago);
--   · la que ya dice «A rendir» se ata sin encolar nada (no hay celda que cambiar);
--   · sin número de comprobante el vínculo es por fila: `compra_clave = 'f:<fila>'` y `fila`.
create or replace function public._efectivo_imputar_fila(p_entrega uuid, p_fila integer, p_clave text, p_usr uuid, p_origen text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.efectivo_entrega;
  s public.compra_sheet;
  v_otra text;
  v_cambio uuid;
  v_rend uuid;
  v_clave text;
  v_tipo text;
begin
  if p_origen not in ('reimputada', 'iniciales') then raise exception 'origen desconocido' using errcode = 'P0001'; end if;
  perform public._efectivo_resolver_filas_manuales();
  select * into e from public.efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if e.anulada_en is not null then raise exception '% está anulada: no se le imputa nada', e.codigo using errcode = 'P0001'; end if;
  if e.cerrada_en is not null then raise exception '% está cerrada: no se le imputa nada', e.codigo using errcode = 'P0001'; end if;
  if e.es_prueba or public.persona_es_prueba(e.persona_id) then
    raise exception '% es una prueba: sus gastos no van a Compras', e.codigo using errcode = 'P0001';
  end if;

  select * into s from public.compra_sheet where fila = p_fila for update;
  if s.fila is null then raise exception 'la fila % ya no está en Compras', p_fila using errcode = 'P0001'; end if;
  if s.clave is distinct from p_clave then
    raise exception 'la fila % cambió de comprobante mientras la mirabas: volvé a abrir la lista', p_fila using errcode = 'P0001';
  end if;
  if coalesce(s.anulada, false) then raise exception 'la fila % está anulada', p_fila using errcode = 'P0001'; end if;
  if coalesce(s.total, 0) <= 0 then raise exception 'la fila % no tiene Total: no hay nada que rendir', p_fila using errcode = 'P0001'; end if;
  if btrim(coalesce(s.estado, '')) <> 'Pagado' then
    raise exception 'la fila % no está pagada (dice «%»): registrá el pago en Compras y después imputala', p_fila, coalesce(nullif(btrim(s.estado), ''), 'sin estado')
      using errcode = 'P0001';
  end if;
  v_tipo := btrim(coalesce(s.tipo_pago, ''));
  v_clave := coalesce(s.clave, 'f:' || s.fila);
  -- LA MISMA FACTURA EN DOS FILAS: el vínculo es por clave, y atar una clave repetida sería rendir las dos.
  if s.clave is not null and (select count(*) from public.compra_sheet where clave = s.clave) > 1 then
    raise exception 'el comprobante de la fila % está en más de una fila de Compras: resolvé el duplicado primero', p_fila
      using errcode = 'P0001';
  end if;
  select en.codigo into v_otra from public.efectivo_rendicion r join public.efectivo_entrega en on en.id = r.entrega_id
   where r.compra_clave = v_clave or r.fila = s.fila limit 1;
  if v_otra is not null then
    raise exception 'la fila % ya está imputada a %', p_fila, v_otra using errcode = 'P0001';
  end if;

  if lower(v_tipo) = 'a rendir' then
    if exists (select 1 from public.compra_obra_cambio
                where fila = s.fila and tipo = 'pago' and estado in ('pendiente', 'procesando')) then
      raise exception 'la fila % de Compras ya tiene un pago esperando que el Sheet lo confirme: esperá a que se aplique y volvé', s.fila
        using errcode = 'P0001';
    end if;
  else
    v_cambio := public._efectivo_encolar_tipo_pago(s, 'A rendir', 'imputar ' || e.codigo, p_usr);
  end if;
  insert into public.efectivo_rendicion (entrega_id, compra_clave, monto, imputada_por, origen, cambio_id, tipo_pago_anterior, fila)
  values (e.id, v_clave, round(s.total::numeric, 2), p_usr, p_origen, v_cambio, s.tipo_pago, case when s.clave is null then s.fila end)
  returning id into v_rend;
  insert into public.efectivo_imputacion_registro
    (entrega_id, compra_clave, fila, monto, accion, tipo_pago_antes, tipo_pago_despues, cambio_id, hecho_por)
  values (e.id, v_clave, s.fila, round(s.total::numeric, 2), 'imputar', s.tipo_pago, 'A rendir', v_cambio, p_usr);
  return jsonb_build_object('rendicion', v_rend, 'cambio', v_cambio, 'codigo', e.codigo, 'fila', s.fila,
    'monto', round(s.total::numeric, 2), 'tipo_pago_anterior', s.tipo_pago);
end $$;
revoke all on function public._efectivo_imputar_fila(uuid, integer, text, uuid, text) from public, anon, authenticated;
comment on function public.imputar_compra_a_entrega(uuid, integer, text) is
  'Administración imputa a una entrega de efectivo una compra ya cargada y pagada, con cualquier medio de pago: '
  'encola Tipo pago «A rendir» (o la ata sin encolar si ya lo dice), el saldo baja y queda registro.';

-- Soltarla: la fila se busca por FILA cuando el vínculo es por fila, y no se encola un cambio que no cambia nada.
create or replace function public._efectivo_soltar_reimputada(p_rendicion uuid, p_usr uuid, p_motivo text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.efectivo_rendicion;
  s public.compra_sheet;
  c public.compra_obra_cambio;
  v_cambio uuid;
  v_antes text;
begin
  select * into r from public.efectivo_rendicion where id = p_rendicion for update;
  if r.id is null then raise exception 'esa imputación ya no existe' using errcode = 'P0001'; end if;
  if r.origen not in ('reimputada', 'iniciales') then
    raise exception 'esa fila la escribió un ticket de la entrega: se deshace descartando el comprobante' using errcode = 'P0001';
  end if;
  v_antes := coalesce(nullif(btrim(r.tipo_pago_anterior), ''), 'Efectivo');
  if r.cambio_id is not null then
    select * into c from public.compra_obra_cambio where id = r.cambio_id for update;
  end if;
  select * into s from public.compra_sheet
   where (r.fila is not null and fila = r.fila) or (r.fila is null and clave = r.compra_clave)
   order by fila limit 1 for update;
  if c.estado = 'procesando' then
    raise exception 'el worker está escribiendo esa fila en el Sheet justo ahora: probá de nuevo en un minuto' using errcode = 'P0001';
  end if;
  -- EL VÍNCULO SE SUELTA PRIMERO: mientras exista, la guarda de «Deshacer pago» no deja cancelar su pedido.
  delete from public.efectivo_rendicion where id = r.id;
  if c.estado = 'pendiente' then
    update public.compra_obra_cambio
       set estado = 'rechazado', motivo = 'cancelado desde la app antes de que el worker lo escribiera: ' || p_motivo
     where id = c.id;
    if s.fila is not null then update public.compra_sheet set tipo_pago = v_antes where fila = s.fila; end if;
  elsif c.estado = 'rechazado' or s.fila is null or coalesce(s.anulada, false) then
    -- El Sheet nunca dijo «A rendir», o la fila ya no está: no hay celda que devolver.
    null;
  elsif lower(btrim(coalesce(s.tipo_pago, ''))) = lower(v_antes) then
    -- Se ató sin tocar la celda (ya decía «A rendir»), o ya dice lo de antes: nada que escribir.
    null;
  else
    v_cambio := public._efectivo_encolar_tipo_pago(s, v_antes, 'desimputar', p_usr);
  end if;
  insert into public.efectivo_imputacion_registro
    (entrega_id, compra_clave, fila, monto, accion, tipo_pago_antes, tipo_pago_despues, cambio_id, hecho_por)
  values (r.entrega_id, r.compra_clave, coalesce(s.fila, r.fila, 0), r.monto, 'desimputar', 'A rendir', v_antes, v_cambio, p_usr);
  return v_antes;
end $$;
revoke all on function public._efectivo_soltar_reimputada(uuid, uuid, text) from public, anon, authenticated;

-- Anular la entrega: la manual se suelta como manual (antes quedaba esperando una clave que Compras no conoce).
create or replace function public._efectivo_cancelar_filas_rendidas(p_entrega uuid, p_motivo text, p_usr uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  s record;
  v_n integer := 0;
  v_nombre text;
begin
  select nombre into v_nombre from public.perfiles where id = p_usr;
  for r in select * from public.efectivo_rendicion where entrega_id = p_entrega loop
    if r.origen = 'manual' then
      perform public._efectivo_soltar_manual(r.id, 'la entrega se anuló: ' || trim(p_motivo), p_usr);
      v_n := v_n + 1;
      continue;
    end if;
    if r.origen in ('reimputada', 'iniciales') then
      perform public._efectivo_soltar_reimputada(r.id, p_usr, 'la entrega se anuló: ' || trim(p_motivo));
      v_n := v_n + 1;
      continue;
    end if;
    select fila, sheet_id, estado, anulada into s from public.compra_sheet where clave = r.compra_clave limit 1;
    if s.fila is null then
      raise exception 'la fila de Compras del comprobante % todavía no está en el espejo: esperá el próximo sync y volvé a anular', r.compra_clave
        using errcode = 'P0001';
    end if;
    if not coalesce(s.anulada, false) then
      insert into public.compra_obra_cambio
        (fila, clave, sheet_id, pestana, tipo, valor_anterior, valor_nuevo, origen, pedido_por, pedido_por_nombre)
      values
        (s.fila, r.compra_clave, s.sheet_id, 'Compras', 'anular', s.estado, 'Cancelado', 'app', p_usr, v_nombre);
      v_n := v_n + 1;
    end if;
    -- El ticket queda descartado con el motivo: la fila que produjo se cancela, y el vínculo se suelta.
    update public.efectivo_comprobante
       set descartado_en = coalesce(descartado_en, now()),
           descartado_motivo = coalesce(descartado_motivo, 'se canceló su fila de Compras: ' || trim(p_motivo))
     where id = r.comprobante_id;
    delete from public.efectivo_rendicion where id = r.id;
  end loop;
  return v_n;
end $$;
revoke all on function public._efectivo_cancelar_filas_rendidas(uuid, text, uuid) from public, anon, authenticated;

-- «Deshacer pago» de Compras no revierte una imputación: también cuando el vínculo es por fila.
create or replace function public._compra_pago_no_revierte_imputacion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo is distinct from 'pago' or (select auth.uid()) is null then return new; end if;
  if tg_op = 'UPDATE' then
    if old.estado = 'pendiente' and new.estado = 'rechazado'
       and exists (select 1 from public.efectivo_rendicion where cambio_id = old.id) then
      raise exception 'ese cambio es la imputación de la fila % a una entrega de efectivo: se deshace desde la ficha de la entrega, no desde Compras', old.fila
        using errcode = 'P0001';
    end if;
  elsif new.valor_nuevo = 'deshacer'
        and exists (select 1 from public.efectivo_rendicion
                     where origen in ('reimputada', 'iniciales')
                       and ((fila is not null and fila = new.fila) or (fila is null and compra_clave = new.clave))) then
    raise exception 'la fila % está imputada a una entrega de efectivo: se deshace desde la ficha de la entrega, no desde Compras', new.fila
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public._compra_pago_no_revierte_imputacion() from public, anon, authenticated;

-- ─── 7 · MODIFICACIÓN: la fila por FILA cuando el vínculo es por fila, y el cambio con la clave real ──────
-- Copia de la 20261001T0010 con tres diferencias: (1) la fila de una reimputada sin número se busca por
-- fila; (2) el cambio `detalle` viaja con la clave del espejo, no con `m:<id>` / `f:<fila>`; (3) mientras la
-- fila no existe, el concepto del fajo se rearma con la misma regla que al cargarlo.
create or replace function public.editar_rendicion_efectivo(
  p_rendicion uuid, p_monto numeric, p_entrega uuid, p_fecha date default null, p_concepto text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  r public.efectivo_rendicion;
  s record;
  f record;
  v_concepto text := nullif(btrim(coalesce(p_concepto, '')), '');
  v_nombre text;
  v_celdas jsonb := '{}'::jsonb;
  v_previo jsonb := '{}'::jsonb;
  v_items jsonb;
  v_texto text;
begin
  select * into r from public.efectivo_rendicion where id = p_rendicion for update;
  if r.id is null then raise exception 'esa rendición ya no existe' using errcode = 'P0001'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'el importe tiene que ser mayor que cero' using errcode = 'P0001'; end if;
  if to_jsonb(r) ->> 'adelanto_persona_id' is not null
     and (round(p_monto, 2) <> r.monto or (p_entrega is not null and p_entrega <> r.entrega_id)
          or p_fecha is not null or v_concepto is not null) then
    raise exception 'un adelanto de sueldo está sumado en Liquidación: se corrige quitándolo («Quitar») y cargándolo de nuevo' using errcode = 'P0001';
  end if;
  if p_entrega is not null and p_entrega <> r.entrega_id then
    if r.comprobante_id is not null then
      perform public._efectivo_mover_comprobante(r.comprobante_id, p_entrega);
    else
      if not exists (select 1 from public.efectivo_entrega where id = p_entrega and anulada_en is null) then
        raise exception 'la entrega de destino no existe o está anulada' using errcode = 'P0001';
      end if;
      update public.efectivo_rendicion set entrega_id = p_entrega where id = p_rendicion;
    end if;
  end if;
  update public.efectivo_rendicion set monto = round(p_monto, 2) where id = p_rendicion;

  if r.origen = 'manual' then
    perform public._efectivo_resolver_filas_manuales();
    select fila into r.fila from public.efectivo_rendicion where id = p_rendicion;
    update public.efectivo_rendicion
       set fecha = coalesce(p_fecha, fecha), concepto = coalesce(v_concepto, concepto)
     where id = p_rendicion;
    select r2.fecha, r2.concepto, r2.proveedor into s from public.efectivo_rendicion r2 where r2.id = p_rendicion;
    if r.fila is null then
      select estado, items into f from comunicacion.comprobante_fajos where id = r.fajo_id for update;
      if f.estado = 'confirmado' then
        raise exception 'esa rendición se está escribiendo en Compras ahora mismo: esperá un minuto y volvé a intentar' using errcode = 'P0001';
      end if;
      if f.estado in ('cargado', 'encolado') then
        raise exception 'el gasto ya salió hacia Compras y su fila todavía no volvió al espejo: esperá el próximo sync (minutos) y corregila desde ahí' using errcode = 'P0001';
      end if;
      -- La fila no existe: se corrige el ítem del fajo y, si había fallado, vuelve a la cola.
      v_items := f.items;
      v_items := jsonb_set(v_items, '{0,comprobante,total}', to_jsonb(round(p_monto, 2)));
      v_items := jsonb_set(v_items, '{0,comprobante,pagado}', to_jsonb(round(p_monto, 2)));
      v_items := jsonb_set(v_items, '{0,comprobante,fecha}', to_jsonb(to_char(s.fecha, 'DD/MM/YYYY')));
      if v_concepto is not null then
        v_texto := s.concepto
          || case when s.proveedor is not null and not (v_items #> '{0,comprobante}' ? 'proveedor') then ' · ' || s.proveedor else '' end
          || case when r.comprobante_id is null then ' · sin comprobante' else '' end;
        v_items := jsonb_set(v_items, '{0,comprobante,concepto}', to_jsonb(v_texto));
      end if;
      update comunicacion.comprobante_fajos
         set items = v_items, estado = 'reintento', error = null, proximo_intento_at = now(), ultimo_at = now()
       where id = r.fajo_id;
      return;
    end if;
    if p_fecha is null and v_concepto is null then return; end if;
    select fila, clave, sheet_id, fecha, concepto, anulada into s from public.compra_sheet where fila = r.fila limit 1;
    if s.fila is null then
      raise exception 'la fila % de Compras todavía no está en el espejo: esperá el próximo sync (minutos) y volvé a intentar', r.fila using errcode = 'P0001';
    end if;
  else
    if p_fecha is null and v_concepto is null then return; end if;
    -- Que la fila sea «A rendir» (la escribió el bot, no una persona) lo verifica el worker contra el Sheet vivo.
    select fila, clave, sheet_id, fecha, concepto, anulada into s from public.compra_sheet
     where (r.fila is not null and fila = r.fila) or (r.fila is null and clave = r.compra_clave)
     order by fila limit 1;
    if s.fila is null then
      raise exception 'la fila de Compras del comprobante % todavía no está en el espejo: esperá el próximo sync (minutos) y volvé a intentar', r.compra_clave
        using errcode = 'P0001';
    end if;
  end if;
  if coalesce(s.anulada, false) then raise exception 'la fila de Compras está cancelada: no se corrige' using errcode = 'P0001'; end if;
  if p_fecha is not null and p_fecha is distinct from s.fecha then
    v_celdas := v_celdas || jsonb_build_object('fecha', p_fecha);
    v_previo := v_previo || jsonb_build_object('fecha', s.fecha);
  end if;
  if v_concepto is not null and v_concepto is distinct from s.concepto then
    v_celdas := v_celdas || jsonb_build_object('concepto', v_concepto);
    v_previo := v_previo || jsonb_build_object('concepto', s.concepto);
  end if;
  if v_celdas = '{}'::jsonb then return; end if;   -- ya decía eso: no se encola un cambio vacío
  -- Dos correcciones pendientes de la misma fila se pisarían en el orden en que el worker las tome.
  if exists (select 1 from public.compra_obra_cambio
              where fila = s.fila and tipo = 'detalle' and estado in ('pendiente', 'procesando')) then
    raise exception 'esa fila ya tiene una corrección esperando al Sheet: esperá a que se aplique' using errcode = 'P0001';
  end if;
  select nombre into v_nombre from public.perfiles where id = v_usr;
  insert into public.compra_obra_cambio
    (fila, clave, sheet_id, pestana, tipo, celdas, previo, valor_anterior, valor_nuevo, origen, pedido_por, pedido_por_nombre)
  values
    (s.fila, s.clave, s.sheet_id, 'Compras', 'detalle', v_celdas, v_previo, v_previo::text, v_celdas::text, 'app', v_usr, v_nombre);
end $$;

-- ─── 8 · «A rendir» sin entrega: una fila atada por FILA no está suelta ───────────────────────────────────
create or replace view public.efectivo_a_rendir_sin_entrega with (security_invoker = true) as
select cs.fila, cs.clave, cs.fecha, cs.proveedor, cs.obra_texto, cs.total, cs.monto_pagado, cs.estado
  from public.compra_sheet cs
 where lower(trim(coalesce(cs.tipo_pago, ''))) = 'a rendir'
   and not coalesce(cs.anulada, false)
   and not exists (select 1 from public.efectivo_rendicion r
                    where r.compra_clave = cs.clave or r.fila = cs.fila);
grant select on public.efectivo_a_rendir_sin_entrega to authenticated;

-- ─── 11 · QUIÉN RINDE (dueño, 01/10/2026) ─────────────────────────────────────────────────────────────────
-- «Sólo los usuarios con nivel jefe de obra y admin rinden gastos, y admin tiene ABM de efectivo.» El ABM ya es
-- de Administración (`_efectivo_exigir_administracion` → `ve_economia`). Las puertas de rendir (foto, sin foto,
-- rehacer la foto, confirmar la lectura, responder una observación) pasan todas por acá: antes alcanzaba con
-- tener la entrega; ahora, además, hay que ser jefe de obra, Administración o Dirección (`es_administracion`).
create or replace function public._efectivo_actua_por(p_persona uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  -- coalesce: con `mi_persona_id()` NULL (un usuario sin persona) la comparación da NULL, `NULL or false` da NULL y
  -- `if not NULL` no levanta la excepción: la puerta quedaba ABIERTA justo para quien no tiene persona.
  select (coalesce(p_persona = public.mi_persona_id(), false) and coalesce(public.es_administracion(), false))
      or coalesce(public.ve_economia(), false)
$function$;
revoke all on function public._efectivo_actua_por(uuid) from public, anon;

-- ─── 12 · EL VINCULADOR NO DESCUENTA DOS VECES UN TICKET RECONOCIDO ───────────────────────────────────────
-- Copia de la definición vigente con una condición más (marcada 01/10/2026).
CREATE OR REPLACE FUNCTION public.vincular_rendiciones_pendientes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n integer;
  m integer := 0;
  i record;
  v_fila integer;
begin
  m := m + coalesce(public._efectivo_resolver_filas_manuales(), 0);
  insert into efectivo_rendicion (entrega_id, compra_clave, monto, imputada_por, comprobante_id)
  select distinct on (cc.clave) c.entrega_id, cc.clave, round(cc.total::numeric, 2),
         coalesce(c.enviado_por, e.entregada_por), c.id
    from efectivo_comprobante c
    join efectivo_entrega e on e.id = c.entrega_id and e.anulada_en is null
    left join comprobante_entrada ce on ce.id = c.entrada_id
    join comunicacion.comprobantes_cargados cc
      on (c.mm_post_id is not null and cc.plataforma = 'mattermost' and cc.post_id = c.mm_post_id)
      or (ce.id is not null and exists (
            select 1 from comunicacion.comprobante_fajos f
             where f.id = cc.fajo_id and f.plataforma = 'web' and f.channel_id = ce.lote::text))
   where c.descartado_en is null and cc.clave is not null and coalesce(cc.total, 0) > 0
     -- 01/10/2026: un ticket ya reconocido a mano tiene su rendición; si el lector igual lo cargó, no descuenta otra vez.
     and not exists (select 1 from efectivo_rendicion r0 where r0.comprobante_id = c.id)
   order by cc.clave, c.enviado_en
  on conflict (compra_clave) do nothing;
  get diagnostics n = row_count;
  for i in
    select ei.id, ei.entrega_id, ei.clave, ei.enviado_por, e.entregada_por, round(cc.total::numeric, 2) as total
      from efectivo_iniciales ei
      join efectivo_entrega e on e.id = ei.entrega_id and e.anulada_en is null
      join lateral (select total from comunicacion.comprobantes_cargados c2
                     where c2.clave = ei.clave and c2.fajo_id = ei.fajo_id order by c2.creado_at desc limit 1) cc on true
     where ei.estado = 'auto' and ei.vinculado_en is null and coalesce(cc.total, 0) > 0
  loop
    insert into efectivo_rendicion (entrega_id, compra_clave, monto, imputada_por, origen, tipo_pago_anterior)
    values (i.entrega_id, i.clave, i.total, coalesce(i.enviado_por, i.entregada_por), 'iniciales', 'Efectivo')
    on conflict (compra_clave) do nothing;
    update efectivo_iniciales set vinculado_en = now() where id = i.id;
    m := m + 1;
  end loop;
  for i in
    select ei.id, ei.entrega_id, ei.clave, coalesce(ei.respondido_por, ei.enviado_por) as usr
      from efectivo_iniciales ei
     where ei.estado = 'si' and ei.vinculado_en is null and ei.entrega_id is not null
  loop
    select fila into v_fila from compra_sheet where clave = i.clave order by fila limit 1;
    continue when v_fila is null;
    begin
      perform public._efectivo_imputar_fila(i.entrega_id, v_fila, i.clave, i.usr, 'iniciales');
      update efectivo_iniciales set vinculado_en = now() where id = i.id;
      m := m + 1;
    exception when others then
      if sqlerrm not like '%ya tiene un pago esperando%' then
        update efectivo_iniciales set estado = 'error', motivo = sqlerrm where id = i.id;
      end if;
    end;
  end loop;
  return n + m;
end $function$;


notify pgrst, 'reload schema';
