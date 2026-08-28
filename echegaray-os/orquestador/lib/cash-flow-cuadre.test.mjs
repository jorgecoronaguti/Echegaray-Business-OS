// QUE LAS DOS VISTAS COINCIDAN NO PUEDE DEPENDER DE QUE ALGUIEN MIRE.
//
// El defecto real: el Semanal daba ($57.164.937) de resultado del año y el Mensual ($44.091.619), y
// estuvo así hasta que el dueño abrió las dos pestañas y restó a mano. Estos tests exigen que el
// control se ponga ROJO ante ese mismo desvío, y que falle cerrado cuando no puede leer.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cuadre, filasDeCuadre, guardaDeCobertura, totalesDeVista, TOLERANCIA } from './cash-flow-cuadre.mjs'
import { ventanas } from './cash-flow-matriz.mjs'
import { grillaSemanal, PESTANA_SEMANAL } from './cash-flow-semanas.mjs'
import { grillaMeses, PESTANA_MENSUAL } from './cash-flow-meses.mjs'

const ANIO = 2026
const REFS = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
const HOY = new Date(Date.UTC(2026, 7, 13))
const AQUI = path.dirname(fileURLToPath(import.meta.url))

const META_SEM = grillaSemanal({ hoy: HOY, anio: ANIO, refs: REFS }).meta
const META_MES = grillaMeses({ anio: ANIO, refs: REFS, hoy: HOY }).meta

/** El rectángulo que devolvería la pestaña: rótulo en A, número en la columna TOTAL. */
function hoja(meta, { valor = () => 1000, salvo = {} } = {}) {
  const filas = []
  for (const f of filasDeCuadre(meta.tipo)) {
    const row = []
    row[0] = f.rotulo
    row[meta.cab.colTotal] = Object.hasOwn(salvo, f.clave) ? salvo[f.clave] : valor(f)
    filas[f.fila - 1] = row
  }
  return filas
}

const leer = (meta, opciones) => totalesDeVista(hoja(meta, opciones), meta)

test('dos vistas iguales cuadran, y se comparan TODAS las filas totalizables (no sólo el resultado)', () => {
  const r = cuadre(leer(META_SEM), leer(META_MES))
  assert.equal(r.ok, true, JSON.stringify(r.problemas))
  assert.ok(r.comparadas > 40, `sólo comparó ${r.comparadas} filas: un cuadre de tres números deja pasar errores que se compensan`)
  // Las cuatro medidas, la apertura por rubro y las líneas por cliente están adentro.
  const claves = r.lineas.map((l) => l.clave)
  for (const c of ['egresoProyectado', 'ingresoReal', 'resultado']) assert.ok(claves.includes(c), c)
  assert.ok(claves.some((c) => c.startsWith('cliente::')), 'los clientes también tienen que cuadrar')
  assert.ok(claves.some((c) => c.includes('::')), 'y la apertura por rubro')
})

test('EL DESVÍO REAL DEL 13/08 PONE EL CONTROL EN ROJO Y LO NOMBRA', () => {
  // Los números que el dueño leyó en las dos pestañas.
  const sem = leer(META_SEM, { salvo: { egresoProyectado: 364126253, resultado: -57164937 } })
  const mes = leer(META_MES, { salvo: { egresoProyectado: 351052936, resultado: -44091619 } })
  const r = cuadre(sem, mes)
  assert.equal(r.ok, false)
  assert.equal(r.fuera.length, 2)
  assert.equal(r.peor.rotulo, 'Variación de caja del período')
  assert.equal(Math.round(r.peor.delta), -13073318)
  assert.equal(r.lineas.find((l) => l.clave === 'egresoProyectado').delta, 13073317)
})

test('la tolerancia es UN PESO: absorbe el redondeo y nada más', () => {
  assert.equal(TOLERANCIA, 1)
  const ok = cuadre(leer(META_SEM, { salvo: { resultado: 1000.4 } }), leer(META_MES))
  assert.equal(ok.ok, true, 'cuarenta centavos son punto flotante, no un error de ventana')
  const mal = cuadre(leer(META_SEM, { salvo: { resultado: 1001.01 } }), leer(META_MES))
  assert.equal(mal.ok, false, 'un peso y un centavo ya no es redondeo')
})

test('FALLA CERRADO: si la pestaña no tiene la forma esperada, no dice que cuadra', () => {
  // El rótulo de la fila no es el que el generador escribió → alguien movió la pestaña.
  const roto = hoja(META_SEM)
  const fila = filasDeCuadre('semana').find((f) => f.clave === 'resultado')
  roto[fila.fila - 1][0] = 'Resultado del ejercicio'
  const r = cuadre(totalesDeVista(roto, META_SEM), leer(META_MES))
  assert.equal(r.ok, false)
  assert.ok(r.problemas.some((p) => p.includes(`A${fila.fila}`)), r.problemas.join(' | '))
  assert.ok(!r.lineas.some((l) => l.clave === 'resultado'), 'una fila que no se pudo identificar NO se compara igual')
})

test('un TOTAL que no es número —#REF!, vacío, un texto— es un problema, no un cero', () => {
  for (const v of ['#REF!', '', null, 'x']) {
    const r = cuadre(leer(META_SEM, { salvo: { resultado: v } }), leer(META_MES))
    assert.equal(r.ok, false, `"${v}" pasó como si nada`)
  }
  // Y un cero legítimo sí se compara: "Otros" vale $0 en ingresos y eso es información, no un hueco.
  assert.equal(cuadre(leer(META_SEM, { valor: () => 0 }), leer(META_MES, { valor: () => 0 })).ok, true)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA GUARDA BARATA: antes de escribir una celda
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('la guarda de cobertura pasa con las dos grillas de hoy', () => {
  const g = guardaDeCobertura([META_SEM, META_MES])
  assert.equal(g.ok, true, g.motivos.join(' | '))
})

test('CON LAS SEMANAS SIN ACOTAR LA GUARDA ABORTA — es el defecto, del lado barato', () => {
  const viejo = { ...META_SEM, efectivas: ventanas('semana', { anio: ANIO }) }
  const g = guardaDeCobertura([viejo, META_MES])
  assert.equal(g.ok, false)
  assert.ok(/no cubren/.test(g.motivos[0]), g.motivos.join(' | '))
})

test('dos vistas de años distintos no se comparan: la guarda lo dice antes de escribir', () => {
  const otroAnio = grillaMeses({ anio: 2027, refs: REFS, hoy: HOY }).meta
  const g = guardaDeCobertura([META_SEM, otroAnio])
  assert.equal(g.ok, false)
  assert.ok(g.motivos.some((m) => m.includes('no significaría nada')), g.motivos.join(' | '))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// QUE EL GENERADOR LO USE — un control que existe y nadie llama es un control que no existe
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('cash-flow-vistas llama a la guarda ANTES de escribir y al cuadre DESPUÉS, y aborta', () => {
  const src = readFileSync(path.join(AQUI, '../scripts/cash-flow-vistas.mjs'), 'utf8')
  const guarda = src.indexOf('guardaDeCobertura(')
  const escribe = src.indexOf('await escribirVista(')
  const cuadra = src.indexOf('await cuadrarLasVistas(')
  assert.ok(guarda > 0 && escribe > 0 && cuadra > 0, 'falta alguna de las dos mitades del control')
  assert.ok(guarda < escribe, 'la guarda de cobertura tiene que correr antes de la primera escritura')
  assert.ok(cuadra > escribe, 'el cuadre lee lo que la pestaña calculó: va después de escribir')
  assert.ok(/process\.exitCode = 1/.test(src), 'sin salida distinta de cero el pipeline da el paso por bueno')
})

test('los dos nombres de pestaña que compara son los reales', () => {
  assert.equal(META_SEM.pestana, PESTANA_SEMANAL)
  assert.equal(META_MES.pestana, PESTANA_MENSUAL)
})
