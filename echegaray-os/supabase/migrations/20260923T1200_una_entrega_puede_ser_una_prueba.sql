-- UNA ENTREGA PUEDE DECLARARSE PRUEBA: no toca la CAJA, no escribe Compras, y se borra entera.
--
-- ═══ DE DÓNDE SALE (dueño, 23/09/2026) ═══
--
-- Textual: *«voy a hacer muchas pruebas del modulo efectivo por todos lados, quiero q me permita
-- borrar/anular y q se quite de pestañas compras caja y no quede guardado en app.ecsas.com.ar»*.
--
-- Hoy lo único que se puede es ANULAR, y anular deja la fila: es correcto para una entrega real que se
-- cargó mal —hay que poder auditar qué pasó—, pero para una prueba es exactamente lo que no se quiere.
-- Y lo que ya se escribió en la pestaña Compras no lo deshace nadie: no existe puerta para eso, ni acá
-- ni en la app (lo confirmó el plan de fuente única del 23/09).
--
-- ═══ POR QUÉ SE MARCA LA ENTREGA Y NO LA PERSONA ═══
--
-- `personas.es_prueba` ya existía y ya frena la caja (20260922T1900): una entrega a «[PRUEBA E2E] QA
-- Campo» no llega a `_EFECTIVO_RAW`. Pero obliga a probar con una persona falsa, y el dueño quiere
-- probar «por todos lados» —con su gente, sus obras y sus montos—, que es la única prueba que vale.
-- La marca va en la ENTREGA: la misma persona real puede tener una entrega de verdad y una de prueba.
--
-- ═══ QUÉ CAMBIA UNA ENTREGA DE PRUEBA ═══
--
--   · NO entra a `efectivo_movimiento_caja`, que es lo que lee `_EFECTIVO_RAW` → el Sheet no la ve.
--   · NO deja escribir sus tickets en Compras (lo hace cumplir el especialista de rendiciones, que ya
--     frena a las personas de prueba por la misma razón).
--   · SE BORRA ENTERA con `borrar_entrega_de_prueba`, sin dejar rastro en la app.
--
-- Una entrega REAL no se borra nunca: se anula, y queda. Esa asimetría es a propósito.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

alter table public.efectivo_entrega add column if not exists es_prueba boolean not null default false;
comment on column public.efectivo_entrega.es_prueba is
  'Declarada prueba al crearla. No llega a la caja ni a Compras, y se borra entera con '
  'borrar_entrega_de_prueba. Una entrega real no se borra: se anula.';

-- ── LA CAJA NO VE LAS PRUEBAS, NI POR PERSONA NI POR ENTREGA ─────────────────────────────────────
create or replace view public.efectivo_movimiento_caja with (security_invoker = true) as
  select e.fecha, e.codigo, p.nombre_completo as persona,
         coalesce(o.nombre, 'Estructura') as destino, 'Entrega'::text as movimiento,
         -e.monto as importe, e.creada_en as registrado_en
    from public.efectivo_entrega e
    join public.personas p on p.id = e.persona_id
    left join public.obra_canonica o on o.id = e.obra_id
   where e.anulada_en is null and not coalesce(p.es_prueba, false) and not e.es_prueba
  union all
  select d.fecha, e.codigo, p.nombre_completo, coalesce(o.nombre, 'Estructura'), 'Devolución', d.monto, d.registrada_en
    from public.efectivo_devolucion d
    join public.efectivo_entrega e on e.id = d.entrega_id
    join public.personas p on p.id = e.persona_id
    left join public.obra_canonica o on o.id = e.obra_id
   where e.anulada_en is null and not coalesce(p.es_prueba, false) and not e.es_prueba;

-- ── ENTREGAR DECLARANDO QUE ES UNA PRUEBA ────────────────────────────────────────────────────────
-- Sobrecarga de 7 argumentos: la de 6 sigue publicada y sigue creando entregas REALES. Cambiarle la
-- firma a la que ya llama la app la rompe entre el drop y el create.
create or replace function public.entregar_efectivo(
  p_persona uuid, p_obra text, p_estructura boolean, p_monto numeric, p_para_que text,
  p_fecha date, p_es_prueba boolean
) returns text
language plpgsql security definer set search_path = public as $$
declare v_codigo text;
begin
  v_codigo := public.entregar_efectivo(p_persona, p_obra, p_estructura, p_monto, p_para_que, p_fecha);
  if coalesce(p_es_prueba, false) then
    update public.efectivo_entrega set es_prueba = true where codigo = v_codigo;
  end if;
  return v_codigo;
end $$;

-- ── BORRAR UNA PRUEBA: ENTERA, SIN RASTRO ────────────────────────────────────────────────────────
create or replace function public.borrar_entrega_de_prueba(p_entrega uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion(); e efectivo_entrega; v_imputadas integer;
begin
  select * into e from public.efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;

  -- UNA ENTREGA REAL NO SE BORRA. Si se cargó mal, se anula y queda el rastro de por qué.
  if not e.es_prueba then
    raise exception '% no está declarada prueba: se anula, no se borra.', e.codigo using errcode = 'P0001';
  end if;

  -- Y SI ALGO SUYO LLEGÓ A COMPRAS, TAMPOCO. Borrar acá dejaría esa fila del Sheet sin nada detrás.
  select count(*) into v_imputadas from public.efectivo_rendicion where entrega_id = p_entrega;
  if v_imputadas > 0 then
    raise exception '% tiene % comprobante(s) en Compras. Vaciá esas filas en el Sheet y volvé a intentar.',
      e.codigo, v_imputadas using errcode = 'P0001';
  end if;

  delete from public.efectivo_devolucion  where entrega_id = p_entrega;
  delete from public.efectivo_comprobante where entrega_id = p_entrega;
  delete from public.efectivo_entrega     where id = p_entrega;
  return e.codigo;
end $$;

revoke all on function public.entregar_efectivo(uuid, text, boolean, numeric, text, date, boolean),
  public.borrar_entrega_de_prueba(uuid) from public, anon;
grant execute on function public.entregar_efectivo(uuid, text, boolean, numeric, text, date, boolean),
  public.borrar_entrega_de_prueba(uuid) to authenticated;

notify pgrst, 'reload schema';
