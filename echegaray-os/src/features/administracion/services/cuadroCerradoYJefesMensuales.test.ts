// DOS DEFECTOS QUE DEJÓ «JEFES EN TODAS LAS QUINCENAS» (f1051b3a) Y LA REGLA DEL DUEÑO DEL 15/09/2026.
//
// 1. CUADRO SIN CABECERA EN UNA QUINCENA CERRADA: 16–31/08 se cerró sin cabecera de Oficina (estaba
//    vacía) y ahora tiene a los jefes. `estados[grupo] ?? 'abierta'` la dibujaba abierta y editable.
// 2. «LOS JEFES DE OBRA COBRAN POR MES, NO PREGUNTES MÁS»: la grilla de Horas decidía la modalidad por la
//    tarifa (jefe de agosto = «hora · sin tarifa», horas liquidables), el cierre abría un pendiente por
//    su neto faltante y el espejo lo metía en las bandas blanco/negro.
//
// MUTACIONES QUE LO PONEN ROJO: `estadoDelCuadro` sin herencia; `faltaLaTarifa` sin la excepción del
// jefe; el cierre contando «sin cobra» al jefe mensual; el pie del espejo decidiendo por `netoMensual`;
// la grilla de Horas volviendo a decidir por la tarifa.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estadoDelCuadro } from './estadoDelCuadro.ts'
import { cobraPorMes, modalidadDeLaPersona, rotuloDelMensual, ROTULO_IMPORTE_NO_CARGADO } from './cobroMensual.ts'
import { faltaLaTarifa, liquidarLinea } from './liquidacionQuincena.ts'
import { estadoDeCierre, type LineaParaCerrar } from './liquidacionCierre.ts'
import { sinOverrides } from './liquidacionOverrides.ts'
import { totalesDelEspejo, type FilaDelEspejo } from './espejoDeJornales.ts'
import { negroDeLaFila } from './sueldoBlancoNegro.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('UN CUADRO SIN CABECERA HEREDA LA QUINCENA CERRADA; LA CABECERA PROPIA MANDA', () => {
  const obrerosCerrada = { id: 'c1', estado: 'cerrada' as const, cerradaEn: '2026-09-09T20:14:54Z' }
  assert.deepEqual(estadoDelCuadro({ obreros: obrerosCerrada }, 'oficina'),
    { id: null, estado: 'cerrada', cerradaEn: '2026-09-09T20:14:54Z' }, 'Oficina con jefes se veía abierta en 16–31/08')
  assert.equal(estadoDelCuadro({ obreros: obrerosCerrada }, 'obreros'), obrerosCerrada)
  assert.deepEqual(estadoDelCuadro({}, 'oficina'), { id: null, estado: 'abierta', cerradaEn: null })
  const abierta = { id: 'c2', estado: 'abierta' as const, cerradaEn: null }
  assert.equal(estadoDelCuadro({ oficina: abierta, obreros: obrerosCerrada }, 'oficina'), abierta)
})

test('LAS TRES PANTALLAS QUE LEEN EL ESTADO DEL CUADRO USAN LA HERENCIA', () => {
  const bloque = fuente('../components/liquidacion/BloqueLiquidacion.tsx')
  assert.doesNotMatch(bloque, /estados\[c\.grupo\]\?\.estado \?\? 'abierta'/)
  assert.match(bloque, /estado=\{estadoDelCuadro\(estados, c\.grupo\)\.estado\}/)
  assert.match(fuente('./cuadroDeLaQuincenaService.ts'), /estadoDelCuadro\(liquidacion\.estados, g\)\.estado === 'cerrada'/)
  assert.match(fuente('./liquidacionQuincenaService.ts'), /lineas: estadoDelCuadro\(estados, c\.grupo\)\.estado === 'cerrada'/)
})

test('EL JEFE COBRA POR MES CON O SIN NETO; QUIEN NO ES JEFE, SEGÚN SU TARIFA', () => {
  assert.equal(modalidadDeLaPersona({ esJefe: true, netoMensual: null }), 'mensual')
  assert.equal(modalidadDeLaPersona({ esJefe: false, netoMensual: 1800000 }), 'mensual')
  assert.equal(modalidadDeLaPersona({ esJefe: false, netoMensual: null }), 'hora')
  assert.equal(cobraPorMes({}), false)
  // UNA SOLA REGLA: la liquidación y la grilla de Horas la importan, ninguna la reescribe.
  assert.match(fuente('./liquidacionCuadros.ts'), /if \(cobraPorMes\(\{ esJefe: p\.esJefe, netoMensual: vigente\?\.netoMensual \}\)\)/)
  const grilla = fuente('./grillaHorasQuincenaService.ts')
  assert.match(grilla, /modalidad: modalidadDeLaPersona\(\{ esJefe: esJefeDeObra\(p\.puesto\), netoMensual:/)
  assert.doesNotMatch(grilla, /modalidadDeLaTarifa/)
  assert.match(fuente('./grillaHorasQuincena.ts'), /faltaLaTarifa\(p\.modalidad \?\? 'hora', p\.valorHora, p\.netoMensual \?\? null, p\.esJefe === true\)/)
})

test('SIN NETO, EL JEFE NO ESTÁ «SIN TARIFA»; QUIEN NO ES JEFE, SÍ', () => {
  assert.equal(faltaLaTarifa('mensual', null, null, true), false)
  assert.equal(faltaLaTarifa('mensual', null, null, false), true)
  assert.equal(faltaLaTarifa('hora', null, null, true), true, 'la excepción es del cobro mensual, no del valor hora')
})

const jefeSinNeto = (importeCargado: number | null) => liquidarLinea({
  personaId: 'maldonado', nombre: 'MALDONADO', horas: 44, tarifa: null, esJefe: true, importeCargado,
  adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
}, 'oficina')

test('EL RÓTULO DICE LO QUE HAY: importe de la planilla, o «mensual · importe no cargado»', () => {
  assert.equal(rotuloDelMensual(jefeSinNeto(null)), ROTULO_IMPORTE_NO_CARGADO)
  assert.equal(jefeSinNeto(null).cobra, null, 'nunca se inventa un sueldo')
  assert.equal(rotuloDelMensual(jefeSinNeto(398200)), 'mensual · importe cargado de la planilla')
  const conNeto = liquidarLinea({
    personaId: 'nievas', nombre: 'NIEVAS', horas: 46, esJefe: true,
    tarifa: { valorHora: null, netoMensual: 1800000, desde: '2026-09-01', origen: 'acuerdo' },
    adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
  }, 'oficina')
  assert.equal(rotuloDelMensual(conNeto), null, 'con neto vigente se dibuja como siempre')
  const cuadro = fuente('../components/liquidacion/CuadroLiquidacion.tsx')
  assert.match(cuadro, /\{rotuloDelMensual\(linea\) && \(/)
})

const paraCerrar = (extra: Partial<LineaParaCerrar>): LineaParaCerrar => ({
  personaId: 'p', nombre: 'P', horas: 44, valorHora: null, netoMensual: null, modalidad: 'mensual',
  cobra: null, porBanco: 0, enEfectivo: null, total: null, sinTarifa: false, reciboSinGiro: false, ...extra,
})

test('EL CIERRE NO LE PREGUNTA AL DUEÑO POR EL IMPORTE DEL JEFE; SÍ POR LA TARIFA DE OFICINA', () => {
  const jefe = estadoDeCierre([paraCerrar({ esJefe: true, nombre: 'MALDONADO' })])
  assert.deepEqual(jefe.pendientes.map((p) => p.clave), [])
  assert.equal(jefe.liquidadas, 0, 'sin importe no cuenta como liquidada')
  const otro = estadoDeCierre([paraCerrar({ esJefe: false, nombre: 'ADMINISTRATIVA' })])
  assert.ok(otro.pendientes.some((p) => p.clave === 'sin-tarifa'), 'Oficina sin neto que no es jefe sigue trabando')
})

test('EN EL ESPEJO, EL JEFE SIN NETO VA EN «SUELDOS MENSUALES», NO EN LAS BANDAS', () => {
  const l = sinOverrides(jefeSinNeto(398200))
  const fila = { personaId: l.personaId, linea: l, cerrada: false, cotejo: { estado: 'coincide' }, celdas: [],
    horasPorTipo: { normales: 0, extra50: 0, extra100: 0, total: 0 } } as unknown as FilaDelEspejo
  const t = totalesDelEspejo([fila])
  // EL PIE «COBRA TOTAL» DE 01–15/08 PERDÍA 814.500 (QA 15/09/2026): los jefes con importe de la planilla
  // quedaban «sin tarifa» y `totalesDelEspejo` salta esas filas.
  assert.equal(t.cobra, 398200)
  assert.equal(t.sinTarifa, 0)
  assert.equal(t.mensuales, 398200)
  assert.equal(t.netoBandas, 0)
  assert.equal(t.negro, 0)
  assert.equal(negroDeLaFila(l), null)
  assert.match(fuente('../components/liquidacion/cuadro/FilasMensuales.tsx'), /\{rotuloDelMensual\(l\) \?\? 'mensual'\}/)
})
