// EL CUADRO DE LA QUINCENA, LEÍDO Y ARMADO UNA SOLA VEZ — para la Quincena, Caja y Cierre.
//
// ═══ POR QUÉ EXISTE ═══
//
// Dueño, 14/09/2026: datos repetidos en «Más» y un total distinto en cada sección. El pie de la
// Quincena sumaba con `totalesDelEspejo` sobre las filas del espejo; «Caja de nómina» con
// `totalesDeCuadro` sobre los cuadros; «Cierre» con `estadoDeCierre.totalSellado`. Tres funciones para
// «cuánto falta pagar», y la población de cada una no era la misma.
//
// Con esta lectura las tres pantallas arman las MISMAS filas con los MISMOS argumentos y suman con
// `totalesDelEspejo`: un número que difiere entre dos secciones ya no puede venir de copiar mal los
// parámetros de `filasDelEspejo` en una de ellas.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getDatosDeLaSolapaHoras, type DatosDeLaSolapaHoras } from './grillaHorasQuincenaService.ts'
import { getLiquidacionDeLaQuincena } from './liquidacionQuincenaService.ts'
import { diasConHorasDe, diasDelEspejo, filasDelEspejo, type FilaDelEspejo } from './espejoDeJornales.ts'
import { filasDeGrilla, type FilaDeGrilla } from './grillaHorasQuincena.ts'
import type { LineaConOverrides } from './liquidacionOverrides.ts'
import type { GrupoLiquidacion } from './liquidacionQuincena.ts'
import type { Quincena } from './quincena.ts'
import { estadoDelCuadro } from './estadoDelCuadro.ts'
import { sinDiasVivos } from './liquidacionSellada.ts'

export interface CuadroDeLaQuincena {
  datos: DatosDeLaSolapaHoras
  liquidacion: Awaited<ReturnType<typeof getLiquidacionDeLaQuincena>>
  tituloDe: Map<GrupoLiquidacion, string>
  cuadrosCerrados: Set<string>
  /** Las filas del cuadro (y de su pie). Sólo quien tiene línea de pago. */
  filas: FilaDelEspejo[]
  /** Las filas día por día del plantel entero: de acá salen los pendientes y la masa en curso. */
  grilla: FilaDeGrilla[]
  dias: string[]
}

export async function leerCuadroDeLaQuincena(
  supabase: SupabaseClient, quincena: Quincena, hoy: string,
): Promise<CuadroDeLaQuincena> {
  const [datos, liquidacion] = await Promise.all([
    getDatosDeLaSolapaHoras(supabase, quincena),
    getLiquidacionDeLaQuincena(supabase, quincena),
  ])
  // EL PLANTEL DE LA QUINCENA, UNA SOLA DECISIÓN (`plantelDeLaQuincena`, en la liquidación): las filas del
  // cuadro, la grilla de pendientes y la masa en curso salen de las mismas personas.
  const enPlantel = new Set(liquidacion.plantel)
  const personas = datos.personas.filter((p) => enPlantel.has(p.id))
  const lineas: Record<string, { grupo: GrupoLiquidacion; linea: LineaConOverrides }> = {}
  const tituloDe = new Map<GrupoLiquidacion, string>()
  for (const cuadro of liquidacion.cuadros) {
    tituloDe.set(cuadro.grupo, cuadro.titulo)
    for (const linea of cuadro.lineas) lineas[linea.personaId] = { grupo: cuadro.grupo, linea }
  }
  // POR CUADRO, NO POR CABECERA: un cuadro sin cabecera propia hereda la quincena (`estadoDelCuadro`).
  const cuadrosCerrados = new Set(
    liquidacion.cuadros.map((c) => c.grupo).filter((g) => estadoDelCuadro(liquidacion.estados, g).estado === 'cerrada'),
  )
  // EL ESPEJO VIENE CON LA LIQUIDACIÓN: es la misma foto de la planilla que ya entró a la cadena.
  const { espejo } = liquidacion
  // LOS DÍAS DE LO CERRADO NO SE DIBUJAN: la foto sella el total, no los días (`sinDiasVivos`).
  const { filas, dias } = sinDiasVivos(filasDelEspejo({
    quincena, personas, registros: datos.registros, presencias: datos.presencias,
    lineas, cuadrosCerrados, hayEspejo: espejo.hay, hoy,
    horasDeLaPlanilla: espejo.horasPorPersona, diasDeLaPlanilla: espejo.diasPorPersona,
  }), diasDelEspejo(quincena, diasConHorasDe(datos.registros)), (c) => ({
    ...c, marca: 'sin-cargar' as const, horas: null, sinMotivo: false, tardanza: null, editable: false, registros: 0, registroId: null,
  }))
  const grilla = filasDeGrilla({
    quincena, personas, registros: datos.registros, presencias: datos.presencias,
    personaDeRegistro: (r) => (r as unknown as { persona_id: string }).persona_id,
    personaDePresencia: (p) => (p as unknown as { persona_id: string }).persona_id,
    hoy,
  })
  return { datos: { ...datos, personas }, liquidacion, tituloDe, cuadrosCerrados, filas, grilla, dias }
}
