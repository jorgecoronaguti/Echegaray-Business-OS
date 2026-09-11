import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { alConfirmarGuardado, alLlegarDelServidor, valorVigente } from '../../../../shared/components/ds/inlineEdit.ts'

// ═══ EL PANEL DE LA PERSONA ES DE UNA PERSONA ═══
//
// Dueño, 11/09/2026: «si cambiás de persona la hora se cambia». El panel de Horas se abre desde el
// nombre y se dibuja debajo de la grilla; al abrir a otra persona React reutilizaba el MISMO árbol y
// cada celda editable conservaba su estado. `InlineEdit` descarta lo pendiente sólo cuando el valor
// del servidor CAMBIA —y dos personas con 8 h el mismo día no lo cambian—, así que el número
// tecleado para la primera aparecía en la celda de la segunda. La identidad del panel es la persona
// abierta y se declara con `key`: sin la clave el defecto vuelve y ningún otro test lo ve.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = readFileSync(join(DIR, 'HorasConPersona.tsx'), 'utf8')

test('el contenedor del panel lleva key={abierta}: cambiar de persona remonta todas sus celdas', () => {
  const m = fuente.match(/<div key=\{abierta\} ref=\{panelRef\}/)
  assert.ok(m, 'el <div ref={panelRef}> que envuelve a <PanelDePersona> tiene que llevar key={abierta}')
})

test('POR QUÉ HACE FALTA LA CLAVE: InlineEdit conserva lo pendiente cuando el servidor repite el mismo valor', () => {
  // Ochoa tenía 8 h y el dueño escribió 9: queda pendiente hasta que el servidor lo repita.
  const ochoa = alConfirmarGuardado({ delServidor: '8', pendiente: null }, '9')
  assert.equal(valorVigente(ochoa), '9')
  // Si el mismo componente pasa a dibujar a Castillo, que también tiene 8 h, el estado NO se limpia:
  // ésa es la reutilización que la clave impide. El test la documenta para que nadie la «arregle»
  // en InlineEdit rompiendo la regla 7 (lo confirmado se dibuja hasta que el servidor lo repite).
  const castillo = alLlegarDelServidor(ochoa, '8')
  assert.equal(valorVigente(castillo), '9', 'sin remontar, la celda de Castillo mostraría el 9 de Ochoa')
  // Con un valor distinto sí se limpia: por eso el defecto sólo se veía entre personas con la misma jornada.
  assert.equal(valorVigente(alLlegarDelServidor(ochoa, '')), '')
})
