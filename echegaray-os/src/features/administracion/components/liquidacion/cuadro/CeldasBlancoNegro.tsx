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
import { efectivoSuperado, estadoDelPago, tituloDeJornales } from './estadoDelPago'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import { marcaDeCategoria, negroDeLaFila, tituloDelNetoEstimado, type SueldoBlancoNegro } from '../../../services/sueldoBlancoNegro'

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
    const porque = l.sinNeto ? 'sin neto' : 'sin tarifa'
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

/**
 * EFECTIVO = total − banco − adelanto − ya transferido. Rojo con el porqué si la fila no cierra; ámbar si
 * da negativo (el adelanto y lo transferido superan lo que le corresponde). Nunca se esconde.
 */
export function CeldaEfectivoDelSueldo({ fila, edicion }: { fila: FilaDelEspejo; edicion?: EdicionDelBlanco }) {
  const l = fila.linea
  const e = estadoDelPago(l)
  const superado = efectivoSuperado(l)
  const color = e.noCierra ? V.neg : (superado ? V.warn : V.tinta)
  // TOTAL EFECTIVO SE ESCRIBE (dueño, 15/09/2026). Vacío vuelve a la resta; rojo con la diferencia si no cierra.
  if (seEscribeDinero(fila, 'enEfectivo', edicion)) {
    return (
      <div data-testid={`efectivo-${fila.personaId}`} data-superado={superado ? '1' : undefined}
        title={e.noCierra ? e.titulo : (superado ?? e.titulo)} style={{ color }}>
        <Escribible campo="enEfectivo" fila={fila} quincena={edicion.quincena} camposEditables={edicion.camposEditables} ancho={108} claseCampo="w-24" />
      </div>
    )
  }
  return (
    <div data-testid={`efectivo-${fila.personaId}`} data-superado={superado ? '1' : undefined}
      title={e.noCierra ? e.titulo : (superado ?? e.titulo)}
      style={{ ...DERECHA, color, fontWeight: superado ? 600 : undefined }}>
      {pesos(l.enEfectivo)}<MarcaDeOrigen origen={l.origen.enEfectivo} compacta />
    </div>
  )
}
