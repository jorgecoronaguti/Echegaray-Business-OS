-- PAGO EN EFECTIVO A CUENTA DE LA LIQUIDACIÓN, SIN ENTREGA A RENDIR (dueño, 30/09/2026).
--
-- «le pagué 100 a rodrigo», «150000 de adelanto a emiliano maldonado» escritos en el canal Efectivo.
-- Hasta hoy el adelanto exigía una entrega abierta del que escribe (`rendir_adelanto_de_sueldo`): sin entrega
-- el bot rechazaba. Esto es el mismo pago en la MISMA celda («Pagado efectivo» de `liquidacion_linea`, la que
-- lee y edita Liquidación de horas), pero pagado con la caja y no con la plata de una persona: no rinde nada.
--
-- No hay tabla de pagos paralela: el pago vive en `liquidacion_linea`. La tabla de abajo es sólo el registro
-- de idempotencia y auditoría (quién lo escribió, desde qué post), interna: la app no la lee.
--
-- ADITIVA: una tabla y una función nuevas. El código del bot anda antes de aplicarla (contesta que el pago
-- directo todavía no está habilitado y no escribe nada) y después.

create table if not exists public.pago_efectivo_sueldo (
  id               uuid primary key default gen_random_uuid(),
  clave            text not null unique check (clave like 'pago-efectivo:%'),
  persona_id       uuid not null references public.personas (id),
  fecha            date not null,
  importe          numeric(14, 2) not null check (importe > 0),
  expresion        text,
  quincena_desde   date not null,
  grupo            text not null,
  origen_post_id   text,
  registrado_por   uuid not null,
  creado_en        timestamptz not null default now()
);

alter table public.pago_efectivo_sueldo enable row level security;
revoke all on public.pago_efectivo_sueldo from public, anon, authenticated;

comment on table public.pago_efectivo_sueldo is
  'Registro de los pagos en efectivo a cuenta de la liquidación escritos por el chat SIN entrega a rendir. El pago en sí vive en liquidacion_linea.pagado_efectivo; esto sólo da idempotencia por clave y dice quién lo escribió.';

-- La llama SÓLO el bot (service_role), después de pasar el canal oficial de `rendicion` y la identidad de quien
-- escribe. `p_formula`/`p_valor` los arma el bot con el mismo lector de cuentas que la celda de la app; acá se
-- exige que p_valor = p_antes + p_importe y que p_antes siga siendo lo que la celda muestra, bajo candado.
create or replace function public.pago_efectivo_de_sueldo(
  p_persona uuid, p_fecha date, p_importe numeric, p_expresion text,
  p_antes numeric, p_formula text, p_valor numeric,
  p_clave text, p_post text, p_registrado_por uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  emp personas;
  cel jsonb;
  cab liquidacion_quincena;
  lin liquidacion_linea;
  v_antes numeric;
  v_espejo numeric;
  r pago_efectivo_sueldo;
begin
  if p_clave is null or p_clave not like 'pago-efectivo:%' then
    raise exception 'clave de pago inválida' using errcode = 'P0001';
  end if;
  select * into r from pago_efectivo_sueldo where clave = p_clave;
  if r.id is not null then
    return jsonb_build_object('ya_estaba', true, 'id', r.id, 'monto', r.importe,
      'desde', r.quincena_desde, 'grupo', r.grupo);
  end if;

  if p_importe is null or p_importe <= 0 then raise exception 'un pago de $ 0 no es un pago' using errcode = 'P0001'; end if;
  if round(p_valor, 2) <> round(p_antes + p_importe, 2) then
    raise exception 'la cuenta no cierra: % + % no es %', p_antes, p_importe, p_valor using errcode = 'P0001';
  end if;
  if p_formula is null or left(p_formula, 1) <> '=' or length(p_formula) > 500 then
    raise exception 'la cuenta de la celda no es válida' using errcode = 'P0001';
  end if;
  if p_registrado_por is null then raise exception 'falta quién lo escribió' using errcode = 'P0001'; end if;

  select * into emp from personas where id = p_persona;
  if emp.id is null or not coalesce(emp.en_la_empresa, false) or coalesce(emp.es_prueba, false) then
    raise exception 'esa persona no está en el plantel' using errcode = 'P0001';
  end if;

  cel := public.adelanto_de_sueldo_celda(p_persona, p_fecha);
  insert into liquidacion_quincena (desde, hasta, grupo)
  values ((cel ->> 'desde')::date, (cel ->> 'hasta')::date, cel ->> 'grupo')
  on conflict (desde, hasta, grupo) do nothing;
  select * into cab from liquidacion_quincena
   where desde = (cel ->> 'desde')::date and hasta = (cel ->> 'hasta')::date and grupo = cel ->> 'grupo'
   for update;
  if cab.estado = 'cerrada' then
    raise exception 'la quincena % a % (%) está cerrada: no recibe pagos', cab.desde, cab.hasta, cab.grupo
      using errcode = 'P0001';
  end if;

  insert into liquidacion_linea (liquidacion_id, persona_id) values (cab.id, p_persona)
  on conflict (liquidacion_id, persona_id) do nothing;
  select * into lin from liquidacion_linea where liquidacion_id = cab.id and persona_id = p_persona for update;
  select sum(adelanto) into v_espejo from jornales_bloque_persona
   where persona_id = p_persona and quincena_desde between cab.desde and cab.hasta and adelanto is not null;
  v_antes := round(coalesce(lin.pagado_efectivo, lin.adelanto_manual, v_espejo, 0), 2);
  if v_antes <> round(p_antes, 2) then
    raise exception 'la celda cambió mientras se cargaba (ahora dice %): volvé a intentar', v_antes
      using errcode = '40001';
  end if;

  update liquidacion_linea
     set pagado_efectivo = round(p_valor, 2),
         formulas = coalesce(formulas, '{}'::jsonb) || jsonb_build_object('pagadoEfectivo', p_formula),
         actualizado_en = now()
   where id = lin.id
  returning * into lin;

  insert into pago_efectivo_sueldo (clave, persona_id, fecha, importe, expresion, quincena_desde, grupo, origen_post_id, registrado_por)
  values (p_clave, p_persona, p_fecha, round(p_importe, 2), p_expresion, cab.desde, cab.grupo, p_post, p_registrado_por)
  returning * into r;

  return jsonb_build_object('ya_estaba', false, 'id', r.id,
    'desde', cab.desde, 'hasta', cab.hasta, 'grupo', cab.grupo,
    'pagado_efectivo', lin.pagado_efectivo, 'formula', lin.formulas ->> 'pagadoEfectivo',
    'pagada', lin.pagada_en is not null);
end $$;

revoke all on function public.pago_efectivo_de_sueldo(uuid, date, numeric, text, numeric, text, numeric, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.pago_efectivo_de_sueldo(uuid, date, numeric, text, numeric, text, numeric, text, text, uuid)
  to service_role;
