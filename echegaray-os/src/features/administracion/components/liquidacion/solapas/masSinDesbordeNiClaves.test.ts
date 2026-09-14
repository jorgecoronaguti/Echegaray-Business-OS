// «MÁS» A 390 PX Y SIN CLAVES REPETIDAS (QA de la rama base, 14/09/2026, dos bloqueantes).
//
// 1. A 390 px «Costo y convenio» medía `scrollWidth` 827: la tabla de exposición al convenio vivía en
//    una columna flex con `minWidth: 520` y la de al lado era `width: 400` fija. Una columna con mínimo
//    fijo empuja la página en vez de achicarse; la tabla tiene que rodar dentro de su caja.
// 2. «Encountered two children with the same key» en Cierre, con la quincena abierta y con la cerrada.
//    La clave era `#`: `SolapaCierreYRecibos` montaba Recibos sin `hrefDe`, los cuatro enlaces del
//    recorte salían `href="#"` y `FiltrosDelEspejo` los usaba como clave. No era `ausencias.map`:
//    `asistencia_dia` tiene índice único (persona_id, fecha), dos ausencias el mismo día no existen.
//
// La prueba en navegador (scrollWidth y consola) es `tests/liquidacion-mas-390-consola.spec.ts`. Esto
// es la guarda barata que corre en cada `node --test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

test('CONVENIOS: la tabla rueda dentro de su caja y ninguna columna tiene ancho mínimo fijo', () => {
  const c = sinComentarios(fuente('./convenios.tsx'))
  assert.ok(!/minWidth: 520/.test(c), 'la columna de la tabla no fija 520 px')
  assert.ok(!/width: 400, flex: 'none'/.test(c), 'la columna del formulario no es de 400 fijos')
  assert.match(c, /data-testid="convenios-tabla" style=\{\{ flex: '1 1 520px', minWidth: 0/)
  // EL MÍNIMO VIVE EN EL SCROLLER DE ADENTRO, Y EL SCROLLER ENVUELVE AL CUERPO DE LA TABLA.
  const scroller = c.indexOf('...MARCO_SCROLL')
  assert.ok(scroller > 0 && scroller < c.indexOf('minWidth: ANCHO_TABLA_CONVENIOS') && c.indexOf('minWidth: ANCHO_TABLA_CONVENIOS') < c.indexOf('<Cuerpo>'))
})

test('CIERRE Y RECIBOS: Recibos recibe `hrefDe`, y un enlace del recorte no es la clave', () => {
  assert.match(fuente('./cierre-y-recibos.tsx'), /SolapaRecibos\(\{[^}]*hrefDe: props\.hrefDe/)
  const filtros = sinComentarios(fuente('../cuadro/FiltrosDelEspejo.tsx'))
  assert.ok(!/key=\{o\.href\}/.test(filtros), 'dos opciones con el mismo enlace no pueden compartir clave')
  assert.match(filtros, /key=\{o\.texto\}/)
})

test('QUINCENA: los errores no se suman dos veces y su clave no depende sólo del rótulo', () => {
  const v = sinComentarios(fuente('./quincena.tsx'))
  assert.ok(!/\.\.\.exposicion\.errores/.test(v), 'los errores de la exposición ya vienen en la liquidación')
  assert.match(v, /key=\{`\$\{e\.que\}-\$\{i\}`\}/)
})
