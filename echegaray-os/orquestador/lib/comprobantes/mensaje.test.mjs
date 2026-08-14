// EL MENSAJE QUE MIRA EL DUEÑO. Los datos son los del caso real del 03/08: el tique de combustible
// de Combustibles Barcelo que ya estaba en Compras fila 800.
//
// Estos tests se ponen ROJOS si el mensaje vuelve a la prosa corrida, si el total deja de estar
// destacado, si la percepción se mete entre los importes que el dueño decide, o si el aviso de "ya
// está cargado" deja de leerse en la primera línea.

// ═══ ESTE ARCHIVO CORRE EN LA CONFIGURACIÓN DE PRODUCCIÓN (14/08) ═══
//
// Tenía la variable `ORQ_COMPROBANTES_BOTONES` encendida para el archivo entero. De sus 28 tests uno
// solo depende de los desplegables y es el que usa `testConBotones`: el resto prueba el TEXTO que el
// dueño lee, que es el mismo con tarjetas o sin ellas — y ahora se prueba como se publica.

import test from 'node:test'
import { testConBotones } from './botones-de-prueba.mjs'
import assert from 'node:assert/strict'
import { resumenFajo, titular, tablaComprobante, notasDe, estadoDeItem, ESTADO_ITEM, bloqueObra, ofertasDe, lineaRubro, ofreceObra } from './mensaje.mjs'
import { botonesFajo, aplicarOpcion } from './fajo.mjs'
import { perfilesDeImputacion, sugerirImputacion } from '../imputacion-aprendida.mjs'

const barcelo = ({ comprobante, ...over } = {}) => ({
  // El reloj contra el que se juzga si la fecha del comprobante puede ser cierta. Va FIJO: sin él,
  // este fixture se juzgaría contra el reloj de la máquina y el test empezaría a fallar solo cuando
  // 31/07/2026 quede fuera de la ventana. Ver `plausibilidad.mjs`.
  leidoEn: '2026-08-04T10:00:00Z',
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
  clave: 'p:combustibles barcelo|0113-00014219',
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

test('lo que falta se pregunta aparte de la tabla, con ❓ — y el titular lo NOMBRA', () => {
  // El faltante que SÍ bloquea: sin número no se puede cargar por chat. (La obra dejó de bloquear el
  // 03/08/2026 y tiene su propio test más abajo.)
  //
  // El titular decía "Me falta un dato" y obligaba a leer el mensaje entero para descubrir cuál.
  // Desde el 04/08, cuando es UN comprobante y falta UNA cosa, la primera línea la nombra.
  const item = barcelo({ comprobante: { numero: null } })
  const t = resumenFajo({ items: [item] })
  assert.match(t.split('\n')[0], /Sólo me falta el número/)
  assert.match(t, /❓ .*número de comprobante/)
  assert.equal(estadoDeItem(item), ESTADO_ITEM.FALTA)
})

test('con tres faltantes el titular NO los enumera: eso ya lo hace el bloque de preguntas', () => {
  const item = barcelo({ comprobante: { numero: null, fecha: null, total: null, neto: null } })
  const t = resumenFajo({ items: [item] })
  assert.match(t.split('\n')[0], /Me falta un dato/)
})

// ── LA OBRA SE OFRECE PERO NO BLOQUEA (03/08/2026) ──────────────────────────
//
// La decisión del dueño fue que el bot cargue igual con la obra vacía. El riesgo del cambio no es que
// se cargue de más: es que, al dejar de ser un faltante, el bloque con las siete obras del proveedor y
// sus conteos desapareciera del mensaje sin que nadie lo notara —colgaba de `preguntasDe`—. Eso sería
// apagar la parte útil por haber apagado la molesta.

test('sin obra el comprobante YA SE PUEDE CARGAR, y el desplegable sigue apareciendo', () => {
  const item = barcelo({ comprobante: { obra: null, obraVia: null, detalleObra: null } })
  const t = resumenFajo({ items: [item] })
  assert.equal(estadoDeItem(item), ESTADO_ITEM.LISTO, 'la obra no lo deja incompleto')
  assert.match(t.split('\n')[0], /✅ \*\*1 listo para cargar\*\*/)
  assert.match(t, /❓ \*\*¿A qué obra va\?\*\*/, 'la obra se sigue ofreciendo: no se esconde')
  assert.match(t, /apretá \*\*Confirmar\*\*/)
})

test('el mensaje DICE que va sin obra: no se carga en silencio', () => {
  const t = resumenFajo({ items: [barcelo({ comprobante: { obra: null, obraVia: null } })] })
  assert.match(t, /no me hace falta para cargar.*sin obra.*completás en Compras/s)
  assert.match(t, /⚠️ Va \*\*sin obra\*\* — completala en Compras/)
})

test('con la obra puesta no aparece ni la oferta ni la advertencia', () => {
  const t = resumenFajo({ items: [barcelo()] })
  assert.doesNotMatch(t, /¿A qué obra va\?/)
  assert.doesNotMatch(t, /sin obra/)
})

test('ofreceObra: no se ofrece sobre lo que no se va a cargar', () => {
  assert.equal(ofreceObra(barcelo({ comprobante: { obra: null } })), true)
  assert.equal(ofreceObra(barcelo()), false, 'ya tiene obra')
  assert.equal(ofreceObra({ ...barcelo({ comprobante: { obra: null } }), yaCargado: { fila: 802 } }), false)
  assert.equal(ofreceObra({ ...barcelo({ comprobante: { obra: null } }), duplicadoResuelto: 'mismo' }), false)
  // Primero se decide si el comprobante existe; recién después, dónde va.
  assert.equal(ofreceObra({ ...barcelo({ comprobante: { obra: null } }), posibleDuplicado: { fila: 802 } }), false)
})

test('varios comprobantes sin obra: la advertencia los cuenta', () => {
  const items = [
    barcelo({ comprobante: { obra: null } }),
    barcelo({ comprobante: { obra: null, numero: '0113-00014220' } }),
    barcelo({ comprobante: { numero: '0113-00014221' } }),
  ]
  const t = resumenFajo({ items })
  assert.match(t, /⚠️ 2 de 3 van \*\*sin obra\*\*/)
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

// ── PREGUNTAR CON LO QUE SE SABE ADELANTE ────────────────────────────────────
//
// EL DEFECTO (03/08): el tique de Barcelo llegó SIN anotación manuscrita y el bot contestó
//   "❓ no dice a qué obra va — ¿cuál es?"
// mientras la lib de imputación aprendida ya había contado 126 cargas de ese proveedor en 7 obras,
// con San Francisco 41 · Administracion 39 · Taller 18 y la nota de por qué proponía Taller. El
// dueño: "sigue sin ser inteligente". El sistema SABÍA y el mensaje tiraba lo que sabía.
//
// La historia de abajo REPRODUCE la distribución real y la sugerencia se calcula con la lib de
// verdad, no a mano: si alguien cambia los umbrales o el refinamiento por concepto, esto se entera.

const OBRAS_BARCELO = [['San Francisco', 41], ['Administracion', 39], ['Taller', 18], ['MESSINA', 10], ['Estrella', 8], ['Planta BSA', 6], ['Rawson', 4]]
const UNIDADES_BARCELO = [['Civil', 68], ['Estructura', 47], ['Mantenimiento', 11]]

function historiaBarcelo() {
  const obras = OBRAS_BARCELO.flatMap(([o, n]) => Array(n).fill(o))
  const unidades = UNIDADES_BARCELO.flatMap(([u, n]) => Array(n).fill(u))
  return obras.map((obra, i) => {
    const enTaller = obra === 'Taller'
    const k = obras.slice(0, i).filter((o) => o === 'Taller').length
    return {
      proveedor: 'Combustibles Barcelo',
      unidad_negocio: unidades[i],
      obra_texto: obra,
      // El concepto de Taller se parece al del tique; el del resto, no. Es lo que hace que la lib
      // sugiera Taller (18) y no San Francisco (41), y lo declare en su nota.
      concepto: enTaller ? 'Nafta Super' : 'Gasoil granel',
      // 18 filas en Taller: 9 "combustible", 5 "Camion", 4 sin detalle → n=14, share 0,643.
      detalle: enTaller ? (k < 9 ? 'combustible' : k < 14 ? 'Camion' : '') : 'Gasoil',
    }
  })
}

/** El tique de combustible SIN anotación manuscrita, con la sugerencia que devuelve la lib real. */
function tiqueSinAnotacion() {
  const perfiles = perfilesDeImputacion(historiaBarcelo())
  const s = sugerirImputacion({ proveedor: 'Combustibles Barcelo', concepto: 'Nafta Super 1 y Diesel 500', monto: 64006.07 }, perfiles)
  return {
    ...barcelo({ comprobante: { obra: null, obraVia: null, detalleObra: null, detalleVia: null, unidad: null } }),
    sugerencia: { obra: s.obra, unidad: s.unidad, detalle: s.detalle, rubro: s.rubro },
  }
}

test('la sugerencia de la lib es la del caso real: 126 cargas, 7 obras, 41/39/18 y Taller por concepto', () => {
  const s = tiqueSinAnotacion().sugerencia
  assert.equal(s.obra.n, 126)
  assert.equal(s.obra.distintos, 7)
  assert.equal(s.obra.share, 0.325)
  assert.equal(s.obra.sugerido, 'Taller')
  assert.deepEqual(s.obra.opciones, [{ valor: 'San Francisco', n: 41 }, { valor: 'Administracion', n: 39 }, { valor: 'Taller', n: 18 }])
  assert.equal(s.obra.nota, 'obra elegida por coincidencia de concepto, no por la más frecuente del proveedor')
  assert.equal(s.rubro.sugerido, 'Materiales Civil')
})

test('EL DEFECTO: preguntar la obra sin ofrecer las opciones que la lib entregó', () => {
  const t = resumenFajo({ items: [tiqueSinAnotacion()] })
  // La pregunta pelada que mandaba el bot no puede volver.
  assert.doesNotMatch(t, /no dice a qué obra va — ¿cuál es\?/)
  // Las tres opciones, CON su conteo y sobre el total de cargas.
  assert.match(t, /• \*\*San Francisco\*\* — 41 de 126/)
  assert.match(t, /• \*\*Administracion\*\* — 39 de 126/)
  assert.match(t, /• \*\*Taller\*\* — 18 de 126 ← la que sugiero/)
  // Y por qué son 7 y no una: es lo que justifica que se pregunte en vez de adivinar.
  assert.match(t, /\*\*7 obras distintas\*\* en 126 cargas/)
})

test('la nota de la lib se muestra cuando EXPLICA algo: por qué Taller y no la más frecuente', () => {
  const t = resumenFajo({ items: [tiqueSinAnotacion()] })
  assert.match(t, /obra elegida por coincidencia de concepto, no por la más frecuente del proveedor/)
})

test('unidad y detalle se OFRECEN con su conteo, y se declara que no bloquean la carga', () => {
  const o = ofertasDe(tiqueSinAnotacion()).join('\n')
  assert.match(o, /\*\*Unidad de negocio\*\* _\(no la necesito para cargar\)_: \*\*Civil\*\* 68 · Estructura 47 · Mantenimiento 11 — de 126 cargas/)
  // El detalle cuelga de la obra: se ofrece CONDICIONADO a la obra que todavía no está decidida.
  assert.match(o, /si la obra queda en \*\*Taller\*\*, \*\*combustible\*\* 9 · Camion 5 — de 14 cargas/)
})

test('el RUBRO no se pregunta nunca: se muestra como derivado de la imputación', () => {
  const t = resumenFajo({ items: [tiqueSinAnotacion()] })
  assert.doesNotMatch(t, /❓[^\n]*rubro/i, 'el rubro sale de la imputación, no del dueño')
  assert.match(lineaRubro(tiqueSinAnotacion()), /sale de la imputación — con esa imputación sería \*\*Materiales Civil\*\*/)
})

test('un proveedor SIN historia no recibe opciones inventadas: se dice por qué no se puede deducir', () => {
  const item = barcelo({ comprobante: { proveedor: 'Ferretería Nueva', obra: null } })
  item.sugerencia = { obra: { sugerido: null, n: 0, distintos: 0, opciones: [], evidencia: 'sin_historia', pide_confirmacion: true } }
  const b = bloqueObra(item).join('\n')
  assert.match(b, /❓ \*\*¿A qué obra va\?\*\* No tengo ninguna carga anterior de \*\*Ferretería Nueva\*\* en Compras para deducirla\./)
  // La pregunta + la aclaración de que no bloquea. Sin historia no hay LISTA que mostrar: dos líneas,
  // no una lista de obras inventadas.
  assert.equal(bloqueObra(item).length, 2, 'sin historia no hay lista que mostrar')
  assert.match(bloqueObra(item)[1], /sin obra/)
})

// ═══ SE CONTESTA CON EL DESPLEGABLE, NO CON TRES BOTONES (04/08) ═══
//
// Los tres botones eran las tres obras más frecuentes de la historia. Las obras del desplegable de
// Compras son 22: si la que correspondía no estaba entre las tres, no había forma de elegirla. Y la
// Unidad de Negocio y el Detalle no se preguntaban nunca — las tres columnas quedaban vacías.
testConBotones('LA IMPUTACIÓN SE CONTESTA CON LOS DESPLEGABLES DE COMPRAS', () => {
  const it = {
    ...tiqueSinAnotacion(),
    opciones: { obra: ['Administracion', 'ARCOR', 'LA ESTRELLA', 'MESSINA', 'San Francisco', 'Taller'],
      unidad: ['Civil', 'Estructura', 'Mantenimiento'], detalle: {} },
  }
  const att = botonesFajo({ id: 'f1', items: [it] }, { url: 'https://x/comprobantes/accion?s=1' })
  const imp = att[0]
  assert.match(imp.title, /Falta imputar — Combustibles Barcelo/)

  const menus = imp.actions
  // LAS TRES COLUMNAS QUE QUEDABAN VACÍAS, cada una con su rótulo real de la pestaña Compras.
  assert.deepEqual(menus.map((a) => a.type), ['select', 'select', 'select'])
  assert.deepEqual(menus.map((a) => a.id), ['obra', 'unidad', 'detalle'])
  assert.deepEqual(menus.map((a) => a.name),
    ['Cliente / Asignación (obra)', 'Unidad de Negocio', 'Detalles / Obra'])

  // LA HISTORIA VA PRIMERO, CON SU CONTEO, y detrás el resto del desplegable: la respuesta probable
  // arriba, pero ninguna opción legítima afuera.
  const obras = menus[0].options
  assert.deepEqual(obras.slice(0, 3).map((o) => o.text),
    ['San Francisco — 41 vez/veces', 'Administracion — 39 vez/veces', 'Taller — 18 vez/veces'])
  assert.ok(obras.some((o) => o.value === 'MESSINA'), 'y las que la historia no contó también están')
  assert.equal(new Set(obras.map((o) => o.value)).size, obras.length, 'sin repetidos')

  // EL VALOR NO VIAJA EN EL CONTEXTO: lo pone Mattermost en `selected_option` al elegir.
  assert.deepEqual(menus[0].integration.context, {
    accion: 'imputar', fajo_id: 'f1', dominio: 'comprobantes', indice: 0, campo: 'obra',
  })
  assert.deepEqual(att[1].actions.map((a) => a.id), ['confirmar', 'corregir', 'descartar'])
})

test('elegir la obra con el botón la deja en el comprobante, marcada como elección del dueño', () => {
  const item = aplicarOpcion(tiqueSinAnotacion(), { campo: 'obra', valor: 'San Francisco' })
  assert.equal(item.comprobante.obra, 'San Francisco')
  const t = resumenFajo({ items: [item] })
  assert.match(t, /\| Obra \| San Francisco _\(la elegiste vos\)_ \|/)
  assert.match(t.split('\n')[0], /✅ \*\*1 listo para cargar\*\*/)
  // El detalle que se ofrecía era el de Taller: elegida otra obra, deja de ofrecerse.
  assert.doesNotMatch(t, /combustible/)
})

test('un valor que este comprobante no ofreció NO se aplica — el callback no trae identidad', () => {
  const item = tiqueSinAnotacion()
  assert.equal(aplicarOpcion(item, { campo: 'obra', valor: 'Obra Inventada' }), null)
  assert.equal(aplicarOpcion(item, { campo: 'total', valor: '1' }), null, 'sólo obra/unidad/detalle')
  // Segundo click sobre un botón ya contestado: la obra ya está puesta y no se pisa con otra.
  const ya = aplicarOpcion(item, { campo: 'obra', valor: 'Taller' })
  assert.equal(ya.comprobante.obra, 'Taller')
})
