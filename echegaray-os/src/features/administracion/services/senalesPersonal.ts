// LAS SEÑALES DE LA PRIMERA LÍNEA DE PERSONAL — criterio 1 y 2 del patrón v2 (`19v2:40-56`).
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
// ═══ DOS DE LAS TRES NO TIENEN DÓNDE ATERRIZAR, Y SE DICE ═══
//
// «Sin fichar hoy» y «papeles vencidos» no tienen recorte propio en esta lista —no hay filtro por
// fichada del día ni por vencimiento de legajo—. El mockup las dibuja igual, sin verbo y sin
// cursor: son informativas. Un verbo que no lleva a ninguna parte enseña a no hacerle clic a la
// fila de al lado, que sí lleva.

import type { SenalDeTrabajo } from '../../../shared/components/v2/trabajo.ts'
import { estadoHoy, type EstadoDePapeles, type MarcaDeHoy } from './pulsoDelPlantel.ts'

/** Lo mínimo de una persona para decidir si reclama algo. */
export interface FilaDeSenal {
  id: string
  en_la_empresa: boolean
  obra_actual_id: string | null
}

export function senalesDePersonal({
  personas, marcas, papeles, hoyDisponible, papelesDisponible, hrefSinObra,
}: {
  personas: FilaDeSenal[]
  marcas: Map<string, MarcaDeHoy>
  papeles: Map<string, EstadoDePapeles>
  /** `false` = no se pudo leer la presencia de hoy. La señal se calla: no se puede afirmar nada. */
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

  if (hoyDisponible) {
    const n = activas.filter((p) => estadoHoy(marcas.get(p.id)) === 'sin_fichar').length
    if (n > 0) {
      s.push({
        clave: 'sin-fichar', numero: n,
        texto: n === 1 ? 'sin fichar hoy' : 'sin fichar hoy',
        // NO ES UNA AUSENCIA, y la frase lo dice: es lo único que impide que alguien lea la cifra
        // como faltas y la lleve a la liquidación.
        bloquea: 'No es una falta: se marca desde el celular o lo carga el jefe de obra',
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
