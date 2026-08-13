#!/usr/bin/env node
// GENERA LA MIGRACIÓN DE FLOTA DESDE EL CATÁLOGO. No la aplica: escribe el .sql y nada más.
//
// POR QUÉ SE GENERA (mismo motivo que generar-migracion-caja.mjs). El registro de unidades y sus
// alias tienen que existir en dos caras: en el núcleo (lib/flota-unidades.mjs, que usan los scripts
// y los tests) y en Postgres (que usan la web y el chat). Tipear el segundo a mano garantiza que el
// día que se agregue una unidad alguien actualice una cara y no la otra — y el síntoma sería un
// costo por unidad distinto según dónde se lo mire, que es exactamente el problema que el OS
// existe para no tener.
//
//   node orquestador/scripts/generar-migracion-flota.mjs          # escribe el archivo
//   node orquestador/scripts/generar-migracion-flota.mjs --check   # sólo dice si está al día
//
// El test flota-migracion.test.mjs corre el --check: si alguien toca el catálogo y no regenera, se
// pone rojo antes de llegar a la base.
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { UNIDADES, sqlUnidadesNombradas } from '../lib/flota-unidades.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
export const RUTA = join(AQUI, '../../supabase/migrations/20260813120000_flota_unidades.sql')

const q = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`)

/** Las filas del catálogo, como VALUES de Postgres. */
function valuesUnidades() {
  return UNIDADES.map((u) =>
    `  (${q(u.clave)}, ${q(u.nombre)}, ${q(u.tipo)}, ${q(u.patente)}, ${q(u.serie ?? null)}, ${q(u.fuente)})`,
  ).join(',\n')
}

/** Un alias por fila: los de palabra ('alias') y los de identificador ('id') se distinguen porque
 *  se buscan distinto — con borde de palabra unos, como substring compactado los otros. */
function valuesAlias() {
  const filas = UNIDADES.flatMap((u) => [
    ...u.alias.map((a) => `  (${q(a)}, ${q(u.clave)}, 'palabra')`),
    ...u.ids.map((i) => `  (${q(i)}, ${q(u.clave)}, 'identificador')`),
  ])
  return filas.join(',\n')
}

export function generar() {
  return `-- GENERADO por orquestador/scripts/generar-migracion-flota.mjs — NO EDITAR A MANO.
-- La fuente es orquestador/lib/flota-unidades.mjs. Para cambiar algo: se cambia el catálogo y se
-- vuelve a generar. Un test verifica que este archivo esté al día con el catálogo.
--
-- QUÉ RESUELVE. \`public.equipos\` ya existía (6 vehículos sembrados desde la carpeta VEHICULOS de
-- Drive) pero le faltaba todo lo que hace falta para imputar un costo: las máquinas (Bobcat,
-- autoelevador), la distinción entre unidad propia y alquilada, y sobre todo los ALIAS — las formas
-- en que el dueño escribe cada unidad en el tique, que son el único puente entre el gasto y la
-- unidad. Sin alias, el costo por unidad se calcula con un CASE improvisado distinto cada vez.
--
-- NO IMPUTA A OBRA. El 18/07 el dueño fijó "Vehículos" y "Crédito Prendario" como costo INDIRECTO:
-- la obra que la vista devuelve es DÓNDE SE USÓ la unidad, no a qué obra se carga la plata.

-- ── 1 · equipos: las columnas que faltaban ──
alter table public.equipos add column if not exists clave text;
alter table public.equipos add column if not exists serie text;
alter table public.equipos add column if not exists fuente_evidencia text;
-- El check original sólo admitía vehiculo/maquinaria/herramienta_mayor: no tenía dónde poner una
-- minicargadora propia ni una plataforma alquilada, que es la mitad del costo de flota del año.
alter table public.equipos drop constraint if exists equipos_tipo_check;
alter table public.equipos add constraint equipos_tipo_check
  check (tipo in ('vehiculo', 'maquina', 'maquinaria', 'herramienta_mayor', 'equipo_menor', 'alquilada'));

-- Las 6 filas que ya existen se enganchan por patente (y el camión por nombre: se sembró sin
-- patente porque su RTO no se había leído todavía).
update public.equipos e set clave = c.clave
  from (values\n${valuesUnidades()}
  ) as c(clave, nombre, tipo, patente, serie, fuente)
 where e.clave is null and e.patente_o_identificador = c.patente;
update public.equipos set clave = 'camion-608d'
 where clave is null and nombre = 'Mercedes Benz 608D';

create unique index if not exists equipos_clave_unique on public.equipos (clave) where clave is not null;

-- ── 2 · el catálogo completo (upsert idempotente por clave) ──
insert into public.equipos (clave, nombre, tipo, patente_o_identificador, serie, fuente_evidencia, fuente_legacy)
select v.clave, v.nombre, v.tipo, v.patente, v.serie, v.fuente, 'flota-unidades.mjs'
  from (values\n${valuesUnidades()}
  ) as v(clave, nombre, tipo, patente, serie, fuente)
on conflict (clave) do update set
  nombre = excluded.nombre,
  tipo = excluded.tipo,
  patente_o_identificador = coalesce(excluded.patente_o_identificador, public.equipos.patente_o_identificador),
  serie = excluded.serie,
  fuente_evidencia = excluded.fuente_evidencia;

comment on column public.equipos.fuente_evidencia is
  'De dónde salió el identificador de esta unidad (papel de Drive o comprobante). Sin fuente, el dato no se declara.';

-- ── 3 · los alias: cómo escribe el dueño cada unidad ──
create table if not exists public.equipo_alias (
  alias text not null,
  clase text not null check (clase in ('palabra', 'identificador')),
  equipo_clave text not null,
  primary key (alias, clase)
);
comment on table public.equipo_alias is
  'Texto → unidad de flota. clase=palabra se busca con borde de palabra ("camion" NO matchea "camioneta"); clase=identificador se busca como substring del texto compactado ("AD 119 YO" = "ad119yo").';

delete from public.equipo_alias;
insert into public.equipo_alias (alias, equipo_clave, clase) values\n${valuesAlias()};

alter table public.equipo_alias enable row level security;
drop policy if exists equipo_alias_select on public.equipo_alias;
create policy equipo_alias_select on public.equipo_alias for select to authenticated using (true);
drop policy if exists equipo_alias_write on public.equipo_alias;
create policy equipo_alias_write on public.equipo_alias
  for all to authenticated
  using (current_rol() in ('direccion', 'administracion'))
  with check (current_rol() in ('direccion', 'administracion'));
grant select, insert, update, delete on public.equipo_alias to authenticated;

-- ── 4 · qué unidades nombra un texto ──
-- Devuelve TODAS, nunca "la primera que matchea": con dos unidades nombradas ("50L C/U bobcat y
-- camion") no hay forma de repartir sin los litros de cada una, y darle el 100% a una sería inventar.
create or replace function public.unidades_flota_nombradas(txt text)
returns text[]
language sql
immutable
as $$
  select ${sqlUnidadesNombradas('txt')};
$$;

comment on function public.unidades_flota_nombradas(text) is
  'Texto de concepto → array de claves de unidad nombradas. 0 = no dice; 1 = atribuible; 2+ = carga compartida, NO se reparte.';

-- ── 5 · la vista que la web y el chat leen ──
-- Sólo atribuye con exactamente una unidad nombrada. El resto queda con equipo_clave null y su
-- causa a la vista: ese renglón es el que mide si la medición sirve, no un residuo a esconder.
create or replace view public.flota_gasto_unidad as
select
  c.id,
  c.fecha,
  c.proveedor,
  c.concepto,
  c.obra_texto,
  c.total,
  u.claves,
  case when array_length(u.claves, 1) = 1 then u.claves[1] end as equipo_clave,
  case
    when array_length(u.claves, 1) = 1 then null
    when array_length(u.claves, 1) > 1 then 'compartido'
    else 'sin_unidad'
  end as causa
from public.costos_obra c
cross join lateral (select public.unidades_flota_nombradas(c.concepto) as claves) u;

comment on view public.flota_gasto_unidad is
  'Cada gasto de Compras con la unidad de flota que nombra. La partición completa (componentes de costo, herencia del prendario, real vs comprometido) vive en orquestador/lib/flota-costos.mjs.';
`
}

const actual = existsSync(RUTA) ? readFileSync(RUTA, 'utf8') : null
const nuevo = generar()
if (process.argv.includes('--check')) {
  if (actual !== nuevo) { console.error('DESACTUALIZADA: el catálogo cambió y la migración no se regeneró.'); process.exit(1) }
  console.log('al día')
} else if (process.argv[1]?.endsWith('generar-migracion-flota.mjs')) {
  writeFileSync(RUTA, nuevo)
  console.log(`escrita: ${RUTA} (${nuevo.split('\n').length} líneas) — NO aplicada`)
}
