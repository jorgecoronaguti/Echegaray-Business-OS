// EL COMPROBANTE DE BARCELO DEL 04/08 A LAS 18:48 — TRES LECTURAS MAL EN UN SOLO PAPEL.
//
// Esto es TEXTUAL lo que el bot le contestó al dueño, y cada renglón es un defecto distinto:
//
//   ### COMESTIBLES BARCELO
//   | Comprobante       | F B 0001-00012885            |
//   | Fecha             | 05/12/2003                   |  ← imposible: la empresa carga 2025-2026
//   | Obra              | MESSINA (la elegiste vos)    |
//   | Detalle           | Combustible (lo elegiste vos)|
//   | Concepto          | Comestibles y bebidas        |  ← salió del NOMBRE mal leído, no del papel
//   | Importe a Compras | $5.223,35                    |
//   | IVA               | $0,01                        |  ← un centavo sobre $5.223 no es una alícuota
//   | Total             | $5.223,36                    |
//
// Lo que tienen los tres en común: **son datos que NO PUEDEN SER CIERTOS y se mostraron como si lo
// fueran.** La aritmética cerraba (5.223,35 + 0,01 = 5.223,36), el proveedor terminó bien matcheado
// y el número era correcto — o sea que TODOS los controles que ya existían pasaron en verde. Lo que
// faltaba no era otro control de consistencia interna: era preguntarle a cada dato si puede existir.
//
// Un dato leído que no puede ser cierto no se muestra como leído: se declara ilegible y se pregunta.
// Y nunca se lo reemplaza por uno inventado — "no pude leer la fecha" es una respuesta; una fecha
// fabricada es una carga mal hecha que nadie va a revisar.

import test from 'node:test'
import assert from 'node:assert/strict'
import { procesarPost } from './flujo.mjs'
import { aFajoJson } from './escritura.mjs'
import { aplicarCorreccion } from './dialogo.mjs'
import { repoMemoria, portGuarda, mmFalso, filaCompras } from './dobles.mjs'
import { indexarCompras } from '../../lib/comprobantes/compras-vivas.mjs'
import { estaCompleto, preguntasDe } from '../../lib/comprobantes/fajo.mjs'

const URL = 'https://chat.ecsas.com.ar/comprobantes/accion?t=SECRETO'
const ACTOR = { plataforma_user_id: 'u_rodrigo', plataforma_username: 'rodrigo', channel_type: 'P', channel_id: 'c_comprobantes' }
const AHORA = new Date('2026-08-04T21:48:00Z')

/** Los desplegables ESTRICTOS de Compras. `Comestibles y bebidas` está en Categoría a propósito. */
const LISTAS = Object.freeze({
  ok: true,
  proveedores: ['Combustibles Barcelo', 'ALUMETAL', 'Corralon Progreso'],
  obras: ['LA ESTRELLA', 'MESSINA', 'Vehiculos / Maquinas'],
  unidades: ['Materiales', 'Servicios'],
  categorias: ['Combustible', 'Comestibles y bebidas', 'Materiales'],
  tiposPago: ['Efectivo', 'Transferencia', 'Echeq'],
})

/**
 * LA LECTURA QUE PRODUJO ESE MENSAJE. No es un ejemplo: son los valores del mensaje real.
 *
 * La aritmética CIERRA —5.223,35 + 0,01 + 0 = 5.223,36— y por eso el control de identidad no dijo
 * nada. Es justo el caso que obliga a mirar cada dato por separado.
 */
const barceloMalLeida = (over = {}) => ({
  emisor: 'COMESTIBLES BARCELO',
  cuit: null,
  letra: 'B',
  es_nota_credito: false,
  numero: '0001-00012885',
  fecha: '05/12/2003',
  neto_gravado: '5.223,35',
  iva_21: '0,01',
  iva_105: '0',
  otros_tributos: '0',
  total: '5.223,36',
  condicion_venta: 'Contado',
  concepto: 'Comestibles y bebidas',
  // El modelo también ELIGIÓ la categoría del desplegable con el nombre equivocado en la cabeza:
  // «Comestibles y bebidas» está en la lista y es la opción obvia para un proveedor que se llama
  // «COMESTIBLES». La columna B del Sheet se escribe con esto.
  categoria: 'Comestibles y bebidas',
  anotacion_manuscrita: null,
  legible: true,
  dudas: [],
  ...over,
})

/** La historia de Barcelo en Compras: 6 cargas a MESSINA / Combustible. Es la que imputa sola. */
const FILAS_BARCELO = (() => {
  const relleno = Array.from({ length: 796 }, () => [])
  const historia = Array.from({ length: 6 }, (_, k) => filaCompras(
    `${10 + k}/7/2026`, 'Combustibles Barcelo', 'F B', `0001-0001280${k}`, 'MESSINA', 'Camion - BSA', 'Gasoil', `$ ${11 + k}.000,00`, 'Combustible',
  ))
  return [...relleno, ...historia]
})()

function armar({ lecturas, filas = FILAS_BARCELO, listas = LISTAS } = {}) {
  const repo = repoMemoria()
  const mm = mmFalso({ archivos: { f1: { name: 'IMG_7601.jpg', mime: 'image/jpeg' } } })
  let i = 0
  return {
    repo,
    mm,
    d: {
      port: portGuarda(), repo, mattermost: mm, url: URL,
      leer: async () => ({ ok: true, crudo: lecturas[Math.min(i++, lecturas.length - 1)] }),
      listas: async () => listas,
      comprasDe: async () => ({ ok: true, ...indexarCompras(filas) }),
    },
  }
}

const post = (o = {}) => ({
  fileIds: ['f1'], actor: ACTOR, channelId: 'c_comprobantes', postId: 'p1', rootPostId: 'p1',
  ahora: AHORA, ...o,
})

const itemDe = (repo, r) => repo._fajos.get(r.fajoId).items[0]

// ═══ 1 · UNA FECHA DE 2003 NO ES UNA FECHA LEÍDA ═════════════════════════════

test('05/12/2003: no se muestra como fecha, se declara ilegible y se pregunta', async () => {
  const { d, repo } = armar({ lecturas: [barceloMalLeida()] })
  const r = await procesarPost(d, post())
  const it = itemDe(repo, r)

  assert.equal(estaCompleto(it), false, 'un comprobante con la fecha ilegible no se carga')
  assert.equal(aFajoJson([it]).length, 0, 'y no llega al cargador')

  assert.doesNotMatch(r.texto, /\| Fecha \| 05\/12\/2003 \|/,
    'la fecha imposible NO puede aparecer en la tabla como si fuera el dato leído')
  assert.match(r.texto, /no pude leer la fecha/i, 'se dice que no se pudo leer')
  assert.match(r.texto, /05\/12\/2003/,
    'y se muestra QUÉ se leyó, como evidencia declarada — no como el dato')
  assert.ok(preguntasDe(it).some((p) => /fecha/i.test(p)), 'la fecha se pregunta')
})

test('la fecha de hoy y la del mes pasado pasan sin que el control diga una palabra', async () => {
  const { d, repo } = armar({ lecturas: [barceloMalLeida({ fecha: '04/08/2026', iva_21: '0', concepto: null })] })
  const r = await procesarPost(d, post())
  assert.doesNotMatch(r.texto, /no pude leer la fecha/i)
  assert.match(r.texto, /\| Fecha \| 04\/08\/2026 \|/)
  assert.equal(estaCompleto(itemDe(repo, r)), true)
})

test('una fecha FUTURA tampoco es una fecha leída', async () => {
  const { d, repo } = armar({ lecturas: [barceloMalLeida({ fecha: '04/08/2027', iva_21: '0', concepto: null })] })
  const r = await procesarPost(d, post())
  assert.equal(estaCompleto(itemDe(repo, r)), false)
  assert.match(r.texto, /no pude leer la fecha/i)
})

// ═══ 2 · UN CENTAVO DE IVA SOBRE $5.223 NO ES NINGUNA ALÍCUOTA ═══════════════

test('IVA $0,01 sobre $5.223,35: no se muestra como IVA leído y se pregunta', async () => {
  const { d, repo } = armar({ lecturas: [barceloMalLeida()] })
  const r = await procesarPost(d, post())
  const it = itemDe(repo, r)

  assert.equal(estaCompleto(it), false, 'un IVA imposible no se escribe en la columna N')
  assert.doesNotMatch(r.texto, /\| IVA \| \$0,01 \|/, 'no se muestra como si fuera el IVA del papel')
  assert.ok(preguntasDe(it).some((p) => /IVA/.test(p)), 'se pregunta el IVA')
  assert.match(r.texto, /\$5\.223,36/, 'el TOTAL sí se leyó del papel y se muestra tal cual')
})

test('un tique B que NO discrimina IVA es legítimo: IVA 0 no dispara nada', async () => {
  const { d, repo } = armar({ lecturas: [barceloMalLeida({ fecha: '03/08/2026', iva_21: '0', iva_105: '0', neto_gravado: '5.223,36', total: '5.223,36', concepto: null })] })
  const r = await procesarPost(d, post())
  assert.equal(estaCompleto(itemDe(repo, r)), true, 'sin IVA discriminado se carga: es lo normal en un tique B')
  assert.doesNotMatch(r.texto, /no pude leer el IVA/i)
})

test('el IVA al 21% y al 10,5% pasan; el 21% con un dígito de más, no', async () => {
  const bien = armar({ lecturas: [barceloMalLeida({ fecha: '03/08/2026', neto_gravado: '5.223,35', iva_21: '1.096,90', total: '6.320,25', concepto: null })] })
  const rb = await procesarPost(bien.d, post())
  assert.equal(estaCompleto(itemDe(bien.repo, rb)), true, '21% exacto: nada que preguntar')

  const mal = armar({ lecturas: [barceloMalLeida({ fecha: '03/08/2026', neto_gravado: '5.223,35', iva_21: '10.969,00', total: '16.192,35', concepto: null })] })
  const rm = await procesarPost(mal.d, post())
  assert.equal(estaCompleto(itemDe(mal.repo, rm)), false, '210% de IVA no existe')
})

// ═══ 3 · EL CONCEPTO SALE DEL COMPROBANTE, NO DEL NOMBRE DEL PROVEEDOR ══════

test('"Comestibles y bebidas" salía del nombre mal leído: se descarta y se dice', async () => {
  const { d, repo } = armar({ lecturas: [barceloMalLeida()] })
  const r = await procesarPost(d, post())
  const c = itemDe(repo, r).comprobante

  assert.equal(c.proveedor, 'Combustibles Barcelo', 'el proveedor real, matcheado por distancia de edición')
  assert.equal(c.concepto, null, 'lo que se dedujo del nombre MAL leído no es un dato del comprobante')
  assert.equal(c.conceptoDescartado, 'Comestibles y bebidas', 'pero queda constancia de qué se tiró')

  // La categoría que eligió el modelo tampoco entra a la columna B. Como queda vacía, la completa la
  // historia del proveedor —6 cargas, todas Combustible— que es la fuente que sí sabe.
  assert.notEqual(c.categoria, 'Comestibles y bebidas', 'la columna B no se escribe con el eco del OCR')
  assert.equal(c.categoria, 'Combustible', 'y la historia de Compras la resuelve bien')

  assert.doesNotMatch(r.texto, /\| Concepto \| Comestibles y bebidas \|/,
    'no se muestra como si fuera lo que dice el papel')
  assert.match(r.texto, /descarté el concepto \("Comestibles y bebidas"\)/,
    'se muestra como lo que es: algo que se descartó, con su motivo')
  assert.match(r.texto, /COMESTIBLES BARCELO/,
    'se declara qué se leyó mal: sin eso el dueño no puede entender por qué falta el concepto')
})

test('un concepto legítimo NO se descarta aunque se parezca al proveedor bien leído', async () => {
  const { d, repo } = armar({
    lecturas: [barceloMalLeida({ emisor: 'Combustibles Barcelo', fecha: '03/08/2026', iva_21: '0', concepto: 'Combustible Diesel 500' })],
  })
  const r = await procesarPost(d, post())
  assert.equal(itemDe(repo, r).comprobante.concepto, 'Combustible Diesel 500',
    'el nombre se leyó bien: no hay contaminación que descartar')
})

// ═══ 4 · LA PREGUNTA TIENE QUE SER LA QUE FALTA, NO EL CATÁLOGO ═════════════

test('si lo único dudoso es la fecha, se pregunta la fecha y el resto se muestra leído', async () => {
  const { d } = armar({ lecturas: [barceloMalLeida({ iva_21: '0', concepto: null })] })
  const r = await procesarPost(d, post())

  assert.match(r.texto, /Sólo me falta la fecha/i, 'el titular nombra lo que falta')
  assert.doesNotMatch(r.texto, /Me falta un dato/i, 'y deja de ser "me falta un dato" sin decir cuál')
  assert.match(r.texto, /\| \*\*Total\*\* \| \*\*\$5\.223,36\*\* \|/, 'el resto se muestra como lo que es: leído')
})

test('con las tres cosas mal, se nombran las tres y ninguna se inventa', async () => {
  const { d, repo } = armar({ lecturas: [barceloMalLeida()] })
  const r = await procesarPost(d, post())
  const preguntas = preguntasDe(itemDe(repo, r))
  assert.ok(preguntas.some((p) => /fecha/i.test(p)))
  assert.ok(preguntas.some((p) => /IVA/.test(p)))
})

// ═══ 5 · CORREGIR DESTRABA — UN CONTROL SIN SALIDA NO ES UN CONTROL ═════════

test('la fecha y el IVA tipeados por una persona no se vuelven a cuestionar', async () => {
  const { d, repo } = armar({ lecturas: [barceloMalLeida()] })
  const r = await procesarPost(d, post())
  const it = itemDe(repo, r)

  const corregido = aplicarCorreccion(it, { fecha: '04/12/2003', iva: '0' })
  assert.equal(corregido.ok, true)
  assert.equal(corregido.item.comprobante.fecha, '04/12/2003', 'la persona miró el papel: manda')
  assert.deepEqual(
    preguntasDe(corregido.item).filter((p) => /fecha|IVA/i.test(p)), [],
    'el control deja de opinar sobre lo que alguien escribió a mano',
  )
})
