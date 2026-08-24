#!/usr/bin/env node
// ¿QUÉ VA A ESCRIBIR LA PRÓXIMA CORRIDA EN EL CUADRO 5 DE `OBRAS`? — ENSAYO DE SOLO LECTURA.
//
// POR QUÉ EXISTE. La fusión del cuadro 5 (`lib/materiales-fusion.mjs`) decide si cada ítem conserva
// LA FECHA Y EL IMPORTE DEL DUEÑO o si se siembra desde `obras-datos.mjs`. Los tests prueban la
// función contra pestañas inventadas; esto la corre contra LA PESTAÑA REAL y muestra el resultado
// celda por celda. Es la evidencia del efecto que los tests no pueden dar: la del archivo vivo.
//
// NO ESCRIBE NADA Y NO PUEDE: pide el cliente de Google SIN scopes de escritura. Tampoco toca el
// registro de rótulos — sólo lo lee, para poder decir si tiene memoria de la corrida anterior.
//
//   node orquestador/scripts/obras-cuadro5-ensayo.mjs

import { makeGoogleClient } from '../lib/google.mjs'
import { leerRegistro } from '../lib/respetar-ediciones.mjs'
import { fusionarCuadro5, lineasDeFusion, clavesDeMemoria } from '../lib/materiales-fusion.mjs'
import { totalDeclarado } from '../lib/materiales-previstos.mjs'
import { PESTANA_OBRAS, ANCHO_OBRAS } from '../lib/obras-grilla.mjs'
import { OBRAS_FUTURAS } from '../lib/obras-datos.mjs'
import { isoDeSerial } from '../lib/libro-extractores-fechas.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const letra = (i) => (i < 26 ? '' : String.fromCharCode(64 + Math.floor(i / 26))) + String.fromCharCode(65 + (i % 26))
const pesos = (n) => (typeof n === 'number' ? `$${Math.round(n).toLocaleString('es-AR')}` : String(n === VACIO ? '(vacía)' : n))
const corta = (s, n) => (String(s).length <= n ? String(s).padEnd(n) : `${String(s).slice(0, n - 1)}…`)

/** La celda D como se va a VER en la pestaña: un serial es una fecha, un texto es lo que dice. */
const verFecha = (v) => (typeof v === 'number' ? isoDeSerial(v).split('-').reverse().join('/') : (v === VACIO ? '(vacía)' : String(v)))

const google = makeGoogleClient({})
const filas = await google.readSheetValues(ID, `'${PESTANA_OBRAS}'!A1:${letra(ANCHO_OBRAS - 1)}`, { render: 'UNFORMATTED_VALUE' })
const memoria = await leerRegistro(ID, PESTANA_OBRAS).then((r) => clavesDeMemoria(r.mios)).catch(() => null)
console.log(`memoria de la corrida anterior: ${memoria ? `${memoria.size} ítem(s) registrados` : 'NO HAY (sin registro) — la fusión no va a sembrar ítems nuevos'}`)

const { items, diagnostico } = fusionarCuadro5({ obras: OBRAS_FUTURAS, filas, escritos: memoria })
for (const l of lineasDeFusion(diagnostico)) console.log(l)

console.log(`\n${'Obra — concepto'.padEnd(52)} ${'Proveedor'.padEnd(20)} ${'Fecha'.padEnd(11)} ${'Previsto'.padStart(14)}  origen`)
for (const i of items) {
  console.log(`${corta(i.rotulo, 52)} ${corta(i.proveedor, 20)} ${verFecha(i.fecha).padEnd(11)} ${pesos(i.previsto).padStart(14)}  ${i.origen}`)
}
const total = items.reduce((s, i) => s + (typeof i.previsto === 'number' ? i.previsto : 0), 0)
console.log(`${''.padEnd(52)} ${''.padEnd(20)} ${''.padEnd(11)} ${pesos(total).padStart(14)}  ${items.length} ítem(s)`)

// EL CONTROL NO SALE DE ESTA CUENTA: sale de la fórmula SUM() que la propia pestaña publica en su
// fila de cierre. Un control validado contra la información que produce no controla nada.
const declarado = totalDeclarado(filas)
console.log(`\ncontrol · la pestaña declara ${pesos(declarado)} en su «⇒ TOTAL» · esta fusión escribiría ${pesos(total)}`
  + `${declarado === null ? ' (la pestaña no publica total: no hay con qué contrastar)'
    : Math.abs(declarado - total) < 1 ? ' → COINCIDEN: no se le mueve un peso al plan del dueño'
      : ` → DIFIEREN en ${pesos(Math.abs(declarado - total))}: mirar el diagnóstico de arriba antes de escribir`}`)
