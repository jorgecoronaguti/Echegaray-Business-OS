import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL HUECO DE LA CABECERA MIDE LO QUE MIDE EL PANEL ═══
//
// 22/09/2026: «ahí se rompe el diseño». Al abrir «Entregar efectivo», el botón oscuro quedaba
// montado ENCIMA del panel. La causa no fue un estilo mal escrito: fue que dos archivos distintos
// declaraban el mismo ancho. `CabeceraSeccion` reservaba el literal 392 —el del `PanelFilo` del
// patrón— y el panel de esta sección mide 520, así que la cabecera terminaba 128px adentro del
// panel.
//
// Lo que este test protege NO es que 520 sea 520: es que el número del hueco y el número del panel
// SALGAN DE LA MISMA CONSTANTE. Cualquiera puede ensanchar el panel mañana; lo que no puede es
// hacerlo dejando la cabecera atrás en silencio, porque el defecto no rompe ninguna prueba de
// comportamiento y sólo se ve abriendo la pantalla.

const aqui = dirname(fileURLToPath(import.meta.url))
const leer = (p: string) => readFileSync(join(aqui, p), 'utf8')
/** Sin comentarios: lo que se afirma es el código, no la prosa que lo explica. */
const codigo = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const estilo = leer('estilo.ts')
const vista = codigo(leer('VistaEfectivo.tsx'))
const observado = codigo(leer('PanelObservado.tsx'))
const cabecera = codigo(leer('../../../shared/components/v2/CabeceraSeccion.tsx'))

const constante = (fuente: string, nombre: string) => {
  const m = fuente.match(new RegExp(`export const ${nombre} = (\\d+)`))
  assert.ok(m, `«${nombre}» dejó de existir: el ancho volvió a estar suelto en cada archivo`)
  return Number(m[1])
}

test('el panel de efectivo declara su ancho UNA vez y lo usa para dibujarse', () => {
  const ancho = constante(estilo, 'ANCHO_PANEL')
  assert.ok(ancho >= 320, 'un panel de menos de 320px no sostiene el formulario de entrega')
  assert.match(codigo(estilo), /export const panel: CSSProperties = \{\s*width: ANCHO_PANEL,/,
    'el panel volvió a escribir su ancho a mano en vez de tomarlo de ANCHO_PANEL')
  constante(estilo, 'ANCHO_PANEL_OBSERVADO')
  assert.match(observado, /width: ANCHO_PANEL_OBSERVADO/,
    'el panel del comprobante observado volvió al número mágico')
})

test('la cabecera reserva EL ancho del panel que hay abierto, no un literal', () => {
  // La cabecera ya no puede decidir sola cuánto mide el hueco: lo recibe.
  assert.equal(/lg:w-\[\d+px\]/.test(cabecera), false,
    'el hueco volvió a ser un ancho literal de Tailwind: no puede seguir al panel que reserva')
  assert.match(cabecera, /espacioPanel: boolean \| number/,
    '`espacioPanel` dejó de aceptar el ancho y vuelve a reservar siempre el del patrón')
  assert.match(cabecera, /width: typeof espacioPanel === 'number' \? espacioPanel : HUECO_PANEL_FILO/,
    'el hueco dejó de tomar el ancho que le pasa la pantalla')
  assert.equal(constante(cabecera, 'HUECO_PANEL_FILO'), 392,
    'el hueco del PanelFilo cambió sin que cambiara el panel (344 + 24 de margen + 24 de sangría)')

  // Y la pantalla pasa SUS constantes, las mismas que dibujan cada panel.
  assert.match(vista, /cabecera\(entregando \? undefined : accion, abiertas, entregando && ANCHO_PANEL\)/,
    'la lista dejó de reservar el ancho real del panel de entrega')
  // Los paneles de editar (25/09/2026) miden lo mismo que el de devolución: reservan ANCHO_PANEL.
  assert.match(vista, /devolviendo \|\| imputando \|\| edicionPanel \? ANCHO_PANEL : observado \? ANCHO_PANEL_OBSERVADO : false/,
    'la ficha reserva un hueco que no es el del panel que abre')
  assert.equal(/espacioPanel=\{(true|\d)/.test(vista), false, 'volvió un ancho a mano en la vista')
})

test('con el panel abierto la cabecera no ofrece la acción que quedaba sobre la zona atenuada', () => {
  // La lista se atenúa al 0,4 mientras el panel está abierto: mientras se entrega, no se toca. Pero
  // «Exportar» y «+ Entregar efectivo» viven en la cabecera, que no se atenúa, y seguían
  // clickeables encima de esa zona.
  assert.match(vista, /opacity: entregando \? 0\.4 : 1/, 'la lista dejó de atenuarse con el panel abierto')
  assert.match(vista, /cabecera\(entregando \? undefined : accion/,
    'las acciones de la cabecera volvieron a estar vivas sobre la lista atenuada')
  assert.match(vista, /conPanel = devolviendo \|\| !!observado \|\| imputando \|\| !!edicionPanel[\s\S]*cabecera\(\s*conPanel \? undefined : volver/,
    'en la ficha, «volver» sigue vivo con el panel abierto')
})
