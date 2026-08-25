-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL PERÍODO DE HH SE CIERRA — y cerrado significa que ya no entran horas
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- La pantalla «21 · Cuadrillas y HH» pide una tercera vista —Períodos de HH— con una columna ESTADO
-- (Abierto / Cerrado) y un botón «Cerrar agosto». Ese estado NO EXISTE en ninguna parte:
-- `periodoHH.ts` calcula ventanas de fecha (día, semana, quincena, mes) y nada más. Una pantalla que
-- dijera «Cerrado» leyendo una ventana de fechas estaría afirmando algo que la base no sabe.
--
-- ═══ QUÉ EXISTE HOY QUE HACE ESTO, Y POR QUÉ NO ALCANZA ═══
--
-- Nada. `registros_hh` guarda las horas y `solicitud_correccion_asistencia` los pedidos de
-- corrección, pero ninguna de las dos tiene el hecho «este mes ya se liquidó». Sin él, cerrar sería
-- una decoración de pantalla: al día siguiente alguien carga tres jornadas de agosto y el total con
-- el que se liquidó deja de coincidir con el total que la base devuelve, sin un solo error.
--
-- ═══ LO QUE LE DA SENTIDO AL CIERRE ES EL TRIGGER, NO LA COLUMNA ═══
--
-- Un estado que no bloquea nada es una etiqueta. Por eso el cierre viene con `registros_hh_periodo_
-- cerrado`: un mes cerrado rechaza altas, modificaciones Y bajas de horas de ese mes. La baja entra
-- a propósito — borrar una fila de un mes liquidado mueve el total exactamente igual que agregarla.
--
-- ═══ CERRAR ES ECONÓMICO ═══
--
-- Cerrar un período es la firma de que ESE es el número con el que se liquida: mano de obra sobre
-- obras, y jornales sobre personas. Por eso escribe `ve_economia()` (Dirección y Administración) y
-- no `es_administracion()`, que desde el 19/08 incluye al jefe de obra. El jefe de obra CARGA horas;
-- no declara cuál es el número final.
--
-- ═══ Y NO SE PUEDE CERRAR CON CORRECCIONES PENDIENTES ═══
--
-- Una solicitud de corrección pendiente es una hora que todavía puede cambiar. Cerrar con pedidos
-- sin resolver es firmar un total que ya se sabe provisorio — y encima el trigger dejaría a
-- Administración sin poder aplicar la corrección que ella misma aprobó. La validación vive DENTRO de
-- `cerrar_periodo_hh` porque tiene que contar los pedidos de TODO el plantel: la RLS de
-- `solicitud_correccion_asistencia` le muestra a cada uno lo suyo, y un conteo filtrado por RLS
-- diría «no queda ninguna» mirando media tabla.
--
-- ═══ RLS NO ES GRANT ═══
--
-- Cada objeto lleva su grant pegado a su definición. Y `periodo_hh` NO tiene grant de insert/update
-- para `authenticated` a propósito: si lo tuviera, alguien con permiso económico podría escribir
-- `estado = 'cerrado'` por PostgREST salteándose la validación de correcciones pendientes. La única
-- puerta es la función. La policy de escritura se declara igual —falla cerrado si mañana alguien
-- agrega el grant sin leer esto.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1 · EL PERÍODO ──────────────────────────────────────────────────────────────────────────────
--
-- `periodo` es el PRIMER DÍA DEL MES, y el CHECK lo impone: sin él conviven '2026-08-01' y
-- '2026-08-31' como dos períodos distintos del mismo agosto, el único no restringe nada y el trigger
-- bloquea sólo la mitad de las cargas. La clave la impone la base, no la costumbre de quien escribe.
create table if not exists public.periodo_hh (
  id          uuid primary key default gen_random_uuid(),
  periodo     date not null unique
                check (periodo = date_trunc('month', periodo)::date),
  estado      text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  -- QUIÉN Y CUÁNDO. Cerrar un período tiene efecto económico: no es metadato, es parte del hecho.
  -- Van junto al estado: un 'cerrado' sin sello sería un cierre que nadie hizo.
  cerrado_por uuid references auth.users(id) on delete set null,
  cerrado_en  timestamptz,
  notas       text,
  creado_en   timestamptz not null default now(),
  constraint periodo_hh_cerrado_tiene_sello
    check ((estado = 'cerrado') = (cerrado_en is not null))
);

comment on table public.periodo_hh is
  'El estado de liquidación de un mes de HH. Abierto: las horas todavía se cargan. Cerrado: el total es el que se liquidó y registros_hh no acepta más movimientos de ese mes. Sólo se escribe por cerrar_periodo_hh() / reabrir_periodo_hh().';
comment on column public.periodo_hh.periodo is
  'Primer día del mes. El CHECK lo impone: sin él, agosto tendría 31 períodos posibles y el trigger bloquearía sólo el que coincidiera.';

alter table public.periodo_hh enable row level security;

-- LEE quien administra el módulo de Personal —incluye al jefe de obra: necesita saber si el mes
-- sigue abierto ANTES de cargar horas que van a rebotar.
drop policy if exists periodo_hh_lee on public.periodo_hh;
create policy periodo_hh_lee on public.periodo_hh
  for select to authenticated using (public.es_administracion());

-- ESCRIBE sólo quien ve economía. Hoy no hay grant que active esta policy (ver arriba): queda
-- declarada para que el día que alguien agregue el grant, el portero ya esté puesto.
drop policy if exists periodo_hh_escribe on public.periodo_hh;
create policy periodo_hh_escribe on public.periodo_hh
  for all to authenticated
  using (public.ve_economia()) with check (public.ve_economia());

grant select on public.periodo_hh to authenticated;
grant all on public.periodo_hh to service_role;

-- ── 2 · CERRAR: VALIDA Y SELLA ──────────────────────────────────────────────────────────────────
--
-- `security definer` con el portero comprobado ADENTRO, igual que `aprobar_correccion_asistencia`.
-- No es un atajo para saltear la RLS: es lo que permite contar las correcciones pendientes de TODO
-- el plantel sin abrirle esa lectura a nadie más.
--
-- Devuelve el id de la fila sellada. El efecto es la fila, no el «ok» de la función: quien llama la
-- vuelve a leer.
create or replace function public.cerrar_periodo_hh(p_periodo date, p_notas text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo    date := date_trunc('month', p_periodo)::date;
  v_estado     text;
  v_pendientes int;
  v_id         uuid;
begin
  if not public.ve_economia() then
    raise exception 'Cerrar un período de HH tiene efecto económico: sólo Dirección o Administración'
      using errcode = '42501';
  end if;

  -- `for update` porque dos personas pueden tener la pantalla abierta a la vez: sin el lock las dos
  -- leen «abierto» y las dos sellan, y la segunda pisa el sello de la primera.
  select estado into v_estado from public.periodo_hh where periodo = v_periodo for update;
  if v_estado = 'cerrado' then
    raise exception 'El período % ya estaba cerrado', to_char(v_periodo, 'MM/YYYY')
      using errcode = '22023';
  end if;

  select count(*) into v_pendientes
    from public.solicitud_correccion_asistencia s
   where s.estado = 'pendiente'
     and date_trunc('month', s.fecha)::date = v_periodo;
  if v_pendientes > 0 then
    raise exception 'Quedan % correcciones de asistencia pendientes de %: resolvelas antes de cerrar',
      v_pendientes, to_char(v_periodo, 'MM/YYYY')
      using errcode = '22023';
  end if;

  insert into public.periodo_hh (periodo, estado, cerrado_por, cerrado_en, notas)
  values (v_periodo, 'cerrado', auth.uid(), now(), p_notas)
  on conflict (periodo) do update
    set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_en = now(),
        -- `periodo_hh.notas` SIN esquema: en un ON CONFLICT la fila existente se referencia por el
        -- nombre de la tabla, y `public.periodo_hh.notas` no compila.
        notas = coalesce(excluded.notas, periodo_hh.notas)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.cerrar_periodo_hh(date, text) is
  'Cierra un mes de HH: valida permiso económico y que no queden correcciones pendientes, y sella con quién y cuándo. Devuelve el id de la fila — el efecto se relee, no se cree.';

grant execute on function public.cerrar_periodo_hh(date, text) to authenticated;

-- ── 3 · REABRIR: EL ERROR TIENE VUELTA, PERO BORRA EL SELLO ─────────────────────────────────────
--
-- Sin reabrir, un cierre equivocado sólo lo arregla quien tenga acceso a la base — y entonces la
-- pantalla empuja a NO cerrar por las dudas, que es justo lo contrario de lo que se busca. Reabrir
-- pide el mismo permiso económico y borra el sello: un período reabierto no puede seguir mostrando
-- que alguien lo firmó, porque lo que firmó ya no es lo que dice la base.
create or replace function public.reabrir_periodo_hh(p_periodo date, p_notas text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo date := date_trunc('month', p_periodo)::date;
  v_id      uuid;
begin
  if not public.ve_economia() then
    raise exception 'Reabrir un período de HH tiene efecto económico: sólo Dirección o Administración'
      using errcode = '42501';
  end if;

  update public.periodo_hh
     set estado = 'abierto', cerrado_por = null, cerrado_en = null,
         notas = coalesce(p_notas, notas)
   where periodo = v_periodo and estado = 'cerrado'
  returning id into v_id;

  if v_id is null then
    raise exception 'El período % no estaba cerrado', to_char(v_periodo, 'MM/YYYY')
      using errcode = '22023';
  end if;
  return v_id;
end;
$$;

comment on function public.reabrir_periodo_hh(date, text) is
  'Reabre un mes cerrado. Borra el sello: un período reabierto no puede seguir mostrando la firma de un total que ya no es el vigente.';

grant execute on function public.reabrir_periodo_hh(date, text) to authenticated;

-- ── 4 · UN MES CERRADO NO RECIBE MÁS HORAS ──────────────────────────────────────────────────────
--
-- ═══ LA EXCEPCIÓN DEL ORQUESTADOR, Y POR QUÉ NO ES UN AGUJERO ═══
--
-- `auth.uid() is null` significa «no hay sesión de usuario»: es el sync del orquestador entrando con
-- `service_role`. Se lo deja pasar porque su trabajo es espejar fuentes externas (JORNALES, el Sheet)
-- y hacerlo rebotar rompería el sync entero por un mes que se cerró en la web. No abre una puerta a
-- nadie más: sin sesión, la RLS de `registros_hh` ya rechaza cualquier escritura de `authenticated`
-- y de `anon`, así que por acá sólo pasa quien tiene la llave de servicio.
--
-- Un UPDATE se mira por sus DOS meses: mover una fila de un mes abierto a uno cerrado cambia el
-- total del cerrado igual que insertarla ahí.
create or replace function public.registros_hh_periodo_cerrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nueva   date;
  v_vieja   date;
  v_cerrado date;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op <> 'DELETE' then
    v_nueva := date_trunc('month', coalesce(new.fecha, new.fecha_inicio_semana))::date;
  end if;
  if tg_op <> 'INSERT' then
    v_vieja := date_trunc('month', coalesce(old.fecha, old.fecha_inicio_semana))::date;
  end if;

  select p.periodo into v_cerrado
    from public.periodo_hh p
   where p.estado = 'cerrado'
     and p.periodo in (coalesce(v_nueva, v_vieja), coalesce(v_vieja, v_nueva))
   limit 1;

  if v_cerrado is not null then
    raise exception 'El período % está cerrado: no se pueden cargar, modificar ni borrar horas de ese mes. Reabrilo si hay que corregirlo.',
      to_char(v_cerrado, 'MM/YYYY') using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.registros_hh_periodo_cerrado() is
  'Lo que le da sentido al cierre: un mes cerrado no acepta altas, modificaciones ni bajas de horas. Sin sesión (service_role, el sync del orquestador) pasa: su fuente es externa y hacerla rebotar rompería el espejo.';

-- El nombre importa: los triggers del mismo evento corren en orden alfabético y
-- `registros_hh_normalizar` —que deriva `fecha_inicio_semana` a partir de `fecha`— tiene que correr
-- ANTES que éste. `n` < `p`: corre antes.
drop trigger if exists registros_hh_periodo_cerrado on public.registros_hh;
create trigger registros_hh_periodo_cerrado
  before insert or update or delete on public.registros_hh
  for each row execute function public.registros_hh_periodo_cerrado();

-- ── 5 · LO QUE LEE LA PANTALLA ──────────────────────────────────────────────────────────────────
--
-- Los agregados se calculan acá y no en TypeScript: son el mismo mes que el trigger bloquea y que la
-- función cierra, y tres definiciones de «las HH de agosto» terminan en tres números distintos.
--
-- `security_invoker = true`: quién ve qué lo sigue decidiendo la RLS de cada tabla. Para un rol que
-- no ve toda `solicitud_correccion_asistencia` el conteo de correcciones sería PARCIAL — por eso la
-- validación del cierre no usa esta vista: la hace la función, con su propio permiso.
create or replace view public.periodo_hh_panel
with (security_invoker = true) as
with horas as (
  select
    date_trunc('month', coalesce(h.fecha, h.fecha_inicio_semana))::date as periodo,
    -- `count(distinct persona_id)` ignora los NULL a propósito: las filas legacy de JORNALES no
    -- tienen persona (su «quién» es un texto), y contarlas como una más inventaría plantel.
    count(distinct h.persona_id)::int                                      as personas,
    coalesce(sum(h.horas) filter (where h.tipo_hora = 'normal'), 0)        as hh_normales,
    coalesce(sum(h.horas) filter (where h.tipo_hora in ('extra_50', 'extra_100')), 0) as hh_extras
  from public.registros_hh h
  group by 1
),
correcciones as (
  select
    date_trunc('month', s.fecha)::date                             as periodo,
    count(*)::int                                                  as correcciones,
    -- LAS PENDIENTES APARTE: son las que bloquean el cierre. Un total de correcciones no dice si el
    -- botón va a funcionar, y un botón que rebota sin explicación es peor que un botón ausente.
    count(*) filter (where s.estado = 'pendiente')::int            as correcciones_pendientes
  from public.solicitud_correccion_asistencia s
  group by 1
),
meses as (
  select periodo from horas
  union
  select periodo from public.periodo_hh
)
select
  m.periodo,
  coalesce(h.personas, 0)                 as personas,
  coalesce(h.hh_normales, 0)              as hh_normales,
  coalesce(h.hh_extras, 0)                as hh_extras,
  coalesce(c.correcciones, 0)             as correcciones,
  coalesce(c.correcciones_pendientes, 0)  as correcciones_pendientes,
  coalesce(p.estado, 'abierto')           as estado,
  p.cerrado_en,
  p.cerrado_por
from meses m
left join horas h on h.periodo = m.periodo
left join correcciones c on c.periodo = m.periodo
left join public.periodo_hh p on p.periodo = m.periodo;

comment on view public.periodo_hh_panel is
  'Un mes por fila: personas con horas, HH normales, HH extras, correcciones (y cuántas siguen pendientes) y el estado del período. Los meses salen de registros_hh, no de un calendario: un mes sin una sola hora cargada no es un período que exista.';

grant select on public.periodo_hh_panel to authenticated;
grant select on public.periodo_hh_panel to service_role;
