// LAS SEÑALES DE LA PRIMERA LÍNEA DE PERSONAL — SIN CONSUMIDOR DESDE EL HANDOFF v4 (05/09/2026).
//
// ═══ LEER ESTO ANTES DE VOLVER A ENCHUFARLO ═══
//
// La pantalla de Personal ya NO dibuja la banda «Lo que pide trabajo»: la v4 la retiró de las
// pantallas de área, y lo que ella contaba se lee ahora en la fila que lo tiene —la celda OBRA en
// ámbar, la columna HOY, la celda PAPELES— y en el recorte que lo aísla diciendo cuántos son.
// `canonico-personal-v2.test.ts` se pone rojo si esta función vuelve a la página.
//
// No se borra porque las tres reglas de abajo son la definición escrita de qué reclama trabajo en
// el plantel, y esa definición sigue siendo cierta: lo que cambió es DÓNDE se dibuja, no qué
// bloquea. El día que exista un tablero de Dirección que necesite las mismas cuentas, salen de acá
// y no de una cuarta versión del mismo `filter`. Vale lo mismo para `senalesProveedores.ts`.
//
// Lo que sigue es la decisión original, intacta:
//
// Criterio 1 y 2 del patrón v2 (`19v2:40-56`).
//
// Lo primero que se ve al entrar a Personal no es el plantel: es lo que hay que resolver hoy. Las
// mismas cuentas que hasta ahora dibujaban las tres pastillas de alerta (`alertasDelPlantel`), pero
// partidas en cifra + qué bloquea + verbo, que es lo que hace que alguien deje lo que está haciendo.
//
// ═══ LA SEÑAL «AUSENTES SIN JUSTIFICAR» DEL MOCKUP NO SE DIBUJA ═══
//
// El `19 · Personal v2.dc.html` abre con TRES señales y la primera es «ausentes sin justificar», en
// rojo. **Este modelo no tiene ausencias.** `estadoHoy` devuelve `en_obra`, `ya_cerro` o
// `sin_fichar`, y «sin fichar» incluye al que no tiene teléfono, al que no le dio permiso al GPS y
// al que faltó: el mismo silencio visto desde acá. Pintar ese silencio de rojo y llamarlo ausencia
// fabricaría una novedad de liquidación sobre una batería descargada. Quién faltó lo declara el
// jefe de obra, y hasta que exista ese hecho la señal no tiene fuente.
//
// ═══ LA SEÑAL «SIN FICHAR HOY» SE RETIRÓ (08/09/2026, tercera marca del dueño) ═══
//
// *«todas las pantallas en donde aparezca el concepto de fichado no tiene que resolverse con las
// hs; está mal: una cosa es asistencia o activo en el día y otra cosa son las cantidades de hs»*.
//
// La señal contaba, sobre `presencia_del_dia`, a todo el que no tuviera una marca de hoy y lo
// publicaba como «N sin fichar hoy». Dos problemas, y cada uno alcanza:
//
//  1. «Sin fichar» NO ES VOCABULARIO DE ESTADO. El estado de una persona en el día es presente,
//     ausente, licencia o sin marcar; «no fichó» es la falta de una capacidad que todavía no está
//     en uso —cuatro marcas en toda la historia— y como cifra en una banda de alerta se lee como
//     faltas del plantel entero.
//  2. NO TENÍA CONSUMIDOR desde el handoff v4, así que ni siquiera se dibujaba.
//
// El día que exista un tablero que necesite decir cuánta gente no tiene NADA declarado hoy, la
// cifra sale de `asistencia_dia`/`asistencia_marca` con la palabra «sin marcar» y con `clasificar`
// —no de contar los que no fichan—. Sin esa fuente enchufada acá no había nada honesto que decir.
//
// ═══ LO QUE QUEDA, Y POR QUÉ UNA SOLA TRAE VERBO ═══
//
// «Papeles vencidos» no tiene recorte propio en esta lista —no hay filtro por vencimiento de
// legajo—. El mockup la dibuja igual, sin verbo y sin cursor: es informativa. Un verbo que no lleva
// a ninguna parte enseña a no hacerle clic a la fila de al lado, que sí lleva.

import type { SenalDeTrabajo } from '../../../shared/components/v2/trabajo.ts'
import type { EstadoDePapeles, MarcaDeHoy } from './pulsoDelPlantel.ts'

/** Lo mínimo de una persona para decidir si reclama algo. */
export interface FilaDeSenal {
  id: string
  en_la_empresa: boolean
  obra_actual_id: string | null
}

export function senalesDePersonal({
  // `marcas` y `hoyDisponible` siguen en el contrato pero YA NO SE MIRAN: la señal que los usaba
  // contaba fichajes y se retiró (ver arriba). Se dejan porque quien llama los tiene a mano y
  // sacarlos obligaría a tocar la página para no cambiar nada de lo que se dibuja.
  personas, papeles, papelesDisponible, hrefSinObra,
}: {
  personas: FilaDeSenal[]
  /** Las marcas de fichaje de hoy. YA NO SE USAN para ninguna señal —ver el bloque de arriba— y se
   *  siguen recibiendo porque quien llama las tiene: sacarlas del contrato obligaría a tocar la
   *  página para no cambiar nada de lo que se dibuja. */
  marcas: Map<string, MarcaDeHoy>
  papeles: Map<string, EstadoDePapeles>
  /** `false` = no se pudo leer la presencia de hoy. Ninguna señal la mira desde el 08/09/2026. */
  hoyDisponible: boolean
  /** `false` = no hay ni un vencimiento cargado. Ver `hayControlDeVencimientos`. */
  papelesDisponible: boolean
  /** El recorte «Sin asignar», que es el único de los tres que existe. */
  hrefSinObra: string
}): SenalDeTrabajo[] {
  const s: SenalDeTrabajo[] = []
  const activas = personas.filter((p) => p.en_la_empresa)

  if (papelesDisponible) {
    const n = activas.filter((p) => (papeles.get(p.id)?.vencidos ?? 0) > 0).length
    if (n > 0) {
      s.push({
        clave: 'papeles', numero: n, tono: 'neg',
        texto: n === 1 ? 'persona con papeles vencidos' : 'personas con papeles vencidos',
        bloquea: 'Con la libreta o el apto médico vencido no puede estar en obra',
        accion: '',
      })
    }
  }

  const sinObra = activas.filter((p) => p.obra_actual_id == null).length
  if (sinObra > 0) {
    s.push({
      clave: 'sin-obra', numero: sinObra,
      texto: sinObra === 1 ? 'sin obra asignada' : 'sin obra asignada',
      bloquea: 'No suman a la proyección de dotación de ninguna obra',
      accion: 'Asignar', href: hrefSinObra,
    })
  }

  return s
}
