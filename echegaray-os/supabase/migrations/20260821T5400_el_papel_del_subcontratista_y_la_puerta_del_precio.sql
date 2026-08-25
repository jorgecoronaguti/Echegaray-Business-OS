-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL PAPEL DEL SUBCONTRATISTA ES UN REGISTRO — y el precio entra por una puerta con portero
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- La 2500 dejó `subcontrato.documentacion_ok`: un booleano que dice «está todo» sin decir QUÉ está.
-- Con eso, la pantalla 10 no puede dibujar lo que el contrato visual le pide —«ART sin cargar · el
-- paquete no puede iniciar»—, porque un false no distingue el contrato que falta del seguro
-- vencido, y sobre todo no distingue **falta** de **venció**. Un seguro vencido con la casilla en
-- true es exactamente el caso que hay que ver antes de que alguien entre a la obra.
--
-- ═══ POR QUÉ UNA FILA POR PAPEL Y NO MÁS COLUMNAS ═══
--
-- Cada papel tiene su propia vigencia y su propio archivo. En columnas serían seis columnas por
-- documento y una migración cada vez que el cliente pida uno más. La fila también deja registrar el
-- MISMO tipo dos veces —la ART renovada no borra la anterior—, que es lo que hace auditable «a la
-- fecha X esta gente estaba cubierta».
--
-- LA ART SIN VENCIMIENTO NO ES UNA ART CARGADA. Un papel sin fecha hasta cuándo vale no permite
-- decidir si hoy cubre a nadie, y guardar la fila igual publicaría un verde que no existe: por eso
-- el CHECK. El resto de los tipos sí puede no tener vencimiento (un contrato firmado no vence).
--
-- ═══ EL PRECIO Y LOS MONTOS SIGUEN SIENDO ECONÓMICOS ═══
--
-- La 3400 revocó el GRANT de columna de `subcontrato.precio_contratado` y `subcontrato_aporte.monto`
-- para `authenticated`, y lo dejó escrito: «cuando exista [la pantalla 10] tendrá que entrar por una
-- función con portero económico, no por un PATCH a la tabla». La pantalla existe: acá están las dos
-- puertas. Son SECURITY DEFINER porque el GRANT está revocado para todos los roles de la web —
-- Dirección incluida—, y por eso llevan sus dos porteros escritos adentro.
--
-- Y falta la otra mitad: leer el monto de CADA aporte. `subcontrato_costo` publica el total, que
-- alcanza para el costo real pero no para el panel, donde el aporte se lee línea por línea. La
-- vista de detalle repite los MISMOS dos porteros de `subcontrato_costo` — quien no ve economía no
-- recibe ni una fila, y el panel muestra «cargado» sin el número.

-- ── 1 · los papeles del paquete ───────────────────────────────────────────────────────────────
create table if not exists public.subcontrato_documento (
  id              uuid primary key default gen_random_uuid(),
  subcontrato_id  uuid not null references public.subcontrato (id) on delete cascade,
  tipo            text not null check (tipo in ('contrato', 'art', 'seguro_rc', 'alta_personal', 'otro')),
  descripcion     text,
  numero          text,
  fecha_emision   date,
  vence_el        date,
  archivo_url     text,
  drive_file_id   text,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  constraint subcontrato_documento_art_vence check (tipo <> 'art' or vence_el is not null)
);

create index if not exists subcontrato_documento_sub_idx on public.subcontrato_documento (subcontrato_id);

comment on table public.subcontrato_documento is
  'Un papel por fila, con su vigencia. Reemplaza al booleano `subcontrato.documentacion_ok` como '
  'fuente del bloqueo de inicio: el booleano dice «está todo», la fila dice qué está, hasta cuándo '
  'y dónde está el archivo. El booleano queda por compatibilidad, no se lee para decidir.';

comment on column public.subcontrato_documento.vence_el is
  'Hasta cuándo vale. Obligatorio en la ART: sin fecha no se puede afirmar que hoy cubra a nadie, y '
  'una fila sin vencimiento pintaría de verde una cobertura desconocida.';

alter table public.subcontrato_documento enable row level security;

-- LEER ES OPERATIVO, ESCRIBIR ES ADMINISTRACIÓN. El jefe de obra tiene que ver qué papel falta —es
-- lo que le impide arrancar el paquete—, pero dar por cargado un contrato o una ART es un acto con
-- efecto contractual y de seguridad: lo firma Administración.
drop policy if exists subcontrato_documento_lee_la_obra on public.subcontrato_documento;
create policy subcontrato_documento_lee_la_obra on public.subcontrato_documento for select to authenticated
  using (exists (select 1 from public.subcontrato s
                  where s.id = subcontrato_id and public.ve_obra(s.obra_id)));

drop policy if exists subcontrato_documento_escribe_admin on public.subcontrato_documento;
create policy subcontrato_documento_escribe_admin on public.subcontrato_documento for all to authenticated
  using (public.es_administracion()
         and exists (select 1 from public.subcontrato s
                      where s.id = subcontrato_id and public.ve_obra(s.obra_id)))
  with check (public.es_administracion()
              and exists (select 1 from public.subcontrato s
                           where s.id = subcontrato_id and public.ve_obra(s.obra_id)));

-- RLS NO ES GRANT: sin esto la policy no llega a evaluarse y Next lo muestra como un 404.
grant select, insert, update, delete on public.subcontrato_documento to authenticated;
grant all on public.subcontrato_documento to service_role;

-- ── 2 · el monto de cada aporte, con los porteros de la 3400 ──────────────────────────────────
create or replace view public.subcontrato_aporte_detalle with (security_invoker = false) as
select a.id,
       a.subcontrato_id,
       a.tipo,
       a.descripcion,
       a.cantidad,
       a.unidad,
       a.monto,
       a.fecha,
       a.registros_hh_id,
       r.horas as horas_hh
  from public.subcontrato_aporte a
  join public.subcontrato s on s.id = a.subcontrato_id
  left join public.registros_hh r on r.id = a.registros_hh_id
 where public.ve_obra(s.obra_id)
   and public.ve_economia();

comment on view public.subcontrato_aporte_detalle is
  'El monto aporte por aporte. Mismos dos porteros que `subcontrato_costo` (ve_obra + ve_economia) '
  'y por la misma razón: la columna `monto` está revocada por GRANT desde la 3400, así que la vista '
  'corre como su dueño y lleva el portero en el WHERE.';

grant select on public.subcontrato_aporte_detalle to authenticated;
grant select on public.subcontrato_aporte_detalle to service_role;

-- ── 3 · las dos puertas por las que entra la plata ────────────────────────────────────────────
create or replace function public.subcontrato_fijar_precio(p_subcontrato uuid, p_precio numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_obra text;
begin
  select obra_id into v_obra from public.subcontrato where id = p_subcontrato;
  if v_obra is null then
    raise exception 'el paquete % no existe', p_subcontrato using errcode = 'no_data_found';
  end if;
  -- LOS DOS PORTEROS, EN ESTE ORDEN Y ADENTRO. La función corre como su dueño: sin esto, cualquiera
  -- con sesión escribiría el precio de cualquier obra.
  if not public.ve_obra(v_obra) then
    raise exception 'no ves esta obra' using errcode = 'insufficient_privilege';
  end if;
  if not public.ve_economia() then
    raise exception 'el precio del subcontrato es económico' using errcode = 'insufficient_privilege';
  end if;
  if p_precio is not null and p_precio < 0 then
    raise exception 'el precio va en positivo';
  end if;
  update public.subcontrato set precio_contratado = p_precio where id = p_subcontrato;
end $$;

comment on function public.subcontrato_fijar_precio(uuid, numeric) is
  'La única puerta para escribir `precio_contratado`: la 3400 revocó el UPDATE de esa columna para '
  '`authenticated`. Corre como dueño y por eso lleva ve_obra + ve_economia adentro.';

create or replace function public.subcontrato_aporte_agregar(
  p_subcontrato uuid,
  p_tipo text,
  p_descripcion text,
  p_cantidad numeric default null,
  p_unidad text default null,
  p_monto numeric default null,
  p_fecha date default current_date,
  p_registros_hh uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_obra text; v_id uuid;
begin
  select obra_id into v_obra from public.subcontrato where id = p_subcontrato;
  if v_obra is null then
    raise exception 'el paquete % no existe', p_subcontrato using errcode = 'no_data_found';
  end if;
  if not public.ve_obra(v_obra) then
    raise exception 'no ves esta obra' using errcode = 'insufficient_privilege';
  end if;
  -- EL PORTERO ECONÓMICO SÓLO CUANDO HAY PLATA. Anotar «ayuda de gremio · 8 HH» es operativo y lo
  -- hace el jefe de obra; ponerle $ 62.400 a las placas es económico. Exigir `ve_economia` para las
  -- dos cosas dejaría sin registrar el aporte que más se subestima, que es el que no lleva monto.
  if p_monto is not null and not public.ve_economia() then
    raise exception 'el monto del aporte es económico' using errcode = 'insufficient_privilege';
  end if;
  insert into public.subcontrato_aporte
    (subcontrato_id, tipo, descripcion, cantidad, unidad, monto, fecha, registros_hh_id, creado_por)
  values
    (p_subcontrato, p_tipo, p_descripcion, p_cantidad, p_unidad, p_monto, coalesce(p_fecha, current_date),
     p_registros_hh, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

comment on function public.subcontrato_aporte_agregar(uuid, text, text, numeric, text, numeric, date, uuid) is
  'Alta de un aporte de Echegaray. El monto exige ve_economia; el aporte sin monto —HH de apoyo, '
  'transporte anotado sin costo— no, porque si no, no se registraría nunca y el costo real del '
  'paquete se seguiría subestimando, que es justo lo que la 2500 vino a evitar.';

revoke all on function public.subcontrato_fijar_precio(uuid, numeric) from public;
revoke all on function public.subcontrato_aporte_agregar(uuid, text, text, numeric, text, numeric, date, uuid) from public;
grant execute on function public.subcontrato_fijar_precio(uuid, numeric) to authenticated, service_role;
grant execute on function public.subcontrato_aporte_agregar(uuid, text, text, numeric, text, numeric, date, uuid)
  to authenticated, service_role;
