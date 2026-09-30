// MATERIAL · RESUMEN — calcado del Resumen de Herramientas (D01), con los datos de Material.
//
// Dueño, 29/09/2026: «rehacer Material tomando como modelo el inventario de Herramientas, no sólo
// como gestión de pedidos sino también de control de stock». 30/09: «rehacer materiales tal como pedí».
//
// Lo que cambia respecto de Herramientas, por el dato:
//   · Sin «stock mínimo» ni «Reponer» (el dueño lo sacó el 29/09): nada acá sugiere comprar.
//   · Los lugares son sólo el Taller y las obras.
//   · «Necesita una decisión» no inventa umbrales de días: lista lo que objetivamente está abierto
//     (llegada parcial, pedido sin llegar, pedido sin obra, ENTREGADO sin cantidad recibida).

import Link from 'next/link'
import type { ReactNode } from 'react'
import { IcoAviso, IcoLista, IcoObra, IcoReloj, IcoTaller } from '@/features/herramientas/components/iconos'
import { eyebrow, tituloBloque, V } from '@/features/herramientas/components/estilo'
import { diasDesde } from '@/features/herramientas/logica/parque'
import { cifrasMaterial, decisionesMaterial, dondeEstaMaterial, obrasDeMaterial, type DecisionMaterial, type MovimientoMaterial } from '../logica/inventario'
import { hrefMaterialEscritorio, type Pedido } from '../logica/pedidos'
import type { Existencia, Lugar } from '../logica/stock'

const BASE = '/herramientas/material'
const COLS_OBRAS = 'minmax(0,1.8fr) 90px 90px 90px 200px'
const COLS_DECISION = 'minmax(0,1fr) 150px 90px'
const COLS_DONDE = 'minmax(0,1fr) 90px 160px'
const fila = (ultima: boolean) => (ultima ? undefined : `1px solid ${V.linea}`)

export function VistaResumenMaterial({ pedidos, existencias, lugares, movimientos, hoy = new Date() }: {
  pedidos: Pedido[]
  existencias: Existencia[]
  lugares: Lugar[]
  /** null = el libro no se pudo leer: la cifra dice «sin leer», nunca un cero. */
  movimientos: MovimientoMaterial[] | null
  hoy?: Date
}) {
  const c = cifrasMaterial(pedidos, existencias, movimientos ?? [], hoy)
  const obras = obrasDeMaterial(pedidos, existencias, lugares)
  const ds = decisionesMaterial(pedidos)
  const donde = dondeEstaMaterial(lugares, existencias)
  const max = Math.max(1, ...donde.map((d) => d.renglones))

  return (
    <div className="flex flex-col gap-[26px]" data-testid="resumen-material">
      <div className="grid grid-cols-2 gap-x-[30px] gap-y-5 md:grid-cols-5" style={{ paddingBottom: 22, borderBottom: `1px solid ${V.linea}` }}>
        <Enlace href={hrefMaterialEscritorio({})} testid="cifra-sin-entregar">
          <Cifra rotulo="Pedidos sin entregar" valor={c.sinEntregar} tono={c.sinEntregar ? V.warn : V.tinta}
            pie={c.sinEntregar ? 'pedidos abiertos de las obras' : 'nada pendiente'} />
        </Enlace>
        <Enlace href={hrefMaterialEscritorio({ estado: 'todos' })} testid="cifra-parciales">
          <Cifra rotulo="Llegó una parte" valor={c.parciales} tono={c.parciales ? V.warn : V.tinta}
            pie={c.parciales ? 'falta que llegue el resto' : 'ninguna llegada a medias'} />
        </Enlace>
        <Enlace href={`${BASE}?ver=inventario`} testid="cifra-materiales">
          <Cifra rotulo="Materiales con stock" valor={c.materialesConStock}
            pie={c.lugaresConStock ? `en ${c.lugaresConStock} ${c.lugaresConStock === 1 ? 'lugar' : 'lugares'}` : 'todavía no hay stock cargado'} />
        </Enlace>
        <Enlace href={`${BASE}?ver=movimientos`} testid="cifra-movimientos">
          <Cifra rotulo="Movimientos · 7 días" valor={movimientos ? c.movimientos7 : null} vacioTexto="sin leer"
            pie={movimientos ? 'llegadas, usos, envíos y recuentos' : 'no se pudo leer el libro'} />
        </Enlace>
        <Enlace href={hrefMaterialEscritorio({ estado: 'entregado' })} testid="cifra-entregados-sin-llegada">
          <Cifra rotulo="Entregados sin cantidad" valor={c.entregadosSinLlegada} tono={c.entregadosSinLlegada ? V.warn : V.tinta}
            pie={c.entregadosSinLlegada ? 'marcados antes del stock: no sumaron' : 'todos sumaron al stock'} />
        </Enlace>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 style={tituloBloque}>Obras</h2>
          <Link href={`${BASE}?ver=ubicaciones`} prefetch={false} style={{ fontSize: '12.5px', color: V.apagado }}>Ver todas las ubicaciones</Link>
        </div>
        {obras.length === 0 ? (
          <div style={{ fontSize: '13.5px', color: V.apagado }}>Ninguna obra tiene pedidos ni stock de material.</div>
        ) : (
          <div className="overflow-x-auto" data-testid="obras-material">
            <div style={{ minWidth: 640 }}>
              <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS_OBRAS, gap: 18, height: 34, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
                <div>Obra</div><div style={{ textAlign: 'right' }}>Materiales</div><div style={{ textAlign: 'right' }}>Sin entregar</div><div style={{ textAlign: 'right' }}>Parciales</div><div />
              </div>
              {obras.map((o, i) => (
                <div key={o.obra_id} className="hover:bg-surface-quiet" data-testid="obra-material"
                  style={{ display: 'grid', gridTemplateColumns: COLS_OBRAS, gap: 18, minHeight: 44, alignItems: 'center', borderBottom: fila(i === obras.length - 1), fontSize: '13.5px' }}>
                  <Link href={hrefMaterialEscritorio({ obra: o.obra_id })} prefetch={false} style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 500, minWidth: 0 }}>
                    <IcoObra tam={14} color={V.tintaSuave} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline', textDecorationColor: V.linea, textUnderlineOffset: 3 }}>{o.rotulo}</span>
                  </Link>
                  <div style={{ textAlign: 'right', fontWeight: 500, color: o.materiales ? V.tinta : V.tenue }}>{o.materiales || '—'}</div>
                  <div style={{ textAlign: 'right', color: o.abiertos ? V.warn : V.tenue }}>{o.abiertos || '—'}</div>
                  <div style={{ textAlign: 'right', color: o.parciales ? V.warn : V.tenue }}>{o.parciales || '—'}</div>
                  <div style={{ display: 'flex', gap: 14, justifyContent: 'flex-end', fontSize: '12.5px' }}>
                    <Link href={hrefMaterialEscritorio({ obra: o.obra_id, estado: 'todos' })} prefetch={false} style={{ color: V.apagado }}>Pedidos</Link>
                    {o.lugar_id && <Link href={`${BASE}?ver=inventario&lugar=${o.lugar_id}`} prefetch={false} style={{ color: V.apagado }}>En inventario</Link>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-[44px] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <h2 style={tituloBloque}>Necesita una decisión</h2>
          {ds.length === 0 ? (
            <div style={{ fontSize: '13.5px', color: V.apagado, padding: '14px 0' }} data-testid="nada-pendiente">Nada pendiente.</div>
          ) : (
            <div className="overflow-x-auto" data-testid="decisiones-material">
              <div style={{ minWidth: 520 }}>
                <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS_DECISION, gap: 18, height: 34, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
                  <div>Qué pasa</div><div>Dónde</div><div style={{ textAlign: 'right' }}>Desde</div>
                </div>
                {ds.map((d, i) => <FilaDecision key={`${d.clave}-${d.id}`} d={d} ultima={i === ds.length - 1} hoy={hoy} />)}
              </div>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <h2 style={tituloBloque}>Dónde está el material</h2>
          <div data-testid="donde-esta-material">
            <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS_DONDE, gap: 16, height: 34, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
              <div>Lugar</div><div style={{ textAlign: 'right' }}>Renglones</div><div />
            </div>
            {donde.map((d, i) => (
              <Link key={d.tipo} href={`${BASE}?ver=ubicaciones`} prefetch={false} className="hover:bg-surface-quiet"
                style={{ display: 'grid', gridTemplateColumns: COLS_DONDE, gap: 16, minHeight: 42, alignItems: 'center', borderBottom: fila(i === donde.length - 1), fontSize: '13.5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {d.tipo === 'taller' ? <IcoTaller tam={14} color={V.tintaSuave} /> : <IcoObra tam={14} color={V.tintaSuave} />}
                  {d.tipo === 'taller' ? 'Taller' : 'Obras'}
                  {d.tipo === 'obra' && <span style={{ color: V.tenue, fontSize: '12px' }}>({d.lugares})</span>}
                </div>
                <div style={{ textAlign: 'right', fontWeight: 500, color: d.renglones ? V.tinta : V.tenue }}>{d.renglones || '—'}</div>
                <div style={{ height: 6, background: V.linea, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${d.renglones ? Math.max(2, Math.round((d.renglones / max) * 100)) : 0}%`, height: '100%', background: V.tintaSuave }} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Enlace({ href, testid, children }: { href: string; testid: string; children: ReactNode }) {
  return <Link href={href} prefetch={false} data-testid={testid} className="hover:bg-surface-quiet">{children}</Link>
}

function Cifra({ rotulo, valor, tono = V.tinta, pie, vacioTexto = 'sin cargar' }: { rotulo: string; valor: number | null; tono?: string; pie: ReactNode; vacioTexto?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={eyebrow}>{rotulo}</div>
      {valor == null ? (
        <div style={{ fontSize: '19px', fontWeight: 500, fontStyle: 'italic', color: V.tenue, lineHeight: '35px' }}>{vacioTexto}</div>
      ) : (
        <div style={{ fontSize: '27px', fontWeight: 600, letterSpacing: '-.02em', color: tono }}>{valor}</div>
      )}
      <div style={{ fontSize: '12px', color: V.apagado }}>{pie}</div>
    </div>
  )
}

const ICONO: Record<DecisionMaterial['clave'], (c: string) => ReactNode> = {
  parcial: (c) => <IcoLista tam={15} color={c} />,
  sin_llegar: (c) => <IcoReloj tam={15} color={c} />,
  sin_obra: (c) => <IcoAviso tam={15} color={c} />,
  entregado_sin_llegada: (c) => <IcoAviso tam={15} color={c} />,
}
const TONO: Record<DecisionMaterial['tono'], string> = { warn: V.warn, info: '#175CD3' }

function FilaDecision({ d, ultima, hoy }: { d: DecisionMaterial; ultima: boolean; hoy: Date }) {
  const dias = d.desde ? diasDesde(d.desde, hoy) : null
  return (
    <Link href={d.href} prefetch={false} data-testid={`decision-${d.clave}`} className="hover:bg-surface-quiet"
      style={{ display: 'grid', gridTemplateColumns: COLS_DECISION, gap: 18, minHeight: 52, alignItems: 'center', borderBottom: fila(ultima), fontSize: '13.5px', padding: '6px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ marginTop: 2 }}>{ICONO[d.clave](TONO[d.tono])}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>{d.titulo}</div>
          <div style={{ fontSize: '12px', color: V.apagado }}>{d.detalle}</div>
        </div>
      </div>
      <div style={{ color: V.tintaSuave, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.donde}</div>
      <div style={{ textAlign: 'right', fontWeight: 500, color: dias == null ? V.tenue : TONO[d.tono] }}>
        {dias == null ? '—' : dias <= 0 ? 'hoy' : `${dias} ${dias === 1 ? 'día' : 'días'}`}
      </div>
    </Link>
  )
}
