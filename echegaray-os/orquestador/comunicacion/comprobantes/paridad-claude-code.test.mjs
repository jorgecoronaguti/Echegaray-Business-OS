// UNA CAPACIDAD, UNA FUENTE — que el adjunto de Mattermost termine EXACTAMENTE en la misma fila que
// produciría Claude Code, no en una parecida.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE (13/08) ═══
//
// El pedido del dueño fue textual: «que la carga de comprobantes por medio de archivos multimedia que
// usamos en el OS por esta vía a través de Claude Code, y que replica de manera perfecta en pestaña
// Compras, sea la que se usa en Mattermost». Las dos caras ya comparten el motor —el bot INVOCA
// `scripts/cargar-comprobantes-compras.mjs` como proceso hijo—, pero compartir el motor no garantiza
// que le entre lo mismo: entre la foto y el `fajo.json` hay un tramo propio de cada vía, y ahí es
// donde se separan sin que nada falle.
//
// Lo que se compara acá no es que "no tire excepción": es la ESTRUCTURA. El fajo que arma el bot
// desde un adjunto contra el fajo que arma una persona con el papel delante (el que documenta la
// skill `carga-gastos-multimedia`), y después las CELDAS que el contrato de columnas produce con cada
// uno. Si alguien agrega un campo en una vía y no en la otra, esto se pone rojo.
//
// NO TOCA EL SHEET, no llama a ningún modelo y no abre Postgres: todo lo de acá es núcleo puro.

import test from 'node:test'
import assert from 'node:assert/strict'
import { armarItem } from '../../lib/comprobantes/item.mjs'
import { colapsarRepetidos } from '../../lib/comprobantes/fajo.mjs'
import { claveComprobante } from '../../lib/comprobantes/lectura.mjs'
import { valoresInput, COL } from '../../lib/carga-comprobantes.mjs'
import { indexarCompras } from '../../lib/comprobantes/compras-vivas.mjs'
import { prepararPlan } from '../../scripts/cargar-comprobantes-compras.mjs'
import { perfilesDeImputacion } from '../../lib/imputacion-aprendida.mjs'
import { completarConHistorial } from './flujo.mjs'
import { aFajoJson } from './escritura.mjs'
import { lecturaBarcelo, LISTAS, LISTAS_COMPRAS, filaCompras } from './dobles.mjs'

/** Las cinco columnas que NO se escriben nunca: son ARRAYFORMULA y derraman desde la fila 4. */
const PROHIBIDAS = ['AC', 'AD', 'AE', 'AF', 'AJ']

/** El ítem que produce un adjunto de Mattermost, con la lectura real de la foto de Barcelo. */
function itemDelBot(over = {}) {
  return armarItem({
    lectura: lecturaBarcelo(over),
    adjunto: { fileId: 'f1', nombre: 'IMG_7530.jpg' },
    listas: LISTAS,
    textoPost: null,
    ahora: new Date('2026-08-13T10:00:00Z'),
  })
}

/**
 * El fajo TAL CUAL lo escribe una persona por Claude Code. Está copiado del ejemplo de la skill
 * `carga-gastos-multimedia`, no derivado del código: si se derivara del mismo lugar que la otra vía,
 * la comparación no probaría nada.
 */
const FAJO_A_MANO = [{
  // La columna B del ejemplo de la skill dice `"categoria": "B"`. NO es un rubro: el desplegable vivo
  // de Compras (`Compras!B4:B12`, leído el 13/08) son dos valores, `B` y `N` — blanco y negro.
  categoria: 'B',
  fecha: '05/01/2026',
  proveedor: 'Combustibles Barcelo',
  tipo: 'A',
  numero: '0113-00010489',
  concepto: 'Gasoil autoelevador · a mano: "Estrella"',
  iva: 5981,
  total: 36460.30,
  condicion: 'Contado',
  formaPago: 'Efectivo',
  obra: 'Estrella',
}]

test('el adjunto de Mattermost produce el MISMO fajo que arma una persona por Claude Code', () => {
  const [delBot] = aFajoJson([itemDelBot()])
  const [aMano] = FAJO_A_MANO

  // Los campos que deciden la fila tienen que ser IDÉNTICOS, no equivalentes.
  for (const k of ['categoria', 'fecha', 'proveedor', 'tipo', 'numero', 'iva', 'total', 'condicion', 'formaPago', 'obra', 'concepto']) {
    assert.deepEqual(delBot[k], aMano[k], `el campo "${k}" difiere entre las dos vías`)
  }
  // EL NETO NO VIAJA POR NINGUNA DE LAS DOS. `valoresInput` deriva M = Total − IVA, que es lo que
  // absorbe la percepción de IIBB/SUSS; mandar el neto crudo reintroduce a mano la carga MAL hecha.
  assert.equal(delBot.neto, undefined, 'el bot no manda el neto: M se deriva del total')
  assert.equal(aMano.neto, undefined)
})

test('y por lo tanto la FILA es la misma celda por celda — incluida M = Total − IVA', () => {
  const delBot = valoresInput(aFajoJson([itemDelBot()])[0])
  const aMano = valoresInput(FAJO_A_MANO[0])
  assert.deepEqual(delBot, aMano, 'dos vías, una sola fila')
  // El control que paga la percepción: 36.460,30 − 5.981,00 = 30.479,30, NO el neto impreso 28.479,30.
  assert.equal(delBot[COL.neto], 30479.30)
  assert.equal(delBot[COL.total], undefined, 'O es FÓRMULA: no se escribe desde ninguna vía')
})

test('NUNCA se escribe en AC/AD/AE/AF/AJ, venga por donde venga', () => {
  // Las letras de `valoresInput` son literalmente los rangos que después se escriben
  // (`Compras!<L><desde>:<L><hasta>` en `escribirYVerificar`): es el punto exacto por donde entraría
  // una ARRAYFORMULA rota, y escribir ahí aunque sea "" corta el derrame de TODAS las filas.
  const casos = [
    valoresInput(aFajoJson([itemDelBot()])[0]),
    valoresInput(FAJO_A_MANO[0]),
    // Y el peor caso: un comprobante con TODO completo, que es cuando más columnas se tocan.
    valoresInput({
      ...FAJO_A_MANO[0], categoria: 'Combustible', unidad: 'Obra', detalle: 'Autoelevador',
    }),
  ]
  for (const v of casos) {
    for (const L of PROHIBIDAS) {
      assert.equal(Object.hasOwn(v, L), false, `se iba a escribir en ${L}, que es ARRAYFORMULA`)
    }
  }
})

test('el planificador del cargador tampoco toca las prohibidas con el fajo del bot', async () => {
  const { plan, rechazos } = await prepararPlan(aFajoJson([itemDelBot()]), { lista: LISTAS.proveedores })
  assert.equal(rechazos.length, 0, `el fajo del bot lo rechazó el cargador: ${JSON.stringify(rechazos)}`)
  assert.equal(plan.length, 1)
  for (const L of PROHIBIDAS) assert.equal(Object.hasOwn(plan[0].valores, L), false)
})

// ── COLUMNA POR COLUMNA, SOBRE COMPROBANTES DE DISTINTA FORMA (13/08) ───────
//
// Pedido textual del dueño: «revisar bien como se hace por via de claude del os de la carga de
// comprobantes y hacer exactamente eso en mattermost». El test de arriba compara UNA foto; esto
// compara las columnas que se derivan, sobre las formas que de verdad llegan al canal.
//
// Las reglas NO salen de un criterio propio: salen de las filas 826-842 de Compras, del mismo día,
// unas cargadas por Claude Code y otras por el bot. Están escritas en `lib/comprobantes/categoria.mjs`.

/** Las cuatro formas reales, con lo que cada columna TIENE que dar. */
const FORMAS = [
  {
    que: 'factura A con número (fila 841, VILLA DEL PINO)',
    lectura: { emisor: 'Combustibles Barcelo', total: '36.460,30', iva_21: '5.981,00', fecha: '05/01/2026', letra: 'FACTURA A', numero: '0001-00015751' },
    espera: { categoria: 'B', tipo: 'A' },
  },
  {
    que: 'factura C (fila 842, Ruviño Matias) — sin IVA discriminado, sigue siendo fiscal',
    lectura: { emisor: 'Combustibles Barcelo', total: '10.000,00', fecha: '05/01/2026', letra: 'FACTURA C', numero: '0002-00004725' },
    espera: { categoria: 'B', tipo: 'C' },
  },
  {
    que: 'tique fiscal sin CAE legible — la letra viene pegada a TIQUE FACTURA',
    lectura: { emisor: 'Combustibles Barcelo', total: '60.000,02', fecha: '03/08/2026', letra: 'TIQUE FACTURA A', numero: '0113-00010489', cae: null },
    // El CAE NO entra en la regla: un tique térmico borroso quedaría mal clasificado por un problema
    // de foto, que es exactamente el defecto que se está arreglando.
    espera: { categoria: 'B', tipo: 'A' },
  },
  {
    que: 'nota de crédito — es fiscal (B) y sus importes van en NEGATIVO',
    lectura: { emisor: 'Combustibles Barcelo', total: '5.000,00', iva_21: '868,00', fecha: '07/08/2026', letra: 'NOTA DE CREDITO A', numero: '0113-00010490', es_nota_credito: true },
    espera: { categoria: 'B', tipo: 'NC', total: -5000 },
  },
  {
    que: 'un gasto SIN comprobante fiscal (filas 828/829/834: Sueldos, PEDRO TELLO, tipo N/A) ⇒ N',
    lectura: { emisor: 'Combustibles Barcelo', total: '80.000,00', fecha: '05/01/2026', letra: null, numero: null },
    espera: { categoria: 'N', tipo: null },
  },
]

for (const f of FORMAS) {
  test(`paridad de columnas — ${f.que}`, () => {
    const it = armarItem({ lectura: f.lectura, adjunto: { fileId: 'f', nombre: 'x.jpg' }, listas: LISTAS })
    const c = it.comprobante
    for (const [k, v] of Object.entries(f.espera)) {
      assert.equal(c[k], v, `la columna "${k}" no da lo que da Claude Code`)
    }
    // Y la fila que sale de ahí nunca toca las ARRAYFORMULA, cualquiera sea la forma.
    // Un comprobante SIN número no llega a fajo —`aFajoJson` sólo pasa lo que se puede cargar— y eso
    // también es paridad: por Claude Code un gasto sin comprobante lo carga una persona, no una foto.
    const fajo = aFajoJson([it])
    assert.equal(fajo.length, f.espera.categoria === 'N' ? 0 : 1, 'lo cargable no coincide con la vía manual')
    if (!fajo.length) return
    const valores = valoresInput(fajo[0])
    for (const L of PROHIBIDAS) assert.equal(Object.hasOwn(valores, L), false, `se iba a escribir en ${L}`)
    // La columna O es fórmula en las dos vías, siempre.
    assert.equal(valores[COL.total], undefined, 'O es FÓRMULA: no se escribe desde ninguna vía')
  })
}

test('M = Total − IVA en TODAS las formas cargables, que es lo que absorbe la percepción', () => {
  for (const f of FORMAS) {
    const it = armarItem({ lectura: f.lectura, listas: LISTAS })
    const fajo = aFajoJson([it])
    if (!fajo.length) continue
    const v = valoresInput(fajo[0])
    const total = it.comprobante.total
    const iva = it.comprobante.iva ?? 0
    assert.equal(v[COL.neto], Math.round((total - iva) * 100) / 100, `M ≠ Total − IVA en: ${f.que}`)
  }
})

test('el manuscrito «Taller» imputa la obra: dos grafías del mismo rótulo no son una ambigüedad', () => {
  // La fila 840 del 13/08. El desplegable vivo de la columna J trae «Taller» Y «TALLER»: el matcheo
  // llamaba empate a eso y devolvía null, así que J y K quedaban vacías con el manuscrito leído.
  const it = armarItem({
    lectura: {
      emisor: 'Corralon Progreso', total: '100', fecha: '13/08/2026', letra: 'FACTURA A',
      numero: '0012-00050057', anotacion_manuscrita: 'Taller',
    },
    listas: LISTAS_COMPRAS,
  })
  assert.equal(it.comprobante.obra, 'Taller', 'la anotación identifica UNA obra, escrita dos veces')
  assert.equal(it.comprobante.categoria, 'B', 'y con factura A va en blanco, no en negro')
})

test('el Detalle (K) se COMPONE cuando ninguna lista lo tiene — como lo escribe Claude Code', () => {
  // Fila 833 de Claude Code: `retira Rodrigo · vto 04/08`. No está en ninguna lista y el dueño la dio
  // por buena. El bot dejaba K vacía en casi toda fila que cargó.
  const it = armarItem({
    lectura: {
      emisor: 'Combustibles Barcelo', total: '100', fecha: '05/01/2026', letra: 'FACTURA A',
      numero: '0113-00010489', detalle_libre: 'retira Rodrigo · vto 04/08',
    },
    listas: LISTAS,
  })
  assert.equal(it.comprobante.detalleObra, 'retira Rodrigo · vto 04/08')
  assert.equal(aFajoJson([it])[0].detalle, 'retira Rodrigo · vto 04/08', 'y llega al fajo, no se queda en el ítem')
})

// ── IDEMPOTENCIA: la misma foto dos veces no puede ser dos gastos ────────────

test('la misma foto mandada dos veces colapsa por (CUIT, tipo, número), no por fileId', () => {
  const a = armarItem({ lectura: lecturaBarcelo(), adjunto: { fileId: 'f1', nombre: 'uno.jpg' }, listas: LISTAS })
  const b = armarItem({ lectura: lecturaBarcelo(), adjunto: { fileId: 'f2', nombre: 'otra.jpg' }, listas: LISTAS })
  assert.equal(claveComprobante(a.comprobante).clave, claveComprobante(b.comprobante).clave)
  const { items } = colapsarRepetidos([a, b])
  assert.equal(items.length, 1, 'un comprobante, no dos')
  assert.equal(items[0].copias?.length, 1, 'y la copia queda anotada, no se evapora')
})

test('un comprobante que YA está en Compras no genera plan: lo frena la pestaña viva', async () => {
  const enCompras = indexarCompras([
    ...Array.from({ length: 808 }, () => []),
    filaCompras('5/1/2026', 'Combustibles Barcelo', 'F A', '0113-00010489', 'Estrella', '', 'Gasoil', '$ 36.460,30'),
  ])
  const { plan, duplicados } = await prepararPlan(aFajoJson([itemDelBot()]), {
    lista: LISTAS.proveedores,
    indiceCompras: { ok: true, ...enCompras },
  })
  assert.equal(plan.length, 0, 'no se escribe una segunda fila del mismo gasto')
  assert.equal(duplicados.length, 1)
  assert.equal(duplicados[0].cierto, true, 'mismo número y mismo total: certeza, no sospecha')
  // La fila que informa es la del índice, no una contada a mano: es el número que después se le dice
  // al dueño para que la vaya a mirar, y un off-by-one ahí lo manda a la línea equivocada.
  assert.equal(duplicados[0].fila, enCompras.porNumero.get('0113-00010489')[0].fila)
})

test('la pestaña viva lo encuentra por número aunque haya entrado por Claude Code', () => {
  const enCompras = indexarCompras([
    ...Array.from({ length: 808 }, () => []),
    filaCompras('5/1/2026', 'Combustibles Barcelo', 'F A', '0113-00010489', 'Estrella', '', 'Gasoil', '$ 36.460,30'),
  ])
  const { comprobante } = itemDelBot()
  const r = enCompras.porNumero?.get?.('0113-00010489')
  assert.equal(r?.length, 1, 'el índice indexa por número canónico')
  assert.equal(comprobante.numero, '0113-00010489')
})

// ── LA OBRA NO SE INVENTA, NI SIQUIERA PARA NO PREGUNTAR ─────────────────────

test('sin anotación y sin historial, la obra queda VACÍA y la celda J no se escribe', () => {
  const it = itemDelBot({ anotacion_manuscrita: null })
  assert.equal(it.comprobante.obra, null)
  const v = valoresInput(aFajoJson([it])[0])
  assert.equal(v[COL.obra], undefined, 'J vacía es la marca de pendiente: escribir "pendiente" la dejaría en rojo')
  // Y el resto de la fila entra igual: el gasto llega a Compras, que es lo que importa.
  assert.equal(v[COL.proveedor], 'Combustibles Barcelo')
  assert.equal(v[COL.neto], 30479.30)
})

// ── LA IMPUTACIÓN APRENDIDA: DOS CAMINOS, UNA SOLA RESPUESTA (14/08) ─────────
//
// ═══ EL DEFECTO ═══
//
// `completarConHistorial` (el chat) ESCRIBÍA obra, detalle, unidad y categoría deducidas del perfil
// estadístico del proveedor. El cargador de línea de comandos, con la MISMA lib, sólo las imprimía:
// su propio comentario lo decía, «NO cambia lo que se escribe». Dos comportamientos sobre la columna
// que decide qué obra come el costo, según por dónde entrara el mismo papel.

/** Historia que deja el perfil de Barcelo FIRME: n≥5 y ≥80% en la misma obra. */
const HISTORIA_FIRME = Array.from({ length: 8 }, () => ({
  proveedor: 'Combustibles Barcelo', unidad_negocio: 'Obras', obra_texto: 'San Francisco',
  detalle: 'Civil', concepto: 'gasoil autoelevador', categoria: 'B',
}))

test('EL DEFECTO: el chat imputaba y el cargador no — ahora las dos vías escriben lo mismo', async () => {
  const perfiles = perfilesDeImputacion(HISTORIA_FIRME)
  const sinObra = () => itemDelBot({ anotacion_manuscrita: null })

  // VÍA CHAT
  const [itChat] = completarConHistorial([sinObra()], perfiles)
  const celdasChat = valoresInput(aFajoJson([itChat])[0])

  // VÍA CLAUDE CODE: el mismo fajo, por el planificador del cargador.
  const { plan } = await prepararPlan(aFajoJson([sinObra()]), { lista: LISTAS.proveedores, perfiles })
  const celdasCargador = plan[0].valores

  assert.equal(celdasChat[COL.obra], 'San Francisco')
  assert.equal(celdasCargador[COL.obra], 'San Francisco', 'el cargador dejó la obra vacía: sólo la imprimía')
  assert.deepEqual(celdasCargador, celdasChat, 'las dos vías escriben celdas distintas para el mismo papel')
})

test('y la fila DECLARA que esa obra salió del historial, no del papel', () => {
  const perfiles = perfilesDeImputacion(HISTORIA_FIRME)
  const [it] = completarConHistorial([itemDelBot({ anotacion_manuscrita: null })], perfiles)
  const v = valoresInput(aFajoJson([it])[0])
  assert.match(v[COL.concepto], /\[historial: obra/, 'una inferencia escrita sin marca es una estimación con cara de hecho')
  // Y lo que el papel SÍ dijo no se marca: el manuscrito «Estrella» manda sobre el promedio.
  const [conPapel] = completarConHistorial([itemDelBot()], perfiles)
  const vPapel = valoresInput(aFajoJson([conPapel])[0])
  assert.equal(conPapel.comprobante.obra, 'Estrella')
  assert.doesNotMatch(vPapel[COL.concepto], /historial:[^\]]*obra/)
})
