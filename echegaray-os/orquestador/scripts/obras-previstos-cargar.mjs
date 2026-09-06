#!/usr/bin/env node
// EL PLAN DE EGRESOS DE LAS OBRAS, DEL SHEET A POSTGRES — CON SU PROCEDENCIA Y SU VERIFICACIÓN.
//
// QUÉ HACE (05/09/2026). Lee la pestaña OBRAS del archivo real, saca los 17 materiales previstos
// (cuadro 5) y deduce la mano de obra de cada obra (cuadro de costo menos sus materiales), y los
// guarda en `public.obra_egreso_proyectado` diciendo de qué celda salió cada uno y cuándo se leyó.
//
// SÓLO LEE DEL SHEET. Ni una escritura, ni un `values.update`, ni un `batchUpdate`: la pestaña se
// abre en modo lectura y se cierra. La escritura del Sheet es de `obras-pestana.mjs` y de nadie más.
//
// EL DEFECTO ES NO GUARDAR. Sin `--aplicar` es un ensayo: lee, traduce, muestra las 24 filas que
// guardaría y no toca Postgres.
//
// ═══ LA EVIDENCIA ES DEL EFECTO ═══
//
// Después de escribir, VUELVE A LEER de la base y compara campo por campo contra lo que quiso
// guardar. Un `insert` que no falló no prueba nada; lo prueba el dato leído en su destino. Si algo
// no coincide, sale con código 1 diciendo exactamente qué fila y qué campo.
//
// ═══ POR QUÉ UN HALLAZGO CORTA LA CARGA ENTERA ═══
//
// Los dos cuadros tienen que cerrar entre sí y contra `obras-datos.mjs`. Si no cierran, lo que hay
// en el Sheet no es lo que este script cree que es, y guardar «lo que se entendió» convertiría una
// discrepancia visible en un dato falso invisible. Se reporta y no se guarda nada.
//
//   node orquestador/scripts/obras-previstos-cargar.mjs             # ensayo: lee y muestra
//   node orquestador/scripts/obras-previstos-cargar.mjs --aplicar   # guarda y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, withTx, closePool } from '../lib/db.mjs'
import { itemsCrudosDeCuadro5 } from '../lib/materiales-previstos.mjs'
import { OBRAS_FUTURAS } from '../lib/obras-datos.mjs'
import { costosDeCuadro, egresosDesdeSheet, compararConLoGuardado, PESTANA_ORIGEN } from '../lib/obras-egresos-proyectados.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const $ = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

/**
 * Las obras que YA existen en el OS, por rótulo. El vínculo es opcional a propósito: dos de las siete
 * obras del cuadro no están dadas de alta y su plan se guarda igual — sin obra canónica, pero
 * guardado. Exigir el vínculo dejaría afuera justo las obras nuevas, que son las que más importan.
 */
async function canonicasPorRotulo() {
  const { rows } = await query('select id, nombre from public.obra_canonica')
  const m = new Map()
  const norm = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleUpperCase('es-AR')
  for (const r of rows) m.set(norm(r.nombre), r.id)
  return (rotulo) => m.get(norm(rotulo)) ?? null
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  // UNFORMATTED_VALUE: los importes tienen que llegar como NÚMERO y las fechas como SERIAL. Con el
  // render por defecto, "$47.590.272" llega como texto y todo importe se leería como no-número.
  const filas = await google.readSheetValues(ID, `'${PESTANA_ORIGEN}'!A1:M120`, { render: 'UNFORMATTED_VALUE' })
  const leidoEn = new Date().toISOString()

  const { hayCuadro, items } = itemsCrudosDeCuadro5(filas)
  if (!hayCuadro) {
    console.error(`no encontré el cuadro de materiales previstos en la pestaña ${PESTANA_ORIGEN}. No guardo nada.`)
    process.exitCode = 1
    return
  }
  const costos = costosDeCuadro(filas)
  const { filas: nuevas, hallazgos } = egresosDesdeSheet({ items, costos, obras: OBRAS_FUTURAS, leidoEn })

  console.log(`${PESTANA_ORIGEN}: ${items.length} ítem(s) de material · ${costos.length} fila(s) de costo proyectado`)
  for (const f of nuevas) {
    console.log(`  ${(f.origen_celda ?? '  —').padStart(4)}  ${f.obra_rotulo.padEnd(22)} ${f.concepto.slice(0, 34).padEnd(36)} ${$(f.monto).padStart(14)}`)
  }
  console.log(`  total: ${$(nuevas.reduce((s, f) => s + f.monto, 0))} en ${nuevas.length} fila(s)`)

  if (hallazgos.length) {
    console.error(`\n⚠ ${hallazgos.length} hallazgo(s) — NO guardo nada:`)
    for (const h of hallazgos) console.error(`  · ${h}`)
    process.exitCode = 1
    return
  }
  if (!APLICAR) return console.log('\nensayo: no toqué Postgres. Con --aplicar guarda y verifica.')

  const canonica = await canonicasPorRotulo()
  const conVinculo = nuevas.map((f) => ({ ...f, obra_canonica_id: canonica(f.obra_rotulo) }))

  await withTx(async (c) => {
    // LO QUE YA NO ESTÁ EN EL SHEET DEJA DE ESTAR EN LA TABLA. Un ítem que el dueño borró y
    // sobrevive en la base vuelve a aparecer en cualquier consulta como si fuera plan vigente: es el
    // mismo defecto que la cola de una pestaña que no se limpia. Se borra sólo lo que este script
    // escribió (`origen_pestana`), nunca una fila cargada por otro camino.
    await c.query(
      `delete from public.obra_egreso_proyectado
        where origen_pestana = $1 and not (clave = any($2::text[]))`,
      [PESTANA_ORIGEN, conVinculo.map((f) => f.clave)])
    for (const f of conVinculo) {
      await c.query(
        `insert into public.obra_egreso_proyectado
           (clave, obra_rotulo, obra_clave, obra_canonica_id, tipo, concepto, familia, proveedor,
            fecha_estimada, fecha_texto, monto, nota, origen_pestana, origen_celda, origen_fuente, origen_leido_en)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         on conflict (clave) do update set
           obra_rotulo = excluded.obra_rotulo, obra_clave = excluded.obra_clave,
           obra_canonica_id = excluded.obra_canonica_id, tipo = excluded.tipo,
           concepto = excluded.concepto, familia = excluded.familia, proveedor = excluded.proveedor,
           fecha_estimada = excluded.fecha_estimada, fecha_texto = excluded.fecha_texto,
           monto = excluded.monto, nota = excluded.nota, origen_pestana = excluded.origen_pestana,
           origen_celda = excluded.origen_celda, origen_fuente = excluded.origen_fuente,
           origen_leido_en = excluded.origen_leido_en, actualizado_en = now()`,
        [f.clave, f.obra_rotulo, f.obra_clave, f.obra_canonica_id, f.tipo, f.concepto, f.familia,
          f.proveedor, f.fecha_estimada, f.fecha_texto, f.monto, f.nota, f.origen_pestana,
          f.origen_celda, f.origen_fuente, f.origen_leido_en])
    }
  })

  // ── LA VERIFICACIÓN DEL EFECTO: SE VUELVE A LEER DE LA BASE ──
  const { rows } = await query(
    `select clave, obra_rotulo, obra_clave, obra_canonica_id, tipo, concepto, familia, proveedor,
            fecha_estimada::text as fecha_estimada, fecha_texto, monto, nota,
            origen_pestana, origen_celda, origen_fuente
       from public.obra_egreso_proyectado where origen_pestana = $1`, [PESTANA_ORIGEN])
  const dif = compararConLoGuardado(conVinculo, rows)
  const vinculadas = rows.filter((r) => r.obra_canonica_id).length
  console.log(`\nguardadas ${rows.length} fila(s) · ${vinculadas} vinculada(s) a una obra canónica`)
  if (dif.length) {
    console.error(`⚠ ${dif.length} diferencia(s) entre lo leído del Sheet y lo que devolvió la base:`)
    for (const d of dif) console.error(`  · ${d}`)
    process.exitCode = 1
    return
  }
  console.log('✓ lo guardado es IDÉNTICO a lo leído, campo por campo')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
