import assert from 'node:assert/strict'
import { fechaSheet, num, mapearQuincenas, formatReplica } from './nomina-replica.mjs'

// Fechas: el Sheet devuelve serial O texto dd/mm/yyyy, según la celda. Las dos tienen que entrar.
assert.equal(fechaSheet('5/1/2026'), '2026-01-05')
assert.equal(fechaSheet('16/07/2026'), '2026-07-16')
assert.equal(fechaSheet(46027), '2026-01-05', 'serial real leído del Sheet')
assert.equal(fechaSheet(46024), '2026-01-02')
assert.equal(fechaSheet(''), null)
assert.equal(fechaSheet('TOTAL AÑO'), null, 'una etiqueta no es una fecha')

assert.equal(num('$ 8.157.588'), 8157588)
assert.equal(num('1.631,65'), 1631.65)
assert.equal(num('-'), 0)
assert.equal(num(1234.5), 1234.5)

// Estado: lo que ya terminó es dato; lo que sigue abierto va a SEGUIR subiendo.
{
  const hoy = new Date('2026-07-20')
  const filas = [
    // La columna 3 es "Se paga el" (entró el 31/07): la quincena de enero se pagó el 16/01, la de julio
    // todavía no tiene fecha y por eso va vacía — el fallback a "Hasta" tiene que sostenerla.
    ['5/1/2026', '15/01/2026', '16/01/2026', '10', '15', '1350', '959', '1380275', '20000', '3487800', '4888075'],
    ['16/7/2026', '30/07/2026', '', '13', '16', '1872', '338', '0', '0', '7786971', '7786971'],
    ['TOTAL AÑO', '', '', '', '', '', '', '', '', '', ''],
  ]
  const proy = [
    // Proyección: Quincena · Hasta · Se paga el · Días · Personas · A valores de hoy · Ajuste · Proyectado
    ['16/07/2026', '31/07/2026', '03/08/2026', '12', '19', '1631,65', '', '8157588'],   // misma quincena en curso
    ['01/08/2026', '15/08/2026', '17/08/2026', '10', '19', '1359,71', '', '6797990'],
  ]
  // "Desde" sin año, como lo trae el archivo JORNALES: el año se toma de "Hasta".
  const sinAnio = mapearQuincenas([['5/1', '15/01/2026', '16/01/2026', '10', '15', '1350', '959', '0', '0', '0', '4888075']], { hoy })
  if (sinAnio[0].desde !== '2026-01-05') throw new Error('desde sin año: ' + sinAnio[0].desde)
  const q = mapearQuincenas(filas, { hoy, proyectadas: proy })
  assert.equal(q.length, 3, 'dos reales + una proyectada; la fila TOTAL no entra')
  assert.equal(q[0].estado, 'cerrada')
  assert.equal(q[1].estado, 'en_curso', 'la quincena que todavía no terminó no es un dato cerrado')
  assert.equal(q[2].estado, 'proyectada')
  assert.equal(q[2].desde, '2026-08-01')
  // La quincena en curso NO se duplica con su propia proyección: sería contar la misma plata dos veces.
  assert.equal(q.filter((x) => x.desde === '2026-07-16').length, 1)
  assert.equal(q[0].total, 4888075)
  assert.equal(q[2].hs_reales, null, 'una quincena proyectada no tiene horas reales')
}

// El resumen nunca mezcla dato con estimación en un solo número.
{
  const t = formatReplica({ quincenas: 25, quincenas_proyectadas: 10, total_jornales: 114371743, cargas: 36, total_cargas: 44776342, uocra: 5 })
  assert.match(t, /10 proyectadas/)
  assert.match(t, /114\.371\.743/)
}

console.log('nomina-replica.test.mjs OK')
