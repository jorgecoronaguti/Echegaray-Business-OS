// EL AGRUPADO Y EL MENSAJE DE CONFIRMACIÓN.
//
// Lo que se prueba acá es la decisión de producto que el dueño pidió justificar: varias fotos
// seguidas se agrupan en UNA confirmación, y lo que garantiza que nada entre dos veces NO es la
// ventana de tiempo sino la clave del comprobante.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  entraEnElFajo, colapsarRepetidos, botonesFajo, preguntasDe, estaCompleto,
  ESTADO, VENTANA_FAJO_MIN,
} from './fajo.mjs'

const T0 = new Date('2026-08-03T10:00:00Z')
const mas = (min) => new Date(T0.getTime() + min * 60_000)

const abierto = (o = {}) => ({
  id: 'f1', estado: ESTADO.ABIERTO, plataforma_user_id: 'u1', channel_id: 'c1', ultimo_at: T0, ...o,
})

const item = (o = {}) => ({
  clave: o.clave ?? 'c:30712345678|0113-00010489',
  comprobante: {
    proveedor: 'Combustibles Barcelo', cuit: '30712345678', tipo: 'A', numero: '0113-00010489',
    fecha: '05/01/2026', total: 36460.30, iva: 5981, obra: 'Estrella', esNotaCredito: false,
    ...(o.comprobante ?? {}),
  },
  ...(o.extra ?? {}),
})

// ── El agrupado ──────────────────────────────────────────────────────────────

test('dos posts seguidos de la misma persona en el mismo canal entran en el mismo fajo', () => {
  assert.equal(entraEnElFajo(abierto(), { userId: 'u1', channelId: 'c1', ahora: mas(2) }), true)
})

test('pasada la ventana, es una tanda nueva', () => {
  assert.equal(entraEnElFajo(abierto(), { userId: 'u1', channelId: 'c1', ahora: mas(VENTANA_FAJO_MIN + 1) }), false)
})

test('otra persona, u otro canal, nunca comparte fajo', () => {
  assert.equal(entraEnElFajo(abierto(), { userId: 'u2', channelId: 'c1', ahora: mas(1) }), false)
  assert.equal(entraEnElFajo(abierto(), { userId: 'u1', channelId: 'c2', ahora: mas(1) }), false)
})

test('un fajo YA CONFIRMADO no recibe nada más: cargaría algo que nadie confirmó', () => {
  const f = abierto({ estado: ESTADO.CONFIRMADO })
  assert.equal(entraEnElFajo(f, { userId: 'u1', channelId: 'c1', ahora: mas(1) }), false)
})

test('no se agrupa hacia atrás: un reloj corrido no mete un comprobante en un fajo viejo', () => {
  assert.equal(entraEnElFajo(abierto(), { userId: 'u1', channelId: 'c1', ahora: mas(-3) }), false)
})

// ── La idempotencia dentro del fajo ──────────────────────────────────────────

test('la misma factura fotografiada dos veces se muestra UNA vez', () => {
  const { items, repetidos } = colapsarRepetidos([item(), item()])
  assert.equal(items.length, 1)
  assert.equal(repetidos.length, 1)
})

test('dos comprobantes distintos NO se colapsan', () => {
  const otro = item({ clave: 'c:30712345678|0113-00010490', comprobante: { numero: '0113-00010490' } })
  const { items } = colapsarRepetidos([item(), otro])
  assert.equal(items.length, 2)
})

test('sin clave no se colapsa: unir dos gastos distintos es peor que mostrar dos veces el mismo', () => {
  // Sin número no hay identidad posible: dos tickets ilegibles del mismo proveedor pueden ser dos
  // compras distintas, y colapsarlos borraría un gasto real.
  const sinNumero = () => item({ comprobante: { numero: null } })
  const { items } = colapsarRepetidos([sinNumero(), sinNumero()])
  assert.equal(items.length, 2)
})

test('la clave se RECALCULA del comprobante, no se cree la que venía guardada', () => {
  // Si se confiara en el campo `clave`, corregir un número mal leído dejaría la clave vieja y el
  // comprobante se deduplicaría contra otra cosa.
  const mentiroso = item({ clave: 'c:otra|cosa|distinta' })
  const { items } = colapsarRepetidos([item(), mentiroso])
  assert.equal(items.length, 1)
})

// ── Lo que falta se pregunta ─────────────────────────────────────────────────

test('un comprobante sin obra SE CARGA IGUAL: la obra se ofrece, no se exige (03/08/2026)', () => {
  // Decisión del dueño. La obra dejó de ser un faltante en las dos políticas; el desplegable con las
  // opciones del historial sigue saliendo y el mensaje avisa que va sin imputar (mensaje.test.mjs).
  const sinObra = item({ comprobante: { obra: null } })
  assert.equal(estaCompleto(sinObra), true)
  assert.deepEqual(preguntasDe(sinObra), [], 'no queda nada por contestar para poder cargarlo')
})

test('un PROVEEDOR DESCONOCIDO frena la carga y se pregunta por su nombre', () => {
  const nuevo = { ...item(), proveedorNuevo: true }
  assert.equal(estaCompleto(nuevo), false)
  const p = preguntasDe(nuevo).join(' ')
  assert.match(p, /no está en la lista de Compras/)
  assert.match(p, /Combustibles Barcelo/, 'se dice QUÉ proveedor, no un "hay un problema"')
})

test('un comprobante ya cargado no se vuelve a cargar aunque esté completo', () => {
  const ya = { ...item(), yaCargado: { fila: 412 } }
  assert.equal(estaCompleto(ya), false)
})

test('un comprobante completo es cargable', () => {
  assert.equal(estaCompleto(item()), true)
})

// EL MENSAJE SE PROBÓ APARTE desde el 03/08: se rehizo como tabla markdown y vive en `mensaje.mjs`.
// Sus tests están en `mensaje.test.mjs`. Acá quedó lo que DECIDE, que es lo que no puede cambiar
// porque cambie una palabra del texto.

// ── Los botones ──────────────────────────────────────────────────────────────

test('los botones llevan el secreto en la URL de integración y el id del fajo en el contexto', () => {
  const url = 'https://chat.ecsas.com.ar/comprobantes/accion?t=SECRETO'
  const [att] = botonesFajo({ id: 'f1', items: [item()] }, { url })
  const ids = att.actions.map((a) => a.id)
  assert.deepEqual(ids, ['confirmar', 'corregir', 'descartar'])
  for (const a of att.actions) {
    assert.equal(a.integration.url, url, 'el callback no trae identidad: el secreto va en la query')
    assert.equal(a.integration.context.fajo_id, 'f1')
  }
})

test('sin nada cargable NO aparece el botón de Confirmar', () => {
  const url = 'https://x/accion?t=s'
  // Sin número no se puede cargar por chat: ése sigue siendo un faltante de verdad. (Sin obra ya no
  // lo es — ver arriba —, así que ese caso dejaría de probar lo que este test quiere probar.)
  const [att] = botonesFajo({ id: 'f1', items: [item({ comprobante: { numero: null } })] }, { url })
  assert.deepEqual(att.actions.map((a) => a.id), ['corregir', 'descartar'])
})

test('faltando el número pero no la obra, el desplegable de obra SIGUE ofreciéndose', () => {
  // El bloque de obra no cuelga de que el ítem sea cargable: cuelga de que la obra falte y tenga
  // opciones. Contestar la obra mientras se corrige el número no puede quedar bloqueado.
  const url = 'https://x/accion?t=s'
  const it = {
    ...item({ comprobante: { numero: null, obra: null } }),
    sugerencia: { obra: { sugerido: 'Taller', opciones: [{ valor: 'Taller', n: 18 }] } },
  }
  const att = botonesFajo({ id: 'f1', items: [it] }, { url })
  assert.match(att[0].title, /¿A qué obra va\?/)
  assert.deepEqual(att[1].actions.map((a) => a.id), ['corregir', 'descartar'])
})

test('sin URL no se dibujan botones que no van a poder llamar a nadie', () => {
  assert.deepEqual(botonesFajo({ id: 'f1', items: [item()] }, {}), [])
})

// ═══ EL MISMO DEFECTO, DOS VECES, EN DOS MÓDULOS (04/08) ═══
//
// El `id` de una acción viaja adentro de la URL: POST /api/v4/posts/{post_id}/actions/{action_id}.
// Ese segmento sólo acepta alfanuméricos. Con `obra_0`, `duplicado_mismo` y `duplicado_otro` la ruta
// NO matcheaba: Mattermost mostraba "Sorry, we could not find the page" y el pedido NUNCA llegaba al
// OS — así que tampoco dejaba rastro en nuestros logs, y el síntoma no señalaba la causa ni de lejos.
//
// La asistencia ya lo había pagado el 30/07 con sus botones de fecha, y desde entonces tiene un
// validador. Comprobantes se escribió después y no lo reusó. Este test cierra ese hueco acá.

test('TODOS los ids de acción son alfanuméricos: Mattermost los mete en la URL', () => {
  const url = 'https://x/comprobantes/accion?t=1'
  // Un fajo con las tres familias de botones a la vez: obra a elegir y un duplicado abierto.
  // El botón de obra sólo existe si el comprobante NO trae obra Y hay opciones sugeridas: sin las
  // dos cosas la sección no se dibuja y el test pasaría sin haber mirado nunca los ids que fallaban.
  // OJO: `item()` sólo propaga `comprobante` y `extra`. Poner `sugerencia` afuera la descarta en
  // silencio, la sección de obra no se dibuja, y el test pasa sin haber mirado los ids que fallaban
  // — que es exactamente lo que me pasó en el primer intento de este mismo test.
  const conObra = item({
    comprobante: { obra: null },
    extra: {
      sugerencia: { obra: { opciones: [
        { valor: 'San Francisco', n: 41 }, { valor: 'Administracion', n: 39 }, { valor: 'Taller', n: 18 },
      ] } },
    },
  })
  const conDup = item({ extra: { posibleDuplicado: { fila: 412 } } })
  let vistos = 0
  for (const fajo of [{ id: 'f1', items: [conObra] }, { id: 'f2', items: [conDup] }, { id: 'f3', items: [item()] }]) {
    for (const att of botonesFajo(fajo, { url })) {
      for (const a of (att.actions ?? [])) {
        vistos++
        assert.match(String(a.id), /^[A-Za-z0-9]+$/,
          `el id «${a.id}» no entra en /posts/{id}/actions/{action_id}: el click muere en el router de Mattermost`)
      }
    }
  }
  // Sin esto, un cambio que deje de dibujar los botones haría pasar el test sin probar nada.
  assert.ok(vistos >= 7, `tienen que revisarse los botones de obra, duplicado y confirmación (vistos: ${vistos})`)
})

test('cambiar el id no cambia el despacho: eso lo decide context.accion', () => {
  const url = 'https://x/comprobantes/accion?t=1'
  const att = botonesFajo({ id: 'f1', items: [item({ comprobante: { obra: null } })] }, { url })
  const acciones = att.flatMap((a) => a.actions ?? [])
  assert.ok(acciones.length > 0)
  for (const a of acciones) {
    assert.ok(a.integration?.context?.accion, `la acción «${a.id}» tiene que declarar su accion en el context`)
  }
})
