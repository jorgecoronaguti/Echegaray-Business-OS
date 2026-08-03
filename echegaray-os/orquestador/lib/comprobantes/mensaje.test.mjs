// EL MENSAJE QUE MIRA EL DUEÑO. Los datos son los del caso real del 03/08: el tique de combustible
// de Combustibles Barcelo que ya estaba en Compras fila 800.
//
// Estos tests se ponen ROJOS si el mensaje vuelve a la prosa corrida, si el total deja de estar
// destacado, si la percepción se mete entre los importes que el dueño decide, o si el aviso de "ya
// está cargado" deja de leerse en la primera línea.

import test from 'node:test'
import assert from 'node:assert/strict'
import { resumenFajo, titular, tablaComprobante, notasDe, estadoDeItem, ESTADO_ITEM } from './mensaje.mjs'

const barcelo = ({ comprobante, ...over } = {}) => ({
  ...over,
  comprobante: {
    proveedor: 'Combustibles Barcelo',
    tipo: 'A',
    numero: '0113-00014219',
    fecha: '31/07/2026',
    obra: 'MESSINA',
    obraVia: 'comprobante',
    detalleObra: 'Camion - BSA',
    detalleVia: 'comprobante',
    concepto: 'Nafta Super 1 y Diesel 500',
    iva: 9558.36,
    total: 64006.07,
    otrosTributos: 8931.69,
    ...(comprobante ?? {}),
  },
  clave: 'p:combustibles barcelo|A|0113-00014219',
})

// ── La tabla ─────────────────────────────────────────────────────────────────

test('el comprobante se muestra como TABLA markdown, no como prosa con sangrías', () => {
  const t = tablaComprobante(barcelo())
  assert.match(t, /^\| \| \|\n\|---\|---\|/, 'sin la fila de separación Mattermost no dibuja la tabla')
  assert.match(t, /\| Comprobante \| F A 0113-00014219 \|/)
  assert.match(t, /\| Fecha \| 31\/07\/2026 \|/)
  assert.match(t, /\| Obra \| MESSINA _\(escrito a mano\)_ \|/)
  assert.match(t, /\| Detalle \| Camion - BSA _\(escrito a mano\)_ \|/)
  // Ninguna línea de la tabla puede empezar con espacios: es lo que Mattermost colapsaba.
  for (const linea of t.split('\n')) assert.doesNotMatch(linea, /^\s/)
})

test('el TOTAL es lo que el dueño busca primero: va destacado y al final de la tabla', () => {
  const t = tablaComprobante(barcelo())
  assert.match(t, /\| \*\*Total\*\* \| \*\*\$64\.006,07\*\* \|/)
  // Y el importe que va a la columna M sigue mostrándose: Total − IVA = 54.447,71.
  assert.match(t, /\| Importe a Compras \| \$54\.447,71 \|/)
  assert.match(t, /\| IVA \| \$9\.558,36 \|/)
})

test('la percepción es una NOTA AL PIE, no una línea de los importes que se deciden', () => {
  const item = barcelo()
  assert.doesNotMatch(tablaComprobante(item), /percepc/i, 'mezclada con los importes hacía dudar si estaba sumada')
  assert.match(notasDe(item).join(' '), /percepciones \/ otros tributos \$8\.931,69/)
  assert.match(notasDe(item).join(' '), /dentro del Importe, no son IVA/)
})

// ── El estado, arriba de todo ────────────────────────────────────────────────

test('YA ESTÁ CARGADO se lee en la PRIMERA línea, con la fila', () => {
  const item = { ...barcelo(), yaCargado: { fila: 800, hoja: 'Compras', fuente: 'Compras', via: 'proveedor+numero' } }
  const t = resumenFajo({ items: [item] })
  const primera = t.split('\n')[0]
  assert.match(primera, /Ya está cargado/)
  assert.match(primera, /fila 800/, 'la fila va arriba: es el dato con el que el dueño verifica')
  assert.match(t, /⚠️ \*\*Ya está cargado\*\* — fila 800 de Compras, mismo número y mismo total/)
  assert.doesNotMatch(t, /apretá \*\*Confirmar\*\*/, 'no se ofrece cargar de nuevo lo que ya está')
  assert.equal(estadoDeItem(item), ESTADO_ITEM.CARGADO)
})

test('un PROBABLE duplicado también manda: se decide antes que nada', () => {
  const item = { ...barcelo(), posibleDuplicado: { fila: 802, numero: '0004-00003642', fecha: '30/07/2026', total: 62000, obra: 'MESSINA' } }
  const t = resumenFajo({ items: [item] })
  assert.match(t.split('\n')[0], /Puede que ya esté cargado/)
  assert.match(t, /fila 802 de Compras/)
  assert.doesNotMatch(t, /apretá \*\*Confirmar\*\*/)
})

test('sin nada raro, la primera línea dice que está listo y cuántas filas entran', () => {
  const t = resumenFajo({ items: [barcelo()] })
  assert.match(t.split('\n')[0], /✅ \*\*1 listo para cargar\*\*/)
  assert.match(t, /apretá \*\*Confirmar\*\* y lo escribo en Compras \(1 fila\)/)
})

test('lo que falta se pregunta aparte de la tabla, con ❓', () => {
  const item = barcelo({ comprobante: { obra: null, detalleObra: null } })
  const t = resumenFajo({ items: [item] })
  assert.match(t.split('\n')[0], /Me falta un dato/)
  assert.match(t, /❓ .*obra/)
  assert.equal(estadoDeItem(item), ESTADO_ITEM.FALTA)
})

test('varios comprobantes = un bloque con título por cada uno', () => {
  const t = resumenFajo({ items: [barcelo(), barcelo({ comprobante: { numero: '0113-00014220' } })] })
  assert.match(t, /### 1\. Combustibles Barcelo/)
  assert.match(t, /### 2\. Combustibles Barcelo/)
  assert.equal((t.match(/\|---\|---\|/g) ?? []).length, 2, 'una tabla por comprobante')
})

// ── Las tres cosas distintas: papel · historial · pregunta ───────────────────

test('lo DEDUCIDO del historial se marca y se cuenta la evidencia; lo del papel no lleva marca', () => {
  const item = {
    ...barcelo({ comprobante: { obraVia: 'historial', detalleVia: 'historial' } }),
    aprendido: { obra: { n: 14, share: 0.857 }, detalle: { n: 9, share: 0.889, obra: 'MESSINA' } },
  }
  const t = resumenFajo({ items: [item] })
  assert.match(t, /\| Obra \| MESSINA _\(sugerido: 12 de 14 cargas de este proveedor\)_ \|/)
  assert.match(t, /\| Detalle \| Camion - BSA _\(sugerido: 8 de 9 cargas de este proveedor en MESSINA\)_ \|/)
  assert.match(t, /Lo que no dice "sugerido" lo leí del comprobante/)
})

// ── Las notas ────────────────────────────────────────────────────────────────

test('no figurar en ARCA se dice SIN dar a entender que se verificó el duplicado', () => {
  const n = notasDe({ ...barcelo(), arca: { estado: 'sin_registro' } }).join(' ')
  assert.match(n, /no figura en ARCA/)
  assert.match(n, /no dice nada sobre si ya lo cargaste/)
})

test('no haber podido leer Compras se DECLARA: el silencio se lee como "lo miré y no estaba"', () => {
  const n = notasDe({ ...barcelo(), comprasNoRevisadas: { error: 'timeout' } }).join(' ')
  assert.match(n, /no pude leer la pestaña Compras/)
})

test('una nota de crédito se anuncia y entra en negativo', () => {
  const nc = barcelo({ comprobante: { esNotaCredito: true, tipo: 'NC', total: -9823178, iva: -1704849.9, otrosTributos: null } })
  const t = resumenFajo({ items: [nc] })
  assert.match(t, /Nota de crédito: entra en negativo/)
  assert.match(t, /−\$9\.823\.178,00/)
})

// ── El titular con mezcla ────────────────────────────────────────────────────

test('con dos listos y uno ya cargado, el titular los cuenta a los tres', () => {
  const t = titular([barcelo(), barcelo(), { ...barcelo(), yaCargado: { fila: 800 } }])
  assert.match(t, /2 listos para cargar/)
  assert.match(t, /1 ya cargado/)
})
