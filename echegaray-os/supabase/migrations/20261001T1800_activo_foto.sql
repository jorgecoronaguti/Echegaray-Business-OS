-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · VARIAS FOTOS POR ACTIVO — la foto es evidencia del estado, no un adorno de la ficha
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 01/10/2026: «necesito q permitas cargar mas de una foto a cada una de las herramientas
-- rodados, materia, etc porque sirve como evidencia del estado de los mismos».
--
-- Hasta acá cada activo tenía UNA foto (`activo.foto_url`) y cada reporte otra (`activo_incidencia.
-- foto_url`): cambiar la foto pisaba la anterior, y con ella la evidencia de cómo estaba el equipo
-- antes. `activo_foto` guarda todas, con quién y cuándo; ninguna se borra ni se edita (no hay policy
-- de escritura ni función que lo haga).
--
-- ═══ LA PORTADA ═══
-- `activo.foto_url` NO se borra ni se renombra: lo leen el listado, la etiqueta y la vista legada
-- `herramientas`. Pasa a ser la PORTADA = la foto más reciente, y la mantiene el trigger de
-- `activo_foto` (una sola regla, en la base: no hay dos caminos que la puedan contradecir). La única
-- forma de que quede vacía con fotos guardadas es «Quitar la foto» (dueño, 23/09), que vacía la
-- portada sin tocar la evidencia.
--
-- ═══ LAS FUNCIONES VIEJAS SIGUEN ANDANDO ═══
-- `dar_de_alta_activo`, `editar_activo` y `reportar_problema_activo` escriben una foto en sus columnas
-- de siempre; no se redefinen. Dos triggers copian esa foto a `activo_foto`. Así el código que hoy
-- está publicado y el que viene después de esta migración escriben lo mismo, en cualquier orden de
-- despliegue (la base no puede ir adelante ni atrás del código de forma que la ficha se caiga).
--
-- ═══ POR QUÉ clock_timestamp() Y NO now() ═══
-- Varias fotos de una misma tanda entran en UNA transacción, y `now()` les da a todas la misma hora:
-- «de la más nueva a la más vieja» y «la portada es la más reciente» quedarían sin decidir.
--
-- NO SE APLICA DESDE UN AGENTE. La aplica el dueño (aplicar-migracion.mjs la envuelve en su transacción).

-- ── LA TABLA ────────────────────────────────────────────────────────────────────────────────────
create table public.activo_foto (
  id            uuid primary key default gen_random_uuid(),
  activo_id     uuid not null references public.activo(id),
  -- La URL pública del bucket `herramientas`, igual que `activo.foto_url`: las dos se comparan tal cual.
  url           text not null check (length(url) between 10 and 600),
  -- La foto de un reporte apunta a él; la de la ficha, a nada.
  incidencia_id uuid references public.activo_incidencia(id),
  -- null = no se sabe quién (una foto vieja sin dueño en el depósito). Vacío no es «nadie».
  subida_por    uuid references auth.users(id),
  creado_en     timestamptz not null default clock_timestamp(),
  -- La misma foto no se guarda dos veces en el mismo activo (un reintento no duplica la evidencia).
  constraint activo_foto_uq unique (activo_id, url)
);
create index activo_foto_activo_idx on public.activo_foto (activo_id, creado_en desc);
comment on table public.activo_foto is
  'Todas las fotos de cada activo (evidencia de su estado). No se borran. activo.foto_url es la más reciente (portada), la mantiene el trigger activo_foto_portada.';

-- ── RLS: leer todos, escribir nadie (sólo las funciones) — igual que activo_incidencia ───────────
alter table public.activo_foto enable row level security;
create policy activo_foto_select on public.activo_foto for select to authenticated using (true);
revoke all on public.activo_foto from anon, public;
grant select on public.activo_foto to authenticated;

-- ── LO QUE YA HAY: las fotos de hoy entran a la tabla ───────────────────────────────────────────
-- Antes del trigger de portada, para que copiar una foto no pise `activo.foto_url` antes de copiarla.
-- La foto de la ficha: la fecha y el autor son los del objeto en el depósito (lo que de verdad pasó);
-- si el objeto no está (una URL de otro lado), los del alta del activo, que es cuando se cargó.
insert into public.activo_foto (activo_id, url, subida_por, creado_en)
select a.id, a.foto_url,
       coalesce((select u.id from auth.users u where u.id = o.owner), a.creado_por),
       coalesce(o.created_at, a.creado_en)
  from public.activo a
  left join storage.objects o
    on o.bucket_id = 'herramientas'
   and o.name = substring(a.foto_url from '/storage/v1/object/public/herramientas/(.+)$')
 where a.foto_url is not null
on conflict (activo_id, url) do nothing;

-- La foto de cada reporte: su fecha y su autor son los del reporte.
insert into public.activo_foto (activo_id, url, incidencia_id, subida_por, creado_en)
select i.activo_id, i.foto_url, i.id, i.usuario_id, i.creado_en
  from public.activo_incidencia i
 where i.foto_url is not null
on conflict (activo_id, url) do nothing;

-- ── LA PORTADA = LA MÁS RECIENTE ────────────────────────────────────────────────────────────────
create function public._activo_poner_portada(p_activo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_url text;
begin
  select url into v_url from activo_foto where activo_id = p_activo order by creado_en desc, id desc limit 1;
  -- Sin fotos no se toca nada; y sólo se escribe si cambia (no dispara un aviso de tiempo real en vano).
  if v_url is not null then
    update activo set foto_url = v_url where id = p_activo and foto_url is distinct from v_url;
  end if;
end $$;

create function public._activo_foto_portada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._activo_poner_portada(new.activo_id);
  return null;
end $$;
create trigger activo_foto_portada
  after insert on public.activo_foto
  for each row execute function public._activo_foto_portada();

-- Las que se copiaron arriba: la portada queda en la más reciente de cada activo.
select public._activo_poner_portada(f.activo_id) from (select distinct activo_id from public.activo_foto) f;

-- ── LAS FUNCIONES VIEJAS ESCRIBEN EN LA TABLA SIN SABERLO ───────────────────────────────────────
-- `dar_de_alta_activo` / `editar_activo` ponen la foto en `activo.foto_url`: se copia. Cuando el que
-- cambió `foto_url` es el trigger de portada, la foto ya está y `on conflict` no hace nada: no hay bucle.
-- Vaciar la portada («Quitar la foto», 23/09) no borra nada de la tabla.
create function public._activo_foto_desde_activo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activo_foto (activo_id, url, subida_por)
  values (new.id, new.foto_url, coalesce(auth.uid(), case when tg_op = 'INSERT' then new.creado_por end))
  on conflict (activo_id, url) do nothing;
  return null;
end $$;
create trigger activo_foto_desde_alta
  after insert on public.activo
  for each row when (new.foto_url is not null)
  execute function public._activo_foto_desde_activo();
create trigger activo_foto_desde_ficha
  after update of foto_url on public.activo
  for each row when (new.foto_url is not null and new.foto_url is distinct from old.foto_url)
  execute function public._activo_foto_desde_activo();

-- `reportar_problema_activo` pone la foto en `activo_incidencia.foto_url`: se copia con su reporte.
create function public._activo_foto_desde_incidencia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activo_foto (activo_id, url, incidencia_id, subida_por)
  values (new.activo_id, new.foto_url, new.id, new.usuario_id)
  on conflict (activo_id, url) do nothing;
  return null;
end $$;
create trigger activo_foto_desde_reporte
  after insert on public.activo_incidencia
  for each row when (new.foto_url is not null)
  execute function public._activo_foto_desde_incidencia();

-- ── AGREGAR FOTOS (la ficha, el teléfono y las fotos de más de un reporte) ───────────────────────
-- Permisos iguales para todos los niveles (dueño, 21/09): sólo exige un usuario logueado. Las fotos
-- ya subieron del navegador al bucket; acá llegan las URLs. Devuelve cuántas fotos nuevas quedaron.
create function public.agregar_fotos_activo(p_activo uuid, p_urls text[], p_incidencia uuid default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_act activo%rowtype; v_url text; v_n int := 0; v_fila int;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el activo no existe'; end if;
  if v_act.estado = 'baja' then raise exception '% está dado de baja', v_act.codigo; end if;
  if coalesce(cardinality(p_urls), 0) = 0 then raise exception 'no llegó ninguna foto'; end if;
  if cardinality(p_urls) > 20 then raise exception 'son % fotos: el tope es 20 por vez', cardinality(p_urls); end if;
  if p_incidencia is not null
     and not exists (select 1 from activo_incidencia where id = p_incidencia and activo_id = p_activo) then
    raise exception 'ese reporte no es de %', v_act.codigo;
  end if;
  foreach v_url in array p_urls loop
    -- La misma forma que arma `rutaDeFoto` (logica/foto.ts) dentro del bucket público `herramientas`.
    if v_url is null or v_url !~ '^https?://[^/]+/storage/v1/object/public/herramientas/activos/[A-Za-z0-9_-]{1,80}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$' then
      raise exception 'la foto no está en el depósito de herramientas: %', left(coalesce(v_url, 'vacía'), 160);
    end if;
    insert into activo_foto (activo_id, url, incidencia_id, subida_por)
    values (p_activo, v_url, p_incidencia, v_usr)
    on conflict (activo_id, url) do nothing;
    get diagnostics v_fila = row_count;
    v_n := v_n + v_fila;
  end loop;
  return v_n;
end $$;

-- Desde 20260923T2000 los privilegios por defecto reparten EXECUTE a `authenticated`: las internas se
-- le sacan también a él, y la única puerta queda con su grant explícito.
revoke all on function public._activo_poner_portada(uuid), public._activo_foto_portada(),
  public._activo_foto_desde_activo(), public._activo_foto_desde_incidencia(),
  public.agregar_fotos_activo(uuid, text[], uuid) from public, anon, authenticated;
grant execute on function public.agregar_fotos_activo(uuid, text[], uuid) to authenticated;
