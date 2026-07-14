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
  }
}

// eventos
$('send').addEventListener('click', send)
$('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } })
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
})()
