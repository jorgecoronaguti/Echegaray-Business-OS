-- 20260909T1200 · LA PESTAÑA «NÓMINA» SE MUDA A LA WEB: TARIFA, QUINCENA Y LÍNEA
--
-- El dueño, 09/09/2026: *«tenemos que hacer un módulo de liquidación de horas/sueldo»* en
-- app.ecsas.com.ar, y la pestaña Nómina del Flujo de Caja se da de baja cuando el módulo esté
-- verificado. Lo que esa pestaña contesta es una sola pregunta por quincena: **qué cobra cada
-- persona y por qué canal sale**.
--
-- ═══ POR QUÉ TRES TABLAS Y NO UNA VISTA ═══
--
-- Dos de las cuatro cifras NO son derivables de nada que hoy viva en Postgres:
--
--   · EL $/HORA DE CADA PERSONA. Vive en la planilla JORNALES del dueño y se replica en la pestaña
--     oculta `_J_OBREROS` (columna 22). `personas.retribucion_pactada` NO sirve: es lo que dice la
--     constancia de ARCA, congelada al alta, y ni siquiera tiene GRANT de lectura para nadie
--     (20260819T4900 lo dejó cerrado a propósito). Sin `persona_tarifa` la web no puede multiplicar
--     horas por plata, y una liquidación que no puede multiplicar no existe.
--   · EL EFECTIVO REDONDEADO. Es la columna DEL DUEÑO: los billetes redondos que entrega en mano.
--     No se calcula de nada. Si no hay dónde guardarlo, se pierde cada vez que se recarga.
--
-- Y una tercera cosa que una vista tampoco puede hacer: CONGELAR. Mientras la quincena está abierta
-- las cifras se recalculan en cada lectura —cargar horas de ayer tiene que mover el número—; cuando
-- se cierra, dejan de moverse. Una vista seguiría cambiando el importe de una quincena ya pagada el
-- día que alguien corrija una hora vieja, y entonces el registro de lo que se pagó dejaría de ser
-- un registro.
--
-- ═══ QUÉ NO HACE ESTA MIGRACIÓN ═══
--
-- No toca el Sheet, no marca pagos, no crea recibos y no escribe una sola tarifa: el sembrado lo
-- hace `orquestador/scripts/persona-tarifa-sembrar.mjs`, que lee `_J_OBREROS` en SÓLO LECTURA.
--
-- ═══ QUIÉN VE ESTO ═══
--
-- `ve_economia()` — dirección y administración. **Jefe de obra NO**: `es_administracion()` lo
-- incluye desde el 19/08/2026 y sería el error clásico acá, porque el jefe entra a esta pantalla
-- para cargar asistencia. Un sueldo no es un monto de venta pero es el dato más sensible del legajo,
-- y el 19/08 el dueño lo cerró con todas las letras. Policy SIN grant devuelve «permission denied»:
-- las dos van juntas, y una tabla nueva nace sin permiso para nadie.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1 · LA TARIFA DE UNA PERSONA, CON FECHA DE VIGENCIA
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- No hay UPDATE de tarifa: un aumento es una FILA NUEVA con otro `desde`. Pisar el valor viejo
-- haría que recalcular una quincena de marzo la liquide a la tarifa de septiembre, en silencio.

create table if not exists public.persona_tarifa (
  id            uuid primary key default gen_random_uuid(),
  persona_id    uuid not null references public.personas(id) on delete cascade,
  desde         date not null,
  -- EXACTAMENTE UNO DE LOS DOS. Un obrero cobra por hora; oficina cobra un neto mensual acordado
  -- ($1.800.000 c/u Maldonado y Nievas al 09/09/2026). Los dos juntos no significan nada, y
  -- ninguno de los dos significa «gratis»: por eso el CHECK exige uno y sólo uno.
  valor_hora    numeric(14,2),
  neto_mensual  numeric(14,2),
  origen        text not null,
  creado_por    uuid,
  creado_en     timestamptz not null default now(),

  constraint persona_tarifa_una_sola_forma check (
    (valor_hora is not null and neto_mensual is null)
    or (valor_hora is null and neto_mensual is not null)
  ),
  constraint persona_tarifa_positiva check (
    coalesce(valor_hora, neto_mensual) > 0
  ),
  constraint persona_tarifa_con_origen check (length(btrim(origen)) > 0),
  -- Una persona no puede tener dos tarifas que arranquen el mismo día: cuál gana sería un empate
  -- que resolvería el `order by` de quien consulte.
  constraint persona_tarifa_una_por_dia unique (persona_id, desde)
);

create index if not exists persona_tarifa_persona_desde
  on public.persona_tarifa (persona_id, desde desc);

comment on table public.persona_tarifa is
  'Lo que cobra una persona desde una fecha: $/hora (obreros) o neto mensual (oficina). Un aumento es una fila nueva, nunca un UPDATE. Origen declarado: sheet:_J_OBREROS, sheet:_J_OFICINA o carga manual.';
comment on column public.persona_tarifa.origen is
  'De dónde salió la cifra. La liquidación lo muestra: ningún importe sin origen visible.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2 · LA QUINCENA LIQUIDADA
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Tres grupos, porque la pestaña tiene tres cuadros y cada uno se cierra por su cuenta: los obreros
-- cobran por quincena, oficina cobra por mes y una liquidación final no es ninguna de las dos.

create table if not exists public.liquidacion_quincena (
  id          uuid primary key default gen_random_uuid(),
  desde       date not null,
  hasta       date not null,
  grupo       text not null,
  estado      text not null default 'abierta',
  cerrada_por uuid,
  cerrada_en  timestamptz,
  creada_en   timestamptz not null default now(),

  constraint liquidacion_quincena_grupo check (grupo in ('obreros', 'oficina', 'final')),
  constraint liquidacion_quincena_estado check (estado in ('abierta', 'cerrada')),
  constraint liquidacion_quincena_ventana check (hasta >= desde),
  -- CERRADA SIN FECHA DE CIERRE ES UNA AFIRMACIÓN SIN EVIDENCIA. Si el estado dice que se congeló,
  -- tiene que decir cuándo; si no se congeló, no puede tener fecha.
  constraint liquidacion_quincena_cierre_coherente check (
    (estado = 'cerrada' and cerrada_en is not null)
    or (estado = 'abierta' and cerrada_en is null)
  ),
  constraint liquidacion_quincena_unica unique (desde, hasta, grupo)
);

comment on table public.liquidacion_quincena is
  'Una quincena de un grupo (obreros, oficina, final). Abierta: las cifras de sus líneas se recalculan en cada lectura. Cerrada: quedan congeladas tal como estaban. Cerrar NO marca pagos ni escribe en el Sheet.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3 · LA LÍNEA DE UNA PERSONA EN ESA QUINCENA
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- LA IDENTIDAD CONTABLE ESTÁ EN UN CHECK, no en un comentario:
--
--     total = por_banco + en_efectivo
--
-- La tarjeta de arriba promete que «las dos primeras dan la tercera». Una promesa de pantalla que
-- la base no impone se rompe el día que alguien escriba una fila por fuera de la pantalla.
--
-- `efectivo_redondeado` es LA ÚNICA columna que escribe una persona y la única que no participa de
-- ninguna cuenta: son los billetes que el dueño entrega en mano. Ni se calcula ni se pisa.

create table if not exists public.liquidacion_linea (
  id                  uuid primary key default gen_random_uuid(),
  liquidacion_id      uuid not null references public.liquidacion_quincena(id) on delete cascade,
  persona_id          uuid not null references public.personas(id) on delete restrict,
  horas               numeric(10,2),
  valor_hora          numeric(14,2),
  cobra               numeric(14,2) not null default 0,
  adelanto            numeric(14,2) not null default 0,
  ya_transferido      numeric(14,2) not null default 0,
  por_banco           numeric(14,2) not null default 0,
  en_efectivo         numeric(14,2) not null default 0,
  -- NULL = el dueño todavía no escribió el redondeo. Cero significaría «no le doy nada en mano»,
  -- que es una afirmación distinta y que él no hizo.
  efectivo_redondeado numeric(14,2),
  total               numeric(14,2) not null default 0,
  actualizado_en      timestamptz not null default now(),

  constraint liquidacion_linea_una_por_persona unique (liquidacion_id, persona_id),
  constraint liquidacion_linea_cierra check (
    round(total, 2) = round(por_banco + en_efectivo, 2)
  ),
  constraint liquidacion_linea_redondeo_no_negativo check (
    efectivo_redondeado is null or efectivo_redondeado >= 0
  )
);

create index if not exists liquidacion_linea_persona
  on public.liquidacion_linea (persona_id);

comment on table public.liquidacion_linea is
  'Qué cobra una persona en una quincena y por qué canal sale. COBRA − ADELANTO − YA TRANSFERIDO − POR BANCO = EN EFECTIVO; POR BANCO + EN EFECTIVO = TOTAL (impuesto por CHECK). Origen de cada columna: cobra = registros_hh/asistencia_dia × persona_tarifa · adelanto y ya_transferido = nomina_adelanto · por_banco = nomina_recibo_neto confirmado contra el lote del extracto.';
comment on column public.liquidacion_linea.efectivo_redondeado is
  'La columna DEL DUEÑO: los billetes redondos que entrega en mano. Se persiste tal cual la escribe. NUNCA se calcula ni se pisa.';
comment on column public.liquidacion_linea.horas is
  'Horas liquidables de la quincena (horasLiquidablesDelDia). NULL = no se pudo calcular; no es cero.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4 · RLS + GRANT — LOS DOS, SIEMPRE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- `revoke ... from authenticated` en `persona_tarifa` y `liquidacion_quincena`: la web las LEE, y
-- las escribe el service role (el sembrado) o la acción de cerrar, que también corre por el
-- servidor. La única escritura que hace un usuario logueado es `efectivo_redondeado`, y por eso
-- `liquidacion_linea` tiene UPDATE — acotado por columna, abajo.

alter table public.persona_tarifa        enable row level security;
alter table public.liquidacion_quincena  enable row level security;
alter table public.liquidacion_linea     enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='persona_tarifa' and policyname='persona_tarifa_lee_economia') then
    create policy persona_tarifa_lee_economia on public.persona_tarifa
      for select to authenticated using (public.ve_economia());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='persona_tarifa' and policyname='persona_tarifa_srv') then
    create policy persona_tarifa_srv on public.persona_tarifa
      for all to service_role using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidacion_quincena' and policyname='liquidacion_quincena_lee_economia') then
    create policy liquidacion_quincena_lee_economia on public.liquidacion_quincena
      for select to authenticated using (public.ve_economia());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidacion_quincena' and policyname='liquidacion_quincena_escribe_economia') then
    create policy liquidacion_quincena_escribe_economia on public.liquidacion_quincena
      for insert to authenticated with check (public.ve_economia());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidacion_quincena' and policyname='liquidacion_quincena_cierra_economia') then
    create policy liquidacion_quincena_cierra_economia on public.liquidacion_quincena
      for update to authenticated using (public.ve_economia()) with check (public.ve_economia());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidacion_quincena' and policyname='liquidacion_quincena_srv') then
    create policy liquidacion_quincena_srv on public.liquidacion_quincena
      for all to service_role using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidacion_linea' and policyname='liquidacion_linea_lee_economia') then
    create policy liquidacion_linea_lee_economia on public.liquidacion_linea
      for select to authenticated using (public.ve_economia());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidacion_linea' and policyname='liquidacion_linea_escribe_economia') then
    create policy liquidacion_linea_escribe_economia on public.liquidacion_linea
      for insert to authenticated with check (public.ve_economia());
  end if;
  -- LA QUINCENA CERRADA NO SE TOCA. El congelado no puede depender de que la pantalla se acuerde:
  -- la policy mira el estado de la cabecera y rechaza el UPDATE si ya está cerrada.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidacion_linea' and policyname='liquidacion_linea_edita_abierta') then
    create policy liquidacion_linea_edita_abierta on public.liquidacion_linea
      for update to authenticated
      using (public.ve_economia() and exists (
        select 1 from public.liquidacion_quincena q
        where q.id = liquidacion_linea.liquidacion_id and q.estado = 'abierta'))
      with check (public.ve_economia() and exists (
        select 1 from public.liquidacion_quincena q
        where q.id = liquidacion_linea.liquidacion_id and q.estado = 'abierta'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidacion_linea' and policyname='liquidacion_linea_srv') then
    create policy liquidacion_linea_srv on public.liquidacion_linea
      for all to service_role using (true) with check (true);
  end if;
end $$;

grant select on public.persona_tarifa to authenticated;
grant all    on public.persona_tarifa to service_role;
revoke insert, update, delete on public.persona_tarifa from authenticated;

grant select, insert, update on public.liquidacion_quincena to authenticated;
grant all on public.liquidacion_quincena to service_role;
revoke delete on public.liquidacion_quincena from authenticated;

-- ═══ EL GRANT DE UPDATE VA POR COLUMNA, Y ES LA MITAD DE LA REGLA ═══
--
-- Sin acotarlo, quien puede corregir el redondeo puede reescribir `cobra` y `total` de cualquier
-- fila: la policy dice QUÉ FILAS, el grant dice QUÉ COLUMNAS. `efectivo_redondeado` es la única
-- que escribe una persona; el resto lo recalcula el servidor y lo congela el cierre.
grant select, insert on public.liquidacion_linea to authenticated;
grant update (efectivo_redondeado, actualizado_en) on public.liquidacion_linea to authenticated;
grant all on public.liquidacion_linea to service_role;
revoke delete on public.liquidacion_linea from authenticated;
