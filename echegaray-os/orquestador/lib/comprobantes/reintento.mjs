// EL REINTENTO DE UN FAJO CUANDO GOOGLE NO CONTESTA — la parte pura: cuánto esperar, cuándo rendirse
// y qué decirle al dueño. Sin base, sin Mattermost, sin cargador: eso vive en
// `comunicacion/comprobantes/reintento.mjs`, que consume esto.
//
// ═══ EL DEFECTO QUE ESTO CIERRA (15/09/2026, 14:44) ═══
//
// Ocho fotos leídas por la visión, el fajo armado, y el cargador muerto con un HTTP 504 de Google
// Sheets al leer la fila de rótulos — ANTES de escribir nada. El bot dijo «Terminé, pero no cargué
// ninguno de los 8», el evento quedó `procesado` y las ocho lecturas se tiraron. El dueño: «te he
// pedido muchas veces que eso no puede ser así».
//
// Lo que cambia: un fajo cuya carga falló ANTES de tocar el Sheet por una falla pasajera de Google
// no se cierra ni se reabre para que alguien lo mande de nuevo. Queda en `reintento`, con sus
// lecturas, y el worker lo vuelve a intentar solo con espera creciente. Recién cuando entra se
// contesta en el hilo «cargué N»; y si Google no vuelve en ~2 h 30, se dice eso y se para.

/** Cuántas veces se intenta en total (la primera en línea, las demás desde el worker). */
export const MAX_INTENTOS_REINTENTO = Number(process.env.ORQ_COMPROBANTES_MAX_REINTENTOS || 10)

/**
 * Minutos hasta el intento siguiente, por número de intento ya hecho: 1, 2, 4, 8, 16, 30, 30, …
 * Es la misma forma que `ESPERAS_5XX`/`ESPERAS_429` de `google.mjs`, a escala de minutos: cuando
 * el 504 sobrevivió a los reintentos de segundos del cliente, la falla es más larga que segundos.
 */
export function esperaDeReintentoMin(intentosHechos = 1) {
  const n = Math.max(1, Math.floor(Number(intentosHechos) || 1))
  return Math.min(2 ** (n - 1), 30)
}

/** Minutos acumulados de espera después de `intentos` intentos. Para decirle al dueño cuánto se esperó. */
export function esperaAcumuladaMin(intentos = MAX_INTENTOS_REINTENTO) {
  let total = 0
  for (let i = 1; i < intentos; i++) total += esperaDeReintentoMin(i)
  return total
}

export function enHoras(min) {
  const h = Math.floor(min / 60); const m = min % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

const cuantos = (n) => (n === 1 ? 'el comprobante' : `los ${n} comprobantes`)

/** Lo que se dice en cada momento. Nunca «revisá Compras» cuando no se escribió nada. */
export const TEXTO_REINTENTO = Object.freeze({
  /** El renglón corto que viaja en `avisos` (la tanda lo repite si hace falta). */
  aviso: 'Google Sheets no respondió antes de que pudiera escribir: **lo reintento solo**, no hace falta que los mandes de nuevo. Te aviso en este hilo cuando queden cargados.',
  /** El mensaje del post cuando el fajo queda esperando. */
  texto: (n, { detalle = null } = {}) => [
    `⏳ **Leí ${cuantos(n)}, pero Google Sheets no respondió al ir a cargarlos${detalle ? ` (${detalle})` : ''}.** No se escribió nada en Compras.`,
    '**Lo reintento solo**, con espera creciente — no hace falta que los mandes de nuevo. Te aviso en este hilo cuando queden cargados.',
  ].join('\n'),
  /** El encabezado del mensaje de éxito que publica el worker. */
  cargado: (intento) => `↻ **Reintento ${intento}: Google volvió a contestar.**`,
  /** Cuando se agota el cupo. */
  rendido: (n, intentos) => [
    `✖ **Me rendí después de ${intentos} intentos (${enHoras(esperaAcumuladaMin(intentos))}):** Google Sheets no respondió al ir a cargar ${cuantos(n)}.`,
    'No se escribió nada en Compras y las lecturas quedaron guardadas. Mandalos de nuevo cuando quieras, o avisale a Dirección.',
  ].join('\n'),
})
