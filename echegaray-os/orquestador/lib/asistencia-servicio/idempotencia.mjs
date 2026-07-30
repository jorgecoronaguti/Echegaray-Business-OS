// IDEMPOTENCIA DEL POST DE REGISTRO.
//
// Hay DOS protecciones y conviene no confundirlas, porque la importante no es esta:
//
// 1) LA DEL NÚCLEO (la que de verdad protege el jornal). `planificarAsistencia` se
//    recalcula contra la planilla releída: si las celdas ya tienen exactamente lo que se
//    va a escribir, cada ítem sale como `sin_cambio` y no hay nada que escribir. Un envío
//    repetido no puede duplicar horas ni pisar nada. Eso ya está construido y probado.
//
// 2) LA DE ESTE ARCHIVO (la que protege la EXPERIENCIA). Sin ella, el doble toque del
//    jefe en el botón produce dos escrituras contra el Sheet y dos eventos de auditoría
//    con el mismo contenido; la segunda contesta "0 celdas" y parece que algo falló.
//    Acá se recuerda la respuesta de la primera y se devuelve idéntica.
//
// Es un registro EN MEMORIA, con TTL y tope. Se declara la limitación en vez de
// esconderla: si el proceso se reinicia entre los dos envíos, la protección que queda es
// la del núcleo — que es la que no puede fallar. Persistirlo exigiría una tabla nueva, y
// las migraciones de este incremento no son de este frente.

/** Ventana en la que un reenvío se considera "el mismo envío". */
export const TTL_MS = Number(process.env.ORQ_ASISTENCIA_WEB_IDEM_TTL_MS ?? 10 * 60 * 1000)

const MAX = Number(process.env.ORQ_ASISTENCIA_WEB_IDEM_MAX ?? 500)

/**
 * Registro de respuestas por clave.
 * @returns {{ver:Function, guardar:Function, tamano:Function}}
 */
export function crearRegistroMemoria({ ttlMs = TTL_MS, max = MAX, ahora = () => Date.now() } = {}) {
  const m = new Map()

  const purgar = (t) => {
    for (const [k, v] of m) if (v.hasta <= t) m.delete(k)
    while (m.size > max) m.delete(m.keys().next().value)
  }

  return {
    /** @returns {Promise<{hit:true, valor:any}|{hit:false}>} */
    async ver(clave) {
      const t = ahora()
      purgar(t)
      const v = m.get(clave)
      return v ? { hit: true, valor: v.valor } : { hit: false }
    },
    async guardar(clave, valor) {
      const t = ahora()
      m.set(clave, { valor, hasta: t + ttlMs })
      purgar(t) // después de guardar: si no, el tope se supera en uno en cada escritura
      return { ok: true }
    },
    tamano() { return m.size },
  }
}
