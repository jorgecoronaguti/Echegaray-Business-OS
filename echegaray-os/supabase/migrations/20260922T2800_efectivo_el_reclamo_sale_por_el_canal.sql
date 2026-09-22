-- EFECTIVO A RENDIR — EL RECLAMO Y EL PEDIDO DEL DATO SALEN POR EL CANAL, NO SE QUEDAN EN LA APP.
--
-- ═══ QUÉ ESTABA ROTO (22/09/2026) ═══
--
-- D03 dibuja «Reclamar rendición» y D05 dibuja «Pedir el dato … por el canal vinculado». Lo construido
-- tenía el botón de D03 APAGADO —no mandaba nada— y el pedido de D05 escribía la observación en la fila
-- del comprobante y ahí moría: la persona tenía que entrar sola a la app para enterarse de que le
-- faltaba un dato. Un botón que no manda nada es peor que no tener botón: dice que avisó.
--
-- ═══ POR QUÉ UNA COLA PROPIA Y NO UN POST DIRECTO ═══
--
-- La web corre en Vercel y no tiene —ni debe tener— el token del bot de Mattermost. Quien habla con el
-- chat es el orquestador de la VM. Entonces la web ENCOLA el aviso en una tabla del módulo y el
-- orquestador la vacía contra el canal oficial del área `rendicion` (el canal «Efectivo»). El vínculo
-- canal→área sigue siendo un DATO (`comunicacion.canales_area`), nunca una lista en el código.
--
-- La evidencia del efecto es `enviado_en` + `mm_post_id`: el id del post en el chat. Mientras estén en
-- null, la pantalla dice «encolado», no «avisado». Nunca se afirma que salió lo que todavía no salió.
--
-- ═══ EL CANAL NO PUBLICA PLATA ═══
--
-- El canal «Efectivo» lo ven todos los que rinden. Cuánto tiene cada uno en la mano es de esa persona y
-- de Administración: el texto del aviso nombra la entrega y la obra, nunca el monto ni el saldo. Es la
-- misma regla que ya cumple el especialista `rendiciones`.
--
-- ═══ LA DEVOLUCIÓN, CON LAS DOS FIRMAS ═══
--
-- D06 promete «se genera el comprobante de devolución con las dos firmas y se archiva en la carpeta de
-- la obra». Acá quedan las columnas que ese comprobante necesita —quién entrega, quién recibe, el papel—
-- y el disparador de su generación. La firma con el dedo es del teléfono (la pone el circuito de campo).
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

-- ── 1. CUÁNDO SE RECLAMÓ, Y CUÁNTAS VECES ────────────────────────────────────────────────────────
alter table public.efectivo_entrega add column if not exists reclamada_en  timestamptz;
alter table public.efectivo_entrega add column if not exists reclamada_por uuid;
alter table public.efectivo_entrega add column if not exists reclamos      integer not null default 0;
comment on column public.efectivo_entrega.reclamada_en is
  'Última vez que Administración reclamó la rendición POR EL CANAL. No es un plazo: el dueño decidió el '
  '22/09/2026 que no hay plazo de rendición. Es el registro de que se pidió.';

-- ── 2. LA COLA DEL MÓDULO HACIA EL CANAL ─────────────────────────────────────────────────────────
create table if not exists public.efectivo_aviso (
  id              uuid primary key default gen_random_uuid(),
  entrega_id      uuid not null references public.efectivo_entrega(id),
  comprobante_id  uuid references public.efectivo_comprobante(id),
  tipo            text not null check (tipo in ('reclamo', 'pedido_de_dato')),
  -- El texto ya armado, tal como se va a leer en el canal. Se arma en la base para que la app no pueda
  -- mandar cualquier cosa al chat de la empresa.
  texto           text not null,
  pedido_por      uuid not null,
  pedido_en       timestamptz not null default now(),
  intentos        integer not null default 0,
  enviado_en      timestamptz,
  mm_post_id      text,
  ultimo_error    text
);
create index if not exists efectivo_aviso_pendientes_idx on public.efectivo_aviso (pedido_en)
  where enviado_en is null;
create index if not exists efectivo_aviso_entrega_idx on public.efectivo_aviso (entrega_id);
comment on table public.efectivo_aviso is
  'Lo que la app le pide al canal Efectivo (reclamar una rendición, pedir el dato de un ticket). La vacía '
  'el orquestador de la VM, que es el único que tiene el token del bot. enviado_en + mm_post_id son la '
  'evidencia de que salió: sin ellos la pantalla dice «encolado», no «avisado».';

alter table public.efectivo_aviso enable row level security;
drop policy if exists efectivo_aviso_select on public.efectivo_aviso;
-- MISMA PUERTA QUE LA ENTREGA (20260922T2700): quien puede ver la entrega puede ver lo que se le pidió.
create policy efectivo_aviso_select on public.efectivo_aviso for select to authenticated
  using (exists (
    select 1 from public.efectivo_entrega e
     where e.id = entrega_id and public.ve_efectivo_entrega(e.persona_id, e.entregada_por)));
revoke all on public.efectivo_aviso from anon, public;
revoke insert, update, delete on public.efectivo_aviso from authenticated;
grant select on public.efectivo_aviso to authenticated;

-- ── 3. EL TEXTO DEL AVISO — SIN UN SOLO PESO ─────────────────────────────────────────────────────
create or replace function public._efectivo_destino(e public.efectivo_entrega) returns text
language sql stable security definer set search_path = public as $$
  select case when e.estructura then 'Estructura'
              else coalesce((select o.nombre from public.obra_canonica o where o.id = e.obra_id), 'sin obra') end
$$;
revoke all on function public._efectivo_destino(public.efectivo_entrega) from public, anon;

-- ── 4. RECLAMAR LA RENDICIÓN (D03) ───────────────────────────────────────────────────────────────
--
-- No bloquea nada ni vence nada: el dueño decidió que no hay plazo. Lo único que hace es pedir, por el
-- canal, que mande los tickets que faltan. Se puede reclamar de nuevo; lo que no se hace es apilar dos
-- pedidos sin mandar del mismo tipo, que en el canal se leería como el bot repitiéndose.
create or replace function public.reclamar_rendicion_entrega(p_entrega uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion();
        e public.efectivo_entrega; v_nombre text; v_id uuid; v_texto text;
begin
  select * into e from public.efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if e.anulada_en is not null then raise exception '% está anulada', e.codigo using errcode = 'P0001'; end if;
  if e.cerrada_en is not null then raise exception '% ya está cerrada: no hay nada que reclamar', e.codigo using errcode = 'P0001'; end if;

  select id into v_id from public.efectivo_aviso
   where entrega_id = p_entrega and tipo = 'reclamo' and enviado_en is null limit 1;
  if v_id is not null then
    raise exception 'ya hay un reclamo de % esperando salir por el canal', e.codigo using errcode = 'P0001';
  end if;

  select nombre_completo into v_nombre from public.personas where id = e.persona_id;
  -- SIN MONTOS: el canal lo ve todo el grupo (misma regla que el especialista `rendiciones`).
  v_texto := format(
    E'**%s** · %s — %s\nFaltan los comprobantes de esta entrega. Mandá acá la foto de cada ticket o factura y los cargo solos.\nLo que te queda por rendir lo ves en la app, en **Mi efectivo**.',
    e.codigo, coalesce(v_nombre, 'sin nombre'), public._efectivo_destino(e));

  insert into public.efectivo_aviso (entrega_id, tipo, texto, pedido_por)
  values (p_entrega, 'reclamo', v_texto, v_usr) returning id into v_id;
  update public.efectivo_entrega
     set reclamada_en = now(), reclamada_por = v_usr, reclamos = reclamos + 1
   where id = p_entrega;
  return v_id;
end $$;

-- ── 5. PEDIR EL DATO DE UN TICKET (D05) — LA OBSERVACIÓN, Y ADEMÁS EL AVISO ──────────────────────
--
-- `observar_comprobante_rendicion` seguía existiendo y seguía escribiendo la observación; lo que le
-- faltaba era la salida. Se reemplaza en el mismo nombre para que nada que ya la llame se quede afuera.
create or replace function public.observar_comprobante_rendicion(p_comprobante uuid, p_falta text) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion();
        c public.efectivo_comprobante; e public.efectivo_entrega; v_nombre text;
begin
  if nullif(trim(p_falta), '') is null then raise exception 'decí qué falta' using errcode = 'P0001'; end if;
  select * into c from public.efectivo_comprobante where id = p_comprobante and descartado_en is null for update;
  if c.id is null then raise exception 'el comprobante no existe o está descartado' using errcode = 'P0001'; end if;
  update public.efectivo_comprobante
     set observacion = trim(p_falta), observado_por = v_usr, observado_en = now(),
         respuesta = null, respondido_en = null
   where id = p_comprobante;

  select * into e from public.efectivo_entrega where id = c.entrega_id;
  select nombre_completo into v_nombre from public.personas where id = e.persona_id;
  -- UN PEDIDO POR VEZ: si ya hay uno sin mandar para este ticket, se reescribe con lo último pedido.
  update public.efectivo_aviso
     set texto = format(E'**%s** · %s — falta un dato de un ticket que mandaste.\n%s\nContestá acá mismo, o entrá a la app.',
                        e.codigo, coalesce(v_nombre, 'sin nombre'), trim(p_falta)),
         pedido_por = v_usr, pedido_en = now()
   where comprobante_id = p_comprobante and tipo = 'pedido_de_dato' and enviado_en is null;
  if not found then
    insert into public.efectivo_aviso (entrega_id, comprobante_id, tipo, texto, pedido_por)
    values (c.entrega_id, p_comprobante, 'pedido_de_dato',
            format(E'**%s** · %s — falta un dato de un ticket que mandaste.\n%s\nContestá acá mismo, o entrá a la app.',
                   e.codigo, coalesce(v_nombre, 'sin nombre'), trim(p_falta)),
            v_usr);
  end if;
end $$;

revoke all on function public.reclamar_rendicion_entrega(uuid) from public, anon;
grant execute on function public.reclamar_rendicion_entrega(uuid) to authenticated;
revoke all on function public.observar_comprobante_rendicion(uuid, text) from public, anon;
grant execute on function public.observar_comprobante_rendicion(uuid, text) to authenticated;

-- ── 6. LO QUE EL ORQUESTADOR USA PARA VACIAR LA COLA ─────────────────────────────────────────────
--
-- `security definer` y SIN grant a `authenticated`: la llama el worker de la VM con su conexión propia.
-- Marcar el envío es el ÚNICO lugar donde se escribe `enviado_en`, y pide el post id: sin el id del
-- mensaje en el chat no hay evidencia de que alguien pueda leerlo.
create or replace function public.efectivo_aviso_enviado(p_aviso uuid, p_post_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if nullif(trim(p_post_id), '') is null then raise exception 'sin post id no se marca enviado' using errcode = 'P0001'; end if;
  update public.efectivo_aviso set enviado_en = now(), mm_post_id = trim(p_post_id), ultimo_error = null
   where id = p_aviso and enviado_en is null;
end $$;

create or replace function public.efectivo_aviso_fallo(p_aviso uuid, p_error text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.efectivo_aviso set intentos = intentos + 1, ultimo_error = left(coalesce(p_error, ''), 400)
   where id = p_aviso and enviado_en is null;
end $$;
revoke all on function public.efectivo_aviso_enviado(uuid, text), public.efectivo_aviso_fallo(uuid, text)
  from public, anon, authenticated;

-- ── 7. LA DEVOLUCIÓN Y SU COMPROBANTE (D06) ──────────────────────────────────────────────────────
--
-- El papel de la devolución tiene DOS firmas: la de quien entrega el vuelto (la persona que tenía el
-- efectivo) y la de quien lo recibe (Administración). Hasta hoy la devolución se registraba sin ninguna.
alter table public.efectivo_devolucion add column if not exists firma_entrega     text;
alter table public.efectivo_devolucion add column if not exists firma_entrega_en  timestamptz;
alter table public.efectivo_devolucion add column if not exists firma_recibe      text;
alter table public.efectivo_devolucion add column if not exists firma_recibe_en   timestamptz;
alter table public.efectivo_devolucion add column if not exists papel_url         text;
alter table public.efectivo_devolucion add column if not exists papel_en          timestamptz;
comment on column public.efectivo_devolucion.papel_url is
  'El comprobante de devolución archivado. Ruta en el bucket `comprobantes` mientras el archivado en la '
  'carpeta de Drive de la obra lo hace el orquestador (la web no tiene credenciales de Google).';

-- FIRMAR LA DEVOLUCIÓN: cada uno firma lo suyo. Quien recibió el efectivo firma que lo entregó; quien
-- lo recibe firma que lo tiene. Nadie firma por el otro — es la misma regla que la conformidad (D02).
create or replace function public.firmar_devolucion_efectivo(p_devolucion uuid, p_trazo text) returns void
language plpgsql security definer set search_path = public as $$
declare d public.efectivo_devolucion; e public.efectivo_entrega; v_mia uuid := public.mi_persona_id();
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  if nullif(trim(p_trazo), '') is null then raise exception 'falta la firma' using errcode = 'P0001'; end if;
  select * into d from public.efectivo_devolucion where id = p_devolucion for update;
  if d.id is null then raise exception 'la devolución no existe' using errcode = 'P0001'; end if;
  select * into e from public.efectivo_entrega where id = d.entrega_id;
  if e.persona_id = v_mia then
    update public.efectivo_devolucion set firma_entrega = p_trazo, firma_entrega_en = now() where id = p_devolucion;
  elsif public.es_administracion() then
    update public.efectivo_devolucion set firma_recibe = p_trazo, firma_recibe_en = now() where id = p_devolucion;
  else
    raise exception 'la devolución la firman quien devuelve y quien recibe' using errcode = '42501';
  end if;
end $$;
revoke all on function public.firmar_devolucion_efectivo(uuid, text) from public, anon;
grant execute on function public.firmar_devolucion_efectivo(uuid, text) to authenticated;

create or replace function public.archivar_papel_devolucion(p_devolucion uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._efectivo_exigir_administracion();
  if nullif(trim(p_path), '') is null then raise exception 'falta el archivo' using errcode = 'P0001'; end if;
  update public.efectivo_devolucion set papel_url = trim(p_path), papel_en = now() where id = p_devolucion;
  if not found then raise exception 'la devolución no existe' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.archivar_papel_devolucion(uuid, text) from public, anon;
grant execute on function public.archivar_papel_devolucion(uuid, text) to authenticated;

-- ── 8. LO QUE LA FICHA LEE DE LA DEVOLUCIÓN (D03/D06) ────────────────────────────────────────────
-- `efectivo_devolucion` ya tiene su RLS; la vista agrega el nombre de quien recibió y el estado del
-- papel sin obligar a la pantalla a hacer tres viajes. Decorativo con LEFT JOIN: la RLS de `personas`
-- escondería la devolución propia (trampa pagada el 22/09 con `efectivo_entrega_saldo`).
create or replace view public.efectivo_devolucion_estado with (security_invoker = true) as
  select d.id, d.entrega_id, e.codigo as entrega, d.monto, d.fecha, d.recibida_por,
         p.nombre_completo as recibe, d.registrada_en, d.nota,
         (d.firma_entrega is not null) as firmo_entrega,
         (d.firma_recibe  is not null) as firmo_recibe,
         d.papel_url, d.papel_en
    from public.efectivo_devolucion d
    join public.efectivo_entrega e on e.id = d.entrega_id
    left join public.personas p on p.id = d.recibida_por;
revoke all on public.efectivo_devolucion_estado from anon, public;
grant select on public.efectivo_devolucion_estado to authenticated;

notify pgrst, 'reload schema';
