import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { quincenaDe, rotuloQuincena, type Quincena } from '../../../services/quincena'
import {
  desvioDelAcuerdo, tarjetaDeQuincena, totalesDeCuadro,
  type LineaLiquidada, type TotalesDeCuadro,
} from '../../../services/liquidacionQuincena'
import { getLiquidacionDeLaQuincena } from '../../../services/liquidacionQuincenaService'
import { pesos } from '../BloqueLiquidacion'
import { seccionesDePersonal, type SeccionDePersonal } from '../../../services/ordenDePersonal'
import { RotuloDeGrupo } from '../../RotuloDeGrupo'
import { SolapaCajaNomina } from './caja-nomina'
import { ALTO_LIQ } from './tabla'

// 4 · PAGOS · LA CADENA DE LA QUINCENA.
//
// Las cuatro celdas que se ESCRIBEN (adelanto, ya transferido, por banco, efectivo redondeado) y
// las tres que se CALCULAN (cobra, en efectivo, total). El orden de las columnas es el de R5, que es
// el orden en que el dueño hace la resta a mano.
//
// ═══ POR QUÉ ESTA SOLAPA NO ES LA GRILLA DE HORAS CON MÁS COLUMNAS ═══
//
// Porque contesta otra pregunta. «Horas» pregunta cuánto trabajó cada uno; «Pagos» pregunta por qué
// canal sale cada peso y cuánto tiene que haber en el sobre. Los totales de abajo son de BANCO y
// EFECTIVO, no de horas.
//
// ═══ EL RECIBO SIN GIRO NO CUENTA COMO BANCO (R7) ═══
//
// Que el estudio haya liquidado un neto no dice que el banco lo haya movido. Hasta que el lote
// aparece en el extracto esa plata sigue por pagar y tiene que salir en efectivo. La fila lo marca
// y el total de BANCO no la incluye — contarla giraría de menos en el sobre de esa persona.

export async function SolapaPagos({ quincenaPedida, hoy }: { quincenaPedida?: string; hoy: string }) {
  const quincena = quincenaDe(quincenaPedida && /^\d{4}-\d{2}-\d{2}$/.test(quincenaPedida) ? quincenaPedida : hoy)
  const supabase = await createClient()
  const { cuadros, sinActividad, estados } = await getLiquidacionDeLaQuincena(supabase, quincena)
  const totales = cuadros.map((c) => totalesDeCuadro(c.lineas))
  const tarjeta = tarjetaDeQuincena(totales)
  const lineas = cuadros.flatMap((c) => c.lineas)
  // ═══ EL MISMO ORDEN Y LOS MISMOS RÓTULOS QUE PLANTEL, ASISTENCIA Y HORAS ═══
  //
  // Dueño, 10/09/2026: «te pedí uniformidad en las pantallas; acá estoy en la sección y es distinto
  // a las demás». Los cuadros de pago se conservan —son la definición de POR QUÉ cobra cada uno— y
  // salen en el orden del módulo (Oficina/jefes arriba), cada uno con el rótulo de su rol. Antes
  // esta tabla era una lista plana: quince obreros alfabéticos y los dos jefes de Oficina al final,
  // sin nada que dijera por qué estaban ahí.
  const secciones = cuadros.flatMap((c) =>
    seccionesDePersonal(c.grupo, c.titulo, c.lineas, (l) => l.nombre, (l) => l.esJefe))
  // EL TOTAL DE LA TABLA ES EL DE TODAS LAS LÍNEAS QUE SE VEN, no la suma de los cuadros: los
  // grupos se dibujan juntos, así que el pie tiene que cerrar contra lo que está arriba.
  const totalPlantel = totalesDeCuadro(lineas)
  const cerrada = Object.values(estados).some((e) => e.estado === 'cerrada')

  return (
    <div data-testid="solapa-pagos">
      {/* UN SOLO CUADRO: encabezado, tabla y total comparten filo. */}
      <div style={{
        background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 10,
        overflow: 'hidden',
      }}>
        <Encabezado quincena={quincena} tarjeta={tarjeta} cerrada={cerrada} />
        <Tabla secciones={secciones} totales={totalPlantel} />
        <div style={{ height: 20 }} />
      </div>
      {/* PANTALLA 9 · CAJA DE NÓMINA VIVE ACÁ, no en una solapa propia: el mockup lista CINCO
          solapas (§4) y «Caja de nómina» no es una de ellas. Es la consecuencia directa de esta
          pantalla —POR BANCO y EN EFECTIVO son sus dos primeras filas—, y una solapa aparte
          obligaría a cruzar de pantalla para leer el total que se acaba de calcular. */}
      <div style={{ marginTop: 32 }}>
        {await SolapaCajaNomina({ quincena })}
      </div>
      {sinActividad.length > 0 && (
        <p data-testid="pagos-sin-actividad" style={{ fontSize: '11.5px', color: V.apagado, margin: '10px 0 0' }}>
          {sinActividad.length} sin actividad esta quincena · no aparecen acá y no se dieron de baja.
        </p>
      )}
      <p style={{ fontSize: '11px', color: V.tenue, lineHeight: 1.6, margin: '12px 0 0' }}>
        Se escriben ADELANTO · YA TRANSFERIDO · POR BANCO · EFECT. RED. — el resto es la cadena.
        {' '}Un giro hecho antes de armar el lote va en YA TRANSFERIDO, no en ADELANTO.
      </p>
    </div>
  )
}

/**
 * EL ENCABEZADO VIVE DENTRO DEL CUADRO (mockup pantalla 4, línea 385), no en una caja aparte.
 *
 * La regla de geometría del handoff §2 es explícita: «antes de una card, ¿hace falta esta caja?».
 * Dos cajas apiladas —una con los tres números y otra con la tabla— dicen que son dos cosas, y son
 * la misma: el total de abajo es la suma de la tabla de arriba.
 */
function Encabezado({ quincena, tarjeta, cerrada }: {
  quincena: Quincena
  tarjeta: { porBanco: number; enEfectivo: number; total: number; cierra: boolean }
  cerrada?: boolean
}) {
  return (
    <div style={{
      padding: '20px 20px 17px', display: 'flex', alignItems: 'flex-end',
      justifyContent: 'space-between', gap: 24, flexWrap: 'wrap',
      borderBottom: `1px solid ${V.linea}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontSize: '14.5px', fontWeight: 600, color: V.tinta }}>{rotuloQuincena(quincena)}</span>
        <span style={{ fontSize: '12px', color: V.apagado }}>{cerrada ? 'cerrada' : 'abierta'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
        <Cifra rotulo="POR BANCO" valor={tarjeta.porBanco} testid="pagos-por-banco" />
        <Cifra rotulo="EN EFECTIVO" valor={tarjeta.enEfectivo} testid="pagos-en-efectivo" />
        <Cifra rotulo="TOTAL" valor={tarjeta.total} testid="pagos-total" />
      </div>
    </div>
  )
}

/**
 * Las columnas del mockup (línea 396), en píxeles medidos. El orden es el de R5.
 *
 * ═══ LAS DOS DEL ACUERDO 50/50 VAN PEGADAS A COBRA ═══
 *
 * El dueño (10/09/2026): «el acuerdo con todos los empleados es 50% en blanco y 50% en efectivo, no
 * me lo está mostrando actualmente». Son un derivado de COBRA y NO se escriben: entran antes de
 * ADELANTO, que es donde arranca la cadena de pago real. Con ellas el ancho mínimo pasa de 940 a
 * 1.144 px — dos columnas de 92 con su gap—; la tabla ya se recorre en horizontal.
 */
const COLUMNAS = 'minmax(220px,1fr) 46px 60px 92px 92px 92px 84px 94px 92px 96px 96px 96px'
const ROTULOS = ['Persona', 'Horas', '$/h', 'Cobra', 'Blanco 50%', 'Efectivo 50%', 'Adelanto',
  'Ya transf.', 'Por banco', 'Efectivo', 'Total', 'Efect. red.']
const MONO = 'var(--font-mono, "IBM Plex Mono", monospace)'

const fila = (alto: number): React.CSSProperties => ({
  display: 'grid', gridTemplateColumns: COLUMNAS, gap: 10, minHeight: alto,
  alignItems: 'center', borderBottom: `1px solid ${V.linea}`,
  fontSize: '12.5px', fontVariantNumeric: 'tabular-nums',
})

function Tabla({ secciones, totales }: {
  secciones: readonly SeccionDePersonal<LineaLiquidada>[]
  totales: TotalesDeCuadro
}) {
  return (
    <div className="overflow-x-auto" style={{ padding: '16px 20px 0' }}>
      <div data-testid="pagos-tabla" style={{ minWidth: 1144, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: COLUMNAS, gap: 10, height: ALTO_LIQ.encabezadoAncho, alignItems: 'end',
          borderBottom: `1px solid ${V.linea}`, paddingBottom: 9, fontFamily: MONO,
          fontSize: '9.5px', letterSpacing: '.04em', color: V.tenue, textTransform: 'uppercase',
        }}>
          {ROTULOS.map((c, i) => (
            <div key={c} style={{ textAlign: i === 0 ? 'left' : 'right' }}>{c}</div>
          ))}
        </div>

        {secciones.map((sec, iSec) => (
          <div key={sec.clave} data-testid={`seccion-${sec.clave}`}>
            {/* CON UNA SOLA SECCIÓN TAMBIÉN VA EL RÓTULO: en Pagos siempre hay al menos dos roles
                (Oficina y Obreros) y omitirlo en el caso raro de uno solo haría que la pantalla se
                viera distinta según qué quincena se mire. */}
            <RotuloDeGrupo texto={sec.rotulo} primero={iSec === 0} />
            {sec.lineas.map((l) => (
          <div key={l.personaId} style={fila(58)}>
            <div style={{ color: V.tinta }}>
              {l.nombre}
              {l.reciboSinGiro && (
                <span data-testid="pagos-recibo-sin-giro" style={{ display: 'block', fontSize: '10.5px', color: V.warn }}>
                  recibo sin giro · no cuenta como banco
                </span>
              )}
            </div>
            <Celda valor={l.horas} />
            <Celda valor={l.valorHora} apagada />
            <Celda valor={l.cobra} medio />
            {/* LO ACORDADO, NO LO LIQUIDADO. «—» donde no hay acuerdo 50/50: Oficina cobra un neto
                mensual cuyo recibo del 01/09 no fue la mitad, y el cuadro `final` son
                subcontratistas. Inventarles una mitad sería acordar por ellos. */}
            <Celda valor={l.blancoAcuerdo} apagada />
            <Celda valor={l.efectivoAcuerdo} apagada />
            <Escribible valor={l.adelanto} ancho={76} />
            <Escribible valor={l.yaTransferido} ancho={86} />
            <Escribible
              valor={l.porBanco}
              ancho={84}
              // EL DESVÍO ENTRE EL RECIBO Y LA MITAD ACORDADA ES LO QUE TERMINA EN EFECTIVO. Se
              // señala acá porque es donde el número deja de ser la mitad. No corrige nada: el
              // recibo manda (orden del 31/08/2026), pero hasta hoy había que restar dos columnas
              // a ojo para verlo.
              desvio={desvioDelAcuerdo(l)}
              blanco={l.blancoAcuerdo}
            />
            <Celda valor={l.enEfectivo} medio />
            <Celda valor={l.total} />
            <Escribible valor={l.efectivoRedondeado} ancho={88} />
          </div>
            ))}
          </div>
        ))}

        {/* LA FILA DE TOTAL FALTABA ENTERA. Es el número que se lleva a la caja: sin ella hay que
            sumar diecisiete filas a ojo para saber cuánto efectivo pedir. Línea grafito de 1 px
            (handoff §2, «fila de total 48-58 px con border-top #30302F»). */}
        <div data-testid="pagos-total-fila" style={{
          ...fila(58), borderBottom: 'none', borderTop: `1px solid ${V.grafito}`, fontWeight: 600,
        }}>
          <div>
            {totales.personas} persona{totales.personas === 1 ? '' : 's'}
            {totales.sinTarifa > 0 && ` · ${totales.sinTarifa} sin retribución`}
            {totales.sinReparto > 0 && ` · ${totales.sinReparto} sin acuerdo 50/50`}
          </div>
          <Celda valor={totales.horas} />
          <div />
          <Celda valor={totales.cobra} />
          {/* LAS MITADES NO SUMAN A QUIEN NO TIENE ACUERDO, y la línea de abajo dice cuántos son. */}
          <Celda valor={totales.blancoAcuerdo} />
          <Celda valor={totales.efectivoAcuerdo} />
          <Celda valor={totales.adelanto} />
          <Celda valor={totales.yaTransferido} />
          <Celda valor={totales.porBanco} />
          <Celda valor={totales.enEfectivo} />
          <Celda valor={totales.total} />
          <div />
        </div>
      </div>
    </div>
  )
}

/** Una celda calculada. `null` se dibuja «—»: falta el dato, no es cero (R1). */
function Celda({ valor, medio = false, apagada = false }: {
  valor: number | null; medio?: boolean; apagada?: boolean
}) {
  return (
    <div style={{
      textAlign: 'right',
      color: valor == null ? V.tenue : (apagada ? V.apagado : V.tinta),
      fontWeight: medio ? 500 : undefined,
    }}>
      {valor == null ? '—' : pesos(valor)}
    </div>
  )
}

/**
 * Una celda que se escribe. Se dibuja con el marco del control aunque acá sea de sólo lectura: es
 * la diferencia que la pantalla tiene que enseñar entre «esto lo decidís vos» y «esto es una
 * cuenta». El `<input>` real lo monta la grilla editable.
 */
function Escribible({ valor, ancho, desvio = null, blanco = null }: {
  valor: number | null; ancho: number; desvio?: number | null; blanco?: number | null
}) {
  const titulo = desvio == null || blanco == null ? undefined
    : `recibo ${pesos(valor ?? 0)} · acuerdo ${pesos(blanco)} · diferencia ${pesos(Math.abs(desvio))}`
      + ` ${desvio < 0 ? 'que sale en efectivo' : 'girada de más'}`
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }} title={titulo}>
      <span style={{
        width: ancho, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        border: `1px solid ${V.lineaFuerte}`, borderRadius: 4, padding: '0 4px',
        // EL DESVÍO CONTRA EL ACUERDO SE VE, no se deduce: tono de alerta y el detalle en el title.
        color: desvio != null ? V.warn
          : (valor == null || valor === 0 ? V.lineaFuerte : V.tinta),
      }}>
        {valor == null || valor === 0 ? '—' : pesos(valor)}
      </span>
    </div>
  )
}

/** El rótulo va en mono y versalita: es un encabezado de columna, no una etiqueta de formulario. */
function Cifra({ rotulo, valor, testid }: { rotulo: string; valor: number; testid: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: '11px', color: V.tenue, fontFamily: MONO, letterSpacing: '.05em' }}>{rotulo}</span>
      <span data-testid={testid} style={{
        fontSize: '17px', fontWeight: 600, color: V.tinta, fontVariantNumeric: 'tabular-nums',
      }}>{pesos(valor)}</span>
    </div>
  )
}
