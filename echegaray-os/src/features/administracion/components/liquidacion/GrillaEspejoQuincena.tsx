'use client'

// LA GRILLA DE LA VISTA «QUINCENA» — el bloque de la planilla JORNALES, en la app y editable.
//
// Una fila por persona, una columna por día con las horas, y a la derecha la cadena de pago completa:
// Horas · $/h · Cobra · Adelanto · Ya transf. · Por banco · Efectivo · Total. Es el orden en que el
// dueño lee su planilla y el orden de R5, que es el mismo.
//
// ═══ POR QUÉ ES UNA SOLA TABLA Y NO DOS PANTALLAS ═══
//
// Porque la pregunta que él hace es de la FILA: «este tipo cuántas horas hizo y cuánto le doy». Con
// los días en «Horas» y la plata en «Pagos» hay que cruzar de solapa y buscar a la persona de nuevo,
// y eso es exactamente lo que lo mandaba de vuelta al Sheet. Las dos solapas se conservan —contestan
// preguntas distintas y tienen columnas que acá no caben—, pero la que abre es ésta.
//
// ═══ NI UN NÚMERO SE CALCULA ACÁ ═══
//
// Las celdas llegan armadas por `espejoDeJornales.ts`, que a su vez usa `celdaDelDia` y la línea de
// la liquidación. Este archivo decide ANCHOS, COLORES Y DÓNDE VA EL CAMPO. Si alguna vez hace una
// resta, hay dos definiciones de la cadena de pago.
//
// ═══ LAS CELDAS SE ESCRIBEN CON LOS EDITORES QUE YA EXISTEN ═══
//
// Las de plata son `CeldaEditable` (el mismo de Pagos y del cuadro clásico, con la misma acción, la
// misma marca «manual» y el mismo acuse). Las de día son `InlineEdit` con
// `guardarHorasDeLaCelda`, que crea la fila cuando el día está vacío y delega en
// `corregirHorasDelDia` cuando existe. Copiar cualquiera de los dos habría dado dos definiciones de
// «corregir un jornal» y dos historiales.

import { InlineEdit } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { RotuloDeGrupo } from '../RotuloDeGrupo'
import { CeldaEditable, CeldaRedondeo, MarcaDeOrigen } from './CeldasDeLiquidacion'
import { horas as nHoras, pesos } from './formato'
import { ALTO_LIQ, MONO } from './solapas/tabla'
import type { CampoEditable, LineaConOverrides } from '../../services/liquidacionOverrides'
import type { CeldaDelEspejo, FilaDelEspejo, TotalesDelEspejo } from '../../services/espejoDeJornales'
import { guardarHorasDeLaCelda } from '../../services/horasDeLaCeldaActions'

const DIAS_CORTOS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] as const

/** `L1`, `S12`: la inicial del día y el número, como en el encabezado del bloque de la planilla. */
function rotuloDia(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return `${DIAS_CORTOS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}${d}`
}

/** Las columnas de la derecha, en el orden de R5. El ancho sale del número más largo que reciben. */
const DERECHA = [
  { clave: 'horas', rotulo: 'Horas', px: 52 },
  // 86 Y NO 66: en esta columna Oficina publica su NETO MENSUAL («$1.800.000»), que no es un valor
  // hora y no entra en el ancho de uno. A 66 px se cortaba en «$1.800.00C» — un importe de sueldo
  // recortado por un píxel, que es la clase de número que después nadie puede discutir contra el
  // recibo. Lo vio la captura a 1280 del 11/09/2026.
  { clave: 'valorHora', rotulo: '$/h · mensual', px: 86 },
  { clave: 'cobra', rotulo: 'Cobra', px: 94 },
  { clave: 'adelanto', rotulo: 'Adelanto', px: 86 },
  { clave: 'yaTransferido', rotulo: 'Ya transf.', px: 88 },
  { clave: 'porBanco', rotulo: 'Por banco', px: 88 },
  { clave: 'enEfectivo', rotulo: 'Efectivo', px: 90 },
  { clave: 'total', rotulo: 'Total', px: 94 },
  { clave: 'efectivoRedondeado', rotulo: 'Efect. red.', px: 96 },
  { clave: 'planilla', rotulo: 'Planilla', px: 84 },
] as const

const columnasDe = (nDias: number): string =>
  `minmax(190px,1fr) repeat(${nDias},34px) ${DERECHA.map((c) => `${c.px}px`).join(' ')}`

const anchoDe = (nDias: number): number =>
  190 + nDias * 34 + DERECHA.reduce((s, c) => s + c.px, 0) + (nDias + DERECHA.length + 1) * 6

const filaGrid = (columnas: string, alto: number): React.CSSProperties => ({
  display: 'grid', gridTemplateColumns: columnas, gap: 6, minHeight: alto,
  alignItems: 'center', borderBottom: `1px solid ${V.linea}`,
  fontSize: '12.5px', fontVariantNumeric: 'tabular-nums',
})

export interface SeccionDelEspejo {
  clave: string
  rotulo: string
  filas: FilaDelEspejo[]
}

export function GrillaEspejoQuincena({
  dias, secciones, totales, quincena, camposEditables, sello,
}: {
  dias: readonly string[]
  secciones: readonly SeccionDelEspejo[]
  totales: TotalesDelEspejo
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
  /** El sello de la planilla: lo dibuja el servidor y viaja entero. */
  sello: React.ReactNode
}) {
  const columnas = columnasDe(dias.length)
  const ancho = anchoDe(dias.length)
  return (
    <div style={{
      background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 10,
      overflow: 'hidden',
    }}>
      {sello}
      <div className="overflow-x-auto" style={{ padding: '14px 20px 0' }}>
        <div data-testid="espejo-tabla" style={{ minWidth: ancho, display: 'flex', flexDirection: 'column' }}>
          <div data-testid="espejo-encabezado" style={{
            display: 'grid', gridTemplateColumns: columnas, gap: 6,
            height: ALTO_LIQ.encabezadoAncho, alignItems: 'end', paddingBottom: 9,
            borderBottom: `1px solid ${V.linea}`, fontFamily: MONO, fontSize: '9.5px',
            letterSpacing: '.04em', color: V.tenue, textTransform: 'uppercase',
          }}>
            <div>Persona</div>
            {dias.map((f) => (
              <div key={f} style={{ textAlign: 'center' }} title={f}>{rotuloDia(f)}</div>
            ))}
            {DERECHA.map((c) => <div key={c.clave} style={{ textAlign: 'right' }}>{c.rotulo}</div>)}
          </div>

          {secciones.map((sec, i) => (
            <div key={sec.clave} data-testid={`espejo-seccion-${sec.clave}`}>
              <RotuloDeGrupo texto={sec.rotulo} primero={i === 0} />
              {sec.filas.map((fila) => (
                <Fila key={fila.personaId} fila={fila} columnas={columnas}
                  quincena={quincena} camposEditables={camposEditables} />
              ))}
            </div>
          ))}

          <Total columnas={columnas} dias={dias} totales={totales} />
        </div>
      </div>
      <PieDelEspejo totales={totales} />
    </div>
  )
}

/** Una fila: el nombre, los días y la cadena. El `title` del chip dice las dos horas que compara. */
function Fila({ fila, columnas, quincena, camposEditables }: {
  fila: FilaDelEspejo
  columnas: string
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
}) {
  const l = fila.linea
  return (
    <div data-testid={`espejo-fila-${fila.personaId}`} style={filaGrid(columnas, ALTO_LIQ.filaPersona)}>
      <div style={{ color: V.tinta, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
        title={fila.nombre}>
        {fila.nombre}
      </div>
      {fila.celdas.map((c) => (
        <CeldaDeDia key={c.fecha} celda={c} personaId={fila.personaId} nombre={fila.nombre} />
      ))}
      {/* HORAS Y $/h NO SE EDITAN ACÁ, Y NO ES UN OLVIDO. Las horas son la SUMA de los días que están
          a la izquierda: un campo que las pise dejaría la fila contradiciendo sus propias celdas. El
          $/h se escribe en la solapa Pagos, que es donde vive `persona_tarifa` con su `desde`. */}
      <Leida valor={l.horas} formato={nHoras} origen={l.origen.horas} />
      <Leida valor={l.valorHora ?? l.netoMensual} apagada
        titulo={l.netoMensual != null ? 'Neto mensual acordado' : (l.origenTarifa ?? undefined)} />
      <Leida valor={l.cobra} medio origen={l.origen.cobra} titulo={tituloDeOrigen(l, 'cobra')} />
      <Escribible campo="adelanto" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={78} />
      <Escribible campo="yaTransferido" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={80} />
      <Escribible campo="porBanco" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={80} />
      <Leida valor={l.enEfectivo} medio origen={l.origen.enEfectivo} titulo={tituloDeOrigen(l, 'enEfectivo')} />
      <Leida valor={l.total} origen={l.origen.total} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <CeldaRedondeo personaId={fila.personaId} valor={l.efectivoRedondeado}
          quincena={quincena} grupo={fila.grupo} bloqueada={fila.cerrada} ancho={88} />
      </div>
      <ChipDeCotejo fila={fila} />
    </div>
  )
}

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
function CeldaDeDia({ celda, personaId, nombre }: {
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
function tituloDeOrigen(linea: LineaConOverrides, campo: CampoEditable): string | undefined {
  const d = linea.discrepancia[campo]
  if (!d) return undefined
  // LAS DOS CIFRAS, NO UNA. Gana JORNALES —es la decisión del que paga— pero el derivado no
  // desaparece: si el extracto vio un giro que la planilla no tiene, alguien tiene que enterarse.
  return `La planilla dice ${pesos(d.jornales)} y la app calculó ${pesos(d.calculado)} `
    + `(recibos y extracto). Manda la planilla; la diferencia es ${pesos(Math.abs(d.jornales - d.calculado))}.`
}

/** Una celda calculada. `null` se dibuja «—»: falta el dato, no es cero (R1). */
function Leida({ valor, medio = false, apagada = false, formato = pesos, origen = 'calculado', titulo }: {
  valor: number | null
  medio?: boolean
  apagada?: boolean
  formato?: (n: number | null) => string
  /** De dónde salió. `jornales` se marca en azul, no con el ámbar de «manual». */
  origen?: 'calculado' | 'jornales' | 'manual'
  titulo?: string
}) {
  return (
    <div title={titulo} style={{
      textAlign: 'right', overflow: 'hidden',
      color: valor == null ? V.tenue : (apagada ? V.apagado : V.tinta),
      fontWeight: medio ? 500 : undefined,
    }}>
      {formato(valor)}<MarcaDeOrigen origen={origen} compacta titulo={titulo} />
    </div>
  )
}

/** Una celda que se escribe. Marco de control para que se vea cuál decide una persona y cuál no. */
function Escribible({ campo, fila, quincena, camposEditables, ancho }: {
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
        width: ancho, minHeight: 26, maxWidth: '100%', overflow: 'hidden',
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
function ChipDeCotejo({ fila }: { fila: FilaDelEspejo }) {
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
  const titulo = `La planilla dice ${nHoras(c.horasEnLaPlanilla)} h · la base tiene ${nHoras(c.horasEnLaBase)} h`
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

/** La fila de total, cerrada por arriba con el grafito. Es el número que se lleva a la caja. */
function Total({ columnas, dias, totales }: {
  columnas: string; dias: readonly string[]; totales: TotalesDelEspejo
}) {
  return (
    <div data-testid="espejo-total" style={{
      ...filaGrid(columnas, ALTO_LIQ.total), borderBottom: 'none',
      borderTop: `1px solid ${V.grafito}`, fontWeight: 600,
    }}>
      <div>{totales.personas} persona{totales.personas === 1 ? '' : 's'}</div>
      {dias.map((f, i) => (
        <div key={f} style={{ textAlign: 'center', color: totales.porDia[i] == null ? V.tenue : V.tinta }}>
          {totales.porDia[i] == null ? '·' : nHoras(totales.porDia[i])}
        </div>
      ))}
      <Leida valor={totales.horas} formato={nHoras} />
      <div />
      <Leida valor={totales.cobra} />
      <Leida valor={totales.adelanto} />
      <Leida valor={totales.yaTransferido} />
      <Leida valor={totales.porBanco} />
      <Leida valor={totales.enEfectivo} />
      <Leida valor={totales.total} />
      <div />
      <div />
    </div>
  )
}

/**
 * EL PIE: lo que el total NO pudo sumar, con su número.
 *
 * Se escribe sólo cuando hay algo que decir. Un párrafo permanente debajo de una tabla es uno de los
 * que el dueño prohíbe; una advertencia que aparece cuando existe el caso es información.
 */
function PieDelEspejo({ totales }: { totales: TotalesDelEspejo }) {
  const partes: string[] = []
  if (totales.sinTarifa > 0) partes.push(`${totales.sinTarifa} sin retribución cargada (no suman al total)`)
  if (totales.difieren > 0) {
    partes.push(`${totales.difieren} fila${totales.difieren === 1 ? '' : 's'} difiere${totales.difieren === 1 ? '' : 'n'} de la planilla por ${nHoras(totales.horasDeDiferencia)} h`)
  }
  if (totales.sinCotejar > 0 && totales.sinCotejar === totales.personas) {
    partes.push('todavía no se cotejó contra la planilla')
  }
  if (partes.length === 0) return <div style={{ height: 18 }} />
  return (
    <p data-testid="espejo-pie" style={{
      fontSize: '11.5px', color: V.apagado, margin: 0, padding: '10px 20px 16px',
    }}>
      {partes.join(' · ')}.
    </p>
  )
}

/**
 * El selector de quincena y de grupo. Dos recortes y nada más: el dueño pidió «quincena (anterior /
 * siguiente) y grupo. Nada más». Un panel de filtros al costado le roba 230 px a una tabla que ya
 * necesita 1.500.
 */
export function FiltrosDelEspejo({ periodos, grupos }: {
  periodos: { texto: string; activo: boolean; href: string }[]
  grupos: { texto: string; activo: boolean; href: string }[]
}) {
  return (
    <div data-testid="espejo-filtros" style={{
      display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', padding: '0 0 14px',
      fontSize: '12px',
    }}>
      <Grupo rotulo="Quincena" opciones={periodos} testid="espejo-quincenas" />
      <Grupo rotulo="Grupo" opciones={grupos} testid="espejo-grupos" />
    </div>
  )
}

function Grupo({ rotulo, opciones, testid }: {
  rotulo: string
  opciones: { texto: string; activo: boolean; href: string }[]
  testid: string
}) {
  if (opciones.length === 0) return null
  return (
    <div data-testid={testid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.05em', color: V.tenue, textTransform: 'uppercase' }}>
        {rotulo}
      </span>
      {opciones.map((o) => (
        <a key={o.href} href={o.href} style={{
          fontSize: '12px', textDecoration: 'none', padding: '3px 8px', borderRadius: 5,
          color: o.activo ? V.tinta : V.apagado,
          background: o.activo ? '#F1F0EC' : 'transparent',
          fontWeight: o.activo ? 600 : 400,
        }}>{o.texto}</a>
      ))}
    </div>
  )
}
