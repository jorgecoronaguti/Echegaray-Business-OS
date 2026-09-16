// CUÁNTO SE LE ESTÁ PAGANDO POR HORA A ESTA PERSONA, A PRIMER GOLPE DE VISTA.
//
// Dueño, 15/09/2026: *«en el legajo de cada persona quiero ver a primer golpe de vista cuánto se le
// está pagando por hora»*. Hasta hoy el $/h vivía sólo en el cuadro de la quincena: para saber qué
// cobra una persona había que abrir Liquidación, elegir el período y buscarla en la grilla. El
// legajo —la pantalla que se abre para contestar «quién es y qué cobra»— decía «Retribución: no
// llega a esta pantalla».
//
// ═══ SON TRES NÚMEROS Y NO UNO, PORQUE EL SUELDO SON DOS MITADES ═══
//
// `blanco-categoria-del-recibo-negro-plataforma`: el blanco es el recibo (con LA CATEGORÍA DEL
// RECIBO) y el negro es el $/h pactado de `persona_tarifa` (con la categoría de la plataforma). Un
// solo número los mezclaría, y ninguno de los dos es «lo que cobra»:
//
//   $/h negro     lo pactado hoy — es el que se edita y el que mueve la quincena abierta.
//   $/h recibo    lo que el estudio liquidó en blanco, con la categoría que puso EL RECIBO.
//   piso          el básico de convenio de su categoría: contra él se mide si se paga en regla.
//
// ═══ EL PISO PUEDE NO SER UN PISO FIRMADO, Y ENTONCES NO SE LLAMA PISO ═══
//
// `convenio_escala` nace vacía a propósito (ver `exposicionConvenio.ts`): nadie firmó que el CCT
// 76/75 que el OS tiene en `uocra_escala` sea la escala del «UOCRA — Ley 22.250» del legajo. Con la
// escala firmada, el rótulo dice «piso UOCRA». Sin ella se muestra igual el básico del CCT —un
// renglón «sin piso» en todo el plantel no le sirve a nadie— pero CON OTRO NOMBRE, «básico CCT
// 76/75», y la fuente en el `title`. Mostrar el número no es lo mismo que afirmar que es su piso.
//
// ═══ SIN PERMISO NO ES SIN DATO ═══
//
// `persona_tarifa` y `recibo_sueldo_linea` tienen RLS por `liquida_sueldos()`, que excluye al jefe
// de obra — y el jefe de obra ABRE ESTE LEGAJO (`es_administracion()`). Para él la lectura vuelve
// VACÍA y sin error: dibujar «sin $/h cargado» le diría que nadie cargó la tarifa, cuando lo que
// pasa es que no la puede ver. Por eso el permiso entra como dato y no se deduce de una lista vacía.
//
// Puro: sin base, sin React. Se prueba en `valorHoraDelLegajo.test.ts`.

// RUTAS RELATIVAS CON EXTENSIÓN en los imports de valor: `node --test` no conoce el alias `@/`.
import { pesos } from '../components/liquidacion/formato.ts'
import { diaMesAnioCompletoISO } from '../../../shared/utils/fecha.ts'
import { categoriaVisible } from './vocabularioPersona.ts'

/** Una fila de `persona_tarifa` de esta persona. `valorHora` XOR `netoMensual` (CHECK de la base). */
export interface TarifaDelLegajo {
  /** ISO `YYYY-MM-DD`. */
  desde: string
  valorHora: number | null
  netoMensual: number | null
  /** De dónde salió. Ningún importe sin origen (regla del dueño). */
  origen: string | null
}

/** El último recibo REAL de la persona, con la categoría que trae el recibo (no la del legajo). */
export interface ReciboDelLegajo {
  /** `Q2-08/2026`. */
  periodo: string
  categoria: string | null
  valorHora: number | null
}

/** El básico de convenio de su categoría, y de qué tabla salió. */
export interface PisoDelLegajo {
  valorHora: number
  desde: string
  fuente: string
  /** `convenio` = escala firmada para SU convenio · `cct` = el básico del CCT que el OS ya tenía. */
  origen: 'convenio' | 'cct'
}

export interface EntradaDelRotulo {
  /** `liquidaSueldos(rol)`. `false` = la RLS no deja leer nada de esto. */
  puedeVer: boolean
  /** TODAS las filas de `persona_tarifa` de la persona, en cualquier orden. */
  tarifas: readonly TarifaDelLegajo[]
  recibo: ReciboDelLegajo | null
  piso: PisoDelLegajo | null
  /** `personas.categoria`, para decir de quién es el piso. */
  categoria: string | null
  /** El día con el que se elige la tarifa vigente. Se fija en el servidor. */
  hoy: string
}

/** Un número del rótulo, listo para pintar. `valor` en `null` = se escribe `falta`, nunca 0. */
export interface DatoDelRotulo {
  rotulo: string
  valor: string | null
  falta: string | null
  /** El renglón chico de al lado: desde cuándo, la categoría, la variación. */
  detalle: string | null
  /** `warn` = ámbar: hay algo que cargar. `falta` = gris: no hay nada que decir. */
  tono: 'normal' | 'falta' | 'warn'
  /** La trazabilidad, bajo demanda: va al `title`, no clavada debajo del número. */
  titulo: string | null
}

/** Una fila del despliegue «historial»: fecha · valor · variación. */
export interface FilaDeHistorial {
  desde: string
  valor: string
  variacion: string | null
  origen: string | null
}

export interface RotuloValorHora {
  pactado: DatoDelRotulo
  recibo: DatoDelRotulo
  piso: DatoDelRotulo
  /** De la más nueva a la más vieja. Vacío = no hay historial que desplegar. */
  historial: FilaDeHistorial[]
  /** `true` sólo cuando hay algo que desplegar Y se puede ver. */
  hayHistorial: boolean
}

const SIN_PERMISO = 'sin permiso'

const numero = (v: unknown): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v)

/** La forma de una tarifa. `null` = la fila no trae ninguno de los dos y no es tarifa. */
const formaDe = (t: TarifaDelLegajo): 'hora' | 'mensual' | null =>
  numero(t.valorHora) != null ? 'hora' : numero(t.netoMensual) != null ? 'mensual' : null

const valorDe = (t: TarifaDelLegajo): number | null =>
  numero(t.valorHora) ?? numero(t.netoMensual)

/**
 * LA TARIFA QUE RIGE HOY: la de mayor `desde` que ya empezó.
 *
 * Elegir «la última cargada» en vez de la última VIGENTE haría que una tarifa cargada con fecha
 * futura —un aumento acordado que arranca el mes que viene— se mostrara como lo que se cobra hoy.
 */
export function tarifaVigenteDelLegajo(
  tarifas: readonly TarifaDelLegajo[], hoy: string,
): TarifaDelLegajo | null {
  let mejor: TarifaDelLegajo | null = null
  for (const t of tarifas) {
    if (formaDe(t) == null || t.desde > hoy) continue
    if (!mejor || t.desde > mejor.desde) mejor = t
  }
  return mejor
}

/** El texto de un porcentaje de variación, con su signo. `+16,8 %` · `−4,2 %`. */
export function porcentajeDeVariacion(actual: number, anterior: number): string | null {
  if (!(anterior > 0) || !Number.isFinite(actual)) return null
  const pct = ((actual - anterior) / anterior) * 100
  if (!Number.isFinite(pct)) return null
  const texto = Math.abs(pct).toLocaleString('es-AR', {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  })
  // El menos es el signo tipográfico «−» (U+2212), no el guión: en tabular-nums el guión se lee como
  // un separador y «-4,2 %» pasa por «4,2 %» de un vistazo.
  return `${pct < 0 ? '−' : '+'}${texto} %`
}

/**
 * LA VARIACIÓN CONTRA LA TARIFA ANTERIOR DE LA MISMA FORMA.
 *
 * Comparar un $/h contra un neto mensual daría un «+29.000 %» que no significa nada: cuando la
 * persona pasó de jornal a mensual —o al revés— no hay variación que declarar, hay un cambio de
 * modalidad. Sin anterior comparable devuelve `null` y el rótulo no escribe paréntesis.
 */
export function variacionDeTarifa(
  tarifas: readonly TarifaDelLegajo[], vigente: TarifaDelLegajo,
): { texto: string; anterior: number } | null {
  const forma = formaDe(vigente)
  const actual = valorDe(vigente)
  if (forma == null || actual == null) return null
  let previa: TarifaDelLegajo | null = null
  for (const t of tarifas) {
    if (t.desde >= vigente.desde || formaDe(t) !== forma) continue
    if (!previa || t.desde > previa.desde) previa = t
  }
  const anterior = previa ? valorDe(previa) : null
  if (anterior == null) return null
  const texto = porcentajeDeVariacion(actual, anterior)
  return texto == null ? null : { texto, anterior }
}

/** Un importe sin el signo de moneda: el `vs 5.974` del paréntesis. */
const crudo = (n: number): string =>
  n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

const dato = (d: Partial<DatoDelRotulo> & { rotulo: string }): DatoDelRotulo => ({
  valor: null, falta: null, detalle: null, tono: 'normal', titulo: null, ...d,
})

const sinPermiso = (rotulo: string): DatoDelRotulo =>
  dato({ rotulo, falta: SIN_PERMISO, tono: 'falta', titulo: 'La liquidación de sueldos es de Dirección y Administración: el jefe de obra no la ve.' })

/** EL $/H PACTADO (el negro): lo que se le está pagando por hora hoy, y desde cuándo. */
function datoPactado(e: EntradaDelRotulo): DatoDelRotulo {
  const vigente = tarifaVigenteDelLegajo(e.tarifas, e.hoy)
  // SIN TARIFA VA EN ÁMBAR Y NO EN GRIS: no es un dato que no aplica, es uno que falta cargar y que
  // deja a la persona fuera del total de la quincena.
  if (!vigente) {
    return dato({
      rotulo: '$/h negro', falta: 'sin $/h cargado', tono: 'warn',
      titulo: 'Sin fila vigente en persona_tarifa: la quincena no la valoriza y no suma al total.',
    })
  }
  const forma = formaDe(vigente)
  const valor = valorDe(vigente) as number
  const variacion = variacionDeTarifa(e.tarifas, vigente)
  const desde = `desde ${diaMesAnioCompletoISO(vigente.desde)}`
  return dato({
    rotulo: forma === 'mensual' ? 'pactado mensual' : '$/h negro',
    valor: forma === 'mensual' ? `${pesos(valor)} / mes` : pesos(valor),
    detalle: variacion ? `${desde} (${variacion.texto} vs ${crudo(variacion.anterior)})` : desde,
    titulo: vigente.origen?.trim() ? `origen: ${vigente.origen.trim()}` : null,
  })
}

/** EL $/H DEL RECIBO (el blanco), con LA CATEGORÍA QUE PUSO EL RECIBO. */
function datoRecibo(e: EntradaDelRotulo): DatoDelRotulo {
  const valor = e.recibo ? numero(e.recibo.valorHora) : null
  if (valor == null) {
    return dato({
      rotulo: '$/h recibo', falta: 'sin recibo cargado', tono: 'falta',
      titulo: 'No hay línea en recibo_sueldo_linea para esta persona. El blanco se estima.',
    })
  }
  const recibo = e.recibo as ReciboDelLegajo
  const categoria = recibo.categoria?.trim() || null
  return dato({
    rotulo: '$/h recibo',
    valor: pesos(valor),
    detalle: [categoria, recibo.periodo.trim() ? `(${recibo.periodo.trim()})` : null]
      .filter(Boolean).join(' '),
    titulo: 'El blanco: lo que el estudio liquidó, con la categoría del recibo (puede no ser la del legajo).',
  })
}

/** EL BÁSICO DE CONVENIO DE SU CATEGORÍA. Se llama «piso» sólo si la escala está firmada. */
function datoPiso(e: EntradaDelRotulo): DatoDelRotulo {
  // «Oficial especializado», no «oficial_especializado»: la clave de la base no se muestra cruda (QA 15/09).
  const categoria = categoriaVisible(e.categoria ?? null, null) ?? (e.categoria?.trim() || null)
  if (!e.piso) {
    return dato({
      rotulo: 'piso de convenio', falta: 'sin escala cargada', tono: 'falta',
      titulo: categoria
        ? `No hay fila de escala para ${categoria}. Sin piso no es «cumple»: es que no se puede comparar.`
        : 'Sin categoría en el legajo no hay piso que buscar.',
    })
  }
  const firmado = e.piso.origen === 'convenio'
  return dato({
    rotulo: firmado ? 'piso UOCRA' : 'básico CCT 76/75',
    valor: pesos(e.piso.valorHora),
    detalle: categoria,
    titulo: firmado
      ? `${e.piso.fuente} · vigente desde ${diaMesAnioCompletoISO(e.piso.desde)}`
      : `${e.piso.fuente} · vigente desde ${diaMesAnioCompletoISO(e.piso.desde)}. Nadie firmó que esta escala sea el piso de su convenio: se muestra como referencia, no como su piso.`,
  })
}

/** El historial de tarifas, de la más nueva a la más vieja, con la variación de cada salto. */
function historialDeTarifas(tarifas: readonly TarifaDelLegajo[]): FilaDeHistorial[] {
  const utiles = tarifas.filter((t) => formaDe(t) != null)
  const orden = [...utiles].sort((a, b) => (a.desde < b.desde ? 1 : a.desde > b.desde ? -1 : 0))
  return orden.map((t) => {
    const variacion = variacionDeTarifa(utiles, t)
    const valor = valorDe(t) as number
    return {
      desde: diaMesAnioCompletoISO(t.desde) ?? t.desde,
      valor: formaDe(t) === 'mensual' ? `${pesos(valor)} / mes` : pesos(valor),
      variacion: variacion ? `${variacion.texto} vs ${crudo(variacion.anterior)}` : null,
      origen: t.origen?.trim() || null,
    }
  })
}

/**
 * EL RÓTULO ENTERO, ARMADO DE UNA VEZ.
 *
 * Devuelve texto ya formateado y no números sueltos: así el test prueba lo que la pantalla escribe
 * —que es lo que el dueño mira— y el componente sólo pinta.
 */
export function rotuloDeValorHora(e: EntradaDelRotulo): RotuloValorHora {
  if (!e.puedeVer) {
    return {
      pactado: sinPermiso('$/h negro'),
      recibo: sinPermiso('$/h recibo'),
      piso: sinPermiso('piso de convenio'),
      historial: [],
      hayHistorial: false,
    }
  }
  const historial = historialDeTarifas(e.tarifas)
  return {
    pactado: datoPactado(e),
    recibo: datoRecibo(e),
    piso: datoPiso(e),
    historial,
    // CON UNA SOLA TARIFA NO HAY HISTORIAL: el enlace abriría una lista que repite el número de
    // arriba. Se despliega desde la segunda, que es cuando aparece la variación.
    hayHistorial: historial.length > 1,
  }
}
