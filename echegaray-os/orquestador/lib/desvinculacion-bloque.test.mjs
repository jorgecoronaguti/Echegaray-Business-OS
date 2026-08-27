// EL BLOQUE 6, PROBADO POR LO QUE PUBLICA.
//
// Dos defectos que este cuadro puede cometer sin dar un solo error, y que acá se ponen rojos:
//
//  · **Valuar a quien no se puede valuar.** Once de los diecinueve desafectados tienen en la planilla
//    un código de categoría («M», «AY») que el dueño NO declaró en la equivalencia del convenio. Sin
//    básico no hay jornal, y sin jornal la liquidación sería CERO — un cero que se leería como "no le
//    debemos nada". Esas filas van con "—" y no entran a ningún total.
//
//  · **Invadir la columna N.** «Pagado el» es del dueño y ya se le borró tres veces. Ninguna fila de
//    este bloque puede pasar de trece celdas.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bloqueDesvinculacion, filaActivo, filaDesafectado, liquidarPersona, formulaRastroDePago,
  tokenDeBusqueda,
} from './desvinculacion-bloque.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import { LARGO_NOTA, textoVisible } from './patron-pestana.mjs'
import { ESCALA_VERIFICADA } from './uocra-paritaria.mjs'

const HOY = new Date(2026, 7, 27)
const basicoDe = (cod) => {
  const cat = { OF: 'Oficial', 'OF M': 'Oficial', A: 'Ayudante', 'A M': 'Ayudante' }[cod]
  return cat ? { categoria: cat, basico: ESCALA_VERIFICADA[cat] } : null
}
const persona = (nombre, ingreso, categoria, meses, ultimoDia = null) => ({
  nombre, ingreso, categoria, reingreso: false, ultimoDia,
  horasPorMes: new Map(Object.entries(meses)),
})

const ACTIVOS = [
  persona('Quiroga Sebastian', new Date(2023, 5, 26), 'OF', { '2026-07': 207, '2026-08': 176 }),
  persona('Castillo Carlos', new Date(2026, 7, 19), 'A', { '2026-08': 27 }),
]
const DESAFECTADOS = [
  persona('Juan Bazan', new Date(2023, 8, 12), 'A', { '2026-03': 75 }, new Date(2026, 2, 13)),
  // Código que el dueño no declaró: no se puede valuar y el bloque tiene que decirlo.
  persona('Walter Santander', new Date(2025, 7, 6), 'M', { '2026-03': 83 }, new Date(2026, 2, 13)),
]

test('ninguna fila invade la columna del dueño (la 14)', () => {
  const b = bloqueDesvinculacion({ activos: ACTIVOS, desafectados: DESAFECTADOS, hoy: HOY, basicoDe })
  for (const f of b.filas) assert.ok(f.length <= 13, `fila de ${f.length} celdas: ${f[0]}`)
})

test('sin categoría del convenio la fila dice "—" y NO entra al total', () => {
  const b = bloqueDesvinculacion({ activos: ACTIVOS, desafectados: DESAFECTADOS, hoy: HOY, basicoDe })
  assert.equal(b.sinValuar, 1)
  const santander = b.desafectados.find((l) => l.nombre === 'Walter Santander')
  assert.equal(santander.valuable, false)
  const fila = filaDesafectado(santander)
  // Jornal, vacaciones, SAC, FCL y los dos totales: todos "—", ninguno cero.
  for (const i of [5, 6, 7, 8, 9, 10]) assert.equal(fila[i], '—')
  // Y el total del cuadro es exactamente el de Bazan, el único valuable.
  const bazan = b.desafectados.find((l) => l.nombre === 'Juan Bazan')
  assert.equal(Math.round(b.totales.costoD), Math.round(bazan.costoDesvincular))
})

test('el total de 6.1 cruza contra la suma de sus propias filas', () => {
  const b = bloqueDesvinculacion({ activos: ACTIVOS, desafectados: [], hoy: HOY, basicoDe })
  const suma = b.activos.reduce((s, l) => s + l.desembolso, 0)
  assert.equal(Math.round(b.totales.ta.desembolso), Math.round(suma))
  const costo = b.activos.reduce((s, l) => s + l.costoDesvincular, 0)
  assert.equal(Math.round(b.totales.costoA), Math.round(costo))
})

test('el costo de desvincular NO incluye los jornales devengados', () => {
  const l = liquidarPersona(ACTIVOS[0], HOY, basicoDe)
  assert.ok(l.haberes > 0)
  assert.equal(Math.round(l.desembolso - l.haberes), Math.round(l.costoDesvincular))
})

test('las celdas vacías de una fila de total llevan el CENTINELA, no cadena vacía', () => {
  const b = bloqueDesvinculacion({ activos: ACTIVOS, desafectados: [], hoy: HOY, basicoDe })
  const total = b.filas.find((f) => String(f[0]).startsWith('⇒'))
  for (const i of [1, 2, 3, 4, 5]) assert.equal(total[i], VACIO)
})

test('el rastro del pago es una fórmula VIVA y en es-AR', () => {
  assert.equal(tokenDeBusqueda('Juan Bazan'), 'Bazan')
  assert.equal(tokenDeBusqueda('Raul Sosa. 1'), 'Sosa')
  const f = formulaRastroDePago('Juan Bazan')
  assert.ok(f.startsWith('='))
  // El separador de argumentos del archivo es `;` — con coma da #ERROR! y no hay forma de verlo sin
  // abrir la pestaña.
  assert.ok(f.includes(';'), f)
  assert.ok(!/COUNTIF\([^;]*,/.test(f), f)
  assert.ok(f.includes('"*Bazan*"'), f)
  // No puede AFIRMAR que está pagada: un COUNTIF sobre el concepto no prueba eso.
  assert.ok(!/pagad/i.test(f), f)
})

test('las glosas del bloque entran en un renglón', () => {
  const b = bloqueDesvinculacion({ activos: ACTIVOS, desafectados: DESAFECTADOS, hoy: HOY, basicoDe })
  for (const f of b.filas) {
    const t = textoVisible(f[0])
    if (t.trimStart().startsWith('·')) assert.ok(t.length <= LARGO_NOTA, `${t.length}: ${t}`)
  }
})

test('la fila del activo publica antigüedad y categoría, no sólo plata', () => {
  const l = liquidarPersona(ACTIVOS[0], HOY, basicoDe)
  const f = filaActivo(l)
  assert.equal(f[0], 'Quiroga Sebastian')
  assert.equal(f[1], '26/06/2023')
  assert.equal(f[2], '3a 2m')
  assert.equal(f[3], 'OF')
  assert.equal(f[4], ESCALA_VERIFICADA.Oficial)
  assert.equal(f[5], '176 h')
})
