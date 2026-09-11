// EL INSTRUMENTO DE MEDICIÓN — cuántos viajes a la base hace una pantalla, y cuánto tarda cada uno.
//
// POR QUÉ EXISTE. La queja del dueño ("la app está lenta") se repitió cuatro veces sin que nadie
// pudiera decir en qué se iba el tiempo, porque desde afuera una pantalla lenta y una pantalla con
// treinta viajes seriales a São Paulo se ven igual. Sin contarlos, "optimizar" es adivinar.
//
// APAGADO POR DEFECTO Y SIN COSTO. Cuando `PERF_TRAZA` no vale '1', `trazar()` devuelve `undefined`
// y `createServerClient` usa su propio `fetch`: no hay wrapper, no hay rama caliente, no hay
// diferencia con el código que corría antes. Nunca se enciende en Vercel: es una variable de
// entorno del proceso local con el que se mide.
//
// NO REGISTRA DATOS, REGISTRA FORMA. Sale el verbo, la tabla, las columnas pedidas y los ms; nunca
// el cuerpo de la respuesta ni el token. Una traza que copiara filas sería una filtración con
// nombre de herramienta.
const ENCENDIDO = process.env.PERF_TRAZA === '1'

/** `…/rest/v1/obra_panel?select=a,b,c&estado=eq.x` → `obra_panel[3 col] estado`. */
export function resumirUrl(url: string): string {
  const i = url.indexOf('/rest/v1/')
  const cola = i < 0 ? url : url.slice(i + '/rest/v1/'.length)
  const [ruta, query = ''] = cola.split('?')
  const params = new URLSearchParams(query)
  const select = params.get('select')
  const columnas = select && select !== '*' ? select.split(',').length : select === '*' ? -1 : 0
  const filtros = [...params.keys()].filter((k) => k !== 'select' && k !== 'order' && k !== 'limit')
  const cuantas = columnas === -1 ? 'select *' : columnas > 0 ? `${columnas} col` : 'sin select'
  return `${ruta} [${cuantas}]${filtros.length ? ' ' + filtros.join(',') : ''}`
}

/**
 * El `fetch` que cuenta, o `undefined` para que el cliente use el suyo.
 *
 * Se devuelve `undefined` —y no un wrapper transparente— a propósito: pasar una función propia a
 * `createServerClient` cambia el camino del código aunque no haga nada, y un instrumento que
 * modifica lo que mide no mide.
 */
export function trazar(): typeof fetch | undefined {
  if (!ENCENDIDO) return undefined
  return async (entrada: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const t0 = Date.now()
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    let bytes = -1
    try {
      const r = await fetch(entrada, init)
      // CUÁNTO PESA LA RESPUESTA, QUE ES LA MITAD DEL PROBLEMA. Contar viajes no alcanza: una
      // pantalla puede hacer UN viaje y traer 130 KB para dibujar una dirección. Se cuenta sobre un
      // `clone()` para no consumir el cuerpo que el llamador todavía no leyó; el clon sólo existe
      // con la traza encendida, que nunca es producción.
      try { bytes = (await r.clone().arrayBuffer()).byteLength } catch { bytes = -1 }
      return r
    } finally {
      const ms = Date.now() - t0
      // Una línea por viaje, con el instante de arranque: el que la lee después la reparte por
      // pantalla usando la ventana de tiempo de cada navegación. `console.log` y no
      // `process.stdout`: el middleware puede correr en el runtime Edge, donde `process` no existe.
      console.log(`PERFQ\t${t0}\t${ms}\t${bytes}\t${init?.method ?? 'GET'}\t${resumirUrl(url)}`)
    }
  }
}
