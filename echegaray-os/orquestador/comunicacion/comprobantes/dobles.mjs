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

    async olvidarCargados(_p, claves = []) {
      let n = 0
      for (const k of claves) if (cargados.delete(k)) n++
      return n
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

/**
 * Cliente de Mattermost de mentira, con adjuntos.
 *
 * `miembros` es el mapa canal → [usuarios] de la SEGUNDA vía del permiso, y arranca VACÍO: el doble
 * niega por defecto, igual que el servidor real ante alguien que no está en el canal. Un doble
 * complaciente acá haría pasar por bueno justo el control que decide quién puede tocar la plata.
 *
 * `usuarios` (id → usuario de Mattermost) arranca vacío por el mismo motivo: un id que el test no
 * declaró NO existe, igual que en el servidor real, y `usuariosRoto` simula el Mattermost que no
 * contesta — el caso en el que la reconciliación de identidades tiene que fallar cerrada.
 */
export function mmFalso({ archivos = {}, miembros = {}, miembrosRoto = false, usuarios = {}, usuariosRoto = false } = {}) {
  const posts = []
  const dialogos = []
  let seq = 0
  return {
    posts,
    dialogos,
    async miembroDeCanal({ channel_id, user_id }) {
      // Igual que el cliente real: TIRA cuando no puede contestar, para que quien llama pueda
      // distinguir «no es miembro» de «no pude preguntarlo» y fallar cerrado en el segundo.
      if (miembrosRoto) throw new Error('mattermost caído (simulado)')
      return (miembros[channel_id] ?? []).includes(user_id)
    },
    async usuario(id) {
      // Igual que el cliente real: TIRA cuando no puede contestar y devuelve `null` sólo cuando
      // Mattermost dice que ese usuario no existe. Las dos respuestas significan cosas opuestas.
      if (usuariosRoto) { const e = new Error('mattermost caído (simulado)'); e.status = 503; throw e }
      return usuarios[String(id)] ?? null
    },
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
  // LOS VALORES REALES DE LA COLUMNA B, leídos del Sheet vivo el 13/08 (`Compras!B4:B12`). No es un
  // rubro: es BLANCO o NEGRO. El doble decía `['Materiales', 'Varios']` y por eso los tests dejaban
  // pasar un prompt que le preguntaba al modelo «qué se compró» ofreciéndole `B` y `N`.
  categorias: ['B', 'N'],
})

// ═══ EL CASO REAL DEL 03/08 — no es un ejemplo inventado ═══
//
// El dueño mandó al canal la foto de esta factura (IMG_7530.jpg). Todo lo de abajo está medido:
// lo que la visión leyó de verdad, las dos filas que ARCA tiene de ese proveedor ese día, y la fila
// de Compras donde el comprobante YA estaba cargado por Claude Code.

/** Lo que la visión leyó, TEXTUAL, de la foto que falló. El número tiene un dígito de más. */
export function lecturaCorralonReal(over = {}) {
  return {
    emisor: 'Néstor Rubén Corralón Progreso',
    cuit: null,                 // la foto trae dos CUIT y el modelo no eligió ninguno
    letra: 'A',
    es_nota_credito: false,
    numero: '0004-00036542',    // el real es 0004-00003642: un dígito de más
    cae: null,
    fecha: '30/07/2026',
    neto_gravado: '62.000,00',  // copió el total en el lugar del neto
    iva_21: '10.760,33',
    iva_105: '0',
    otros_tributos: '0',
    total: '62.000,00',
    condicion_venta: 'Contado',
    forma_pago: null,
    concepto: 'Materiales de construcción',
    anotacion_manuscrita: null, // NO vio "Messinas BSA", que es la obra
    legible: false,
    dudas: [],
    ...over,
  }
}

/**
 * Las dos filas que ARCA tiene de Corralón Progreso el 30/07/2026. Son reales y son distintas:
 * la segunda es el negativo del test de duplicados —mismo proveedor, mismo día, otro comprobante—.
 * Corralón factura como PEREZ GARCIA MARISOL BIBIANA: el nombre de fantasía no está en el padrón.
 */
export const ARCA_CORRALON = Object.freeze([
  Object.freeze({
    emisor_cuit: '23369111574', emisor_nombre: 'PEREZ GARCIA MARISOL BIBIANA',
    punto_venta: '4', numero: '3642', cae: '86316017919602', fecha_emision: '2026-07-30',
    tipo_comprobante: '1', imp_total: 62000, total_iva: 10760.33, neto_gravado: 51239.67,
  }),
  Object.freeze({
    emisor_cuit: '23369111574', emisor_nombre: 'PEREZ GARCIA MARISOL BIBIANA',
    punto_venta: '6', numero: '3366', cae: '86316052354343', fecha_emision: '2026-07-30',
    tipo_comprobante: '1', imp_total: 31533.9, total_iva: 5355.02, neto_gravado: 26178.88,
  }),
])

/**
 * El desplegable de obras de la columna J, tal como está en Compras.
 *
 * NO trae los detalles de la columna K a propósito: K no tiene desplegable, y su vocabulario sale de
 * las filas VIVAS de la pestaña. Ponerlo acá haría creer que hay una lista que no existe.
 */
export const LISTAS_COMPRAS = Object.freeze({
  ok: true,
  proveedores: ['Corralon Progreso', 'Ductos San Juan SRL', 'Combustibles Barcelo'],
  // «Taller» y «TALLER» están LAS DOS en el desplegable vivo de la columna J. Es la repetición que
  // dejaba sin imputar la anotación «Taller» (fila 840); el doble tiene que traerla.
  obras: ['Administracion', 'ARCOR', 'LA ESTRELLA', 'MESSINA', 'San Francisco', 'Taller', 'TALLER'],
  categorias: ['B', 'N'],
})

/** Una fila de Compras en el rango C4:O. */
// El rango leído arranca en la columna B (Categoría), no en la C: la posición 0 es B. Ver `RANGO` en
// `compras-vivas.mjs` — la categoría se sumó el 04/08 porque toda fila que cargó el bot quedó sin ella.
export const filaCompras = (fecha, prov, tipo, numero, obra, detalle, concepto, total, categoria = '') =>
  [categoria, fecha, '', prov, '', tipo, numero, '', obra, detalle, concepto, '', '', total]

/** Las filas de Compras con las que se prueba el duplicado. La primera con datos es la 802. */
export function filasCompras(over = []) {
  return [
    // Relleno para que la primera fila con datos caiga en la 802 del Sheet: el rango empieza en la 4.
    ...Array.from({ length: 798 }, () => []),
    filaCompras('30/7/2026', 'Corralon Progreso', 'F A', '0004-00003642', 'MESSINA', 'Planta de BSA', 'Cemento Loma Negra x 25 kg', '$ 62.000,00'),
    filaCompras('30/7/2026', 'Corralon Progreso', 'F A', '0006-00003366', 'LA ESTRELLA', 'Sanitarios', 'Flexible PVC', '$ 31.533,90'),
    ...over,
  ]
}

// ═══ EL TIQUE DE COMBUSTIBLE (03/08) — el caso que el bot no vio ═══
//
// Compras fila 800: Combustibles Barcelo · F A · 00113-00014219 · MESSINA · Camion - BSA ·
// $64.006,07. El dueño mandó la foto de ESE tique y el bot se ofreció a cargarlo de nuevo.
//
// Dos detalles del tique que importan y no son adorno:
//   · la visión NO sacó la letra ("TIQUE FACTURA A" no es "FACTURA A"): `letra` viene vacía, y el
//     mensaje real decía "comprobante 00113-…" en vez de "F A 00113-…". Con el tipo en null se caía
//     la única pasada de duplicado que existía.
//   · escrito a mano arriba dice "Camion BSA - Messina": trae la OBRA (col J) y el DETALLE (col K)
//     en el mismo renglón. Son dos datos, no uno.

/** La lectura del tique de Combustibles Barcelo, tal como la devolvió el modelo de visión. */
export function lecturaTiqueBarcelo(over = {}) {
  return {
    emisor: 'Combustibles Barcelo',
    cuit: '30709123453',
    letra: '', // un tique no siempre deja leer la letra
    numero: '00113-00014219',
    fecha: '31/07/2026',
    neto_gravado: '45.516,02',
    iva_21: '9.558,36',
    otros_tributos: '8.931,69',
    total: '64.006,07',
    condicion_venta: 'Contado',
    concepto: 'Nafta Super 1 y Diesel 500',
    anotacion_manuscrita: 'Camion BSA - Messina',
    legible: true,
    dudas: [],
    ...over,
  }
}

/**
 * Compras con el tique YA cargado en la 800 y la historia de imputación de ese proveedor.
 *
 * Las filas 801..805 son las que le dan evidencia FUERTE al aprendizaje (n≥5 y ≥80% en un mismo
 * valor): sin ellas la lib no sugiere nada, que es exactamente lo que tiene que pasar con un
 * proveedor sin historia.
 */
export function filasBarcelo({ conHistoria = true, cargado = true } = {}) {
  const relleno = Array.from({ length: 796 }, () => [])
  const fila800 = filaCompras('31/7/2026', 'Combustibles Barcelo', 'F A', '00113-00014219', 'MESSINA', 'Camion - BSA', 'Nafta Super y Diesel 500', '$ 64.006,07')
  const historia = Array.from({ length: 6 }, (_, k) => filaCompras(
    `${10 + k}/7/2026`, 'Combustibles Barcelo', 'F A', `00113-0001400${k}`, 'MESSINA', 'Camion - BSA', 'Gasoil', `$ ${11 + k}.000,00`,
  ))
  return [...relleno, ...(cargado ? [fila800] : [[]]), ...(conHistoria ? historia : [])]
}
