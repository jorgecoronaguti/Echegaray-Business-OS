// ═══ LA FOTO DEL CIERRE ES EL CUADRO (dueño, 02/10/2026) ═══
//
// «La foto sellada debe ser EXACTAMENTE lo que el cuadro muestra al momento de cerrar, para todos. Un concepto se
// define una sola vez: el cierre no puede tener su propia cuenta.»
//
// El defecto: `escribirFoto` sellaba los campos crudos de la línea (`porBanco`, `enEfectivo`, `total`) y el cuadro
// dibuja otra cosa: el mensual sale de `pagoDelMensual` (banco = los dos recibos del estudio del mes) y el jornalero de
// `l.pago`. Q2-09/2026, Maldonado y Nievas: el cuadro decía banco $1.391.446,92 / efectivo $1.108.553,08 y el cierre
// iba a sellar banco $0 / efectivo $2.500.000, porque `porBanco` de la línea sólo trae el recibo si el giro está en el
// lote del extracto. La quincena cerrada se lee de la foto, así que el histórico, los recibos reimpresos y Analíticas
// habrían quedado con el banco en cero para siempre.
//
// Por eso acá NO hay cuenta propia: los lados salen de las mismas funciones que pinta la fila. Lo único que se agrega es
// lo que la base exige (CHECK `liquidacion_linea_cierra`: total = banco + efectivo, a 2 decimales) y lo que sella la 1ª
// quincena del mensual, que no liquida.
//
// Las columnas de la foto quedan coherentes con cómo las relee la quincena cerrada (`sinOverrides`): banco = `por_banco`
// y efectivo = `cobra − por_banco`. Un adelanto o un «ya transferido» no se restan acá: en el cuadro son lo pagado
// (`pagado_banco`/`pagado_efectivo`), que viaja en su propia columna y el cierre no toca.

import type { LineaConOverrides } from './liquidacionOverrides.ts'
import type { GrupoLiquidacion } from './liquidacionQuincena.ts'
import { pagoDelMensual, tipoDeLiquidacion } from './liquidacionPorTipo.ts'
import { esperadoDeLaFila } from './esperadoDeLaFila.ts'

/** Las cuatro columnas de plata que escribe el cierre en `liquidacion_linea`. */
export interface PlataSellada {
  cobra: number
  porBanco: number
  enEfectivo: number
  total: number
}

export type FotoDeLaLinea =
  /** `liquida: false` = 1ª quincena del mensual: se sella sin plata (todo 0) y no hay nada que pagar ni arrastrar. */
  | { ok: true; plata: PlataSellada; liquida: boolean }
  /** No se puede sellar lo que el cuadro muestra. `motivo` va a la pantalla tal cual, con el nombre adelante. */
  | { ok: false; motivo: string }

/** Lo que una fila tiene que traer para que su foto salga del cuadro. */
export type LineaDelCuadro = Pick<LineaConOverrides,
  'modalidad' | 'cobra' | 'porBanco' | 'reciboNeto' | 'pagadoBanco' | 'pagadoEfectivo' | 'manual' | 'pago'
  | 'seLiquidaEnLa2da' | 'pagadoEnLa1ra' | 'sello' | 'pagoSinRegistrar' | 'arrastre'>

const r2 = (n: number): number => Math.round(n * 100) / 100

const SIN_PLATA: PlataSellada = { cobra: 0, porBanco: 0, enEfectivo: 0, total: 0 }

/** La diferencia que ya no se puede llamar redondeo: la misma tolerancia que `estadoDeCierre` usa para «no cierra». */
const TOLERANCIA = 0.5

export function fotoDeLaLinea(l: LineaDelCuadro, grupo: GrupoLiquidacion): FotoDeLaLinea {
  // LA 1ª DEL MENSUAL NO LIQUIDA EL MES (dueño, 02/10/2026): no se paga ahí, no emite recibo, no deja saldo. Se sella la
  // fila con los cuatro importes en 0 para que la quincena pueda cerrar; lo que el cuadro muestra de ella (el recibo de
  // la 1ª, como dato) lo relee la cerrada del recibo del período, no de la foto (`pagoDelMensual`).
  if (l.seLiquidaEnLa2da) return { ok: true, plata: SIN_PLATA, liquida: false }
  return tipoDeLiquidacion({ grupo, linea: l }) === 'mensual' ? delMensual(l) : delJornalero(l)
}

function delMensual(l: LineaDelCuadro): FotoDeLaLinea {
  const p = pagoDelMensual(l)
  if (p.sueldo == null) return { ok: false, motivo: 'no tiene cargado el sueldo del mes' }
  // SIN RECIBO DEL ESTUDIO el cuadro no afirma los lados (muestra sólo el total). Se sella lo que la línea ya trae como
  // girado —lo mismo que se sellaba antes de este arreglo—: es el único banco que consta.
  const banco = r2(p.banco ?? l.porBanco)
  const sueldo = r2(p.sueldo)
  return { ok: true, liquida: true, plata: { cobra: sueldo, porBanco: banco, enEfectivo: r2(sueldo - banco), total: sueldo } }
}

function delJornalero(l: LineaDelCuadro): FotoDeLaLinea {
  if (l.cobra == null) return { ok: false, motivo: 'no tiene importe calculado' }
  const cobra = r2(l.cobra)
  // BANCO Y EFECTIVO SON LOS DE LA FILA (`l.pago`): con «banco 0» escrito a mano el banco es 0 y el efectivo el total
  // entero (`todoEnEfectivo`); con un arrastre, el banco ya lo trae sumado. Sin un lado afirmado, el de la línea.
  const banco = r2(l.pago.banco ?? l.porBanco)
  const efectivo = r2(l.pago.negro ?? cobra - banco)
  const total = r2(banco + efectivo)
  // LA QUINCENA CERRADA RELEE efectivo = cobra − banco: si la fila no cierra, la foto no puede ser el cuadro.
  // LA RESTA DEL RECIBO ANTERIOR SALE POR BANCO Y NO ES DE ESTA QUINCENA (dueño, 02/10/2026): el banco la trae sumada y
  // `cobra` no. La fila cierra contra cobra + esa resta; sin esto, marcar la última pagada no podía cerrar la quincena.
  // Los lados todavía no descuentan lo pagado: adelanto y ya transferido no entran (`esperadoDeLaFila`).
  const esperado = esperadoDeLaFila({ cobra, arrastre: l.arrastre })
  if (Math.abs(total - esperado) > TOLERANCIA) {
    return { ok: false, motivo: `su fila no cierra: banco + efectivo da ${total.toFixed(2)} y cobra ${esperado.toFixed(2)}` }
  }
  return { ok: true, liquida: true, plata: { cobra, porBanco: banco, enEfectivo: efectivo, total } }
}

/** La fila y la plata que el cierre escribe por ella. */
export interface FotoDeLineaParaEscribir<L> { linea: L; plata: PlataSellada; liquida: boolean }

/**
 * LAS FOTOS DE TODO EL GRUPO, ANTES DE ESCRIBIR UNA SOLA. Si alguna fila no se puede sellar como el cuadro la muestra, no
 * se toca la base y el mensaje dice quién y por qué: «Hay líneas sin importe calculable» mandaba a adivinar cuál de 17.
 */
export function fotosDelGrupo<L extends LineaDelCuadro & { nombre: string }>(
  lineas: readonly L[], grupo: GrupoLiquidacion,
): { ok: true; fotos: FotoDeLineaParaEscribir<L>[] } | { ok: false; error: string } {
  const fotos: FotoDeLineaParaEscribir<L>[] = []
  const motivos: string[] = []
  for (const l of lineas) {
    const f = fotoDeLaLinea(l, grupo)
    if (f.ok) fotos.push({ linea: l, plata: f.plata, liquida: f.liquida })
    else motivos.push(`${l.nombre} ${f.motivo}`)
  }
  return motivos.length ? { ok: false, error: `No cerré: ${motivos.join(' · ')}.` } : { ok: true, fotos }
}
