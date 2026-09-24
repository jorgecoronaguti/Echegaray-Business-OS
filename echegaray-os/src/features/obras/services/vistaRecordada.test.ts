import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cookieDeVista, preferenciaDe, queryARestaurar } from './vistaRecordada.ts'

const p = (s: string) => new URLSearchParams(s)

test('cada vista recuerda su propia forma de mirar', () => {
  assert.equal(cookieDeVista('/obras'), 'obras.resumen')
  assert.equal(cookieDeVista('/obras/gantt'), 'obras.gantt')
  assert.equal(cookieDeVista('/obras/nueva'), null, 'el alta no es una vista')
  assert.equal(cookieDeVista('/administracion/personas'), null)
})

test('sólo se recuerdan las claves de vista, no lo que pase por la URL', () => {
  assert.equal(preferenciaDe(p('orden=etapa&dir=desc&pagina=3&token=abc')), 'orden=etapa&dir=desc')
})

test('una pantalla sin elección no guarda nada', () => {
  assert.equal(preferenciaDe(p('')), null)
  assert.equal(preferenciaDe(p('otra=cosa')), null)
})

test('«sin filtro» es una elección y se recuerda como tal', () => {
  // Si `etapa=` se descartara por vacío, la preferencia guardada seguiría filtrando por la etapa
  // anterior y quitar el filtro no tendría efecto en la próxima visita.
  assert.equal(preferenciaDe(p('etapa=&orden=avance&dir=desc')), 'orden=avance&dir=desc&etapa=')
})

test('se restaura cuando no se pidió nada', () => {
  assert.equal(queryARestaurar(p(''), 'orden=etapa&dir=desc'), 'orden=etapa&dir=desc')
})

test('lo que el que mira acaba de elegir MANDA sobre lo guardado', () => {
  assert.equal(queryARestaurar(p('orden=avance&dir=asc'), 'orden=etapa&dir=desc'), null)
  // Basta con que toque UNA de las claves: el resto vuelve al defecto de la pantalla, no a lo viejo.
  assert.equal(queryARestaurar(p('etapa=inicio'), 'orden=etapa&dir=desc'), null)
})

test('sin nada guardado no se redirige: no se inventa una vista', () => {
  assert.equal(queryARestaurar(p(''), null), null)
  assert.equal(queryARestaurar(p(''), ''), null)
})

test('un parámetro ajeno a la vista sobrevive a la restauración', () => {
  assert.equal(queryARestaurar(p('nueva=1'), 'orden=etapa&dir=desc'), 'orden=etapa&dir=desc&nueva=1')
})

// ═══ «ARCHIVADAS» YA NO ES UNA FORMA DE MIRAR (dueño, 24/09/2026) ═══
//
// Recordada, cada regreso a `/obras` abría la cartera con las 18 obras cerradas: el «listado gigante
// de obras activas y no activas». Ver las cerradas es una consulta puntual, y una cookie vieja que
// todavía la traiga no la puede volver a imponer.
test('las archivadas no se guardan ni se restauran, ni desde una cookie vieja', () => {
  assert.equal(preferenciaDe(new URLSearchParams('archivadas=1')), null)
  assert.equal(preferenciaDe(new URLSearchParams('archivadas=1&orden=nombre')), 'orden=nombre')
  assert.equal(queryARestaurar(new URLSearchParams(''), 'archivadas=1'), null, 'una cookie que sólo traía archivadas no restaura nada')
  assert.equal(queryARestaurar(new URLSearchParams(''), 'archivadas=1&orden=nombre'), 'orden=nombre')
  // Sin claves que restaurar no hay redirección: devolver la misma query sería un 307 en bucle.
  assert.equal(queryARestaurar(new URLSearchParams('nueva=1'), 'archivadas=1'), null)
})
