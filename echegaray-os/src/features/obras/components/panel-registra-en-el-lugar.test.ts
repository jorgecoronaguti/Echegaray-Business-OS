import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ═══ EL DEFECTO #1 QUE EL DUEÑO SUFRE, ATRAPADO POR UNA REGLA SOBRE EL FUENTE ═══
//
// Textual: *«necesito que la pantalla permita que si quiero editar edite ahí mismo, no me sirve que
// me cargue y me lleve a otro lado»*. En producción, «Registrar avance» del panel de la tarea
// NAVEGABA a `/obras/<obra>/avance/<actividad>` en tres casos —sin acción atada, la cámara de
// evidencia, y «Abrir en pantalla completa»—; y sobre una fila agrupadora esa pantalla contestaba
// con un cartel: un viaje entero de ida y vuelta para leer que no se podía.
//
// ═══ POR QUÉ UNA REGLA SOBRE EL FUENTE Y NO SOBRE EL DOM ═══
//
// Medir el DOM exige el navegador y la base con datos reales. Esta regla cuesta milisegundos y caza
// el defecto donde se escribe: cualquier `href` del panel hacia la pantalla 05 vuelve a sacar al
// usuario de la pantalla. Precedente y misma forma que `cabecera-de-obra.test.ts`.
//
// NO reemplaza a la verificación visual: que no haya `href` no prueba que el formulario guarde.
// Eso lo prueba `FormAvance` + su server action, que son los MISMOS de la pantalla 05.

const RAIZ = new URL('../../../..', import.meta.url).pathname
const PANEL = join(RAIZ, 'src/features/obras/components/PanelTarea.tsx')

/** El fuente SIN sus comentarios: los comentarios de este repo NOMBRAN a propósito lo que se
 *  retiró («navegaba a /obras/x/avance/<id>»), y una regla que lee prosa se pone roja por una
 *  explicación correcta. */
const codigo = (fuente: string) => fuente
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('//'))
  .join('\n')

test('el panel de la tarea NO manda a la pantalla de avance: se registra en el lugar', () => {
  const fuente = codigo(readFileSync(PANEL, 'utf8'))
  assert.doesNotMatch(
    fuente, /\/avance\//,
    'el panel volvió a enlazar a /obras/<obra>/avance/<actividad>: eso saca al usuario de la pantalla',
  )
  // La primaria tiene que ser un BOTÓN que cambia de solapa, no un enlace.
  assert.match(
    fuente, /onClick=\{\(\) => alCambiarSolapa\('avance'\)\}[\s\S]{0,120}data-testid="panel-registrar-avance"/,
    'la primaria del panel dejó de abrir la solapa Avance en el lugar',
  )
  // Y el formulario embebido tiene que seguir siendo el MISMO de la pantalla 05.
  assert.match(fuente, /FormAvanceEmbebido/, 'el panel dejó de embeber el formulario de avance')
})

test('sobre una fila agrupadora el panel no ofrece un botón que no puede cumplir', () => {
  const fuente = codigo(readFileSync(PANEL, 'utf8'))
  // Un contenedor no se mide: la base lo rechaza con un trigger. El zip ni siquiera selecciona una
  // agrupadora, así que no hay primaria que dibujar — hay una línea que dice dónde se registra.
  assert.match(
    fuente, /puedeEditar && !nodo\.es_contenedor && acciones\.registrarAvance != null/,
    'el panel dejó de excluir a las agrupadoras del registro de avance',
  )
  assert.match(
    fuente, /data-testid="panel-agrupadora"/,
    'la agrupadora perdió la línea que dice dónde se registra el avance de verdad',
  )
  assert.match(
    fuente, /data-testid="panel-ir-a-hija"/,
    'la agrupadora perdió el salto a su primera actividad medible: quedaría sólo un cartel',
  )
})
