// Panel del OS. Lee la config (dirección + llave), detecta el archivo de Drive
// abierto en la pestaña activa, y manda la directiva al cerebro del OS.
const $ = (id) => document.getElementById(id)
const DEFAULT_ADDR = 'https://echegaray-business-os.vercel.app/api/os'
let attachments = [] // [{ media_type, data(base64), name }] — el dueño puede subir VARIAS fotos juntas
let convo = [] // mensajes del chat actual {role:'me'|'os', text}
let activeRun = null // { runId, addr, token, pending, cancelled } mientras una tarea corre

// Mientras una tarea corre, el botón Enviar se convierte en DETENER (rojo). Al terminar
// vuelve a Enviar. Así el dueño puede cortar una tarea en curso en vez de esperarla.
function setStopMode() { const b = $('send'); if (b) { b.textContent = 'Detener'; b.classList.add('stop'); b.disabled = false } }
function clearStopMode() { const b = $('send'); if (b) { b.textContent = 'Enviar'; b.classList.remove('stop'); b.disabled = false } }
async function stopRun() {
  const run = activeRun
  if (!run) return
  run.cancelled = true
  if (run.pending) run.pending.textContent = '⏹ Tarea detenida.'
  try { await fetch(`${run.addr}/cancel?id=${run.runId}`, { headers: { authorization: `Bearer ${run.token}` } }) } catch { /* igual la cortamos local */ }
  activeRun = null
  clearStopMode()
}
let currentChatId = null // id del chat abierto (persistido en chrome.storage)

async function getCfg() {
  const c = await chrome.storage.local.get(['addr', 'token', 'email'])
  return { addr: c.addr || DEFAULT_ADDR, token: c.token || '', email: c.email || '' }
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

// Llevar al dueño directo al archivo/carpeta pedido: abrimos el destino en una pestaña
// nueva y enfocada (no pisamos la pestaña actual por si está trabajando en algo).
async function openInTab(nav) {
  addMsg('🧭 Te llevo a: ' + (nav.name || 'el archivo'), 'os')
  try { await chrome.tabs.create({ url: nav.url, active: true }) }
  catch { window.open(nav.url, '_blank') }
}

// ¿Hay una versión más nueva de la extensión publicada? (los unpacked no se auto-actualizan)
function isNewer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) > (pb[i] || 0)) return true; if ((pa[i] || 0) < (pb[i] || 0)) return false }
  return false
}
async function checkVersion() {
  const { addr } = await getCfg()
  try {
    const r = await fetch(`${addr}/version`, { signal: AbortSignal.timeout(4000) })
    const d = await r.json()
    const mine = chrome.runtime.getManifest().version
    if (d.version && isNewer(d.version, mine)) {
      addMsg(`🆕 Hay una versión nueva de la extensión (${d.version}, tenés la ${mine}). Bajala de ${DEFAULT_ADDR.replace('/api/os', '')}/echegaray-os-extension.zip y recargala en chrome://extensions para las últimas mejoras.`, 'os')
    }
  } catch { /* silencioso */ }
}

async function send() {
  let directive = $('input').value.trim()
  if (!directive && !attachments.length) return
  if (!directive && attachments.length) directive = attachments.length > 1 ? `Interpretá estas ${attachments.length} imágenes/archivos y decime qué son.` : 'Interpretá este archivo adjunto y decime qué es.'
  const { addr, token, email } = await getCfg()
  if (!token) { $('settings').classList.add('show'); addMsg('Primero pegá tu llave de acceso en configuración (⚙).', 'os'); return }
  $('input').value = ''
  if (!currentChatId) currentChatId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  const atts = attachments
  const attLabel = atts.length ? `\n📎 ${atts.length === 1 ? atts[0].name : atts.length + ' archivos'}` : ''
  addMsg(directive + attLabel, 'me')
  clearAttachment()
  const history = convo.slice(-16) // turnos previos (antes de agregar el actual)
  convo.push({ role: 'me', text: directive })
  const pending = addMsg('Pensando…', 'os')
  const fileId = await driveFileId()
  const t0 = Date.now()
  const runId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()
  const run = { runId, addr, token, pending, cancelled: false }
  activeRun = run
  setStopMode()
  // Indicador en vivo: mientras el OS trabaja, mostramos el paso actual (leyendo, preparando…).
  let polling = true
  ;(async () => {
    while (polling && !run.cancelled) {
      await new Promise((r) => setTimeout(r, 1000))
      if (!polling || run.cancelled) break
      try {
        const pr = await fetch(`${addr}/progress?id=${runId}`, { headers: { authorization: `Bearer ${token}` } })
        const pd = await pr.json()
        if (!polling) break
        const last = (pd.steps || []).slice(-1)[0]
        if (last) pending.textContent = `⏳ ${last}… (${Math.round((Date.now() - t0) / 1000)}s)`
      } catch { /* reintenta */ }
    }
  })()
  try {
    const r = await fetch(`${addr}/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
      body: JSON.stringify({ directive, fileId, attachments: atts, history, runId, wantsAsync: true, userEmail: email, extVersion: chrome.runtime.getManifest().version }),
    })
    let data = await r.json()
    if (!r.ok) throw new Error(data.error || `error ${r.status}`)
    // Tarea larga: el OS la sigue en segundo plano; esperamos el resultado por /result
    // (sin cortar por timeout). El indicador de progreso sigue mostrando los pasos.
    if (data.async && data.runId) {
      polling = false // de acá en más el progreso lo maneja waitResult (evita pisar la respuesta)
      pending.textContent = '⏳ Tarea larga: la estoy trabajando…'
      data = await waitResult(addr, token, data.runId, pending, t0, run)
      // AUTO-REINTENTO (una vez): si un reinicio perdió la tarea a mitad, la reintentamos
      // solos y transparente en vez de tirarle el error al dueño. La durabilidad server-side
      // ya cubre lo terminado; esto cubre el reinicio en plena ejecución. NO reintentar si el
      // usuario la detuvo.
      if (!run.cancelled && data && data.lost) {
        pending.textContent = '⏳ El servidor se reinició; lo reintento solo…'
        const rid2 = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()
        const r2 = await fetch(`${addr}/ask`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
          body: JSON.stringify({ directive, fileId, attachments: atts, history, runId: rid2, wantsAsync: true, userEmail: email, extVersion: chrome.runtime.getManifest().version }),
        })
        let d2 = await r2.json()
        if (r2.ok && d2.async && d2.runId) d2 = await waitResult(addr, token, d2.runId, pending, t0)
        data = d2
      }
      if (data && data.lost) throw new Error('Se perdió la tarea incluso tras reintentar. Probá de nuevo en un momento.')
      if (data.error) throw new Error(data.error)
    }
    pending.textContent = data.answer || '(sin respuesta)'
    convo.push({ role: 'os', text: data.answer || '' })
    const m = document.createElement('div'); m.className = 'meta'
    m.textContent = `${((Date.now() - t0) / 1000).toFixed(1)}s${att ? ' · leyó el adjunto' : fileId ? ' · leyó el archivo abierto' : ''}`
    pending.appendChild(m)
    if (data.navigate && data.navigate.url) openInTab(data.navigate)
  } catch (e) {
    pending.textContent = 'No pude conectar con el OS: ' + e.message
  } finally {
    polling = false
    if (activeRun === run) activeRun = null
    clearStopMode()
    $('chat').scrollTop = $('chat').scrollHeight
    loadPending() // una directiva puede haber dejado operaciones pendientes
    persistCurrent() // guarda la conversación para poder volver a ella
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
    // Aprobar solo ENCOLA la ejecución (el worker corre asíncrono). Seguimos el
    // desenlace real para avisar "aplicado" o "falló: motivo" — no fallar en silencio.
    if (action === 'approve') reportOutcome(id)
  } catch (e) {
    card.classList.remove('done')
    card.querySelectorAll('button').forEach((b) => (b.disabled = false))
    addMsg('No se pudo procesar la operación: ' + e.message, 'os')
  }
}

// Espera el resultado de una directiva larga (fallback asíncrono), mostrando el paso
// actual mientras tanto. Hasta ~6 min; el OS sigue trabajando aunque cierres el panel.
async function waitResult(addr, token, runId, pending, t0, run) {
  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    if (run && run.cancelled) return { done: true, answer: '⏹ Tarea detenida por vos.' }
    try {
      const pr = await fetch(`${addr}/progress?id=${runId}`, { headers: { authorization: `Bearer ${token}` } })
      const pd = await pr.json()
      const last = (pd.steps || []).slice(-1)[0]
      if (last) pending.textContent = `⏳ ${last}… (${Math.round((Date.now() - t0) / 1000)}s)`
    } catch { /* reintenta */ }
    try {
      const rr = await fetch(`${addr}/result?id=${runId}`, { headers: { authorization: `Bearer ${token}` } })
      const rd = await rr.json()
      if (rd.done) return rd
      if (rd.lost) return { lost: true }
    } catch { /* reintenta */ }
  }
  return { error: 'La tarea tardó demasiado. Probá pedirla más acotada (ej. una obra o una pestaña a la vez).' }
}

async function reportOutcome(id) {
  const { addr, token } = await getCfg()
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 1500))
    try {
      const r = await fetch(`${addr}/operation-status?id=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}` } })
      const op = await r.json()
      if (!r.ok) continue
      if (op.status === 'executed') { addMsg('✅ Aplicado en Drive.', 'os'); return }
      if (op.status === 'failed') { addMsg('❌ No se pudo aplicar: ' + (op.error || 'error desconocido'), 'os'); return }
    } catch { /* reintenta */ }
  }
  addMsg('⏳ La operación quedó aprobada; sigue procesándose. Revisá el archivo en un momento.', 'os')
}

// ---- Conversaciones persistentes (chrome.storage.local) ----

async function getChats() { const c = await chrome.storage.local.get('chats'); return Array.isArray(c.chats) ? c.chats : [] }

async function persistCurrent() {
  if (!currentChatId || !convo.length) return
  const chats = await getChats()
  const title = (convo.find((m) => m.role === 'me')?.text || 'Chat').slice(0, 48)
  const entry = { id: currentChatId, title, messages: convo.slice(-100), updated: Date.now() }
  const i = chats.findIndex((c) => c.id === currentChatId)
  if (i >= 0) chats[i] = entry; else chats.unshift(entry)
  await chrome.storage.local.set({ chats })
}

function newChat() {
  currentChatId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  convo = []
  $('chat').innerHTML = '<div class="hint" id="hint">Nuevo chat. Escribí una directiva, adjuntá o PEGÁ una imagen (Ctrl+V) o un PDF.</div>'
  $('chats').classList.remove('show')
  showView('chat')
}

function renderMessages(messages) {
  $('chat').innerHTML = ''
  for (const m of messages) addMsg(m.text, m.role === 'me' ? 'me' : 'os')
}

async function openChat(id) {
  const c = (await getChats()).find((x) => x.id === id)
  if (!c) return
  currentChatId = id
  convo = c.messages.slice()
  renderMessages(convo)
  $('chats').classList.remove('show')
  showView('chat')
}

async function deleteChat(id, ev) {
  ev?.stopPropagation()
  const chats = (await getChats()).filter((c) => c.id !== id)
  await chrome.storage.local.set({ chats })
  if (id === currentChatId) newChat()
  renderChatsList()
}

async function renderChatsList() {
  const chats = (await getChats()).sort((a, b) => b.updated - a.updated)
  const box = $('chatslist'); box.innerHTML = ''
  if (!chats.length) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = 'Sin conversaciones guardadas.'; box.appendChild(h); return }
  for (const c of chats) {
    const row = document.createElement('div'); row.className = 'chatrow' + (c.id === currentChatId ? ' active' : '')
    const ti = document.createElement('div'); ti.className = 'ti'; ti.textContent = c.title
    const del = document.createElement('span'); del.className = 'del'; del.textContent = '🗑'
    del.addEventListener('click', (e) => deleteChat(c.id, e))
    row.addEventListener('click', () => openChat(c.id))
    row.append(ti, del); box.appendChild(row)
  }
}

// ---- Adjuntar archivo (foto/PDF) ----

function clearAttachment() {
  attachments = []
  $('file').value = ''
  $('chip').classList.remove('show')
}

/** Reduce una imagen a máx `maxDim` px por lado y la codifica JPEG. Baja el peso muy
 *  por debajo del límite de Vercel (~4.5MB) y ahorra tokens, sin perder legibilidad. */
function downscaleImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      let { width: w, height: h } = img
      const scale = Math.min(1, maxDim / Math.max(w, h))
      w = Math.round(w * scale); h = Math.round(h * scale)
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(cv.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('no pude leer la imagen')) }
    img.src = url
  })
}

function readAsDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('no pude leer el archivo')); r.readAsDataURL(file) })
}

const MAX_ADJUNTOS = 10

/** Procesa UNA foto/PDF y la agrega a la lista de adjuntos (sin pisar los anteriores). */
async function addOneFile(file) {
  if (file.type.startsWith('image/')) {
    const dataUrl = await downscaleImage(file, 1600, 0.82)
    attachments.push({ media_type: 'image/jpeg', data: dataUrl.split(',')[1], name: file.name })
  } else if (file.type === 'application/pdf') {
    if (file.size > 3.5e6) throw new Error(`PDF muy grande (${file.name}, máx ~3.5MB). Sacale una foto a la hoja o mandá un PDF más chico.`)
    const dataUrl = await readAsDataURL(file)
    attachments.push({ media_type: 'application/pdf', data: String(dataUrl).split(',')[1], name: file.name })
  } else {
    throw new Error(`Formato no soportado (${file.name}). Adjuntá fotos (JPG/PNG) o un PDF.`)
  }
}

/** Recibe UNA o VARIAS fotos/PDF (del clip o del pegado) y las adjunta todas. */
async function onFilesPicked(fileList) {
  const files = Array.from(fileList || []).filter(Boolean)
  if (!files.length) return
  for (const file of files) {
    if (attachments.length >= MAX_ADJUNTOS) { addMsg(`Máximo ${MAX_ADJUNTOS} archivos por mensaje. Mandá el resto en otro.`, 'os'); break }
    try { await addOneFile(file) } catch (e) { addMsg(e.message, 'os') }
  }
  if (attachments.length) {
    $('chipname').textContent = attachments.length === 1 ? '📎 ' + attachments[0].name : `📎 ${attachments.length} archivos`
    $('chip').classList.add('show')
  }
}

// ---- Agenda (recurrencias) ----

const CAD_LABEL = {
  'daily:08:00': 'Todos los días 08:00', 'weekly:lun:09:00': 'Lunes 09:00',
  'weekly:vie:17:00': 'Viernes 17:00', 'monthly:01:09:00': 'Día 1 del mes 09:00',
}
function cadLabel(c) { return CAD_LABEL[c] || c }

async function loadSchedules() {
  const { addr, token } = await getCfg()
  if (!token) return
  let items = []
  try {
    const r = await fetch(`${addr}/schedules`, { headers: { authorization: `Bearer ${token}` } })
    const data = await r.json()
    items = Array.isArray(data.items) ? data.items : []
  } catch { return }
  const list = $('aglist'); list.innerHTML = ''
  if (!items.length) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = 'No hay tareas programadas todavía.'; list.appendChild(h); return }
  for (const s of items) {
    const card = document.createElement('div'); card.className = 'sch' + (s.enabled ? '' : ' off')
    const tog = document.createElement('span'); tog.className = 'tog'; tog.textContent = s.enabled ? 'pausar' : 'activar'
    tog.addEventListener('click', () => toggleSchedule(s.id, !s.enabled))
    const t = document.createElement('div'); t.className = 't'; t.textContent = s.title
    const c = document.createElement('div'); c.className = 'c'; c.textContent = cadLabel(s.cadence)
    card.append(tog, t, c)
    if (s.last_result) { const r = document.createElement('div'); r.className = 'r'; r.textContent = '↳ ' + s.last_result.slice(0, 300); card.appendChild(r) }
    list.appendChild(card)
  }
}

async function addSchedule() {
  const directive = $('agdir').value.trim()
  if (!directive) return
  const cadence = $('agcad').value
  const { addr, token } = await getCfg()
  $('agadd').disabled = true
  try {
    const r = await fetch(`${addr}/schedule`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ directive, cadence, title: directive }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || `error ${r.status}`)
    $('agdir').value = ''
    loadSchedules()
  } catch (e) { addMsg('No se pudo programar: ' + e.message, 'os') } finally { $('agadd').disabled = false }
}

async function toggleSchedule(id, enabled) {
  const { addr, token } = await getCfg()
  try {
    await fetch(`${addr}/schedule/toggle`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, enabled }),
    })
    loadSchedules()
  } catch { /* ignore */ }
}

const VIEWS = ['chat', 'pending', 'agenda']
function showView(view) {
  for (const v of VIEWS) {
    const el = $(v)
    if (v === 'chat') el.style.display = view === 'chat' ? 'flex' : 'none'
    else el.classList.toggle('show', view === v)
    $('tab' + v[0].toUpperCase() + v.slice(1)).classList.toggle('active', view === v)
  }
  document.querySelector('footer').style.display = view === 'chat' ? 'flex' : 'none'
  if (view === 'pending') loadPending()
  if (view === 'agenda') loadSchedules()
}

// eventos
$('send').addEventListener('click', () => { if (activeRun) stopRun(); else send() })
$('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!activeRun) send() } })
$('tabChat').addEventListener('click', () => showView('chat'))
$('tabPending').addEventListener('click', () => showView('pending'))
$('tabAgenda').addEventListener('click', () => showView('agenda'))
$('agadd').addEventListener('click', addSchedule)
$('attach').addEventListener('click', () => $('file').click())
$('file').addEventListener('change', (e) => onFilesPicked(e.target.files))
$('chipx').addEventListener('click', clearAttachment)
// PEGAR IMAGEN (Ctrl/Cmd+V): si el portapapeles tiene una imagen (captura de pantalla,
// foto copiada), la adjuntamos igual que si la hubieras elegido con el clip. El OS la ve,
// la interpreta y razona sobre ella. El pegado de texto normal sigue funcionando igual.
document.addEventListener('paste', (e) => {
  const items = (e.clipboardData && e.clipboardData.items) || []
  const imgs = []
  for (const it of items) {
    if (it.type && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) imgs.push(f) }
  }
  if (imgs.length) { e.preventDefault(); onFilesPicked(imgs) } // pegá varias capturas de una
})
$('gear').addEventListener('click', () => $('settings').classList.toggle('show'))
$('chatsBtn').addEventListener('click', () => { $('chats').classList.toggle('show'); if ($('chats').classList.contains('show')) renderChatsList() })
$('newchat').addEventListener('click', newChat)
$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ addr: $('addr').value.trim() || DEFAULT_ADDR, token: $('token').value.trim(), email: $('email').value.trim().toLowerCase() })
  $('settings').classList.remove('show')
  ping()
})
// Conectar con Google: pide al OS la URL de consentimiento y la abre en una pestaña.
$('gauth').addEventListener('click', async () => {
  const { addr, token } = await getCfg()
  $('gauthmsg').textContent = 'Abriendo autorización de Google…'
  try {
    const r = await fetch(`${addr}/oauth/start`, { headers: { authorization: `Bearer ${token}` } })
    const d = await r.json()
    if (d.url) { window.open(d.url, '_blank'); $('gauthmsg').textContent = 'Autorizá en la pestaña nueva. Después escribí tu email arriba y Guardá.' }
    else $('gauthmsg').textContent = d.error || 'no pude obtener el link de autorización.'
  } catch (e) { $('gauthmsg').textContent = 'error: ' + e.message }
})

;(async () => {
  const { addr, token, email } = await getCfg()
  $('addr').value = addr
  $('token').value = token
  $('email').value = email
  try { $('ver').textContent = 'v' + chrome.runtime.getManifest().version } catch { /* noop */ }
  ping()
  loadPending() // pobla el badge de pendientes al abrir
  checkVersion() // avisa si hay una versión más nueva publicada
})()
