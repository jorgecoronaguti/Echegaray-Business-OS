-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LO QUE EL BANCO ACREDITÓ COMO HABERES, PERSONA POR PERSONA · EL CERTIFICADO DEL SANTANDER
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 18/09/2026: «este es el historial de pagos de haberes, o sea la parte de banco que corresponde
-- al 50 % en blanco de todo el 2026. Quiero que dejes esto cargado en todos los legajos como corresponde,
-- de los activos e inactivos».
--
-- ═══ POR QUÉ UNA TABLA PROPIA Y NO LA COLUMNA BANCO DE LA LIQUIDACIÓN ═══
--
-- El certificado es la carta del banco con cada acreditación emitida por la empresa: la fuente MÁS
-- FUERTE que existe de «cuánto se pagó por banco». La columna BANCO de JORNALES la escribe una persona
-- (y está vacía en 8 bloques de 2026 de Obreros); `liquidacion_linea.por_banco` la copia; el extracto
-- sólo trae el total del lote. Guardar el certificado TAL CUAL —cuil, nombre del banco, fecha, importe—
-- es lo que permite que el legajo diga «el banco pagó X, la planilla dice Y» en vez de elegir en silencio.
-- Un control no se valida contra la información que produce: por eso esta tabla NO se mezcla con
-- `liquidacion_linea` ni la reescribe.
--
-- ═══ NADA LA LEE TODAVÍA, Y ES A PROPÓSITO ═══
--
-- Es una tabla NUEVA: aplicarla no cambia lo que responde ninguna función ni vista que la app publicada
-- usa. La lectura (el legajo) va en el código de la rama `feat/haberes-banco-certificado`.
--
-- ═══ LA CLASE Y EL PERÍODO LOS DECIDE EL CARGADOR, CON SU EVIDENCIA ESCRITA ═══
--
-- `orquestador/lib/haberes-certificado.mjs` clasifica cada acreditación (quincena, adelanto de quincena,
-- sueldo mensual, liquidación final, a confirmar) y deja en `evidencia` qué dato la explicó y en
-- `confianza` si coincidió al peso con la planilla o salió de la regla de fecha. Lo que no se pudo probar
-- queda «a_confirmar», sin período: no suma a ninguna quincena.
--
-- ═══ QUIÉN ESCRIBE: NADIE CON SESIÓN ═══
--
-- El único escritor es `orquestador/scripts/haberes-certificado-cargar.mjs` por conexión directa. RLS NO
-- ES GRANT: se niegan los dos. Leer: sólo quien liquida sueldos (`liquida_sueldos()`), el mismo corte que
-- `liquidacion_linea` — son importes de sueldo por persona.

create table if not exists public.haberes_acreditados_banco (
  id              uuid primary key default gen_random_uuid(),

  -- ── lo que dice el banco, tal cual ────────────────────────────────────────────────────────────
  cuil            text not null check (cuil ~ '^\d{11}$'),
  nombre_banco    text not null,
  fecha           date not null,
  importe         numeric(14,2) not null check (importe > 0),

  -- ── quién es, en el padrón ────────────────────────────────────────────────────────────────────
  -- NULL = el CUIL no está en `personas`. La fila viaja igual; no se da de alta a nadie.
  persona_id      uuid references public.personas(id) on delete set null,

  -- ── qué paga ──────────────────────────────────────────────────────────────────────────────────
  clase           text not null check (clase in
                    ('quincena', 'adelanto_quincena', 'sueldo_mensual', 'liquidacion_final', 'a_confirmar')),
  -- La quincena calendario (1–15 / 16–fin) o el mes que paga. NULL para finales y a confirmar.
  periodo_desde   date,
  periodo_hasta   date,
  -- 'coincide_planilla' = al peso con la columna BANCO/ADELANTO BANCO de JORNALES · 'regla_fecha' = por
  -- la regla declarada en el cargador · 'baja_confirmada' = final con personas.fecha_egreso.
  confianza       text check (confianza in ('coincide_planilla', 'regla_fecha', 'baja_confirmada')),
  evidencia       text not null,

  -- ── de dónde salió, e idempotencia ────────────────────────────────────────────────────────────
  fuente          text not null,
  -- sha256(fuente|cuil|fecha|centavos|ocurrencia): correr el cargador dos veces no duplica.
  clave           text not null unique,
  -- sha256 del CSV transcripto: qué versión del certificado cargó esta fila.
  certificado_hash text not null,
  cargado_en      timestamptz not null default now(),

  constraint haberes_acreditados_banco_periodo check (
    (clase in ('quincena', 'adelanto_quincena', 'sueldo_mensual'))
      = (periodo_desde is not null and periodo_hasta is not null and periodo_desde <= periodo_hasta)
  )
);

comment on table public.haberes_acreditados_banco is
  'Cada acreditación de haberes que el banco certifica, tal cual (cuil, nombre truncado del banco, fecha, importe), con la persona del padrón por CUIL y la clase/período que decidió orquestador/lib/haberes-certificado.mjs con su evidencia. Fuente más fuerte que la columna BANCO de JORNALES. La escribe sólo orquestador/scripts/haberes-certificado-cargar.mjs.';
comment on column public.haberes_acreditados_banco.clase is
  'quincena · adelanto_quincena · sueldo_mensual · liquidacion_final (regla del dueño: no suma a ninguna quincena ni al costo) · a_confirmar (no se pudo probar: no suma a ningún período).';
comment on column public.haberes_acreditados_banco.persona_id is
  'NULL = el CUIL del banco no está en personas. No se crea a nadie.';

create index if not exists haberes_acreditados_banco_persona
  on public.haberes_acreditados_banco (persona_id) where persona_id is not null;
create index if not exists haberes_acreditados_banco_periodo
  on public.haberes_acreditados_banco (periodo_desde, periodo_hasta);

alter table public.haberes_acreditados_banco enable row level security;

drop policy if exists haberes_acreditados_banco_lee on public.haberes_acreditados_banco;
create policy haberes_acreditados_banco_lee on public.haberes_acreditados_banco
  for select to authenticated using ((select public.liquida_sueldos()));

drop policy if exists haberes_acreditados_banco_srv on public.haberes_acreditados_banco;
create policy haberes_acreditados_banco_srv on public.haberes_acreditados_banco
  for all to service_role using (true) with check (true);

revoke all on public.haberes_acreditados_banco from anon, authenticated;
grant select on public.haberes_acreditados_banco to authenticated;
grant all on public.haberes_acreditados_banco to service_role;

-- ── LA EVIDENCIA DEL EFECTO ──────────────────────────────────────────────────────────────────────
--
--   select count(*), sum(importe), count(persona_id) from public.haberes_acreditados_banco
--    where fuente = 'certificado Santander del 18/09/2026';      -- 127 · 43587035.27 · 127
--   select clase, count(*), sum(importe) from public.haberes_acreditados_banco group by 1 order by 1;
