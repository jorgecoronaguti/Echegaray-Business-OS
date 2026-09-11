// LAS CELDAS DEL CONTRATO Y DEL COBRO — la cartera del CRM, versión del 11/09/2026.
//
// Dueño: «te pedí monto contratado, materiales, mano de obra y avance de cobro con barra de
// progreso». Y sobre Quattropani: «está mal por falta de lectura de contrato y Cobranzas: no lleva
// el 94 % cobrado, es mucho menos, y hasta sale cómo está cobrado y lo que falta».
//
// ═══ LAS DOS FUENTES ═══
//
//   CONTRATO   `public.obra_contrato` vía `obra_economia_cartera`: mano de obra y materiales en la
//              moneda del papel, valuados en pesos de hoy, y su TOTAL. El papel (contrato / OC /
//              presupuesto) y su renglón textual viajan en `contratoFuente` y `contratoCita`.
//   COBRO      `obra_cuenta.cobrado_neto`: lo que entró SIN IVA, criterio percibido. Neto contra
//              neto: el contrato es neto y por eso el cobro que se le compara también.
//
// ═══ LOS TRES ESTADOS DE UN COMPONENTE, Y NINGUNO ES UN HUECO MUDO ═══
//
//   número     el papel lo fija («U$S 63.000», «$ 44.110.169»).
//   «no incluye»  el papel dice que ese componente NO está en el precio — «La cotización contempla
//              solo mano de obra»: los materiales los provee el cliente. Es `0` con cita, no un 0
//              inventado.
//   «—»        el papel no separa (BSA: precios por tarea, «Computo de materiales: -»). El `title`
//              lo dice; nunca se inventa un desglose.

import { millones, pesos } from '@/shared/components/canon/formato'
import { V } from '@/shared/components/v2/patron'
import type { ObraEnCurso } from '@/features/administracion/services/homeCartera'
import { baseDelContrato, cobradoParaLaBarra, fraseDeFuente } from '../services/contratoDeObra'
import { ORIGEN_SUMA_VIVA } from '../services/economiaObras'
import { progresoDeCobro } from '../services/progresoCobro'

export { baseDelContrato, fraseDeFuente, sumaDeObras } from '../services/contratoDeObra'
import { SOLO_ANCHO, SOLO_TABLET, TONO } from './CeldasDeCartera'

/** «U$S 63.000» — el contrato en su moneda. Sin centavos: un contrato redondo no lleva decimales. */
export const dolares = (v: number) => `U$S ${Math.round(v).toLocaleString('es-AR')}`


const NUM: React.CSSProperties = { textAlign: 'right' }

/** Una cifra y, debajo, su lectura en la otra moneda o su origen. Siempre mono: es plata. */
function Cifra({ principal, secundaria, tam, titulo, testid, apagado = false }: {
  principal: string
  secundaria?: string | null
  tam: string
  titulo?: string
  testid: string
  apagado?: boolean
}) {
  return (
    <span className="flex flex-col items-end justify-center font-mono tabular-nums" data-testid={testid} title={titulo} style={{ ...NUM, gap: 1 }}>
      <span style={{ fontSize: tam, color: apagado ? V.tenue : V.tinta }}>{principal}</span>
      {secundaria && <span style={{ fontSize: '10.5px', color: V.tenue }}>{secundaria}</span>}
    </span>
  )
}

/** LO CONTRATADO DE UN TRABAJO: el total del contrato, con la moneda del papel debajo. */
export function ContratadoDelTrabajo({ o, veEconomia, tam = '11.5px' }: { o: ObraEnCurso; veEconomia: boolean; tam?: string }) {
  if (!veEconomia) return <span />
  const base = baseDelContrato(o)
  if (base === null) {
    return (
      <span className="flex items-center justify-end" data-testid="contratado-obra" title="OBRAS no publica precio para este trabajo y ningún papel cargado lo fija."
        style={{ fontSize: '11.5px', color: V.warn }}>sin precio</span>
    )
  }
  const usd = o.manoObraUsd ?? o.contratadoUsd
  // ═══ LA SUMA VIVA SE MARCA Y LA DISCREPANCIA SE DICE (auditor final, 11/09/2026) ═══
  // BSA: OBRAS no publica precio; el número es la SUMA VIVA de lo que Cobranzas registró como venta
  // y sube al facturar. Y la vista declara «OC $11.565.369 c/IVA vs Cobranzas $17.704.199». Las dos
  // cosas se dibujaban antes y se perdieron con la tabla nueva: un precio que no es precio no puede
  // llevar la misma tinta que un contrato firmado.
  const viva = o.contratoTotal === null && o.origenContratado === ORIGEN_SUMA_VIVA
  const marca = viva || o.nota ? ' ·' : ''
  const secundaria = usd !== null
    ? `${dolares(usd)}${(o.materiales ?? 0) > 0 ? ` + ${pesos(o.materiales)}` : ''}`
    : null
  const origen = o.contratoTotal !== null
    ? 'Mano de obra + materiales según el papel, en pesos de hoy. '
    : viva
      ? 'OBRAS NO publica precio para este trabajo: el número es la SUMA VIVA de lo que Cobranzas lleva registrado como venta y sube cada vez que se factura. No es lo que el trabajo vale. '
      : 'Precio que publica la pestaña OBRAS, neto. '
  return (
    <span data-origen={viva ? 'suma-viva' : undefined} data-nota={o.nota ? '' : undefined} className="grid">
      <Cifra
        testid="contratado-obra" tam={tam} principal={`${pesos(base) ?? ''}${marca}`} secundaria={secundaria}
        titulo={origen
          + (usd !== null && o.tipoCambio ? `Los dólares se valúan al tipo de cambio de hoy (${Math.round(o.tipoCambio).toLocaleString('es-AR')}). ` : '')
          + (o.nota ? `Discrepancia declarada por la vista: ${o.nota}. ` : '')
          + fraseDeFuente(o)}
      />
    </span>
  )
}

/** MATERIALES o MANO DE OBRA: el componente, en sus tres estados. */
export function ComponenteDelContrato({ o, cual, veEconomia, tam = '11.5px' }: {
  o: ObraEnCurso
  cual: 'materiales' | 'manoObra'
  veEconomia: boolean
  tam?: string
}) {
  if (!veEconomia) return <span className={SOLO_ANCHO} />
  const valor = cual === 'materiales' ? o.materiales : o.manoObra
  const usd = cual === 'materiales' ? o.materialesUsd : o.manoObraUsd
  const testid = cual === 'materiales' ? 'materiales-obra' : 'mano-obra-obra'
  const rotulo = cual === 'materiales' ? 'los materiales' : 'la mano de obra'
  if (valor === null) {
    return (
      <span className={`flex items-center justify-end ${SOLO_ANCHO}`} data-testid={testid} data-estado="sin-desglose"
        title={`El papel no separa ${rotulo}: ${fraseDeFuente(o)}`}
        style={{ fontSize: '11.5px', color: V.lupa }}>—</span>
    )
  }
  if (valor === 0) {
    return (
      <span className={`flex items-center justify-end ${SOLO_ANCHO}`} data-testid={testid} data-estado="no-incluye"
        title={`El precio no incluye ${rotulo}: los provee el cliente. ${fraseDeFuente(o)}`}
        style={{ fontSize: '11.5px', color: V.apagado }}>no incluye</span>
    )
  }
  return (
    <span className={`grid ${SOLO_ANCHO}`} data-estado="fijado">
      <Cifra
        testid={testid} tam={tam}
        principal={usd !== null ? dolares(usd) : (pesos(valor) ?? '')}
        secundaria={usd !== null ? `≈ ${pesos(valor)}` : null}
        titulo={fraseDeFuente(o)}
      />
    </span>
  )
}

/**
 * EL AVANCE DE COBRO DE UN TRABAJO — la única barra de la fila.
 *
 * Numerador: lo cobrado NETO (`obra_cuenta.cobrado_neto`). Denominador: la base del contrato, neta.
 * Debajo, en palabras y en millones, lo cobrado y lo que falta: «hasta sale cómo está cobrado y lo
 * que falta» (dueño). Quattropani con esto: $ 90,0 M de $ 139,4 M → 65 %, no 94.
 */
export function AvanceDeCobro({ o, veEconomia }: { o: ObraEnCurso; veEconomia: boolean }) {
  if (!veEconomia) return <span className={SOLO_TABLET} />
  const base = baseDelContrato(o)
  const cobradoNeto = cobradoParaLaBarra(o)
  const sinDato = cobradoNeto === null
  const porQue = !o.cobroDisponible
    ? 'La base todavía no puede repartir el cobro por trabajo.'
    : o.imputacion === 'cliente'
      ? 'Cobranzas anota el cobro contra el CLIENTE y no se pudo repartir a este trabajo. NO es «no cobró».'
      : 'Ninguna fila de Cobranzas —ni cobrada ni pendiente— está imputada a este trabajo. NO es cobrado $ 0.'
  if (sinDato || base === null) {
    return (
      <span className={`flex items-center justify-end ${SOLO_TABLET}`} data-testid="avance-obra" data-avance="sin-porcentaje"
        title={sinDato ? porQue : 'Sin precio no hay contra qué medir el cobro. No es 0 %.'}
        style={{ fontSize: '11.5px', color: V.lupa }}>—</span>
    )
  }
  const cobrado = cobradoNeto
  const p = progresoDeCobro(cobrado, base)
  const falta = Math.max(0, base - cobrado)
  const deduccion = o.imputacion === 'unica-obra'
    ? 'Cobranzas anota el cobro contra el cliente y se atribuye a este trabajo por ser el único en curso. '
    : ''
  return (
    <span className={`flex flex-col items-end justify-center ${SOLO_TABLET}`} data-testid="avance-obra"
      data-avance={p ? String(p.pct) : 'sin-porcentaje'} data-excede={p?.excede ? '' : undefined}
      title={`${deduccion}Cobrado ${pesos(cobrado)} neto (sin IVA, lo que entró) contra ${pesos(base)} de contrato neto. `
        + (p?.excede ? `Se cobró ${pesos(p.exceso)} más que el contrato: adicionales fuera del precio. ` : '')
        + fraseDeFuente(o)}
      style={{ gap: 3, textAlign: 'right' }}>
      <span className="flex items-center justify-end" style={{ gap: 6 }}>
        <span style={{ display: 'flex', height: 4, width: 64, borderRadius: 2, background: TONO.pista, flexShrink: 0 }}>
          <span style={{ width: `${p?.pct ?? 0}%`, background: V.grafito, borderRadius: 2 }} />
        </span>
        <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.tinta, minWidth: 34 }}>
          {p ? `${p.pct} %` : '—'}
        </span>
      </span>
      <span className="font-mono tabular-nums whitespace-nowrap" style={{ fontSize: '10.5px', color: V.tenue }}>
        {p?.excede ? `cobrado ${millones(cobrado)} · +${millones(p.exceso)}` : `cobrado ${millones(cobrado)} · falta ${millones(falta)}`}
      </span>
    </span>
  )
}

