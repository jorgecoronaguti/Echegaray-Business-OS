'use client'

// LAS CELDAS DEL CUADRO DE LA QUINCENA: el día, el importe leído, el importe escribible y el chip
// contra la planilla. Mudadas desde `GrillaEspejoQuincena.tsx` cuando el cuadro sumó columnas y el
// archivo pasaba las 500 líneas. Siguen escribiendo con las acciones que ya existían:
// `guardarHorasDeLaCelda` para el día y `CeldaEditable` para la plata. Copiarlas daría dos
// definiciones de «corregir un jornal» y dos historiales.

import { InlineEdit } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { CeldaEditable, MarcaDeOrigen } from '../CeldasDeLiquidacion'
import { horas as nHoras, pesos } from '../formato'
import type { CampoEditable, LineaConOverrides } from '../../../services/liquidacionOverrides'
import type { CeldaDelEspejo, FilaDelEspejo } from '../../../services/espejoDeJornales'
import { guardarHorasDeLaCelda } from '../../../services/horasDeLaCeldaActions'

/**
 * LA CELDA DE UN DÍA. Es la que reemplaza al Sheet: se teclea el número y se va.
 *
 * ═══ LAS CUATRO CARAS DE UNA CELDA ═══
 *
 *   VACÍA Y EDITABLE    `·` gris, y al entrar se escribe. La obra la deduce el servidor y lo dice.
 *                       NUNCA un 0: «todavía no lo cargué» y «no trabajó» son dos afirmaciones.
 *   CON HORAS           el número, editable sobre su propio registro.
 *   A / L               ausencia o licencia. No se edita en línea: escribir encima diría «en
 *                       realidad vino» y «corregile las horas reconocidas» a la vez.
 *   NO EDITABLE         quincena cerrada, o el día tiene dos registros y elegir sería adivinar. Se
 *                       dibuja el valor y el `title` explica por qué no hay campo.
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
  if (!celda.editable) {
    const porque = celda.registros > 1
      ? `${celda.registros} registros ese día: corregilo desde el panel de la persona`
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
      {/* `w-[56px] sin-spinner`: con 42 px el `<input type=number>` deja 28 px útiles y el spinner
          del navegador se come el dígito — se editaba a ciegas sobre datos de liquidación. */}
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
  // LAS DOS CIFRAS, NO UNA. Gana JORNALES —es la decisión del que paga— pero el derivado no
  // desaparece: si el extracto vio un giro que la planilla no tiene, alguien tiene que enterarse.
  return `La planilla dice ${pesos(d.jornales)} y la app calculó ${pesos(d.calculado)} `
    + `(recibos y extracto). Manda la planilla; la diferencia es ${pesos(Math.abs(d.jornales - d.calculado))}.`
}

/** Una celda calculada. `null` se dibuja «—»: falta el dato, no es cero (R1). */
export function Leida({ valor, medio = false, apagada = false, unidad = 'pesos', origen = 'calculado', titulo, testid }: {
  valor: number | null
  medio?: boolean
  apagada?: boolean
  /** Unidad y no función: este componente también lo usa la vista de servidor. */
  unidad?: 'pesos' | 'horas'
  /** De dónde salió. `jornales` se marca en azul, no con el ámbar de «manual». */
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
export function Escribible({ campo, fila, quincena, camposEditables, ancho }: {
  campo: CampoEditable
  fila: FilaDelEspejo
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
  ancho: number
}) {
  const valor = fila.linea[campo]
  const soloLectura = fila.cerrada || !camposEditables.includes(campo)
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <span style={{
        width: ancho, minHeight: 28, maxWidth: '100%', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        border: soloLectura ? 'none' : `1px solid ${V.lineaFuerte}`, borderRadius: 4, padding: '0 4px',
        color: valor == null || valor === 0 ? V.lineaFuerte : V.tinta,
      }}>
        <CeldaEditable
          campo={campo}
          valor={valor}
          unidad="pesos"
          ceroEsVacio
          manual={fila.linea.manual[campo]}
          origen={fila.linea.origen[campo]}
          tituloDeOrigen={tituloDeOrigen(fila.linea, campo)}
          personaId={fila.personaId}
          quincena={quincena}
          grupo={fila.grupo}
          soloLectura={soloLectura}
          ancho="w-20"
          marcaCompacta
        />
      </span>
    </div>
  )
}

/**
 * EL CHIP CONTRA LA PLANILLA — la única razón por la que el dueño puede dejar de abrir el Sheet.
 *
 * «sin espejo» NO se dibuja verde y no se dibuja rojo: es gris, porque nadie comparó. Un chip que
 * dice «coincide» sobre una comparación que no se hizo es peor que no tener chip.
 */
export function ChipDeCotejo({ fila }: { fila: FilaDelEspejo }) {
  const c = fila.cotejo
  const estilo = {
    justifySelf: 'end', fontSize: '10.5px', padding: '2px 6px', borderRadius: 4,
    whiteSpace: 'nowrap' as const,
  }
  if (c.estado === 'sin-espejo') {
    return (
      <span data-testid={`cotejo-${fila.personaId}`} title="Todavía no se leyó el bloque de la planilla para esta quincena."
        style={{ ...estilo, color: V.tenue, background: '#F4F3EF' }}>sin espejo</span>
    )
  }
  // CON ESPEJO LEÍDO PERO SIN NINGÚN DÍA DE ESTA PERSONA, la planilla no habla de ella: «difiere 80 h»
  // sería mentir sobre una comparación que no se puede hacer (medido el 12/09/2026).
  if (c.estado === 'no-esta') {
    return (
      <span data-testid={`cotejo-${fila.personaId}`}
        title="La planilla no tiene ningún día cargado de esta persona en esta quincena."
        style={{ ...estilo, color: V.tenue, background: '#F4F3EF' }}>no está en la planilla</span>
    )
  }
  // EL TÍTULO DICE SOBRE QUÉ SE COMPARÓ. Sin eso, «coincide» sobre ocho de trece días se lee como
  // «la quincena entera está bien», y faltan cinco días que nadie cargó todavía.
  const titulo = `La planilla dice ${nHoras(c.horasEnLaPlanilla)} h · la base tiene ${nHoras(c.horasEnLaBase)} h`
    + ` · comparado sobre ${c.diasComparados} día${c.diasComparados === 1 ? '' : 's'} cargado${c.diasComparados === 1 ? '' : 's'}`
    + (c.diasSinComparar > 0 ? ` (${c.diasSinComparar} sin cargar en la planilla, no se comparan)` : '')
  if (c.estado === 'coincide') {
    return (
      <span data-testid={`cotejo-${fila.personaId}`} title={titulo}
        style={{ ...estilo, color: '#067647', background: '#ECFDF3' }}>coincide</span>
    )
  }
  const d = c.diferencia ?? 0
  return (
    <span data-testid={`cotejo-${fila.personaId}`} title={titulo}
      style={{ ...estilo, color: V.neg, background: '#FEF3F2', fontWeight: 500 }}>
      {`difiere ${nHoras(Math.abs(d))} h`}
    </span>
  )
}
