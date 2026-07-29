// PR-3 · Observabilidad del Communication Layer.
//
// Todo lo que cruza la frontera se puede seguir de punta a punta: cada evento
// tiene correlation_id (el hilo) y causation_id (quién lo causó). Este módulo
// da tres cosas, todas inyectables (sin dependencias externas):
//   - logEstructurado: una línea JSON por hop, con correlation_id
//   - spans: medición de duración de cada tramo (crear → publicar → confirmar)
//   - métricas: contadores/observaciones agregadas para un scrape o un log
//
// Es deliberadamente simple: no ata a ningún vendor (OTel, Datadog). El puerto
// `sink` recibe los registros; en prod puede ser un logger real, en test un array.

/** Crea un logger estructurado que emite objetos JSON a un sink. */
export function crearLog(sink = (r) => console.log(JSON.stringify(r))) {
  return {
    emit(nivel, mensaje, ctx = {}) {
      sink({ ts: new Date().toISOString(), nivel, componente: 'comunicacion', mensaje, ...ctx })
    },
    info(m, ctx) {
      this.emit('info', m, ctx)
    },
    warn(m, ctx) {
      this.emit('warn', m, ctx)
    },
    error(m, ctx) {
      this.emit('error', m, ctx)
    },
  }
}

/** Métricas mínimas: contadores y observaciones (histograma simplificado a
 *  suma+conteo). Sin dependencias; `exportar()` da un snapshot para loguear o
 *  servir. */
export function crearMetricas() {
  const contadores = new Map()
  const observaciones = new Map()
  return {
    inc(nombre, etiquetas = {}, n = 1) {
      const k = clave(nombre, etiquetas)
      contadores.set(k, (contadores.get(k) ?? 0) + n)
    },
    observar(nombre, valor, etiquetas = {}) {
      const k = clave(nombre, etiquetas)
      const prev = observaciones.get(k) ?? { suma: 0, conteo: 0, max: 0 }
      observaciones.set(k, { suma: prev.suma + valor, conteo: prev.conteo + 1, max: Math.max(prev.max, valor) })
    },
    exportar() {
      return {
        contadores: Object.fromEntries(contadores),
        observaciones: Object.fromEntries(observaciones),
      }
    },
  }
}

/** Abre un span con un reloj inyectable; `fin()` devuelve la duración en ms y la
 *  registra en métricas si se pasó una instancia. */
export function iniciarSpan(nombre, { metricas, ahora = () => Date.now(), etiquetas = {} } = {}) {
  const t0 = ahora()
  return {
    nombre,
    fin() {
      const dur = ahora() - t0
      if (metricas) metricas.observar(`span.${nombre}.ms`, dur, etiquetas)
      return dur
    },
  }
}

function clave(nombre, etiquetas) {
  const et = Object.keys(etiquetas)
    .sort()
    .map((k) => `${k}=${etiquetas[k]}`)
    .join(',')
  return et ? `${nombre}{${et}}` : nombre
}
