import { Aviso } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { correrQuincena, esFechaISO, quincenaDe, rotuloQuincena } from '../../../services/quincena'
import { totalesDelEspejo, type FilaDelEspejo } from '../../../services/espejoDeJornales'
import { leerCuadroDeLaQuincena } from '../../../services/cuadroDeLaQuincenaService'
import { leerDetallesLaborales } from '../../../services/detalleLaboralService'
import { ORDEN_DE_CUADROS, seccionesDePersonal } from '../../../services/ordenDePersonal'
import { historialDeTarifa, type EntradaDeHistorial } from '../../../services/cuadroDeJornales'
import type { GrupoLiquidacion } from '../../../services/liquidacionQuincena'
import { RECORTES, normalizar } from '../../../services/recorteDeLiquidacion'
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

// EL RECORTE «COBRA» Y EL BUSCADOR VIVEN EN `recorteDeLiquidacion.ts` desde el 14/09/2026: Recibos usa
// los mismos, y dos copias recortarían distinto la misma quincena.

export async function SolapaQuincena({ quincenaPedida, hoy, parametros, hrefDe }: PropsDeSolapa) {
  const quincena = quincenaDe(esFechaISO(quincenaPedida) ? (quincenaPedida as string) : hoy)
  const supabase = await createClient()
  // LA EXPOSICIÓN AL CONVENIO ES LA DE LA SOLAPA «CONVENIOS», NO UNA CUENTA NUEVA. Dueño, 14/09/2026:
  // «ok» a que el cuadro marque a quién le falta llegar al básico UOCRA. El piso, la brecha y su
  // fuente salen de `exponerAlPiso`; acá sólo se indexan por persona.
  // LAS FILAS LAS ARMA `leerCuadroDeLaQuincena`, la misma lectura que usan «Caja» y «Cierre»: así el
  // pie de acá y el renglón de totales de allá no pueden separarse por un argumento copiado distinto.
  //
  // DESDE BLANCO + NEGRO (14/09/2026) LA EXPOSICIÓN VIENE CON LA LIQUIDACIÓN: el $/h de categoría del
  // blanco estimado sale de ahí, y leerla otra vez acá serían dos fotos de la escala en el mismo render.
  const cuadro = await leerCuadroDeLaQuincena(supabase, quincena, hoy)
  const { datos, liquidacion, filas, dias, tituloDe, cuadrosCerrados } = cuadro
  const exposicion = liquidacion.exposicion
  // LO LABORAL DEL PANEL (costo cargado, legajo, HH por mes, esperadas/estado) sale del cuadro ya leído
  // más las alícuotas: es lo que tenía la grilla de «Horas», que se retiró de «Más» el 14/09/2026.
  const { detalles, errores: erroresDelDetalle } = await leerDetallesLaborales(supabase, cuadro, quincena)
  // LA MARCA «BAJO EL BÁSICO» YA NO SE ARMA ACÁ (coordinador, 14/09/2026): comparaba el $/h NEGRO con el
  // básico, y el blanco es lo que se paga a categoría. Ahora la dibuja la celda del $/h de categoría con
  // `marcaDeCategoria` (recibo real contra el piso, la misma `compararConElPiso` de Convenios).
  // EL HISTORIAL DEL VALOR HORA SALE DE LA MISMA LECTURA QUE LA MARCA DEL BÁSICO (dueño, 14/09/2026:
  // «no tengo referencias de valores hs históricos»). Una lectura propia de `persona_tarifa` daría
  // un historial que no cierra con el «−N%» de la celda de al lado.
  const historiales: Record<string, EntradaDeHistorial[]> = {}
  for (const l of exposicion.lineas) {
    historiales[l.personaId] = historialDeTarifa(
      exposicion.tarifasPorPersona[l.personaId] ?? [],
      { convenio: l.convenio, categoria: l.categoria },
      exposicion.escalas,
      quincena.hasta,
    )
  }
  // EL ESPEJO VIENE CON LA LIQUIDACIÓN, no de una lectura propia: es la misma foto de la planilla que
  // ya entró a la cadena de pago.
  const espejo = liquidacion.espejo

  // EL RECORTE RECORTA LAS FILAS QUE SE VEN Y EL TOTAL QUE LAS ACOMPAÑA. Un pie que sumara el plantel
  // entero debajo de tres filas filtradas sería un total que no cierra con lo que está arriba.
  const grupo = RECORTES.find((r) => r.clave === parametros.grupo)?.clave ?? 'todos'
  const buscar = normalizar(parametros.buscar ?? '')
  const visibles = filas
    .filter((f) => grupo === 'todos' || f.grupo === grupo)
    .filter((f) => !buscar || normalizar(f.nombre).includes(buscar))
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
      {/* LOS ERRORES DE LA EXPOSICIÓN YA VIENEN EN `liquidacion.errores`: sumarlos otra vez los dibujaba
          dos veces con la misma clave. La clave lleva el índice: dos fuentes pueden fallar con el mismo rótulo. */}
      {[...datos.errores, ...liquidacion.errores, ...erroresDelDetalle].map((e, i) => (
        <div key={`${e.que}-${i}`} style={{ padding: '0 0 10px' }}>
          <Aviso tono="neg" testid="quincena-error" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}
      <FiltrosDelEspejo
        periodos={periodos}
        grupos={grupos}
        busqueda={{
          valor: parametros.buscar ?? '',
          ocultos: { vista: 'liquidacion', quincena: quincena.desde, ...(grupo === 'todos' ? {} : { grupo }) },
          limpiar: parametros.buscar ? hrefDe({ buscar: undefined }) : null,
        }}
        cerrar={hrefDe({ solapa: 'cierre', buscar: undefined })}
      />
      <GrillaEspejoQuincena
        dias={dias}
        secciones={secciones}
        totales={totales}
        quincena={{ desde: quincena.desde, hasta: quincena.hasta }}
        camposEditables={liquidacion.camposEditables}
        historiales={historiales}
        historialCompleto={exposicion.errores.length === 0}
        detalles={detalles}
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
