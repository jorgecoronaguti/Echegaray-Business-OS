// LOS DEPÓSITOS QUE EL BANCO LISTÓ Y TODAVÍA NO ACREDITÓ — la otra mitad de la regla del percibido.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO ARREGLA (11/09/2026, 12:50) ═══
//
// Esta mañana se corrigió algo que estaba mal: CAJA publicaba $79.521.755,29 de «CAJA DISPONIBLE» con
// $38.572.526,23 adentro que el propio `_BANCO_RAW` declara pendientes de acreditación (dos depósitos
// de eCheq retenidos 48 hs, filas 577 y 578). Un eCheq retenido no es plata que se pueda pagar mañana,
// así que restarlo de lo disponible es correcto y se hizo bien.
//
// Pero se hizo LA MITAD. Esa plata **va a entrar**: el banco la acredita en 48 hs. Al sacarla del
// disponible y no volver a ponerla como ingreso futuro, desapareció del plan — y como el cierre de los
// dos Cash Flow se ancla en la caja de hoy, **la tarjeta de cierre del Mensual bajó $38,8 M** respecto
// de la corrida anterior. El dueño lo vio antes que ningún control.
//
// La regla de oro es el percibido, y el percibido tiene dos lados: **hoy no está, y el jueves sí**.
// Restarlo del saldo sin proyectar su acreditación no es ser conservador: es afirmar que una plata que
// el banco ya tiene en sus manos no va a llegar nunca.
//
// ═══ SE APAGA SOLO, Y ASÍ TIENE QUE SER ═══
//
// La marca de «retenido» es la celda de saldo corrido VACÍA (ver `esRetenida` en
// `banco-detalle-declarado.mjs`, que es la MISMA definición que usa CAJA para restarlo). Cuando el
// banco acredita, el extracto siguiente trae el saldo corrido, la celda deja de estar vacía, la caja
// vuelve a incluir esa plata y este extractor deja de emitir el proyectado. Nadie toca nada, y en
// ningún momento la plata está contada dos veces.
//
// ═══ LO QUE NO PUEDE PASAR: CONTARLO DOS VECES CONTRA LA COBRANZA ═══
//
// Un eCheq depositado es, casi siempre, el cobro de un cliente. Ese cobro puede estar YA en el libro
// por dos puertas: Cobranzas (si alguien lo marcó cobrado, viaja REAL) o `_CHEQUES_RAW` (si el valor
// sigue en la cartera, viaja COMPROMETIDO con su fecha de pago). En los dos casos emitir el depósito
// sumaría la misma plata otra vez. El libro ya pagó esa lección con este mismo rubro: el eCheq de LA
// ESTRELLA sumaba en Cobranzas Y en «Valores en cartera» (ver cash-flow-conectividad). Así que acá el
// criterio es duro: **si el libro ya tiene un ingreso del mismo importe en la ventana, no se emite y
// se avisa** — no importa con qué estado, porque las dos formas de estar ya contado duplican.
//
// NÚCLEO PURO: recibe las filas de `_BANCO_RAW` ya leídas y los ingresos que el libro ya emitió.

import { movimiento, ENTRA } from './libro-movimientos.mjs'
import { isoDeSerial } from './libro-extractores-fechas.mjs'
import { esRetenida } from './banco-detalle-declarado.mjs'
import { RUBRO_CARTERA } from './cash-flow-conectividad.mjs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()
const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

/** La pestaña de la que sale: la réplica del extracto. Es su `origen.pestana`. */
export const PESTANA_BANCO = '_BANCO_RAW'

/**
 * CUÁNTOS DÍAS HÁBILES TARDA EL BANCO EN ACREDITAR UN eCHEQ DEPOSITADO.
 *
 * DOS, que es lo que dice el propio concepto del extracto («Deposito e-cheq 48hs presencia bsr»). No
 * se lee del concepto porque el otro depósito del mismo día no lo dice («Deposito e-cheq int ots
 * plazas», que por ser de otra plaza puede tardar más): usar el número cuando está y dos cuando no
 * daría dos fechas distintas para el mismo hecho según cómo el banco redactó la línea. Dos días es el
 * plazo declarado del instrumento y el sesgo es el que corresponde — si tarda más, la plata aparece un
 * día tarde en el plan; si se proyectara más lejos, el plan mostraría un bache que no existe.
 */
export const DIAS_ACREDITACION = 2

/**
 * CUÁNTOS DÍAS ALREDEDOR SE BUSCA LA COBRANZA QUE YA LLEVA ESTE DEPÓSITO.
 *
 * Diez. La fecha con la que se registra un cobro por eCheq es la que el dueño elige (la del valor, la
 * de la factura, la del depósito) y rara vez es la del movimiento bancario. La identidad la da el
 * IMPORTE AL CENTAVO: dos cobros distintos del mismo importe exacto en diez días son posibles pero
 * mucho menos probables que el mismo cobro registrado con dos fechas.
 */
export const VENTANA_COBRANZA = 10

/** NÚCLEO PURO: `serial` + `n` días HÁBILES. No conoce feriados, y eso está declarado abajo. */
export function masDiasHabiles(serial, n = DIAS_ACREDITACION) {
  let s = serial
  let faltan = n
  while (faltan > 0) {
    s += 1
    // El serial 2 fue lunes: `(s - 2) % 7` da 5 el sábado y 6 el domingo.
    const dia = ((s - 2) % 7 + 7) % 7
    if (dia < 5) faltan -= 1
  }
  return s
}

/**
 * `_BANCO_RAW` → los depósitos RETENIDOS, como ingreso PROYECTADO a su fecha de acreditación.
 *
 * @param {Array<Array>} filas `_BANCO_RAW`: A fecha · B concepto · C importe · D saldo · E signo · F naturaleza
 * @param {object} ctx
 * @param {Array} ctx.ingresosDelLibro los movimientos de ENTRADA que el libro ya emitió (Cobranzas y
 *        `_CHEQUES_RAW`): si uno de ellos ya lleva este depósito, no se emite.
 * @param {number} ctx.fila0
 * @returns {{movimientos:Array, avisos:string[]}}
 */
export function deDepositosRetenidos(filas = [], { ingresosDelLibro = [], fila0 = 4 } = {}) {
  const avisos = []
  const movimientos = []
  for (let i = fila0 - 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const fecha = num(f[0])
    const importe = num(f[2])
    if (fecha === null || !esRetenida({ importe: f[2], saldo: f[3] })) continue
    // SÓLO LOS DEPÓSITOS. Un débito sin saldo corrido existe —el banco también lista salidas que no
    // asentó— y proyectarlo como ingreso sería invertir el signo de la plata. `expresionRetenido` suma
    // todo porque a CAJA le interesa el NETO que no está acreditado; acá se emite un ingreso, y un
    // ingreso negativo no es un ingreso.
    if (importe <= 0) {
      avisos.push(`libro-extractores-retenidos: _BANCO_RAW f${i + 1} tiene ${pesos(importe)} sin saldo `
        + 'corrido y es una SALIDA, no un depósito. No la emito como ingreso; CAJA ya la resta del '
        + 'disponible. Si el banco la asienta, el extracto siguiente va a traer su saldo.')
      continue
    }
    const ya = ingresosDelLibro.find((m) => m?.signo === ENTRA
      && Math.abs(Math.abs(m.importe) - importe) <= 1
      && Math.abs(m.fecha - fecha) <= VENTANA_COBRANZA)
    if (ya) {
      avisos.push(`libro-extractores-retenidos: el depósito retenido de ${pesos(importe)} del `
        + `${isoDeSerial(fecha)} (_BANCO_RAW f${i + 1}) ya está en el libro como ${ya.estado} por `
        + `${ya.origen?.pestana} f${ya.origen?.fila} — NO lo emito: sumarlo sería contar el mismo cobro `
        + 'dos veces, que es el defecto que ya tuvo este rubro con el eCheq de LA ESTRELLA.')
      continue
    }
    const acredita = masDiasHabiles(fecha)
    movimientos.push(movimiento({
      fecha: acredita,
      signo: ENTRA,
      importe,
      concepto: `${txt(f[1])} · acredita el ${isoDeSerial(acredita)}`,
      contraparte: 'Banco Santander',
      rubro: RUBRO_CARTERA,
      // PROYECTADO y no REAL: la plata está depositada y NO está acreditada. El cuadro abre esta línea
      // bajo «Ingresos proyectados» y un REAL acá caería en «· Otros» (cash-flow-conectividad).
      estado: 'PROYECTADO',
      instrumento: 'echeq',
      referenciaBanco: `${fecha}|${txt(f[1])}|${importe}`,
      origen: { pestana: PESTANA_BANCO, fila: i + 1 },
    }))
    avisos.push(`libro-extractores-retenidos: ${pesos(importe)} depositados el ${isoDeSerial(fecha)} y `
      + `retenidos por el banco entran como ingreso PROYECTADO al ${isoDeSerial(acredita)} `
      + `(${DIAS_ACREDITACION} días hábiles). LÍMITE: el cálculo no conoce feriados, así que un feriado `
      + 'en el medio adelanta la fecha un día. Cuando el banco acredite, la caja lo va a tener y este '
      + 'movimiento deja de emitirse solo.')
  }
  return { movimientos, avisos }
}
