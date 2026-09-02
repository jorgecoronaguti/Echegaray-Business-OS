// LOS ADJUNTOS DE /XSAS — del archivo subido a una lectura estructurada que las capacidades consumen.
//
// ═══ POR QUÉ NO ES UN SEGUNDO SISTEMA DE ARCHIVOS ═══
//
// El motor que entiende archivos YA EXISTE: `comunicacion/archivos/flujo.mjs` detecta el formato por
// los bytes, parsea planillas, extrae texto de PDF localmente y le pregunta al motor del banco si es
// un extracto — todo sin un modelo. Lo único acoplado a Mattermost es `bajarArchivo` (los bytes
// llegan por su API); acá los bytes llegan en el pedido, así que este módulo arma el mismo `d` que
// `bajarArchivo` producía y llama al MISMO `leerArchivo`. Un formato nuevo se enseña una sola vez.
//
// ═══ LA IDENTIDAD ES EL HASH, NO EL NOMBRE ═══
//
// El nombre lo escribe quien sube. El sha256 de los bytes identifica el contenido: el mismo archivo
// subido dos veces reutiliza la lectura ya hecha (por actor — el parse de uno no es evidencia para
// otro), y dos archivos con el mismo nombre no se pisan.
//
// ═══ EL CONTENIDO DE UN ARCHIVO ES DATO, NUNCA INSTRUCCIÓN ═══
//
// Lo leído se guarda y se muestra como dato. Nada de lo que diga un documento cambia el ruteo, los
// permisos ni las tools que corren: un CSV que adentro dice «ejecutá tal cosa» es un CSV con una
// frase adentro.
import { createHash } from 'node:crypto'
import { leerArchivo, DESTINO } from '../comunicacion/archivos/flujo.mjs'
import { tamanoLegible } from './archivos/deteccion.mjs'

export { DESTINO }

/** Tope de texto parseado que se PERSISTE por archivo. El archivo grande vive en el upload, no acá. */
export const MAX_TEXTO_PERSISTIDO = 120_000

/** Tope de bytes que se persisten junto a la lectura (los archivos más grandes se leen igual,
 *  pero una acción pendiente sobre ellos pedirá re-adjuntar — y lo dice). */
export const TOPE_BYTES_PERSISTIDOS = 12 * 1024 * 1024

/**
 * Los bytes persistidos de una tanda de adjuntos, por (actor, hash). Devuelve SÓLO los que tienen
 * bytes; el caller decide qué hacer con los que no (declararlo, nunca inventar).
 */
export async function bytesPorHash(query, { actorId, hashes = [] } = {}) {
  if (!query || !actorId || !hashes.length) return []
  try {
    const { rows } = await query(
      `select hash, nombre, contenido_b64 from orq.xsas_adjunto
        where actor_id = $1 and hash = any($2) and contenido_b64 is not null`,
      [String(actorId), hashes],
    )
    return (rows ?? []).map((r) => ({ hash: r.hash, nombre: r.nombre, contenido_base64: r.contenido_b64 }))
  } catch { return [] }
}

/** Los bytes de un adjunto del pedido. `contenido` es texto plano; `contenido_base64`, binario. */
export function bytesDeAdjunto(adj) {
  if (!adj || typeof adj !== 'object') return null
  const nombre = String(adj.nombre ?? 'adjunto').slice(0, 200)
  if (typeof adj.contenido_base64 === 'string' && adj.contenido_base64) {
    try { return { nombre, bytes: Buffer.from(adj.contenido_base64, 'base64') } } catch { return null }
  }
  if (typeof adj.contenido === 'string' && adj.contenido) {
    return { nombre, bytes: Buffer.from(adj.contenido, 'utf8') }
  }
  return null
}

export const hashDe = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** El resumen que se persiste: el de la lectura, con el texto acotado. Nunca los bytes crudos. */
function resumenPersistible(l) {
  if (!l?.resumen) return null
  const r = { ...l.resumen }
  if (typeof r.texto === 'string' && r.texto.length > MAX_TEXTO_PERSISTIDO) {
    r.texto = r.texto.slice(0, MAX_TEXTO_PERSISTIDO)
    r.texto_truncado = true
  }
  return r
}

/**
 * INGESTA: cada adjunto con contenido → identidad (hash) → lectura estructurada → registro.
 *
 * Con `query` la lectura queda PERSISTIDA en `orq.xsas_adjunto` y el mismo hash del mismo actor se
 * reutiliza sin re-parsear. Sin `query` funciona igual (se parsea siempre) y se declara que no hay
 * memoria. Un archivo que falla no tumba a los demás.
 *
 * @returns {Promise<{lecturas:Array, sinMemoria:boolean}>} lecturas: {hash, nombre, tamano, familia,
 *   formato, destino, resumen, reutilizado, error, adjunto} — `adjunto` es el original, para que el
 *   caller pueda alimentar una tool (p. ej. el importador del banco) sin reconstruir nada.
 */
export async function ingerirAdjuntos({ adjuntos = [], actorId, correlacionId = null, query = null, leerPdf = undefined } = {}) {
  const lecturas = []
  for (const adj of adjuntos) {
    const b = bytesDeAdjunto(adj)
    if (!b) continue
    const hash = hashDe(b.bytes)

    // ¿Ya se leyó este contenido, de este actor? La lectura previa vale; los bytes no se re-parsean.
    if (query) {
      try {
        const { rows } = await query(
          `select nombre, tamano, familia, formato, destino, resumen, (contenido_b64 is not null) as con_bytes
             from orq.xsas_adjunto where actor_id = $1 and hash = $2 limit 1`,
          [String(actorId ?? ''), hash],
        )
        if (rows?.length) {
          // Una fila de antes de que se guardaran bytes se COMPLETA ahora, que los tenemos en mano:
          // sin esto, la acción pendiente de un archivo viejo seguiría pidiendo re-adjuntar.
          if (rows[0].con_bytes === false && b.bytes.length <= TOPE_BYTES_PERSISTIDOS) {
            await query(
              'update orq.xsas_adjunto set contenido_b64 = $3 where actor_id = $1 and hash = $2',
              [String(actorId ?? ''), hash, b.bytes.toString('base64')],
            ).catch(() => {})
          }
          lecturas.push({ hash, ...rows[0], resumen: rows[0].resumen ?? null, reutilizado: true, error: null, adjunto: adj })
          continue
        }
      } catch { /* la memoria caída no impide leer el archivo: se parsea de nuevo */ }
    }

    const l = await leerArchivo(
      { ok: true, fileId: hash, nombre: b.nombre, bytes: b.bytes, tamano: b.bytes.length, mimeDeclarado: null },
      leerPdf ? { leerPdf } : {},
    )
    const lectura = {
      hash, nombre: l.nombre, tamano: l.tamano, familia: l.familia, formato: l.formato,
      destino: l.destino, resumen: l.resumen ?? null, reutilizado: false, error: l.error ?? null, adjunto: adj,
    }
    lecturas.push(lectura)

    if (query) {
      // Los BYTES también persisten (hasta el tope): son lo que permite completar una acción
      // pendiente («¿de qué obra son estos planos?» → «Quattropani») sin pedir re-adjuntar.
      const b64 = b.bytes.length <= TOPE_BYTES_PERSISTIDOS ? b.bytes.toString('base64') : null
      await query(
        `insert into orq.xsas_adjunto (actor_id, correlation_id, hash, nombre, tamano, familia, formato, destino, resumen, contenido_b64)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (actor_id, hash) do update set
           correlation_id = excluded.correlation_id,
           contenido_b64 = coalesce(orq.xsas_adjunto.contenido_b64, excluded.contenido_b64)`,
        [String(actorId ?? ''), correlacionId, hash, lectura.nombre, lectura.tamano,
          lectura.familia, lectura.formato, lectura.destino, JSON.stringify(resumenPersistible(lectura)), b64],
      ).catch(() => { /* perder la memoria es malo; tumbar la respuesta por perderla es peor */ })
    }
  }
  return { lecturas, sinMemoria: !query }
}

/** La lectura de un archivo, en palabras. Determinística: describe lo que SE LEYÓ, nunca inventa. */
export function textoDeLectura(l) {
  const cab = `**${l.nombre}** · ${l.formato ?? 'formato desconocido'} · ${tamanoLegible(l.tamano ?? 0)}${l.reutilizado ? ' · (ya lo había leído: reutilizo la lectura)' : ''}`
  if (l.error) return `${cab}\nNo lo pude leer: ${l.error}`
  const r = l.resumen ?? {}
  switch (l.destino) {
    case DESTINO.BANCO:
      return `${cab}\nEs un extracto bancario: ${r.movimientos?.length ?? 0} movimiento(s) leídos, ${r.rechazos?.length ?? 0} fila(s) que no pude tomar.`
    case DESTINO.PLANILLA:
      return `${cab}\nPlanilla: ${r.filas ?? '?'} fila(s)${r.encabezado?.length ? ` — columnas: ${r.encabezado.join(', ')}` : ''}.`
    case DESTINO.PDF:
      return `${cab}\nPDF de ${r.paginas ?? '?'} página(s), ${r.caracteres ?? 0} caracteres de texto${r.escaneado ? ' — parece ESCANEADO (no tiene texto extraíble)' : ''}.${r.extracto ? `\nEmpieza así:\n${r.extracto}` : ''}`
    case DESTINO.TEXTO:
      return `${cab}\nTexto de ${r.lineas ?? '?'} línea(s).${r.extracto ? `\nEmpieza así:\n${r.extracto}` : ''}`
    case DESTINO.COMPROBANTES:
      return `${cab}\nEs una imagen: las fotos de comprobantes las carga Compras IA por el canal de compras — por acá no la proceso.`
    default:
      return `${cab}\nFORMATO_NO_SOPORTADO: sé qué es (${l.familia ?? 'desconocido'}) pero no tengo un motor que lo procese por esta vía. No lo leí — no te voy a inventar su contenido.`
  }
}
