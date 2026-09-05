'use client'

// EL PIE DEL PANEL DE UNA COMPRA — «Vincular comprobante» y «Imputar a obra».
//
// `design_handoff_crm_v4/pantallas/Administración v4 · Pantallas.dc.html:274-277`: una acción
// primaria amarilla `#FDC900` con texto grafito `#30302F`, alto 30px, radio 6, y una secundaria EN
// TEXTO al lado, con 16px entre las dos. El README lo dice igual: «Acción primaria única: Vincular
// comprobante (amarillo, texto grafito). Secundaria en texto: Imputar a obra».
//
// ═══ POR QUÉ UNA ESCRIBE Y LA OTRA ES UN ENLACE ═══
//
// No es una decisión de diseño: es de dónde vive cada dato.
//
// El PAPEL vive en `compra_adjunto`, que es una tabla NATIVA del OS. Colgar un papel de una compra
// es una escritura del OS sobre lo suyo, y se hace acá mismo.
//
// La OBRA vive en `compra_sheet.obra_texto`, que es un ESPEJO de la pestaña Compras del Sheet — la
// tabla tiene `sincronizado_en` y el dueño la edita a mano. Escribir la obra en la base la pisaría
// el próximo sync, y la pantalla habría mentido: mostró que quedó imputada y al rato vuelve a estar
// como estaba. Por eso la secundaria es un ENLACE a la cola de imputación, que es donde esa
// decisión se toma y se aplica sobre la fuente. Que el mockup la dibuje en texto y no como botón es
// coherente con eso, y es lo que se porta.
//
// ═══ NO SE OFRECE UN BOTÓN QUE VA A REBOTAR ═══
//
// `vincularAdjunto` exige que la compra tenga CLAVE: sin número de comprobante no hay identidad
// estable de la cual colgar el papel, y al siguiente sync el vínculo apuntaría a cualquier lado.
// Medido el 05/09/2026: de las 889 compras sin papel, 653 tienen clave y 236 no —sueldos,
// impuestos, anticipos—. En esas 236 el botón no se dibuja, y se dice por qué en una línea: son
// gastos que no tienen comprobante que respaldar, no un trabajo pendiente.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { C } from '@/shared/components/canon'
import {
  buscarAdjuntosSueltos, urlDelAdjunto, vincularAdjunto, type AdjuntoSuelto,
} from '../services/comprasAdjuntoActions'

/** `#FDC900` sobre `#30302F`: el par exacto del handoff. No es el ámbar de alerta. */
const AMARILLO = '#FDC900'
const GRAFITO = '#30302F'

const kb = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)

export function AccionesCompra({ clave, filaCompras }: { clave: string | null; filaCompras: number }) {
  const [abierto, setAbierto] = useState(false)
  const [opciones, setOpciones] = useState<AdjuntoSuelto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState(false)
  const [q, setQ] = useState('')
  const [pendiente, empezar] = useTransition()

  function abrir() {
    setAbierto(true)
    setError(null)
    empezar(async () => {
      const r = await buscarAdjuntosSueltos('')
      if (!r.ok) { setError(r.error); return }
      setOpciones(r.dato)
    })
  }

  function buscar(texto: string) {
    setQ(texto)
    setError(null)
    empezar(async () => {
      const r = await buscarAdjuntosSueltos(texto)
      if (!r.ok) { setError(r.error); return }
      setOpciones(r.dato)
    })
  }

  function elegir(a: AdjuntoSuelto) {
    if (!clave) return
    setError(null)
    empezar(async () => {
      const r = await vincularAdjunto(a.id, clave)
      // EL ERROR DEL SERVIDOR SE MUESTRA TAL CUAL. `vincularAdjunto` distingue «no tenés permiso»
      // de «esa compra está duplicada», y las dos piden acciones distintas de quien lo lee.
      if (!r.ok) { setError(r.error); return }
      setHecho(true)
      setAbierto(false)
    })
  }

  return (
    <div style={{ paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {clave
          ? (
              <button
                type="button"
                onClick={abrir}
                disabled={pendiente}
                data-testid="vincular-comprobante"
                style={{
                  height: 30, padding: '0 12px', borderRadius: 6, border: 'none',
                  background: AMARILLO, color: GRAFITO, display: 'flex', alignItems: 'center',
                  whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 600,
                  cursor: pendiente ? 'wait' : 'pointer',
                }}
              >
                Vincular comprobante
              </button>
            )
          : (
              // NI BOTÓN APAGADO NI BOTÓN QUE REBOTA. Un botón deshabilitado invita a hacer clic y
              // no dice nada; esto dice el hecho.
              <span style={{ fontSize: 11.5, color: C.tenue }} data-testid="sin-clave-para-vincular">
                Sin número de comprobante no hay de qué colgar el papel.
              </span>
            )}

        {/* LA SECUNDARIA, EN TEXTO. Lleva a la cola donde la imputación se decide y se aplica sobre
            la pestaña, que es la fuente. */}
        <Link
          href={`/administracion/pendientes?fuente=compra&fila=${filaCompras}`}
          data-testid="imputar-a-obra"
          style={{ fontSize: 12, color: C.apagado }}
        >
          Imputar a obra
        </Link>
      </div>

      {hecho && (
        <p style={{ fontSize: 11.5, color: '#067647', paddingTop: 8 }} data-testid="vinculado-ok">
          Quedó vinculado. El papel aparece arriba al recargar.
        </p>
      )}

      {abierto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10 }}>
          <input
            value={q}
            onChange={(e) => buscar(e.target.value)}
            placeholder="Buscar por nombre de archivo"
            data-testid="buscar-adjunto-suelto"
            style={{
              border: `1px solid ${C.linea}`, borderRadius: 6, padding: '4px 8px', fontSize: 12,
              width: '100%',
            }}
          />

          {error && <span style={{ fontSize: 11.5, color: '#B42318' }} data-testid="error-vincular-compra">{error}</span>}

          {/* CERO RESULTADOS SE DICE, y con la palabra correcta según por qué hay cero: no hay
              ninguno suelto, o ninguno coincide con lo que se escribió. */}
          {opciones?.length === 0 && (
            <span style={{ fontSize: 11.5, color: C.tenue }} data-testid="sin-sueltos-para-esta">
              {q ? 'Ningún comprobante suelto se llama así.' : 'No hay ningún comprobante suelto esperando.'}
            </span>
          )}

          {opciones?.map((a) => (
            <div
              key={a.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${C.linea}`,
                borderRadius: 6, padding: '5px 9px', fontSize: 12, minWidth: 0,
              }}
            >
              {/* VER ANTES DE COLGAR. Medido el 05/09/2026: 7 de los 53 sueltos se llaman
                  `rn_image_picker_lib_temp_<uuid>.jpg` o `image.png`, o sea que su nombre no dice
                  NADA — y los otros 46 tampoco prueban de qué compra son. Un flujo que obliga a
                  elegir a ciegas produce exactamente el error que este flujo existe para evitar:
                  el papel colgado de la factura equivocada, que se ve como respaldo y no lo es. */}
              <button
                type="button"
                onClick={async () => {
                  const r = await urlDelAdjunto(a.id)
                  if (r.ok) window.open(r.dato, '_blank', 'noopener,noreferrer')
                  else setError(r.error)
                }}
                data-testid={`ver-adjunto-${a.id}`}
                style={{
                  border: 'none', background: 'transparent', padding: 0, textAlign: 'left',
                  cursor: 'pointer', color: C.tinta, textDecoration: 'underline',
                  textUnderlineOffset: 2, fontSize: 12, flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {a.nombre}
              </button>
              <span style={{ color: C.tenue, fontSize: 11, flexShrink: 0 }}>{kb(a.bytes)}</span>
              <button
                type="button"
                onClick={() => elegir(a)}
                disabled={pendiente}
                data-testid={`elegir-adjunto-${a.id}`}
                style={{
                  border: `1px solid ${C.linea}`, borderRadius: 6, padding: '2px 8px',
                  background: C.superficie, fontSize: 11.5, color: C.tinta, flexShrink: 0,
                  cursor: pendiente ? 'wait' : 'pointer',
                }}
              >
                Es ésta
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
