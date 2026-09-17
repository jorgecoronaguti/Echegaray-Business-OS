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
import { CeldaEditable, IconoDeAviso, MarcaDeOrigen } from '../CeldasDeLiquidacion'
import { horas as nHoras, pesos } from '../formato'
import { referenciaDeJornales } from './estadoDelPago'
import { horasNoCoincidenConLosDias, type CampoEditable, type LineaConOverrides } from '../../../services/liquidacionOverrides'
import type { EdicionDelBlanco } from './CeldasBlancoNegro'
import type { CeldaDelEspejo, FilaDelEspejo } from '../../../services/espejoDeJornales'
import { guardarHorasDeLaCelda } from '../../../services/horasDeLaCeldaActions'
import { tituloDeExtras } from '../../../services/liquidacionQuincena'
import { fechasCortas, type PresentismoDeLinea } from '../../../services/presentismo'

/**
 * LA CELDA DE UN DÍA. Es la que reemplaza al Sheet: se teclea el número y se va.
 *
 *   VACÍA Y EDITABLE    `·` gris. NUNCA un 0: «todavía no lo cargué» y «no trabajó» son dos cosas.
 *   CON HORAS           las horas CARGADAS del día (=4+3*1,5 se lee 7; la plata paga 8,5).
 *                       También el día que completó la app: cuenta y se paga (dueño, 14/09/2026).
 *   A / L               ausencia o licencia. No se edita en línea.
 *   NO EDITABLE         quincena cerrada, o dos registros ese día: elegir sería adivinar.
 */
/**
 * LA CELDA DE PRESENTISMO (dueño, 15/09/2026). El importe cuando aplica; «perdido dd/mm» en ámbar cuando
 * una marca lo hizo perder; «sin categoría» apagado cuando el legajo no dice qué básico usar (0 y sin
 * pendiente); «—» fuera del modelo (Oficina, finales, quincena anterior al 16/09).
 */
export function CeldaPresentismo({ fila }: { fila: FilaDelEspejo }) {
  const p = fila.linea.presentismo
  const testid = `presentismo-${fila.personaId}`
  // NO APLICA · MENSUAL (dueño, 17/09/2026). Se dice textual: «—» se lee igual que «todavía no rige».
  if (p?.estado === 'no_aplica' || fila.linea.modalidad === 'mensual') {
    return (
      <div data-testid={testid} data-presentismo="no-aplica" title="Cobra por mes: el presentismo es del convenio de obreros, no suma ni descuenta."
        style={{ textAlign: 'right', fontSize: '11px', lineHeight: '13px', color: V.apagado }}>no aplica · mensual</div>
    )
  }
  if (!p || p.estado === 'no_rige') {
    return <div data-testid={testid} style={{ textAlign: 'right', color: V.lineaFuerte }}>—</div>
  }
  if (p.estado === 'sin_categoria') {
    return (
      <div data-testid={testid} data-presentismo="sin-categoria" title="Sin categoría en el legajo: no hay básico con qué calcularlo"
        style={{ textAlign: 'right', fontSize: '11px', color: V.apagado }}>sin categoría</div>
    )
  }
  if (p.estado === 'sin_horas' || p.importe == null) {
    // SIN HORAS PERO CON UNA FALTA O TARDANZA YA CARGADA: se dice, sin importe (QA, 17/09/2026: el pie publicaba
    // «Presentismo perdido (1) −$0»). Cuando haya horas, el estado pasa a «perdido» con su importe.
    if (p.perdido.length > 0) {
      return (
        <div data-testid={testid} data-presentismo="sin-horas-con-causa" title={`Sin horas todavía: no hay importe. ${motivosDePerdida(p)}`}
          style={{ textAlign: 'right', fontSize: '11px', lineHeight: '13px', color: V.warn }}>sin horas · {fechasCortas(p.perdido)}</div>
      )
    }
    return <div data-testid={testid} title="Sin horas: no hay presentismo que calcular" style={{ textAlign: 'right', color: V.tenue }}>·</div>
  }
  // LA CUENTA COMPLETA, COMO LA PIDIÓ EL DUEÑO (16/09/2026): base (50 % en blanco) × 20 %. El 50 % en
  // efectivo NO entra en la base, y el `title` lo dice para que nadie lo dude mirando la pantalla.
  const cuenta = `Base ${pesos(p.base)} (${fila.linea.horas ?? 0} h × ${pesos(p.basico)}/h × 50 % en blanco`
    + `${p.categoria ? `, ${p.categoria}` : ''}) × 20 % = ${pesos(p.importe)}`
  if (p.estado === 'perdido') {
    return (
      <div data-testid={testid} data-presentismo="perdido" title={`${cuenta} · PERDIDO: ${motivosDePerdida(p)} · se descuenta del negro`}
        style={{ textAlign: 'right', whiteSpace: 'nowrap', color: V.warn, fontWeight: 500 }}>
        perdido {fechasCortas(p.perdido)}
      </div>
    )
  }
  // A REVISAR: cobra el presentismo, pero hay días que nadie clasificó. Se dice en la celda, porque si
  // se resuelven como falta injustificada esa plata se va — y quien liquida tiene que verlo ANTES de pagar.
  if (p.estado === 'a_revisar') {
    return (
      <div data-testid={testid} data-presentismo="a-revisar"
        title={`${cuenta} · sin clasificar: ${fechasCortas(p.aRevisar)}. No vino y nadie cargó el motivo: hasta que se cargue NO se descuenta.`}
        style={{ textAlign: 'right', whiteSpace: 'nowrap', color: V.tintaSuave }}>
        {pesos(p.importe)} <span style={{ color: V.warn, fontWeight: 600 }} aria-hidden>•</span>
      </div>
    )
  }
  return (
    <div data-testid={testid} data-presentismo="aplica" title={`${cuenta}. Es parte del cobra: cumple y cobra lo de siempre.`}
      style={{ textAlign: 'right', whiteSpace: 'nowrap', color: V.tintaSuave }}>{pesos(p.importe)}</div>
  )
}

/** «18/09 Faltó sin avisar · 22/09 Llegó tarde». La foto vieja no guardó causas: quedan las fechas. */
export function motivosDePerdida(p: PresentismoDeLinea): string {
  if (p.causas.length === 0) return fechasCortas(p.perdido)
  return p.causas.map((c) => `${c.fecha.slice(8, 10)}/${c.fecha.slice(5, 7)} ${c.etiqueta}`).join(' · ')
}

/** El glifo de tardanza sobre un día trabajado: ▲ ámbar chico, con el detalle en el `title`. */
function MarcaDeTardanza({ celda }: { celda: CeldaDelEspejo }) {
  const t = celda.tardanza
  if (!t || (!t.llegoTarde && !t.salioAntes)) return null
  const que = [t.llegoTarde ? 'llegó tarde' : null, t.salioAntes ? 'salió antes' : null].filter(Boolean).join(' y ')
  return (
    <span data-testid={`tardanza-${celda.fecha}`} title={`${celda.fecha} · ${que}: pierde el presentismo de la quincena`}
      style={{ position: 'absolute', top: -2, right: 0, fontSize: '8px', color: V.warn, pointerEvents: 'none' }}>▲</span>
  )
}

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
        textAlign: 'center', color: celda.horas == null ? V.lineaFuerte : V.apagado, position: 'relative',
      }}>
        <MarcaDeTardanza celda={celda} />
        {celda.horas == null ? '' : nHoras(celda.horas)}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
      <MarcaDeTardanza celda={celda} />
      {/* `w-[56px] sin-spinner`: con 42 px el spinner del navegador se come el dígito. */}
      <InlineEdit
        valor={celda.horas ?? null}
        tipo="numero"
        // DÍA VACÍO = CELDA EN BLANCO (limpieza 17/09/2026): un «·» por día sin cargar eran 200 puntos en pantalla. Sigue
        // sin ser un 0, y la celda se ve al pasar el puntero o con Tab.
        falta=""
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

/** Cómo se nombra cada celda en el aviso de deshacer: los rótulos de las columnas del cuadro. */
const ROTULO_DE_CAMPO: Partial<Record<CampoEditable, string>> = {
  porBanco: 'Banco', adelanto: 'Adelanto efectivo', yaTransferido: 'Adelanto banco / embargos', horasRecibo: 'Hs recibo',
  valorHoraRecibo: '$/h cat.', negro: 'Importe negro', enEfectivo: 'Total efectivo', cobra: 'Cobra total', horas: 'Horas',
  horasNegro: 'Hs negro', pagadoBanco: 'Pagado por banco', pagadoEfectivo: 'Pagado en efectivo',
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
        // SIN MARCO FIJO (limpieza 17/09/2026): una caja con borde en cada celda escribible convertía el cuadro en un
        // formulario. La celda de adentro (`InlineEdit`) ya se ve escribible: subrayado punteado, borde al pasar, foco.
        padding: '0 4px',
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
          expresion={fila.linea.formulas[campo] ?? null}
          ancho={claseCampo}
          rotuloDeshacer={`${ROTULO_DE_CAMPO[campo] ?? campo} de ${fila.nombre}`}
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
export function CeldaHorasPagas({ fila, edicion }: { fila: FilaDelEspejo; edicion?: EdicionDelBlanco }) {
  const l = fila.linea
  const ref = referenciaDeJornales(l)
  const titulo = [tituloDeExtras(l), ref?.titulo].filter(Boolean).join(' · ')
  // HORAS SE ESCRIBE EN LA ABIERTA (dueño, 15/09/2026: «todas las celdas editables»). Sólo obreros: son las horas que
  // se pagan. Escrita distinta de la suma de los días se guarda igual y avisa con un ⚠ y su `title`: un texto debajo
  // rompía el alto de la fila (dueño, 15/09/2026).
  if (edicion && !fila.cerrada && fila.grupo === 'obreros' && edicion.camposEditables.includes('horas')) {
    const dias = horasNoCoincidenConLosDias(l)
    return (
      <div data-testid={`espejo-hs-pagas-${fila.personaId}`} title={titulo || undefined}
        style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <Escribible campo="horas" unidad="horas" fila={fila} quincena={edicion.quincena}
          camposEditables={edicion.camposEditables} ancho={56} claseCampo="w-12" />
        {dias != null && (
          <IconoDeAviso titulo={`no coincide con los días: ${nHoras(dias)} h`} testid={`horas-no-coinciden-${fila.personaId}`} />
        )}
      </div>
    )
  }
  return (
    <Leida valor={l.horas} unidad="horas" testid={`espejo-hs-pagas-${fila.personaId}`}
      origen={marcaCon(l.origen.horas, ref)} titulo={titulo || undefined} />
  )
}
