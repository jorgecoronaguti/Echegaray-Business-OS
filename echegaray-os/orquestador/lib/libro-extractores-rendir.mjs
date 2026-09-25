// EFECTIVO A RENDIR EN EL LIBRO — la línea «fondos en manos de la gente» del Cash Flow percibido.
//
// ═══ EL DESCUADRE QUE ESTO CIERRA (22/09/2026) ═══
//
// Administración ENTREGA $800.000 a una persona. CAJA baja ese día: el billete salió del cajón
// (`_EFECTIVO_RAW`, renglones del anexo). El Cash Flow no bajaba: la entrega no estaba en el libro.
// Días después la persona rinde un ticket de $96.400 —fila de Compras con Tipo pago «A rendir»— y ahí
// el Cash Flow SÍ baja, por Materiales, en una fecha en que la caja no se movió. Los dos cuadros miran
// la misma plata con fechas distintas, y el que decide ve dos saldos que no cierran.
//
// ═══ EL TRATAMIENTO: UN ANTICIPO, CON LÍNEA PROPIA ═══
//
// Un fondo a rendir es un anticipo —plata de la empresa en manos de alguien—, no un gasto. Una sola
// línea de egreso, «Efectivo a rendir (fondos en manos de la gente)», que en cada período es
//
//     − entregado + devuelto + rendido
//
// · la entrega SALE (REAL, su fecha), la devolución ENTRA con el mismo rubro;
// · cada gasto «A rendir» que `deCompras` emitió se ESPEJA: entra a esta línea por el mismo importe,
//   la misma fecha y el mismo estado. El gasto sigue saliendo por su rubro (Materiales, la obra) —el
//   dueño lo quiere ver ahí— y el espejo le devuelve al fondo lo que el fondo ya había pagado.
//
// Día de la entrega: la línea −800.000. Día del ticket: Materiales −96.400 y la línea +96.400. Neto
// de cualquier período = variación real de la caja. Sin doble conteo y sin perder el rubro.
//
// Un movimiento que ENTRA con rubro de egreso es una devolución que netea su propio rubro del lado
// del egreso (`esDevolucion`, cash-flow-rubros.mjs): por eso la sub-línea del cuadro muestra
// entregado − devuelto − rendido en positivo, como todo egreso, y el Resultado no se mueve un peso.
//
// ═══ POR QUÉ EN EL LIBRO Y NO UNA FÓRMULA EN LA MATRIZ ═══
//
// El Mensual y el Semanal no suman fórmulas por línea desde el 06/08: toda celda es `terminoLibro`
// sobre `_MOVIMIENTOS`, y de ese libro cuelgan también el Resultado, el saldo final, la apertura
// «Por cliente», los gráficos, la serie de saldos de CAJA, la persistencia en Postgres (`flujo_*`) y
// el cuadre entre las dos vistas. Una fila con fórmula propia sobre `_EFECTIVO_RAW` y Compras tendría
// que agregarse a mano en cada uno de esos consumidores —y el que se olvide publica un saldo que no
// cierra contra CAJA—. En el libro entra UNA vez y la ven todos. El patrón de «Comisiones bancarias»
// (`formulaComisionesMes`) es de la matriz retirada; su versión viva también es un extractor.
//
// Lo que sí se conserva del pedido «nada calculado en JS y pegado»: la entrega y la devolución son
// FILAS de la réplica, una por movimiento, con su origen; el espejo del gasto escribe su estado e
// importe como FÓRMULA contra la misma celda de Compras que la fila original (`fuenteViva`), así que
// cuando el dueño marca «Pagado» los dos lados se promueven juntos, sin esperar la corrida.
//
// NÚCLEO PURO: no lee Google ni la base.

import { movimiento, ENTRA, SALE } from './libro-movimientos.mjs'
import { INSTRUMENTO_A_RENDIR, INSTRUMENTO_EFECTIVO } from './caja-canales.mjs'
// Las columnas de la réplica son las MISMAS que lee CAJA: una sola declaración del contrato.
import { RENDIR } from './caja-fuentes-banco.mjs'

// La línea del cuadro vive declarada en la taxonomía (un rubro de EGRESO): acá se importa, no se tipea.
import { RUBRO_FONDOS_A_RENDIR } from './cash-flow-rubros.mjs'

export { RUBRO_FONDOS_A_RENDIR }
/** El origen de todo lo que emite este archivo (la réplica que también lee CAJA). */
export const ORIGEN_RENDIR = RENDIR.hoja

/** Letra → índice 0-based ('A'→0). La réplica es del OS: sus letras no se corren con «Obra». */
const indiceDeColumna = (l) => String(l).toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()

/**
 * `_EFECTIVO_RAW` → las entregas (SALE) y las devoluciones (ENTRA), REAL en su fecha.
 *
 * EL MISMO CRITERIO QUE CAJA, NO UNO PARECIDO: `formulaEntregasARendirPosteriores` cuenta la fila si
 * E dice exactamente «Entrega»/«Devolución», A es un NÚMERO y F es un número. Una fecha guardada como
 * texto la ignora CAJA; si el libro la contara, los dos cuadros volverían a discrepar por esa fila. Se
 * saltea y se AVISA, que es la mitad que CAJA no puede hacer.
 *
 * @param {Array<Array>} filas la réplica entera leída con UNFORMATTED_VALUE (fila 1 = título)
 * @param {{aviso?:(m:string)=>void}} [o]
 * @returns {Array} movimientos
 */
export function deEfectivoARendir(filas = [], { aviso = () => {} } = {}) {
  const c = {
    fecha: indiceDeColumna(RENDIR.fecha), entrega: indiceDeColumna(RENDIR.entrega),
    persona: indiceDeColumna(RENDIR.persona), movimiento: indiceDeColumna(RENDIR.movimiento),
    importe: indiceDeColumna(RENDIR.importe),
  }
  const out = []
  for (let i = RENDIR.desde - 1; i < (filas?.length ?? 0); i++) {
    const f = filas[i] ?? []
    const tipo = txt(f[c.movimiento])
    // EL ADELANTO DE SUELDO (25/09/2026) VUELVE DEL FONDO como la devolución: el sueldo en efectivo de la quincena
    // sale entero por Nómina al pagarse, y ese entero lo incluye. Ver `MOVIMIENTOS_QUE_VUELVEN` en CAJA.
    const esAdelanto = tipo === 'Adelanto de sueldo'
    if (tipo !== 'Entrega' && tipo !== 'Devolución' && !esAdelanto) continue
    const fecha = num(f[c.fecha])
    const importe = num(f[c.importe])
    if (fecha === null || importe === null) {
      aviso(`_EFECTIVO_RAW f${i + 1}: ${tipo} sin fecha o importe numérico — CAJA tampoco la cuenta; no entra al libro`)
      continue
    }
    const entrega = txt(f[c.entrega])
    const persona = txt(f[c.persona])
    out.push(movimiento({
      fecha,
      // La réplica trae el signo de la caja (entrega negativa). El libro guarda magnitud y signo aparte,
      // y el signo lo decide el TIPO: una entrega con importe positivo tipeado no puede entrar al cajón.
      signo: tipo === 'Entrega' ? SALE : ENTRA,
      importe: Math.abs(importe),
      concepto: esAdelanto
        ? `Adelanto de sueldo pagado de ${entrega} · ${persona} → ${txt(f[indiceDeColumna('D')]).replace(/^Sueldo de /, '')}`.trim()
        : `${tipo} a rendir ${entrega} · ${persona}`.trim(),
      contraparte: persona,
      rubro: RUBRO_FONDOS_A_RENDIR,
      estado: 'REAL',
      // Es billete del cajón: el canal de la caja física. `INSTRUMENTO_A_RENDIR` es el del GASTO.
      instrumento: INSTRUMENTO_EFECTIVO,
      origen: { pestana: ORIGEN_RENDIR, fila: i + 1 },
    }))
  }
  return out
}

/**
 * EL ESPEJO DE LO RENDIDO: por cada gasto «A rendir» del libro, el mismo importe VUELVE a la línea
 * de fondos, con la misma fecha y el mismo estado.
 *
 * SE ARMA SOBRE EL LIBRO YA CONSOLIDADO, NO SOBRE LO QUE EMITIÓ `deCompras`. Entre la extracción y
 * la escritura, el libro deduplica (una fila puede caerse por la clave) y cruza contra el extracto (un
 * pendiente puede pasar a REAL). Espejar antes sería espejar un libro que ya no existe: el fondo
 * recuperaría plata de una fila descartada o quedaría PROYECTADO frente a un gasto REAL.
 *
 * Sin cliente ni obra, a propósito: el espejo no es costo de nadie. Si llevara el cliente, la apertura
 * «Por cliente» netearía el gasto de la obra contra sí mismo y el ticket desaparecería de su costo.
 *
 * @param {Array} libro el libro consolidado
 * @returns {Array} los movimientos espejo (a agregar al libro)
 */
export function rendidoDelLibro(libro = []) {
  return (libro ?? []).filter((m) => m?.instrumento === INSTRUMENTO_A_RENDIR && m?.rubro !== RUBRO_FONDOS_A_RENDIR)
    .map((m) => ({
      ...movimiento({
        fecha: m.fecha,
        signo: m.signo === SALE ? ENTRA : SALE,
        importe: m.importe,
        concepto: `Rendido · ${m.concepto}`,
        contraparte: m.contraparte,
        rubro: RUBRO_FONDOS_A_RENDIR,
        estado: m.estado,
        instrumento: INSTRUMENTO_A_RENDIR,
        // Clave propia por origen: sin CUIT ni comprobante, no puede chocar con la factura que espeja.
        origen: { pestana: ORIGEN_RENDIR, fila: `rendido:${m.origen?.pestana}:${m.origen?.fila ?? '?'}` },
      }),
      espejoDe: Object.freeze({ origen: m.origen, signo: m.signo, saldoVivo: m.saldoVivo === true }),
    }))
}

/**
 * Lo que las celdas vivas de `_MOVIMIENTOS` (estado H, importe C) tienen que mirar para un movimiento.
 * Para el espejo, la fila de Compras que espeja: así los dos lados se promueven con la misma marca.
 * Para cualquier otro, el propio movimiento.
 */
export function fuenteViva(m) {
  if (!m?.espejoDe) return m
  return { ...m, origen: m.espejoDe.origen, signo: m.espejoDe.signo, saldoVivo: m.espejoDe.saldoVivo }
}
