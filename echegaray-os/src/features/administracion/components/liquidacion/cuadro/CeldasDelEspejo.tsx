'use client'

// LAS CELDAS DEL CUADRO DE LA QUINCENA: el día, el importe leído, el importe escribible y la cifra que
// el dueño busca —cuánto le falta pagar a cada uno y cómo—. Escriben con las acciones que ya existían:
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
import { cierreDeLaFila } from '../../../services/cuadroDeJornales'
import type { CampoEditable, LineaConOverrides } from '../../../services/liquidacionOverrides'
import type { CeldaDelEspejo, FilaDelEspejo } from '../../../services/espejoDeJornales'
import { guardarHorasDeLaCelda } from '../../../services/horasDeLaCeldaActions'

/**
 * LA CELDA DE UN DÍA. Es la que reemplaza al Sheet: se teclea el número y se va.
 *
 *   VACÍA Y EDITABLE    `·` gris. NUNCA un 0: «todavía no lo cargué» y «no trabajó» son dos cosas.
 *   CON HORAS           las horas PAGAS del día (=4+3*1,5 se lee 8,5, como en la planilla).
 *   AUTOMÁTICA          jornada `web:presencia-defecto` que nadie confirmó: «8a» en gris, no se
 *                       paga. Escribir el número la confirma (el registro pasa a tener autor).
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
  // LA JORNADA AUTOMÁTICA SE VE COMO LO QUE ES PARA EL PAGO: UN DÍA SIN HORAS. Dueño, 14/09/2026:
  // *«hay dias de cada persona … q dicen 8a 9a no se q es eso, esta mal, corregir»*. Eran las filas
  // `web:presencia-defecto` del 11/09 y del 14/09, que nadie cargó y no se pagan. El «·» es el mismo
  // de cualquier día vacío; lo que la app supuso queda en el `title`.
  const automatica = celda.marca !== 'horas' && celda.automatica != null
  const tituloAutomatica = automatica
    ? `${celda.fecha} · sin horas cargadas; la app supone ${nHoras(celda.automatica)} h pero no se pagan hasta que se escriban`
    : undefined
  if (!celda.editable) {
    const porque = celda.registros > 1
      ? `${celda.registros} registros ese día: corregilo desde la solapa Horas`
      : 'la quincena está cerrada'
    return (
      <div title={tituloAutomatica ?? `${celda.fecha} · ${porque}`} style={{
        textAlign: 'center', color: celda.horas == null ? V.lineaFuerte : V.apagado,
      }}>
        {celda.horas == null ? '·' : nHoras(celda.horas)}
      </div>
    )
  }
  return (
    <div
      data-testid={automatica ? `espejo-automatica-${personaId}-${celda.fecha}` : undefined}
      title={tituloAutomatica}
      style={{ display: 'flex', justifyContent: 'center' }}>
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
 * LO QUE LE FALTA PAGAR A LA PERSONA EN ESTA QUINCENA — la cifra que el dueño no encontraba.
 *
 * Dueño, 14/09/2026: *«no sé cuánto es el total que cobra cada persona»*. Arriba el TOTAL, con peso;
 * abajo cómo se paga: banco (blanco) y efectivo, y «50/50» cuando rige el acuerdo. Si el total no sale
 * de gana − adelanto − ya transferido, o no es banco + efectivo, se pinta en rojo y dice por cuánto.
 */
export function CeldaLeFaltaPagar({ fila }: { fila: FilaDelEspejo }) {
  const l = fila.linea
  const cierre = cierreDeLaFila(l)
  if (l.total == null) {
    return (
      <div data-testid={`le-falta-pagar-${fila.personaId}`} style={{ textAlign: 'right', color: V.tenue }}
        title="Sin retribución cargada: no hay total que afirmar.">sin tarifa</div>
    )
  }
  const noCierra = cierre?.cierra === false
  // Hay acuerdo 50/50 pero el estudio todavía no liquidó: el banco no tiene cifra, no es «todo en efectivo».
  const sinRecibo = l.porBanco === 0 && l.reciboNeto == null
  return (
    <div data-testid={`le-falta-pagar-${fila.personaId}`} style={{ textAlign: 'right', lineHeight: 1.25, overflow: 'hidden' }}
      title={noCierra
        ? `No cierra: gana ${pesos(l.cobra)} − adelanto ${pesos(l.adelanto)} − ya transferido ${pesos(l.yaTransferido)} no da ${pesos(l.total)} (diferencia ${pesos(cierre?.diferencia ?? null)}).`
        : `Gana ${pesos(l.cobra)} − adelanto ${pesos(l.adelanto)} − ya transferido ${pesos(l.yaTransferido)} = banco ${pesos(l.porBanco)} + efectivo ${pesos(l.enEfectivo)}`}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: noCierra ? V.neg : V.tinta, whiteSpace: 'nowrap' }}>
        {/* EL ACUERDO VA EN LA LÍNEA DEL TOTAL: en la del reparto se cortaba en «50/5C» a 168 px
            (captura del 14/09/2026). «50/50» junto a «banco $0» se leía como «todo en efectivo»: sin
            recibo del estudio el banco todavía no tiene cifra, y se dice. */}
        {l.blancoAcuerdo != null && (
          <span data-testid={`acuerdo-${fila.personaId}`}
            style={{ fontSize: '10.5px', fontWeight: 400, color: V.apagado, marginRight: 8 }}
            title={`Acuerdo 50/50: banco ${pesos(l.blancoAcuerdo)} · efectivo ${pesos(l.efectivoAcuerdo)}`
              + (sinRecibo ? '. Todavía no hay recibo del estudio: el banco figura en $0 hasta que llegue.' : '')}>
            {`50/50${sinRecibo ? ' sin recibo' : ''}`}
          </span>
        )}
        {pesos(l.total)}<MarcaDeOrigen origen={l.origen.total} compacta />
      </div>
      <div style={{ fontSize: '11px', color: V.apagado, whiteSpace: 'nowrap' }}>
        {`banco ${pesos(l.porBanco)} · efvo ${pesos(l.enEfectivo)}`}
      </div>
    </div>
  )
}
