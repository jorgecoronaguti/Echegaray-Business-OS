// OBRAS → `public.obra_economia_sheet`: contratado, costo MO, costo materiales y margen POR OBRA,
// leídos con las MISMAS funciones que publican la pestaña OBRAS y persistidos para que la web
// (Clientes) los lea de Postgres y no de una segunda definición.
//
//   node orquestador/scripts/obras-economia-sync.mjs            # dry: muestra lo que escribiría
//   node orquestador/scripts/obras-economia-sync.mjs --aplicar  # upsert idempotente
//
// SÓLO LEE el Sheet (Cobranzas y el tipo de cambio). El contrato sale de `contratoDeObra` sobre la
// misma lectura de Cobranzas que hace `obras-pestana.mjs` (`leerContratos`); los costos, de
// `obra_egreso_proyectado`, que es la fuente que la columna «Costo proyectado» de OBRAS SUMA vía la
// réplica `_OBRAS_RAW`. No se lee la pestaña OBRAS: es un derivado, y leer un derivado para volver a
// persistirlo es la segunda definición que este script viene a evitar.
//
// SI LA MIGRACIÓN NO ESTÁ APLICADA, el script lo dice y sale en 0: corre dentro del pipeline del
// Flujo de Caja y un rojo acá dejaría de sellar la frescura del Cash Flow entero por una tabla que
// el dueño todavía no creó. Es un aviso ruidoso, no un silencio.

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, withTx, closePool } from '../lib/db.mjs'
import { OBRAS_FUTURAS } from '../lib/obras-datos.mjs'
import { variantesDe } from '../lib/obras-grilla.mjs'
import { leerTipoCambio } from '../lib/tipo-cambio.mjs'
import { indiceDeLetra, leerContratos, refsReales } from './obras-pestana.mjs'
import { filaEconomia, ventaViva } from '../lib/obras-economia.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
export const TABLA = 'public.obra_economia_sheet'
export const ORIGEN_FUENTE = 'sheet:Cobranzas+obra_egreso_proyectado'

/** El mapeo clave interna → obra canónica lo declara `obra_egreso_proyectado`: no se inventa acá. */
async function mapaCanonico() {
  const r = await query(`select distinct obra_clave, obra_canonica_id from public.obra_egreso_proyectado
                         where obra_clave is not null and obra_canonica_id is not null`)
  return new Map(r.rows.map((x) => [x.obra_clave, x.obra_canonica_id]))
}

async function costosPorObra() {
  const r = await query(`select obra_clave, tipo, sum(monto)::numeric monto from public.obra_egreso_proyectado
                         where obra_clave is not null group by 1, 2`)
  // MISMO CRITERIO QUE OBRAS: si la obra tiene plan cargado, un tipo sin filas es $0 (BSA no tiene
  // materiales y la I de OBRAS publica 0). Sin ninguna fila, los dos van en null: no se sabe.
  const m = new Map()
  for (const x of r.rows) {
    const c = m.get(x.obra_clave) ?? { mo: 0, material: 0 }
    if (x.tipo === 'mano_de_obra') c.mo = Number(x.monto)
    if (x.tipo === 'material') c.material = Number(x.monto)
    m.set(x.obra_clave, c)
  }
  return m
}

export async function armarFilas({ google }) {
  const refs = await refsReales(google)
  const datos = await google.readSheetValues(ID, `${refs.cob.hoja}!A${refs.cob.desde}:${refs.cob.moneda}`,
    { render: 'UNFORMATTED_VALUE' }) ?? []
  const { tc } = await leerTipoCambio(google, ID)
  const { contratos } = leerContratos(datos, refs, OBRAS_FUTURAS)
  const cols = {
    cliente: indiceDeLetra(refs.cob.cliente), concepto: indiceDeLetra(refs.cob.concepto),
    oc: indiceDeLetra(refs.cob.oc), neto: indiceDeLetra(refs.cob.neto),
    estado: indiceDeLetra(refs.cob.estado), moneda: indiceDeLetra(refs.cob.moneda),
  }
  const porCliente = OBRAS_FUTURAS.reduce((m, o) => m.set(o.cliente, (m.get(o.cliente) ?? 0) + 1), new Map())
  const [canonico, costos] = await Promise.all([mapaCanonico(), costosPorObra()])
  const filas = []
  const sinCanonica = []
  for (const o of OBRAS_FUTURAS) {
    const selector = { variantes: variantesDe(o.cliente), needle: o.ventaTexto, unica: porCliente.get(o.cliente) === 1 }
    const viva = ventaViva(datos, cols, selector, tc)
    const obraCanonicaId = canonico.get(o.clave) ?? null
    if (!obraCanonicaId) { sinCanonica.push(o.clave); continue }
    filas.push(filaEconomia(o, contratos.get(o.clave) ?? {}, costos.get(o.clave) ?? {}, { ventaViva: viva.pesos, tc, obraCanonicaId }))
  }
  return { filas, sinCanonica, tc }
}

async function tablaExiste() {
  const r = await query(`select to_regclass($1) t`, [TABLA])
  return Boolean(r.rows[0]?.t)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig() })
  const { filas, sinCanonica, tc } = await armarFilas({ google })
  console.log(`tipo de cambio: ${tc ?? 'SIN LEER'} · ${filas.length} obras con obra canónica · ${sinCanonica.length} sin vínculo${sinCanonica.length ? ` (${sinCanonica.join(', ')})` : ''}`)
  for (const f of filas) {
    console.log(`  ${f.obra_canonica_id.padEnd(32)} contratado ${fmt(f.contratado)} [${f.origen ?? 'sin dato'}]`
      + ` · MO ${fmt(f.costo_mo)} · MAT ${fmt(f.costo_materiales)} · margen ${fmt(f.margen)}`)
  }
  if (!(await tablaExiste())) {
    console.log(`\n⚠ ${TABLA} NO EXISTE: la migración 20260908T1800_obra_economia_sheet.sql está sin aplicar. No escribo nada.`)
    return
  }
  if (!APLICAR) { console.log('\n--aplicar para escribir. No escribí nada.'); return }
  const leidoEn = new Date().toISOString()
  await withTx(async (c) => {
    for (const f of filas) {
      await c.query(`insert into ${TABLA}
          (obra_canonica_id, obra_clave, contratado, contratado_usd, costo_mo, costo_materiales, margen,
           plazo_desde, plazo_hasta, origen, origen_fuente, leido_en)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        on conflict (obra_canonica_id) do update set
          obra_clave = excluded.obra_clave, contratado = excluded.contratado, contratado_usd = excluded.contratado_usd,
          costo_mo = excluded.costo_mo, costo_materiales = excluded.costo_materiales, margen = excluded.margen,
          plazo_desde = excluded.plazo_desde, plazo_hasta = excluded.plazo_hasta, origen = excluded.origen,
          origen_fuente = excluded.origen_fuente, leido_en = excluded.leido_en`,
      [f.obra_canonica_id, f.obra_clave, f.contratado, f.contratado_usd, f.costo_mo, f.costo_materiales, f.margen,
        f.plazo_desde, f.plazo_hasta, f.origen, ORIGEN_FUENTE, leidoEn])
    }
  })
  // LA EVIDENCIA ES EL DATO LEÍDO EN SU DESTINO, no el INSERT que respondió que sí.
  const r = await query(`select count(*)::int n, sum(contratado)::numeric contratado from ${TABLA} where leido_en = $1`, [leidoEn])
  console.log(`\nescrito y releído: ${r.rows[0].n} filas · contratado total ${fmt(Number(r.rows[0].contratado))}`)
  if (r.rows[0].n !== filas.length) throw new Error(`escribí ${filas.length} y releí ${r.rows[0].n}`)
}

const fmt = (n) => (n === null || n === undefined ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`)

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(() => closePool().catch(() => {}))
}
