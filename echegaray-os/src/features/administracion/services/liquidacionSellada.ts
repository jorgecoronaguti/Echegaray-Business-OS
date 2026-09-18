// EL CUADRO DE UNA QUINCENA CERRADA SALE DE `liquidacion_linea`, NO DE UN RECÁLCULO.
//
// Regla del dueño: una quincena CERRADA muestra lo que quedó sellado al cerrarla —horas, $/h, cobra, adelantos, banco,
// efectivo, total— y no lo que darían los registros de horas y las tarifas de HOY. Lo vivo se usa sólo en la abierta.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR (auditor independiente, 18/09/2026) ═══
//
// La rama `liq-ui-limpia` dijo haberlo corregido y no lo hizo: la cerrada seguía pasando por `armarCuadros` con
// `persona_tarifa` (desde ≤ hasta) y `horasPorPersona(registros_hh)`, y el sello de la fila tomaba `l.valorHora` de esa
// cuenta. Medido contra la base real:
//
//   Bazán, 16–31/03        sellado 9 h × $4.300 = $38.700      pantalla «se liquidó a $4.000/h · cobra $36.000»
//   1ª de junio, obreros   20 líneas · 1.886,5 h · $9.393.250   pantalla 1.676,5 h · $7.970.750
//   Agüero, 1ª de junio    87 h · cobra 469.800 · pagado 469.800 · saldo 0   pantalla cobra $91.800 · saldo −378.000
//   Gonzales Abel, 1ª jun  94 h × $4.000 = $376.000            pantalla «sin tarifa» (no tiene fila en persona_tarifa)
//
// Los cuatro son la misma causa: la foto estaba en la base y la pantalla no la leía.
//
// ═══ QUÉ DECIDE ACÁ ═══
//
//   · Una persona con línea sellada en el cuadro → su fila es la foto, columna por columna. El $/h es
//     `liquidacion_linea.valor_hora`, aunque `persona_tarifa` diga otra cosa (Bazán: 4.300 sellado, 4.000 vigente).
//   · Una columna sellada vacía (quincena vieja) queda `null`: la pantalla dice «sin dato sellado». No se rellena
//     con el cálculo de hoy, porque eso sería publicar como pagado algo que el cierre no selló.
//   · Quien está en el cuadro vivo y NO tiene línea sellada en ningún cuadro cerrado queda con todo en `null` y
//     `sinLinea`: se ve, y se dice que nada suyo es dato sellado. Sacarlo de la vista escondería el caso.
//   · Quien está sellado en OTRO cuadro (Oficina, por ejemplo) no se repite acá: la cabecera sellada manda sobre el
//     criterio de hoy («jefe de obra» o «neto mensual vigente»).
//
// Puro: sin base, sin React. Tests en `liquidacionSellada.test.ts`.

import { repartoDelAcuerdo } from './liquidacionAcuerdo.ts'
import type { LineaSelladaLeida } from './liquidacionGuardadas.ts'
import { modalidadDe, type GrupoLiquidacion, type LineaLiquidada } from './liquidacionQuincena.ts'
import { ordenarComoPersonal } from './ordenDePersonal.ts'

/** De dónde salió la retribución de una fila cerrada. Va en `origenTarifa` y en el `title` de la celda. */
export const ORIGEN_SELLADO = 'sellado al cerrar la quincena'

export interface PersonaSellable {
  id: string
  nombre: string
  esJefe: boolean
}

export interface EntradaDelCuadroSellado {
  grupo: GrupoLiquidacion
  /** Las líneas de la cabecera cerrada de ESTE grupo (`leerGuardadas().lineasSelladas`). */
  selladas: readonly LineaSelladaLeida[]
  /** Las líneas que el cálculo vivo armó para este grupo. Sólo aportan identidad y el recibo del período. */
  vivas: readonly LineaLiquidada[]
  /** El directorio: quien está sellado y no aparece en lo vivo también tiene fila. */
  personas: ReadonlyMap<string, PersonaSellable>
  /** Los `persona_id` sellados en CUALQUIER cuadro cerrado de la quincena: nadie se repite. */
  selladosEnLaQuincena: ReadonlySet<string>
  /** `liquidacion_linea.efectivo_redondeado`, por persona. */
  redondeos: ReadonlyMap<string, number | null>
}

export interface CuadroSellado {
  lineas: LineaLiquidada[]
  /** Quienes están en el cuadro sin línea sellada: la pantalla los rotula «sin línea sellada». */
  sinLinea: Set<string>
}

const r2 = (n: number): number => Math.round(n * 100) / 100

/** La fila sellada, dicha en la forma de `LineaLiquidada`. Cada columna es la de la base; ninguna se recalcula. */
function lineaDeLaFoto(
  s: LineaSelladaLeida, grupo: GrupoLiquidacion, persona: PersonaSellable, viva: LineaLiquidada | undefined,
  efectivoRedondeado: number | null,
): LineaLiquidada {
  const modalidad = modalidadDe(grupo)
  const cobra = s.cobra == null ? null : r2(s.cobra)
  return {
    personaId: s.personaId,
    nombre: persona.nombre,
    esJefe: persona.esJefe,
    // LAS HORAS SELLADAS SON LAS PAGAS: `cobra = horas × valor_hora` en la foto. No hay extras aparte que reconstruir.
    horas: s.horas,
    horasEquivalentes: s.horas,
    extras: [],
    valorHora: s.valorHora,
    // LA FOTO NO TIENE NETO MENSUAL, Y NO SE INVENTA (auditor, 18/09/2026). `cobra` es lo que se liquidó EN ESA
    // QUINCENA —Maldonado 16–31/03: 105 h × $8.125 = $853.125, porque hasta agosto JORNALES liquidaba a los jefes por
    // hora—, y publicarlo como neto mensual lo rotulaba «Cobra al mes» y «Sueldos del mes». El importe es `cobra`.
    netoMensual: null,
    modalidad,
    cobra,
    adelanto: r2(s.adelanto),
    yaTransferido: r2(s.yaTransferido),
    porBanco: r2(s.porBanco),
    enEfectivo: s.enEfectivo == null ? null : r2(s.enEfectivo),
    total: s.total == null ? null : r2(s.total),
    efectivoRedondeado,
    // LA FOTO NO ESTÁ «SIN TARIFA»: si el $/h vino vacío la pantalla dice «sin dato sellado» (ver `sinSello`), que es
    // otra afirmación. «Sin tarifa» abriría un pendiente sobre una quincena que ya se pagó.
    sinTarifa: false,
    // EL RECIBO DEL PERÍODO ES UN HECHO DE ESE PERÍODO (`nomina_recibo_neto`), no un dato de hoy: viaja de la línea viva
    // para la solapa Recibos. Lo GIRADO no se vuelve a inferir del extracto: el banco de la foto es `por_banco`.
    reciboNeto: viva?.reciboNeto ?? null,
    reciboSinGiro: false,
    ...repartoComoCampos(cobra, modalidad),
    origenTarifa: ORIGEN_SELLADO,
  }
}

const repartoComoCampos = (cobra: number | null, modalidad: LineaLiquidada['modalidad']) => {
  const r = repartoDelAcuerdo(cobra, modalidad)
  return { blancoAcuerdo: r.blanco, efectivoAcuerdo: r.efectivo }
}

/** La fila de quien no tiene línea sellada: nada suyo es dato sellado, y ninguna columna se rellena con hoy. */
function lineaSinFoto(viva: LineaLiquidada, efectivoRedondeado: number | null): LineaLiquidada {
  return {
    ...viva,
    horas: null, horasEquivalentes: null, extras: [],
    valorHora: null, netoMensual: null,
    cobra: null, adelanto: 0, yaTransferido: 0, porBanco: 0, enEfectivo: null, total: null,
    efectivoRedondeado,
    // NI EL RECIBO DE HOY (auditor, 18/09/2026): Oficina 16–31/08 decía «sin línea sellada» y a la vez publicaba el
    // recibo del estudio ($663.141,56 por jefe) como Banco y Saldo, porque `bancoDelMensual` caía al recibo. Sin foto,
    // nada vivo se cuela: ni recibo, ni banco, ni saldo.
    reciboNeto: null,
    sinTarifa: false, reciboSinGiro: false,
    blancoAcuerdo: null, efectivoAcuerdo: null,
    origenTarifa: null,
  }
}

/**
 * EL CUADRO CERRADO: una fila por línea sellada del grupo, más las personas del cálculo vivo que no tienen línea
 * sellada en ningún cuadro (`sinLinea`). Mismo orden que el resto del módulo Personal.
 */
export function cuadroSellado(e: EntradaDelCuadroSellado): CuadroSellado {
  const vivaDe = new Map(e.vivas.map((l) => [l.personaId, l]))
  const lineas: LineaLiquidada[] = []
  const sinLinea = new Set<string>()
  for (const s of e.selladas) {
    const viva = vivaDe.get(s.personaId)
    const persona = e.personas.get(s.personaId)
      ?? (viva ? { id: viva.personaId, nombre: viva.nombre, esJefe: viva.esJefe } : null)
    // UNA LÍNEA SELLADA DE ALGUIEN QUE NO ESTÁ EN EL DIRECTORIO NI EN LO VIVO no tiene nombre con qué dibujarse: se
    // publica igual, con su id, antes que desaparecer en silencio de una quincena pagada.
    lineas.push(lineaDeLaFoto(s, e.grupo, persona ?? { id: s.personaId, nombre: s.personaId, esJefe: false }, viva,
      e.redondeos.get(s.personaId) ?? null))
  }
  const yaEstan = new Set(lineas.map((l) => l.personaId))
  for (const v of e.vivas) {
    if (yaEstan.has(v.personaId) || e.selladosEnLaQuincena.has(v.personaId)) continue
    sinLinea.add(v.personaId)
    lineas.push(lineaSinFoto(v, e.redondeos.get(v.personaId) ?? null))
  }
  return { lineas: ordenarComoPersonal(lineas, (l) => l.nombre, (l) => l.esJefe), sinLinea }
}

/**
 * LOS DÍAS DE UNA QUINCENA CERRADA NO SE DIBUJAN (auditor, 18/09/2026).
 *
 * `liquidacion_linea` sella el TOTAL de horas, no los días. Bajo el rótulo «Horas · sellada» la 1ª de junio mostraba
 * la grilla VIVA —1.676,5 h en la fila de totales, el mismo número que hizo caer esta pantalla la primera vez— al lado
 * de las 1.886,5 selladas; Agüero, una «A» roja y 17 h junto a sus 87 selladas. Lo cerrado muestra lo que se pagó, y
 * de los días no quedó foto: se sacan.
 *
 *   · todos los cuadros con filas están cerrados → sin columnas de día (`dias = []`) y sin celdas.
 *   · mezcla (un cuadro cerrado, otro abierto) → las columnas quedan para el abierto; las filas cerradas van en blanco.
 */
export function sinDiasVivos<C extends { fecha: string }, F extends { cerrada: boolean; celdas: C[] }>(
  filas: readonly F[], dias: readonly string[], blanco: (c: C) => C,
): { filas: F[]; dias: string[] } {
  const cerradas = filas.filter((f) => f.cerrada)
  if (cerradas.length === 0) return { filas: [...filas], dias: [...dias] }
  if (cerradas.length === filas.length) return { filas: filas.map((f) => ({ ...f, celdas: [] })), dias: [] }
  return { filas: filas.map((f) => (f.cerrada ? { ...f, celdas: f.celdas.map(blanco) } : f)), dias: [...dias] }
}
