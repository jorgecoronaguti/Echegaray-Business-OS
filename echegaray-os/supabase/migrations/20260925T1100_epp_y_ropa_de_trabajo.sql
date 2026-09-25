-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · EPP Y ROPA DE TRABAJO — dos clases nuevas, con talle, y entregables a una persona
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 25/09/2026, textual: «en módulo herramientas, sección inventario quiero que armes categorías
-- nuevas (una se puede armar sacándolo de "todo" la categoría epp y ropa de trabajo). saques los epp de
-- todo y ubicarlos ahí y darme una base de camisas, pantalones permitiendo hacer recuento de stock
-- posterior». Y en el legajo: la solapa «Auditoría» pasa a ser «EPP y Ropa de Trabajo», donde se le
-- asigna a cada persona lo que sale de esas dos listas.
--
-- ═══ POR QUÉ CLASE Y NO SÓLO CATEGORÍA ═══
-- La barra del Inventario filtra por CLASE (Herramientas · Maquinarias · Rodados · Todo). Un casco o
-- una camisa no son herramientas: si siguieran con clase 'herramienta' contarían como herramientas en
-- el Resumen, en la cola de etiquetas y en «nunca vistos». Por eso son clase 'epp' y 'ropa', y la
-- categoría las acompaña ('EPP', 'Ropa de trabajo'), atada por un CHECK para que no se contradigan.
--
-- ═══ LO QUE CAMBIA PARA ESAS DOS CLASES (y sólo para ellas) ═══
--   · Talle (`activo.talle`): un ítem por talle («Camisa de trabajo» S, M, L…). El recuento, el stock y
--     la entrega son por talle, que es como se compra y como se entrega.
--   · Stock 0 es un estado normal: la base de ropa nace en 0 y el dueño la cuenta después. Un casco
--     o una herramienta siguen sin poder tener 0 (eso es una baja).
--   · El recuento puede ENCONTRAR unidades donde la base no tenía ninguna («hay 12 camisas M en el
--     Taller»): `ajustar_existencia` crea la existencia. Para las herramientas sigue la regla de
--     22/09: lo que no estaba en un lugar entra con un movimiento.
--   · El recuento del Taller incluye todo el EPP y la ropa vivos, aunque estén en 0.
--   · Gastar la última unidad (baja parcial) deja el ítem en 0; no lo da de baja del catálogo.
--
-- ═══ ENTREGAR A UNA PERSONA ES UN MOVIMIENTO ═══
-- `ubicacion` suma el tipo 'persona' (una por persona, `persona_id`). Entregar = `mover_existencias`
-- del lugar de donde sale a la persona: descuenta del Taller, queda en el historial de movimientos con
-- quién entregó y cuándo, y la base no deja entregar más de lo que hay (sin stock negativo). Devolver
-- es el movimiento inverso; gastado o perdido, `dar_de_baja_parcial` en la persona. Lo que la persona
-- YA tenía antes de registrarlo se carga como recuento en la persona, sin descontar del Taller.
--
-- ═══ ÍTEMS QUE PASAN A EPP (revisados uno por uno, 247 activos al 25/09) ═══
--   Arnés de seguridad ARN-001…005 · Casco CAS-001…007 · Máscara facial MAS-001…003 · Facial FAC-001 ·
--   Careta de soldar CAR-003, 005, 006, 008, 009, 010, 016 (protección ocular y facial del soldador).
-- Cono (CON-001) y matafuego (MAT-001) estaban en «Seguridad (EPP)» y NO son EPP (señalización y
-- protección colectiva): pasan a «Seguridad de obra» y siguen siendo herramientas. «Seguridad (EPP)»
-- queda vacía y se retira.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

-- ── 1. CLASES, TALLE Y STOCK 0 ──────────────────────────────────────────────────────────────────
alter table public.activo drop constraint activo_clase_check;
alter table public.activo add constraint activo_clase_check
  check (clase in ('herramienta', 'equipo', 'rodado', 'epp', 'ropa'));

alter table public.activo add column talle text
  check (talle is null or length(btrim(talle)) between 1 and 12);
alter table public.activo add constraint activo_talle_chk check (talle is null or clase in ('epp', 'ropa'));
comment on column public.activo.talle is
  'Talle del EPP o la ropa (S…XXL, 38…56, calzado). Null = talle único. Un ítem por talle.';

alter table public.activo drop constraint activo_cantidad_check;
alter table public.activo add constraint activo_cantidad_check
  check (cantidad between 0 and 100000 and (cantidad >= 1 or clase in ('epp', 'ropa')));

-- ── 2. CATEGORÍAS ───────────────────────────────────────────────────────────────────────────────
insert into public.activo_categoria (nombre, orden) values
  ('EPP', 16), ('Ropa de trabajo', 17), ('Seguridad de obra', 18);

update public.activo set clase = 'epp', categoria = 'EPP'
 where codigo in ('ARN-001', 'ARN-002', 'ARN-003', 'ARN-004', 'ARN-005',
                  'CAS-001', 'CAS-002', 'CAS-003', 'CAS-004', 'CAS-005', 'CAS-006', 'CAS-007',
                  'MAS-001', 'MAS-002', 'MAS-003', 'FAC-001',
                  'CAR-003', 'CAR-005', 'CAR-006', 'CAR-008', 'CAR-009', 'CAR-010', 'CAR-016');
update public.activo set categoria = 'Seguridad de obra' where codigo in ('CON-001', 'MAT-001');
delete from public.activo_categoria c
 where c.nombre = 'Seguridad (EPP)' and not exists (select 1 from public.activo a where a.categoria = c.nombre);

alter table public.activo add constraint activo_clase_categoria_chk check (
  (clase = 'epp') = (categoria is not distinct from 'EPP')
  and (clase = 'ropa') = (categoria is not distinct from 'Ropa de trabajo')
);

-- Un mismo ítem no se repite en el mismo talle (vivo): la entrega elige ítem + talle y tiene que ser uno.
create unique index activo_vestimenta_talle_uq on public.activo (clase, lower(nombre), coalesce(talle, ''))
  where estado <> 'baja' and clase in ('epp', 'ropa');

-- ── 3. LA BASE: ROPA DE TRABAJO Y EPP QUE FALTABA, EN 0 ─────────────────────────────────────────
-- Stock 0: nadie contó todavía. El dueño lo carga con el recuento del Taller. Nada se inventa.
-- Fuentes: CCT 76/75 art. 59 (ropa —camisa y pantalón o mameluco— y botines cada seis meses), Dec.
-- 911/96 (casco, calzado de seguridad, ropa de lluvia y de abrigo, chaleco), Res. SRT 299/11 (constancia).
do $$
declare r record; v_n int := 0;
begin
  for r in
    select b.pre, b.nombre, b.clase, t.talle
      from (values
        (1,  'CAM', 'Camisa de trabajo',            'ropa', array['S','M','L','XL','XXL']),
        (2,  'PAN', 'Pantalón de trabajo',          'ropa', array['38','40','42','44','46','48','50','52','54','56']),
        (3,  'RMT', 'Remera de trabajo',            'ropa', array['S','M','L','XL','XXL']),
        (4,  'BUZ', 'Buzo de trabajo',              'ropa', array['S','M','L','XL','XXL']),
        (5,  'CMP', 'Campera de abrigo',            'ropa', array['S','M','L','XL','XXL']),
        (6,  'MAM', 'Mameluco',                     'ropa', array['S','M','L','XL','XXL']),
        (7,  'LLU', 'Equipo de lluvia',             'ropa', array['S','M','L','XL','XXL']),
        (8,  'CHA', 'Chaleco reflectivo',           'ropa', null::text[]),
        (9,  'BOT', 'Botín de seguridad',           'epp',  array['38','39','40','41','42','43','44','45','46']),
        (10, 'BTG', 'Bota de goma con puntera',     'epp',  array['38','39','40','41','42','43','44','45','46']),
        (11, 'GUA', 'Guantes de descarne',          'epp',  null::text[]),
        (12, 'GUA', 'Guantes moteados',             'epp',  null::text[]),
        (13, 'GUA', 'Guantes de nitrilo',           'epp',  null::text[]),
        (14, 'ANT', 'Anteojos de seguridad claros', 'epp',  null::text[]),
        (15, 'ANT', 'Anteojos de seguridad oscuros','epp',  null::text[]),
        (16, 'PRO', 'Protector auditivo endoaural', 'epp',  null::text[]),
        (17, 'PRO', 'Protector auditivo de copa',   'epp',  null::text[]),
        (18, 'RES', 'Respirador descartable N95',   'epp',  null::text[]),
        (19, 'CVD', 'Cabo de vida doble',           'epp',  null::text[]),
        (20, 'RDL', 'Rodilleras',                   'epp',  null::text[])
      ) b(orden, pre, nombre, clase, talles)
      cross join lateral unnest(coalesce(b.talles, array[null::text])) with ordinality t(talle, i)
     order by b.orden, t.i
  loop
    if exists (select 1 from public.activo a where a.clase = r.clase and lower(a.nombre) = lower(r.nombre)
                 and coalesce(a.talle, '') = coalesce(r.talle, '') and a.estado <> 'baja') then
      continue;
    end if;
    insert into public.activo (codigo, clase, nombre, categoria, talle, cantidad)
    values (public._siguiente_codigo(r.pre), r.clase, r.nombre,
            case r.clase when 'epp' then 'EPP' else 'Ropa de trabajo' end, r.talle, 0);
    v_n := v_n + 1;
  end loop;
  raise notice 'base de EPP y ropa: % ítems nuevos en 0', v_n;
end $$;

-- ── 4. LA PERSONA COMO LUGAR ────────────────────────────────────────────────────────────────────
alter table public.ubicacion drop constraint ubicacion_tipo_check;
alter table public.ubicacion add constraint ubicacion_tipo_check
  check (tipo in ('taller', 'obra', 'rodado', 'servicio_tecnico', 'tercero', 'persona'));
alter table public.ubicacion add column persona_id uuid references public.personas(id);
alter table public.ubicacion add constraint ubicacion_persona_chk check ((tipo = 'persona') = (persona_id is not null));
create unique index ubicacion_persona_uq on public.ubicacion (persona_id) where persona_id is not null;
comment on column public.ubicacion.persona_id is
  'La persona que ES este lugar (tipo persona): lo que se le entregó de EPP y ropa. El nombre es copia del legajo, se refresca en cada entrega.';

-- El lugar de una persona: se crea la primera vez y el nombre se refresca del legajo.
create function public._ubicacion_de_persona(p_persona uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_nombre text; v_id uuid;
begin
  select left(coalesce(nullif(btrim(nombre_para_mostrar), ''), nullif(btrim(nombre_completo), ''), 'Persona sin nombre'), 120)
    into v_nombre from personas where id = p_persona;
  if not found then raise exception 'la persona no existe'; end if;
  select id into v_id from ubicacion where persona_id = p_persona;
  if v_id is null then
    insert into ubicacion (tipo, persona_id, nombre) values ('persona', p_persona, v_nombre) returning id into v_id;
  else
    update ubicacion set nombre = v_nombre where id = v_id and nombre is distinct from v_nombre;
  end if;
  return v_id;
end $$;

create or replace function public._validar_destino(p_destino uuid) returns ubicacion
language plpgsql security definer set search_path = public as $$
declare v_dest ubicacion%rowtype;
begin
  select * into v_dest from ubicacion where id = p_destino;
  if not found then raise exception 'el destino no existe'; end if;
  if v_dest.archivada then raise exception 'el destino está archivado'; end if;
  if v_dest.tipo = 'obra' and not exists (select 1 from obra_canonica where id = v_dest.obra_id and estado = 'activa') then
    raise exception 'la obra de destino no está activa';
  end if;
  if v_dest.tipo = 'rodado' and exists (select 1 from activo where id = v_dest.activo_id and estado = 'baja') then
    raise exception 'el rodado de destino está dado de baja';
  end if;
  if v_dest.tipo = 'persona' and not exists (select 1 from personas where id = v_dest.persona_id and en_la_empresa) then
    raise exception 'la persona ya no está en la empresa: no se le entrega nada';
  end if;
  return v_dest;
end $$;

-- ── 5. STOCK 0 EN LAS FUNCIONES QUE YA EXISTEN ──────────────────────────────────────────────────
create or replace function public._activo_recalcular(p_activo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_total int; v_ubic uuid;
begin
  select coalesce(sum(cantidad), 0) into v_total from activo_existencia where activo_id = p_activo;
  if v_total = 0 then
    -- EPP y ropa en 0 es «sin stock», no una baja. Lo demás lo resuelve la baja, como siempre.
    update activo set cantidad = 0, ubicacion_id = null
     where id = p_activo and clase in ('epp', 'ropa') and (cantidad <> 0 or ubicacion_id is not null);
    return;
  end if;
  select e.ubicacion_id into v_ubic
    from activo_existencia e join activo a on a.id = e.activo_id
   where e.activo_id = p_activo
   order by e.cantidad desc, (e.ubicacion_id = a.ubicacion_id) desc, e.ubicacion_id
   limit 1;
  update activo set cantidad = v_total, ubicacion_id = v_ubic
   where id = p_activo and (cantidad, ubicacion_id) is distinct from (v_total, v_ubic);
end $$;

-- El recuento de EPP y ropa puede encontrar unidades donde no había ninguna.
create or replace function public.ajustar_existencia(p_activo uuid, p_ubicacion uuid, p_cantidad int, p_detalle text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_act activo%rowtype; v_hay int;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el activo no existe'; end if;
  if v_act.estado = 'baja' then raise exception '% está dado de baja', v_act.codigo; end if;
  if coalesce(p_cantidad, 0) < 1 then
    raise exception 'para dejar un lugar en 0 es una baja (robada, perdida, descartada o vendida) o un movimiento';
  end if;
  select cantidad into v_hay from activo_existencia where activo_id = p_activo and ubicacion_id = p_ubicacion for update;
  if v_hay is null then
    if v_act.clase not in ('epp', 'ropa') then
      raise exception '% no tiene unidades en ese lugar: se lleva con un movimiento', v_act.codigo;
    end if;
    perform public._validar_destino(p_ubicacion);
    insert into activo_existencia (activo_id, ubicacion_id, cantidad) values (p_activo, p_ubicacion, p_cantidad);
    insert into activo_ajuste (activo_id, ubicacion_id, antes, despues, motivo, detalle, usuario_id)
    values (p_activo, p_ubicacion, 0, p_cantidad, 'recuento', nullif(btrim(p_detalle), ''), v_usr);
    perform public._activo_recalcular(p_activo);
    return;
  end if;
  if v_hay = p_cantidad then return; end if;
  update activo_existencia set cantidad = p_cantidad where activo_id = p_activo and ubicacion_id = p_ubicacion;
  insert into activo_ajuste (activo_id, ubicacion_id, antes, despues, motivo, detalle, usuario_id)
  values (p_activo, p_ubicacion, v_hay, p_cantidad, 'recuento', nullif(btrim(p_detalle), ''), v_usr);
  perform public._activo_recalcular(p_activo);
end $$;

-- Gastar la última camisa no borra «Camisa de trabajo M» del catálogo: queda en 0.
create or replace function public.dar_de_baja_parcial(
  p_activo uuid, p_ubicacion uuid, p_cantidad int, p_motivo text, p_detalle text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_act activo%rowtype; v_hay int; v_total int;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el activo no existe'; end if;
  if v_act.estado = 'baja' then raise exception '% ya está dado de baja', v_act.codigo; end if;
  if p_motivo not in ('robada', 'perdida', 'descartada', 'vendida') then raise exception 'motivo de baja no válido'; end if;
  if coalesce(p_cantidad, 0) < 1 then raise exception 'la cantidad a dar de baja es 1 o más'; end if;
  select cantidad into v_hay from activo_existencia where activo_id = p_activo and ubicacion_id = p_ubicacion for update;
  if v_hay is null then raise exception '% no tiene unidades en ese lugar', v_act.codigo; end if;
  if p_cantidad > v_hay then
    raise exception '%: en ese lugar hay %, no se pueden dar de baja %', v_act.codigo, v_hay, p_cantidad using errcode = 'P0001';
  end if;
  select sum(cantidad) into v_total from activo_existencia where activo_id = p_activo;
  insert into activo_ajuste (activo_id, ubicacion_id, antes, despues, motivo, detalle, usuario_id)
  values (p_activo, p_ubicacion, v_hay, v_hay - p_cantidad, p_motivo, nullif(btrim(p_detalle), ''), v_usr);
  if p_cantidad = v_total and v_act.clase not in ('epp', 'ropa') then
    perform public.dar_de_baja_activo(p_activo, p_motivo, p_detalle);
    return;
  end if;
  if p_cantidad = v_hay then
    delete from activo_existencia where activo_id = p_activo and ubicacion_id = p_ubicacion;
  else
    update activo_existencia set cantidad = cantidad - p_cantidad where activo_id = p_activo and ubicacion_id = p_ubicacion;
  end if;
  perform public._activo_recalcular(p_activo);
end $$;

-- El alta acepta las dos clases nuevas, el talle y cantidad 0 para ellas.
drop function public.dar_de_alta_activo(text, text, uuid, text, text, text, boolean, text, int);
create function public.dar_de_alta_activo(
  p_clase text, p_nombre text, p_ubicacion uuid default null, p_categoria text default null,
  p_codigo text default null, p_patente text default null, p_alta_desde_obra boolean default false,
  p_foto_url text default null, p_cantidad int default 1, p_talle text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_codigo text; v_id uuid; v_cant int := coalesce(p_cantidad, 1);
begin
  if p_clase not in ('herramienta', 'equipo', 'rodado', 'epp', 'ropa') then raise exception 'clase no válida'; end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then raise exception 'falta el nombre'; end if;
  if v_cant < (case when p_clase in ('epp', 'ropa') then 0 else 1 end) then raise exception 'la cantidad es 1 o más'; end if;
  v_codigo := public._codigo_propuesto(p_codigo, p_nombre);
  insert into activo (codigo, clase, nombre, categoria, patente, alta_desde_obra, foto_url, creado_por, estado_por, cantidad, talle)
  values (v_codigo, p_clase, btrim(p_nombre),
          case p_clase when 'rodado' then 'Rodados' when 'epp' then 'EPP' when 'ropa' then 'Ropa de trabajo'
                       else nullif(btrim(p_categoria), '') end,
          nullif(upper(btrim(p_patente)), ''), p_alta_desde_obra, p_foto_url, v_usr, v_usr, v_cant,
          case when p_clase in ('epp', 'ropa') then nullif(upper(btrim(p_talle)), '') end)
  returning id into v_id;
  if p_clase = 'rodado' then insert into ubicacion (tipo, activo_id) values ('rodado', v_id); end if;
  if p_ubicacion is not null and v_cant > 0 then
    insert into activo_movimiento (activo_id, origen_id, destino_id, usuario_id, nota, cantidad)
    values (v_id, null, p_ubicacion, v_usr, 'alta', v_cant);
    insert into activo_existencia (activo_id, ubicacion_id, cantidad) values (v_id, p_ubicacion, v_cant);
    update activo set ubicacion_id = p_ubicacion where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.dar_de_alta_activo(text, text, uuid, text, text, text, boolean, text, int, text) from public, anon;
grant execute on function public.dar_de_alta_activo(text, text, uuid, text, text, text, boolean, text, int, text) to authenticated;

-- Editar: el talle se corrige desde la ficha (sólo EPP y ropa).
create or replace function public.editar_activo(p_activo uuid, p_datos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_lugares int; v_ubic uuid; v_cant int;
begin
  if p_datos ? 'cantidad' then
    v_cant := (p_datos->>'cantidad')::int;
    select count(*), min(ubicacion_id::text)::uuid into v_lugares, v_ubic from activo_existencia where activo_id = p_activo;
    if v_lugares > 1 and v_cant is distinct from (select cantidad from activo where id = p_activo) then
      raise exception 'está repartido en % lugares: la cantidad se corrige en cada lugar', v_lugares using errcode = 'P0001';
    end if;
    if v_lugares = 1 then
      perform public.ajustar_existencia(p_activo, v_ubic, v_cant, 'corregido al editar los datos');
    end if;
  end if;
  update activo set
    nombre              = coalesce(nullif(btrim(p_datos->>'nombre'), ''), nombre),
    categoria           = case when p_datos ? 'categoria' and clase not in ('epp', 'ropa') then nullif(btrim(p_datos->>'categoria'), '') else categoria end,
    cantidad            = case when p_datos ? 'cantidad' and v_lugares = 0 then v_cant else cantidad end,
    talle               = case when p_datos ? 'talle' and clase in ('epp', 'ropa') then nullif(upper(btrim(p_datos->>'talle')), '') else talle end,
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

-- El recuento del Taller cuenta también el EPP y la ropa que la base tiene en 0 ahí.
create or replace function public.abrir_recuento(p_ubicacion uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_ubic ubicacion%rowtype; v_id uuid; v_n int;
begin
  select * into v_ubic from ubicacion where id = p_ubicacion for update;
  if not found then raise exception 'el lugar no existe'; end if;
  if v_ubic.archivada then raise exception 'el lugar está archivado: no se cuenta'; end if;
  select id into v_id from activo_recuento where ubicacion_id = p_ubicacion and cerrado_en is null;
  if v_id is not null then return v_id; end if;
  select count(*) into v_n from activo_existencia e join activo a on a.id = e.activo_id
   where e.ubicacion_id = p_ubicacion and a.estado <> 'baja';
  if v_ubic.tipo = 'taller' then
    v_n := v_n + (select count(*) from activo a where a.clase in ('epp', 'ropa') and a.estado <> 'baja'
                    and not exists (select 1 from activo_existencia e where e.activo_id = a.id and e.ubicacion_id = p_ubicacion));
  end if;
  if v_n = 0 then raise exception 'no hay nada registrado en ese lugar: no hay qué contar'; end if;
  insert into activo_recuento (ubicacion_id, hecho_por) values (p_ubicacion, v_usr) returning id into v_id;
  insert into activo_recuento_linea (recuento_id, activo_id, esperado)
  select v_id, e.activo_id, e.cantidad from activo_existencia e join activo a on a.id = e.activo_id
   where e.ubicacion_id = p_ubicacion and a.estado <> 'baja';
  if v_ubic.tipo = 'taller' then
    insert into activo_recuento_linea (recuento_id, activo_id, esperado)
    select v_id, a.id, 0 from activo a
     where a.clase in ('epp', 'ropa') and a.estado <> 'baja'
       and not exists (select 1 from activo_existencia e where e.activo_id = a.id and e.ubicacion_id = p_ubicacion);
  end if;
  return v_id;
end $$;

-- ── 6. ENTREGAR A UNA PERSONA: [{activo, origen?, cantidad}] ────────────────────────────────────
-- Devuelve el lugar de la persona. Con `p_ya_la_tenia` no descuenta de ningún lado: registra lo que la
-- persona ya tenía antes de cargarlo acá, como recuento en la persona.
create function public.entregar_a_persona(
  p_persona uuid, p_items jsonb, p_nota text default null, p_ya_la_tenia boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_ubic uuid; v_it jsonb; v_act activo%rowtype; v_n int; v_hay int;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no hay nada para entregar';
  end if;
  v_ubic := public._ubicacion_de_persona(p_persona);
  perform public._validar_destino(v_ubic);
  for v_it in select value from jsonb_array_elements(p_items) loop
    select * into v_act from activo where id = (v_it->>'activo')::uuid;
    if not found then raise exception 'el ítem no existe'; end if;
    if v_act.clase not in ('epp', 'ropa') then
      raise exception '% no es EPP ni ropa de trabajo: se mueve desde Herramientas', v_act.codigo;
    end if;
    v_n := nullif(v_it->>'cantidad', '')::int;
    if coalesce(v_n, 0) < 1 then raise exception 'la cantidad a entregar es 1 o más'; end if;
    if p_ya_la_tenia then
      select cantidad into v_hay from activo_existencia where activo_id = v_act.id and ubicacion_id = v_ubic;
      perform public.ajustar_existencia(v_act.id, v_ubic, coalesce(v_hay, 0) + v_n,
        coalesce(nullif(btrim(p_nota), ''), 'ya la tenía: entregada antes de registrarla'));
    end if;
  end loop;
  if not p_ya_la_tenia then
    perform public.mover_existencias(p_items, v_ubic, coalesce(nullif(btrim(p_nota), ''), 'entrega'));
  end if;
  return v_ubic;
end $$;

revoke all on function public._ubicacion_de_persona(uuid), public.entregar_a_persona(uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.entregar_a_persona(uuid, jsonb, text, boolean) to authenticated;

-- ── 7. EL TALLE DE CADA PERSONA ─────────────────────────────────────────────────────────────────
-- Tabla aparte y no columnas de `personas`: `personas` tiene grants por columna y la vista del legajo
-- no publicaría un campo nuevo. Ve y edita el talle quien puede ver a la persona (la RLS de `personas`).
create table public.persona_talle (
  persona_id      uuid primary key references public.personas(id) on delete cascade,
  camisa          text check (camisa is null or length(btrim(camisa)) between 1 and 12),
  pantalon        text check (pantalon is null or length(btrim(pantalon)) between 1 and 12),
  calzado         text check (calzado is null or length(btrim(calzado)) between 1 and 12),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) default auth.uid()
);
comment on table public.persona_talle is
  'Talles de ropa y calzado de cada persona, para entregarle EPP y ropa de trabajo. Null = sin cargar.';
alter table public.persona_talle enable row level security;
create policy persona_talle_select on public.persona_talle for select to authenticated
  using (exists (select 1 from public.personas p where p.id = persona_id));
create policy persona_talle_insert on public.persona_talle for insert to authenticated
  with check (exists (select 1 from public.personas p where p.id = persona_id));
create policy persona_talle_update on public.persona_talle for update to authenticated
  using (exists (select 1 from public.personas p where p.id = persona_id))
  with check (exists (select 1 from public.personas p where p.id = persona_id));
revoke all on public.persona_talle from anon, public;
grant select, insert, update on public.persona_talle to authenticated;

-- ── LA CUENTA TIENE QUE CERRAR ──────────────────────────────────────────────────────────────────
do $$
declare n_epp int; n_ropa int; n_mal int; n_vieja int;
begin
  select count(*) into n_epp from public.activo where clase = 'epp';
  select count(*) into n_ropa from public.activo where clase = 'ropa';
  select count(*) into n_vieja from public.activo_categoria where nombre = 'Seguridad (EPP)';
  select count(*) into n_mal from public.activo a
   where a.estado <> 'baja'
     and a.cantidad is distinct from coalesce((select sum(cantidad) from public.activo_existencia e where e.activo_id = a.id), 0)
     and exists (select 1 from public.activo_existencia e where e.activo_id = a.id);
  if (select count(*) from public.activo where codigo in ('ARN-001','CAS-001','CAR-003','FAC-001') and clase = 'epp') <> 4 then
    raise exception 'los EPP no pasaron a su clase';
  end if;
  if n_vieja > 0 then raise exception '«Seguridad (EPP)» todavía tiene activos'; end if;
  if n_mal > 0 then raise exception '% activos con cantidad distinta de la suma por lugar', n_mal; end if;
  raise notice 'EPP: % ítems · Ropa de trabajo: % ítems', n_epp, n_ropa;
end $$;
