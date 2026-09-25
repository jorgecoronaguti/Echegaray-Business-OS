// Ninguna URL vieja termina en 404 ni en otro concepto (dueño, 25/09/2026). Ver `rutasViejas.ts`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { RUTAS_MUDADAS, destinoPermanente } from './rutasViejas.ts'

test('los duplicados vivos van a su única URL', () => {
  assert.equal(destinoPermanente('/h'), '/herramientas')
  assert.equal(destinoPermanente('/h/SOL-007'), null, 'el QR impreso con código sigue en su lugar')
  assert.equal(destinoPermanente('/integraciones/pedidos-materiales', '?obra=quattropani'), '/herramientas/material?obra=quattropani')
  assert.equal(destinoPermanente('/administracion/asistencia', '?estado=pendiente'), '/administracion/personas/correcciones?estado=pendiente')
  assert.equal(destinoPermanente('/obras/messina/cronograma'), '/obras/messina?vista=tareas&sub=gantt')
  assert.equal(destinoPermanente('/obras/messina/cronograma', '?sub=otra&x=1'), '/obras/messina?vista=tareas&sub=gantt&x=1', 'la query del destino gana')
})

test('las pantallas retiradas llevan a la que las reemplaza', () => {
  assert.equal(destinoPermanente('/flujo-caja'), '/calendario-financiero')
  assert.equal(destinoPermanente('/signup'), '/login')
  assert.equal(destinoPermanente('/control-obras/la-estrella'), '/obras/la-estrella')
  assert.equal(destinoPermanente('/mi-informacion/recibos/pago/abc/firmar'), '/mi-informacion/recibos')
  assert.equal(destinoPermanente('/portal-anterior/obra/x'), '/portal')
  assert.equal(destinoPermanente('/flujo-caja/'), '/calendario-financiero', 'con barra final')
})

test('lo vigente no se toca', () => {
  for (const r of ['/', '/obras', '/obras/hoy', '/obras/la-estrella', '/obra/hoy', '/hoy', '/mi-cuenta', '/herramientas',
    '/administracion/personas/asistencia', '/portal', '/portal/pagos', '/login']) {
    assert.equal(destinoPermanente(r), null, r)
  }
})

test('ningún destino es a su vez una ruta mudada (sin cadenas ni ciclos)', () => {
  for (const [desde, hacia] of Object.entries(RUTAS_MUDADAS)) {
    assert.equal(destinoPermanente(hacia.split('?')[0]), null, `${desde} → ${hacia} vuelve a redirigir`)
  }
})

test('todo destino existe como pantalla en src/app', () => {
  const app = join(import.meta.dirname, '../../app')
  const rutas = new Set<string>()
  const recorrer = (dir: string, url: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (!statSync(p).isDirectory()) { if (n === 'page.tsx' || n === 'route.ts') rutas.add(url || '/'); continue }
      recorrer(p, /^\(.*\)$/.test(n) ? url : `${url}/${n}`)
    }
  }
  recorrer(app, '')
  for (const hacia of new Set(Object.values(RUTAS_MUDADAS))) {
    const base = hacia.split('?')[0]
    assert.ok(rutas.has(base), `${hacia} no existe en src/app`)
  }
})
