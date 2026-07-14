// Panel del OS. Lee la config (dirección + llave), detecta el archivo de Drive
// abierto en la pestaña activa, y manda la directiva al cerebro del OS.
const $ = (id) => document.getElementById(id)
const DEFAULT_ADDR = 'https://echegaray-business-os.vercel.app/api/os'

async function getCfg() {
  const c = await chrome.storage.local.get(['addr', 'token'])
  return { addr: c.addr || DEFAULT_ADDR, token: c.token || '' }
}

// Extrae el file_id de Drive/Sheets/Docs de la URL de la pestaña activa.
async function driveFileId() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const url = tab?.url || ''
    const m = url.match(/(?:spreadsheets|document|presentation|file)\/d\/([a-zA-Z0-9_-]{20,})/)
    return m ? m[1] : null
  } catch { return null }
}

function addMsg(text, who, meta) {
  $('hint')?.remove()
  const d = document.createElement('div')
  d.className = 'msg ' + who
  d.textContent = text
  if (meta) { const m = document.createElement('div'); m.className = 'meta'; m.textContent = meta; d.appendChild(m) }
  $('chat').appendChild(d)
  $('chat').scrollTop = $('chat').scrollHeight
  return d
}

async function ping() {
  const { addr } = await getCfg()
  try { const r = await fetch(`${addr}/health`, { signal: AbortSignal.timeout(4000) }); $('status').classList.toggle('on', r.ok) }
  catch { $('status').classList.remove('on') }
}

async function send() {
  const directive = $('input').value.trim()
  if (!directive) return
  const { addr, token } = await getCfg()
  if (!token) { $('settings').classList.add('show'); addMsg('Primero pegá tu llave de acceso en configuración (⚙).', 'os'); return }
  $('input').value = ''
  addMsg(directive, 'me')
  $('send').disabled = true
  const pending = addMsg('Pensando…', 'os')
  const fileId = await driveFileId()
  const t0 = Date.now()
  try {
    const r = await fetch(`${addr}/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
      body: JSON.stringify({ directive, fileId }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || `error ${r.status}`)
    pending.textContent = data.answer || '(sin respuesta)'
    const m = document.createElement('div'); m.className = 'meta'
    m.textContent = `${((Date.now() - t0) / 1000).toFixed(1)}s${fileId ? ' · leyó el archivo abierto' : ''}`
    pending.appendChild(m)
  } catch (e) {
    pending.textContent = 'No pude conectar con el OS: ' + e.message
  } finally {
    $('send').disabled = false
    $('chat').scrollTop = $('chat').scrollHeight
    loadPending() // una directiva puede haber dejado operaciones pendientes
  }
}

// ---- Pendientes de aprobación ----

/** Resumen legible del cambio propuesto por una operación. */
function opSummary(op) {
  const p = op.payload || {}
  const a = p.args || op.target || {}
  const tool = p.tool || op.capability_slug
  const bits = []
  if (a.name) bits.push(`"${a.name}"`)
  if (a.tipo) bits.push(a.tipo)
  if (a.file_id) bits.push('archivo ' + a.file_id)
  if (a.range) bits.push('rango ' + a.range)
  if (a.values) bits.push(JSON.stringify(a.values).slice(0, 240))
  return { tool, detail: bits.join(' · ') || JSON.stringify(a).slice(0, 240) }
}

async function loadPending() {
  const { addr, token } = await getCfg()
  if (!token) return
  let items = []
  try {
    const r = await fetch(`${addr}/pending`, { headers: { authorization: `Bearer ${token}` } })
    const data = await r.json()
    items = Array.isArray(data.items) ? data.items : []
  } catch { return }
  const badge = $('pcount')
  badge.textContent = items.length
  badge.setAttribute('data-n', String(items.length))
  const box = $('pending')
  box.querySelectorAll('.op').forEach((e) => e.remove())
  $('phint').style.display = items.length ? 'none' : 'block'
  for (const op of items) {
    const { tool, detail } = opSummary(op)
    const card = document.createElement('div'); card.className = 'op'
    const cap = document.createElement('div'); cap.className = 'cap'; cap.textContent = tool
    const tgt = document.createElement('div'); tgt.className = 'tgt'; tgt.textContent = detail
    const acts = document.createElement('div'); acts.className = 'acts'
    const ok = document.createElement('button'); ok.className = 'ok'; ok.textContent = 'Aprobar'
    const no = document.createElement('button'); no.className = 'no'; no.textContent = 'Rechazar'
    ok.addEventListener('click', () => decide(op.id, 'approve', card))
    no.addEventListener('click', () => decide(op.id, 'reject', card))
    acts.append(ok, no); card.append(cap, tgt, acts); box.appendChild(card)
  }
}

async function decide(id, action, card) {
  const { addr, token } = await getCfg()
  card.classList.add('done')
  card.querySelectorAll('button').forEach((b) => (b.disabled = true))
  try {
    const r = await fetch(`${addr}/operation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, action }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || `error ${r.status}`)
    setTimeout(loadPending, 500)
  } catch (e) {
    card.classList.remove('done')
    card.querySelectorAll('button').forEach((b) => (b.disabled = false))
    addMsg('No se pudo procesar la operación: ' + e.message, 'os')
  }
}

function showView(view) {
  const chat = view === 'chat'
  $('chat').style.display = chat ? 'flex' : 'none'
  $('pending').classList.toggle('show', !chat)
  $('tabChat').classList.toggle('active', chat)
  $('tabPending').classList.toggle('active', !chat)
  document.querySelector('footer').style.display = chat ? 'flex' : 'none'
  if (!chat) loadPending()
}

// eventos
$('send').addEventListener('click', send)
$('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } })
$('tabChat').addEventListener('click', () => showView('chat'))
$('tabPending').addEventListener('click', () => showView('pending'))
$('gear').addEventListener('click', () => $('settings').classList.toggle('show'))
$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ addr: $('addr').value.trim() || DEFAULT_ADDR, token: $('token').value.trim() })
  $('settings').classList.remove('show')
  ping()
})

;(async () => {
  const { addr, token } = await getCfg()
  $('addr').value = addr
  $('token').value = token
  ping()
  loadPending() // pobla el badge de pendientes al abrir
})()
