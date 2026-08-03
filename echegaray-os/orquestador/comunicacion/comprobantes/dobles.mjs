// DOBLES DE PRUEBA de la carga de comprobantes.
//
// Un repositorio en memoria con la MISMA interfaz que `repositorio.mjs` y las MISMAS garantías que
// importan: un solo fajo abierto por (persona, canal), `tomarParaConfirmar` como compare-and-set y
// `clave` única en lo cargado. Un doble que no reprodujera esas tres cosas dejaría pasar en verde
// justo los defectos que hay que impedir.
//
// Vive en un `.mjs` y no en un `.test.mjs` a propósito: lo comparten varios archivos de prueba.

import { ESTADO } from '../../lib/comprobantes/fajo.mjs'

/** Repositorio en memoria. `fallarEn('reservarClaves')` simula una base que se cae. */
export function repoMemoria() {
  const fajos = new Map()
  const cargados = new Map() // clave → fila
  let seq = 0
  let esquema = true
  let falla = null

  const api = {
    _fajos: fajos,
    _cargados: cargados,
    // RELOJ INYECTABLE. En la tabla real los timestamps los pone `now()` de Postgres; acá los pone
    // el test. Sin esto, la ventana de agrupación se mediría contra el reloj de la máquina y el
    // test de "dos posts seguidos" pasaría o fallaría según la hora a la que se corriera.
    _ahora: new Date(),
    en(fecha) { api._ahora = new Date(fecha); return api },
    sinEsquema() { esquema = false; return api },
    fallarEn(metodo) { falla = metodo; return api },
    _chequear(m) { if (falla === m) throw new Error(`falla simulada en ${m}`) },

    async tablasListas() { return esquema },

    async fajoAbierto(_p, { plataforma = 'mattermost', userId, channelId } = {}) {
      for (const f of fajos.values()) {
        if (f.estado === ESTADO.ABIERTO && f.plataforma === plataforma
          && f.plataforma_user_id === userId && f.channel_id === channelId) return { ...f }
      }
      return null
    },

    async fajoPorId(_p, id) { return fajos.has(id) ? { ...fajos.get(id) } : null },

    async abrirFajo(_p, { plataforma = 'mattermost', userId, username, channelId, rootPostId, postId, items = [] } = {}) {
      api._chequear('abrirFajo')
      // El índice único parcial de la migración: si ya hay uno abierto, se devuelve ese.
      const ya = await api.fajoAbierto(_p, { plataforma, userId, channelId })
      if (ya) return ya
      const id = `fajo_${++seq}`
      const f = {
        id, plataforma, plataforma_user_id: userId, plataforma_username: username ?? null,
        channel_id: channelId, root_post_id: rootPostId ?? null, aviso_post_id: null,
        post_ids: postId ? [postId] : [], items, estado: ESTADO.ABIERTO,
        creado_at: api._ahora, ultimo_at: api._ahora,
      }
      fajos.set(id, f)
      return { ...f }
    },

    async agregarAlFajo(_p, { id, items, postId } = {}) {
      const f = fajos.get(id)
      if (!f || f.estado !== ESTADO.ABIERTO) return null
      f.items = items
      if (postId && !f.post_ids.includes(postId)) f.post_ids.push(postId)
      f.ultimo_at = api._ahora
      return { ...f }
    },

    async guardarItems(_p, { id, items } = {}) {
      const f = fajos.get(id)
      if (!f || f.estado !== ESTADO.ABIERTO) return null
      f.items = items
      return { ...f }
    },

    async guardarAvisoPost(_p, { id, avisoPostId } = {}) {
      const f = fajos.get(id)
      if (!f) return null
      f.aviso_post_id = avisoPostId
      return { ...f }
    },

    /** COMPARE-AND-SET: el segundo click no encuentra nada que tomar. */
    async tomarParaConfirmar(_p, { id } = {}) {
      const f = fajos.get(id)
      if (!f || f.estado !== ESTADO.ABIERTO) return null
      f.estado = ESTADO.CONFIRMADO
      return { ...f }
    },

    async cerrarFajo(_p, { id, estado, filas = null, error = null } = {}) {
      const f = fajos.get(id)
      if (!f) return null
      Object.assign(f, { estado, filas, error, cerrado_at: new Date() })
      return { ...f }
    },

    async reabrirFajo(_p, { id, error = null } = {}) {
      const f = fajos.get(id)
      if (!f || f.estado !== ESTADO.CONFIRMADO) return null
      Object.assign(f, { estado: ESTADO.ABIERTO, error })
      return { ...f }
    },

    async yaCargados(_p, claves = []) {
      const m = new Map()
      for (const k of claves) if (k && cargados.has(k)) m.set(k, cargados.get(k))
      return m
    },

    async registrarCargados(_p, filas = []) {
      api._chequear('registrarCargados')
      const out = []
      for (const f of filas) {
        if (!f?.clave || cargados.has(f.clave)) continue
        cargados.set(f.clave, { clave: f.clave, fila: f.fila ?? null, hoja: f.hoja ?? 'Compras', post_id: f.postId ?? null, creado_at: new Date() })
        out.push(f.clave)
      }
      return out
    },

    async reservarClaves(_p, filas = []) {
      api._chequear('reservarClaves')
      return api.registrarCargados(_p, filas.map((f) => ({ ...f, fila: null })))
    },

    async anotarFilas(_p, filas = []) {
      for (const f of filas) {
        const c = cargados.get(f?.clave)
        if (c && c.fila == null) { c.fila = f.fila; c.hoja = f.hoja ?? 'Compras' }
      }
    },

    async soltarReservas(_p, claves = []) {
      let n = 0
      for (const k of claves) {
        const c = cargados.get(k)
        if (c && c.fila == null) { cargados.delete(k); n++ }
      }
      return n
    },
  }
  return api
}

/**
 * `port` de mentira para la GUARDA. Contesta las dos consultas que hace: el binding del canal y el
 * grant del permiso. Todo lo demás devuelve vacío.
 */
export function portGuarda({ canalOk = true, permisoOk = true, canal = 'comprobantes-gastos', explota = false } = {}) {
  return {
    async query(sql) {
      if (explota) throw new Error('base caída (simulado)')
      if (/canales_area/.test(sql)) return { rows: canalOk ? [{ canal_nombre: canal, area_clave: 'compras' }] : [] }
      if (/permisos_skill/.test(sql)) return { rows: permisoOk ? [{ display: 'Rodrigo' }] : [] }
      return { rows: [] }
    },
  }
}

/** Cliente de Mattermost de mentira, con adjuntos. */
export function mmFalso({ archivos = {} } = {}) {
  const posts = []
  const dialogos = []
  let seq = 0
  return {
    posts,
    dialogos,
    async archivoInfo(id) {
      const a = archivos[id]
      if (!a) { const e = new Error('404'); e.status = 404; throw e }
      return { id, name: a.name ?? id, mime_type: a.mime ?? 'image/jpeg', size: a.size ?? 1000 }
    },
    async archivo(id) {
      const a = archivos[id]
      if (!a) { const e = new Error('404'); e.status = 404; throw e }
      return Buffer.from(a.data ?? 'bytes')
    },
    async crearPost(p) { const post = { id: `post_${++seq}`, ...p }; posts.push(post); return post },
    async actualizarPost({ id, message, props }) {
      const p = posts.find((x) => x.id === id) ?? { id }
      Object.assign(p, { message, props })
      if (!posts.includes(p)) posts.push(p)
      return p
    },
    async abrirDialogo(d) { dialogos.push(d); return { ok: true } },
  }
}

/** El comprobante crudo que "leería" el modelo. Es una factura real de esta empresa. */
export function lecturaBarcelo(over = {}) {
  return {
    emisor: 'COMBUSTIBLES BARCELO S.A.',
    cuit: '30-71234567-8',
    letra: 'A',
    es_nota_credito: false,
    numero: '0113-00010489',
    fecha: '05/01/2026',
    neto_gravado: '28.479,30',
    iva_21: '5.981,00',
    iva_105: '0',
    otros_tributos: '2.000,00',
    total: '36.460,30',
    condicion_venta: 'Contado',
    forma_pago: 'Efectivo',
    concepto: 'Gasoil autoelevador',
    anotacion_manuscrita: 'Estrella',
    legible: true,
    dudas: [],
    ...over,
  }
}

export const LISTAS = Object.freeze({
  ok: true,
  proveedores: ['Combustibles Barcelo', 'ACEROLATINA', 'Cemento SA'],
  obras: ['Estrella', 'San Francisco', 'Messina'],
})
