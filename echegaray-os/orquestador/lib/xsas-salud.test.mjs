// LA SALUD POR CAPAS — cada prueba defiende que una palabra grande no tape un problema.

import test from 'node:test'
import assert from 'node:assert/strict'
import { capasDeSalud, peorVeredicto, VEREDICTO } from './xsas-salud.mjs'

const sano = {
  nivel: 'FULL',
  motor: { disponible: true },
  agentes: { total: 25, deNegocio: 23, delBuilder: 2, conClaudeCode: 2 },
  trabajos: { activos: 3, trabados: 0, completados: 100 },
  costo: { llamadas: 10, usd: 1, sinAtribuir: 0 },
  herramientas: 46,
  skills: 44,
  empresa: {
    activas: 2, con_avance: 2, actividades: 10, con_real: 5, con_inicio_real: 5, terminadas: 4,
    con_tarea_tipo: 8,
    experiencia: { hechosDuracion: 10, hechosRendimiento: 2, hechosDotacion: 1, tareasReutilizables: 3 },
  },
}

test('el sistema sano da OK en las cinco', () => {
  const { capas, veredicto } = capasDeSalud(sano)
  assert.equal(veredicto, VEREDICTO.OK)
  for (const c of Object.values(capas)) assert.equal(c.veredicto, VEREDICTO.OK)
})

test('EL DEFECTO: los timers corriendo no son que el sistema esté aprendiendo', () => {
  // Éste es el caso real del 27/08: infraestructura sana, motor disponible, y el cuadro decía FULL
  // con 116 hechos medidos y ninguna tarea con dos obras. La operación estaba bien; el aprendizaje
  // no rendía, y era lo que había que ver.
  const e = { ...sano, empresa: { ...sano.empresa, experiencia: { ...sano.empresa.experiencia, tareasReutilizables: 0 } } }
  const { capas, veredicto } = capasDeSalud(e)
  assert.equal(capas.infraestructura.veredicto, VEREDICTO.OK)
  assert.equal(capas.aprendizaje.veredicto, VEREDICTO.PARCIAL)
  assert.equal(veredicto, VEREDICTO.PARCIAL, 'el conjunto no puede decir OK con el aprendizaje frenado')
  assert.match(capas.aprendizaje.porQue, /dos obras/)
})

test('sin un solo hecho medido el aprendizaje es INSUFICIENTE, no PARCIAL', () => {
  const e = { ...sano, empresa: { ...sano.empresa, experiencia: { hechosDuracion: 0, hechosRendimiento: 0, hechosDotacion: 0, tareasReutilizables: 0 } } }
  assert.equal(capasDeSalud(e).capas.aprendizaje.veredicto, VEREDICTO.INSUFICIENTE)
})

test('si no se pudo contar la experiencia, el aprendizaje NO dice «cero hechos»', () => {
  // Una migración sin aplicar hacía que la cuenta fallara. Rellenar con ceros publicaría «el
  // circuito no recibió nada», que es una emergencia distinta a «la tabla todavía no existe».
  const e = { ...sano, empresa: { ...sano.empresa, experiencia: { noSePudoLeer: 'relation ... does not exist' } } }
  const c = capasDeSalud(e).capas.aprendizaje
  assert.equal(c.veredicto, VEREDICTO.NO_SE_PUDO_LEER)
  assert.match(c.porQue, /does not exist/)
})

test('una obra activa sin avance medido baja DATOS a PARCIAL', () => {
  const e = { ...sano, empresa: { ...sano.empresa, activas: 14, con_avance: 6 } }
  const c = capasDeSalud(e).capas.datos
  assert.equal(c.veredicto, VEREDICTO.PARCIAL)
  assert.match(c.porQue, /6 de 14/)
})

test('el proveedor caído NO tumba el veredicto del conjunto', () => {
  // Es todo el punto de que XSAS se describa con SQL y lectura de disco: el OS sigue aprendiendo,
  // operando y contestando sin razonador, y pintarlo de rojo sería mentir en el otro sentido.
  const e = { ...sano, motor: { disponible: false, sinCreditoDesde: '2026-08-01' } }
  const { capas, veredicto } = capasDeSalud(e)
  assert.equal(capas.iaExterna.veredicto, VEREDICTO.NO_DISPONIBLE)
  assert.equal(veredicto, VEREDICTO.OK)
})

test('lo que no se pudo leer NUNCA sale OK', () => {
  const { capas, veredicto } = capasDeSalud({ motor: { disponible: true }, noSePudoLeer: 'timeout' })
  assert.equal(capas.infraestructura.veredicto, VEREDICTO.CAIDA)
  assert.equal(capas.datos.veredicto, VEREDICTO.NO_SE_PUDO_LEER)
  assert.equal(capas.aprendizaje.veredicto, VEREDICTO.NO_SE_PUDO_LEER)
  assert.equal(capas.capacidades.veredicto, VEREDICTO.NO_SE_PUDO_LEER)
  assert.equal(veredicto, VEREDICTO.CAIDA)
})

test('un agente de negocio razonando con Claude Code baja CAPACIDADES', () => {
  const e = { ...sano, agentes: { ...sano.agentes, conClaudeCode: 5 } }
  const c = capasDeSalud(e).capas.capacidades
  assert.equal(c.veredicto, VEREDICTO.PARCIAL)
  assert.match(c.porQue, /3 agente/)
})

test('el peor manda: promediar una capa caída con cuatro sanas daría «casi bien»', () => {
  assert.equal(peorVeredicto([VEREDICTO.OK, VEREDICTO.OK, VEREDICTO.CAIDA]), VEREDICTO.CAIDA)
  assert.equal(peorVeredicto([VEREDICTO.OK, VEREDICTO.PARCIAL]), VEREDICTO.PARCIAL)
  assert.equal(peorVeredicto([]), VEREDICTO.OK)
})

test('un trabajo trabado esperando a una persona no es infraestructura sana', () => {
  const e = { ...sano, trabajos: { activos: 1, trabados: 2, completados: 5 } }
  assert.equal(capasDeSalud(e).capas.infraestructura.veredicto, VEREDICTO.PARCIAL)
})
