// «CARGAS SOCIALES A PAGAR» — el bloque de «Impuestos y Financieros» que lee Postgres.
//
// Pedido del dueño 17/09/2026: lo que corresponde pagar de cargas sociales, conectado a Supabase y al
// Sheet. La fuente es `impuesto_posicion` —la misma que la pantalla /administracion/impuestos— y la
// regla de qué fila entra (`pendientesDeCargas`) es LA MISMA función que usa la pantalla: dos caras,
// una definición.
//
// ═══ POR QUÉ UN IMPORTE Y NO UNA FÓRMULA ═══
//
// El resto de la pestaña referencia celdas porque su fuente vive en el Sheet. Ésta no: la obligación
// y lo pagado contra ella los escribe `impuestos-a-postgres.mjs` en la base. Una fórmula acá tendría
// que apuntar a una réplica _RAW que no existe; el importe se copia en cada corrida y la columna O
// declara de dónde sale. El TOTAL sí es fórmula sobre esas filas.
//
// ═══ NO ES EL CUADRO DE PLANES ═══
//
// El cuadro de planes vive en «Cargas Sociales» y el 09/09/2026 se sacó de acá por duplicado. Esto
// es otra pregunta —qué falta pagar, F931 del mes incluido— y publica sólo lo pendiente.
import { pendientesDeCargas, cuotaDePlan } from '../../src/features/administracion/services/impuestosCargas.ts'
import { rotuloPeriodo } from '../../src/features/administracion/services/impuestos.ts'
import { seccion, total as rotuloTotal } from './patron-pestana.mjs'

export const TITULO_CARGAS = 'Cargas sociales a pagar'
const ORIGEN = 'Postgres `impuesto_posicion` (sincronizador impuestos-a-postgres): obligación menos lo pagado imputado. Importe copiado de la base en cada corrida.'

const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

/**
 * El rótulo de la fila: el F931 con su mes; la cuota ADELANTE de su plan («Cuota 3/3 · Plan F931
 * W303094»). Al revés, «Plan …» en la columna A es un encabezado para `auditarPatron` (ES_ENCABEZADO)
 * y la pestaña se lee como dos grillas de distinto ancho.
 */
export const rotuloCarga = (f) => {
  const c = cuotaDePlan(f.concepto)
  return c ? `Cuota ${c.n}/${c.de} · ${c.plan}` : `F931 ${rotuloPeriodo(f.periodo)}${f.concepto === 'ddjj' ? '' : ` · ${f.concepto}`}`
}

/** Lo que el número todavía no es: «estimado», «vence supuesto». Vacío cuando es dato firme. */
export const marcaCarga = (f) => [f.estado === 'estimado' ? 'estimado' : '', f.vencimiento_confianza === 'supuesto' ? 'vence supuesto' : '']
  .filter(Boolean).join(' · ')

/** numeric y date de `pg` a la forma que usa la regla compartida. */
export const aPosicion = (r) => {
  const n = (v) => (v === null || v === undefined ? null : Number(v))
  return {
    ...r, determinado: n(r.determinado), creditos: n(r.creditos), a_pagar: n(r.a_pagar), saldo_a_favor: n(r.saldo_a_favor),
    pagado: Number(r.pagado ?? 0), pendiente: n(r.pendiente),
  }
}

/** SIN .catch: si la base no contesta, la pestaña no se escribe diciendo que no hay nada que pagar. */
export async function leerPosicionCargas(query) {
  const { rows } = await query(`select impuesto, periodo, concepto, fuente, estado, to_char(vencimiento,'YYYY-MM-DD') vencimiento,
    vencimiento_confianza, determinado, creditos, a_pagar, saldo_a_favor, pagado, pendiente, datos_al, detalle
    from public.impuesto_posicion where impuesto = 'cargas_sociales'`)
  return rows.map(aPosicion)
}

/**
 * Escribe la sección `n` sobre la grilla: una fila por obligación pendiente —importe en B, «vence
 * dd/mm» en C, la marca en D— y el total por fórmula. Sin pendientes, una sola fila que lo dice: la
 * sección no desaparece, porque «no hay nada» también es una respuesta.
 */
export function bloqueCargasSociales(G, { filas, n }) {
  G.push([seccion(n, TITULO_CARGAS)])
  const pend = pendientesDeCargas(filas)
  if (!pend.length) {
    G.lista('Nada pendiente', [], ORIGEN)
    G.blanco()
    return { fTotal: null, pendientes: pend }
  }
  const d0 = G.n() + 1
  for (const f of pend) {
    G.lista(rotuloCarga(f), [f.pendiente ?? 'sin importe', f.vencimiento ? `vence ${ddmm(f.vencimiento)}` : 'sin vencimiento', marcaCarga(f)], ORIGEN)
  }
  const fTotal = G.lista(rotuloTotal('Cargas sociales pendientes'), [`=SUM(B${d0}:B${G.n()})`], 'Suma de las filas de arriba.')
  G.blanco()
  return { fTotal, pendientes: pend }
}
