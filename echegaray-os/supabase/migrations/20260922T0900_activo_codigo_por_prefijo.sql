-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · EL CÓDIGO DE CADA ACTIVO SALE DE SU NOMBRE (AMO-001), GUIADO Y NUNCA LIBRE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pedido del dueño, 22/09/2026, textual: «quiero q la codificacion respete otro tipo de codigo, por lo
-- menos las primeras tres letras de cada herram o equipo y se pueda editar pero q te vaya guiando en
-- esto no este abierto a poner cualquier cosa».
--
-- ═══ LA REGLA ═══
--   · Formato único: tres letras A–Z, guion, número de 3 (o 4) cifras. AMO-001. La base rechaza otro.
--   · Las tres letras se derivan del nombre (sin acentos, sin espacios ni números): «Amoladora» → AMO.
--   · El número lo asigna la base: el siguiente libre de ese prefijo. Nadie lo tipea.
--   · Editar = elegir otras tres letras (Careta comparte CAR con Carretilla → CRT). La base asigna el
--     número. Un código completo tipeado sólo se acepta si respeta el formato y está libre.
--   · Un código que se reemplaza queda en `activo_codigo_anterior`: una etiqueta ya pegada sigue
--     abriendo la ficha (activo_por_codigo) y el número no se reutiliza nunca.
--
-- Al aplicarse ninguna etiqueta estaba impresa (etiqueta_impresa_en null en los 184): recodificar
-- no deja ningún QR pegado apuntando a la nada, y los HER-/ROD- quedan igual como códigos anteriores.

create table public.activo_codigo_anterior (
  codigo          text primary key,
  activo_id       uuid not null references public.activo(id),
  reemplazado_en  timestamptz not null default now(),
  reemplazado_por uuid references auth.users(id)
);
create index activo_codigo_anterior_activo_idx on public.activo_codigo_anterior (activo_id);
alter table public.activo_codigo_anterior enable row level security;
create policy activo_codigo_anterior_select on public.activo_codigo_anterior for select to authenticated using (true);
revoke all on public.activo_codigo_anterior from anon, public;
grant select on public.activo_codigo_anterior to authenticated;

-- Las tres letras de un nombre. Sin extensiones: los acentos se traducen a mano.
create function public.prefijo_de_nombre(p_nombre text) returns text
language sql immutable set search_path = public as $$
  select rpad(left(regexp_replace(
           translate(upper(coalesce(p_nombre, '')), 'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇ', 'AAAAEEEEIIIIOOOOUUUUNC'),
           '[^A-Z]', '', 'g'), 3), 3, 'X')
$$;

-- El siguiente código libre de un prefijo, contando también los códigos ya usados alguna vez.
create function public._siguiente_codigo(p_prefijo text) returns text
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if p_prefijo !~ '^[A-Z]{3}$' then
    raise exception 'el prefijo son exactamente tres letras, sin acentos ni números (por ejemplo AMO)';
  end if;
  perform pg_advisory_xact_lock(hashtext('activo_codigo:' || p_prefijo));
  select coalesce(max(substring(c from 5)::int), 0) + 1 into v_n
    from (select codigo as c from activo union all select codigo from activo_codigo_anterior) x
   where c ~ ('^' || p_prefijo || '-[0-9]{3,4}$');
  if v_n > 9999 then raise exception 'el prefijo % ya no tiene números libres', p_prefijo; end if;
  return p_prefijo || '-' || lpad(v_n::text, 3, '0');
end $$;

-- Lo que la pantalla usa para guiar: qué prefijo sugiere un nombre y cómo quedaría el código.
-- No reserva el número: el alta o el cambio lo vuelven a calcular bajo candado.
create function public.sugerir_codigo_activo(p_nombre text default null, p_prefijo text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_pre text := coalesce(nullif(upper(btrim(p_prefijo)), ''), public.prefijo_de_nombre(p_nombre)); v_n int;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  if v_pre !~ '^[A-Z]{3}$' then
    return jsonb_build_object('valido', false, 'prefijo', v_pre,
      'motivo', 'el prefijo son exactamente tres letras, sin acentos ni números');
  end if;
  select coalesce(max(substring(c from 5)::int), 0) + 1 into v_n
    from (select codigo as c from activo union all select codigo from activo_codigo_anterior) x
   where c ~ ('^' || v_pre || '-[0-9]{3,4}$');
  return jsonb_build_object('valido', true, 'prefijo', v_pre,
    'sugerido_del_nombre', public.prefijo_de_nombre(p_nombre),
    'codigo', v_pre || '-' || lpad(v_n::text, 3, '0'),
    'usados_con_ese_prefijo', (select count(*) from activo where codigo like v_pre || '-%'));
end $$;

-- Normaliza lo que alguien propone: tres letras → el siguiente de ese prefijo; código completo → sólo
-- si respeta el formato y nunca se usó. Cualquier otra cosa se rechaza diciendo qué se espera.
create function public._codigo_propuesto(p_propuesto text, p_nombre text) returns text
language plpgsql security definer set search_path = public as $$
declare v text := upper(btrim(coalesce(p_propuesto, '')));
begin
  if v = '' then return public._siguiente_codigo(public.prefijo_de_nombre(p_nombre)); end if;
  if v ~ '^[A-Z]{3}$' then return public._siguiente_codigo(v); end if;
  if v ~ '^[A-Z]{3}-[0-9]{1,4}$' then
    v := left(v, 4) || lpad(substring(v from 5), 3, '0');
    if exists (select 1 from activo where codigo = v) or exists (select 1 from activo_codigo_anterior where codigo = v) then
      raise exception 'el código % ya está usado: elegí sólo las tres letras y el número lo pone el sistema', v;
    end if;
    return v;
  end if;
  raise exception 'código no válido: «%». Son tres letras y un número, por ejemplo AMO-001', p_propuesto;
end $$;

-- Recodificación de lo que ya existe: por prefijo, en el orden en que se cargó.
insert into public.activo_codigo_anterior (codigo, activo_id, reemplazado_en)
  select codigo, id, now() from public.activo;
update public.activo a set codigo = n.nuevo
  from (select id, public.prefijo_de_nombre(nombre) || '-' ||
               lpad(row_number() over (partition by public.prefijo_de_nombre(nombre) order by creado_en, codigo)::text, 3, '0') as nuevo
          from public.activo) n
 where n.id = a.id;

alter table public.activo add constraint activo_codigo_formato_chk check (codigo ~ '^[A-Z]{3}-[0-9]{3,4}$');

-- El alta: misma firma, ahora con el código guiado.
create or replace function public.dar_de_alta_activo(
  p_clase text, p_nombre text, p_ubicacion uuid default null, p_categoria text default null,
  p_codigo text default null, p_patente text default null, p_alta_desde_obra boolean default false,
  p_foto_url text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_codigo text; v_id uuid;
begin
  if p_clase not in ('herramienta', 'equipo', 'rodado') then raise exception 'clase no válida'; end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then raise exception 'falta el nombre'; end if;
  v_codigo := public._codigo_propuesto(p_codigo, p_nombre);
  insert into activo (codigo, clase, nombre, categoria, patente, alta_desde_obra, foto_url, creado_por, estado_por)
  values (v_codigo, p_clase, btrim(p_nombre), nullif(btrim(p_categoria), ''), nullif(upper(btrim(p_patente)), ''),
          p_alta_desde_obra, p_foto_url, v_usr, v_usr)
  returning id into v_id;
  if p_clase = 'rodado' then insert into ubicacion (tipo, activo_id) values ('rodado', v_id); end if;
  if p_ubicacion is not null then
    insert into activo_movimiento (activo_id, origen_id, destino_id, usuario_id, nota)
    values (v_id, null, p_ubicacion, v_usr, 'alta');
    update activo set ubicacion_id = p_ubicacion where id = v_id;
  end if;
  return v_id;
end $$;

-- Cambiar el código: tres letras (el número lo pone la base) o un código completo libre. El viejo
-- queda como anterior y la etiqueta vuelve a la cola de impresión.
create function public.cambiar_codigo_activo(p_activo uuid, p_codigo text) returns text
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_act activo%rowtype; v_nuevo text;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el activo no existe'; end if;
  if v_act.estado = 'baja' then raise exception '% está dado de baja', v_act.codigo; end if;
  if upper(btrim(coalesce(p_codigo, ''))) in (v_act.codigo, left(v_act.codigo, 3)) then return v_act.codigo; end if;
  v_nuevo := public._codigo_propuesto(p_codigo, v_act.nombre);
  insert into activo_codigo_anterior (codigo, activo_id, reemplazado_por) values (v_act.codigo, p_activo, v_usr);
  update activo set codigo = v_nuevo, etiqueta_impresa_en = null where id = p_activo;
  return v_nuevo;
end $$;

-- El QR o el código tipeado → el activo, también por un código anterior.
create function public.activo_por_codigo(p_codigo text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from activo where codigo = upper(btrim(p_codigo))),
    (select activo_id from activo_codigo_anterior where codigo = upper(btrim(p_codigo))))
  where auth.uid() is not null
$$;

drop sequence if exists public.activo_codigo_her;
drop sequence if exists public.activo_codigo_equ;
drop sequence if exists public.activo_codigo_rod;

revoke all on function public.prefijo_de_nombre(text), public._siguiente_codigo(text),
  public.sugerir_codigo_activo(text, text), public._codigo_propuesto(text, text),
  public.cambiar_codigo_activo(uuid, text), public.activo_por_codigo(text) from public, anon;
grant execute on function public.prefijo_de_nombre(text), public.sugerir_codigo_activo(text, text),
  public.cambiar_codigo_activo(uuid, text), public.activo_por_codigo(text) to authenticated;

-- ═══ DE LA AUDITORÍA DE CIERRE (22/09) ═══
-- «Taller y almacén son UN solo lugar» lo cuidaba sólo la pantalla: `crear_ubicacion` aceptaba
-- p_tipo = 'taller' y cualquier sesión podía llamarla directo por PostgREST y crear un segundo Taller.
-- Ahora lo dice la base dos veces: la función no crea talleres y un índice único impide un segundo.
create unique index ubicacion_un_solo_taller on public.ubicacion ((true)) where tipo = 'taller' and not archivada;

create or replace function public.crear_ubicacion(p_tipo text, p_nombre text, p_contacto text default null) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  perform public._activo_usuario();
  if p_tipo not in ('servicio_tecnico', 'tercero') then
    raise exception 'sólo se crean servicios técnicos y terceros: el Taller es uno solo, una obra sale del índice de obras y un rodado, del rodado';
  end if;
  insert into ubicacion (tipo, nombre, contacto) values (p_tipo, btrim(p_nombre), nullif(btrim(p_contacto), ''))
  returning id into v_id;
  return v_id;
end $fn$;

comment on view public.herramientas is
  'COMPATIBILIDAD (sólo lectura) sobre activo: herramientas Y equipos (todo menos rodados), con las columnas de la tabla vieja. Consumidores viejos: costos por obra, operación de obra, imputación, campo. Lo nuevo lee activo.';

do $$
declare n_mal int; n_rep int; n_ant int;
begin
  select count(*) into n_mal from public.activo where codigo !~ '^[A-Z]{3}-[0-9]{3,4}$';
  select count(*) - count(distinct codigo) into n_rep from public.activo;
  select count(*) into n_ant from public.activo_codigo_anterior;
  if n_mal > 0 or n_rep > 0 then raise exception 'recodificación: % códigos fuera de formato, % repetidos', n_mal, n_rep; end if;
  if n_ant <> (select count(*) from public.activo) then raise exception 'no quedaron guardados todos los códigos anteriores'; end if;
  raise notice 'recodificados % activos en % prefijos', n_ant, (select count(distinct left(codigo, 3)) from public.activo);
end $$;
