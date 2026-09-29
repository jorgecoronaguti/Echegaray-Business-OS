-- SNAPSHOT DE PRODUCCIÓN (29/09/2026) de lo que la migración 20260929T1500 lee o toca. Sólo dependencias:
-- tablas, restricciones, índices, triggers, policies, grants y funciones tal como están en el proyecto real,
-- leídas del catálogo con SELECT. Las FK a tablas fuera de este conjunto se omiten (no se ensayan acá).
-- Lo carga material_run_real.sh en la imagen de Supabase, en lugar del andamio material_01.
create schema if not exists extensions;

create table public.perfiles (
  id uuid not null,
  rol text not null,
  nombre text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  creado_por uuid default auth.uid(),
  actualizado_por uuid,
  actualizado_en timestamp with time zone default now() not null,
  persona_id uuid,
  telefono text,
  avatar_url text,
  es_prueba boolean default false not null
);
create table public.usuario_obra (
  id uuid default gen_random_uuid() not null,
  usuario_id uuid not null,
  obra_canonica_id text not null,
  papel text default 'jefe'::text not null,
  desde date,
  hasta date,
  creado_en timestamp with time zone default now() not null
);
create table public.obra_canonica (
  id text not null,
  nombre text not null,
  estado text default 'activa'::text not null,
  tipo text default 'obra'::text not null,
  created_at timestamp with time zone default now() not null,
  cliente_texto text,
  etapa text,
  monto_contratado numeric,
  fecha_inicio_plan date,
  fecha_fin_plan date,
  fecha_inicio_real date,
  fecha_fin_real date,
  jefe_obra text,
  drive_carpeta_id text,
  orden integer default 100 not null,
  cliente_id uuid,
  ubicacion text,
  jornada_horas numeric default 8.8 not null,
  dias_habiles integer[] default '{1,2,3,4,5}'::integer[] not null,
  radio_obra_metros integer default 300 not null,
  contrato_moneda text default 'ARS'::text not null,
  contrato_monto numeric,
  fusionada_en text,
  obra_padre_id text,
  codigo text not null,
  metodo_ponderacion text default 'costo_mo'::text not null
);
create table public.obra_asignacion (
  id uuid default gen_random_uuid() not null,
  obra_id text not null,
  persona_id uuid not null,
  rol text default 'integrante'::text not null,
  cuadrilla text,
  actividad_id uuid,
  desde date,
  hasta date,
  notas text,
  creado_en timestamp with time zone default now() not null,
  cuadrilla_id uuid
);
create table public.ubicacion (
  id uuid default gen_random_uuid() not null,
  tipo text not null,
  nombre text,
  obra_id text,
  activo_id uuid,
  contacto text,
  archivada boolean default false not null,
  creado_en timestamp with time zone default now() not null,
  proveedor_id uuid,
  persona_id uuid
);
create table public.pedidos_materiales (
  id uuid default gen_random_uuid() not null,
  id_pedido text not null,
  obra_texto text,
  obra_id uuid,
  fecha date,
  material text,
  cantidad numeric,
  estado text,
  origen text default 'appsheet_sheet'::text,
  sincronizado_en timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  creado_por uuid,
  actividad_id uuid,
  obra_canonica_id text,
  pedido_grupo uuid,
  unidad text,
  urgencia text,
  nota text,
  borrado_en timestamp with time zone,
  borrado_por uuid
);
alter table public.obra_asignacion add constraint "obra_asignacion_pkey" PRIMARY KEY (id);
alter table public.obra_asignacion add constraint "obra_asignacion_rol_check" CHECK ((rol = ANY (ARRAY['responsable'::text, 'integrante'::text])));
alter table public.obra_canonica add constraint "obra_canonica_codigo_formato" CHECK ((codigo ~ '^(OB|ZZ)-[0-9]{4,}$'::text));
alter table public.obra_canonica add constraint "obra_canonica_codigo_unico" UNIQUE (codigo);
alter table public.obra_canonica add constraint "obra_canonica_contrato_moneda_check" CHECK ((contrato_moneda = ANY (ARRAY['ARS'::text, 'USD'::text])));
alter table public.obra_canonica add constraint "obra_canonica_estado_chk" CHECK ((estado = ANY (ARRAY['activa'::text, 'pausada'::text, 'cerrada'::text])));
alter table public.obra_canonica add constraint "obra_canonica_etapa_chk" CHECK ((etapa = ANY (ARRAY['previo'::text, 'inicio'::text, 'desarrollo'::text, 'terminacion'::text, 'cierre'::text])));
alter table public.obra_canonica add constraint "obra_canonica_fusionada_en_chk" CHECK (((fusionada_en IS NULL) OR (fusionada_en <> id)));
alter table public.obra_canonica add constraint "obra_canonica_jornada_horas_check" CHECK (((jornada_horas > (0)::numeric) AND (jornada_horas <= (24)::numeric)));
alter table public.obra_canonica add constraint "obra_canonica_metodo_ponderacion_check" CHECK ((metodo_ponderacion = ANY (ARRAY['costo_mo'::text, 'parejo'::text, 'manual'::text, 'dias_teoricos'::text, 'hh_plan'::text])));
alter table public.obra_canonica add constraint "obra_canonica_obra_padre_id_chk" CHECK (((obra_padre_id IS NULL) OR (obra_padre_id <> id)));
alter table public.obra_canonica add constraint "obra_canonica_pkey" PRIMARY KEY (id);
alter table public.obra_canonica add constraint "obra_canonica_radio_obra_metros_check" CHECK ((radio_obra_metros > 0));
alter table public.pedidos_materiales add constraint "pedidos_materiales_id_pedido_key" UNIQUE (id_pedido);
alter table public.pedidos_materiales add constraint "pedidos_materiales_origen_check" CHECK ((origen = ANY (ARRAY['appsheet_sheet'::text, 'os'::text, 'app'::text])));
alter table public.pedidos_materiales add constraint "pedidos_materiales_pkey" PRIMARY KEY (id);
alter table public.pedidos_materiales add constraint "pedidos_materiales_urgencia_check" CHECK (((urgencia IS NULL) OR (urgencia = ANY (ARRAY['hoy'::text, 'semana'::text, 'cuando_se_pueda'::text]))));
alter table public.perfiles add constraint "perfiles_pkey" PRIMARY KEY (id);
alter table public.perfiles add constraint "perfiles_rol_check" CHECK ((rol = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text, 'campo'::text, 'cliente'::text])));
alter table public.ubicacion add constraint "ubicacion_contacto_check" CHECK (((contacto IS NULL) OR (length(contacto) <= 200)));
alter table public.ubicacion add constraint "ubicacion_nombre_check" CHECK (((nombre IS NULL) OR ((length(btrim(nombre)) >= 2) AND (length(btrim(nombre)) <= 120))));
alter table public.ubicacion add constraint "ubicacion_nombre_chk" CHECK (((tipo = ANY (ARRAY['obra'::text, 'rodado'::text])) OR (nombre IS NOT NULL) OR (proveedor_id IS NOT NULL)));
alter table public.ubicacion add constraint "ubicacion_obra_chk" CHECK (((tipo = 'obra'::text) = (obra_id IS NOT NULL)));
alter table public.ubicacion add constraint "ubicacion_obra_uq" UNIQUE (obra_id);
alter table public.ubicacion add constraint "ubicacion_persona_chk" CHECK (((tipo = 'persona'::text) = (persona_id IS NOT NULL)));
alter table public.ubicacion add constraint "ubicacion_pkey" PRIMARY KEY (id);
alter table public.ubicacion add constraint "ubicacion_proveedor_chk" CHECK (((proveedor_id IS NULL) OR (tipo = ANY (ARRAY['servicio_tecnico'::text, 'tercero'::text]))));
alter table public.ubicacion add constraint "ubicacion_rodado_chk" CHECK (((tipo = 'rodado'::text) = (activo_id IS NOT NULL)));
alter table public.ubicacion add constraint "ubicacion_rodado_uq" UNIQUE (activo_id);
alter table public.ubicacion add constraint "ubicacion_tipo_check" CHECK ((tipo = ANY (ARRAY['taller'::text, 'obra'::text, 'rodado'::text, 'servicio_tecnico'::text, 'tercero'::text, 'persona'::text])));
alter table public.usuario_obra add constraint "usuario_obra_papel_check" CHECK ((papel = ANY (ARRAY['jefe'::text, 'colaborador'::text, 'lectura'::text])));
alter table public.usuario_obra add constraint "usuario_obra_pkey" PRIMARY KEY (id);
alter table public.usuario_obra add constraint "usuario_obra_usuario_id_obra_canonica_id_key" UNIQUE (usuario_id, obra_canonica_id);
alter table public.obra_asignacion add constraint "obra_asignacion_obra_id_fkey" FOREIGN KEY (obra_id) REFERENCES obra_canonica(id) ON DELETE CASCADE;
alter table public.obra_canonica add constraint "obra_canonica_fusionada_en_fkey" FOREIGN KEY (fusionada_en) REFERENCES obra_canonica(id);
alter table public.obra_canonica add constraint "obra_canonica_obra_padre_id_fkey" FOREIGN KEY (obra_padre_id) REFERENCES obra_canonica(id);
alter table public.pedidos_materiales add constraint "pedidos_materiales_obra_canonica_id_fkey" FOREIGN KEY (obra_canonica_id) REFERENCES obra_canonica(id);
alter table public.perfiles add constraint "perfiles_actualizado_por_fkey" FOREIGN KEY (actualizado_por) REFERENCES perfiles(id);
alter table public.perfiles add constraint "perfiles_creado_por_fkey" FOREIGN KEY (creado_por) REFERENCES perfiles(id);
alter table public.perfiles add constraint "perfiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.ubicacion add constraint "ubicacion_obra_id_fkey" FOREIGN KEY (obra_id) REFERENCES obra_canonica(id);
alter table public.usuario_obra add constraint "usuario_obra_obra_canonica_id_fkey" FOREIGN KEY (obra_canonica_id) REFERENCES obra_canonica(id) ON DELETE CASCADE;
alter table public.usuario_obra add constraint "usuario_obra_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX obra_asignacion_obra_idx ON public.obra_asignacion USING btree (obra_id);
CREATE INDEX obra_asignacion_persona_idx ON public.obra_asignacion USING btree (persona_id);
CREATE INDEX obra_asignacion_cuadrilla_idx ON public.obra_asignacion USING btree (cuadrilla_id);
CREATE UNIQUE INDEX obra_asignacion_una_vigente ON public.obra_asignacion USING btree (obra_id, persona_id, COALESCE(actividad_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (hasta IS NULL);
CREATE INDEX obra_canonica_cliente_idx ON public.obra_canonica USING btree (cliente_id);
CREATE INDEX obra_canonica_obra_padre_id_idx ON public.obra_canonica USING btree (obra_padre_id) WHERE (obra_padre_id IS NOT NULL);
CREATE INDEX pedidos_materiales_obra ON public.pedidos_materiales USING btree (obra_id);
CREATE INDEX pedidos_materiales_estado ON public.pedidos_materiales USING btree (estado);
CREATE INDEX pedidos_materiales_por_actividad ON public.pedidos_materiales USING btree (actividad_id) WHERE (actividad_id IS NOT NULL);
CREATE INDEX pedidos_materiales_obra_canonica ON public.pedidos_materiales USING btree (obra_canonica_id);
CREATE INDEX pedidos_materiales_grupo ON public.pedidos_materiales USING btree (pedido_grupo);
CREATE UNIQUE INDEX perfiles_una_persona_por_usuario ON public.perfiles USING btree (persona_id) WHERE (persona_id IS NOT NULL);
CREATE UNIQUE INDEX ubicacion_persona_uq ON public.ubicacion USING btree (persona_id) WHERE (persona_id IS NOT NULL);
CREATE UNIQUE INDEX ubicacion_proveedor_uq ON public.ubicacion USING btree (proveedor_id) WHERE (proveedor_id IS NOT NULL);
CREATE UNIQUE INDEX ubicacion_un_solo_taller ON public.ubicacion USING btree ((true)) WHERE ((tipo = 'taller'::text) AND (NOT archivada));
CREATE INDEX usuario_obra_usuario_idx ON public.usuario_obra USING btree (usuario_id);
CREATE INDEX usuario_obra_obra_idx ON public.usuario_obra USING btree (obra_canonica_id);
CREATE OR REPLACE FUNCTION public._activo_usuario()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  return auth.uid();
end $function$;
CREATE OR REPLACE FUNCTION public._activos_de_obra_inactiva_al_taller()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ubic uuid; v_taller uuid; v_lote uuid := gen_random_uuid(); r record;
begin
  if new.estado = 'activa' or old.estado is not distinct from new.estado then return new; end if;
  select id into v_ubic from ubicacion where obra_id = new.id;
  if v_ubic is null then return new; end if;
  select id into v_taller from ubicacion where tipo = 'taller' and not archivada order by creado_en limit 1;
  if v_taller is null then return new; end if;
  for r in select e.activo_id, e.cantidad from activo_existencia e join activo a on a.id = e.activo_id
            where e.ubicacion_id = v_ubic and a.estado <> 'baja' order by a.codigo loop
    perform 1 from activo where id = r.activo_id for update;
    perform public._mover_existencia(r.activo_id, v_ubic, v_taller, r.cantidad, auth.uid(), v_lote,
      'la obra pasó a «' || new.estado || '»: al Taller (regla del dueño 21/09)');
  end loop;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.asignacion_vigente(p_desde date, p_hasta date)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select (p_desde is null or p_desde <= current_date)
     and (p_hasta is null or p_hasta >= current_date)
$function$;
CREATE OR REPLACE FUNCTION public.auditar_cambio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entidad text := tg_argv[0];
  v_campos  text[] := string_to_array(tg_argv[1], ',');
  v_tapados text[] := case when coalesce(tg_argv[2], '') = '' then array[]::text[]
                           else string_to_array(tg_argv[2], ',') end;
  v_viejo   jsonb := to_jsonb(old);
  v_nuevo   jsonb := to_jsonb(new);
  v_campo   text;
  v_antes   text;
  v_despues text;
begin
  foreach v_campo in array v_campos loop
    v_antes   := v_viejo ->> v_campo;
    v_despues := v_nuevo ->> v_campo;
    if v_antes is distinct from v_despues then
      if v_campo = any (v_tapados) then
        v_antes := case when v_antes is null then null else '•••' end;
        v_despues := case when v_despues is null then null else '•••' end;
      end if;
      insert into public.entidad_cambio (entidad, entidad_id, campo, antes, despues, autor)
      values (v_entidad, v_nuevo ->> 'id', v_campo, v_antes, v_despues, auth.uid());
    end if;
  end loop;
  return null;
end;
$function$;
CREATE OR REPLACE FUNCTION public.avisar_cambio_de_tabla()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  marca text := 'os_aviso.' || tg_table_name;
  -- LAS COLUMNAS QUE SE REESCRIBEN SOLAS EN CADA ESCRITURA: no cuentan como cambio.
  sellos constant text[] := array[
    'updated_at', 'actualizado_en', 'actualizado_at', 'actualizado_por', 'calculado_en', 'sincronizado_en', 'ms'
  ];
  cambio boolean;
begin
  if pg_catalog.current_setting(marca, true) is not distinct from '1' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    cambio := exists (select 1 from nuevas);
  elsif tg_op = 'DELETE' then
    cambio := exists (select 1 from viejas);
  else
    cambio := exists (
      select pg_catalog.to_jsonb(n) - sellos from nuevas n
      except
      select pg_catalog.to_jsonb(o) - sellos from viejas o
    );
  end if;

  if not cambio then
    return null;
  end if;

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
  return null;
end;
$function$;
CREATE OR REPLACE FUNCTION public.current_rol()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select rol from perfiles where id = auth.uid()
$function$;
CREATE OR REPLACE FUNCTION public.es_administracion()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.current_rol() in ('direccion', 'administracion', 'jefe_obra'), false)
$function$;
CREATE OR REPLACE FUNCTION public.mi_persona_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select persona_id from public.perfiles where id = auth.uid()
$function$;
CREATE OR REPLACE FUNCTION public.obra_codigo_guardia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    new.codigo := public.obra_codigo_nuevo(new.id, new.nombre);
    return new;
  end if;
  if new.codigo is distinct from old.codigo then
    raise exception 'obra_canonica.codigo es inmutable: % no puede pasar a %', old.codigo, new.codigo
      using errcode = 'check_violation';
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.obra_codigo_nuevo(p_id text, p_nombre text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n bigint;
  prefijo text;
begin
  if public.obra_es_de_prueba(p_id, p_nombre) then
    n := nextval('public.obra_codigo_prueba_seq'); prefijo := 'ZZ-';
  else
    n := nextval('public.obra_codigo_seq'); prefijo := 'OB-';
  end if;
  -- `lpad` TRUNCA lo que excede el ancho: la obra 10.000 sería «OB-1000». Cuatro dígitos es el mínimo.
  return prefijo || lpad(n::text, greatest(4, length(n::text)), '0');
end $function$;
CREATE OR REPLACE FUNCTION public.obra_padre_coherente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.obra_padre_id is null then return new; end if;

  if new.obra_padre_id = new.id then
    raise exception 'una obra no puede ser adicional de sí misma (%)', new.id;
  end if;

  -- UN SOLO NIVEL. Sin esto, a→b→c es un ciclo en potencia y la pantalla tendría que dibujar una
  -- profundidad que nadie decidió.
  if exists (select 1 from public.obra_canonica p
              where p.id = new.obra_padre_id and p.obra_padre_id is not null) then
    raise exception 'el adicional % apunta a %, que ya es adicional de otra obra', new.id, new.obra_padre_id;
  end if;

  -- LA OTRA MITAD DEL CICLO: una obra que ya tiene adicionales no puede volverse adicional.
  if exists (select 1 from public.obra_canonica h where h.obra_padre_id = new.id) then
    raise exception 'la obra % ya tiene adicionales colgados: no puede volverse adicional de %', new.id, new.obra_padre_id;
  end if;

  -- EL PADRE TIENE QUE ESTAR VIVO. `obra_panel` no publica las fusionadas: colgar un adicional de
  -- una obra fusionada lo dejaría debajo de algo que ninguna pantalla dibuja.
  if exists (select 1 from public.obra_canonica p
              where p.id = new.obra_padre_id and p.fusionada_en is not null) then
    raise exception 'la obra mayor % está fusionada en %: el adicional tiene que colgar de la obra viva',
      new.obra_padre_id, (select fusionada_en from public.obra_canonica where id = new.obra_padre_id);
  end if;

  -- Y TIENE QUE SER DEL MISMO CLIENTE: un adicional es más alcance del MISMO encargo.
  if exists (select 1 from public.obra_canonica p
              where p.id = new.obra_padre_id
                and coalesce(p.cliente_id::text, '') <> coalesce(new.cliente_id::text, '')) then
    raise exception 'la obra mayor % es de otro cliente que el adicional %', new.obra_padre_id, new.id;
  end if;

  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.set_actualizado_en()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.actualizado_en = now();
  new.actualizado_por = coalesce(auth.uid(), new.actualizado_por);
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.ubicacion_de_obra(p_obra_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;
CREATE OR REPLACE FUNCTION public.ve_economia()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.current_rol() in ('direccion', 'administracion'), false)
$function$;
CREATE OR REPLACE FUNCTION public.ve_obra(p_obra text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.es_administracion()
      -- El jefe de obra opera TODAS las obras. Lo económico no pasa por acá.
      or public.current_rol() = 'jefe_obra'
      or exists (
        select 1 from public.usuario_obra uo
        where uo.usuario_id = auth.uid()
          and uo.obra_canonica_id = p_obra
      )
      -- La obra donde mi PERSONA está asignada hoy. Un eje, no dos.
      or exists (
        select 1 from public.obra_asignacion a
        where a.persona_id = public.mi_persona_id()
          and a.obra_id = p_obra
          and public.asignacion_vigente(a.desde, a.hasta)
      )
$function$;
-- obra_alias y norm_obra: las lee ve_obra_texto (que usan las policies); sin ellas no compila la función.
create table if not exists public.obra_alias (alias text primary key, obra_id text references public.obra_canonica(id), clasificacion text not null default 'x', ejemplo_raw text, en_texto_libre boolean not null default false);
CREATE OR REPLACE FUNCTION public.norm_obra(txt text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select trim(regexp_replace(
           regexp_replace(
             regexp_replace(
               translate(lower(coalesce(txt,'')),
                 'áàäâãéèëêíìïîóòöôõúùüûñç','aaaaaeeeeiiiiooooouuuunc'),
             '[^a-z0-9]+', ' ', 'g'),
           '\y(la|el|los|las|de|del)\y', ' ', 'g'),
         '\s+', ' ', 'g'))
$function$;
CREATE OR REPLACE FUNCTION public.ve_obra_texto(p_texto text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when public.es_administracion() then true
    when p_texto is null or btrim(p_texto) = '' then false
    else exists (
      select 1
        from public.obra_alias a
       where a.alias = public.norm_obra(p_texto)
         and a.obra_id is not null
         and public.ve_obra(a.obra_id)
    )
  end
$function$;
CREATE OR REPLACE FUNCTION public.ve_pedido_material(p_obra_texto text, p_obra_canonica_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.es_administracion()
      or (p_obra_canonica_id is not null and public.ve_obra(p_obra_canonica_id))
      or public.ve_obra_texto(p_obra_texto)
$function$;
CREATE TRIGGER zz_avisar_delete AFTER DELETE ON public.obra_asignacion REFERENCING OLD TABLE AS viejas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE TRIGGER zz_avisar_insert AFTER INSERT ON public.obra_asignacion REFERENCING NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE TRIGGER zz_avisar_update AFTER UPDATE ON public.obra_asignacion REFERENCING OLD TABLE AS viejas NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE TRIGGER obra_canonica_auditar AFTER UPDATE ON public.obra_canonica FOR EACH ROW EXECUTE FUNCTION auditar_cambio('obra_canonica', 'monto_contratado', 'monto_contratado');
CREATE TRIGGER obra_canonica_codigo_guardia BEFORE INSERT OR UPDATE ON public.obra_canonica FOR EACH ROW EXECUTE FUNCTION obra_codigo_guardia();
CREATE TRIGGER obra_canonica_padre_coherente BEFORE INSERT OR UPDATE OF obra_padre_id, cliente_id ON public.obra_canonica FOR EACH ROW EXECUTE FUNCTION obra_padre_coherente();
CREATE TRIGGER obra_inactiva_activos_al_taller AFTER UPDATE OF estado ON public.obra_canonica FOR EACH ROW EXECUTE FUNCTION _activos_de_obra_inactiva_al_taller();
CREATE TRIGGER zz_avisar_delete AFTER DELETE ON public.obra_canonica REFERENCING OLD TABLE AS viejas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE TRIGGER zz_avisar_insert AFTER INSERT ON public.obra_canonica REFERENCING NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE TRIGGER zz_avisar_update AFTER UPDATE ON public.obra_canonica REFERENCING OLD TABLE AS viejas NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE TRIGGER zz_avisar_delete AFTER DELETE ON public.pedidos_materiales REFERENCING OLD TABLE AS viejas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE TRIGGER zz_avisar_insert AFTER INSERT ON public.pedidos_materiales REFERENCING NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE TRIGGER zz_avisar_update AFTER UPDATE ON public.pedidos_materiales REFERENCING OLD TABLE AS viejas NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE TRIGGER perfiles_set_updated_at BEFORE UPDATE ON public.perfiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_actualizado_en BEFORE UPDATE ON public.perfiles FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
CREATE TRIGGER zz_avisar_delete AFTER DELETE ON public.ubicacion REFERENCING OLD TABLE AS viejas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE TRIGGER zz_avisar_insert AFTER INSERT ON public.ubicacion REFERENCING NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE TRIGGER zz_avisar_update AFTER UPDATE ON public.ubicacion REFERENCING OLD TABLE AS viejas NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE TRIGGER zz_avisar_delete AFTER DELETE ON public.usuario_obra REFERENCING OLD TABLE AS viejas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE TRIGGER zz_avisar_insert AFTER INSERT ON public.usuario_obra REFERENCING NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE TRIGGER zz_avisar_update AFTER UPDATE ON public.usuario_obra REFERENCING OLD TABLE AS viejas NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION avisar_cambio_de_tabla();
CREATE OR REPLACE FUNCTION public.mis_obras()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select uo.obra_canonica_id
    from public.usuario_obra uo
   where uo.usuario_id = auth.uid()
  union
  select a.obra_id
    from public.obra_asignacion a
   where a.persona_id = public.mi_persona_id()
     and public.asignacion_vigente(a.desde, a.hasta)
$function$;
CREATE OR REPLACE FUNCTION public.obra_es_de_prueba(p_id text, p_nombre text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(p_id, '') ~* '^(zz-?e2e|prueba-e2e)' or coalesce(p_nombre, '') ~* '(zz-?e2e|\[prueba e2e\])'
$function$;
alter table public.obra_asignacion enable row level security;
alter table public.obra_canonica enable row level security;
alter table public.pedidos_materiales enable row level security;
alter table public.perfiles enable row level security;
alter table public.ubicacion enable row level security;
alter table public.usuario_obra enable row level security;
create policy "obra_asignacion_select" on public.obra_asignacion as permissive for select to authenticated using ((( SELECT es_administracion() AS es_administracion) OR (( SELECT current_rol() AS current_rol) = 'jefe_obra'::text) OR ve_obra(obra_id)));
create policy "obra_asignacion_write" on public.obra_asignacion as permissive for all to authenticated using (((( SELECT es_administracion() AS es_administracion) OR (( SELECT current_rol() AS current_rol) = 'jefe_obra'::text) OR ve_obra(obra_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])))) with check (((( SELECT es_administracion() AS es_administracion) OR (( SELECT current_rol() AS current_rol) = 'jefe_obra'::text) OR ve_obra(obra_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text]))));
create policy "obra_canonica_delete" on public.obra_canonica as permissive for delete to authenticated using (( SELECT es_administracion() AS es_administracion));
create policy "obra_canonica_insert" on public.obra_canonica as permissive for insert to authenticated with check (( SELECT es_administracion() AS es_administracion));
create policy "obra_canonica_select" on public.obra_canonica as permissive for select to authenticated using ((( SELECT es_administracion() AS es_administracion) OR (( SELECT current_rol() AS current_rol) = 'jefe_obra'::text) OR (id IN ( SELECT mis_obras() AS mis_obras))));
create policy "obra_canonica_update" on public.obra_canonica as permissive for update to authenticated using (( SELECT es_administracion() AS es_administracion)) with check (( SELECT es_administracion() AS es_administracion));
create policy "pedidos_materiales_delete" on public.pedidos_materiales as permissive for delete to authenticated using (ve_pedido_material(obra_texto, obra_canonica_id));
create policy "pedidos_materiales_insert" on public.pedidos_materiales as permissive for insert to authenticated with check (ve_pedido_material(obra_texto, obra_canonica_id));
create policy "pedidos_materiales_select" on public.pedidos_materiales as permissive for select to authenticated using (((borrado_en IS NULL) AND ve_pedido_material(obra_texto, obra_canonica_id)));
create policy "pedidos_materiales_update" on public.pedidos_materiales as permissive for update to authenticated using (ve_pedido_material(obra_texto, obra_canonica_id)) with check (ve_pedido_material(obra_texto, obra_canonica_id));
create policy "authenticated_read_perfiles" on public.perfiles as permissive for select to authenticated using (true);
create policy "perfiles_update_propio" on public.perfiles as permissive for update to authenticated using ((id = ( SELECT auth.uid() AS uid))) with check ((id = ( SELECT auth.uid() AS uid)));
create policy "ubicacion_select" on public.ubicacion as permissive for select to authenticated using (true);
create policy "usuario_obra_delete" on public.usuario_obra as permissive for delete to authenticated using (( SELECT ve_economia() AS ve_economia));
create policy "usuario_obra_insert" on public.usuario_obra as permissive for insert to authenticated with check (( SELECT ve_economia() AS ve_economia));
create policy "usuario_obra_select" on public.usuario_obra as permissive for select to authenticated using ((( SELECT ve_economia() AS ve_economia) OR (usuario_id = ( SELECT auth.uid() AS uid))));
create policy "usuario_obra_update" on public.usuario_obra as permissive for update to authenticated using (( SELECT ve_economia() AS ve_economia)) with check (( SELECT ve_economia() AS ve_economia));
grant execute on function public._activo_usuario() to postgres;
grant execute on function public._activos_de_obra_inactiva_al_taller() to postgres;
grant execute on function public.asignacion_vigente(p_desde date, p_hasta date) to postgres;
grant execute on function public.asignacion_vigente(p_desde date, p_hasta date) to authenticated;
grant execute on function public.auditar_cambio() to postgres;
grant execute on function public.avisar_cambio_de_tabla() to postgres;
grant execute on function public.current_rol() to postgres;
grant execute on function public.current_rol() to authenticated;
grant execute on function public.es_administracion() to postgres;
grant execute on function public.mi_persona_id() to postgres;
grant execute on function public.mi_persona_id() to authenticated;
grant execute on function public.obra_codigo_guardia() to postgres;
grant execute on function public.obra_codigo_nuevo(p_id text, p_nombre text) to postgres;
grant execute on function public.obra_padre_coherente() to postgres;
grant execute on function public.set_actualizado_en() to postgres;
grant execute on function public.set_updated_at() to postgres;
grant execute on function public.ubicacion_de_obra(p_obra_id text) to postgres;
grant execute on function public.ubicacion_de_obra(p_obra_id text) to authenticated;
grant execute on function public.ve_economia() to postgres;
grant execute on function public.ve_obra(p_obra text) to postgres;
grant execute on function public.ve_obra_texto(p_texto text) to postgres;
grant execute on function public.ve_obra_texto(p_texto text) to authenticated;
grant execute on function public.ve_pedido_material(p_obra_texto text, p_obra_canonica_id text) to postgres;
grant execute on function public.ve_pedido_material(p_obra_texto text, p_obra_canonica_id text) to authenticated;

-- La secuencia que consume obra_codigo_nuevo (en producción vive con las obras).
create sequence if not exists public.obra_codigo_seq start 1000;
