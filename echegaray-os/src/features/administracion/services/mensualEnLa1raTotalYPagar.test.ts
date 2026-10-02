// LA 1ª QUINCENA DEL MENSUAL EN EL CUADRO (QA en producción, 02/10/2026, 01–15/09, Maldonado y Nievas).
//
// Dos defectos vistos con la regla «el mes se liquida en la 2ª» ya publicada:
//  1. La columna Total de la fila decía «$0» mientras sueldo, efectivo y efect. red. decían «—».
//  2. «Pagar» seguía ofrecido: marcar pagada en la 1ª da por pagado un mes que todavía no se liquidó.
//
// MUTACIONES QUE LO PONEN ROJO: volver a `enLa2da && !l.manual.cobra` (un 0 anotado vuelve a salir «$0»); sacar
// `ofrecePagar` de la celda de persona; sacar el rechazo de `marcarLineaPagada` (el botón escondido no es una traba:
// la acción del servidor se puede llamar igual).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MOTIVO_SE_LIQUIDA_EN_LA_2DA, ofrecePagar, totalVacioEnLa1ra } from './recibosDelEstudio.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const linea = (cobra: number | null, manual: boolean, en1ra = true) =>
  ({ cobra, manual: { cobra: manual }, ...(en1ra ? { seLiquidaEnLa2da: true } : {}) })

test('TOTAL en la 1ª del mensual: «—», también con un 0 anotado; un importe escrito a mano distinto de 0 se sigue viendo', () => {
  assert.equal(totalVacioEnLa1ra(linea(null, false), false), true)
  assert.equal(totalVacioEnLa1ra(linea(0, true), false), true, 'MUTACIÓN: un 0 anotado salía «$0»')
  assert.equal(totalVacioEnLa1ra(linea(350000, true), false), false, 'lo escrito a mano no se oculta')
  // La 2ª, los quincenales y la cerrada no cambian.
  assert.equal(totalVacioEnLa1ra(linea(2500000, false, false), false), false)
  assert.equal(totalVacioEnLa1ra(linea(null, false), true), false, 'la cerrada es la foto: su Total lo decide el sello')
})

test('PAGAR: no se ofrece en la 1ª del mensual; sí en la 2ª y a todos los quincenales', () => {
  assert.equal(ofrecePagar({ seLiquidaEnLa2da: true, pagadaEn: null }), false)
  assert.equal(ofrecePagar({ pagadaEn: null }), true, 'quincenal o 2ª quincena: sin cambios')
  assert.equal(ofrecePagar({ seLiquidaEnLa2da: false, pagadaEn: null }), true)
  // Una marca de antes de la regla queda visible para poder deshacerla: esconderla la dejaría sellada para siempre.
  assert.equal(ofrecePagar({ seLiquidaEnLa2da: true, pagadaEn: '2026-09-15T12:00:00Z' }), true)
})

test('CABLEADO: la fila usa la regla del Total, la celda de persona la de Pagar y el servidor rechaza la 1ª', () => {
  const fm = fuente('../components/liquidacion/cuadro/FilasMensuales.tsx')
  assert.match(fm, /\{totalVacioEnLa1ra\(l, cerrada\) \? <Vacia testid=\{`total-\$\{fila\.personaId\}`\} \/> : <CeldaTotal/)
  const cp = fuente('../components/liquidacion/cuadro/CeldaPersona.tsx')
  assert.match(cp, /camposEditables\.includes\('pagadoBanco'\) && ofrecePagar\(fila\.linea\) && \(\s*<MarcaDePago/)
  const acciones = fuente('./liquidacionActions.ts')
  const marcar = acciones.slice(acciones.indexOf('export async function marcarLineaPagada'))
  const rechazo = marcar.indexOf('if (linea.seLiquidaEnLa2da) return { ok: false, error: MOTIVO_SE_LIQUIDA_EN_LA_2DA }')
  assert.ok(rechazo > 0, 'marcarLineaPagada no rechaza la 1ª del mensual')
  assert.ok(rechazo < marcar.indexOf('pagada_en: new Date().toISOString()'), 'el rechazo va antes de escribir la marca')
  assert.equal(MOTIVO_SE_LIQUIDA_EN_LA_2DA, 'Se liquida en la 2ª quincena.')
})
