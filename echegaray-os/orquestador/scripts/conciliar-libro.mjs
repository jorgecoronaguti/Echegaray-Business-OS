#!/usr/bin/env node
// ¿EL LIBRO CANÓNICO DICE LO MISMO QUE EL CALENDARIO DE CAJA? — el portón antes de migrar las vistas.
//
// ═══ POR QUÉ EXISTE ═══
//
// Las tres vistas van a dejar de calcular con SUMPRODUCT sobre las fuentes y van a pasar a leer
// `_MOVIMIENTOS`. Ese cambio sólo es legítimo si ANTES se demuestra que el libro y el modelo vigente
// cuentan la misma plata — si no, migrar es cambiar de número sin saber por qué. El dueño: "no acepto
// diferencias sin causa exacta".
//
// SÓLO LEE. Compara, tramo por tramo del calendario de CAJA, lo que dice la pestaña contra lo que
// suma el libro con la misma ventana. Una diferencia no es automáticamente un defecto del libro:
// puede ser un defecto del modelo viejo que el libro corrige — por eso se ABRE, no se falla a ciegas.
//
//   node orquestador/scripts/conciliar-libro.mjs

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { sumar, ENTRA, SALE } from '../lib/libro-movimientos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const pesos = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

async function main() {
  const g = makeGoogleClient({ config: loadConfig() })

  // ── El libro, releído de su pestaña: se concilia lo ESCRITO, no lo que la memoria cree ──────────
  const crudo = await g.readSheetValues(ID, '_MOVIMIENTOS!A2:P800', { render: 'UNFORMATTED_VALUE' })
  const libro = (crudo ?? []).filter((f) => Number.isFinite(f?.[0]) && Number.isFinite(f?.[2]))
    .map((f) => ({ fecha: f[0], signo: f[1], importe: f[2], rubro: String(f[5] ?? ''), estado: String(f[7] ?? ''), instrumento: String(f[8] ?? '') }))
  if (!libro.length) throw new Error('_MOVIMIENTOS está vacía: corré primero libro-movimientos-pestana.mjs')

  // ── El calendario de CAJA: tramos por rótulo, con sus bordes en la columna F ────────────────────
  const caja = await g.readSheetValues(ID, 'CAJA!A1:F45', { render: 'UNFORMATTED_VALUE' })
  const iCab = caja.findIndex((f) => String(f?.[0] ?? '').trim() === 'Tramo')
  if (iCab < 0) throw new Error('no encontré el calendario en CAJA')
  const tramos = []
  for (let i = iCab + 1; i < caja.length; i++) {
    const rot = String(caja[i]?.[0] ?? '').trim()
    if (/^⇒/.test(rot) || !rot) break
    tramos.push({ rotulo: rot, entra: num(caja[i]?.[2]), sale: num(caja[i]?.[3]), hasta: num(caja[i]?.[5]) || null })
  }

  console.log('EL LIBRO CONTRA EL CALENDARIO DE CAJA — tramo por tramo, por lo que entra y por lo que sale')
  console.log('─'.repeat(96))
  console.log(`  ${'Tramo'.padEnd(26)}${'CAJA entra'.padStart(14)}${'libro entra'.padStart(14)}${'CAJA sale'.padStart(14)}${'libro sale'.padStart(14)}${'Δ neto'.padStart(13)}`)
  let desde = -Infinity
  let peor = 0
  for (const t of tramos) {
    const hasta = t.hasta ?? Infinity
    const f = { desde: desde === -Infinity ? undefined : desde, hasta: hasta === Infinity ? undefined : hasta }
    const e = sumar(libro, { ...f, signo: ENTRA }).total
    const s = -sumar(libro, { ...f, signo: SALE }).total
    const dif = (t.entra - e) - (t.sale - s)
    peor = Math.max(peor, Math.abs(dif))
    console.log(`  ${t.rotulo.slice(0, 25).padEnd(26)}${pesos(t.entra).padStart(14)}${pesos(e).padStart(14)}${pesos(t.sale).padStart(14)}${pesos(s).padStart(14)}${pesos(dif).padStart(13)}`)
    desde = hasta
  }

  console.log('\nLAS CAUSAS CONOCIDAS DE DIFERENCIA — antes de gritar, restar esto:')
  console.log('  · CAJA proyecta nómina/impuestos con calendario propio (Estructura, Recurrentes, IVA/IIBB):')
  console.log('    el libro todavía NO tiene extractores de esas fuentes — está declarado en libro-extractores.mjs.')
  console.log('  · CAJA suma cobranzas esperadas con probabilidad; el libro toma el neto a cobrar completo.')
  console.log(`  · El tramo "Vencido" de CAJA excluye lo anterior al corte del banco; el libro no tiene ese piso.`)
  console.log(`\n  peor diferencia de tramo: ${pesos(peor)}`)
  console.log('  Este portón es INFORMATIVO hasta que los extractores cubran todas las fuentes del calendario;')
  console.log('  recién ahí pasa a fallar con código 1 y las vistas pueden migrar al libro.')
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
