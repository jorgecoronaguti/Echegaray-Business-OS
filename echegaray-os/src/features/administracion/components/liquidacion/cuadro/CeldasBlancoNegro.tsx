'use client'

// LAS CELDAS DE BLANCO Y NEGRO DEL CUADRO DE LA QUINCENA (dueño, 14/09/2026).
//
// *«realmente no se entiende nada el cuadro de liq de hs, vamos a rehacer»*. La fila se lee como el
// sueldo se arma: lo que paga el recibo (blanco), lo que falta (negro), el total, y cómo se paga.
//
// ═══ «ESTIMADO» SE VE DISTINTO DE «RECIBO» ═══
//
// Sin recibo del período el blanco es una estimación (mitad de las horas × $/h de su categoría). Se
// dibuja apagado y en cursiva con «est.» chico: un número estimado con la tinta de uno real se lee como
// hecho. Con recibo, tinta normal y el enlace al PDF. Ámbar sólo para el problema: el recibo paga más
// horas que las cargadas.
//
// Ni una cuenta acá: las cifras son las de `linea.sueldo` (`sueldoBlancoNegro`) y la cadena.

import type { CSSProperties, ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'
import { IconoDeAviso, MarcaDeOrigen } from '../CeldasDeLiquidacion'
import { Escribible } from './CeldasDelEspejo'
import type { CampoEditable } from '../../../services/liquidacionOverrides'
import { horas as nHoras, pesos } from '../formato'
import { estadoDelPago, motivoSinCobra, tituloDeJornales } from './estadoDelPago'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import { marcaDeCategoria, negroDeLaFila, tituloDelNetoEstimado, type SueldoBlancoNegro } from '../../../services/sueldoBlancoNegro'
import { avisoDeExcedente, type PagoDeLaLinea } from '../../../services/pagoDeLaQuincena'
import { saldoRedondeado } from '../../../services/efectivoRedondeado'

const DERECHA: CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden' }
const ESTIMADO: CSSProperties = { color: V.apagado, fontStyle: 'italic' }

export const urlDelRecibo = (id: string): string => `https://drive.google.com/file/d/${id}/view`

/** «est.» chico, derecho: la cursiva ya dice «apagado», el rótulo dice por qué. */
export const Est = () => (
  <span style={{ fontSize: '9.5px', color: V.tenue, marginLeft: 3, fontStyle: 'normal' }}>est.</span>
)

/** De dónde sale el blanco, en llano. Lo usan el `title` de la fila y el panel. */
export function origenDelBlanco(s: SueldoBlancoNegro): string {
  // EL NETO ESCRITO A MANO SE DICE PRIMERO: gana sobre el recibo y sobre el estimado.
  if (s.origenNeto === 'manual') return `neto escrito a mano${s.estado === 'recibo' ? ' (hay recibo)' : ''}`
  if (s.estado === 'recibo') return 'recibo del estudio'
  if (s.origenNeto === 'nomina') return 'neto del recibo de nómina; horas del blanco estimadas'
  // EL RECIBO ESTIMADO CONCEPTO POR CONCEPTO (dueño, 14/09/2026): el detalle está en el panel de la persona.
  if (s.origenNeto === 'conceptos' && s.reciboEstimado) {
    return `recibo estimado concepto por concepto: ${s.reciboEstimado.horasNormales + s.reciboEstimado.horasFeriado} h × $/h de categoría, descuentos con las reglas de los recibos`
  }
  if (s.origenNeto === 'estimado' && s.proporcion) return `mitad de las horas × $/h de su categoría; neto ${tituloDelNetoEstimado(s.proporcion)}`
  return 'estimado: mitad de las horas × $/h de su categoría; sin recibos para estimar el neto'
}

function Celda({ s, valor, testid, titulo, children }: {
  s: SueldoBlancoNegro | null; valor: string; testid?: string; titulo?: string; children?: ReactNode
}) {
  if (!s) return <div style={{ ...DERECHA, color: V.tenue }}>—</div>
  const est = s.estado === 'estimado'
  return (
    <div data-testid={testid} title={titulo ?? origenDelBlanco(s)} style={{ ...DERECHA, ...(est ? ESTIMADO : { color: V.tinta }) }}>
      {valor}{children}
    </div>
  )
}

/** Lo que necesita una celda del blanco para escribirse. */
export interface EdicionDelBlanco {
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
}

/**
 * ¿SE ESCRIBE ESTA CELDA DEL BLANCO? Quincena abierta, blanco + negro, y columna aplicada en la base (dueño,
 * 14/09/2026: «dejame editable las h/recibo»). Cerrada: nada editable, como siempre.
 */
const seEscribe = (fila: FilaDelEspejo, campo: CampoEditable, e?: EdicionDelBlanco): e is EdicionDelBlanco =>
  e != null && !fila.cerrada && fila.linea.sueldo != null && e.camposEditables.includes(campo)

/** Las columnas de dinero que no son del blanco (Cobra total, Total efectivo): también en mensuales y finales. */
const seEscribeDinero = (fila: FilaDelEspejo, campo: CampoEditable, e?: EdicionDelBlanco): e is EdicionDelBlanco =>
  e != null && !fila.cerrada && e.camposEditables.includes(campo)

export function CeldaHorasBlanco({ fila, edicion }: { fila: FilaDelEspejo; edicion?: EdicionDelBlanco }) {
  const s = fila.linea.sueldo
  if (seEscribe(fila, 'horasRecibo', edicion)) {
    return (
      <div data-testid={`hs-blanco-${fila.personaId}`} title={s ? origenDelBlanco(s) : undefined}>
        <Escribible campo="horasRecibo" unidad="horas" fila={fila} quincena={edicion.quincena}
          camposEditables={edicion.camposEditables} ancho={48} claseCampo="w-12" />
      </div>
    )
  }
  return <Celda s={s} valor={nHoras(s?.horasBlanco ?? null)} testid={`hs-blanco-${fila.personaId}`} />
}

/**
 * $/H DE CATEGORÍA. Ámbar sólo si el $/h del RECIBO real está bajo el piso vigente de su categoría
 * (`marcaDeCategoria`, la misma comparación de Convenios). El estimado usa el piso: nunca marca.
 * En la quincena abierta se escribe.
 */
export function CeldaHoraCategoria({ fila, edicion }: { fila: FilaDelEspejo; edicion?: EdicionDelBlanco }) {
  const s = fila.linea.sueldo
  const bajo = marcaDeCategoria(s)
  if (seEscribe(fila, 'valorHoraRecibo', edicion)) {
    return (
      <div data-testid={`hora-categoria-${fila.personaId}`} data-bajo-el-piso={bajo ? '1' : undefined}
        title={bajo ? `el recibo paga ${pesos(bajo.valorHora)}/h, el básico es ${pesos(bajo.piso)}/h` : undefined}
        style={bajo ? { color: V.warn } : undefined}>
        <Escribible campo="valorHoraRecibo" fila={fila} quincena={edicion.quincena}
          camposEditables={edicion.camposEditables} ancho={88} claseCampo="w-20" />
      </div>
    )
  }
  if (bajo) {
    return (
      <div data-testid={`hora-categoria-${fila.personaId}`} data-bajo-el-piso="1"
        title={`el recibo paga ${pesos(bajo.valorHora)}/h, el básico es ${pesos(bajo.piso)}/h`}
        style={{ ...DERECHA, color: V.warn, fontWeight: 600 }}>{pesos(bajo.valorHora)}</div>
    )
  }
  return <Celda s={s} valor={pesos(s?.valorHoraCategoria ?? null)} testid={`hora-categoria-${fila.personaId}`} />
}

export const AVISO_NETO_NO_RECALCULADO = 'el neto es del recibo del estudio y no se recalcula: editá Banco si cambió'

/** NETO (BANCO): el neto del recibo, o el estimado; lo escrito a mano gana y se marca. En la abierta se escribe. */
export function CeldaNeto({ fila, edicion }: { fila: FilaDelEspejo; edicion?: EdicionDelBlanco }) {
  const l = fila.linea
  const s = l.sueldo
  const testid = `neto-${fila.personaId}`
  // ⚠ JUNTO AL NÚMERO, SIN TEXTO (dueño, 15/09/2026, fila de Agüero: el aviso quedaba pegado debajo): se corrigieron las horas o el
  // $/h y el neto es REAL, así que quedó el de antes. Un neto estimado ya se recalculó y no avisa.
  const aviso = s?.netoNoRecalculado ? AVISO_NETO_NO_RECALCULADO : null
  const titulo = s ? origenDelBlanco(s) : undefined
  if (seEscribe(fila, 'porBanco', edicion)) {
    return (
      <div data-testid={testid} data-neto-no-recalculado={aviso ? '1' : undefined} title={titulo}
        style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
        <Escribible campo="porBanco" fila={fila} quincena={edicion.quincena}
          camposEditables={edicion.camposEditables} ancho={112} claseCampo="w-24" />
        {aviso && <IconoDeAviso titulo={AVISO_NETO_NO_RECALCULADO} testid={`neto-aviso-${fila.personaId}`} />}
        {s?.driveFileId && (
          <a href={urlDelRecibo(s.driveFileId)} target="_blank" rel="noreferrer" data-testid={`recibo-pdf-${fila.personaId}`}
            title="Abrir el recibo" style={{ fontSize: '10.5px', color: V.apagado }}>↗</a>
        )}
      </div>
    )
  }
  if (s && s.neto == null && !l.manual.porBanco) {
    return <div data-testid={testid} title={origenDelBlanco(s)} style={{ ...DERECHA, color: V.tenue }}>sin neto</div>
  }
  const estimado = s != null && s.origenNeto === 'estimado' && !l.manual.porBanco
  return (
    <div data-testid={testid} data-neto-no-recalculado={aviso ? '1' : undefined} title={titulo}
      style={{ ...DERECHA, ...(estimado ? ESTIMADO : { color: V.tinta }) }}>
      {pesos(l.porBanco)}{estimado && <Est />}
      {aviso && <IconoDeAviso titulo={AVISO_NETO_NO_RECALCULADO} testid={`neto-aviso-${fila.personaId}`} />}
      <MarcaDeOrigen origen={l.origen.porBanco} compacta />
      {s?.driveFileId && (
        <a href={urlDelRecibo(s.driveFileId)} target="_blank" rel="noreferrer" data-testid={`recibo-pdf-${fila.personaId}`}
          title="Abrir el recibo" style={{ marginLeft: 4, fontSize: '10.5px', color: V.apagado, fontStyle: 'normal' }}>↗</a>
      )}
    </div>
  )
}

/** HS NEGRO: las que el recibo no paga. Ámbar si el recibo paga más de las cargadas. En la abierta se escribe. */
export function CeldaHorasNegro({ fila, edicion }: { fila: FilaDelEspejo; edicion?: EdicionDelBlanco }) {
  const s = fila.linea.sueldo
  // HS NEGRO SE ESCRIBE (dueño, 15/09/2026: «todas las celdas editables»): el Importe negro pasa a Hs negro × $/h negro,
  // salvo que el Importe también esté escrito.
  if (seEscribe(fila, 'horasNegro', edicion)) {
    const excede = s?.reciboExcedeHoras && !fila.linea.manual.horasNegro
    return (
      <div data-testid={`hs-negro-${fila.personaId}`} title={excede ? 'el recibo paga más horas que las cargadas' : undefined}
        style={excede ? { color: V.warn } : undefined}>
        <Escribible campo="horasNegro" unidad="horas" fila={fila} quincena={edicion.quincena}
          camposEditables={edicion.camposEditables} ancho={56} claseCampo="w-12" />
      </div>
    )
  }
  if (s?.reciboExcedeHoras) {
    return (
      <div data-testid={`hs-negro-${fila.personaId}`} title="el recibo paga más horas que las cargadas"
        style={{ ...DERECHA, color: V.warn, fontWeight: 600 }}>0</div>
    )
  }
  return <Celda s={s} valor={nHoras(s?.horasNegro ?? null)} testid={`hs-negro-${fila.personaId}`} />
}

export function CeldaImporteNegro({ fila, edicion }: { fila: FilaDelEspejo; edicion?: EdicionDelBlanco }) {
  const l = fila.linea
  const s = l.sueldo
  // EL IMPORTE NEGRO SE ESCRIBE (dueño, 15/09/2026: «dejame editable todas las columnas de dinero»).
  if (seEscribe(fila, 'negro', edicion)) {
    return (
      <div data-testid={`negro-${fila.personaId}`}>
        <Escribible campo="negro" fila={fila} quincena={edicion.quincena} camposEditables={edicion.camposEditables} ancho={104} claseCampo="w-24" />
      </div>
    )
  }
  if (s) {
    const recargo = s.recargoExtras > 0 ? ` + ${nHoras(s.recargoExtras)} h de recargo de extras` : ''
    return (
      <Celda s={s} valor={pesos(s.negro)} testid={`negro-${fila.personaId}`}
        titulo={s.horasNegro != null ? `${nHoras(s.horasNegro)} h${recargo} × ${pesos(s.valorHoraNegro)}/h negro` : undefined} />
    )
  }
  // SIN MODELO (quincena cerrada, finales) O CON BANCO/TOTAL A MANO: el negro es total − neto, para que la
  // fila explique la plata (QA, 14/09/2026: «Negro $0» con el total muy por encima del neto).
  const negro = negroDeLaFila(l)
  if (negro == null) return <div style={{ ...DERECHA, color: V.tenue }}>—</div>
  return (
    <div data-testid={`negro-${fila.personaId}`} data-sellado={fila.cerrada ? '1' : undefined}
      title={fila.cerrada ? 'foto sellada: total − neto del recibo' : 'total − neto (banco)'}
      style={{ ...DERECHA, color: V.tinta }}>{pesos(negro)}</div>
  )
}

/** TOTAL = neto + negro. El número principal de la fila. JORNALES en el `title`, sin mandar. */
export function CeldaTotal({ fila, edicion }: { fila: FilaDelEspejo; edicion?: EdicionDelBlanco }) {
  const l = fila.linea
  const s = l.sueldo
  const jornales = tituloDeJornales(l)
  // COBRA TOTAL SE ESCRIBE; si con los manuales deja de cerrar, rojo con la diferencia (y se guarda igual).
  if (seEscribeDinero(fila, 'cobra', edicion)) {
    const e = estadoDelPago(l)
    return (
      <div data-testid={`total-${fila.personaId}`} title={e.noCierra ? e.titulo : (jornales ?? undefined)}
        style={{ fontSize: '14px', fontWeight: 600, color: e.noCierra ? V.neg : V.tinta }}>
        <Escribible campo="cobra" fila={fila} quincena={edicion.quincena} camposEditables={edicion.camposEditables} ancho={120} claseCampo="w-28" />
      </div>
    )
  }
  if (l.cobra == null) {
    const porque = motivoSinCobra(l)
    return (
      <div data-testid={`total-${fila.personaId}`} style={{ ...DERECHA, color: V.tenue }}
        title={[l.sinNeto ? 'Sin neto del blanco: no hay total que afirmar.' : 'Sin retribución cargada.', jornales].filter(Boolean).join(' · ')}>
        {porque}
      </div>
    )
  }
  const estimado = s?.estado === 'estimado' && l.origen.cobra === 'calculado'
  const cuenta = s ? `neto ${pesos(l.porBanco)} + negro ${pesos(s.negro)}` : null
  return (
    <div data-testid={`total-${fila.personaId}`} title={[cuenta, jornales].filter(Boolean).join(' · ') || undefined}
      style={{ ...DERECHA, fontSize: '14px', fontWeight: 600, ...(estimado ? ESTIMADO : { color: V.tinta }) }}>
      {pesos(l.cobra)}{estimado && <Est />}<MarcaDeOrigen origen={l.origen.cobra} compacta />
    </div>
  )
}

// ═══ LO PAGADO Y LO QUE FALTA (dueño, 15/09/2026) ═══
//
// *«necesito al lado de banco y negro lo que se le ha pagado efectivamente y que vaya restando al total o
// incrementando en el otro llegado el caso»*. Las cuentas son las de `pagoDeLaQuincena.ts`: acá no se resta nada.

/**
 * PAGADO — lo que se entregó de verdad por ese canal. **Arranca con los adelantos ya cargados**: una celda en
 * cero pediría volver a pagar lo que ya salió. Escribirla la vuelve manual y manda; vaciarla devuelve el
 * adelanto. Acepta una cuenta con `=` como cualquier celda del cuadro.
 */
export function CeldaPagado({ campo, fila, edicion }: {
  campo: 'pagadoBanco' | 'pagadoEfectivo'; fila: FilaDelEspejo; edicion?: EdicionDelBlanco
}) {
  const l = fila.linea
  const lado = campo === 'pagadoBanco' ? 'por banco' : 'en efectivo'
  const titulo = l.manual[campo]
    ? `pagado ${lado}, escrito a mano`
    : `pagado ${lado}: los adelantos ya cargados de esta quincena. Escribilo para corregirlo.`
  const testid = `pagado-${campo === 'pagadoBanco' ? 'banco' : 'efectivo'}-${fila.personaId}`
  if (seEscribeDinero(fila, campo, edicion)) {
    return (
      <div data-testid={testid} title={titulo}>
        <Escribible campo={campo} fila={fila} quincena={edicion.quincena}
          camposEditables={edicion.camposEditables} ancho={104} claseCampo="w-24" />
      </div>
    )
  }
  return (
    <div data-testid={testid} title={titulo} style={{ ...DERECHA, color: l[campo] === 0 ? V.tenue : V.tinta }}>
      {pesos(l[campo])}<MarcaDeOrigen origen={l.origen[campo]} compacta />
    </div>
  )
}

/**
 * SALDO — lo que falta pagar de ese lado. `null` se dibuja «—» (sin negro no hay saldo que afirmar).
 *
 * ÁMBAR CON SIGNO CUANDO ES NEGATIVO, y el `title` dice qué pasa con esa plata: no es un error de la fila, es
 * alguien que cobró de más por un canal y se le descuenta del otro. Netearlo a cero borraría el dato.
 */
export function CeldaSaldo({ fila, lado, pago, sinDato }: {
  fila: FilaDelEspejo; lado: 'banco' | 'efectivo' | 'total'
  /** El pago que se muestra. Por defecto el de la línea; el cuadro de mensuales pasa `pagoDelMensual`. */
  pago?: PagoDeLaLinea
  /** Qué se dice cuando no hay saldo que afirmar. Por defecto «—» con el motivo en el `title`. */
  sinDato?: { texto: string; titulo: string }
}) {
  const p = pago ?? fila.linea.pago
  const valor = lado === 'banco' ? p.saldoBanco : lado === 'efectivo' ? p.saldoEfectivo : p.saldoTotal
  const testid = `saldo-${lado}-${fila.personaId}`
  if (valor == null) {
    return (
      <div data-testid={testid} title={sinDato?.titulo ?? 'Sin negro del período: no hay saldo que afirmar.'}
        style={{ ...DERECHA, color: V.tenue, fontSize: sinDato ? '11px' : undefined }}>{sinDato?.texto ?? '—'}</div>
    )
  }
  const negativo = valor < 0
  const aPagar = lado === 'banco' ? p.aPagarBanco : lado === 'efectivo' ? p.aPagarEfectivo : null
  const titulo = negativo
    ? (avisoDeExcedente(p) ?? undefined)
    : (aPagar != null && aPagar !== valor ? `a pagar hoy ${pesos(aPagar)}: el otro lado quedó pagado de más` : undefined)
  return (
    <div data-testid={testid} data-excedido={negativo ? '1' : undefined} title={titulo}
      style={{ ...DERECHA, color: negativo ? V.warn : V.tinta, fontWeight: lado === 'total' ? 600 : undefined }}>
      {pesos(valor)}
    </div>
  )
}

/**
 * SALDO REDONDEADO — el saldo total llevado al $1.000, como si todo lo que resta se entregara en billetes
 * (dueño, 16/09/2026: *«dame una columna más al lado de saldo en donde diga saldo redondeado como si lo que
 * resta pagar se pagara en efectivo»*).
 *
 * ES LECTURA, NO UNA DECISIÓN: se deriva del saldo de al lado, no se guarda y no entra en ninguna cuenta —la
 * columna que el dueño edita es «Efect. red.», que redondea otra cosa (lo que corresponde por el lado negro).
 * El `title` dice siempre el saldo exacto y cuánto se entrega de más o de menos: sin eso, dos números casi
 * iguales uno al lado del otro se leen como una diferencia que el cuadro perdió.
 */
export function CeldaSaldoRedondeado({ fila, pago }: { fila: FilaDelEspejo; pago?: PagoDeLaLinea }) {
  const saldo = (pago ?? fila.linea.pago).saldoTotal
  const r = saldoRedondeado(saldo)
  const testid = `saldo-redondeado-${fila.personaId}`
  if (r.valor == null) {
    const porQue = saldo == null
      ? 'Sin negro del período: no hay saldo que afirmar.'
      : saldo < 0 ? `Pagado de más por ${pesos(-saldo)}: una devolución no se redondea.`
      : saldo === 0 ? 'Saldo cero: no queda nada por entregar.'
      : `Saldo ${pesos(saldo)}: menos de medio billete de $1.000, no se entrega.`
    return <div data-testid={testid} title={porQue} style={{ ...DERECHA, color: V.tenue }}>—</div>
  }
  const dif = r.diferencia === 0 ? 'cae justo'
    : r.diferencia > 0 ? `${pesos(r.diferencia)} de más` : `${pesos(-r.diferencia)} de menos`
  return (
    <div data-testid={testid} title={`Saldo exacto ${pesos(saldo)} · en efectivo redondeado ${dif}`}
      style={{ ...DERECHA, color: V.tinta, fontWeight: 600 }}>{pesos(r.valor)}</div>
  )
}

/** PAGADO TOTAL — la suma de los dos canales. No se escribe: se escriben los lados. */
export function CeldaPagadoTotal({ fila, pago }: { fila: FilaDelEspejo; pago?: PagoDeLaLinea }) {
  const p = pago ?? fila.linea.pago
  return (
    <div data-testid={`pagado-total-${fila.personaId}`}
      title={`por banco ${pesos(p.pagadoBanco)} + en efectivo ${pesos(p.pagadoEfectivo)}`}
      style={{ ...DERECHA, color: p.pagado === 0 ? V.tenue : V.tinta }}>{pesos(p.pagado)}</div>
  )
}
