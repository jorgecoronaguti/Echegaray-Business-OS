// LOS DOBLES DEL MÓDULO DE ARCHIVOS — un Mattermost falso, un repositorio en memoria y un port.
//
// Viven en su propio archivo (y no adentro de cada test) por la razón que ya documentó el módulo de
// comprobantes: cuando cada test se arma su propio doble, los dobles se separan, y termina habiendo
// tres versiones de "cómo se comporta Mattermost" que no coinciden entre sí. Acá hay una sola.
//
// ═══ EL FAKE MATTERMOST ES DELIBERADAMENTE MAL EDUCADO ═══
//
// Puede fallar a pedido (`fallaEn`), puede devolver una metadata que MIENTE sobre el tipo del archivo
// —que es lo que hace el Mattermost real cuando alguien renombra un CSV a .xls— y puede tener un
// tamaño declarado distinto de los bytes que entrega. Un doble amable prueba el camino feliz y nada
// más, y el camino feliz nunca fue el problema.

/**
 * Cliente de Mattermost de mentira.
 * @param {Record<string, {nombre?:string, mime?:string, bytes?:Buffer, tamano?:number}>} archivos
 * @param {{fallaEn?:string[]}} [opts]  ids que fallan al bajarse
 */
export function mattermostFalso(archivos = {}, { fallaEn = [], fallaInfo = [] } = {}) {
  const publicados = []
  const actualizados = []
  return {
    publicados,
    actualizados,
    async archivoInfo(fileId) {
      if (fallaInfo.includes(fileId)) throw new Error('mattermost GET /files/info → 500')
      const a = archivos[fileId]
      if (!a) throw new Error(`mattermost GET /files/${fileId}/info → 404`)
      return {
        name: a.nombre ?? fileId,
        mime_type: a.mime ?? 'application/octet-stream',
        size: a.tamano ?? (a.bytes?.length ?? 0),
      }
    },
    async archivo(fileId) {
      if (fallaEn.includes(fileId)) throw new Error('mattermost GET /files → 502')
      const a = archivos[fileId]
      if (!a) throw new Error(`mattermost GET /files/${fileId} → 404`)
      return a.bytes ?? Buffer.alloc(0)
    },
    async crearPost(p) { publicados.push(p); return { id: `post-${publicados.length}` } },
    async actualizarPost(p) { actualizados.push(p); return { id: p.id } },
    async miembroDeCanal() { return true },
  }
}

/** Repositorio en memoria con la MISMA superficie que el real, incluido el compare-and-set. */
export function repoMemoria({ tablas = true } = {}) {
  const filas = new Map()
  let n = 0
  return {
    filas,
    async tablasListas() { return tablas },
    async registrar(_port, d) {
      // La idempotencia del real: (plataforma, comm_event_id, file_id) cuando el evento no es nulo.
      if (d.commEventId) {
        for (const f of filas.values()) {
          if (f.comm_event_id === d.commEventId && f.file_id === d.fileId) return f
        }
      }
      const id = `arch-${++n}`
      const fila = {
        id,
        plataforma: 'mattermost',
        plataforma_user_id: d.userId ?? null,
        channel_id: d.channelId ?? null,
        root_post_id: d.rootPostId ?? null,
        post_id: d.postId ?? null,
        comm_event_id: d.commEventId ?? null,
        file_id: d.fileId,
        nombre: d.nombre ?? null,
        familia: d.familia ?? null,
        formato: d.formato ?? null,
        mime_declarado: d.mimeDeclarado ?? null,
        tamano: d.tamano ?? null,
        destino: d.destino ?? null,
        propuesta: d.propuesta ?? null,
        estado: d.estado ?? 'recibido',
        resultado: null,
        error: null,
      }
      filas.set(id, fila)
      return fila
    },
    async porId(_port, id) { return filas.get(id) ?? null },
    async tomarParaImportar(_port, id) {
      const f = filas.get(id)
      if (!f || f.estado !== 'propuesto') return null
      f.estado = 'importando'
      return f
    },
    async cerrar(_port, id, { estado, resultado = null, error = null } = {}) {
      const f = filas.get(id)
      if (!f) return null
      Object.assign(f, { estado, resultado, error })
      return f
    },
    async devolver(_port, id, error = null) {
      const f = filas.get(id)
      if (!f || f.estado !== 'importando') return null
      Object.assign(f, { estado: 'propuesto', error })
      return f
    },
  }
}

/**
 * Port que contesta lo mínimo para que la guarda diga que sí.
 *
 * Las dos consultas que importan son las REALES: el binding del canal
 * (`comunicacion.canales_area`, con `area_clave` en el WHERE) y el grant
 * (`comunicacion.permisos_skill`). Todo lo demás devuelve vacío — un port que contesta a todo
 * escondería una consulta nueva que nadie cableó.
 */
export function portGuarda({ area = 'administracion_finanzas', canal = 'c1', permiso = true } = {}) {
  return {
    async query(sql, params = []) {
      if (/canales_area/.test(sql)) {
        const pideCanal = params[1]
        const pideArea = params[2]
        return pideCanal === canal && pideArea === area
          ? { rows: [{ canal_nombre: 'admin-finanzas', area_clave: area }] }
          : { rows: [] }
      }
      if (/permisos_skill/.test(sql)) return { rows: permiso ? [{ display: 'Jorge' }] : [] }
      return { rows: [] }
    },
  }
}

/** Port que SIEMPRE explota. Sirve para verificar que la guarda falla cerrado. */
export function portCaido() {
  return { async query() { throw new Error('base caída') } }
}
