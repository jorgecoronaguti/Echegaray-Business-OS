// Tests del estado de la empresa (Gestión General). Herméticos: núcleo puro, sin DB.
import assert from 'node:assert/strict'
import { componerEstado, formatEstado, semaforo } from './estado-empresa.mjs'

let n = 0
const t = (nombre, fn) => { fn(); n++; console.log('  ok', nombre) }
const ind = (r, nombre) => r.indicadores.find((i) => i.nombre === nombre)

t('semáforo directo e invertido', () => {
  assert.equal(semaforo(10, { verde: 5, rojo: 1 }), 'verde')
  assert.equal(semaforo(0, { verde: 0, rojo: 1, mejorEsMenor: true }), 'verde')
  assert.equal(semaforo(500, { verde: 0, rojo: 1, mejorEsMenor: true }), 'rojo')
  assert.equal(semaforo(null, { verde: 0, rojo: 1 }), 'sin_dato')
})

t('caja que NO cubre lo vencido → rojo y palanca explícita', () => {
  const r = componerEstado({ caja_disponible: 1000, obligaciones_vencido: 4000, cobranzas_vencidas: 0 })
  const c = ind(r, 'Caja disponible')
  assert.equal(c.estado, 'rojo')
  assert.match(c.palanca, /priorizar cobranza/)
})

t('caja que cubre lo vencido → verde', () => {
  const r = componerEstado({ caja_disponible: 9000, obligaciones_vencido: 4000, cobranzas_vencidas: 0 })
  assert.equal(ind(r, 'Caja disponible').estado, 'verde')
})

t('sin caja calculable NO se asume cero', () => {
  const r = componerEstado({ caja_disponible: null })
  assert.equal(ind(r, 'Caja disponible').estado, 'sin_dato')
})

t('obligación o cobranza vencida de $1 ya es rojo (no hay vencido "aceptable")', () => {
  const r = componerEstado({ obligaciones_vencido: 1, cobranzas_vencidas: 1 })
  assert.equal(ind(r, 'Obligaciones vencidas').estado, 'rojo')
  assert.equal(ind(r, 'Cobranzas vencidas').estado, 'rojo')
})

t('sin obras activas → rojo y el cuello es comercial', () => {
  const r = componerEstado({ obras_activas: 0 })
  assert.match(ind(r, 'Obras activas').palanca, /cuello de botella es comercial/)
})

t('gasto sin imputar avisa que el margen está sobreestimado', () => {
  const r = componerEstado({ gasto_sin_imputar: 73217262 })
  const g = ind(r, 'Gasto sin imputar a obra')
  assert.equal(g.estado, 'rojo')
  assert.match(g.lectura, /73\.217\.262/)
  assert.match(g.palanca, /sobreestimado/)
})

t('NO se inventa margen si falta el contratado', () => {
  const r = componerEstado({ obras_activas: 4, obras_sin_contratado: 4 })
  const m = ind(r, 'Margen por obra')
  assert.equal(m.estado, 'sin_dato')
  assert.equal(m.valor, null, 'nunca un número de margen sin las dos puntas')
})

t('si todas las obras tienen contratado, no aparece el indicador de faltante', () => {
  const r = componerEstado({ obras_activas: 4, obras_sin_contratado: 0 })
  assert.equal(ind(r, 'Margen por obra'), undefined)
})

t('el cuello de botella es el primer rojo con palanca, y caja manda', () => {
  const r = componerEstado({ caja_disponible: 10, obligaciones_vencido: 5000, cobranzas_vencidas: 100, gasto_sin_imputar: 999 })
  assert.equal(r.cuello_de_botella, 'Caja disponible')
})

t('el resumen cuenta bien los estados', () => {
  const r = componerEstado({ caja_disponible: 100, obligaciones_vencido: 0, cobranzas_vencidas: 0, obras_activas: 2, gasto_sin_imputar: 0 })
  assert.equal(r.resumen.rojo, 0)
  assert.equal(r.resumen.verde, r.indicadores.length)
})

t('formatEstado muestra la restricción principal', () => {
  const txt = formatEstado(componerEstado({ caja_disponible: 1, obligaciones_vencido: 900 }))
  assert.match(txt, /RESTRICCIÓN PRINCIPAL HOY/)
})

console.log(`estado-empresa: ${n} checks OK`)
