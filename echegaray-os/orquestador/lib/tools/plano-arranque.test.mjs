// «Empecemos a cotizar» + un plano adjunto ARRANCA el cotizador — nunca el lector genérico.
//
// Medido el 02/09 (17:09, vivo): el dueño adjuntó «Plano de Estructura.pdf» y escribió
// «empecemos a cotizar»; la afinidad dio 3 (<5, el umbral de intentarConAdjuntos) y el pedido
// cayó a `archivo_ingesta`, que le devolvió la extracción cruda del PDF («2C 240 | K1 | K1…»).
// «cotiza» solo funcionaba de casualidad: pega dos veces por substring (cotizar + cotización).
// Este test fija el contrato: toda frase razonable de arranque supera el umbral, y las frases
// de OTROS dominios no se lo llevan puesto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { afinidad, PESO } from '../xsas-resolutores.mjs'
import { planoTools } from './plano-tool.mjs'

const UMBRAL = PESO.CABEZA + PESO.DISPARADOR
const tool = planoTools(null)['plano.cotizar']

test('las frases de arranque del cotizador superan el umbral de adjuntos', () => {
  for (const frase of [
    'empecemos a cotizar',
    'empezá a cotizar',
    'vamos a cotizar',
    'quiero cotizar esto',
    'cotiza',
    'cotizame esta obra',
    'presupuestame esta obra',
    'armame el presupuesto de esto',
    'arrancá la cotización',
  ]) {
    const p = afinidad(frase, tool)
    assert.ok(p >= UMBRAL, `«${frase}» dio ${p} < ${UMBRAL}: caería al lector genérico de archivos`)
  }
})

test('las frases de otros dominios NO arrancan el cotizador por accidente', () => {
  for (const frase of [
    'mirá este extracto del banco',
    'guardá esta factura en compras',
    'leé este recibo de sueldo',
    'qué dice este contrato',
  ]) {
    const p = afinidad(frase, tool)
    assert.ok(p < UMBRAL, `«${frase}» dio ${p} ≥ ${UMBRAL}: el cotizador se robaría un adjunto ajeno`)
  }
})
