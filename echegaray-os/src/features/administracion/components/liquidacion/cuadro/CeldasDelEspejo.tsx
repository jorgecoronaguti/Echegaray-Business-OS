'use client'

// LAS CELDAS DEL CUADRO DE LA QUINCENA: el día, el importe leído, el importe escribible, cuánto cobra
// cada uno en la quincena y cómo se le paga. Escriben con las acciones que ya existían:
// `guardarHorasDeLaCelda` para el día y `CeldaEditable` para la plata.
//
// ═══ SIN CHIP DE PLANILLA (dueño, 14/09/2026) ═══
//
// *«está rota esa columna final que dice "planilla", que no tiene sentido que esté»*. El cotejo con
// JORNALES sigue existiendo —el sello de arriba dice cuántas filas difieren y el panel de la persona
// dice por cuánto—, pero no ocupa una columna de un cuadro que tiene que servir para calcular.

import { InlineEdit } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { CeldaEditable, MarcaDeOrigen } from '../CeldasDeLiquidacion'
import { horas as nHoras, pesos } from '../formato'
import { referenciaDeJornales } from './estadoDelPago'
import type { CampoEditable, LineaConOverrides } from '../../../services/liquidacionOverrides'
import type { CeldaDelEspejo, FilaDelEspejo } from '../../../services/espejoDeJornales'
import { guardarHorasDeLaCelda } from '../../../services/horasDeLaCeldaActions'
import { tituloDeExtras } from '../../../services/liquidacionQuincena'

/**
 * LA CELDA DE UN DÍA. Es la que reemplaza al Sheet: se teclea el número y se va.
 *
 *   VACÍA Y EDITABLE    `·` gris. NUNCA un 0: «todavía no lo cargué» y «no trabajó» son dos cosas.
 *   CON HORAS           las horas CARGADAS del día (=4+3*1,5 se lee 7; la plata paga 8,5).
 *                       También el día que completó la app: cuenta y se paga (dueño, 14/09/2026).
 *   A / L               ausencia o licencia. No se edita en línea.
 *   NO EDITABLE         quincena cerrada, o dos registros ese día: elegir sería adivinar.
 */
export function CeldaDeDia({ celda, personaId, nombre }: {
  celda: CeldaDelEspejo; personaId: string; nombre: string
}) {
  if (celda.marca === 'ausencia') {
    return <div title={`${celda.fecha} · ausencia`} style={{ textAlign: 'center', color: V.neg, fontWeight: 500 }}>A</div>
  }
  if (celda.marca === 'licencia') {
    return <div title={`${celda.fecha} · licencia`} style={{ textAlign: 'center', color: '#175CD3' }}>L</div>
  }
  // UN DÍA COMPLETADO POR LA APP SE VE CON SU NÚMERO, COMO CUALQUIER DÍA (dueño, 14/09/2026): cuenta en
  // «Horas» y se paga en Liquidación (`horasDelDia`). Ya no hay «·» ni aviso de «no se pagan».
  if (!celda.editable) {
    const porque = celda.registros > 1
      ? `${celda.registros} registros ese día: corregilo desde la solapa Horas`
      : 'la quincena está cerrada'
    return (
      <div title={`${celda.fecha} · ${porque}`} style={{
        textAlign: 'center', color: celda.horas == null ? V.lineaFuerte : V.apagado,
      }}>
        {celda.horas == null ? '·' : nHoras(celda.horas)}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      {/* `w-[56px] sin-spinner`: con 42 px el spinner del navegador se come el dígito. */}
      <InlineEdit
        valor={celda.horas ?? null}
        tipo="numero"
        falta="·"
        ancho="w-[56px] sin-spinner"
        alineado="center"
        etiqueta={`Horas de ${nombre} el ${celda.fecha}`}
        testid={`espejo-dia-${personaId}-${celda.fecha}`}
        guardar={guardarHorasDeLaCelda.bind(null, personaId, celda.fecha)}
      />
    </div>
  )
}

/** El `title` de la marca cuando JORNALES y la cuenta de la app no dicen lo mismo. */
export function tituloDeOrigen(linea: LineaConOverrides, campo: CampoEditable): string | undefined {
  const d = linea.discrepancia[campo]
  if (!d) return undefined
  return `La planilla dice ${pesos(d.jornales)} y la app calculó ${pesos(d.calculado)} `
    + `(recibos y extracto). Manda la planilla; la diferencia es ${pesos(Math.abs(d.jornales - d.calculado))}.`
}

/** Una celda calculada. `null` se dibuja «—»: falta el dato, no es cero (R1). */
export function Leida({ valor, medio = false, apagada = false, unidad = 'pesos', origen = 'calculado', titulo, testid }: {
  valor: number | null
  medio?: boolean
  apagada?: boolean
  unidad?: 'pesos' | 'horas'
  /** De dónde salió: punto azul JORNALES, punto ámbar manual, nada si es la cuenta de la app. */
  origen?: 'calculado' | 'jornales' | 'manual'
  titulo?: string
  testid?: string
}) {
  const formato = unidad === 'horas' ? nHoras : pesos
  return (
    <div data-testid={testid} title={titulo} style={{
      textAlign: 'right', overflow: 'hidden', whiteSpace: 'nowrap',
      color: valor == null ? V.tenue : (apagada ? V.apagado : V.tinta),
      fontWeight: medio ? 500 : undefined,
    }}>
      {formato(valor)}<MarcaDeOrigen origen={origen} compacta titulo={titulo} />
    </div>
  )
}

/** Una celda que se escribe. Marco de control para que se vea cuál decide una persona y cuál no. */
export function Escribible({ campo, fila, quincena, camposEditables, ancho, claseCampo = 'w-20', unidad = 'pesos' }: {
  campo: CampoEditable
  fila: FilaDelEspejo
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
  ancho: number
  /** El ancho del campo de adentro. `w-20` corta «$142.748,87» con centavos: el panel pide más. */
  claseCampo?: string
  /** Pesos por defecto; «Hs recibo» se escribe en horas. */
  unidad?: 'pesos' | 'horas'
}) {
  const valor = fila.linea[campo]
  const soloLectura = fila.cerrada || !camposEditables.includes(campo)
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <span style={{
        width: ancho, minHeight: 32, maxWidth: '100%', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        border: soloLectura ? 'none' : `1px solid ${V.lineaFuerte}`, borderRadius: 4, padding: '0 4px',
        color: valor == null || valor === 0 ? V.lineaFuerte : V.tinta,
      }}>
        <CeldaEditable
          campo={campo}
          valor={valor}
          unidad={unidad}
          ceroEsVacio
          manual={fila.linea.manual[campo]}
          origen={fila.linea.origen[campo]}
          tituloDeOrigen={tituloDeOrigen(fila.linea, campo)}
          personaId={fila.personaId}
          quincena={quincena}
          grupo={fila.grupo}
          soloLectura={soloLectura}
          ancho={claseCampo}
          marcaCompacta
        />
      </span>
    </div>
  )
}

/**
 * LA MARCA DE LA CELDA: lo manual se marca siempre; si no, el punto de JORNALES sólo cuando la planilla
 * dice otra cosa que el cuadro. No manda: el `title` dice qué dice la planilla (dueño, 14/09/2026).
 */
const marcaCon = (origen: 'calculado' | 'jornales' | 'manual', ref: { titulo: string } | null) =>
  origen === 'calculado' && ref ? 'jornales' : origen

/**
 * HORAS: las horas cargadas, el mismo total de «Horas». Si la plata usa horas equivalentes (extras con
 * recargo) el `title` lo aclara; y la referencia de JORNALES cuando difiere.
 */
export function CeldaHorasPagas({ fila }: { fila: FilaDelEspejo }) {
  const l = fila.linea
  const ref = referenciaDeJornales(l)
  const titulo = [tituloDeExtras(l), ref?.titulo].filter(Boolean).join(' · ')
  return (
    <Leida valor={l.horas} unidad="horas" testid={`espejo-hs-pagas-${fila.personaId}`}
      origen={marcaCon(l.origen.horas, ref)} titulo={titulo || undefined} />
  )
}
