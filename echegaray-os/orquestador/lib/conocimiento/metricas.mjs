// LAS MÉTRICAS DEL CEREBRO — lo que se mide para que «XSAS depende menos de Claude» sea una cifra.
//
// ═══ POR QUÉ NO ALCANZA CON CONTAR LLAMADAS ═══
//
// «0 llamadas al modelo» puede significar dos cosas opuestas: que XSAS resolvió todo con lo que
// sabe, o que no resolvió nada. Contar llamadas no las distingue. Por eso acá no se cuentan
// llamadas: se cuentan DECISIONES, y cada decisión declara POR QUÉ VÍA se resolvió.
//
// ═══ LA DEFINICIÓN QUE PIDIÓ EL DUEÑO, ESCRITA SIN TRAMPA ═══
//
//   Claude Avoidance Rate = decisiones COMPARABLES resueltas sin modelo / decisiones COMPARABLES
//
// Y «comparable» tiene que definirse ANTES de medir, o el número se puede fabricar eligiendo el
// denominador. Una decisión es comparable cuando un modelo TAMBIÉN podría haberla contestado: qué
// elemento es esto, cuánto mide, con qué partida se cotiza, qué dice la norma. Sumar dos números NO
// es comparable —nadie iba a preguntarle a un modelo cuánto es 3+4— y meterlo en el denominador
// infla la tasa con aritmética.
//
// Y un HUECO declarado no es una decisión resuelta. Evitó el modelo, sí, pero no contestó nada:
// contarlo como éxito premia no saber. Va en un tercer contador, a la vista.
//
// ═══ SIN LÍNEA DE BASE INVENTADA ═══
//
// No hay un «antes» contra el que comparar porque nadie lo midió. Estos números empiezan hoy y el
// primero es el primero, no una mejora.

/** Por qué vía se resolvió una decisión. El orden es el del camino rápido: de más barato a más caro. */
export const VIA = Object.freeze({
  CACHE: 'CACHE',                       // ya estaba resuelto para esta misma entrada
  REGLA: 'REGLA',                       // código determinístico
  BASE_MAESTRA: 'BASE_MAESTRA',         // el catálogo de ECSAS
  CONOCIMIENTO: 'CONOCIMIENTO',         // la biblioteca técnica: ya estudiado
  EXPERIENCIA: 'EXPERIENCIA',           // lo que medimos ejecutando
  DOCUMENTO_LOCAL: 'DOCUMENTO_LOCAL',   // el plano/pliego de esta obra, ya procesado
  BUSQUEDA_WEB: 'BUSQUEDA_WEB',         // internet, sin modelo
  MODELO: 'MODELO',                     // razonamiento generativo
  HUECO: 'HUECO',                       // no se resolvió, y se declara por qué
})

/**
 * LAS VÍAS QUE CUENTAN COMO COMPARABLES.
 *
 * `REGLA` está afuera a propósito: es la aritmética y el SQL, lo que nunca iba a ser una pregunta
 * para un modelo. Dejarla adentro subiría la tasa sin que XSAS supiera nada nuevo.
 */
export const COMPARABLES = Object.freeze([VIA.CACHE, VIA.BASE_MAESTRA, VIA.CONOCIMIENTO, VIA.EXPERIENCIA, VIA.DOCUMENTO_LOCAL, VIA.BUSQUEDA_WEB, VIA.MODELO])

/** Las comparables que se resolvieron SIN modelo. */
export const SIN_MODELO = Object.freeze(COMPARABLES.filter((v) => v !== VIA.MODELO))

/**
 * EL MEDIDOR DE UNA CORRIDA. Uno por ejecución: dos cotizaciones simultáneas no se mezclan.
 *
 * `ahora` se inyecta para que el mismo escenario dé el mismo resultado en un test. Un medidor que
 * lee el reloj por su cuenta hace que la corrida no sea reproducible, que es justo lo que se está
 * tratando de probar.
 */
export function medidor({ ahora = () => Date.now() } = {}) {
  const t0 = ahora()
  const decisiones = []
  const etapas = new Map()
  const llamadas = []
  const busquedas = []
  const preguntas = []
  const stack = []

  const api = {
    /** Registra una decisión resuelta (o no) y por qué vía. */
    decidio({ que, via, detalle = null, clave = null }) {
      if (!VIA[via]) throw new Error(`vía desconocida: ${via}`)
      decisiones.push({ que, via, detalle, clave })
      return via
    },
    /** Registra una llamada a un proveedor de razonamiento, con su costo real si lo hay. */
    llamo({ proveedor = null, modelo = null, tokensIn = null, tokensOut = null, usd = null, ms = null, funcion = null } = {}) {
      llamadas.push({ proveedor, modelo, tokensIn, tokensOut, usd, ms, funcion })
    },
    /** Registra una búsqueda web, y si se pagó o no. */
    busco({ consulta, motor, deCache = false, resultados = 0, conModelo = false } = {}) {
      busquedas.push({ consulta, motor, deCache, resultados, conModelo })
    },
    /** Registra una pregunta que hubo que hacerle a una persona. Es la métrica que más importa: son
     *  las que XSAS todavía no puede contestar solo. */
    pregunto({ que, quienLoTiene = null }) { preguntas.push({ que, quienLoTiene }) },
    /** Cronometra una etapa. Devuelve una función que la cierra. */
    etapa(nombre) {
      const inicio = ahora()
      stack.push(nombre)
      return () => {
        const ms = ahora() - inicio
        etapas.set(nombre, (etapas.get(nombre) ?? 0) + ms)
        stack.pop()
        return ms
      }
    },
    /** El resumen. Cero llamadas y cero decisiones NO es 100% de autonomía: es una corrida vacía, y
     *  la tasa sale `null` para que nadie la lea como un logro. */
    resumen({ cache = null } = {}) {
      const porVia = {}
      for (const d of decisiones) porVia[d.via] = (porVia[d.via] ?? 0) + 1
      const comparables = decisiones.filter((d) => COMPARABLES.includes(d.via))
      const sinModelo = comparables.filter((d) => d.via !== VIA.MODELO).length
      const conModelo = comparables.filter((d) => d.via === VIA.MODELO).length
      const huecos = decisiones.filter((d) => d.via === VIA.HUECO).length
      const total = comparables.length
      const usd = llamadas.reduce((a, l) => a + (l.usd ?? 0), 0)
      return {
        ms: ahora() - t0,
        porEtapaMs: Object.fromEntries([...etapas.entries()].sort()),
        decisiones: decisiones.length,
        porVia,
        comparables: total,
        resueltasSinModelo: sinModelo,
        resueltasConModelo: conModelo,
        noResueltas: huecos,
        // La tasa es `null` cuando no hubo ninguna decisión comparable. 1 sobre 0 no es 100%.
        claudeAvoidanceRate: total === 0 ? null : Math.round((sinModelo / total) * 1000) / 1000,
        autonomousResolutionRate: decisiones.length === 0 ? null : Math.round(((decisiones.length - huecos) / decisiones.length) * 1000) / 1000,
        knowledgeReuseRate: total === 0 ? null : Math.round((decisiones.filter((d) => d.via === VIA.CONOCIMIENTO || d.via === VIA.EXPERIENCIA || d.via === VIA.CACHE).length / total) * 1000) / 1000,
        llamadasModelo: llamadas.length,
        proveedores: [...new Set(llamadas.map((l) => l.proveedor).filter(Boolean))],
        tokensIn: llamadas.reduce((a, l) => a + (l.tokensIn ?? 0), 0),
        tokensOut: llamadas.reduce((a, l) => a + (l.tokensOut ?? 0), 0),
        // `null` cuando ninguna llamada trajo costo: 0 USD dicho sin saberlo es una afirmación falsa.
        usd: llamadas.length && llamadas.some((l) => l.usd != null) ? Math.round(usd * 10000) / 10000 : (llamadas.length ? null : 0),
        busquedasWeb: busquedas.length,
        busquedasDeCache: busquedas.filter((b) => b.deCache).length,
        busquedasConModelo: busquedas.filter((b) => b.conModelo).length,
        preguntasHumanas: preguntas.length,
        preguntas,
        cache: cache?.resumen?.() ?? null,
      }
    },
  }
  return api
}

/**
 * EL ERROR CONTRA LA REALIDAD, cuando la obra ya se ejecutó. PURA.
 *
 * No se calcula hasta que existe el dato real: sin ejecución no hay error que medir, y un 0% de
 * error sobre una obra que no se hizo es la peor cifra posible. Devuelve `null` por campo faltante.
 */
export function errorContraReal({ estimado = {}, real = {} } = {}) {
  const err = (e, r) => (Number.isFinite(Number(e)) && Number.isFinite(Number(r)) && Number(r) !== 0
    ? Math.round(((Number(e) - Number(r)) / Number(r)) * 10000) / 10000
    : null)
  return {
    cantidad: err(estimado.cantidad, real.cantidad),
    hh: err(estimado.hh, real.hh),
    costo: err(estimado.costo, real.costo),
    duracion: err(estimado.duracion, real.duracion),
    hayReal: Object.values(real).some((v) => Number.isFinite(Number(v))),
  }
}
