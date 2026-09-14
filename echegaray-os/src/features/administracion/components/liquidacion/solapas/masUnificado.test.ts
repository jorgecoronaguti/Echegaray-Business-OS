// «MÁS» EN TRES SECCIONES, SIN DATOS REPETIDOS Y CON UN SOLO NÚMERO POR CONCEPTO.
//
// Dueño, 14/09/2026: *«hay datos q se repiten en las secciones de la pestaña "mas" que has creado para
// liq de hs, unificar conceptos en menos secciones»*. Había seis secciones y la Quincena ya tenía las
// horas por día, la cadena de pago y los totales banco/efectivo/total: la tabla de Pagos los repetía
// enteros, y el total salía tres veces con dos funciones distintas.
//
// Las claves y los alias se prueban ejecutando `claves.ts` (puro). Lo que es un Server Component se
// prueba sobre la fuente, sin comentarios: una cabecera que EXPLICA la regla no puede hacer pasar el test.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { CLAVES_DEL_MENU, SOLAPA_POR_DEFECTO, claveDeSolapa } from './claves.ts'

const url = (rel: string) => new URL(rel, import.meta.url)
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const codigo = (rel: string) => sinComentarios(readFileSync(url(rel), 'utf8'))

const INDICE = codigo('./index.ts')
const CAJA = codigo('./caja-nomina.tsx')
const CIERRE = codigo('./cierre.tsx')
const VISTA = codigo('./quincena.tsx')

test('«MÁS» TIENE EXACTAMENTE TRES SECCIONES, EN ESTE ORDEN', () => {
  assert.deepEqual([...CLAVES_DEL_MENU], ['caja', 'costo', 'cierre'])
  assert.equal(SOLAPA_POR_DEFECTO, 'quincena')
  const registro = INDICE.slice(INDICE.indexOf('export const SOLAPAS'))
  const claves = [...registro.matchAll(/\{ clave: '([a-z]+)', titulo: '([^']+)'/g)].map((m) => [m[1], m[2]])
  assert.deepEqual(claves, [
    ['quincena', 'Quincena'], ['caja', 'Caja y proyección'], ['costo', 'Costo y convenio'], ['cierre', 'Cierre y recibos'],
  ])
})

test('LAS URL VIEJAS RESUELVEN A LA SECCIÓN NUEVA, Y UNA INVENTADA A LA QUINCENA', () => {
  assert.equal(claveDeSolapa('pagos'), 'caja')
  assert.equal(claveDeSolapa('horas'), 'cierre')
  assert.equal(claveDeSolapa('convenios'), 'costo')
  assert.equal(claveDeSolapa('recibos'), 'cierre')
  for (const c of ['quincena', 'caja', 'costo', 'cierre']) assert.equal(claveDeSolapa(c), c)
  assert.equal(claveDeSolapa('inventada'), 'quincena')
  assert.equal(claveDeSolapa(undefined), 'quincena')
  // Y `solapaDe` —lo que usa la página— pasa por la misma resolución, no por un `find` propio.
  assert.match(INDICE, /SOLAPAS\.find\(\(s\) => s\.clave === claveDeSolapa\(clave\)\)/)
})

test('«CAJA Y PROYECCIÓN» NO TRAE LA TABLA DE PAGOS', () => {
  // EL DEFECTO QUE ATRAPA: la tabla que repetía la Quincena columna por columna.
  for (const col of ['Adelanto', 'Ya transf.', 'Blanco 50%', 'Efect. red.', 'CeldaEditable', 'CeldaRedondeo']) {
    assert.ok(!CAJA.includes(col), `Caja no dibuja «${col}»`)
  }
  assert.ok(!/from '\.\/pagos'/.test(INDICE + CAJA), 'nadie monta la tabla de Pagos')
  assert.ok(!existsSync(url('./pagos.tsx')), 'la tabla de Pagos huérfana se borró')
  assert.ok(!existsSync(url('./SolapaHoras.tsx')), 'la grilla de Horas huérfana se borró')
})

test('LOS TOTALES DE CAJA SALEN DE LA MISMA FUNCIÓN QUE EL PIE DE LA QUINCENA', () => {
  // EL DEFECTO QUE ATRAPA: Caja sumaba con `totalesDeCuadro` sobre los cuadros; el pie, con
  // `totalesDelEspejo` sobre las filas. Dos funciones para «cuánto va por banco».
  for (const [nombre, fuente] of [['Caja', CAJA], ['Quincena', VISTA], ['Cierre', CIERRE]] as const) {
    assert.match(fuente, /leerCuadroDeLaQuincena\(/, `${nombre} arma las filas con la lectura común`)
    assert.match(fuente, /totalesDelEspejo\(/, `${nombre} suma con totalesDelEspejo`)
    assert.ok(!/totalesDeCuadro|tarjetaDeQuincena/.test(fuente), `${nombre} no suma con otra función`)
  }
  assert.match(VISTA, /totalesDelEspejo\(visibles\)/)
  const COMUN = codigo('../../../services/cuadroDeLaQuincenaService.ts')
  assert.match(COMUN, /filasDelEspejo\(\{/)
  assert.match(COMUN, /getLiquidacionDeLaQuincena\(supabase, quincena\)/)
})

test('LOS PENDIENTES SALEN DE UNA SOLA FUNCIÓN: estadoDeCierre', () => {
  // EL DEFECTO QUE ATRAPA: «Horas» contaba con `resumenDeGrilla` y «Cierre» con `estadoDeCierre`, y
  // el botón podía estar gris en una y activo en la otra sobre la misma quincena.
  assert.match(CIERRE, /estadoDeCierre\(lineas, \{ porPersona: pendientesPorPersona\(grilla, hoy\) \}\)/)
  for (const rel of ['./cierre.tsx', './caja-nomina.tsx', './costo.tsx', './quincena.tsx', './cierre-y-recibos.tsx']) {
    assert.ok(!/resumenDeGrilla/.test(codigo(rel)), `${rel} no cuenta pendientes por su cuenta`)
  }
  const PENDIENTES = codigo('./PendientesDeCierre.tsx')
  assert.match(PENDIENTES, /hrefDe\(\{ solapa: 'quincena', buscar: p\.nombre \}\)/, 'cada persona enlaza a su fila de la Quincena')
})

test('RECIBOS SE MONTA TAL CUAL DEBAJO DEL CIERRE', () => {
  const CR = codigo('./cierre-y-recibos.tsx')
  assert.match(CR, /import \{ SolapaRecibos \} from '\.\/recibos'/)
  assert.ok(CR.indexOf('SolapaCierre(') < CR.indexOf('SolapaRecibos('), 'el cierre va arriba, recibos al final')
})

test('LO ÚNICO DE CADA SECCIÓN VIEJA SIGUE (dueño: «no quitar»)', () => {
  for (const id of ['cf-os', 'cf-sheet', 'cf-diferencia', 'fila-proyeccion', 'aguinaldo-sin-base', 'pagos-recibo-sin-giro', 'caja-masa-en-curso']) {
    assert.match(CAJA, new RegExp(id), `Caja conserva ${id}`)
  }
  assert.match(codigo('./costo.tsx'), /SolapaConvenios\(/)
  const CONV = codigo('./convenios.tsx')
  for (const s of ['<FormularioEscala', 'no-dibujable', 'total-regularizar']) assert.ok(CONV.includes(s), `Convenio conserva ${s}`)
  for (const s of ['<ReabrirQuincena', '<BotonCerrar', 'cierre-sin-cargar', 'avisoDeReapertura(']) assert.ok(CIERRE.includes(s), `Cierre conserva ${s}`)
})

test('EL $/H DE LA TABLA DE CONVENIO ES EL DE LA QUINCENA: misma función, misma fecha', () => {
  // La línea (liquidacionCuadros) y la exposición toman la tarifa con `tarifaVigenteAl` al ÚLTIMO día
  // de la quincena. Si una de las dos pasara a otra fecha (hoy, el primer día), la tabla de convenio
  // mostraría un $/h que no es el de la fila del cuadro.
  assert.match(codigo('../../../services/liquidacionCuadros.ts'), /tarifaVigenteAl\(tarifasDe\(d\.tarifas, p\.id\), d\.quincena\.hasta\)/)
  assert.match(codigo('../../../services/exposicionConvenioService.ts'), /tarifaVigenteAl\([\s\S]{0,400}?\),\s*q\.hasta,\s*\)/)
})
