// EL CACHÉ DE LECTURAS DE PLANO — CADA ENTRADA ES UNA LLAMADA DE VISIÓN YA PAGADA.
//
// ═══ POR QUÉ SE MUDÓ DE ~/.cache A POSTGRES ═══
//
// Vivía en `~/.cache/echegaray-planos`: disco local del worker. Medido el 03/09/2026, 135 archivos
// y 1,5 MB — y cada archivo es una lectura de lámina o de vista que el modelo ya cobró una vez. Ese
// lugar tiene tres defectos que no son de rendimiento sino de dinero y de visibilidad:
//
//   1. Es del HOME del proceso. Si cambia la máquina, el usuario o el contenedor, el caché se
//      vuelve inalcanzable y la MISMA cotización se vuelve a pagar entera.
//   2. No lo comparte nadie. El worker, un script y la web calientan tres cachés distintos.
//   3. No se puede mirar sin SSH. «¿Qué planos tenemos ya leídos?» no tiene respuesta consultable.
//
// La llave NO cambia: es la misma que producía `llaveDeCache(bytes)` —hash del CONTENIDO— con su
// sufijo `:medicion` o su prefijo `v3region:` donde corresponde. Lo que se guardaba en el archivo
// `<llave>.json` es exactamente lo que se guarda en la columna `valor`.
//
// ═══ EL CACHÉ NUNCA DECIDE SI EL PIPELINE FUNCIONA ═══
//
// La regla es la del `try/catch` original y no se relaja: si la base no está, no responde, o la
// tabla todavía no existe (la migración la aplica el dueño, no este código), TODO cae al disco y la
// corrida sigue. Un caché que tira una excepción es peor que no tener caché.
//
// ═══ Y EL DISCO NO SE TIRA: SE COSECHA ═══
//
// Los 135 archivos que ya están son plata gastada. En vez de un script de migración que hay que
// acordarse de correr, la lectura los busca en la base y, si no están, los busca en el disco: lo
// que encuentre ahí lo PROMUEVE a la base en el mismo acto. El caché se muda solo, entrada por
// entrada, la próxima vez que cada plano se cotice — y si la promoción falla, la lectura ya salió
// igual del disco y nadie se entera.

import fs from 'node:fs'
import path from 'node:path'

/** Dónde queda la interpretación de una lámina en disco. Fuera del repo: es caché, no fuente. */
export const DIR_CACHE = process.env.ORQ_PLANO_CACHE || path.join(process.env.HOME || '/tmp', '.cache', 'echegaray-planos')

/** La ruta del archivo de una llave. Se conserva EXACTA —`<llave>.json`, sin sanear— porque los 135
 *  archivos que ya existen se llaman así: cambiar el esquema de nombres sería tirarlos. */
const rutaDe = (dir, llave) => path.join(dir, `${llave}.json`)

/**
 * EL CACHÉ DE LECTURAS, CON LA BASE COMO PRIMERA FUENTE Y EL DISCO COMO RESPALDO.
 *
 * `query` es opcional a propósito: un script suelto o un test no tienen conexión y deben funcionar
 * igual que hasta ayer. Sin `query`, esto es literalmente el caché de disco de siempre.
 *
 * @param {{ query?: Function|null, dir?: string, logger?: object|null }} opciones
 */
export function cacheDeLecturas({ query = null, dir = DIR_CACHE, logger = null } = {}) {
  const leerDisco = (llave) => {
    try { return JSON.parse(fs.readFileSync(rutaDe(dir, llave), 'utf8')) } catch { return null }
  }
  const guardarDisco = (llave, valor) => {
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(rutaDe(dir, llave), JSON.stringify(valor))
      return 'disco'
    } catch { return 'ninguno' }
  }
  const guardarEnBase = async (llave, valor) => {
    if (!query) return false
    await query(
      `insert into orq.plano_lectura_cache (llave, valor)
            values ($1, $2::jsonb)
       on conflict (llave) do update set valor = excluded.valor, actualizado_en = now()`,
      [llave, JSON.stringify(valor)])
    return true
  }

  return {
    /** La lectura cacheada, o `null`. NUNCA tira: un caché roto es un caché vacío. */
    async leer(llave) {
      if (query) {
        try {
          const r = await query('select valor from orq.plano_lectura_cache where llave = $1', [llave])
          if (r?.rows?.[0]?.valor) return r.rows[0].valor
        } catch (e) {
          logger?.debug?.('plano: caché en base no disponible para leer', { porQue: String(e?.message ?? e).slice(0, 120) })
        }
      }
      const enDisco = leerDisco(llave)
      // La promoción es best-effort y NO se espera su éxito para responder: lo que importa es que
      // la lectura salga, no que la mudanza termine.
      if (enDisco && query) {
        try { await guardarEnBase(llave, enDisco) } catch { /* el disco ya respondió */ }
      }
      return enDisco
    },

    /** Guarda una lectura. Devuelve dónde quedó — `base`, `disco` o `ninguno`— para poder afirmarlo
     *  en un test en vez de suponerlo. NUNCA tira. */
    async guardar(llave, valor) {
      if (query) {
        try {
          await guardarEnBase(llave, valor)
          return 'base'
        } catch (e) {
          logger?.debug?.('plano: caché en base no disponible para escribir', { porQue: String(e?.message ?? e).slice(0, 120) })
        }
      }
      return guardarDisco(llave, valor)
    },
  }
}
