-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · ETAPA 1 — activo, ubicación, movimiento, incidencia
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Diseño «Herramientas · el módulo entero» (21/09/2026) con las correcciones del dueño, textuales:
--   · «no se usa appsheet, no hay uso de nada actualmente, solo esta el listado de herram»
--   · «todos los niveles de usuario con permisos iguales»
--   · «respetar indice de obras y clientes»  → una ubicación de obra ES una fila de obra_canonica
--   · «todo debe funcionar por bd nada de sheet»
--   · «las obras q esten inactivas poner las herramientas en taller»
--
-- ═══ CUATRO COSAS QUE NO SE MEZCLAN ═══
-- Cliente ≠ Obra ≠ Ubicación ≠ Estado. La obra (y por ella el cliente) sale del índice de obras; la
-- ubicación es dónde está el activo HOY; el estado es si sirve. Mover no cambia el estado; reportar
-- un problema no cambia la ubicación.
--
-- ═══ LA ÚNICA PUERTA DE ESCRITURA SON LAS FUNCIONES ═══
-- Las tablas nuevas tienen RLS con SELECT para todo usuario logueado y NINGUNA policy de escritura:
-- sólo escriben las funciones `security definer` de abajo. Así la ubicación sólo cambia insertando un
-- movimiento (nunca un UPDATE suelto) y un activo en baja no se mueve más, lo intente quien lo intente.
-- Permisos iguales para todos los niveles: la función sólo exige un usuario logueado.
--
-- ═══ LO VIEJO ═══
-- `herramientas` y `movimientos_herramienta` pasan a llamarse *_legado y en su lugar quedan VISTAS de
-- sólo lectura sobre el modelo nuevo, con las mismas columnas: obras, costos, imputación y campo las
-- siguen leyendo sin cambios hasta que se migren. Lo que escribía en ellas (el sync del Sheet y la RPC
-- `registrar_movimiento_herramienta`) deja de existir: el sync se quita del timer en el mismo corte.
--
-- NO SE APLICA DESDE UN AGENTE. La aplica el dueño (aplicar-migracion.mjs la envuelve en su transacción).

-- ── UBICACIÓN ───────────────────────────────────────────────────────────────────────────────────
create table public.ubicacion (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('taller', 'obra', 'rodado', 'servicio_tecnico', 'tercero')),
  -- Taller y almacén son UN solo lugar (dueño, 21/09: «no dividas taller de almacen»): no hay tipo depósito.
  -- Taller, servicio técnico y tercero tienen nombre propio. Obra y rodado NO: su nombre sale
  -- de la obra (índice) o del activo (patente), para que no existan dos versiones del mismo nombre.
  nombre      text check (nombre is null or length(btrim(nombre)) between 2 and 120),
  obra_id     text references public.obra_canonica(id),
  activo_id   uuid,                                  -- FK más abajo: activo y ubicación se apuntan
  contacto    text check (contacto is null or length(contacto) <= 200),
  archivada   boolean not null default false,
  creado_en   timestamptz not null default now(),
  constraint ubicacion_obra_chk   check ((tipo = 'obra') = (obra_id is not null)),
  constraint ubicacion_rodado_chk check ((tipo = 'rodado') = (activo_id is not null)),
  constraint ubicacion_nombre_chk check (tipo in ('obra', 'rodado') or nombre is not null),
  constraint ubicacion_obra_uq    unique (obra_id),
  constraint ubicacion_rodado_uq  unique (activo_id)
);
comment on table public.ubicacion is
  'Dónde puede estar un activo. Tipo obra = una fila de obra_canonica (el índice de obras); tipo rodado = un activo clase rodado.';

-- ── ACTIVO ──────────────────────────────────────────────────────────────────────────────────────
create sequence public.activo_codigo_her;
create sequence public.activo_codigo_equ;
create sequence public.activo_codigo_rod;

create table public.activo (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null unique check (length(btrim(codigo)) between 3 and 40),
  clase               text not null check (clase in ('herramienta', 'equipo', 'rodado')),
  nombre              text not null check (length(btrim(nombre)) between 2 and 160),
  categoria           text check (categoria is null or length(categoria) <= 60),
  patente             text unique check (patente is null or length(patente) <= 20),
  numero_serie        text check (numero_serie is null or length(numero_serie) <= 80),
  foto_url            text,
  compra_fecha        date,
  compra_precio       numeric(14, 2) check (compra_precio is null or compra_precio >= 0),
  compra_proveedor_id uuid references public.proveedores(id),
  -- null = «sin ubicación cargada». Vacío no es cero: no se inventa un lugar.
  ubicacion_id        uuid references public.ubicacion(id),
  estado              text not null default 'operativo'
                      check (estado in ('operativo', 'requiere_mantenimiento', 'fuera_servicio', 'reparacion_externa', 'baja')),
  estado_nota         text check (estado_nota is null or length(estado_nota) <= 400),
  estado_desde        timestamptz not null default now(),
  estado_por          uuid references auth.users(id),
  -- Lo importado entra Operativo sin que nadie lo haya mirado: se declara como asumido.
  estado_asumido      boolean not null default false,
  baja_motivo         text check (baja_motivo in ('robada', 'perdida', 'descartada', 'vendida')),
  baja_detalle        text check (baja_detalle is null or length(baja_detalle) <= 400),
  baja_en             timestamptz,
  baja_por            uuid references auth.users(id),
  alta_desde_obra     boolean not null default false,   -- administración la revisa
  etiqueta_impresa_en timestamptz,
  legado_id           text unique,                      -- id del listado viejo (herramientas.id_herramienta / equipos.id)
  creado_en           timestamptz not null default now(),
  creado_por          uuid references auth.users(id),
  constraint activo_baja_chk check ((estado = 'baja') = (baja_motivo is not null and baja_en is not null)),
  constraint activo_patente_chk check (clase = 'rodado' or patente is null)
);
create index activo_ubicacion_idx on public.activo (ubicacion_id) where estado <> 'baja';
comment on table public.activo is
  'Herramientas, equipos y rodados. La ubicación sólo cambia por mover_activos(); el estado por reportar_problema_activo/cambiar_estado_activo/dar_de_baja_activo.';

alter table public.ubicacion
  add constraint ubicacion_activo_fk foreign key (activo_id) references public.activo(id);

-- ── MOVIMIENTO ──────────────────────────────────────────────────────────────────────────────────
create table public.activo_movimiento (
  id            uuid primary key default gen_random_uuid(),
  activo_id     uuid not null references public.activo(id),
  origen_id     uuid references public.ubicacion(id),       -- null = alta, u origen desconocido (importado)
  destino_id    uuid not null references public.ubicacion(id),
  fecha_hora    timestamptz not null default now(),
  usuario_id    uuid references auth.users(id),
  usuario_texto text,                                        -- el «responsable» del listado viejo
  lote_id       uuid,                                        -- varios activos movidos de una vez
  nota          text check (nota is null or length(nota) <= 400),
  corrige_a     uuid references public.activo_movimiento(id),
  importado     boolean not null default false,
  legado_id     text unique,
  constraint activo_mov_distinto_chk check (origen_id is distinct from destino_id)
);
create index activo_movimiento_activo_idx on public.activo_movimiento (activo_id, fecha_hora desc);
create index activo_movimiento_fecha_idx on public.activo_movimiento (fecha_hora desc);
comment on table public.activo_movimiento is
  'El libro de movimientos. No se borra ni se edita: se corrige con otro movimiento (corrige_a).';

-- ── INCIDENCIA (reportar un problema) ───────────────────────────────────────────────────────────
create table public.activo_incidencia (
  id                uuid primary key default gen_random_uuid(),
  activo_id         uuid not null references public.activo(id),
  tipo              text not null check (tipo in ('fallando', 'no_anda', 'no_encontrada')),
  texto             text check (texto is null or length(texto) <= 400),
  foto_url          text,
  ubicacion_id      uuid references public.ubicacion(id),  -- dónde estaba al reportarlo (no se mueve)
  estado_resultante text not null,
  usuario_id        uuid references auth.users(id),
  creado_en         timestamptz not null default now(),
  cerrada_en        timestamptz,
  cerrada_por       uuid references auth.users(id),
  cierre_nota       text check (cierre_nota is null or length(cierre_nota) <= 400)
);
create index activo_incidencia_abierta_idx on public.activo_incidencia (activo_id) where cerrada_en is null;

-- ── RLS: leer todos, escribir nadie (sólo las funciones) ────────────────────────────────────────
alter table public.ubicacion          enable row level security;
alter table public.activo             enable row level security;
alter table public.activo_movimiento  enable row level security;
alter table public.activo_incidencia  enable row level security;
create policy ubicacion_select         on public.ubicacion         for select to authenticated using (true);
create policy activo_select            on public.activo            for select to authenticated using (true);
create policy activo_movimiento_select on public.activo_movimiento for select to authenticated using (true);
create policy activo_incidencia_select on public.activo_incidencia for select to authenticated using (true);
revoke all on public.ubicacion, public.activo, public.activo_movimiento, public.activo_incidencia from anon, public;
grant select on public.ubicacion, public.activo, public.activo_movimiento, public.activo_incidencia to authenticated;

-- ═══ FUNCIONES ═════════════════════════════════════════════════════════════════════════════════

create function public._activo_usuario() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  return auth.uid();
end $$;

-- La ubicación de una obra del índice: se crea la primera vez que se la usa. Una obra fusionada se
-- resuelve a la que la absorbió.
create function public.ubicacion_de_obra(p_obra_id text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_obra text; v_id uuid;
begin
  perform public._activo_usuario();
  select coalesce(fusionada_en, id) into v_obra from obra_canonica where id = p_obra_id;
  if v_obra is null then raise exception 'la obra % no está en el índice de obras', p_obra_id; end if;
  select id into v_id from ubicacion where obra_id = v_obra;
  if v_id is null then
    insert into ubicacion (tipo, obra_id) values ('obra', v_obra)
    on conflict (obra_id) do nothing returning id into v_id;
    if v_id is null then select id into v_id from ubicacion where obra_id = v_obra; end if;
  end if;
  return v_id;
end $$;

create function public.crear_ubicacion(p_tipo text, p_nombre text, p_contacto text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._activo_usuario();
  if p_tipo not in ('taller', 'servicio_tecnico', 'tercero') then
    raise exception 'una ubicación de obra sale del índice de obras y la de un rodado, del rodado';
  end if;
  insert into ubicacion (tipo, nombre, contacto) values (p_tipo, btrim(p_nombre), nullif(btrim(p_contacto), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Mover uno o varios activos. El origen no se pide: es donde cada uno está hoy.
-- p_bajar_carga: al mover un rodado, lo que lleva encima baja en el lugar de donde sale el rodado
-- (false = viaja con él, y sigue «en» el rodado).
create function public.mover_activos(
  p_activos uuid[], p_destino uuid, p_nota text default null, p_bajar_carga boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._activo_usuario();
  v_lote uuid := gen_random_uuid();
  v_dest ubicacion%rowtype;
  v_act record;
  v_ubic_rodado uuid;
  v_carga record;
  v_movidos int := 0;
begin
  if coalesce(array_length(p_activos, 1), 0) = 0 then raise exception 'no hay activos para mover'; end if;
  select * into v_dest from ubicacion where id = p_destino;
  if not found then raise exception 'el destino no existe'; end if;
  if v_dest.archivada then raise exception 'el destino está archivado'; end if;
  if v_dest.tipo = 'obra' and not exists (select 1 from obra_canonica where id = v_dest.obra_id and estado = 'activa') then
    raise exception 'la obra de destino no está activa';
  end if;
  if v_dest.tipo = 'rodado' and exists (select 1 from activo where id = v_dest.activo_id and estado = 'baja') then
    raise exception 'el rodado de destino está dado de baja';
  end if;

  for v_act in select * from activo where id = any(p_activos) order by codigo for update loop
    if v_act.estado = 'baja' then raise exception '% está dado de baja: no se mueve más', v_act.codigo; end if;
    if v_dest.tipo = 'rodado' and v_dest.activo_id = v_act.id then
      raise exception '% no puede moverse adentro de sí mismo', v_act.codigo;
    end if;
    continue when v_act.ubicacion_id is not distinct from p_destino;   -- ya está ahí

    insert into activo_movimiento (activo_id, origen_id, destino_id, usuario_id, lote_id, nota)
    values (v_act.id, v_act.ubicacion_id, p_destino, v_usr, v_lote, nullif(btrim(p_nota), ''));
    update activo set ubicacion_id = p_destino where id = v_act.id;
    v_movidos := v_movidos + 1;

    -- La carga de un rodado que se mueve.
    if v_act.clase = 'rodado' and p_bajar_carga and v_act.ubicacion_id is not null then
      select id into v_ubic_rodado from ubicacion where activo_id = v_act.id;
      for v_carga in select id from activo where ubicacion_id = v_ubic_rodado and estado <> 'baja' for update loop
        insert into activo_movimiento (activo_id, origen_id, destino_id, usuario_id, lote_id, nota)
        values (v_carga.id, v_ubic_rodado, v_act.ubicacion_id, v_usr, v_lote, 'bajó del rodado ' || v_act.codigo);
        update activo set ubicacion_id = v_act.ubicacion_id where id = v_carga.id;
      end loop;
    end if;
  end loop;

  if v_movidos = 0 then return null; end if;
  return v_lote;
end $$;

-- Reportar un problema: cambia el estado, NUNCA la ubicación. «No la encuentro» no da de baja.
create function public.reportar_problema_activo(
  p_activo uuid, p_tipo text, p_texto text default null, p_foto_url text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_act activo%rowtype; v_estado text; v_id uuid;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el activo no existe'; end if;
  if v_act.estado = 'baja' then raise exception '% está dado de baja', v_act.codigo; end if;
  v_estado := case p_tipo
    when 'fallando' then 'requiere_mantenimiento'
    when 'no_anda' then 'fuera_servicio'
    when 'no_encontrada' then v_act.estado
    else null end;
  if v_estado is null then raise exception 'tipo de problema desconocido: %', p_tipo; end if;
  -- Un activo en reparación externa no vuelve a «requiere mantenimiento» porque alguien lo reporte.
  if v_act.estado = 'reparacion_externa' then v_estado := v_act.estado; end if;

  insert into activo_incidencia (activo_id, tipo, texto, foto_url, ubicacion_id, estado_resultante, usuario_id)
  values (p_activo, p_tipo, nullif(btrim(p_texto), ''), p_foto_url, v_act.ubicacion_id, v_estado, v_usr)
  returning id into v_id;
  if v_estado <> v_act.estado then
    update activo set estado = v_estado, estado_nota = nullif(btrim(p_texto), ''), estado_desde = now(),
                      estado_por = v_usr, estado_asumido = false
     where id = p_activo;
  end if;
  return v_id;
end $$;

-- Cambio de estado explícito («Marcar operativa», «Enviar a servicio técnico»…). La baja tiene su función.
create function public.cambiar_estado_activo(p_activo uuid, p_estado text, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_act activo%rowtype;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el activo no existe'; end if;
  if v_act.estado = 'baja' then raise exception '% está dado de baja', v_act.codigo; end if;
  if p_estado not in ('operativo', 'requiere_mantenimiento', 'fuera_servicio', 'reparacion_externa') then
    raise exception 'estado no válido: % (la baja es dar_de_baja_activo)', p_estado;
  end if;
  update activo set estado = p_estado, estado_nota = nullif(btrim(p_nota), ''), estado_desde = now(),
                    estado_por = v_usr, estado_asumido = false
   where id = p_activo;
  -- Volver a operativo cierra lo que estaba reportado.
  if p_estado = 'operativo' then
    update activo_incidencia set cerrada_en = now(), cerrada_por = v_usr, cierre_nota = coalesce(nullif(btrim(p_nota), ''), 'marcada operativa')
     where activo_id = p_activo and cerrada_en is null;
  end if;
end $$;

-- Baja: la única acción que no se deshace. Sale del inventario vivo, no se borra, no se mueve más.
create function public.dar_de_baja_activo(p_activo uuid, p_motivo text, p_detalle text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_act activo%rowtype;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el activo no existe'; end if;
  if v_act.estado = 'baja' then raise exception '% ya está dado de baja', v_act.codigo; end if;
  if p_motivo not in ('robada', 'perdida', 'descartada', 'vendida') then raise exception 'motivo de baja no válido'; end if;
  if v_act.clase = 'rodado' and exists (
    select 1 from activo a join ubicacion u on u.id = a.ubicacion_id where u.activo_id = p_activo and a.estado <> 'baja'
  ) then
    raise exception 'el rodado todavía lleva activos encima: bajalos antes de darlo de baja';
  end if;
  update activo set estado = 'baja', baja_motivo = p_motivo, baja_detalle = nullif(btrim(p_detalle), ''),
                    baja_en = now(), baja_por = v_usr, estado_desde = now(), estado_por = v_usr
   where id = p_activo;
  update ubicacion set archivada = true where activo_id = p_activo;
  update activo_incidencia set cerrada_en = now(), cerrada_por = v_usr, cierre_nota = 'dado de baja'
   where activo_id = p_activo and cerrada_en is null;
end $$;

-- Alta. El código se asigna solo (HER-0001 / EQU-0001 / ROD-0001) salvo que se escanee una etiqueta
-- ya pegada. El alta es un movimiento sin origen.
create function public.dar_de_alta_activo(
  p_clase text, p_nombre text, p_ubicacion uuid default null, p_categoria text default null,
  p_codigo text default null, p_patente text default null, p_alta_desde_obra boolean default false,
  p_foto_url text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_codigo text; v_id uuid;
begin
  if p_clase not in ('herramienta', 'equipo', 'rodado') then raise exception 'clase no válida'; end if;
  v_codigo := nullif(upper(btrim(p_codigo)), '');
  if v_codigo is null then
    v_codigo := case p_clase
      when 'herramienta' then 'HER-' || lpad(nextval('activo_codigo_her')::text, 4, '0')
      when 'equipo'      then 'EQU-' || lpad(nextval('activo_codigo_equ')::text, 4, '0')
      else                    'ROD-' || lpad(nextval('activo_codigo_rod')::text, 4, '0') end;
  end if;
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

-- Datos que no tocan ni ubicación ni estado (nombre, categoría, foto, compra, serie, etiqueta).
create function public.editar_activo(p_activo uuid, p_datos jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._activo_usuario();
  update activo set
    nombre              = coalesce(nullif(btrim(p_datos->>'nombre'), ''), nombre),
    categoria           = case when p_datos ? 'categoria' then nullif(btrim(p_datos->>'categoria'), '') else categoria end,
    foto_url            = case when p_datos ? 'foto_url' then nullif(p_datos->>'foto_url', '') else foto_url end,
    numero_serie        = case when p_datos ? 'numero_serie' then nullif(btrim(p_datos->>'numero_serie'), '') else numero_serie end,
    compra_fecha        = case when p_datos ? 'compra_fecha' then nullif(p_datos->>'compra_fecha', '')::date else compra_fecha end,
    compra_precio       = case when p_datos ? 'compra_precio' then nullif(p_datos->>'compra_precio', '')::numeric else compra_precio end,
    compra_proveedor_id = case when p_datos ? 'compra_proveedor_id' then nullif(p_datos->>'compra_proveedor_id', '')::uuid else compra_proveedor_id end,
    patente             = case when p_datos ? 'patente' and clase = 'rodado' then nullif(upper(btrim(p_datos->>'patente')), '') else patente end,
    etiqueta_impresa_en = case when (p_datos->>'etiqueta_impresa')::boolean then now() else etiqueta_impresa_en end,
    alta_desde_obra     = case when (p_datos->>'revisada')::boolean then false else alta_desde_obra end
  where id = p_activo;
  if not found then raise exception 'el activo no existe'; end if;
end $$;

-- Regla del dueño (21/09): la obra que deja de estar activa manda sus herramientas al Taller.
create function public._activos_de_obra_inactiva_al_taller() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ubic uuid; v_taller uuid; v_lote uuid := gen_random_uuid(); r record;
begin
  if new.estado = 'activa' or old.estado is not distinct from new.estado then return new; end if;
  select id into v_ubic from ubicacion where obra_id = new.id;
  if v_ubic is null then return new; end if;
  select id into v_taller from ubicacion where tipo = 'taller' and not archivada order by creado_en limit 1;
  if v_taller is null then return new; end if;
  for r in select id from activo where ubicacion_id = v_ubic and estado <> 'baja' for update loop
    insert into activo_movimiento (activo_id, origen_id, destino_id, usuario_id, lote_id, nota)
    values (r.id, v_ubic, v_taller, auth.uid(), v_lote, 'la obra pasó a «' || new.estado || '»: al Taller (regla del dueño 21/09)');
    update activo set ubicacion_id = v_taller where id = r.id;
  end loop;
  return new;
end $$;
create trigger obra_inactiva_activos_al_taller
  after update of estado on public.obra_canonica
  for each row execute function public._activos_de_obra_inactiva_al_taller();

revoke all on function public._activo_usuario(), public.ubicacion_de_obra(text), public.crear_ubicacion(text, text, text),
  public.mover_activos(uuid[], uuid, text, boolean), public.reportar_problema_activo(uuid, text, text, text),
  public.cambiar_estado_activo(uuid, text, text), public.dar_de_baja_activo(uuid, text, text),
  public.dar_de_alta_activo(text, text, uuid, text, text, text, boolean, text), public.editar_activo(uuid, jsonb),
  public._activos_de_obra_inactiva_al_taller() from public, anon;
grant execute on function public.ubicacion_de_obra(text), public.crear_ubicacion(text, text, text),
  public.mover_activos(uuid[], uuid, text, boolean), public.reportar_problema_activo(uuid, text, text, text),
  public.cambiar_estado_activo(uuid, text, text), public.dar_de_baja_activo(uuid, text, text),
  public.dar_de_alta_activo(text, text, uuid, text, text, text, boolean, text), public.editar_activo(uuid, jsonb)
  to authenticated;

-- ═══ IMPORTACIÓN DE LO QUE YA ESTÁ EN LA BASE ══════════════════════════════════════════════════

alter table public.herramientas rename to herramientas_legado;
alter table public.movimientos_herramienta rename to movimientos_herramienta_legado;
drop function if exists public.registrar_movimiento_herramienta(text, text, text);
revoke insert, update, delete on public.herramientas_legado, public.movimientos_herramienta_legado from authenticated, anon;

insert into public.ubicacion (tipo, nombre) values
  ('taller', 'Taller'),
  ('servicio_tecnico', 'Servicio técnico sin identificar');

-- Texto viejo → ubicación. TALLER y ALMACEN son el mismo Taller; servicio técnico por nombre; el resto por el índice de obras
-- (obra_alias, normalizado en minúsculas). Lo que no resuelve queda null = «sin ubicación cargada».
create temp table _map (texto text primary key, ubicacion_id uuid);
insert into _map (texto)
  select distinct upper(btrim(t)) from (
    select ubicacion_actual as t from public.herramientas_legado
    union select destino from public.movimientos_herramienta_legado) x
  where nullif(btrim(t), '') is not null;
update _map set ubicacion_id = (select id from public.ubicacion where tipo = 'taller') where texto in ('TALLER', 'ALMACEN');
update _map set ubicacion_id = (select id from public.ubicacion where tipo = 'servicio_tecnico') where texto in ('SERV. TECNICO', 'SERV TECNICO', 'SERVICIO TECNICO');
insert into public.ubicacion (tipo, obra_id)
  select distinct 'obra', coalesce(o.fusionada_en, o.id)
    from _map m
    join public.obra_alias a on a.alias = lower(m.texto) and a.obra_id is not null
    join public.obra_canonica o on o.id = a.obra_id
   where m.ubicacion_id is null
  on conflict (obra_id) do nothing;
update _map m set ubicacion_id = u.id
  from public.obra_alias a join public.obra_canonica o on o.id = a.obra_id
       join public.ubicacion u on u.obra_id = coalesce(o.fusionada_en, o.id)
 where m.ubicacion_id is null and a.alias = lower(m.texto);

-- Herramientas: HER-0001… por orden de carga. Operativas, declarado como asumido.
-- Se conserva el mismo id: lo que ya apuntaba a una herramienta (imputación, pantallas) sigue apuntando.
insert into public.activo (id, codigo, clase, nombre, categoria, foto_url, estado, estado_asumido, estado_desde, legado_id, creado_en)
  select h.id, 'HER-' || lpad(row_number() over (order by h.fecha nulls last, h.created_at, h.id_herramienta)::text, 4, '0'),
         'herramienta', btrim(h.nombre), h.categoria, h.imagen_url, 'operativo', true,
         coalesce(h.fecha, h.created_at), 'her:' || h.id_herramienta, coalesce(h.fecha, h.created_at)
    from public.herramientas_legado h;
select setval('public.activo_codigo_her', greatest((select count(*) from public.herramientas_legado), 1));

-- Rodados: los 6 de equipos (carpeta VEHICULOS). Sin ubicación cargada: no se sabe dónde están.
insert into public.activo (id, codigo, clase, nombre, patente, estado, estado_asumido, legado_id, creado_en)
  select e.id, case when e.tipo = 'vehiculo' then 'ROD-' else 'EQU-' end
           || lpad(row_number() over (partition by e.tipo = 'vehiculo' order by e.created_at, e.nombre)::text, 4, '0'),
         case when e.tipo = 'vehiculo' then 'rodado' else 'equipo' end,
         btrim(e.nombre), case when e.tipo = 'vehiculo' then nullif(upper(btrim(e.patente_o_identificador)), '') end,
         'operativo', true, 'equ:' || e.id, e.created_at
    from public.equipos e;
select setval('public.activo_codigo_rod', greatest((select count(*) from public.activo where clase = 'rodado'), 1));
select setval('public.activo_codigo_equ', greatest((select count(*) from public.activo where clase = 'equipo'), 1));
insert into public.ubicacion (tipo, activo_id) select 'rodado', id from public.activo where clase = 'rodado';

-- Historial: se reconstruye el origen encadenando destinos por fecha. El primero no tiene origen conocido.
insert into public.activo_movimiento (id, activo_id, origen_id, destino_id, fecha_hora, usuario_texto, nota, importado, legado_id)
  select x.id, a.id, x.origen, x.destino, x.fecha, x.responsable,
         case when x.origen is null then 'importado · origen desconocido' else 'importado' end, true, x.id_movimiento
    from (
      select m.id, m.id_movimiento, m.id_herramienta, coalesce(m.fecha, m.created_at) as fecha, nullif(btrim(m.responsable), '') as responsable,
             d.ubicacion_id as destino,
             lag(d.ubicacion_id) over (partition by m.id_herramienta order by coalesce(m.fecha, m.created_at), m.id_movimiento) as origen
        from public.movimientos_herramienta_legado m
        join _map d on d.texto = upper(btrim(m.destino))
       where d.ubicacion_id is not null
    ) x
    join public.activo a on a.legado_id = 'her:' || x.id_herramienta
   where x.origen is distinct from x.destino;

-- Ubicación actual = la del listado. Si el historial terminaba en otro lado, se asienta el ajuste.
do $$
declare r record; v_ultimo uuid;
begin
  for r in
    select a.id, m.ubicacion_id as actual
      from public.activo a
      join public.herramientas_legado h on a.legado_id = 'her:' || h.id_herramienta
      left join _map m on m.texto = upper(btrim(h.ubicacion_actual))
  loop
    select destino_id into v_ultimo from public.activo_movimiento where activo_id = r.id order by fecha_hora desc limit 1;
    if r.actual is not null and v_ultimo is distinct from r.actual then
      insert into public.activo_movimiento (activo_id, origen_id, destino_id, nota, importado)
      values (r.id, v_ultimo, r.actual, 'importado · la ubicación del listado no coincidía con el último movimiento', true);
    end if;
    update public.activo set ubicacion_id = r.actual where id = r.id;
  end loop;
end $$;

-- Regla del dueño: lo que quedó en una obra inactiva va al Taller, con su movimiento.
insert into public.activo_movimiento (activo_id, origen_id, destino_id, lote_id, nota, importado)
  select a.id, a.ubicacion_id, (select id from public.ubicacion where tipo = 'taller'), l.lote,
         'la obra no está activa: al Taller (regla del dueño 21/09)', true
    from public.activo a
    join public.ubicacion u on u.id = a.ubicacion_id and u.tipo = 'obra'
    join public.obra_canonica o on o.id = u.obra_id and o.estado <> 'activa'
    cross join (select gen_random_uuid() as lote) l;
update public.activo a set ubicacion_id = (select id from public.ubicacion where tipo = 'taller')
  from public.ubicacion u join public.obra_canonica o on o.id = u.obra_id and o.estado <> 'activa'
 where u.id = a.ubicacion_id and u.tipo = 'obra';

-- ═══ VISTAS DE COMPATIBILIDAD (sólo lectura, mismas columnas que las tablas viejas) ════════════
-- ubicacion_actual devuelve un texto que el puente de alias sabe resolver (el alias de la obra).
create view public.herramientas with (security_invoker = true) as
  select a.id,
         coalesce(substring(a.legado_id from 5), a.codigo) as id_herramienta,
         a.nombre,
         case u.tipo
           when 'taller' then 'TALLER'
           when 'servicio_tecnico' then 'SERV. TECNICO'
           when 'obra' then coalesce(
             (select upper(al.alias) from public.obra_alias al where al.obra_id = u.obra_id
               order by (al.clasificacion = 'obra') desc, length(al.alias) limit 1), u.obra_id)
           when 'rodado' then (select coalesce(r.patente, r.codigo) from public.activo r where r.id = u.activo_id)
           else u.nombre end as ubicacion_actual,
         a.foto_url as imagen_url,
         a.creado_en as fecha,
         'os'::text as origen,
         a.creado_en as sincronizado_en,
         a.estado_desde as updated_at,
         a.creado_en as created_at,
         case a.estado
           when 'operativo' then 'disponible'
           when 'requiere_mantenimiento' then 'en_reparacion'
           when 'reparacion_externa' then 'en_reparacion'
           when 'fuera_servicio' then 'fuera_servicio'
           else 'perdida' end as estado,
         a.categoria,
         a.estado_nota,
         a.estado_desde as estado_actualizado_en
    from public.activo a
    left join public.ubicacion u on u.id = a.ubicacion_id
   where a.clase <> 'rodado';

create view public.movimientos_herramienta with (security_invoker = true) as
  select m.id,
         coalesce(m.legado_id, m.id::text) as id_movimiento,
         h.id_herramienta,
         case u.tipo
           when 'taller' then 'TALLER'
           when 'servicio_tecnico' then 'SERV. TECNICO'
           when 'obra' then coalesce(
             (select upper(al.alias) from public.obra_alias al where al.obra_id = u.obra_id
               order by (al.clasificacion = 'obra') desc, length(al.alias) limit 1), u.obra_id)
           else coalesce(u.nombre, 'RODADO') end as destino,
         coalesce(m.usuario_texto, (select p.nombre from public.perfiles p where p.id = m.usuario_id)) as responsable,
         m.fecha_hora as fecha,
         case when m.importado then 'appsheet_sheet' else 'os' end as origen,
         m.fecha_hora as sincronizado_en,
         m.fecha_hora as created_at
    from public.activo_movimiento m
    join public.herramientas h on h.id = m.activo_id
    join public.ubicacion u on u.id = m.destino_id;

grant select on public.herramientas, public.movimientos_herramienta to authenticated;
revoke all on public.herramientas, public.movimientos_herramienta from anon;

-- ═══ CONTROLES DE LA IMPORTACIÓN (si algo no cierra, no se aplica nada) ════════════════════════
do $$
declare n_leg int; n_her int; n_rod int; n_leg_rod int; n_obra_inact int;
begin
  select count(*) into n_leg from public.herramientas_legado;
  select count(*) into n_her from public.activo where legado_id like 'her:%';
  select count(*) into n_leg_rod from public.equipos;
  select count(*) into n_rod from public.activo where legado_id like 'equ:%';
  select count(*) into n_obra_inact from public.activo a join public.ubicacion u on u.id = a.ubicacion_id
    join public.obra_canonica o on o.id = u.obra_id where o.estado <> 'activa';
  if n_leg <> n_her then raise exception 'importación: % herramientas en el listado y % activos', n_leg, n_her; end if;
  if n_leg_rod <> n_rod then raise exception 'importación: % equipos y % activos', n_leg_rod, n_rod; end if;
  if n_obra_inact <> 0 then raise exception 'quedaron % activos en obras inactivas', n_obra_inact; end if;
  raise notice 'importados: % herramientas, % rodados/equipos, % movimientos; sin ubicación: %',
    n_her, n_rod, (select count(*) from public.activo_movimiento),
    (select count(*) from public.activo where ubicacion_id is null and clase <> 'rodado');
end $$;

drop table _map;
