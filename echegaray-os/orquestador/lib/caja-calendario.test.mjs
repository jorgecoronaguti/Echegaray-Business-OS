// EL TRAMO VENCIDO DE LA ESCALERA, VERIFICADO EN FRÍO. Sin red, sin Sheet, sin escribir una celda.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO ATRAPA (17/08/2026) ═══
//
// Medido sobre `_MOVIMIENTOS` vivo, con corte de extracto 46248 y TODAY() = 46251:
//
//   46248  signo +1  $20.000.000  «San Francisco»  Cobranzas · efectivo · VENCIDO
//   46249  signo +1   $3.864.127  «San Francisco»  Cobranzas · efectivo · VENCIDO
//                     ───────────
//                     $23.864.127  que el tramo "Vencido — ya pasó la fecha" sumaba como plata QUE ENTRA
//
// El mismo archivo se contradecía en la misma pantalla: la fila de acciones emitía *"Reclamar
// $23.864.127 de cobranzas vencidas"* (caja-avisos.mjs, `cobranzaVencida`) mientras la escalera ya
// había contado esa plata dentro de la caja.
//
// Un EGRESO vencido sigue vivo: la obligación no se extingue porque pase la fecha, y por eso pertenece
// al tramo. Un INGRESO vencido es lo contrario: es el cobro que NO ocurrió. Ponerlo en el tramo del
// pasado afirma que ya entró — regla de oro 2, una estimación presentada como hecho.

import test from 'node:test'
import assert from 'node:assert/strict'
import { BORDES, DESDE_SIEMPRE, desdeTramo, hastaTramo, signoDelTramo, TRAMO_VENCIDO } from './caja-calendario.mjs'
import { terminoLibro } from './libro-sumas.mjs'
import { NO_REAL } from './caja-tarjetas.mjs'
import { sumar, movimiento, ENTRA, SALE } from './libro-movimientos.mjs'
import { grilla } from '../scripts/caja-pestana.mjs'

const REFS = { bancoRaw: '_BANCO_RAW', cheques: 'Cheques Emitidos', tarjeta: 'Tarjeta de Credito', chequesRaw: '_CHEQUES_RAW', filasCal: { iva: 18, iibb: 19 } }

test('el tramo del pasado cuenta LO QUE SE DEBE, no lo que no se cobró', () => {
  assert.equal(BORDES[TRAMO_VENCIDO][0], 'Vencido — ya pasó la fecha',
    'TRAMO_VENCIDO tiene que apuntar al tramo del pasado: si los bordes se reordenan, el filtro de signo '
    + 'se aplicaría al tramo equivocado y desaparecerían cobros futuros.')
  assert.equal(signoDelTramo(TRAMO_VENCIDO), SALE)
  // Todos los demás cuentan los dos lados: un cobro futuro es plata que se espera, y ahí sí se proyecta.
  for (let k = 1; k < BORDES.length; k++) assert.equal(signoDelTramo(k), null, `el tramo ${k} no filtra lado`)
})

test('EL DEFECTO: el neto del tramo vencido con los datos reales del 17/08', () => {
  // Las ocho filas VENCIDO del libro vivo, tal cual se leyeron de `_MOVIMIENTOS`.
  const o = (fila) => ({ pestana: 'x', fila })
  const libro = [
    movimiento({ fecha: 46220, signo: SALE, importe: 3452100, estado: 'VENCIDO', origen: o(1) }),
    movimiento({ fecha: 46237, signo: SALE, importe: 5133267, estado: 'VENCIDO', origen: o(2) }),
    movimiento({ fecha: 46244, signo: SALE, importe: 1632798, estado: 'VENCIDO', origen: o(3) }),
    movimiento({ fecha: 46248, signo: SALE, importe: 763365, estado: 'VENCIDO', origen: o(4) }),
    movimiento({ fecha: 46248, signo: SALE, importe: 224000, estado: 'VENCIDO', origen: o(5) }),
    movimiento({ fecha: 46248, signo: SALE, importe: 2950000, estado: 'VENCIDO', origen: o(6) }),
    movimiento({ fecha: 46248, signo: ENTRA, importe: 20000000, estado: 'VENCIDO', origen: o(7) }),
    movimiento({ fecha: 46249, signo: ENTRA, importe: 3864127, estado: 'VENCIDO', origen: o(8) }),
  ]
  const HOY = 46251
  const filtro = { hasta: HOY, estados: NO_REAL, signo: signoDelTramo(TRAMO_VENCIDO) ?? undefined }
  const { total } = sumar(libro, filtro)
  assert.equal(total, -14155530,
    'el tramo vencido tiene que valer lo que se DEBE. Sin el filtro de lado vale +$9.708.597, que son '
    + 'los $23.864.127 de cobranza vencida contados como caja.')
  // Y la contradicción, explícita: lo que la fila de acciones manda a reclamar no puede estar adentro.
  const reclamo = sumar(libro, { estados: ['VENCIDO'], signo: ENTRA })
  assert.equal(reclamo.total, 23864127)
  assert.equal(signoDelTramo(TRAMO_VENCIDO), -ENTRA,
    'la escalera y la acción "Reclamar ... de cobranzas vencidas" miran lados OPUESTOS del libro: '
    + 'si coincidieran, la misma plata estaría a la vez cobrada y por reclamar.')
})

test('la celda que se escribe lleva el filtro, y sale de la misma declaración', () => {
  const g = grilla(new Map(), REFS)
  const fila = g.filas.find((f) => String(f?.[5] ?? '').trim() === BORDES[TRAMO_VENCIDO][0])
  assert.ok(fila, 'no encontré la fila del tramo vencido en la escalera')
  // Se compara contra `terminoLibro` invocado con la MISMA declaración, no contra un texto tipeado:
  // una fórmula esperada a mano se desactualiza el día que cambie el constructor y el test pasaría
  // verde sobre una celda distinta de la que se escribe.
  assert.equal(fila[7], `=${terminoLibro({
    desde: DESDE_SIEMPRE, hasta: hastaTramo(TRAMO_VENCIDO), estados: NO_REAL, signo: signoDelTramo(TRAMO_VENCIDO),
  })}`)
  // Y el resto de los tramos NO filtra: un cobro esperado del mes que viene sigue siendo caja esperada.
  const otra = g.filas.find((f) => String(f?.[5] ?? '').trim() === BORDES[1][0])
  assert.equal(otra[7], `=${terminoLibro({ desde: desdeTramo(1), hasta: hastaTramo(1), estados: NO_REAL })}`)
})
