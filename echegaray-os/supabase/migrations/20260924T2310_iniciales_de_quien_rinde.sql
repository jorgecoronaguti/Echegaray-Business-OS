-- LAS INICIALES DE QUIEN PAGÓ CON EFECTIVO A RENDIR (dueño, 24/09/2026)
--
-- La regla del dueño: cada persona que recibe efectivo escribe SUS INICIALES A MANO en cada ticket que paga
-- con esa plata. El dueño sube las fotos a #comprobantes-gastos como siempre, sin escribir nada, y el bot
-- lee las iniciales e imputa el ticket a la entrega abierta de esa persona.
--
--   · `personas.iniciales_efectivo` — las letras de cada uno (2 a 4 mayúsculas, únicas). Se precargan SÓLO
--     para las personas con usuario en la app hoy («hacé lo de las iniciales de los usuarios que
--     actualmente tiene la plataforma»), con la lista que aprobó el dueño: JC, RE, EM y JP (Juan Pablo
--     Nievas es JP, no JPN). Las demás quedan vacías y se cargan desde la ficha de Personal.
--   · `efectivo_iniciales` — una fila por comprobante en el que el bot leyó iniciales: qué leyó, con qué
--     confianza, qué decidió (imputar solo, preguntar, nadie, sin entrega) y quién contestó.
--   · `vincular_rendiciones_pendientes` suma dos pasos: ata a la entrega lo que el bot cargó «A rendir»
--     por iniciales, y ejecuta los «sí, es de EM» que alguien contestó (por la cola de Compras, cuando la
--     fila ya está en el espejo). Cada paso va aislado: un comprobante que no se puede imputar queda con
--     su motivo y no frena a los demás ni a los tickets del canal Efectivo.
--
-- Depende de 20260924T2300 (`_efectivo_imputar_fila`, `efectivo_rendicion.origen`).
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

set local lock_timeout = '5s';

-- ─── 1 · las iniciales de cada persona ────────────────────────────────────────────────────────────
alter table public.personas add column if not exists iniciales_efectivo text;
alter table public.personas drop constraint if exists personas_iniciales_efectivo_check;
alter table public.personas add constraint personas_iniciales_efectivo_check
  check (iniciales_efectivo is null or iniciales_efectivo ~ '^[A-Z]{2,4}$');
create unique index if not exists personas_iniciales_efectivo_unica on public.personas (iniciales_efectivo)
  where iniciales_efectivo is not null;
comment on column public.personas.iniciales_efectivo is
  'Las iniciales que la persona escribe a mano en cada ticket que paga con efectivo a rendir. El bot las lee '
  'en #comprobantes-gastos e imputa el ticket a su entrega abierta. 2 a 4 mayúsculas, únicas.';
-- `personas` concede por COLUMNA: una columna nueva nace sin permiso (memoria «columna nueva nace sin permiso»).
grant select (iniciales_efectivo) on public.personas to authenticated;
grant insert (iniciales_efectivo) on public.personas to authenticated;
grant update (iniciales_efectivo) on public.personas to authenticated;

-- La ficha de Personal lee `persona_legajo`: la columna va AL FINAL y la vista conserva su
-- security_invoker = false, explícito (un create or replace sin `with` lo pierde).
create or replace view public.persona_legajo with (security_invoker = false) as
 SELECT id, nombre_completo, dni, cuil, fecha_nacimiento, nacionalidad, telefono, email, domicilio,
    contacto_emergencia, contacto_emergencia_telefono, fecha_ingreso, fecha_egreso, convenio_colectivo,
    categoria, especialidad, puesto, modalidad_liquidacion, art, obra_social, drive_folder_id, notas,
    legajo, en_la_empresa, nombre_para_mostrar,
    iniciales_efectivo
   FROM personas p
  WHERE es_administracion() AND (es_prueba IS NOT TRUE OR ( SELECT sesion_es_de_prueba() AS sesion_es_de_prueba));

-- La precarga aprobada (24/09/2026). Por la cuenta de usuario, que es lo que el dueño aprobó; sólo si el
-- campo está vacío, así una corrección manual hecha antes no se pisa.
update public.personas pe
   set iniciales_efectivo = x.ini
  from (values ('jorge@ecsas.com.ar', 'JC'), ('rodrigo@ecsas.com.ar', 'RE'),
               ('hys@ecsas.com.ar', 'EM'), ('ingenieria@ecsas.com.ar', 'JP')) as x(email, ini)
  join auth.users u on lower(u.email) = x.email
  join public.perfiles pf on pf.id = u.id
 where pe.id = pf.persona_id and pe.iniciales_efectivo is null;

-- ─── 2 · lo que el bot leyó y decidió, por comprobante ────────────────────────────────────────────
create table if not exists public.efectivo_iniciales (
  id              uuid primary key default gen_random_uuid(),
  clave           text not null unique,
  fajo_id         uuid,
  letras          text not null,
  confianza       numeric(4,3),
  -- auto = se cargó «A rendir» solo · pregunta = se cargó común y se preguntó · si / no = contestado ·
  -- sin_entrega = la persona no tiene entrega abierta · sin_coincidencia = las letras no son de nadie ·
  -- error = el «sí» no se pudo aplicar (motivo)
  estado          text not null check (estado in ('auto', 'pregunta', 'si', 'no', 'sin_entrega', 'sin_coincidencia', 'error')),
  persona_id      uuid references public.personas(id),
  entrega_id      uuid references public.efectivo_entrega(id) on delete set null,
  candidatos      jsonb not null default '[]'::jsonb,
  proveedor       text,
  mm_post_id      text,
  channel_id      text,
  root_post_id    text,
  pregunta_post_id text,
  enviado_por     uuid,
  respondido_por  uuid,
  respondido_en   timestamptz,
  vinculado_en    timestamptz,
  motivo          text,
  creado_en       timestamptz not null default now()
);
create index if not exists efectivo_iniciales_pregunta_idx on public.efectivo_iniciales (root_post_id) where estado = 'pregunta';
create index if not exists efectivo_iniciales_pendiente_idx on public.efectivo_iniciales (estado) where vinculado_en is null;
comment on table public.efectivo_iniciales is
  'Cada comprobante de #comprobantes-gastos en el que el bot leyó iniciales manuscritas: qué leyó, qué decidió y '
  'quién contestó la pregunta. Lo escribe el bot; lo ve Administración.';
alter table public.efectivo_iniciales enable row level security;
drop policy if exists efectivo_iniciales_select on public.efectivo_iniciales;
create policy efectivo_iniciales_select on public.efectivo_iniciales for select to authenticated
  using ((select public.ve_economia()));
revoke all on public.efectivo_iniciales from anon, public;
revoke insert, update, delete, truncate on public.efectivo_iniciales from authenticated;
grant select on public.efectivo_iniciales to authenticated;

-- ─── 3 · la reconciliación, con los dos pasos nuevos ──────────────────────────────────────────────
create or replace function public.vincular_rendiciones_pendientes() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
  m integer := 0;
  i record;
  v_fila integer;
begin
  -- (a) los tickets del canal Efectivo y de la app: IGUAL que la 20260922T1500.
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
   order by cc.clave, c.enviado_en
  on conflict (compra_clave) do nothing;
  get diagnostics n = row_count;

  -- (b) lo que el bot cargó «A rendir» por las iniciales: ya está escrito así, sólo falta el vínculo.
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

  -- (c) los «sí» contestados: la fila se cargó «Efectivo», así que se imputa por la cola de Compras,
  -- cuando el espejo ya la tiene. Aislado: un «sí» que no se puede aplicar queda en `error` con su motivo.
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
      update efectivo_iniciales set estado = 'error', motivo = sqlerrm where id = i.id;
    end;
  end loop;
  return n + m;
end $$;
revoke all on function public.vincular_rendiciones_pendientes() from public, anon, authenticated;

notify pgrst, 'reload schema';
