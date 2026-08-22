-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA RECOMENDACIÓN SE ACEPTA O SE DESCARTA — y las dos cosas quedan escritas
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `rendimiento_recomendado` calcula bien desde hace tres migraciones: mediana, mínimo dos obras, y
-- aprende en las DOS direcciones —si la obra rinde mejor que el análisis, el recomendado baja—.
-- Lo que faltaba era todo lo que viene después del número:
--
--   · **no había forma de aceptarla**. El comentario de la vista decía «se acepta a mano y crea una
--     versión nueva del análisis, con autor, fecha y muestra» y esa función no existía. La 4100 la
--     escribió (`nueva_version_de_analisis`); acá se la conecta al recomendador.
--   · **no había forma de descartarla**. Y descartar es la decisión más frecuente: la mitad de las
--     recomendaciones se miran y se dejan pasar porque la muestra viene de obras que no comparan.
--     Sin registro, la misma recomendación vuelve a aparecer mañana y alguien la vuelve a evaluar.
--   · **no quedaba constancia de nada**. Ni de quién decidió, ni con qué muestra, ni por qué.
--
-- ═══ LO QUE UNA DECISIÓN TIENE QUE CONGELAR ═══
--
-- `recomendacion_decision` guarda los números CON LOS QUE SE DECIDIÓ, no una referencia a la vista:
-- la vista cambia con la próxima obra medida, y entonces «se descartó una recomendación de 2,9»
-- pasaría a leerse «se descartó una de 3,4». Una decisión se audita contra lo que había cuando se
-- tomó, no contra lo que hay hoy.
--
-- ═══ Y LA OFERTA DE AYER NO SE MUEVE ═══
--
-- Aceptar crea una VERSIÓN NUEVA del análisis. La cotización congelada apunta a la versión vieja y
-- guarda su propia copia de la composición: ni su costo ni sus HH cambian. Eso es exactamente lo
-- que hace que el circuito pueda aprender sin reescribir la historia, y tiene un test propio.

-- ── 1 · la decisión, con los números con los que se tomó ──────────────────────────────────────
create table if not exists public.recomendacion_decision (
  id               uuid primary key default gen_random_uuid(),
  tarea_tipo_id    uuid not null references public.tarea_tipo (id) on delete cascade,
  hs_vigente       numeric,
  hs_recomendado   numeric,
  muestra          int,
  obras            int,
  dispersion       numeric,
  decision         text not null check (decision in ('aceptada', 'descartada')),
  motivo           text,
  analisis_nuevo_id uuid references public.analisis (id) on delete set null,
  decidido_por     uuid default auth.uid(),
  decidido_en      timestamptz not null default now()
);

create index if not exists recomendacion_decision_tarea_idx
  on public.recomendacion_decision (tarea_tipo_id, decidido_en desc);

comment on table public.recomendacion_decision is
  'Qué se hizo con cada recomendación y por qué. Guarda los NÚMEROS del momento —vigente, '
  'recomendado, muestra, obras, dispersión— y no una referencia a la vista: la vista cambia con la '
  'próxima obra medida y entonces la decisión de ayer se leería contra datos que no existían. '
  'Descartar también se registra: sin eso, la misma recomendación vuelve mañana y alguien la '
  'vuelve a evaluar de cero.';
comment on column public.recomendacion_decision.motivo is
  'Obligatorio al descartar (lo exige la función). Es lo que impide que «no la aplicamos» sea la '
  'respuesta permanente sin que nadie sepa contra qué se comparó.';

-- ── 2 · aceptar: versiona el análisis y deja constancia ───────────────────────────────────────
create or replace function public.aceptar_recomendacion(
  p_tarea_tipo_id uuid,
  p_motivo        text default null
) returns uuid language plpgsql security invoker as $$
declare r record; v_nuevo uuid; v_motivo text;
begin
  if not public.ve_economia() then
    raise exception 'aceptar una recomendación de rendimiento exige permiso económico';
  end if;

  select * into r from public.rendimiento_recomendado where tarea_tipo_id = p_tarea_tipo_id;
  if not found then raise exception 'la tarea tipo % no existe', p_tarea_tipo_id; end if;
  if r.hs_recomendado is null then
    raise exception 'no hay recomendación que aceptar para «%»: %', r.nombre, r.lectura;
  end if;
  if r.analisis_vigente_id is null then
    raise exception 'la tarea «%» no tiene un análisis vigente: no hay de qué crear una versión nueva', r.nombre;
  end if;

  v_motivo := coalesce(p_motivo, '') ||
    case when coalesce(p_motivo, '') = '' then '' else ' · ' end ||
    'Rendimiento aprendido de la obra: ' || r.hs_recomendado || ' hs/' || coalesce(r.unidad, 'un') ||
    ' (mediana de ' || r.muestra || ' muestras en ' || r.obras || ' obras' ||
    coalesce(', dispersión ' || r.dispersion, '') || '). Vigente anterior: ' ||
    coalesce(r.hs_analisis::text, 'sin publicar') || '.';

  v_nuevo := public.nueva_version_de_analisis(r.analisis_vigente_id, v_motivo, r.hs_recomendado);

  insert into public.recomendacion_decision
      (tarea_tipo_id, hs_vigente, hs_recomendado, muestra, obras, dispersion, decision, motivo,
       analisis_nuevo_id)
  values (p_tarea_tipo_id, r.hs_analisis, r.hs_recomendado, r.muestra, r.obras, r.dispersion,
          'aceptada', v_motivo, v_nuevo);

  return v_nuevo;
end $$;

comment on function public.aceptar_recomendacion(uuid, text) is
  'Acepta el rendimiento que la obra enseñó: crea una versión nueva del análisis escalando la mano '
  'de obra al valor recomendado y registra la decisión con la muestra que la sostiene. La cotización '
  'ya congelada NO se mueve: apunta a la versión vieja y tiene su propia copia de la composición.';

-- ── 3 · descartar: también es una decisión ────────────────────────────────────────────────────
create or replace function public.descartar_recomendacion(
  p_tarea_tipo_id uuid,
  p_motivo        text
) returns uuid language plpgsql security invoker as $$
declare r record; v_id uuid;
begin
  if not public.ve_economia() then
    raise exception 'descartar una recomendación de rendimiento exige permiso económico';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'descartar una recomendación exige un motivo: sin él, mañana nadie sabe contra qué se comparó';
  end if;

  select * into r from public.rendimiento_recomendado where tarea_tipo_id = p_tarea_tipo_id;
  if not found then raise exception 'la tarea tipo % no existe', p_tarea_tipo_id; end if;

  insert into public.recomendacion_decision
      (tarea_tipo_id, hs_vigente, hs_recomendado, muestra, obras, dispersion, decision, motivo)
  values (p_tarea_tipo_id, r.hs_analisis, r.hs_recomendado, r.muestra, r.obras, r.dispersion,
          'descartada', p_motivo)
  returning id into v_id;

  return v_id;
end $$;

comment on function public.descartar_recomendacion(uuid, text) is
  'Descartar es la decisión más frecuente y hasta hoy no dejaba rastro: la misma recomendación '
  'volvía a aparecer al día siguiente y alguien la volvía a evaluar de cero. El motivo es '
  'obligatorio, y sale de la lista de pendientes hasta que llegue una muestra nueva.';

-- ── 4 · lo que queda por decidir ──────────────────────────────────────────────────────────────
-- Una decisión CADUCA cuando llega una muestra nueva: la recomendación que se descartó con dos
-- obras vuelve a la lista cuando hay una tercera, porque es otra recomendación.
create or replace view public.recomendacion_pendiente with (security_invoker = true) as
select r.tarea_tipo_id, r.codigo, r.nombre, r.unidad,
       r.hs_analisis, r.hs_recomendado, r.hs_observado_promedio, r.hs_observado_mediana,
       r.dispersion, r.muestra, r.obras, r.lectura, r.ultima_muestra, r.analisis_vigente_id,
       case when r.hs_analisis > 0
            then round((r.hs_recomendado - r.hs_analisis) / r.hs_analisis * 100, 1) end as cambio_pct,
       case
         when r.hs_analisis is null                 then 'el análisis vigente no publica rendimiento'
         when r.hs_recomendado > r.hs_analisis      then 'la obra tarda más de lo que cotizamos'
         when r.hs_recomendado < r.hs_analisis      then 'la obra tarda menos de lo que cotizamos'
         else 'el análisis acierta: aceptar no cambiaría nada'
       end                                                                              as sentido,
       d.decidido_en                                                                    as decidido_antes_en,
       d.decision                                                                       as decision_anterior
  from public.rendimiento_recomendado r
  left join lateral (select decision, decidido_en
                       from public.recomendacion_decision x
                      where x.tarea_tipo_id = r.tarea_tipo_id
                      order by decidido_en desc limit 1) d on true
 where r.hs_recomendado is not null
   and (d.decidido_en is null or r.ultima_muestra > d.decidido_en);

comment on view public.recomendacion_pendiente is
  'Las recomendaciones que todavía nadie decidió, o que volvieron a estar vivas porque llegó una '
  'muestra nueva después de la última decisión. Publica el SENTIDO en palabras —tarda más, tarda '
  'menos, acierta— porque una tarea que aprende hacia mejor y una que aprende hacia peor no piden '
  'la misma reacción, y un signo suelto no lo dice.';

-- ── 5 · permisos ──────────────────────────────────────────────────────────────────────────────
-- La decisión sobre el estándar cambia el costo de todas las cotizaciones futuras: es ECONÓMICA.
alter table public.recomendacion_decision enable row level security;

drop policy if exists recomendacion_decision_economia on public.recomendacion_decision;
create policy recomendacion_decision_economia on public.recomendacion_decision for all to authenticated
  using (public.ve_economia()) with check (public.ve_economia());

grant select, insert, update, delete on public.recomendacion_decision to authenticated;
grant all on public.recomendacion_decision to service_role;
grant select on public.recomendacion_pendiente to authenticated;
grant select on public.recomendacion_pendiente to service_role;
grant execute on function public.aceptar_recomendacion(uuid, text)   to authenticated;
grant execute on function public.descartar_recomendacion(uuid, text) to authenticated;
