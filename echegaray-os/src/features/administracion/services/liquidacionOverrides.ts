// LO QUE EL DUEÑO ESCRIBE A MANO LE GANA A LA CUENTA — y se ve que se lo ganó.
//
// Dueño, 09/09/2026: *«quiero más editables todas esas filas y columnas, no los nombres pero lo
// demás sí»*. La regla del repo es anterior y más fuerte: **edición manual = verdad definitiva**. Lo
// que esta capa agrega es que el valor manual no se disfrace de calculado: cada celda pisada sale
// marcada, y vaciarla devuelve la cuenta.
//
// ═══ POR QUÉ NO SE PISA LA CIFRA Y SE OLVIDA LA CUENTA ═══
//
// Guardar sólo el número escrito y borrar el cálculo haría imposible contestar «¿esto lo escribió
// alguien o lo calculó el sistema?» — que es exactamente la pregunta que se hace cuando el total no
// coincide con el recibo. El cálculo se sigue haciendo SIEMPRE; el override se aplica encima y se
// declara. Vaciar la celda no «restaura» nada: deja de haber override y la cuenta vuelve sola.
//
// ═══ LA CADENA SE RECALCULA DESPUÉS DE CADA PISADA (R5 del handoff) ═══
//
//   COBRA        = horas × $/h            ← si se pisan las horas, COBRA se mueve
//   EN EFECTIVO  = COBRA − ADELANTO − YA TRANSFERIDO − POR BANCO
//   TOTAL        = POR BANCO + EN EFECTIVO
//
// Un override corta la cadena EN SU ESLABÓN y los de abajo siguen calculándose sobre el valor
// pisado. Pisar COBRA y que EN EFECTIVO siguiera mostrando la resta vieja sería publicar una fila
// que no cierra consigo misma.
//
// ═══ NULL NO ES CERO, TAMPOCO ACÁ ═══
//
// `null` en un override significa «no hay override». Un cero escrito a mano SÍ es un override —«no
// le doy nada por banco» es una afirmación— y por eso el override viaja como `number | null` y la
// ausencia como la falta de la clave, nunca como 0.

import type { GrupoLiquidacion, LineaLiquidada } from './liquidacionQuincena.ts'
import { repartoDelAcuerdo } from './liquidacionAcuerdo.ts'
import { sueldoBlancoNegro, type EntradaDeBlanco, type SueldoBlancoNegro } from './sueldoBlancoNegro.ts'
import { cobraConPresentismo, presentismoDeLinea, presentismoNoAplica, type EntradaDePresentismo, type PresentismoDeLinea } from './presentismo.ts'
import { negroDeLaFila } from './sueldoBlancoNegro.ts'
import { pagoDeLaLinea, type PagoDeLaLinea } from './pagoDeLaQuincena.ts'

/** Las celdas que se pueden pisar a mano. El nombre NO está: es la única que el dueño dejó afuera. */
export const CAMPOS_EDITABLES = [
  'horas', 'cobra', 'adelanto', 'yaTransferido', 'porBanco', 'enEfectivo', 'total',
  // EL BLANCO (dueño, 14/09/2026: «dejame editable las h/recibo»). El neto es `porBanco`.
  'horasRecibo', 'valorHoraRecibo',
  // IMPORTE NEGRO (15/09/2026: «dejame editable todas las columnas de dinero»). Cobra total es `cobra` y Total
  // efectivo es `enEfectivo`: ya existían.
  'negro',
  // HS NEGRO (15/09/2026: «todas las celdas editables»). Con ella, Importe negro = Hs negro × $/h negro.
  'horasNegro',
  // LO PAGADO DE VERDAD (15/09/2026: «necesito al lado de banco y negro lo que se le ha pagado efectivamente»).
  // NO son adelantos: un adelanto es un eslabón de la resta que compone el sueldo, esto es un HECHO de tesorería.
  // Arrancan calculados desde los adelantos —lo ya entregado— y se corrigen a mano al registrar un pago más.
  'pagadoBanco', 'pagadoEfectivo',
] as const

export type CampoEditable = (typeof CAMPOS_EDITABLES)[number]

/** Lo escrito a mano para una línea. Clave ausente o `null` = sin override. */
export type OverridesDeLinea = Partial<Record<CampoEditable, number | null>>

/**
 * LO QUE LA PLANILLA DICE DE LAS HORAS Y EL COBRA DE UN OBRERO, cuando ya no manda.
 *
 * `difiere` = las horas o el cobra de JORNALES no son los del cuadro. La pantalla pone la marca sólo
 * entonces, con «JORNALES: 75 h · $371.250» en el `title`.
 */
export interface ReferenciaDeJornales {
  horas: number | null
  cobra: number | null
  porBanco: number | null
  enEfectivo: number | null
  difiere: boolean
}

/**
 * LA FOTO DE UNA QUINCENA CERRADA (dueño, 17/09/2026: «no salen los valores $/h de cada uno en las quincenas
 * anteriores, revisar y rehacer»).
 *
 * ═══ QUÉ PASABA ═══
 *
 * Una quincena cerrada no se recalcula: se dibuja con `sinOverrides`, que deja `sueldo` en `null` a propósito —el
 * modelo blanco+negro depende de recibos y estimaciones que NO pueden volver a correr sobre algo ya pagado—. Pero la
 * pantalla leía el $/h SÓLO de ese modelo, así que la columna «$/h cat.» decía «—» y el detalle «Plataforma: Oficial
 * · —/h» para gente a la que se le liquidaron horas × $/h. El dato existía; no había por dónde decirlo.
 *
 * ═══ QUÉ ES Y QUÉ NO ES ═══
 *
 * El $/h ES EL SELLADO: `liquidacion_linea.valor_hora` de esa quincena (desde el 18/09/2026). Hasta ese día salía de
 * `persona_tarifa` con `desde <= q.hasta`, y eso NO es la foto: Bazán tiene una sola tarifa cargada ($4.000 desde
 * enero) y la 2ª de marzo se cerró a $4.300 —la pantalla decía «se liquidó a $4.000/h» sobre plata ya entregada—. El
 * piso sí se toma de la escala vigente a `q.hasta` (`pisoVigente`, la misma de Convenios): es el convenio de esa
 * fecha, no un dato de la persona. NO es un recálculo: son dos números que la quincena cerrada ya tenía.
 *
 * LA CATEGORÍA NO SE SELLA. `liquidacion_linea.categoria_sellada` está vacío en TODA la base (verificado 17/09/2026:
 * 0 de 0 en agosto, julio y junio), así que el nombre de la categoría que se muestra es el del legajo de HOY. Eso se
 * dice en el `title`: si alguien recategorizó a una persona, el rótulo cambió aunque la quincena esté cerrada.
 */
export interface SelloDeLaQuincena {
  /** El $/h con el que se liquidó esa quincena (`liquidacion_linea.valor_hora`). `null` = no cobraba por hora, o la foto no lo tiene. */
  valorHora: number | null
  /**
   * `false` = esta persona NO tiene línea sellada en la quincena cerrada: ninguna cifra de su fila es dato sellado y
   * la pantalla lo dice («sin línea sellada») en vez de dibujar el cálculo de hoy. Con `true`, una columna en `null`
   * es «sin dato sellado» (quincena vieja con la foto incompleta).
   */
  conLinea: boolean
  /** El piso del convenio para su categoría, vigente A ESA FECHA. `null` sin categoría o sin escala de ese mes. */
  piso: number | null
  /** Desde cuándo rige ese piso (ISO). Va en el `title`: sin él, el piso se leería como el de hoy. */
  pisoDesde: string | null
  /** El último día de la quincena: la fecha a la que están tomados los dos valores. */
  hasta: string
}

export interface LineaConOverrides extends LineaLiquidada {
  /** Qué celdas de esta fila las escribió una persona. La pantalla las marca. */
  manual: Record<CampoEditable, boolean>
  /**
   * DE DÓNDE SALIÓ CADA CELDA. Tres orígenes y un orden, escrito una sola vez:
   *
   *   manual     alguien la escribió en la app (`*_manual` no nulo). GANA SIEMPRE.
   *   jornales   la escribió el dueño en la planilla y la trajo el espejo.
   *   calculado  la cuenta de la app sobre `registros_hh`, `nomina_adelanto`, `nomina_recibo_neto` + extracto.
   *
   * ═══ POR QUÉ JORNALES LE GANA A LO CALCULADO EN LA PLATA ENTREGADA ═══
   *
   * Dueño, 11/09/2026: *«todo lo referente a adelantos de plata no está»*. La planilla es donde él
   * decide los adelantos, y el derivado es una inferencia del OS sobre movimientos bancarios. Entre
   * la decisión de quien paga y la inferencia de quien mira, manda la decisión.
   *
   * ═══ Y POR QUÉ NO LE GANA EN EL COBRA DE UN OBRERO (14/09/2026) ═══
   *
   * *«esta mal las hs q considera liq hs, parece q no estan leyendo del mismo cuadro de hs en
   * supabase»*. El cobra de la planilla es SUS horas × $/h, y la planilla va atrasada respecto de la
   * app: Quiroga Alexander, 01/09, 88 h en las celdas (el 11/09 corregido a mano en la web) y $371.250
   * = 75 h en JORNALES. La regla vigente del dueño es «respetar lo que manda app.ecsas.com.ar». Por eso
   * en obreros COBRA sale de las horas del cuadro y EN EFECTIVO de la resta; la planilla queda en
   * `referenciaJornales`. Oficina y finales no cobran por hora y siguen como estaban.
   *
   * ═══ Y POR QUÉ LO MANUAL LE GANA A TODO ═══
   *
   * Porque lo manual es MÁS NUEVO por definición: es lo que alguien corrigió mirando esta pantalla,
   * ya sabiendo lo que dice la planilla. Si JORNALES pisara, la corrección desaparecería en la
   * próxima corrida del timer y el que la escribió creería que guardó.
   */
  origen: Record<CampoEditable, OrigenDeCelda>
  /**
   * DÓNDE JORNALES Y EL DERIVADO NO DICEN LO MISMO. Se muestra JORNALES y se AVISA la diferencia:
   * esconderla haría que un giro que el extracto ve y la planilla no —o al revés— desapareciera.
   */
  discrepancia: Partial<Record<CampoEditable, { jornales: number; calculado: number }>>
  /** Obreros: lo que la planilla dice de horas, cobra, banco y efectivo, sin mandar. `null` sin espejo. */
  referenciaJornales: ReferenciaDeJornales | null
  /**
   * BLANCO + NEGRO (dueño, 14/09/2026). `null` fuera del modelo: Oficina, finales, quincena cerrada, o
   * un llamador que no le pasó la entrada del blanco. Con modelo, COBRA = `sueldo.total` y POR BANCO =
   * `sueldo.neto`, salvo lo escrito a mano.
   */
  sueldo: SueldoBlancoNegro | null
  /** La foto de la quincena cerrada: el $/h y el piso de ESA fecha. `null` en la abierta — ahí manda `sueldo`. */
  sello: SelloDeLaQuincena | null
  /**
   * PRESENTISMO (dueño, 15/09/2026): la parte del cobra que se pierde con una sola tardanza. Se calcula
   * sobre las HORAS QUE QUEDARON (manuales o de la app) y se descuenta del cobra ANTES de la resta de
   * adelantos, así En efectivo y Total lo siguen. Con blanco + negro sale del negro: el neto es el
   * recibo del estudio y no cambia. `null` fuera del modelo (Oficina, finales, cuadro cerrado sin
   * sello, llamador viejo). La regla entera vive en `presentismo.ts`.
   */
  presentismo: PresentismoDeLinea | null
  /** Hay $/h y horas pero el blanco no tiene neto: el total no se puede afirmar. No es «sin tarifa». */
  sinNeto: boolean
  /** Horas del recibo que muestra la celda (manual o del recibo/estimado). `null` fuera del modelo. */
  horasRecibo: number | null
  /** $/h de categoría que muestra la celda. `null` fuera del modelo. */
  valorHoraRecibo: number | null
  /** Importe negro que muestra la celda (calculado o escrito). `null` fuera del modelo. */
  negro: number | null
  /** Hs negro que muestra la celda (calculadas o escritas). `null` fuera del modelo. */
  horasNegro: number | null
  /** La suma de los días, antes de cualquier override: contra ella se avisa una Horas escrita distinta. */
  horasDeLosDias: number | null
  /** Lo transferido de verdad: los adelantos por banco, salvo que alguien haya escrito otra cifra. */
  pagadoBanco: number
  /** Lo entregado en mano de verdad: los adelantos en efectivo, salvo que alguien haya escrito otra cifra. */
  pagadoEfectivo: number
  /**
   * NADIE AFIRMÓ CUÁNTO FUE POR BANCO (17/09/2026). El $0 de `porBanco` y de `pagadoBanco` de esta fila es un valor por
   * defecto, no un dato: no hay recibo, ni neto del modelo, ni celda escrita a mano, ni BANCO anotado en la planilla,
   * ni un peso registrado por banco. Ocho bloques de JORNALES de 2026 tienen la columna BANCO vacía en TODAS sus
   * filas y la app publicaba «$0 por banco, todo en efectivo» como si alguien lo hubiera medido. La regla vive en
   * `desgloseSinAfirmar`; el legajo lo escribe «sin desglose» y no reparte lo pagado.
   */
  sinDesglose: boolean
  /**
   * QUINCENA CERRADA SIN PAGO REGISTRADO (auditor, 18/09/2026). Ni `pagado_banco`, ni `pagado_efectivo`, ni la marca
   * «pagada»: nadie afirmó cuánto se le pagó. La fila NO publica saldo —ni «a pagar hoy»—, sólo lo que consta.
   *
   * Medido ese día: en las 16 cerradas de obreros, TODA línea con lo pagado registrado da saldo exactamente 0, y todo
   * el saldo pendiente ($36,6 M) sale de las 108 líneas sin registro, que son todas de personas que hoy ya no están:
   * `--completar-pagado` (JORNALES → lo pagado) corrió sólo con `where p.en_la_empresa`. Cerrar tampoco prueba el pago
   * (`cerrarQuincena` dice «No se marcó ningún pago», y las cerradas de 2026 se sellaron en bloque el 09 y el 15/09).
   * El saldo de esas filas es una alarma que nadie puede probar: la misma clase que el −$378.000 de Agüero.
   */
  pagoSinRegistrar: boolean
  /**
   * LOS SALDOS DE LA FILA (dueño, 15/09/2026). La cuenta entera vive en `pagoDeLaQuincena.ts`: banco − pagado,
   * negro − pagado, y el exceso de un lado descontado del otro. Acá sólo se le entrega la entrada.
   */
  pago: PagoDeLaLinea
  /**
   * LA CUENTA QUE ESCRIBIÓ UNA PERSONA EN CADA CELDA, por campo: `{ pagadoEfectivo: '=100000+40000' }`.
   *
   * El valor que manda para la plata es el de la celda; esto existe para que al reabrirla se vea de dónde salió
   * el número, como en el Sheet. Vacío = ninguna celda de esta fila se escribió con `=`.
   */
  formulas: Partial<Record<CampoEditable, string>>
  /**
   * CUÁNDO SE MARCÓ «PAGADA» (dueño, 16/09/2026: «marcar como pagado ya a la gente y que marque un poco el color
   * distinto»). Es un sello, no un cálculo: lo pone `marcarLineaPagada` y lo lee la fila para pintarse. `null` o
   * ausente = sin marcar. Lo completa `getLiquidacionDeLaQuincena` desde `liquidacion_linea.pagada_en`.
   */
  pagadaEn?: string | null
}

export type OrigenDeCelda = 'calculado' | 'jornales' | 'manual'

/** Lo que el espejo del bloque de JORNALES dice de esta persona. `null` = la planilla no lo dice. */
export interface CadenaDeJornales {
  horas?: number | null
  cobra?: number | null
  adelanto?: number | null
  yaTransferido?: number | null
  porBanco?: number | null
  enEfectivo?: number | null
  /**
   * LA COLUMNA BANCO DEL BLOQUE TIENE AL MENOS UNA CIFRA. Con `porBanco` NULL y esto en `true`, la planilla midió el
   * canal y a esta persona no le fue nada por banco; con esto en `false`, nadie anotó la columna en todo el bloque.
   */
  bancoMedido?: boolean
}

const redondear2 = (n: number): number => Math.round(n * 100) / 100

/**
 * ¿NADIE AFIRMÓ CUÁNTO FUE POR BANCO? Puro. Una sola fuente que hable alcanza para que el desglose esté afirmado:
 *
 *   escritoAMano   alguien escribió Por banco, Pagado banco o Pagado efectivo en la app (un 0 también afirma);
 *   neto           el modelo blanco + negro tiene neto (recibo real o estimado);
 *   reciboNeto     el estudio cargó un recibo para el período, girado o no;
 *   jornales       la planilla anotó BANCO para la persona (aun 0) o para alguien del bloque (`bancoMedido`);
 *   pagadoBanco    consta plata que salió por banco (ADELANTO BANCO, lote del extracto, registro).
 *
 * NULL NO ES CERO: sin ninguna de esas, el 0 que la cadena publica por banco no lo midió nadie.
 */
export function desgloseSinAfirmar(e: {
  escritoAMano: boolean
  neto: number | null
  reciboNeto: number | null
  jornales: CadenaDeJornales | null
  pagadoBanco: number
}): boolean {
  if (e.escritoAMano) return false
  if (e.neto != null || e.reciboNeto != null) return false
  if (e.jornales && (e.jornales.porBanco != null || e.jornales.bancoMedido === true)) return false
  return !(e.pagadoBanco > 0)
}

const SIN_MARCAS: Record<CampoEditable, boolean> = {
  horas: false, cobra: false, adelanto: false, yaTransferido: false,
  porBanco: false, enEfectivo: false, total: false, horasRecibo: false, valorHoraRecibo: false, negro: false, horasNegro: false,
  pagadoBanco: false, pagadoEfectivo: false,
}

const TODO_CALCULADO: Record<CampoEditable, OrigenDeCelda> = {
  horas: 'calculado', cobra: 'calculado', adelanto: 'calculado', yaTransferido: 'calculado',
  porBanco: 'calculado', enEfectivo: 'calculado', total: 'calculado', horasRecibo: 'calculado', valorHoraRecibo: 'calculado', negro: 'calculado', horasNegro: 'calculado',
  pagadoBanco: 'calculado', pagadoEfectivo: 'calculado',
}

/**
 * LAS CELDAS QUE JORNALES PUEDE APORTAR, POR CUADRO. `horas` y `total` no están en ninguno:
 *
 *   HORAS  salen de `registros_hh` día por día; son las celdas del cuadro.
 *   TOTAL  es POR BANCO + EN EFECTIVO. Traerlo de la planilla dejaría una fila que no cierra.
 *
 * En OBREROS tampoco COBRA ni EN EFECTIVO (dueño, 14/09/2026): cobra = horas del cuadro × $/h, y el
 * efectivo es la resta que hace cerrar la fila con ese cobra. Adelanto, ya transferido y por banco
 * siguen con la precedencia manual > JORNALES > calculado.
 */
const DE_JORNALES_OBREROS = ['adelanto', 'yaTransferido', 'porBanco'] as const
const DE_JORNALES_OTROS = ['cobra', 'adelanto', 'yaTransferido', 'porBanco', 'enEfectivo'] as const
/**
 * CON BLANCO + NEGRO, JORNALES TAMPOCO MANDA EL BANCO: por banco es el neto del recibo (dueño,
 * 14/09/2026). La planilla queda en `referenciaJornales` con su cobra, banco y efectivo.
 */
const DE_JORNALES_MODELO = ['adelanto', 'yaTransferido'] as const

/**
 * LA LÍNEA CALCULADA, CON LO ESCRITO A MANO ENCIMA Y LA CADENA REHECHA.
 *
 * `grupo` importa en dos puntos: COBRA se recalcula desde las horas SÓLO en obreros (Oficina cobra un
 * neto mensual y una final es la mitad blanca por dos), y sólo en obreros JORNALES deja de mandar
 * sobre COBRA y EN EFECTIVO.
 */
export function aplicarOverrides(
  base: LineaLiquidada, ov: OverridesDeLinea, grupo: GrupoLiquidacion,
  jornales: CadenaDeJornales | null = null,
  /** La entrada del blanco. Sin ella la línea sigue el modelo anterior (horas × $/h). */
  blanco: EntradaDeBlanco | null = null,
  /** Lo que el presentismo necesita saber antes de las horas. `null` = no se evalúa (llamador viejo). */
  entradaPresentismo: EntradaDePresentismo | null = null,
  /** Las cuentas escritas con `=` en esta fila, por campo. Viajan para poder reabrir la celda con su expresión. */
  formulas: Partial<Record<CampoEditable, string>> = {},
): LineaConOverrides {
  const manual = { ...SIN_MARCAS }
  const origen = { ...TODO_CALCULADO }
  const discrepancia: LineaConOverrides['discrepancia'] = {}
  const conModelo = blanco != null && grupo === 'obreros'
  const deJornales: readonly string[] = conModelo
    ? DE_JORNALES_MODELO
    : (grupo === 'obreros' ? DE_JORNALES_OBREROS : DE_JORNALES_OTROS)

  /** LA PRECEDENCIA, EN UNA SOLA FUNCIÓN: manual > JORNALES (si el cuadro lo admite) > calculado. */
  const resolver = (campo: CampoEditable, calculado: number | null): number | null => {
    const v = ov[campo]
    if (v != null && Number.isFinite(v)) {
      manual[campo] = true
      origen[campo] = 'manual'
      return redondear2(v)
    }
    if (!jornales || !deJornales.includes(campo)) return calculado
    const j = jornales[campo as keyof CadenaDeJornales]
    // NULL NO ES CERO, TAMPOCO ACÁ. Una columna que la planilla no rotula viaja NULL y no puede
    // borrar lo que la app calculó: «no hay columna» y «no le dieron nada» son cosas distintas.
    // (`typeof`, no sólo `Number.isFinite`: la cadena también lleva `bancoMedido`, que es un booleano y no una celda.)
    if (typeof j !== 'number' || !Number.isFinite(j)) return calculado
    const jr = redondear2(j)
    origen[campo] = 'jornales'
    // LA DIFERENCIA CONTRA EL DERIVADO SE DICE: gana JORNALES y la pantalla publica las dos cifras.
    if (calculado != null && redondear2(calculado) !== jr) {
      discrepancia[campo] = { jornales: jr, calculado: redondear2(calculado) }
    }
    return jr
  }
  /** Horas y total no tienen fuente en JORNALES: o los escribió alguien, o se calculan. */
  const puesto = (campo: 'horas' | 'total' | 'horasRecibo' | 'valorHoraRecibo' | 'negro' | 'horasNegro'
    | 'pagadoBanco' | 'pagadoEfectivo'): number | null => {
    const v = ov[campo]
    if (v == null || !Number.isFinite(v)) return null
    manual[campo] = true
    origen[campo] = 'manual'
    return redondear2(v)
  }

  const horas = puesto('horas') ?? base.horas
  // UNAS HORAS ESCRITAS A MANO SON LAS QUE SE PAGAN: no traen extras aparte que reconstruir.
  const horasEquivalentes = manual.horas ? horas : base.horasEquivalentes
  // EL MODELO SE CALCULA SOBRE LAS HORAS QUE QUEDARON (manuales o de la app) Y EL $/H NEGRO VIGENTE.
  // LO ESCRITO EN EL BLANCO ENTRA AL MODELO: horas del recibo, $/h de categoría y el neto (`por_banco_manual`).
  const netoManual = ov.porBanco != null && Number.isFinite(ov.porBanco) ? redondear2(ov.porBanco) : null
  const manualDelBlanco = conModelo
    ? {
      horasRecibo: puesto('horasRecibo'), valorHoraRecibo: puesto('valorHoraRecibo'), neto: netoManual, negro: puesto('negro'),
      horasNegro: puesto('horasNegro'),
    }
    : undefined
  const sinDescuento = conModelo
    ? sueldoBlancoNegro({ ...blanco!, horas, horasEquivalentes, valorHoraNegro: base.valorHora, manual: manualDelBlanco })
    : null
  // EL PRESENTISMO SE EVALÚA CON LAS HORAS QUE QUEDARON, y sólo en obreros: la regla dice quién queda afuera.
  // QUIEN COBRA POR MES LO DICE (dueño, 17/09/2026: el presentismo no aplica a mensuales). Oficina no arma entrada:
  // sin esto su celda quedaba en «—», que se lee igual que «todavía no rige». No toca la cadena: no es «perdido».
  const presentismo = entradaPresentismo && grupo === 'obreros'
    ? presentismoDeLinea(entradaPresentismo, horas)
    : base.modalidad === 'mensual' ? presentismoNoAplica() : null
  // UN NEGRO ESCRITO A MANO NO SE DESCUENTA: manual gana, como en todas las celdas. El presentismo se
  // publica igual —la marca existe— y quien escribió el importe lo ve al lado.
  const sueldo = sinDescuento && descontarDelNegro(sinDescuento, manual.negro ? null : presentismo)
  const cobraCalc = sueldo
    ? sueldo.total
    : cobraConPresentismo(
      manual.horas && grupo === 'obreros'
        ? (base.valorHora == null || horas == null ? null : redondear2(horas * base.valorHora))
        : base.cobra,
      presentismo,
    )
  const cobra = resolver('cobra', cobraCalc)
  const adelanto = resolver('adelanto', base.adelanto) ?? 0
  const yaTransferido = resolver('yaTransferido', base.yaTransferido) ?? 0
  // POR BANCO = NETO. Sin neto el banco no tiene cifra: 0 acá, y el total `null` saca la fila del pie.
  const porBanco = resolver('porBanco', sueldo ? (sueldo.neto ?? 0) : base.porBanco) ?? 0
  // LA CADENA SE REHACE SOBRE LO QUE QUEDÓ ARRIBA, venga de donde venga (R5).
  const enEfectivoCalc = cobra == null
    ? null
    : redondear2(cobra - adelanto - yaTransferido - porBanco)
  const enEfectivo = resolver('enEfectivo', enEfectivoCalc)
  const totalCalc = enEfectivo == null ? null : redondear2(porBanco + enEfectivo)
  const total = (ov.total != null && Number.isFinite(ov.total) ? puesto('total') : null) ?? totalCalc
  // EL ACUERDO 50/50 SE REHACE SOBRE EL COBRA FINAL: las mitades son de LO QUE SE VA A PAGAR.
  const acuerdo = repartoDelAcuerdo(cobra, base.modalidad)
  // ═══ LO PAGADO DE VERDAD (dueño, 15/09/2026) ═══
  //
  // El valor de arranque son LOS ADELANTOS: lo que ya se entregó por cada canal. No es una suposición —salen de
  // `nomina_adelanto` y de la planilla— y por eso la celda nace con la cifra puesta en vez de vacía. Escribir la
  // celda la vuelve manual y manda, igual que en el resto del cuadro.
  const pagadoBanco = puesto('pagadoBanco') ?? yaTransferido
  const pagadoEfectivo = puesto('pagadoEfectivo') ?? adelanto
  // NULL NO ES CERO (17/09/2026): si ninguna fuente afirmó el banco, la fila lo dice en vez de publicar $0.
  const sinDesglose = desgloseSinAfirmar({
    escritoAMano: manual.porBanco || manual.pagadoBanco || manual.pagadoEfectivo,
    neto: sueldo?.neto ?? null, reciboNeto: base.reciboNeto, jornales, pagadoBanco,
  })
  const pago = pagoDeLaLinea({
    banco: porBanco,
    // EL MISMO NEGRO QUE MUESTRA LA COLUMNA (`negroDeLaFila`): un saldo calculado sobre otro negro que el
    // dibujado sería una segunda respuesta a «cuánto le falta cobrar en mano».
    negro: negroDeLaFila({
      netoMensual: base.netoMensual, cobra, porBanco, sueldo, modalidad: base.modalidad,
      manual: { cobra: manual.cobra, porBanco: manual.porBanco },
    }),
    pagadoBanco, pagadoEfectivo,
  })

  return {
    ...base,
    horas, horasEquivalentes, extras: manual.horas ? [] : base.extras,
    cobra, adelanto, yaTransferido, porBanco, enEfectivo, total,
    blancoAcuerdo: acuerdo.blanco,
    efectivoAcuerdo: acuerdo.efectivo,
    // PISAR COBRA RESUELVE «SIN TARIFA», venga de la app o de la planilla: en los dos casos alguien
    // decidió el importe y no hace falta buscar una tarifa para pagar esta quincena.
    sinTarifa: base.sinTarifa && origen.cobra === 'calculado',
    manual,
    origen,
    discrepancia,
    referenciaJornales: grupo === 'obreros' ? referenciaDe(jornales, horas, cobra, conModelo) : null,
    sueldo,
    // LA ABIERTA NO TIENE FOTO: sus $/h salen del modelo blanco+negro, que sí puede correr.
    sello: null,
    presentismo,
    sinNeto: sueldo != null && sueldo.neto == null && !base.sinTarifa && origen.cobra === 'calculado',
    horasRecibo: sueldo?.horasBlanco ?? null,
    valorHoraRecibo: sueldo?.valorHoraCategoria ?? null,
    negro: sueldo?.negro ?? null,
    horasNegro: sueldo?.horasNegro ?? null,
    horasDeLosDias: base.horas,
    pagadoBanco, pagadoEfectivo, pago, formulas, sinDesglose, pagoSinRegistrar: false,
  }
}

/**
 * Lo que la planilla dice de un obrero, y si difiere del cuadro. Con blanco + negro sólo se comparan
 * las HORAS: el cobra de la planilla es horas × $/h, otro concepto que el neto + negro, y una marca que
 * difiere siempre deja de leerse.
 */
function referenciaDe(
  j: CadenaDeJornales | null, horas: number | null, cobra: number | null, conModelo: boolean,
): ReferenciaDeJornales | null {
  if (!j) return null
  const num = (v: number | null | undefined): number | null =>
    v == null || !Number.isFinite(v) ? null : redondear2(v)
  const r = { horas: num(j.horas), cobra: num(j.cobra), porBanco: num(j.porBanco), enEfectivo: num(j.enEfectivo) }
  if (r.horas == null && r.cobra == null && r.enEfectivo == null && r.porBanco == null) return null
  const distinto = (a: number | null, b: number | null) => a != null && b != null && a !== redondear2(b)
  return { ...r, difiere: distinto(r.horas, horas) || (!conModelo && distinto(r.cobra, cobra)) }
}

/**
 * EL PRESENTISMO PERDIDO SALE DEL NEGRO. El neto es lo que el estudio liquidó y el banco giró: no se
 * toca. Lo que la persona deja de cobrar es efectivo, y Neto + Negro = Total sigue cerrando exacto.
 * Si el negro no alcanza queda negativo y la pantalla lo muestra: es plata que ya salió por el banco.
 */
function descontarDelNegro(s: SueldoBlancoNegro, p: PresentismoDeLinea | null): SueldoBlancoNegro {
  if (p == null || p.estado !== 'perdido' || p.importe == null || s.negro == null) return s
  const negro = redondear2(s.negro - p.importe)
  return { ...s, negro, total: s.neto == null ? null : redondear2(s.neto + negro) }
}

/**
 * Ninguna celda pisada: la fila calculada, con las marcas en falso. Para cuadros cerrados o sin líneas
 * guardadas. `sellado` es la foto del presentismo que el cierre dejó en `liquidacion_linea`: en una
 * quincena cerrada no se recalcula, se muestra la que se pagó.
 *
 * ═══ LO PAGADO SÍ VIAJA, Y NO ES UNA EXCEPCIÓN A R6 ═══
 *
 * `pagado_banco` y `pagado_efectivo` no son un override del CÁLCULO: son el registro de una plata que salió.
 * Si no se leyeran acá, al cerrar la quincena desaparecería la corrección de quien registró el pago y el cuadro
 * cerrado diría que se le pagó otra cosa que la que se le pagó. La fila sigue siendo de sólo lectura —la puerta
 * es `fila.cerrada`— y el cierre NO los escribe: se derivan de los adelantos, que ya son historia estable, así
 * que sellarlos haría que al reabrir la quincena aparecieran como escritos a mano por nadie (el defecto que
 * `horas_manual` existe para evitar).
 */
export function sinOverrides(
  base: LineaLiquidada, sellado: PresentismoDeLinea | null = null, ov: OverridesDeLinea = {},
  sello: SelloDeLaQuincena | null = null,
  /** Lo que la planilla dice de esta persona. En la cerrada NO manda sobre la cadena: sólo dice si midió el banco. */
  jornales: CadenaDeJornales | null = null,
): LineaConOverrides {
  const registrado = (v: number | null | undefined): number | null =>
    v != null && Number.isFinite(v) ? redondear2(v) : null
  const pagadoBanco = registrado(ov.pagadoBanco) ?? base.yaTransferido
  const pagadoEfectivo = registrado(ov.pagadoEfectivo) ?? base.adelanto
  // EN LA FOTO CERRADA NADA ES «ESCRITO A MANO» (es una foto), así que un `pagado_banco` registrado en 0 no afirma el
  // canal: el cargador de JORNALES escribe ese 0 justamente cuando la columna BANCO estaba vacía. Afirma un recibo, un
  // BANCO medido en la planilla o un peso registrado por banco. Límite declarado: un «0 por banco» que una persona haya
  // escrito a mano en una quincena ya cerrada, sin recibo y sin BANCO en la planilla, se lee igual que el del cargador.
  const sinDesglose = desgloseSinAfirmar({ escritoAMano: false, neto: null, reciboNeto: base.reciboNeto, jornales, pagadoBanco })
  // ¿ALGUIEN REGISTRÓ LO PAGADO? En una foto sellada (`sello` presente) sin registro no se afirma saldo: lo pagado que
  // se muestra son los adelantos de la foto —eso sí consta— y el resto no se da por debido ni por pagado.
  // SÓLO CON LÍNEA SELLADA: sin foto no hay pago que registrar, hay una fila sin línea (`sello.conLinea = false`), y eso
  // se dice con su propio rótulo.
  const pagoSinRegistrar = sello != null && sello.conLinea
    && registrado(ov.pagadoBanco) == null && registrado(ov.pagadoEfectivo) == null
  return {
    ...base, manual: { ...SIN_MARCAS }, origen: { ...TODO_CALCULADO }, discrepancia: {},
    // `sueldo` SIGUE EN NULL A PROPÓSITO: el modelo blanco+negro no se recalcula sobre algo ya pagado. Lo que sí
    // viaja es el sello, para que el $/h de esa quincena deje de ser «—».
    referenciaJornales: null, sueldo: null, sello, presentismo: sellado, sinNeto: false, horasRecibo: null, valorHoraRecibo: null,
    negro: null, horasNegro: null, horasDeLosDias: base.horas,
    pagadoBanco, pagadoEfectivo, formulas: {}, sinDesglose, pagoSinRegistrar,
    pago: pagoDeLaLinea({
      // SIN REGISTRO, LOS DOS LADOS VAN EN NULL: `pagoDeLaLinea` no afirma saldo ni «a pagar hoy», y el pie la cuenta
      // aparte (`sinSaldo`) en vez de sumarla como deuda.
      banco: pagoSinRegistrar ? null : base.porBanco,
      negro: pagoSinRegistrar ? null : negroDeLaFila({
        netoMensual: base.netoMensual, cobra: base.cobra, porBanco: base.porBanco, sueldo: null, modalidad: base.modalidad,
      }),
      pagadoBanco, pagadoEfectivo,
    }),
  }
}

/** Nombre de columna en `liquidacion_linea` de cada celda editable. */
export const COLUMNA_DE: Record<CampoEditable, string> = {
  // `horas_manual`, NO `horas`: `horas` es la cifra que sella `cerrarQuincena`, y leerla como override hacía que
  // al reabrir una quincena las horas selladas volvieran como «manual» sin que nadie las escribiera (15/09/2026).
  horas: 'horas_manual',
  cobra: 'cobra_manual',
  adelanto: 'adelanto_manual',
  yaTransferido: 'ya_transferido_manual',
  porBanco: 'por_banco_manual',
  enEfectivo: 'en_efectivo_manual',
  total: 'total_manual',
  horasRecibo: 'horas_recibo_manual',
  valorHoraRecibo: 'valor_hora_recibo_manual',
  negro: 'negro_manual',
  horasNegro: 'horas_negro_manual',
  pagadoBanco: 'pagado_banco',
  pagadoEfectivo: 'pagado_efectivo',
}

/**
 * QUÉ CELDAS SE PUEDEN GUARDAR HOY, según las columnas que la base REALMENTE tiene.
 *
 * Las horas van a `horas_manual` (20260915T0510): `horas` es nullable pero es la cifra sellada del cierre, y
 * no puede decir «esto lo escribió alguien». Las otras seis (`cobra`, `adelanto`, …) nacieron NOT NULL
 * DEFAULT 0: un 0 guardado ahí es indistinguible de «no hay override», y la fila que crea el
 * redondeo las deja en 0 — pisarlas liquidaría a alguien en cero sin que nadie lo haya escrito. Por
 * eso van a columnas `*_manual` nullable, y hasta que la migración se aplique esas celdas se
 * dibujan como sólo lectura en vez de guardar en una columna que no puede decir «vacío».
 */
export function camposGuardables(columnas: readonly string[]): CampoEditable[] {
  return CAMPOS_EDITABLES.filter((c) => columnas.includes(COLUMNA_DE[c]))
}

/**
 * ¿LA HORAS ESCRITA A MANO NO ES LA SUMA DE LOS DÍAS? Devuelve la suma de los días para el aviso ámbar «no coincide
 * con los días: X h». `null` sin manual o si coincide: no hay nada que avisar. Se guarda igual.
 */
export function horasNoCoincidenConLosDias(l: Pick<LineaConOverrides, 'manual' | 'horas' | 'horasDeLosDias'>): number | null {
  if (!l.manual.horas || l.horas == null || l.horasDeLosDias == null) return null
  return redondear2(l.horas) === redondear2(l.horasDeLosDias) ? null : l.horasDeLosDias
}

const CAMPOS_DE_HORAS: readonly CampoEditable[] = ['horas', 'horasRecibo', 'horasNegro']

/** Lo pagado tampoco (la base tiene el mismo CHECK): una devolución se carga bajando el pagado, no con un menos. */
const CAMPOS_DE_PAGO: readonly CampoEditable[] = ['pagadoBanco', 'pagadoEfectivo']

/** Las horas no se escriben negativas (la base tiene el mismo CHECK). La plata sigue admitiendo lo que admitía. */
export function rechazoDelValorDeCelda(campo: CampoEditable, valor: '' | number): string | null {
  if (valor === '') return null
  if (CAMPOS_DE_HORAS.includes(campo)) return valor < 0 ? 'Las horas no pueden ser negativas.' : null
  if (CAMPOS_DE_PAGO.includes(campo)) {
    return valor < 0 ? 'Un pago no puede ser negativo: para una devolución, bajá lo pagado.' : null
  }
  return null
}
