'use client'

// D14 · ETIQUETAS — donde se imprime el QR. No es una solapa: se llega desde el alta, el inventario o
// una ficha. El QR lo genera el sistema al dar de alta (ES el código); acá sólo se imprime.
//
// Hoja A4 de 24 etiquetas de 50 × 25 mm (`logica/etiquetas.ts`), con el código también en texto: si el
// QR se arruina, se tipea. Después de imprimir se pregunta si salieron bien y recién ahí se marcan
// impresas (`editar_activo {etiqueta_impresa: true}`): la evidencia es la hoja, no el clic en «Imprimir».
//
// Desvío: sin «Ver PDF» — el diálogo de impresión del navegador ya guarda en PDF.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { casilleros, colaDeEtiquetas, ETIQUETA, hojas, renglonesDeNombre, type MotivoCola } from '../logica/etiquetas'
import { marcarEtiquetasImpresasAction } from '../services/acciones'
import { useHerramientas } from './Espacio'
import { QR } from './QR'
import { MONO, V, bajadaPagina, botonPrimario, botonSecundario, eyebrow, pagina, tituloBloque, tituloPagina } from './estilo'

const MOTIVO: Record<MotivoCola, { t: string; c: string }> = {
  pedida: { t: 'pedida', c: V.apagado },
  nunca_impresa: { t: 'nunca impresa', c: V.apagado },
  alta_desde_obra: { t: 'alta desde obra', c: V.warn },
}

const VISIBLES = 12

const CSS_IMPRESION = `
@media screen { .hojas-etiquetas { display: none } }
@media print {
  @page { size: A4; margin: 0 }
  body * { visibility: hidden !important }
  .hojas-etiquetas, .hojas-etiquetas * { visibility: visible !important }
  .hojas-etiquetas { position: absolute; left: 0; top: 0 }
  .hoja-a4 { break-after: page; page-break-after: always }
}`

export function VistaEtiquetas({ pedidos }: { pedidos: string[] }) {
  const { parque, avisar, refrescar } = useHerramientas()
  const soloPedidos = pedidos.length > 0
  const cola = useMemo(() => {
    const c = colaDeEtiquetas(parque.activos, pedidos, parque.unidades ?? [])
    return soloPedidos ? c.filter((x) => x.motivo === 'pedida') : c
  }, [parque.activos, parque.unidades, pedidos, soloPedidos])
  const pendientes = colaDeEtiquetas(parque.activos).length
  const [impreso, setImpreso] = useState(false)
  const [todos, setTodos] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [marcando, setMarcando] = useState(false)
  const ejemplo = cola[0] ?? null

  function imprimir() {
    window.print()
    setImpreso(true)
  }
  async function marcar() {
    setMarcando(true)
    setError(null)
    // Una unidad (BAL-001/3) marca impreso su lote: la marca vive en el activo, no en la unidad.
    const r = await marcarEtiquetasImpresasAction([...new Set(cola.map((x) => x.activo.id))])
    setMarcando(false)
    if (!r.ok) return setError(r.error)
    avisar(`${r.dato} ${r.dato === 1 ? 'etiqueta quedó marcada impresa' : 'etiquetas quedaron marcadas impresas'}.`)
    setImpreso(false)
    refrescar()
  }

  const lista = todos ? cola : cola.slice(0, VISIBLES)
  return (
    <div style={pagina} data-testid="etiquetas">
      <style>{CSS_IMPRESION}</style>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h1 style={tituloPagina}>Imprimir etiquetas</h1>
          <div style={bajadaPagina}>El QR lo genera el sistema al dar de alta. Acá sólo se imprime. No es una solapa: se llega desde el alta, el inventario o una ficha.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {impreso && (
            <button type="button" onClick={marcar} disabled={marcando} style={botonSecundario} data-testid="marcar-impresas">
              {marcando ? 'Marcando…' : 'Salieron bien: marcar impresas'}
            </button>
          )}
          <button type="button" onClick={imprimir} disabled={cola.length === 0} style={{ ...botonPrimario, opacity: cola.length ? 1 : 0.45 }} data-testid="imprimir-etiquetas">
            Imprimir {cola.length} {cola.length === 1 ? 'etiqueta' : 'etiquetas'}
          </button>
        </div>
      </div>
      {error && <div role="alert" style={{ fontSize: '12.5px', color: V.neg }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 22, borderBottom: `1px solid ${V.linea}` }}>
        <div style={tituloBloque}>No hay un «generador de QR». Hay tres puertas a esta pantalla</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 30, fontSize: '13px', color: V.tintaSuave, lineHeight: 1.55 }}>
          <div><div style={eyebrow}>Al dar de alta</div>«Dar de alta» deja el activo en esta cola. El QR ya existe desde ese segundo: es su código.</div>
          <div><div style={eyebrow}>Desde el inventario</div>Selección múltiple → <b>Imprimir QR</b>. Es el camino para etiquetar treinta herramientas de una tarde.</div>
          <div><div style={eyebrow}>Desde una ficha</div>«Reimprimir etiqueta», junto al QR. Una sola, misma etiqueta, mismo código.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr) minmax(0,0.9fr)', gap: 36 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={tituloBloque}>Cómo funciona</div>
          {[
            <>Al dar de alta un activo, el sistema le asigna su código (<span style={{ fontFamily: MONO }}>AMO-001</span>) y con eso el QR. No hay un paso aparte de «crear QR».</>,
            <>El QR codifica una dirección corta: <span style={{ fontFamily: MONO }}>app.ecsas.com.ar/h/AMO-001</span>. Abierta con la cámara del teléfono, cae en la ficha.</>,
            <>Se imprimen de a hojas A4 de 24 etiquetas de 50 × 25 mm, sobre film autoadhesivo. Impresora común.</>,
            <>Se pega y listo. El activo ya existía sin la etiqueta; el QR sólo acelera encontrarlo.</>,
            <>Si se despega o se rompe, <b>Reimprimir</b> desde la ficha da la misma etiqueta con el mismo código. El código no cambia nunca.</>,
          ].map((t, i) => (
            <div key={i} style={{ fontSize: '13px', color: V.tintaSuave, lineHeight: 1.5, paddingBottom: 10, borderBottom: i < 4 ? `1px solid ${V.linea}` : undefined }}>
              <b>{i + 1}.</b> {t}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="cola-etiquetas">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={tituloBloque}>{soloPedidos ? 'Pedidas' : 'En cola'} <span style={{ color: V.tenue, fontWeight: 400 }}>{cola.length}</span></div>
            <Link href="/herramientas/inventario?filtro=sin_etiqueta" prefetch={false} style={{ fontSize: '12.5px', color: V.apagado }}>Agregar desde Inventario</Link>
          </div>
          <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 100px 120px', gap: 14, height: 30, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
            <div>Activo</div><div>Código</div><div style={{ textAlign: 'right' }}>Etiqueta</div>
          </div>
          {cola.length === 0 && <div style={{ fontSize: '13px', color: V.apagado, padding: '10px 0' }}>No hay etiquetas pendientes: todo lo vivo tiene la suya.</div>}
          {lista.map(({ activo: a, motivo, codigo }) => (
            <div key={codigo} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 100px 120px', gap: 14, minHeight: 36, alignItems: 'center', borderBottom: `1px solid ${V.linea}`, fontSize: '13px' }}>
              <div>{a.nombre}</div>
              <div style={{ fontFamily: MONO, fontSize: '12px', color: V.apagado }}>{codigo}</div>
              <div style={{ textAlign: 'right', color: a.etiqueta_impresa_en && motivo === 'pedida' ? V.apagado : MOTIVO[motivo].c }}>
                {a.etiqueta_impresa_en && motivo === 'pedida' ? 'reimprimir' : MOTIVO[motivo].t}
              </div>
            </div>
          ))}
          {!todos && cola.length > VISIBLES && (
            <button type="button" onClick={() => setTodos(true)} style={{ textAlign: 'left', fontSize: '13px', color: V.apagado, minHeight: 32 }}>+ {cola.length - VISIBLES} más</button>
          )}
          <div style={{ fontSize: '12px', color: V.apagado, lineHeight: 1.5 }}>
            {soloPedidos
              ? <>Sólo lo pedido. <Link href="/herramientas/etiquetas" prefetch={false} style={{ textDecoration: 'underline' }}>Ver toda la cola</Link> ({pendientes} sin etiqueta).</>
              : `${pendientes} activos todavía sin etiqueta. No es un error: se van etiquetando cuando pasan por el taller.`}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={tituloBloque}>La etiqueta</div>
          {ejemplo ? <Etiqueta codigo={ejemplo.codigo} nombre={ejemplo.activo.nombre} escala={4.2} borde /> : <div style={{ fontSize: '12.5px', color: V.tenue }}>Sin etiquetas en cola.</div>}
          <div style={{ fontSize: '12.5px', color: V.apagado, lineHeight: 1.55 }}>
            50 × 25 mm. El código va también en texto: si el QR se arruina, se puede tipear a mano. Es la razón por la que nada del módulo depende del escáner.
          </div>
        </div>
      </div>

      <div className="hojas-etiquetas" aria-hidden>
        {hojas(cola).map((h, i) => (
          <div key={i} className="hoja-a4" style={{ position: 'relative', width: '210mm', height: '297mm', overflow: 'hidden' }}>
            {h.map(({ activo: a, codigo }, j) => {
              const c = casilleros()[j]
              return (
                <div key={codigo} style={{ position: 'absolute', left: `${c.x}mm`, top: `${c.y}mm` }}>
                  <Etiqueta codigo={codigo} nombre={a.nombre} escala={1} unidad="mm" />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Una etiqueta. En mm para imprimir (`unidad="mm"`, escala 1 = tamaño real) o en px para la muestra
 * de pantalla (`escala` = px por mm).
 */
function Etiqueta({ codigo, nombre, escala, unidad = 'px', borde }: { codigo: string; nombre: string; escala: number; unidad?: 'mm' | 'px'; borde?: boolean }) {
  const u = (n: number) => `${n * escala}${unidad}`
  const [r1, r2] = renglonesDeNombre(nombre)
  return (
    <div style={{
      width: u(ETIQUETA.ancho), height: u(ETIQUETA.alto), display: 'flex', alignItems: 'center', gap: u(2), padding: u(1.8),
      boxSizing: 'border-box', background: '#FFFFFF', color: '#000000', border: borde ? `1px solid ${V.lineaFuerte}` : `0.1mm dashed #BBBBBB`, borderRadius: borde ? 6 : 0,
    }}>
      <div style={{ width: u(21), height: u(21), flexShrink: 0 }}><QR codigo={codigo} lado="100%" margen={1} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: u(0.6), minWidth: 0 }}>
        <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: u(3.6), letterSpacing: '.02em' }}>{codigo}</div>
        <div style={{ fontSize: u(2.4), lineHeight: 1.2 }}>{r1}{r2 && <><br />{r2}</>}</div>
        <div style={{ fontSize: u(1.9), letterSpacing: '.08em', color: '#555555', marginTop: u(0.6) }}>ECHEGARAY</div>
      </div>
    </div>
  )
}
