// EL SAC (MEDIO AGUINALDO) — la línea del cash flow que no tenía fuente.
//
// ═══ EL HUECO, DECLARADO DESDE EL 13/08/2026 Y ABIERTO HASTA HOY ═══
//
// `cash-flow-cobertura.mjs` lo dice con todas las letras: *«HUECO DECLARADO: el aguinaldo es
// ESTACIONAL (junio y diciembre), no una serie mensual. Hoy sólo entra si alguien lo tipea en
// Compras, así que el medio aguinaldo de diciembre puede no estar en el cuadro»*. El dueño ordenó el
// 11/09/2026 vaciar de Compras todo lo que no sea Civil/Estructura/Mantenimiento: el único emisor de
// la línea se va, y el hueco pasa de declarado a total.
//
// ═══ LAS DOS MITADES, Y POR QUÉ NO SE TRATAN IGUAL ═══
//
// · **EL FUTURO SE PROYECTA.** El medio aguinaldo de diciembre existe con certeza y su monto se
//   deriva de la nómina: *50 % de la mayor remuneración mensual devengada en el semestre* (LCT 121 y
//   122). La serie de nómina ya la publica el libro, así que el SAC cuelga de ella y no de un número
//   tipeado: si la proyección de jornales cambia, el SAC cambia con ella.
//
// · **EL PASADO NO SE PROYECTA NUNCA.** Ésta es la decisión que más importa y es contraintuitiva: si
//   la ventana de pago ya pasó y el banco no muestra un lote que lo respalde, NO se emite nada. El
//   SAC de junio de 2026 se pagó —estamos en septiembre— y lo más probable es que haya salido adentro
//   de un lote de haberes que alguna quincena ya reclamó. Emitirlo como VENCIDO publicaría millones
//   de deuda que no existe, que es la regla de oro 2 al revés: una estimación presentada como hecho,
//   en la dirección que asusta. Se avisa con nombre y monto para que se pueda preguntar.
//
// ═══ EL REAL SE INFIERE POR VENTANA, Y SE DICE QUE ES UNA INFERENCIA ═══
//
// El extracto no distingue un SAC de una quincena: los dos salen como «Pago haberes».
// `haberes-conciliacion.mjs` ya dejó escrito el límite: *«la diferencia puede ser oficina, SAC o una
// liquidación final, y este módulo NO puede decidirlo… se reporta, no se imputa»*. Acá se imputa una
// sola cosa y bajo una condición dura: un lote de haberes que **ninguna quincena reclamó** (no está
// en `usados`, el Set compartido que la nómina llena ANTES) y que cae dentro de la ventana en la que
// el SAC vence por ley. Todo movimiento así sale con el aviso «inferido por ventana» y el dueño puede
// desmentirlo; lo que no puede pasar es que la plata no esté en ninguna línea del cuadro.
//
// NÚCLEO PURO: recibe los débitos, los movimientos de nómina ya emitidos y las filas de Compras.

import { movimiento, SALE } from './libro-movimientos.mjs'
import { isoDeSerial, serialDe } from './libro-extractores-fechas.mjs'
import { NAT } from './banco-santander.mjs'
import { mesDeSerial } from './libro-extractores-cargas.mjs'
import { remuneracionMensualDeLaNomina } from './libro-extractores-nomina.mjs'
import { obligacionesDeCompras } from './libro-extractores-banco-obligaciones.mjs'

const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

/** El rubro del cuadro. Mismo texto que `rubro-caja.mjs`: la taxonomía es una sola. */
export const RUBRO_SAC = 'Nómina · SAC'

/**
 * LAS DOS CUOTAS DEL SAC, con su vencimiento legal y la ventana en la que el pago puede aparecer.
 *
 * El vencimiento es el 30 de junio y el 18 de diciembre (LCT 122, y el segundo con la fecha que fija
 * el decreto 1078/84: 18/12). La ventana es más ancha que el día porque el pago real se adelanta o se
 * atrasa con el calendario de la quincena — pero no tanto como para tragarse el lote de la quincena
 * del 15, que se paga alrededor del 17. Medido contra los lotes de 2026.
 */
export const CUOTAS_SAC = Object.freeze([
  Object.freeze({
    semestre: 1, vence: [6, 30], ventana: [[6, 20], [7, 5]], meses: [1, 2, 3, 4, 5, 6],
    // ═══ `atribucion` NO ES `meses`, Y CONFUNDIRLOS COSTÓ UNA MEDICIÓN (11/09/2026) ═══
    //
    // `meses` son los meses que se DEVENGAN (sobre los que se busca la mejor remuneración).
    // `atribucion` es la ventana de FECHA DE CAJA en la que una fila de Compras que dice «SAC» puede
    // pertenecer a este semestre — y es más ancha, porque el aguinaldo de junio se paga el 30/06 pero
    // también el 3 de julio. Con `meses` como criterio, la fila pagada en julio se atribuía al SEGUNDO
    // semestre y bloqueaba la proyección de diciembre: medido en la simulación, $7,98 M que aparecían
    // y desaparecían según el mes en que alguien cargó la fila.
    atribucion: [[6, 1], [8, 15]],
  }),
  Object.freeze({
    semestre: 2, vence: [12, 18], ventana: [[12, 15], [12, 31]], meses: [7, 8, 9, 10, 11, 12],
    atribucion: [[11, 15], [12, 31]],
  }),
])

/** La proporción del mejor mes del semestre. Es la ley, no un parámetro: no se configura. */
export const PROPORCION_SAC = 0.5

/**
 * EL SAC → lo que el banco ya pagó (inferido) y lo que falta pagar (proyectado).
 *
 * @param {object} e
 * @param {Array} e.debitos        los de `debitosDelExtracto(banco)`
 * @param {Set<number>} e.usados   el Set compartido. LA NÓMINA TIENE QUE HABER CORRIDO ANTES.
 * @param {Array} e.nomina         los movimientos de nómina ya emitidos (jornales + administración)
 * @param {Array<Array>} e.compras Compras entera, para el dedupe transicional
 * @param {number|null} e.corte    serial de hoy: lo anterior al corte no se proyecta
 * @param {number} e.anio          el año del libro
 * @returns {{movimientos:Array, avisos:string[]}}
 */
export function deSac({ debitos = [], usados = new Set(), nomina = [], compras = [], corte = null, anio } = {}) {
  const avisos = []
  const movimientos = []
  const año = Number.isFinite(anio) ? anio : Number(isoDeSerial(corte ?? 0).slice(0, 4))
  if (!año) {
    avisos.push('libro-extractores-sac: sin año no sé en qué semestre estoy — no emito nada.')
    return { movimientos, avisos }
  }
  const remuneracion = remuneracionMensualDeLaNomina(nomina, mesDeSerial)
  const enCompras = obligacionesDeCompras(compras, [RUBRO_SAC])

  for (const c of CUOTAS_SAC) {
    // ═══ EL DEDUPE TRANSICIONAL ES POR SEMESTRE, NO POR IMPORTE ═══
    //
    // La fila de Compras que tipea el SAC no tiene por qué coincidir con lo que el banco pagó ni con
    // lo que la ley da: es el número que alguien estimó. Lo único que se puede afirmar es que esa
    // fila YA representa el aguinaldo de su semestre, y que emitir otro al lado lo duplicaría.
    const desdeAtrib = serialDe(año, c.atribucion[0][0], c.atribucion[0][1])
    const hastaAtrib = serialDe(año, c.atribucion[1][0], c.atribucion[1][1])
    const ya = enCompras.filter((o) => o.fecha >= desdeAtrib && o.fecha <= hastaAtrib)
    if (ya.length) {
      avisos.push(`libro-extractores-sac: el SAC del semestre ${c.semestre} ya está en Compras `
        + `(${ya.map((o) => `f${o.fila} ${pesos(o.total)}`).join(', ')}) — no emito: mientras esa fila `
        + 'exista, la línea sale de ahí.')
      continue
    }
    const desde = serialDe(año, c.ventana[0][0], c.ventana[0][1])
    const hasta = serialDe(año, c.ventana[1][0], c.ventana[1][1])
    const vence = serialDe(año, c.vence[0], c.vence[1])
    const real = lotesLibresEnLaVentana(debitos, usados, desde, hasta)
    if (real.length) {
      for (const r of real) {
        for (const fila of r.filas) usados.add(fila)
        movimientos.push(movimiento({
          fecha: r.fecha,
          signo: SALE,
          importe: r.importe,
          concepto: `SAC · semestre ${c.semestre} de ${año} · inferido por ventana`,
          contraparte: 'Personal',
          rubro: RUBRO_SAC,
          estado: 'REAL',
          instrumento: 'transferencia',
          // La identidad es la FECHA del lote, no una fila: el lote llega partido en un movimiento por
          // persona y con `origen.fila` de uno de ellos la clave colapsaría los demás.
          origen: { pestana: '_BANCO_RAW', fila: `sac:${isoDeSerial(r.fecha)}` },
        }))
        avisos.push(`libro-extractores-sac: ${pesos(r.importe)} de haberes el ${isoDeSerial(r.fecha)} `
          + `(${r.filas.length} movimiento(s), _BANCO_RAW f${r.filas.join(', f')}) que NINGUNA quincena `
          + `reclama, dentro de la ventana del SAC del semestre ${c.semestre} → los imputo al SAC. `
          + 'ES UNA INFERENCIA POR VENTANA: si ese lote era otra cosa (una liquidación final, un '
          + 'adelanto), decilo y se ajusta la regla.')
      }
      continue
    }
    // SIN RESPALDO Y CON LA FECHA PASADA: se avisa y no se emite. Ver la cabecera.
    if (Number.isFinite(corte) && vence < corte) {
      avisos.push(`libro-extractores-sac: el SAC del semestre ${c.semestre} de ${año} venció el `
        + `${isoDeSerial(vence)} y no hay ni fila en Compras ni lote de haberes libre que lo respalde. `
        + 'NO lo emito como deuda: lo más probable es que haya salido adentro de un lote que una '
        + 'quincena ya reclamó, y publicarlo como vencido inventaría millones de deuda.')
      continue
    }
    const base = mejorMesDelSemestre(remuneracion, año, c.meses)
    if (!base) {
      avisos.push(`libro-extractores-sac: el semestre ${c.semestre} de ${año} no tiene ningún mes de `
        + 'nómina con importe, así que no hay base sobre la que calcular el aguinaldo. No proyecto.')
      continue
    }
    const importe = Math.round(base.importe * PROPORCION_SAC * 100) / 100
    movimientos.push(movimiento({
      fecha: vence,
      signo: SALE,
      importe,
      concepto: `SAC · semestre ${c.semestre} de ${año} · 50% de ${base.mes}`,
      contraparte: 'Personal',
      rubro: RUBRO_SAC,
      // PROYECTADO: la base es la proyección de la nómina, no una liquidación firmada.
      estado: 'PROYECTADO',
      instrumento: 'transferencia',
      origen: { pestana: PESTANA_SAC, fila: `semestre ${c.semestre}` },
    }))
    avisos.push(`libro-extractores-sac: SAC del semestre ${c.semestre} proyectado en ${pesos(importe)} `
      + `para el ${isoDeSerial(vence)} — 50% de ${base.mes}, el mejor mes de nómina del semestre `
      + `(${pesos(base.importe)}). LÍMITE DECLARADO: la ley mide la mejor remuneración POR PERSONA y `
      + 'esto mide el AGREGADO de la empresa. Con plantel estable se parecen; con rotación alta, el '
      + 'agregado queda alto. Es una proyección, no una liquidación.')
  }
  return { movimientos, avisos }
}

/** El `origen.pestana` del SAC proyectado: la serie de nómina de la que se deriva. */
export const PESTANA_SAC = 'Jornales por Quincena'

/**
 * NÚCLEO PURO: los lotes de haberes que NADIE reclamó dentro de la ventana, agrupados por día.
 *
 * Se agrupa por fecha porque el lote del banco llega partido en un movimiento por persona: dieciséis
 * filas del mismo pago no son dieciséis aguinaldos. Y se exige que estén LIBRES: `usados` ya tiene los
 * lotes que las quincenas se llevaron, y un débito respalda a una sola obligación.
 */
export function lotesLibresEnLaVentana(debitos = [], usados = new Set(), desde, hasta) {
  const porFecha = new Map()
  for (const d of debitos) {
    if (String(d.naturaleza ?? '').trim() !== NAT.sueldos) continue
    if (usados.has(d.fila)) continue
    if (!(d.fecha >= desde && d.fecha <= hasta)) continue
    const ya = porFecha.get(d.fecha) ?? { fecha: d.fecha, importe: 0, filas: [] }
    ya.importe = Math.round((ya.importe + d.importe) * 100) / 100
    ya.filas.push(d.fila)
    porFecha.set(d.fecha, ya)
  }
  return [...porFecha.values()].sort((a, b) => a.fecha - b.fecha)
}

/** NÚCLEO PURO: el mes de mayor remuneración del semestre, con su importe. `null` si no hay ninguno. */
export function mejorMesDelSemestre(remuneracion = new Map(), anio, meses = []) {
  let mejor = null
  for (const m of meses) {
    const mes = `${anio}-${String(m).padStart(2, '0')}`
    const importe = remuneracion.get(mes) ?? 0
    if (importe > (mejor?.importe ?? 0)) mejor = { mes, importe }
  }
  return mejor
}
