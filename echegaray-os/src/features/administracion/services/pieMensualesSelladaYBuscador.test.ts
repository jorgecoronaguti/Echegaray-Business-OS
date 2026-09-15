// TRES DEFECTOS DEL QA DE LA VISTA (c615630e, 14/09/2026).
//
// 1. PIE CON MENSUALES: 01/09 mostraba Neto 2.031.153,24 + Negro 2.847.904 y Total 8.479.057,24; faltaban
//    3.600.000 (Maldonado y Nievas), cuyo sueldo fijo iba en «$/h negro» y sumaba al Total sin estar en
//    ninguna banda. Ahora: Neto + Negro + Sueldos mensuales = Total, exacto. Y los jefes muestran sus horas.
// 2. QUINCENA CERRADA 16/08: «Negro $0» con el total muy por encima del neto. Ahora el negro de la foto
//    sellada es total − neto, y Neto + Negro = Total en la fila y en el pie.
// 3. BUSCADOR: «limpiar» y enseguida «Mensuales» dejaba el texto pegado. El campo lleva `key` = lo buscado.
//
// MUTACIONES QUE LO PONEN ROJO: sumar el mensual en las bandas; negro de la cerrada en 0; sacar la `key`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aplicarOverrides, sinOverrides, type LineaConOverrides } from './liquidacionOverrides.ts'
import { liquidarLinea, tituloDeExtras } from './liquidacionQuincena.ts'
import { totalesDelEspejo, type FilaDelEspejo } from './espejoDeJornales.ts'
import { entradaDeBlanco, negroDeLaFila, sueldoBlancoNegro, type ReciboDeSueldo } from './sueldoBlancoNegro.ts'
import { armarCuadros } from './liquidacionCuadros.ts'
import { quincenaDe } from './quincena.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const fila = (linea: LineaConOverrides, cerrada = false) => ({
  personaId: linea.personaId, linea, cerrada, cotejo: { estado: 'coincide' }, celdas: [],
  horasPorTipo: { normales: 0, extra50: 0, extra100: 0, total: 0 },
}) as unknown as FilaDelEspejo

const RECIBO: ReciboDeSueldo = {
  personaId: 'rosales', cuil: null, periodo: 'Q2-08/2026', categoria: 'OFICIAL', valorHora: 6348, horasBlanco: 50,
  bruto: 317400, neto: 230240.12, driveFileId: null,
}
const obrero = (id: string, horas: number) => liquidarLinea({
  personaId: id, nombre: id, horas, tarifa: { valorHora: 5874, netoMensual: null, desde: '2026-08-16', origen: 't' },
  adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
}, 'obreros')
const mensual = liquidarLinea({
  personaId: 'maldonado', nombre: 'MALDONADO', horas: 89, tarifa: { valorHora: null, netoMensual: 1800000, desde: '2026-08-01', origen: 't' },
  adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
}, 'oficina')

test('EL PIE CIERRA CON UN MENSUAL Y DOS OBREROS: Neto + Negro + Sueldos mensuales = Total', () => {
  const blanco = entradaDeBlanco({ personaId: 'rosales', cuil: null, periodo: 'Q2-08/2026', recibos: [RECIBO], pisoCategoria: 6348, netoDeNomina: null })
  const conRecibo = aplicarOverrides(obrero('rosales', 94), {}, 'obreros', null, blanco)
  const estimado = aplicarOverrides(obrero('tello', 40), {}, 'obreros', null,
    { recibo: null, netoDeNomina: null, pisoCategoria: 6348, proporcion: { cociente: 0.769, origen: 'plantel', recibos: 8 } })
  const jefe = aplicarOverrides(mensual, {}, 'oficina')
  const t = totalesDelEspejo([fila(conRecibo), fila(estimado), fila(jefe)])
  assert.equal(t.mensuales, 1800000)
  assert.equal(negroDeLaFila(jefe), null, 'un mensual no tiene negro')
  assert.equal(Math.round((t.netoBandas + t.negro + t.mensuales) * 100) / 100, t.cobra,
    'MUTACIÓN: sumar el mensual en las bandas deja el pie sin cerrar')
  assert.equal(t.netoBandas, Math.round((conRecibo.porBanco + estimado.porBanco) * 100) / 100)
})

test('LA QUINCENA CERRADA EXPLICA LA PLATA: negro = total sellado − neto, en la fila y en el pie', () => {
  // Agüero, 16/08: neto 215.564,62, total 639.218.
  const sellada = sinOverrides(liquidarLinea({
    personaId: 'aguero', nombre: 'AGUERO', horas: 107, tarifa: { valorHora: 5974, netoMensual: null, desde: '2026-08-16', origen: 'sellada' },
    adelanto: 0, yaTransferido: 0, reciboNeto: 215564.62, giroEnElLote: true,
  }, 'obreros'))
  assert.equal(sellada.cobra, 639218)
  assert.equal(negroDeLaFila(sellada), 423653.38, 'MUTACIÓN: «Negro $0» no explica la diferencia')
  assert.equal(sellada.porBanco + negroDeLaFila(sellada)!, sellada.cobra)
  const t = totalesDelEspejo([fila(sellada, true)])
  assert.equal(Math.round((t.netoBandas + t.negro) * 100) / 100, t.cobra)
  // La celda lo dice.
  const CELDAS = fuente('../components/liquidacion/cuadro/CeldasBlancoNegro.tsx')
  assert.match(CELDAS, /foto sellada: total − neto del recibo/)
  assert.match(fuente('../components/liquidacion/GrillaEspejoQuincena.tsx'), /sellada=\{visibles\.some\(\(f\) => f\.cerrada\)\}/)
})

test('LA GRILLA: el mensual ocupa las bandas en una celda propia y el pie tiene «Sueldos mensuales»', () => {
  const g = fuente('../components/liquidacion/GrillaEspejoQuincena.tsx')
  // POR MODALIDAD DESDE EL 15/09/2026: el jefe sin neto cargado también cobra por mes (`cobroMensual.ts`).
  assert.match(g, /l\.modalidad === 'mensual' \? \(/)
  assert.match(g, /gridColumn: `span \$\{ANCHO_DE_LAS_BANDAS\}`/)
  assert.match(g, /cifra\('Sueldos mensuales', totales\.mensuales/)
  assert.match(g, /<Leida valor=\{totales\.netoBandas\} testid="espejo-total-neto" \/>/)
})

test('LOS JEFES MUESTRAN SUS HORAS: la columna Horas de un mensual no es «—»', () => {
  const [oficina] = armarCuadros({
    quincena: quincenaDe('2026-09-01'),
    personas: [{ id: 'maldonado', nombre: 'MALDONADO', cuil: null, enLaEmpresa: true, esJefe: true }],
    tarifas: [{ persona_id: 'maldonado', desde: '2026-08-01', valor_hora: null, neto_mensual: 1800000, origen: 't' }],
    horas: new Map([['maldonado', { horas: 89, horasEquivalentes: 89, presentesSinHoras: 0 }]]),
    recibos: [], adelantos: [], redondeos: new Map(),
  }).filter((c) => c.grupo === 'oficina')
  assert.equal(oficina.lineas[0].horas, 89)
  assert.equal(oficina.lineas[0].cobra, 1800000, 'las horas no multiplican el neto mensual')
})

test('EL BUSCADOR SE REARMA CUANDO CAMBIA LO BUSCADO: `key` = el valor', () => {
  const f = fuente('../components/liquidacion/cuadro/FiltrosDelEspejo.tsx')
  assert.match(f, /key=\{busqueda\.valor\}\s+type="search" name="buscar" defaultValue=\{busqueda\.valor\}/,
    'MUTACIÓN: sin la clave el campo no controlado conserva el texto viejo')
})

test('EXTRAS: el negro paga el recargo y las horas lo aclaran en un title', () => {
  const s = sueldoBlancoNegro({ horas: 40, horasEquivalentes: 41.5, valorHoraNegro: 5000, recibo: null, netoDeNomina: null, pisoCategoria: 6000, proporcion: null })
  assert.equal(s.horasNegro, 20)
  assert.equal(s.recargoExtras, 1.5)
  assert.equal(s.negro, 107500, '(20 + 1,5) × 5.000')
  assert.equal(tituloDeExtras({ horas: 40.8, horasEquivalentes: 42.3, extras: [{ coeficiente: 1.5, horas: 3 }] }),
    'incluye 3 h extra al 1,5 · se pagan 42,3 h equivalentes')
  assert.equal(tituloDeExtras({ horas: 40, horasEquivalentes: 40, extras: [] }), null)
})
