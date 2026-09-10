// GMAIL NO DEVUELVE TODO EN LA PRIMERA PÁGINA — y una búsqueda que se olvida del `nextPageToken`
// contesta menos sin decirlo.
//
// MEDIDO el 10/09/2026 sobre rodrigo@ecsas.com.ar (8.186 mensajes desde 2021): las cinco consultas
// del importador de órdenes emparejan 577, 140, 269, 44 y 226 mensajes, y `gmailSearch` devolvía 60
// de cada una — los MÁS NUEVOS. Las órdenes de compra de Messina y ARCOR anteriores a 2026 no
// existían para el OS, y nada en el log lo decía: la corrida terminaba «bien».
//
// Estas pruebas fijan las dos mitades del contrato: se pagina hasta agotar la consulta, y cuando se
// corta por el tope explícito se AVISA. Sin red y sin credenciales: el `fetchImpl` es el de mentira.
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/base-inexistente-de-test'
process.env.ORQ_DB_SSL = '0'

const { makeGoogleClient } = await import('./google.mjs')

/**
 * Un Gmail de mentira con `total` mensajes y páginas de `porPagina`. Registra qué se pidió, que es
 * lo que el test necesita afirmar: sin mirar las URLs, «trajo 60» y «trajo 60 de 577» se ven igual.
 */
function gmailFalso({ total, porPagina = 100 }) {
  const pedidos = []
  const fetchImpl = async (url) => {
    const u = new URL(url)
    pedidos.push(u.pathname + u.search)
    if (u.pathname.endsWith('/messages')) {
      const desde = Number(u.searchParams.get('pageToken') || '0')
      const cuantos = Math.min(Number(u.searchParams.get('maxResults') || 100), porPagina, total - desde)
      const messages = Array.from({ length: Math.max(0, cuantos) }, (_, i) => ({ id: `m${desde + i}` }))
      const fin = desde + messages.length
      return { ok: true, status: 200, json: async () => (fin < total ? { messages, nextPageToken: String(fin) } : { messages }) }
    }
    const id = u.pathname.split('/').pop()
    return {
      ok: true,
      status: 200,
      json: async () => ({ payload: { headers: [{ name: 'From', value: `x@y.com` }, { name: 'Subject', value: `asunto ${id}` }] } }),
    }
  }
  return { fetchImpl, pedidos }
}

const cliente = (fetchImpl) => makeGoogleClient({
  config: { fake: true }, scopes: [], soloUsuario: true, getToken: async () => 'token-de-prueba', fetchImpl,
})

test('gmailSearch pagina hasta agotar la consulta: 577 mensajes son 577, no la primera página', async () => {
  const { fetchImpl, pedidos } = gmailFalso({ total: 577, porPagina: 100 })
  const r = await cliente(fetchImpl).gmailSearch('has:attachment from:juanmessina.com.ar', { max: 5000 })
  assert.equal(r.length, 577, 'se perdieron los mensajes viejos: la consulta no siguió el nextPageToken')
  assert.equal(r[0].id, 'm0')
  assert.equal(r.at(-1).id, 'm576')
  const listados = pedidos.filter((p) => p.endsWith('/messages') || p.includes('/messages?'))
  assert.ok(listados.length >= 6, `con páginas de 100 hacen falta al menos 6 listados, hubo ${listados.length}`)
})

test('cuando el tope corta con Gmail teniendo más, avisa — no se recorta en silencio', async () => {
  const { fetchImpl } = gmailFalso({ total: 577, porPagina: 100 })
  const avisos = []
  const r = await cliente(fetchImpl).gmailSearch('has:attachment', { max: 60, onAviso: (a) => avisos.push(a) })
  assert.equal(r.length, 60)
  assert.equal(avisos.length, 1, 'trajo 60 de 577 y no avisó: ése es exactamente el defecto')
  assert.equal(avisos[0].traidos, 60)
  assert.equal(avisos[0].tope, 60)
  assert.match(avisos[0].query, /has:attachment/)
})

test('si la consulta entra entera en el tope no hay aviso: un aviso que siempre suena no informa', async () => {
  const { fetchImpl } = gmailFalso({ total: 12, porPagina: 100 })
  const avisos = []
  const r = await cliente(fetchImpl).gmailSearch('subject:oc', { max: 60, onAviso: (a) => avisos.push(a) })
  assert.equal(r.length, 12)
  assert.deepEqual(avisos, [])
})

test('una consulta sin resultados devuelve [] y no pide una segunda página', async () => {
  const { fetchImpl, pedidos } = gmailFalso({ total: 0, porPagina: 100 })
  const r = await cliente(fetchImpl).gmailSearch('from:nadie@example.com', { max: 60 })
  assert.deepEqual(r, [])
  assert.equal(pedidos.length, 1)
})

// ── EL 403 QUE ES UNA CUOTA ─────────────────────────────────────────────────────────────────────
//
// MEDIDO el 10/09/2026 recorriendo rodrigo@ecsas.com.ar: al pasarse del límite por minuto Gmail NO
// contesta 429, contesta **403** con «Quota exceeded for quota metric 'Total Query Cost' and limit
// 'Units per minute per user'». El reintento sólo miraba el 429, así que ese 403 se trataba como
// «no tenés permiso» y ocho de las nueve consultas de la casilla devolvieron 0 — indistinguible de
// una casilla vacía.

/** Falla `veces` veces con el 403 de cuota y después contesta bien. `clone()` porque así es una
 *  Response real, y es de donde el reintento lee el cuerpo sin consumirlo. */
function gmailConCuota({ veces }) {
  let fallos = 0
  const cuerpo = JSON.stringify({ error: { code: 403, message: "Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'" } })
  return async (url) => {
    if (fallos < veces) {
      fallos++
      const res = { ok: false, status: 403, text: async () => cuerpo, json: async () => JSON.parse(cuerpo) }
      res.clone = () => ({ text: async () => cuerpo })
      return res
    }
    if (new URL(url).pathname.endsWith('/messages')) return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'm1' }] }) }
    return { ok: true, status: 200, json: async () => ({ payload: { headers: [] } }) }
  }
}

test('un 403 que dice «Quota exceeded» se reintenta: no es falta de permiso', async () => {
  const r = await cliente(gmailConCuota({ veces: 1 })).gmailSearch('from:juanmessina.com.ar', { max: 10 })
  assert.equal(r.length, 1, 'la consulta devolvió 0 y la casilla parecía vacía')
})

test('un 403 SIN «quota» sigue siendo permanente: no se reintenta cinco veces una falta de permiso', async () => {
  const cuerpo = JSON.stringify({ error: { code: 403, message: 'Request had insufficient authentication scopes.' } })
  let llamadas = 0
  const fetchImpl = async () => {
    llamadas++
    const res = { ok: false, status: 403, text: async () => cuerpo, json: async () => JSON.parse(cuerpo) }
    res.clone = () => ({ text: async () => cuerpo })
    return res
  }
  await assert.rejects(() => cliente(fetchImpl).gmailSearch('x', { max: 10 }), /403/)
  assert.equal(llamadas, 1, 'esperar 89 segundos por un scope que falta no lo arregla')
})
