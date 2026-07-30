/* Pantalla de asistencia — JS de navegador, sin framework y sin build.
 *
 * DECISIÓN DE PRODUCTO QUE EXPLICA TODO ESTE ARCHIVO: el caso normal es
 * "abrir → elegir obra → Registrar". Todos vienen presentes con la jornada del día; el
 * jefe sólo toca las EXCEPCIONES. Por eso el motivo, la aclaración y la obra realizada
 * están ocultos hasta que hacen falta, y por eso NO existe un campo de horas extra: se
 * escriben las horas trabajadas y el excedente sobre la jornada lo separa el servidor.
 *
 * Nada de lo que se ve acá está escrito a mano: obras, motivos y jornada salen de la API.
 */
(function () {
  'use strict'

  var doc = document
  var BASE = doc.body.dataset.base || '/asistencia'

  var estado = { fecha: null, obra: null, jornada: null, obras: [], motivos: [], filas: [], clave: null, enviando: false }

  var elFecha = doc.getElementById('fecha')
  var elObra = doc.getElementById('obra')
  var elLista = doc.getElementById('lista')
  var elAviso = doc.getElementById('aviso')
  var elJornada = doc.getElementById('jornada')
  var elResumen = doc.getElementById('resumen')
  var elBoton = doc.getElementById('registrar')
  var tpl = doc.getElementById('tplFila')

  var q = function (raiz, sel) { return raiz.querySelector(sel) }
  var redondear = function (x) { return Math.round(Number(x) * 1000) / 1000 }
  var numero = function (v) {
    var n = parseFloat(String(v == null ? '' : v).replace(',', '.'))
    return isFinite(n) ? redondear(n) : null
  }
  var nuevaClave = function () {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID()
    return String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10)
  }
  var jornadaHoras = function () {
    return estado.jornada && !estado.jornada.requiere_manual ? estado.jornada.horas : null
  }

  function avisar(texto, clase) {
    elAviso.hidden = !texto
    elAviso.textContent = texto || ''
    elAviso.className = 'aviso' + (clase ? ' ' + clase : '')
  }

  async function pedir(ruta, opciones) {
    var r = await fetch(BASE + ruta, Object.assign({ credentials: 'same-origin' }, opciones || {}))
    var datos = {}
    try { datos = await r.json() } catch { datos = {} }
    if (r.status === 401) { window.location.href = BASE; throw new Error('sesión vencida') }
    datos.__status = r.status
    return datos
  }

  /* ── contexto: fecha, jornada, obras y catálogo de motivos ───────────────── */

  async function cargarContexto() {
    avisar('')
    elLista.textContent = ''
    elResumen.hidden = true
    elBoton.disabled = true
    var d = await pedir('/api/contexto?fecha=' + encodeURIComponent(estado.fecha || ''))
    if (d.error) { elObra.innerHTML = ''; avisar(d.error, 'error'); return }
    estado.fecha = d.fecha
    estado.jornada = d.jornada
    estado.obras = d.obras || []
    estado.motivos = d.motivos || []
    elFecha.value = d.fecha
    elFecha.max = d.hoy
    elJornada.textContent = textoJornada(d.jornada)
    pintarObras()
    if (estado.obras.length === 1) { elObra.value = estado.obras[0].clave; await cargarCuadrilla() }
  }

  function textoJornada(j) {
    if (!j) return ''
    if (j.etiqueta) return j.etiqueta + (j.horas != null ? ' · ' + j.horas + ' h' : '')
    if (j.horas == null) return 'Sin jornada de referencia: cargá las horas a mano'
    return 'Jornada del día: ' + j.horas + ' h'
  }

  function pintarObras() {
    elObra.innerHTML = ''
    elObra.appendChild(opcion('', estado.obras.length ? 'Elegí la obra' : 'Sin obras ese día'))
    estado.obras.forEach(function (o) {
      elObra.appendChild(opcion(o.clave, o.nombre + ' · ' + o.cantidad))
    })
  }

  function opcion(valor, texto) {
    var o = doc.createElement('option')
    o.value = valor
    o.textContent = texto
    return o
  }

  /* ── cuadrilla ───────────────────────────────────────────────────────────── */

  async function cargarCuadrilla() {
    estado.obra = elObra.value || null
    estado.clave = nuevaClave()
    estado.filas = []
    elLista.textContent = ''
    elResumen.hidden = true
    elBoton.disabled = true
    if (!estado.obra) { avisar(''); return }
    avisar('')
    var d = await pedir('/api/cuadrilla?fecha=' + encodeURIComponent(estado.fecha) + '&obra=' + encodeURIComponent(estado.obra))
    if (d.error) { avisar(d.error, 'error'); return }
    estado.jornada = d.jornada
    elJornada.textContent = textoJornada(d.jornada)
    ;(d.personal || []).forEach(agregarFila)
    elBoton.disabled = estado.filas.length === 0
    elResumen.hidden = estado.filas.length === 0
    recalcular()
  }

  function agregarFila(p) {
    var nodo = tpl.content.firstElementChild.cloneNode(true)
    var f = { persona: p, nodo: nodo, tocado: false, abierto: false, motivosDe: null }
    nodo.dataset.ref = p.ref
    q(nodo, '.nombre').textContent = p.nombre + (p.categoria ? ' · ' + p.categoria : '')
    q(nodo, '.presente').checked = p.presente === true
    q(nodo, '.hs').value = p.horas == null ? '' : p.horas
    pintarObraRealizada(nodo)
    if (p.bloqueado) {
      q(nodo, '.presente').disabled = true
      q(nodo, '.hs').disabled = true
      q(nodo, '.mas').disabled = true
      nodo.classList.add('bloqueada')
    }
    nodo.addEventListener('change', function (ev) { tocar(f, ev) })
    nodo.addEventListener('input', function (ev) { tocar(f, ev) })
    q(nodo, '.mas').addEventListener('click', function () { f.abierto = !f.abierto; sincronizar(f); })
    estado.filas.push(f)
    elLista.appendChild(nodo)
    sincronizar(f)
  }

  function tocar(f, ev) {
    if (ev && ev.target && ev.target.classList.contains('mas')) return
    f.tocado = true
    sincronizar(f)
    recalcular()
  }

  function pintarObraRealizada(nodo) {
    var sel = q(nodo, '.obra-realizada')
    sel.innerHTML = ''
    sel.appendChild(opcion('', 'La misma'))
    estado.obras.forEach(function (o) {
      if (o.clave !== estado.obra) sel.appendChild(opcion(o.clave, o.nombre))
    })
  }

  /* ── una fila: qué se muestra y qué se esconde ───────────────────────────── */

  function sincronizar(f) {
    var nodo = f.nodo
    var p = f.persona
    var chk = q(nodo, '.presente')
    var hs = q(nodo, '.hs')
    var jn = jornadaHoras()
    var presente = chk.checked
    if (!presente && !p.bloqueado) hs.value = '0'
    hs.disabled = !presente || Boolean(p.bloqueado)
    var horas = presente ? (numero(hs.value) || 0) : 0
    var faltan = presente && jn != null && horas < jn
    var necesitaMotivo = !p.bloqueado && (!presente || faltan)
    var extra = jn != null && horas > jn ? redondear(horas - jn) : 0

    pintarMotivos(f, presente)
    var campoMotivo = q(nodo, '.motivo-campo')
    campoMotivo.hidden = !necesitaMotivo
    var motivo = elegido(f)
    var campoAcl = q(nodo, '.aclaracion-campo')
    campoAcl.hidden = !(necesitaMotivo && motivo && motivo.requiere_aclaracion)
    // "Trabajó en otra obra" sólo tiene sentido si TRABAJÓ. Ofrecérselo a un ausente es
    // ofrecer un campo que el núcleo rechaza siempre ("si no trabajó, no corresponde indicar
    // en qué obra estuvo"): el jefe lo completa y recién ahí se entera de que no iba.
    q(nodo, '.obra-campo').hidden = !presente || horas <= 0
    q(nodo, '.detalle').hidden = p.bloqueado || !(necesitaMotivo || f.abierto)
    q(nodo, '.mas').setAttribute('aria-expanded', String(!q(nodo, '.detalle').hidden))
    nodo.classList.toggle('excepcion', !p.bloqueado && (necesitaMotivo || extra > 0))

    chip(nodo, '.previo', p.ya_cargado ? 'Ya cargado: ' + p.carga_actual : '')
    chip(nodo, '.extra', extra > 0 ? '+' + extra + ' h extra' : '')
    chip(nodo, '.alerta', p.bloqueado || p.revisar || '')
  }

  function chip(nodo, sel, texto) {
    var el = q(nodo, sel)
    el.hidden = !texto
    el.textContent = texto || ''
  }

  /* Los motivos aplicables salen del catálogo del servidor: acá sólo se filtra por el
     campo que el propio catálogo declara. No hay una lista escrita en el navegador. */
  function pintarMotivos(f, presente) {
    var clave = presente ? 'presente' : 'ausente'
    if (f.motivosDe === clave) return
    f.motivosDe = clave
    var sel = q(f.nodo, '.motivo')
    var previo = sel.value
    sel.innerHTML = ''
    sel.appendChild(opcion('', 'Elegí el motivo'))
    estado.motivos
      .filter(function (m) { return presente ? m.implica_horas_cero !== true : m.implica_horas_cero !== false })
      .forEach(function (m) { sel.appendChild(opcion(m.clave, m.etiqueta || m.clave)) })
    var inicial = previo || f.persona.motivo || ''
    if (inicial) sel.value = inicial
  }

  function elegido(f) {
    var v = q(f.nodo, '.motivo').value
    if (!v) return null
    for (var i = 0; i < estado.motivos.length; i++) if (estado.motivos[i].clave === v) return estado.motivos[i]
    return null
  }

  /* ── resumen ─────────────────────────────────────────────────────────────── */

  function recalcular() {
    var jn = jornadaHoras()
    var pres = 0, aus = 0, horas = 0, extra = 0
    estado.filas.forEach(function (f) {
      if (f.persona.bloqueado) return
      var p = q(f.nodo, '.presente').checked
      var h = p ? (numero(q(f.nodo, '.hs').value) || 0) : 0
      if (p) { pres++; horas += h; if (jn != null && h > jn) extra += h - jn } else { aus++ }
    })
    doc.getElementById('rPresentes').textContent = pres
    doc.getElementById('rAusentes').textContent = aus
    doc.getElementById('rHoras').textContent = redondear(horas)
    doc.getElementById('rExtra').textContent = redondear(extra)
    doc.getElementById('rExtraCaja').hidden = extra <= 0
  }

  /* ── registrar ───────────────────────────────────────────────────────────── */

  function armarItems() {
    return estado.filas.map(function (f) {
      var p = f.persona
      if (p.bloqueado || (p.sin_cambio && !f.tocado)) return { ref: p.ref, nombre: p.nombre, sin_cambio: true }
      var presente = q(f.nodo, '.presente').checked
      var visibleMotivo = !q(f.nodo, '.motivo-campo').hidden
      var visibleAcl = !q(f.nodo, '.aclaracion-campo').hidden
      var visibleObra = !q(f.nodo, '.obra-campo').hidden
      return {
        ref: p.ref,
        nombre: p.nombre,
        presente: presente,
        horas: presente ? numero(q(f.nodo, '.hs').value) : 0,
        motivo: visibleMotivo ? (q(f.nodo, '.motivo').value || null) : null,
        aclaracion: visibleAcl ? (q(f.nodo, '.aclaracion').value.trim() || null) : null,
        // Igual que motivo y aclaración: un campo OCULTO no manda su valor viejo. Si el jefe
        // eligió otra obra y después lo marcó ausente, ese valor ya no corresponde.
        obra_realizada: visibleObra ? (q(f.nodo, '.obra-realizada').value || null) : null,
      }
    })
  }

  async function enviar(cuerpo) {
    return pedir('/api/registrar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
  }

  async function registrar() {
    if (estado.enviando || !estado.obra) return
    estado.enviando = true
    elBoton.disabled = true
    avisar('Registrando…')
    try {
      var cuerpo = { fecha: estado.fecha, obra: estado.obra, idempotency_key: estado.clave, items: armarItems() }
      var d = await enviar(cuerpo)
      for (var vuelta = 0; vuelta < 2 && d.requiere_confirmacion; vuelta++) {
        if (!window.confirm(d.error)) { avisar('No se registró nada.'); return }
        cuerpo[d.requiere_confirmacion === 'sobrescritura' ? 'confirmar_sobrescritura' : 'confirmar_formula'] = true
        d = await enviar(cuerpo)
      }
      if (d.error) { avisar(d.error, 'error'); return }
      var n = (d.celdas || []).length
      var listo = d.nota ? d.nota : 'Listo: ' + n + (n === 1 ? ' carga registrada' : ' cargas registradas') + ' en la planilla.'
      estado.clave = nuevaClave()
      // El aviso va DESPUÉS de recargar, no antes: `cargarCuadrilla` arranca limpiando la
      // pantalla, así que un "Listo" puesto acá arriba se borraba solo a los milisegundos.
      // El jefe apretaba Registrar, no veía nada, y lo lógico era apretar de nuevo.
      await cargarCuadrilla()
      avisar(listo, 'ok')
    } catch {
      avisar('No se pudo registrar. Probá de nuevo en unos segundos.', 'error')
    } finally {
      estado.enviando = false
      elBoton.disabled = estado.filas.length === 0
    }
  }

  /* ── arranque ────────────────────────────────────────────────────────────── */

  elFecha.addEventListener('change', function () {
    estado.fecha = elFecha.value || null
    estado.obra = null
    cargarContexto().catch(function () { avisar('No se pudo leer la planilla.', 'error') })
  })
  elObra.addEventListener('change', function () {
    cargarCuadrilla().catch(function () { avisar('No se pudo leer la cuadrilla.', 'error') })
  })
  elBoton.addEventListener('click', registrar)

  cargarContexto().catch(function () { avisar('No se pudo abrir la pantalla. Volvé a pedir el enlace.', 'error') })
})()
