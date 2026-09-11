import { Aviso } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { correrQuincena, esFechaISO, quincenaDe, rotuloQuincena } from '../../../services/quincena'
import { getDatosDeLaSolapaHoras } from '../../../services/grillaHorasQuincenaService'
import { getLiquidacionDeLaQuincena } from '../../../services/liquidacionQuincenaService'
import {
  diasConHorasDe, diasDelEspejo, filasDelEspejo, totalesDelEspejo, type FilaDelEspejo,
} from '../../../services/espejoDeJornales'
import { ORDEN_DE_CUADROS, seccionesDePersonal } from '../../../services/ordenDePersonal'
import type { LineaConOverrides } from '../../../services/liquidacionOverrides'
import type { GrupoLiquidacion } from '../../../services/liquidacionQuincena'
import { FiltrosDelEspejo, GrillaEspejoQuincena, type SeccionDelEspejo } from '../GrillaEspejoQuincena'
import { MONO } from './tabla'
import type { PropsDeSolapa } from './index'

// 0 · QUINCENA — EL ESPEJO DE LA PLANILLA JORNALES, Y LA SOLAPA QUE ABRE.
//
// El dueño, 11/09/2026, tres veces: *«No me sirve la sección Liquidación en módulo Personal, la
// utilidad es pésima, la UX es malísima, tengo que seguir usando Sheet JORNALES»*. Su modelo mental es
// el bloque de «Obreros 26» / «Oficina 26». Esta pantalla ES ese bloque: una fila por persona, una
// columna por día con las horas, y a la derecha la cadena de pago. Editable en la celda.
//
// ═══ POR QUÉ VA PRIMERA Y LAS OTRAS SEIS SE QUEDAN ═══
//
// Porque es la que él abre. Las otras contestan preguntas que esta tabla no puede contestar sin
// volverse ilegible —el costo cargado por obra, el estado del cierre, los recibos, el convenio—, y
// borrarlas sería perder trabajo que funciona. Lo que cambia es el DEFAULT: entrar a Liquidación
// tiene que mostrar la quincena, no una pantalla desde la que hay que navegar hasta ella.
//
// ═══ LAS TRES LECTURAS, Y NINGUNA CALCULA DOS VECES LO MISMO ═══
//
//   getDatosDeLaSolapaHoras     los días: `registros_hh` + `asistencia_dia` de la ventana
//   getLiquidacionDeLaQuincena  la plata: la cadena ya armada, con overrides y estados de cierre
//   getEspejoDeLaPlanilla       el bloque de JORNALES, para el sello y el cotejo por fila
//
// Son las dos tandas que ya corría la solapa «Horas» (que también pide las dos, por el mismo motivo:
// la cadena de la persona es la misma fila del cuadro de Pagos) más una lectura de una tabla chica.
//
// ═══ EL SELLO ES LA CONDICIÓN DE QUE ESTO REEMPLACE AL SHEET ═══
//
// Mientras el dueño no pueda VER que la base dice lo mismo que su planilla, la planilla sigue siendo
// la fuente y esto es un adorno. Arriba va cuándo se leyó JORNALES y cuántas filas difieren; por fila,
// el chip. Y cuando el espejo no está leído, el sello lo dice con todas las letras en vez de mostrar
// una tabla que parece cotejada.

const RECORTES: { clave: GrupoLiquidacion | 'todos'; texto: string }[] = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'oficina', texto: 'Oficina' },
  { clave: 'obreros', texto: 'Obreros' },
  { clave: 'final', texto: 'Finales' },
]

export async function SolapaQuincena({ quincenaPedida, hoy, parametros, hrefDe }: PropsDeSolapa) {
  const quincena = quincenaDe(esFechaISO(quincenaPedida) ? (quincenaPedida as string) : hoy)
  const supabase = await createClient()
  const [datos, liquidacion] = await Promise.all([
    getDatosDeLaSolapaHoras(supabase, quincena),
    getLiquidacionDeLaQuincena(supabase, quincena),
  ])
  // EL ESPEJO VIENE CON LA LIQUIDACIÓN, no de una lectura propia: es la misma función que ya lo usa
  // para meter los adelantos de la planilla en la cadena de pago. Leerlo dos veces daría dos fotos
  // de la planilla y un chip que coteja contra una y una celda que cobra según la otra.
  const espejo = liquidacion.espejo

  const lineas: Record<string, { grupo: GrupoLiquidacion; linea: LineaConOverrides }> = {}
  const tituloDe = new Map<GrupoLiquidacion, string>()
  for (const cuadro of liquidacion.cuadros) {
    tituloDe.set(cuadro.grupo, cuadro.titulo)
    for (const linea of cuadro.lineas) lineas[linea.personaId] = { grupo: cuadro.grupo, linea }
  }
  const cuadrosCerrados = new Set(
    Object.entries(liquidacion.estados).filter(([, e]) => e.estado === 'cerrada').map(([g]) => g),
  )

  const filas = filasDelEspejo({
    quincena,
    personas: datos.personas,
    registros: datos.registros,
    presencias: datos.presencias,
    lineas,
    cuadrosCerrados,
    horasDeLaPlanilla: espejo.horasPorPersona,
    diasDeLaPlanilla: espejo.diasPorPersona,
    hayEspejo: espejo.hay,
    hoy,
  })
  const dias = diasDelEspejo(quincena, diasConHorasDe(datos.registros))

  // EL RECORTE RECORTA LAS FILAS QUE SE VEN Y EL TOTAL QUE LAS ACOMPAÑA. Un pie que sumara el plantel
  // entero debajo de tres filas filtradas sería un total que no cierra con lo que está arriba.
  const grupo = RECORTES.find((r) => r.clave === parametros.grupo)?.clave ?? 'todos'
  const visibles = grupo === 'todos' ? filas : filas.filter((f) => f.grupo === grupo)
  const secciones = seccionesDelEspejo(visibles, tituloDe)
  const totales = totalesDelEspejo(visibles)

  const periodos = [-1, 0, 1].map((n) => {
    const q = correrQuincena(quincena, n)
    return {
      texto: n === 0 ? rotuloQuincena(quincena) : (n === -1 ? '← anterior' : 'siguiente →'),
      activo: n === 0,
      href: hrefDe({ quincena: q.desde }),
    }
  })
  const grupos = RECORTES
    .filter((r) => r.clave === 'todos' || filas.some((f) => f.grupo === r.clave))
    .map((r) => ({
      texto: r.texto,
      activo: grupo === r.clave,
      href: hrefDe({ grupo: r.clave === 'todos' ? undefined : r.clave }),
    }))

  return (
    <div data-testid="vista-quincena">
      {[...datos.errores, ...liquidacion.errores].map((e) => (
        <div key={e.que} style={{ padding: '0 0 10px' }}>
          <Aviso tono="neg" testid="quincena-error" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}
      <FiltrosDelEspejo periodos={periodos} grupos={grupos} />
      <GrillaEspejoQuincena
        dias={dias}
        secciones={secciones}
        totales={totales}
        quincena={{ desde: quincena.desde, hasta: quincena.hasta }}
        camposEditables={liquidacion.camposEditables}
        sello={
          <Sello
            titulo={rotuloQuincena(quincena)}
            cerrada={cuadrosCerrados.size > 0}
            espejo={espejo}
            difieren={totales.difieren}
            horasDeDiferencia={totales.horasDeDiferencia}
          />
        }
      />
    </div>
  )
}

/**
 * LAS SECCIONES, EN EL ORDEN DE LOS CUADROS Y CON LOS RÓTULOS DEL MÓDULO PERSONAL.
 *
 * `seccionesDePersonal` es la única que sabe qué rótulo lleva cada cuadro («Jefes de obra · 2» cuando
 * el rol coincide, el nombre del cuadro cuando no). Repetir el criterio acá daría una pantalla de
 * Liquidación que rotula distinto que las otras seis, que es el pedido de uniformidad del 10/09/2026.
 */
function seccionesDelEspejo(
  filas: readonly FilaDelEspejo[], tituloDe: ReadonlyMap<GrupoLiquidacion, string>,
): SeccionDelEspejo[] {
  return ORDEN_DE_CUADROS.flatMap((g) => {
    const suyas = filas.filter((f) => f.grupo === g)
    if (suyas.length === 0) return []
    return seccionesDePersonal(g, tituloDe.get(g) ?? g, suyas, (f) => f.nombre, (f) => f.esJefe)
      .map((s) => ({ clave: s.clave, rotulo: s.rotulo, filas: s.lineas }))
  })
}

/**
 * EL SELLO: CUÁNDO SE LEYÓ JORNALES Y SI LA BASE DICE LO MISMO.
 *
 * ═══ «NO SE LEYÓ» NO SE DISFRAZA DE «TODO BIEN» ═══
 *
 * Sin espejo el sello lo dice y nombra el comando que lo llena. Es lo único honesto: el chip de cada
 * fila queda en «sin espejo», y un encabezado en verde encima de quince chips grises haría que el
 * dueño deje de abrir la planilla creyendo que alguien comparó.
 */
function Sello({ titulo, cerrada, espejo, difieren, horasDeDiferencia }: {
  titulo: string
  cerrada: boolean
  espejo: { hay: boolean; leidoEn: string | null; bloques: { pestana: string; filaBloque: number; personas: number }[]; sinPersona: string[] }
  difieren: number
  horasDeDiferencia: number
}) {
  const rotulo = { fontSize: '11px', color: V.tenue, fontFamily: MONO, letterSpacing: '.05em' } as const
  return (
    <div style={{
      padding: '18px 20px 15px', display: 'flex', alignItems: 'flex-end',
      justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
      borderBottom: `1px solid ${V.linea}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontSize: '14.5px', fontWeight: 600, color: V.tinta }}>{titulo}</span>
        <span style={{ fontSize: '12px', color: V.apagado }}>{cerrada ? 'cerrada' : 'abierta'}</span>
      </div>
      <div data-testid="espejo-sello" style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={rotulo}>JORNALES</span>
        {!espejo.hay
          ? (
            <span data-testid="espejo-sin-leer" style={{ fontSize: '12px', color: V.warn }}
              title="Lo llena `node orquestador/scripts/jornales-espejo-bloques.mjs --aplicar`, que corre en la VM: la web no puede leer Google.">
              sin leer para esta quincena · no se cotejó ninguna fila
            </span>
          )
          : (
            <>
              <span data-testid="espejo-leido-en" style={{ fontSize: '12px', color: V.tintaSuave }}>
                {`leído el ${fechaLarga(espejo.leidoEn)}`}
              </span>
              <span style={{ fontSize: '11.5px', color: V.tenue }}
                title={espejo.bloques.map((b) => `«${b.pestana}» fila ${b.filaBloque}: ${b.personas} personas`).join(' · ')}>
                {`${espejo.bloques.length} bloque${espejo.bloques.length === 1 ? '' : 's'}`}
              </span>
              <span data-testid="espejo-difieren" style={{
                fontSize: '12px', fontWeight: difieren > 0 ? 600 : 400,
                color: difieren > 0 ? V.neg : '#067647',
              }}>
                {difieren === 0
                  ? 'la base coincide con la planilla'
                  : `${difieren} fila${difieren === 1 ? '' : 's'} difiere${difieren === 1 ? '' : 'n'} · ${horasDeDiferencia} h`}
              </span>
              {espejo.sinPersona.length > 0 && (
                <span data-testid="espejo-sin-persona" style={{ fontSize: '11.5px', color: V.warn }}
                  title={espejo.sinPersona.join(' · ')}>
                  {`${espejo.sinPersona.length} de la planilla sin persona en el padrón`}
                </span>
              )}
            </>
          )}
      </div>
    </div>
  )
}

/** `11/09/2026 17:05`. Sin segundos: lo que importa es de qué corrida del importador viene el dato. */
function fechaLarga(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`
}
