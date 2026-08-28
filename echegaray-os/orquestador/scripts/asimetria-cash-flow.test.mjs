// EL PUNTO DE ENTRADA DEL SCRIPT — que arranque, que no salga a la red, y que el informe diga cifras.
//
// La guarda `pathToFileURL` existe porque `new URL(import.meta.url).pathname` NO decodifica los
// espacios de la ruta: con esa forma, el script IMPORTADO desde un directorio con un espacio en el
// nombre se ejecutaba solo. En un script que sólo lee es molesto; en uno que escribe, ya costó caro.

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { informe } from './asimetria-cash-flow.mjs'
import { asimetriaDeLaProyeccion, RUBRO_JORNALES } from '../lib/cash-flow-asimetria.mjs'

const ejecutar = promisify(execFile)
const SCRIPT = fileURLToPath(new URL('./asimetria-cash-flow.mjs', import.meta.url))

test('--ayuda contesta sin autenticar ni salir a la red, y en menos de un segundo', async () => {
  const t0 = Date.now()
  const { stdout } = await ejecutar(process.execPath, [SCRIPT, '--ayuda'], { timeout: 5000 })
  assert.ok(stdout.includes('asimetria-cash-flow'), stdout)
  assert.ok(stdout.includes('--cobertura'), 'la bandera que cambia el criterio tiene que estar documentada')
  assert.ok(stdout.includes('No escribe nada'), stdout)
  assert.ok(Date.now() - t0 < 1000, 'si tarda más de un segundo es que salió a la red')
})

test('IMPORTAR el script no lo ejecuta: la guarda del punto de entrada aguanta', async () => {
  // Si `main()` corriera al importar, este mismo archivo de test habría salido a Google al arrancar.
  // Que el import de arriba haya funcionado sin credenciales ya es la prueba; esto la deja explícita.
  const m = await import('./asimetria-cash-flow.mjs')
  assert.equal(typeof m.informe, 'function')
})

test('el informe dice el ratio, el mes y la magnitud — no un veredicto', () => {
  const cuadro = [
    {
      mes: 'ago 26',
      egresoRealPorRubro: { [RUBRO_JORNALES]: 100, 'Materiales Civil': 219 },
      egresoProyectadoPorRubro: {},
      ingresoProyectado: 0,
    },
    {
      mes: 'nov 26',
      egresoRealPorRubro: {},
      egresoProyectadoPorRubro: { [RUBRO_JORNALES]: 100, 'Materiales Civil': 0, 'Nómina · Cargas sociales': 50 },
      ingresoProyectado: 30,
    },
  ]
  const texto = informe(asimetriaDeLaProyeccion(cuadro)).join('\n')
  assert.ok(texto.includes('2.19 de material por peso de jornal'), texto)
  assert.ok(texto.includes('nov 26'), texto)
  assert.ok(/\$219/.test(texto), 'la estimación del material faltante tiene que salir con su número')
  assert.ok(texto.includes('[ESTIMACIÓN]'), 'un número estimado no puede presentarse como un hecho')
  assert.ok(texto.includes('20%'), 'la cobertura de la nómina: 30 sobre 150')
  assert.ok(texto.includes('es un PISO'), texto)
})

test('un cuadro sin hallazgos dice que está limpio y no inventa un faltante', () => {
  const cuadro = [{
    mes: 'nov 26',
    egresoRealPorRubro: {},
    egresoProyectadoPorRubro: { [RUBRO_JORNALES]: 100, 'Materiales Civil': 200 },
    ingresoProyectado: 500,
  }]
  const texto = informe(asimetriaDeLaProyeccion(cuadro)).join('\n')
  assert.ok(texto.includes('✓ ningún mes proyecta nómina sin obra ni cobro'), texto)
  assert.ok(!texto.includes('⛔'), texto)
})
