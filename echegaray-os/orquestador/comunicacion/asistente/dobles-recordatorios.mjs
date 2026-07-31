// DOBLES PARA LOS TESTS DE RECORDATORIOS. No se usa en producción.
//
// El doble está en la FRONTERA DE E/S —Mattermost y el reloj— y en ningún otro lado: el
// repositorio, las reglas de reprogramación, el backoff y las capacidades que entran a los
// tests son los REALES. Doblar el repositorio habría dejado probada una simulación de la
// barrera de no-duplicación, que es justamente lo que no sirve.
//
// El reloj es un doble porque el tiempo ES el dominio acá: un recordatorio semanal no se
// puede probar esperando una semana, y "esperar un rato" en un test es la receta para un
// test que falla los martes.

/** Reloj controlado. `ahora()` devuelve ms, igual que `Date.now`. */
export function relojFijo(iso) {
  let t = Date.parse(iso)
  return {
    ahora: () => t,
    fecha: () => new Date(t),
    avanzar(ms) { t += ms; return t },
    poner(x) { t = typeof x === 'number' ? x : Date.parse(x); return t },
  }
}

/**
 * Mattermost de mentira: registra a quién se le abrió DM y qué se publicó.
 * @param {object} o
 * @param {boolean} [o.abre]        false ⇒ `abrirDM` devuelve null (no hay canal)
 * @param {number}  [o.fallaVeces]  cuántas publicaciones seguidas lanzan antes de andar
 * @param {boolean} [o.rechaza]     true ⇒ `publicar` devuelve null (MM no aceptó)
 */
export function mattermostDoble({ abre = true, fallaVeces = 0, rechaza = false } = {}) {
  const posts = []
  const dms = []
  let restan = fallaVeces
  let seq = 0
  return {
    posts,
    dms,
    get textos() { return posts.map((p) => p.texto) },
    async abrirDM(userId) {
      dms.push(userId)
      return abre && userId ? `dm_${userId}` : null
    },
    async publicar({ channelId, texto }) {
      if (restan > 0) { restan--; throw new Error('mattermost de prueba: fallo simulado') }
      if (rechaza) return null
      const post = { id: `post_${++seq}`, channelId, texto }
      posts.push(post)
      return post
    },
  }
}

/** Logger que guarda en vez de imprimir: los tests afirman sobre lo que se logueó. */
export function logDoble() {
  const lineas = []
  const push = (nivel) => (msg, datos = {}) => { lineas.push({ nivel, msg, datos }) }
  return { lineas, info: push('info'), error: push('error'), warn: push('warn') }
}

/** Identidad de quien pide, como la arma el asistente desde Mattermost. */
export const IDENTIDAD = Object.freeze({
  JORGE: { plataforma: 'mattermost', plataformaUserId: 'u-jorge', nombreVisible: 'Jorge', alias: [], activo: true },
  RODRIGO: { plataforma: 'mattermost', plataformaUserId: 'u-rodrigo', nombreVisible: 'Rodrigo', alias: [], activo: true },
  AJENO: { plataforma: 'mattermost', plataformaUserId: 'u-ajeno', nombreVisible: 'Otro', alias: [], activo: true },
})
