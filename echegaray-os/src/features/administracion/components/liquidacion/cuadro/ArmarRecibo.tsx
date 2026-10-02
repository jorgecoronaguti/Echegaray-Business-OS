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
import { flushSync } from 'react-dom'
import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import {
  alternarConcepto, armarRecibo, conceptosDisponibles,
  type ConceptoDelRecibo, type EleccionDelRecibo,
} from '../../../services/reciboDeLaQuincena'
import { sellarRecibo } from '../../../services/reciboEmitido'
import { aceptarRecibo } from '../../../services/recibosEmitidosActions'
import { enviarReciboAFirmar } from '../../../services/cicloDelReciboActions'
import { rotuloCategoria } from './CeldaTarifa'
import { tipoDeLiquidacion } from '../../../services/liquidacionPorTipo'
import { eleccionPorDefecto, OPCIONES_DEL_RECIBO } from './lotesDeRecibos'
import { HojaDelRecibo, imprimirHoja, tituloDelRecibo } from './HojaDelRecibo'

// El checklist «Qué lleva el recibo» vive en `lotesDeRecibos.ts`: lo comparten este panel y la vista previa del lote.
const OPCIONES = OPCIONES_DEL_RECIBO

const BOTON = { padding: '9px 16px', lineHeight: '20px', borderRadius: 6, fontSize: '13px' } as const

export function ArmarRecibo({ fila, quincena }: {
  fila: FilaDelEspejo
  quincena: { desde: string; hasta: string }
}) {
  // MENSUAL vs JORNALERO lo decide la misma función que el cuadro: una quincena cerrada tampoco trae el
  // detalle de blanco y negro, y sin esto el panel le decía «cobra por mes» a un jornalero.
  const mensual = tipoDeLiquidacion(fila) === 'mensual'
  const disponibles = conceptosDisponibles(fila.linea, mensual)
  const [eleccion, setEleccionViva] = useState<EleccionDelRecibo>(() => eleccionPorDefecto(fila))
  // EL NÚMERO QUE DIO LA BASE al guardar (RP-000123). Mientras no se guardó, el papel dice «N° al guardar».
  const [codigo, setCodigo] = useState<string | null>(null)
  // Otro tilde es otro papel: el número del recién guardado ya no es el de lo que se ve.
  const setEleccion = (e: EleccionDelRecibo) => { setCodigo(null); setEleccionViva(e) }
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

  // D12 · MANDAR AL TELÉFONO PARA FIRMAR — emite el recibo y lo deja en el teléfono de la persona, que lo
  // firma con el dedo. No imprime: quien entrega el papel en la mano usa «Guardar e imprimir» y después marca
  // «Firmó en papel» en el legajo.
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
      setCodigo(emitido.codigo)
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
      // `imprimirHoja` copia el HTML del papel YA: `flushSync` lo redibuja con el número antes de copiarlo, o
      // el papel saldría diciendo «N° al guardar» con el recibo guardado.
      flushSync(() => setCodigo(r.codigo))
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
              <input type="checkbox" checked={!motivo && eleccion[clave] === true} disabled={!!motivo}
                onChange={(x) => setEleccion(alternarConcepto(eleccion, clave, x.target.checked))}
                data-testid={`recibo-opcion-${clave}`} style={{ width: 16, height: 16 }} />
              <span>{rotulo}</span>
              {motivo && <span style={{ fontSize: '11.5px' }}>· {motivo}</span>}
            </label>
          )
        })}
      </fieldset>

      {/* EL PAPEL, tal como sale. El mismo componente que reimprime la ficha. */}
      <HojaDelRecibo hoja={hoja} nombre={fila.nombre} categoria={categoria} quincena={quincena} recibo={recibo} codigo={codigo} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* DOS ACCIONES, NO CUATRO (dueño, 30/09): «sólo quiero guardar e imprimir». Las dos variantes que
            imprimían sin dejar rastro se quitaron: nadie sabía para qué servían, y el PDF es el mismo
            diálogo de impresión. Un papel que sale sin quedar en el legajo es el problema que este gesto
            resuelve, no una opción. `flex: 1 1 220px` apila los botones a ancho completo en 390 px. */}
        <button type="button" disabled={nada || guardando} onClick={aceptarEImprimir} data-testid="recibo-guardar-imprimir"
          style={{ ...BOTON, flex: '1 1 220px', border: 0, background: V.grafito, color: '#FFFFFF', fontWeight: 600, cursor: nada || guardando ? 'default' : 'pointer', opacity: nada || guardando ? 0.5 : 1 }}>
          {guardando ? 'Guardando…' : 'Guardar e imprimir'}
        </button>
        <button type="button" disabled={nada || guardando} onClick={enviarAFirmar} data-testid="recibo-enviar-a-firmar"
          style={{ ...BOTON, flex: '1 1 220px', border: `1px solid ${V.lineaFuerte}`, background: '#FFFFFF', color: V.tinta, fontWeight: 600, cursor: nada || guardando ? 'default' : 'pointer', opacity: nada || guardando ? 0.5 : 1 }}>
          {guardando ? 'Guardando…' : 'Mandar al teléfono para firmar'}
        </button>
        <span style={{ width: '100%', fontSize: '11.5px', color: V.apagado }}>
          En el diálogo elegís la impresora o «Guardar como PDF». Si firma en papel, marcalo después en el legajo.
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
