'use client'

// EL PANEL DE LA PERSONA EN EL CUADRO DE LA QUINCENA — la misma cadena que la fila, con su origen.
//
// Dueño, 14/09/2026: *«realmente no se entiende nada el cuadro de liq de hs, vamos a rehacer»*. El panel
// repite la fila en vertical y dice DE DÓNDE sale cada eslabón: el blanco (recibo del estudio o
// estimado), el negro (horas que el recibo no paga × $/h negro), lo PAGADO de cada lado y lo que falta
// (15/09/2026: los mismos saldos que el cuadro, de `pagoDeLaQuincena.ts`; el panel no hace una segunda
// cuenta). Debajo, el historial del $/h y lo laboral que tenía «Horas».
//
// Oficina, liquidaciones finales y la quincena cerrada no tienen blanco + negro: muestran la cadena de
// siempre (`CadenaSinModelo`), con el acuerdo 50/50 donde lo hay.
//
// ═══ DRAWER Y NO `PanelDePersona` ═══
//
// `PanelDePersona` se despliega DEBAJO de la grilla y empuja la fila que se está mirando fuera de la
// pantalla. Éste flota encima (`Drawer`) y el cuadro no se mueve.
//
// ═══ LOS MISMOS CUATRO BLOQUES QUE EL CUADRO (dueño, 17/09/2026) ═══
//
// Horas · Recibo blanco · Recibo negro · Resto del cálculo, con el mismo rótulo y el mismo fondo de
// `bloquesDelCuadro.ts`. Lo pagado y el saldo de cada lado viven dentro de su recibo, como en la fila; el resto
// (presentismo, billetes redondeados, total, pagado, a pagar hoy) cierra abajo.
//
// Ni una cuenta nueva: las cifras son las de la línea; el cierre, `cierreDeLaFila`; los redondeos,
// `efectivoRedondeado.ts`.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Drawer } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { horas as nHoras, pesos } from '../formato'
import { Escribible, Leida } from './CeldasDelEspejo'
import { origenDelBlanco, urlDelRecibo } from './CeldasBlancoNegro'
import { HistorialDeTarifa } from './HistorialDeTarifa'
import { rotuloCategoria } from './CeldaTarifa'
import { tituloDeJornales } from './estadoDelPago'
import { ALTO_LIQ } from '../solapas/tabla'
import { cierreDeLaFila, type EntradaDeHistorial } from '../../../services/cuadroDeJornales'
import { avisoDeExcedente } from '../../../services/pagoDeLaQuincena'
import { fechasCortas, PRESENTISMO_PCT } from '../../../services/presentismo'
import { motivosDePerdida } from './CeldasDelEspejo'
import type { CampoEditable } from '../../../services/liquidacionOverrides'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import type { DetalleLaboral } from '../../../services/detalleLaboral'
import { DetalleLaboralDeLaPersona } from './DetalleLaboralDeLaPersona'
import { ReciboPorConceptos } from './ReciboPorConceptos'
import { BLOQUES, type ClaveDeBloque } from './bloquesDelCuadro'
import { efectivoMostrado, saldoRedondeado } from '../../../services/efectivoRedondeado'

const MONO = "'IBM Plex Mono', monospace"
const corta = (iso: string | null): string =>
  iso == null ? 'sin cargar' : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

interface PropsDeCadena {
  fila: FilaDelEspejo
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
}

export function PanelDeLaPersona({ fila, quincena, camposEditables, historial, historialCompleto, detalle, onCerrar }: PropsDeCadena & {
  historial: readonly EntradaDeHistorial[]
  historialCompleto: boolean
  /** Lo laboral que tenía la grilla de «Horas»: costo cargado, legajo, HH por mes, esperadas y estado. */
  detalle?: DetalleLaboral
  onCerrar: () => void
}) {
  const jornales = tituloDeJornales(fila.linea)
  return (
    <Drawer
      titulo={fila.nombre}
      subtitulo={`${fila.categoria ? rotuloCategoria(fila.categoria) : 'sin categoría'} · alta ${corta(fila.alta)}`}
      onCerrar={onCerrar}
      ancho={520}
      testid="panel-cuadro-persona"
      pie={<Link href={`/administracion/personas/${fila.personaId}`} prefetch={false} style={{ fontSize: '12.5px', color: V.tinta }}>Ver el legajo completo</Link>}
    >
      <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {fila.linea.sueldo
          ? <CadenaBlancoNegro fila={fila} quincena={quincena} camposEditables={camposEditables} />
          : <CadenaSinModelo fila={fila} quincena={quincena} camposEditables={camposEditables} />}

        {/* SIN AVISO DE «SIN HORAS CARGADAS / NO SE PAGAN»: desde el 14/09/2026 los días completados por
            la app cuentan y se pagan (dueño). */}
        {(fila.cotejo.estado === 'difiere' || jornales) && (
          <section style={{ fontSize: '12px', color: V.apagado, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {fila.cotejo.estado === 'difiere' && (
              <div>{`La planilla dice ${nHoras(fila.cotejo.horasEnLaPlanilla)} h y la base ${nHoras(fila.cotejo.horasEnLaBase)} h.`}</div>
            )}
            {jornales && <div data-testid="panel-jornales">{jornales}</div>}
          </section>
        )}

        <HistorialDeTarifa entradas={historial} completo={historialCompleto} />

        <DetalleLaboralDeLaPersona detalle={detalle} />
      </div>
    </Drawer>
  )
}

/** HORAS · RECIBO BLANCO (con su origen, pagado y saldo) · RECIBO NEGRO (ídem) · RESTO: presentismo, total, a pagar hoy. */
function CadenaBlancoNegro({ fila, quincena, camposEditables }: PropsDeCadena) {
  const l = fila.linea
  const s = l.sueldo!
  const cierre = cierreDeLaFila(l)
  const est = s.estado === 'estimado'
  return (
    <section data-testid="panel-cadena" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* EL MISMO ORDEN QUE LA FILA DEL CUADRO: horas · blanco · negro · resto del cálculo. */}
      <BloqueDelPanel bloque="horas">
        <Renglon rotulo="Horas" nota="las de la quincena: las que se pagan">
          <Leida valor={l.horas} unidad="horas" />
        </Renglon>
      </BloqueDelPanel>

      <BloqueDelPanel bloque="blanco" detalle={s.estado === 'recibo' ? 'recibo' : 'estimado'}>
        <Renglon rotulo="Hs recibo" nota={origenDelBlanco(s)}>
          <Leida valor={s.horasBlanco} unidad="horas" apagada={est} />
        </Renglon>
        <Renglon rotulo="$/h cat."><Leida valor={s.valorHoraCategoria} apagada={est} /></Renglon>
        <Renglon rotulo="Bruto"><Leida valor={s.bruto} apagada={est} /></Renglon>
        <Renglon rotulo="Banco" nota={s.driveFileId ? undefined : (s.neto == null ? 'sin neto' : undefined)}>
          {s.driveFileId && (
            <a href={urlDelRecibo(s.driveFileId)} target="_blank" rel="noreferrer" data-testid="panel-recibo-pdf"
              style={{ fontSize: '11.5px', color: V.apagado, marginRight: 8 }}>recibo ↗</a>
          )}
          <Escribible campo="porBanco" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={148} claseCampo="w-32" />
        </Renglon>
        {/* EL RECIBO CONCEPTO POR CONCEPTO (dueño, 14/09/2026): el estimado cuyo neto es el Banco preliminar, o el real
            contra el estimado cuando llegó el del estudio. */}
        <div style={{ height: 8 }} />
        <ReciboPorConceptos s={s} />
        <div style={{ height: 8 }} />
        <PagadoYSaldo lado="banco" fila={fila} quincena={quincena} camposEditables={camposEditables} />
      </BloqueDelPanel>

      <BloqueDelPanel bloque="negro">
        <Renglon rotulo="Hs"
          nota={s.reciboExcedeHoras ? 'el recibo paga más horas que las cargadas' : 'las que el recibo no paga'} alerta={s.reciboExcedeHoras}>
          <Leida valor={s.horasNegro} unidad="horas" />
        </Renglon>
        <Renglon rotulo="$/h negro"><Leida valor={s.valorHoraNegro} /></Renglon>
        <Renglon rotulo="Importe">
          <Escribible campo="negro" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={148} claseCampo="w-32" />
        </Renglon>
        <PagadoYSaldo lado="efectivo" fila={fila} quincena={quincena} camposEditables={camposEditables} />
      </BloqueDelPanel>

      <BloqueDelPanel bloque="resto">
        <PresentismoDelPanel fila={fila} />
        <EfectivoRedondeadoDelPanel fila={fila} />
        <Renglon rotulo="Cobra total" fuerte
          nota={cierre && !cierre.cierra ? `no cierra por ${pesos(cierre.diferencia)}` : (est ? 'banco + negro · blanco estimado' : 'banco + negro')}
          alerta={cierre?.cierra === false}>
          <Escribible campo="cobra" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={148} claseCampo="w-32" />
        </Renglon>
        <Renglon rotulo="Pagado" nota="banco + efectivo"><Leida valor={l.pago.pagado} /></Renglon>
        <Renglon rotulo="A pagar hoy" fuerte
          nota={l.pago.aPagarEfectivo == null ? 'sin saldo que afirmar' : `efectivo ${pesos(l.pago.aPagarEfectivo)} · banco ${pesos(l.pago.aPagarBanco)}`}>
          <Leida valor={l.pago.saldoTotal} />
        </Renglon>
        <SaldoRedondeadoDelPanel fila={fila} />
      </BloqueDelPanel>
    </section>
  )
}

/** «Efect. red.»: el guardado por el dueño, o el sugerido (lo que se entrega hoy al $1.000). Se escribe en el cuadro. */
function EfectivoRedondeadoDelPanel({ fila }: { fila: FilaDelEspejo }) {
  const l = fila.linea
  const m = efectivoMostrado({ efectivoRedondeado: l.efectivoRedondeado, enEfectivo: l.pago.aPagarEfectivo ?? l.enEfectivo })
  return (
    <Renglon rotulo="Efect. red." nota={m.sugerido ? 'sugerido: el efectivo de hoy al $1.000 · se escribe en el cuadro' : 'lo que cuenta en billetes'}>
      <Leida valor={m.valor} apagada={m.sugerido} testid={`panel-efectivo-redondeado-${fila.personaId}`} />
    </Renglon>
  )
}

/** «Saldo red.»: lo que falta pagar si saliera todo en billetes. Derivado del saldo; no se escribe. */
function SaldoRedondeadoDelPanel({ fila }: { fila: FilaDelEspejo }) {
  const r = saldoRedondeado(fila.linea.pago.saldoTotal)
  return (
    <Renglon rotulo="Saldo red." nota="el saldo en billetes de $1.000">
      <Leida valor={r.valor} testid={`panel-saldo-redondeado-${fila.personaId}`} />
    </Renglon>
  )
}

/**
 * EL PRESENTISMO, CONCEPTO POR CONCEPTO (dueño, 16/09/2026): *«mostrar por empleado: Base presentismo
 * (50 % blanco) · % 20 · Presentismo $ · Estado (Cumple / Perdido) · motivo si lo perdió»*.
 *
 * LA BASE ES LA MITAD EN BLANCO Y SE DICE EN LA PANTALLA, no sólo en un tooltip: es la pregunta que el
 * dueño hizo dos veces (sobre qué corre el 20 %). El 50 % en efectivo no entra, y el renglón lo aclara.
 * Nada se calcula acá: los cuatro números salen de `presentismo.ts`, que es donde vive la regla.
 */
function PresentismoDelPanel({ fila }: { fila: FilaDelEspejo }) {
  const p = fila.linea.presentismo
  const testid = `panel-presentismo-${fila.personaId}`
  // EL MENSUAL NO LLEVA PRESENTISMO (dueño, 17/09/2026): se dice, apagado, en vez de callar.
  if (p?.estado === 'no_aplica') {
    return (
      <Renglon rotulo="Presentismo" nota="cobra por mes: el presentismo es del convenio de obreros">
        <span data-testid={testid} data-estado={p.estado} style={{ fontSize: '12px', color: V.apagado }}>{`no aplica · ${p.motivoNoAplica ?? 'mensual'}`}</span>
      </Renglon>
    )
  }
  if (!p || p.estado === 'no_rige') return null
  if (p.estado === 'sin_categoria') {
    return (
      <Renglon rotulo="Presentismo" nota="sin categoría en el legajo: no hay básico con qué calcularlo">
        <span data-testid={testid} style={{ fontSize: '12px', color: V.apagado }}>sin categoría</span>
      </Renglon>
    )
  }
  // ═══ «CUMPLE» ES UNA AFIRMACIÓN, Y SIN HORAS NO SE PUEDE HACER (QA, 16/09/2026) ═══
  //
  // El defecto que esto corrige: `sin_horas` caía en el `else` y la pantalla decía «Cumple · sin faltas
  // injustificadas, tardanzas ni retiros» sobre alguien que todavía no tiene NINGUNA jornada cargada. No
  // es que cumplió: es que no hay dato. Pasa todos los días 16 de cada quincena mientras se cargan las
  // horas —el día del QA eran 2 de 15 obreros— y un jefe de obra lo lee como un visto bueno.
  const estado = p.estado === 'perdido' ? 'Perdido'
    : p.estado === 'a_revisar' ? 'A revisar'
    : p.estado === 'sin_horas' ? 'Sin horas'
    : 'Cumple'
  const color = p.estado === 'aplica' ? V.tinta : p.estado === 'sin_horas' ? V.apagado : V.warn
  return (
    <>
      <Renglon rotulo="Base presentismo" nota="50 % en blanco · el 50 % en efectivo no entra en la base">
        <Leida valor={p.base} />
      </Renglon>
      <Renglon rotulo="%" nota="art. 52 CCT 76/75">
        <span style={{ fontSize: '12.5px', color: V.tinta }}>{`${Math.round(PRESENTISMO_PCT * 100)} %`}</span>
      </Renglon>
      <Renglon rotulo="Presentismo" fuerte
        nota={p.estado === 'perdido' ? 'se descuenta del cobra' : undefined} alerta={p.estado === 'perdido'}>
        <Leida valor={p.importe} />
      </Renglon>
      <Renglon rotulo="Estado"
        nota={p.estado === 'perdido' ? motivosDePerdida(p)
          : p.estado === 'a_revisar' ? `no vino ${fechasCortas(p.aRevisar)} y nadie cargó el motivo: hasta que se cargue no se descuenta`
          : p.estado === 'sin_horas' ? 'sin horas cargadas en la quincena: todavía no hay presentismo que calcular'
          : 'sin faltas injustificadas, tardanzas ni retiros'}
        alerta={p.estado !== 'aplica' && p.estado !== 'sin_horas'}>
        <span data-testid={testid} data-estado={p.estado} style={{ fontSize: '12.5px', fontWeight: 600, color }}>{estado}</span>
      </Renglon>
    </>
  )
}

/**
 * LO PAGADO DE CADA LADO Y LO QUE FALTA (dueño, 15/09/2026). Desde el 17/09 cada lado va dentro de su recibo. Las mismas celdas que el cuadro: «Pagado» se
 * escribe, «Saldo» se lee. Sin la resta «cobra − banco − adelantos» de antes: trataba al adelanto como
 * un descuento y no como un pago, y con un adelanto mayor que el negro dejaba un número negativo sin decir que
 * el exceso se descuenta del banco. El saldo negativo SIGUE a la vista —en ámbar y con su aviso— porque es la
 * evidencia de que alguien cobró de más por ese canal.
 */
function PagadoYSaldo({ lado, fila, quincena, camposEditables }: PropsDeCadena & { lado: 'banco' | 'efectivo' }) {
  const p = fila.linea.pago
  const aviso = avisoDeExcedente(p) ?? undefined
  if (lado === 'banco') {
    return (
      <>
        <Renglon rotulo="Pagado banco" nota={fila.linea.manual.pagadoBanco ? undefined : 'adelantos por banco y embargos'}>
          <Escribible campo="pagadoBanco" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={148} claseCampo="w-32" />
        </Renglon>
        <Renglon rotulo="Saldo banco" nota={p.excedente?.lado === 'banco' ? aviso : undefined} alerta={p.excedente?.lado === 'banco'}>
          <Leida valor={p.saldoBanco} />
        </Renglon>
      </>
    )
  }
  return (
    <>
      <Renglon rotulo="Pagado efectivo" nota={fila.linea.manual.pagadoEfectivo ? undefined : 'adelantos en efectivo'}>
        <Escribible campo="pagadoEfectivo" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={148} claseCampo="w-32" />
      </Renglon>
      <Renglon rotulo="Saldo efectivo" nota={p.excedente?.lado === 'efectivo' ? aviso : undefined} alerta={p.excedente?.lado === 'efectivo'}>
        <Leida valor={p.saldoEfectivo} />
      </Renglon>
    </>
  )
}

/**
 * La cadena de siempre: Oficina, finales y la quincena cerrada (la foto sellada no se recalcula). En los mismos
 * cuatro bloques: la aritmética «cobra − adelanto − ya transferido = banco + efectivo» queda entera en el resto del
 * cálculo, y cada recibo muestra su parte.
 */
function CadenaSinModelo({ fila, quincena, camposEditables }: PropsDeCadena) {
  const l = fila.linea
  const cierre = cierreDeLaFila(l)
  const esHora = l.netoMensual == null
  return (
    <section data-testid="panel-cadena" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <BloqueDelPanel bloque="horas">
        <Renglon rotulo="Horas" nota={esHora ? `× ${pesos(l.valorHora)}/h` : 'cobra por mes: las horas no mueven el sueldo'}>
          <Leida valor={l.horas} unidad="horas" />
        </Renglon>
      </BloqueDelPanel>
      <BloqueDelPanel bloque="blanco">
        <Renglon rotulo="Neto (banco)" nota={l.reciboSinGiro ? 'recibo sin giro en el extracto' : undefined}>
          <Escribible campo="porBanco" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={148} claseCampo="w-32" />
        </Renglon>
        {l.reciboNeto != null && (
          <Renglon rotulo="Recibo del estudio"><span>{pesos(l.reciboNeto)}</span></Renglon>
        )}
      </BloqueDelPanel>
      <BloqueDelPanel bloque="negro">
        <Renglon rotulo="Efectivo">
          <Leida valor={l.enEfectivo} origen={l.origen.enEfectivo} />
        </Renglon>
      </BloqueDelPanel>
      <BloqueDelPanel bloque="resto">
        <Renglon rotulo="Cobra total" nota={esHora ? `${nHoras(l.horas)} h pagas × ${pesos(l.valorHora)}/h` : 'neto mensual'}>
          <Leida valor={l.cobra} medio origen={l.origen.cobra} />
        </Renglon>
        <Renglon rotulo="− Adelanto">
          <Escribible campo="adelanto" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={148} claseCampo="w-32" />
        </Renglon>
        <Renglon rotulo="− Ya transferido">
          <Escribible campo="yaTransferido" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={148} claseCampo="w-32" />
        </Renglon>
        <Renglon rotulo="= Banco + efectivo" fuerte
          nota={cierre && !cierre.cierra ? `no cierra por ${pesos(cierre.diferencia)}` : undefined} alerta={cierre?.cierra === false}>
          <Leida valor={l.total} medio origen={l.origen.total} />
        </Renglon>
        {l.blancoAcuerdo != null && (
          <Renglon rotulo="Acuerdo 50/50" nota="lo acordado; el banco manda lo que dice el recibo">
            <span style={{ fontSize: '12px', color: V.apagado }}>{`banco ${pesos(l.blancoAcuerdo)} · efectivo ${pesos(l.efectivoAcuerdo)}`}</span>
          </Renglon>
        )}
        <PresentismoDelPanel fila={fila} />
      </BloqueDelPanel>
    </section>
  )
}

/**
 * UN BLOQUE DEL PANEL: el rótulo y el fondo del bloque del cuadro (`BLOQUES`), para que quien abre el panel desde
 * una columna tenga la misma referencia visual. Filo de grafito arriba, como la banda del encabezado; sin sombra.
 */
function BloqueDelPanel({ bloque, detalle, children }: { bloque: ClaveDeBloque; detalle?: string; children: ReactNode }) {
  const b = BLOQUES.find((x) => x.clave === bloque)
  return (
    <div data-testid={`panel-bloque-${bloque}`} style={{
      background: b?.fondo, borderTop: `1px solid ${V.grafito}`, borderRadius: '0 0 6px 6px', padding: '8px 12px 4px',
    }}>
      <Rotulo>{detalle ? `${b?.rotulo ?? bloque} · ${detalle}` : (b?.rotulo ?? bloque)}</Rotulo>
      {children}
    </div>
  )
}

function Rotulo({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.06em', color: V.tinta, fontWeight: 600, textTransform: 'uppercase', paddingBottom: 8 }}>
      {children}
    </div>
  )
}

function Renglon({ rotulo, nota, fuerte = false, alerta = false, children }: {
  rotulo: string; nota?: string; fuerte?: boolean; alerta?: boolean; children: ReactNode
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8, minHeight: ALTO_LIQ.filaPanel,
      borderTop: fuerte ? `1px solid ${V.grafito}` : `1px solid ${V.linea}`, fontSize: '12.5px',
      fontVariantNumeric: 'tabular-nums', fontWeight: fuerte ? 600 : 400,
    }}>
      <div>
        <div style={{ color: V.tinta }}>{rotulo}</div>
        {nota && <div style={{ fontSize: '11px', fontWeight: 400, color: alerta ? V.warn : V.apagado }}>{nota}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>{children}</div>
    </div>
  )
}
