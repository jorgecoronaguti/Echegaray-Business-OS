'use client'

// «RECIBO» EN EL PANEL DE LA PERSONA — se tilda qué lleva, se ve cómo queda, se acepta y se imprime.
//
// Dueño, 22/09/2026 (textual en `reciboDeLaQuincena.ts`): el recibo sale del panel de cada persona en
// Liquidación, sin esperar a que la quincena cierre, y se va armando: horas, efectivo, depósito en banco.
// Reemplaza a la página aparte de recibos, que no se parecía a nada del cuadro.
//
// ═══ ACEPTAR E IMPRIMIR (dueño, 22/09/2026) ═══
//
// Textual: *«deben ir guardandose en los legajos correspondientes, si se pone aceptar e imprimr, funciones q
// no estan ahora»*. Un solo gesto y en este orden: PRIMERO se registra en el legajo, DESPUÉS se imprime. Si
// el registro falla no se imprime nada y se dice por qué — un papel firmado del que la empresa no tiene
// rastro es peor que un papel que no salió. Lo que se guarda son las cifras selladas (`reciboEmitido.ts`):
// la reimpresión desde la ficha sale idéntica porque no recalcula.
//
// El PDF sigue siendo el diálogo de impresión con «Guardar como PDF» (el patrón de la planilla de
// Herramientas): la app no genera PDF en el servidor, y por eso el ARCHIVO no queda en Drive — quedan las
// cifras. Subir el PDF al legajo de Drive es una etapa siguiente y está declarado en la migración.

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import {
  armarRecibo, conceptosDisponibles, eleccionInicial,
  type ConceptoDelRecibo, type EleccionDelRecibo,
} from '../../../services/reciboDeLaQuincena'
import { sellarRecibo } from '../../../services/reciboEmitido'
import { aceptarRecibo } from '../../../services/recibosEmitidosActions'
import { enviarReciboAFirmar } from '../../../services/cicloDelReciboActions'
import { rotuloCategoria } from './CeldaTarifa'
import { tipoDeLiquidacion } from '../../../services/liquidacionPorTipo'
import { HojaDelRecibo, imprimirHoja, tituloDelRecibo } from './HojaDelRecibo'

// SIN BLANCO NI NEGRO (dueño, 22/09/2026): el papel dice horas totales, depositado y efectivo. El reparto es
// una cuenta interna y se mira en el panel de Liquidación, no en lo que firma la persona.
const OPCIONES: { clave: ConceptoDelRecibo; rotulo: string }[] = [
  { clave: 'horas', rotulo: 'Horas trabajadas' },
  // Dueño, 22/09/2026: «en recibo quiero dos opciones adicionales q sean hs trabajadas por recibo y hs
  // trabajadas fuera de recibo». Van juntas al total de horas, que es de lo que son partes.
  { clave: 'horasRecibo', rotulo: 'Horas trabajadas por recibo' },
  { clave: 'horasFuera', rotulo: 'Horas trabajadas fuera de recibo' },
  { clave: 'banco', rotulo: 'Depósito en banco' },
  { clave: 'efectivo', rotulo: 'Efectivo' },
  { clave: 'pagado', rotulo: 'Lo ya pagado y lo que resta' },
]

const BOTON = { padding: '9px 16px', lineHeight: '20px', borderRadius: 6, fontSize: '13px' } as const

export function ArmarRecibo({ fila, quincena }: {
  fila: FilaDelEspejo
  quincena: { desde: string; hasta: string }
}) {
  // MENSUAL vs JORNALERO lo decide la misma función que el cuadro: una quincena cerrada tampoco trae el
  // detalle de blanco y negro, y sin esto el panel le decía «cobra por mes» a un jornalero.
  const mensual = tipoDeLiquidacion(fila) === 'mensual'
  const disponibles = conceptosDisponibles(fila.linea, mensual)
  const [eleccion, setEleccion] = useState<EleccionDelRecibo>(() => eleccionInicial(fila.linea, mensual))
  const recibo = armarRecibo(fila.linea, eleccion, pesos, mensual)
  const hoja = useRef<HTMLDivElement>(null)
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'mal'; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [, empezar] = useTransition()
  const nada = recibo.horas.length === 0 && recibo.medios.length === 0
  const categoria = fila.categoria ? rotuloCategoria(fila.categoria) : null
  const titulo = tituloDelRecibo(fila.nombre, quincena.desde, quincena.hasta)

  const imprimir = () => {
    if (imprimirHoja(hoja.current, titulo)) return true
    setAviso({ tono: 'mal', texto: 'El navegador bloqueó la ventana de impresión. Permití las ventanas emergentes de app.ecsas.com.ar y probá de nuevo.' })
    return false
  }

  const sellar = () => sellarRecibo(
    { personaId: fila.personaId, nombre: fila.nombre, categoria, desde: quincena.desde, hasta: quincena.hasta },
    recibo,
  )

  // D12 · ENVIAR A FIRMAR — el eslabón que faltaba: hasta hoy se pagaba la quincena, se imprimía un papel y
  // de la conformidad NO quedaba ningún rastro digital. Esto emite el recibo y lo deja en el teléfono de la
  // persona, que lo firma con el dedo o sube el papel firmado. No imprime: son dos gestos distintos y el
  // de al lado sigue existiendo para quien entrega el papel en la mano.
  const enviarAFirmar = () => {
    if (nada || guardando) return
    const sellado = sellar()
    setGuardando(true)
    setAviso(null)
    empezar(async () => {
      const emitido = await aceptarRecibo(sellado)
      if (!emitido.ok || !emitido.id) {
        setGuardando(false)
        setAviso({ tono: 'mal', texto: `${emitido.ok ? 'La base no devolvió el recibo.' : emitido.error} No lo mandé a firmar.` })
        return
      }
      const enviado = await enviarReciboAFirmar(emitido.id)
      setGuardando(false)
      setAviso(enviado.ok
        // EL RECIBO QUEDA EMITIDO IGUAL SI EL ENVÍO FALLA: se dice, porque la persona no lo va a ver.
        ? { tono: 'ok', texto: 'Emitido y enviado a firmar: ya le aparece en el teléfono, en «Mi información · Recibos». Cuando firme, se archiva desde el legajo.' }
        : { tono: 'mal', texto: `El recibo quedó emitido en el legajo, pero NO se lo pude mandar a firmar: ${enviado.error}` })
    })
  }

  // PRIMERO SE REGISTRA, DESPUÉS SE IMPRIME. El orden es la función: al revés, un fallo del registro dejaría
  // circulando un papel que el legajo no conoce.
  const aceptarEImprimir = () => {
    if (nada || guardando) return
    const sellado = sellar()
    setGuardando(true)
    setAviso(null)
    empezar(async () => {
      const r = await aceptarRecibo(sellado)
      setGuardando(false)
      if (!r.ok) { setAviso({ tono: 'mal', texto: `${r.error} No se imprimió.` }); return }
      const salio = imprimir()
      setAviso({
        tono: 'ok',
        texto: salio
          ? 'Registrado en el legajo de la persona. Si el papel no salió, se reimprime desde la ficha: sale igual.'
          : 'Registrado en el legajo, pero el navegador bloqueó la impresión. Permití las ventanas emergentes y reimprimilo desde la ficha.',
      })
    })
  }

  return (
    <section data-testid="armar-recibo" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <legend style={{ fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: V.apagado, marginBottom: 6 }}>
          Qué lleva el recibo
        </legend>
        {OPCIONES.map(({ clave, rotulo }) => {
          const motivo = disponibles[clave]
          return (
            <label key={clave} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32, fontSize: '13px', color: motivo ? V.apagado : V.tinta, cursor: motivo ? 'default' : 'pointer' }}>
              <input type="checkbox" checked={!motivo && eleccion[clave]} disabled={!!motivo}
                onChange={(x) => setEleccion({ ...eleccion, [clave]: x.target.checked })}
                data-testid={`recibo-opcion-${clave}`} style={{ width: 16, height: 16 }} />
              <span>{rotulo}</span>
              {motivo && <span style={{ fontSize: '11.5px' }}>· {motivo}</span>}
            </label>
          )
        })}
      </fieldset>

      {/* EL PAPEL, tal como sale. El mismo componente que reimprime la ficha. */}
      <HojaDelRecibo hoja={hoja} nombre={fila.nombre} categoria={categoria} quincena={quincena} recibo={recibo} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* D12: el botón oscuro del diseño es «Enviar a firmar». El de al lado es el que el dueño pidió a la
            mañana —aceptar e imprimir— y no se quita: quien entrega el papel en la mano lo sigue usando. */}
        <button type="button" disabled={nada || guardando} onClick={enviarAFirmar} data-testid="recibo-enviar-a-firmar"
          style={{ ...BOTON, border: 0, background: V.grafito, color: '#FFFFFF', fontWeight: 600, cursor: nada || guardando ? 'default' : 'pointer', opacity: nada || guardando ? 0.5 : 1 }}>
          {guardando ? 'Guardando…' : 'Enviar a firmar'}
        </button>
        <button type="button" disabled={nada || guardando} onClick={aceptarEImprimir} data-testid="recibo-aceptar"
          style={{ ...BOTON, border: `1px solid ${V.lineaFuerte}`, background: '#FFFFFF', color: V.tinta, fontWeight: 600, cursor: nada || guardando ? 'default' : 'pointer', opacity: nada || guardando ? 0.5 : 1 }}>
          {guardando ? 'Guardando…' : 'Aceptar e imprimir'}
        </button>
        {/* LOS DOS QUE YA ESTABAN NO SE QUITAN (el dueño los pidió el 22/09 a la mañana), pero ahora dicen lo
            que hacen: imprimen SIN dejar rastro. El que queda en el legajo es el de arriba. */}
        <button type="button" disabled={nada} onClick={imprimir} data-testid="recibo-imprimir"
          style={{ ...BOTON, border: `1px solid ${V.lineaFuerte}`, background: '#FFFFFF', color: V.tinta, cursor: nada ? 'default' : 'pointer', opacity: nada ? 0.5 : 1 }}>
          Imprimir sin registrar
        </button>
        <button type="button" disabled={nada} onClick={imprimir} data-testid="recibo-pdf"
          style={{ ...BOTON, border: `1px solid ${V.lineaFuerte}`, background: '#FFFFFF', color: V.tinta, cursor: nada ? 'default' : 'pointer', opacity: nada ? 0.5 : 1 }}>
          Guardar PDF
        </button>
        {/* EL DISEÑO DICE «se guarda en Drive al emitir» Y ESO NO ESTÁ HECHO: el PDF lo arma el diálogo de
            impresión del navegador, en esta máquina, y la app no lo ve. Lo que queda guardado son las cifras
            selladas y la firma. Decirlo acá es más barato que un recibo que nadie encuentra en Drive. */}
        <span style={{ fontSize: '11.5px', color: V.apagado }}>
          Para el PDF, elegí «Guardar como PDF» en el diálogo. El archivo queda en esta máquina: a Drive no sube.
        </span>
        {aviso && (
          <div style={{ width: '100%', fontSize: '12.5px', color: aviso.tono === 'ok' ? V.tinta : V.warn, lineHeight: 1.5 }}
            data-testid={aviso.tono === 'ok' ? 'recibo-registrado' : 'recibo-falla'}>
            {aviso.texto}
            {aviso.tono === 'ok' && (
              <>
                {' '}
                <Link href={`/administracion/personas/${fila.personaId}?v=retribucion`} prefetch={false}
                  style={{ color: V.tinta, textDecoration: 'underline' }}>Ver el legajo</Link>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
