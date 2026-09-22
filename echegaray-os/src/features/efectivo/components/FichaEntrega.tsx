// D03 · FICHA DE LA ENTREGA — identidad, cuenta, comprobantes, actividad y papeles.
//
// La cuenta sale entera de `efectivo_entrega_saldo` (entregado − rendido − devuelto): la ficha no suma nada
// por su cuenta. «Por imputar» es lo único derivado acá, y es lo que los tickets que todavía no son fila de
// Compras dicen que valen — un observado sigue contando como no rendido hasta que su fila existe.

import Link from 'next/link'
import type { Comprobante, Devolucion, Entrega, Rendicion } from '../types'
import {
  actividadDe, ddmm, ddmmHora, destinoDe, esperando, filasDeLaFicha, numero, pesos, ROTULO_COMPROBANTE, totalLeido,
} from '../logica/entregas'
import { urlEfectivo, urlFilaDeCompras } from '../logica/url'
import type { ExtraDeFicha } from '../services/datos'
import { AnularEntrega, SubirPapel } from './Botones'
import { ALTO_V2, HOVER_FILA } from '@/shared/components/v2/patron'
import { COLOR_TONO, FONDO_OBSERVADO, MONO, V, botonClaro, botonOscuro, cifraFicha, eyebrow, punto } from './estilo'

const COLUMNAS = '72px minmax(0,1.4fr) minmax(0,1fr) 120px 140px'
/** El círculo con las iniciales de la ficha (`D03`): un tamaño de ícono, no un alto de fila. */
const AVATAR = 44

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

export function FichaEntrega({ e, comprobantes, rendiciones, devoluciones, extra, cliente }: {
  e: Entrega
  comprobantes: Comprobante[]
  rendiciones: Rendicion[]
  devoluciones: Devolucion[]
  extra: ExtraDeFicha
  cliente: string | null
}) {
  const destino = destinoDe(e, cliente)
  const nombreDestino = e.estructura ? 'Estructura' : destino.linea
  const pendientes = comprobantes.filter(esperando)
  const porImputar = pendientes.reduce((s, c) => s + (totalLeido(c) ?? 0), 0)
  const filas = filasDeLaFicha(comprobantes, rendiciones, extra.compras)
  const abierta = e.estado === 'abierta'
  const primero = pendientes.at(-1) ?? null
  const anulable = abierta && e.filas_rendidas === 0 && e.devuelto === 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }} data-testid="ficha-entrega" data-codigo={e.codigo}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between" style={{ columnGap: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <div style={{
            width: AVATAR, height: AVATAR, borderRadius: '50%', background: '#EFEEEA', color: V.tintaSuave, fontSize: '14px',
            fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {iniciales(e.persona)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <div style={{ fontSize: '21px', fontWeight: 600, letterSpacing: '-.015em' }}>{e.codigo} · {e.persona}</div>
            <div style={{ fontSize: '13px', color: V.apagado }}>
              {pesos(e.entregado)} entregados el {ddmm(e.fecha)}{extra.entregadaPor ? ` por ${extra.entregadaPor}` : ''}
              {' · '}{nombreDestino}{destino.bajada ? ` · ${destino.bajada}` : ''}
              {' · '}
              {e.conformidad_en
                ? <span style={{ color: V.pos }}>conformidad firmada {ddmmHora(e.conformidad_en)}</span>
                : e.conformidad
                  ? <span style={{ color: V.pos }}>conformidad en papel</span>
                  : <span style={{ color: V.warn }}>sin conformidad</span>}
              {e.estado !== 'abierta' && <span> · {e.estado === 'cerrada' ? `cerrada ${ddmm(e.cerrada_en)}` : 'anulada'}</span>}
            </div>
          </div>
        </div>
        {abierta && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
            {/* EL AVISO SALE POR EL CANAL NUEVO que arma el dueño: hasta que esté vinculado, el botón no finge
                que mandó algo. */}
            <button type="button" disabled style={{ ...botonClaro, opacity: 0.5, cursor: 'not-allowed' }} title="Sale por el canal de Mattermost cuando esté vinculado" data-testid="reclamar-rendicion">
              Reclamar rendición
            </button>
            <Link href={urlEfectivo({ entrega: e.codigo, panel: 'devolucion' })} prefetch={false} scroll={false} style={botonClaro} data-testid="abrir-devolucion">
              Registrar devolución
            </Link>
            {primero && (
              <Link href={urlEfectivo({ entrega: e.codigo, comprobante: primero.id })} prefetch={false} style={botonOscuro} data-testid="revisar-comprobantes">
                Revisar comprobantes
                <span style={{ fontFamily: MONO, fontSize: '11px', color: V.marca }}>{pendientes.length}</span>
              </Link>
            )}
          </div>
        )}
      </div>

      <div
        className="grid grid-cols-2 gap-5 md:grid-cols-5"
        style={{ columnGap: 30, padding: '18px 0', borderTop: `1px solid ${V.linea}`, borderBottom: `1px solid ${V.linea}` }}
        data-testid="ficha-cuenta"
      >
        <Cifra rotulo="Entregado" valor={pesos(e.entregado)} />
        <Cifra rotulo="Rendido" valor={pesos(e.rendido)} color={V.tintaSuave} bajada={`${e.filas_rendidas} ${e.filas_rendidas === 1 ? 'fila' : 'filas'} de Compras`} />
        <Cifra rotulo="Devuelto" valor={e.devuelto > 0 ? pesos(e.devuelto) : 'sin devoluciones'} color={e.devuelto > 0 ? V.tinta : V.tenue} />
        <Cifra rotulo="En su poder" valor={pesos(e.en_su_poder)} color={e.en_su_poder < 0 ? V.warn : V.tinta} />
        <Cifra
          rotulo="Por imputar" valor={pendientes.length ? pesos(porImputar) : 'nada'} color={pendientes.length ? V.warn : V.tenue}
          bajada={pendientes.length ? `${pendientes.length} ${pendientes.length === 1 ? 'comprobante' : 'comprobantes'}` : undefined} bajadaColor={V.warn}
        />
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" style={{ columnGap: 44 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Comprobantes de esta entrega</div>
          <div className="overflow-x-auto">
            <div style={{ minWidth: 560 }}>
              <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 16, height: 32, alignItems: 'center', borderBottom: `1px solid ${V.lineaFuerte}`, ...eyebrow }}>
                <div>Fecha</div><div>Proveedor</div><div>Rubro</div><div style={{ textAlign: 'right' }}>Importe</div><div>Estado</div>
              </div>
              {filas.map((f, i) => {
                const r = ROTULO_COMPROBANTE[f.estado]
                const href = f.comprobante ? urlEfectivo({ entrega: e.codigo, comprobante: f.comprobante.id }) : f.fila ? urlFilaDeCompras(f.fila) : null
                const contenido = (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: '12.5px', color: V.apagado }}>{ddmm(f.fecha)}</div>
                    <div className="truncate" style={{ color: f.proveedor ? V.tinta : V.warn }}>{f.proveedor ?? 'ticket sin proveedor legible'}</div>
                    <div className="truncate" style={{ color: f.rubro ? V.apagado : V.tenue }}>{f.rubro ?? 'sin rubro'}</div>
                    <div style={{ textAlign: 'right', fontFamily: MONO }}>{f.importe != null ? numero(f.importe) : '—'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: COLOR_TONO[r.tono] }}>
                      {r.tono !== 'apagado' && <span style={punto(r.tono)} />}{r.texto}
                    </div>
                  </>
                )
                const estilo = {
                  display: 'grid', gridTemplateColumns: COLUMNAS, gap: 16, minHeight: ALTO_V2.cara, alignItems: 'center', fontSize: '13.5px',
                  borderBottom: i < filas.length - 1 ? `1px solid ${V.lineaFila}` : undefined,
                  background: f.estado === 'observado' ? FONDO_OBSERVADO : undefined,
                } as const
                return href
                  ? <Link key={f.comprobante?.id ?? `r${i}`} href={href} prefetch={false} className={HOVER_FILA} style={estilo} data-testid="fila-comprobante" data-estado={f.estado}>{contenido}</Link>
                  : <div key={`r${i}`} style={estilo} data-testid="fila-comprobante" data-estado={f.estado}>{contenido}</div>
              })}
              {!filas.length && (
                <div style={{ padding: '18px 0', fontSize: '12.5px', color: V.apagado }}>Todavía no mandó ningún comprobante.</div>
              )}
            </div>
          </div>
          {filas.length > 0 && (
            <div style={{ fontSize: '12.5px', color: V.apagado }}>
              {filas.length} {filas.length === 1 ? 'comprobante' : 'comprobantes'} · lo que está «En Compras» ya es gasto de {nombreDestino} y se lee en su economía.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Actividad</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: '12.5px' }} data-testid="ficha-actividad">
              {actividadDe({ entrega: e, creadaEn: extra.creadaEn, entregadaPor: extra.entregadaPor, comprobantes, rendiciones, devoluciones })
                .map((ev, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '82px minmax(0,1fr)', gap: 14 }}>
                    <div style={{ color: V.tenue, fontFamily: MONO, fontSize: '11.5px' }}>{ddmmHora(ev.en)}</div>
                    <div style={{ color: V.tintaSuave }}>{ev.texto}</div>
                  </div>
                ))}
            </div>
          </div>
          <Papeles e={e} papelUrl={extra.papelUrl} fotos={comprobantes.filter((c) => c.storage_path).length} />
          {anulable && <AnularEntrega entrega={e.id} volverHref={urlEfectivo({})} />}
          {e.estado === 'anulada' && e.anulada_motivo && (
            <div style={{ fontSize: '12.5px', color: V.apagado }}>Anulada: {e.anulada_motivo}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Cifra({ rotulo, valor, bajada, color, bajadaColor }: { rotulo: string; valor: string; bajada?: string; color?: string; bajadaColor?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={eyebrow}>{rotulo}</div>
      <div style={{ ...cifraFicha, color: color ?? V.tinta }}>{valor}</div>
      {bajada && <div style={{ fontSize: '12px', color: bajadaColor ?? V.apagado }}>{bajada}</div>}
    </div>
  )
}

/** PAPELES — la conformidad y las fotos. La rendición cerrada y el recibo son de la etapa 5 y no se dibujan. */
function Papeles({ e, papelUrl, fotos }: { e: Entrega; papelUrl: string | null; fotos: number }) {
  // Ritmo de panel: «Papeles» es la columna lateral de la ficha, no una tabla de datos; el diseño (D03) la
  // dibuja a 42 y crece con el botón de subir el papel.
  const fila = { minHeight: 42, display: 'flex', alignItems: 'center', gap: 10, fontSize: '13px' } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 18, borderTop: `1px solid ${V.linea}` }} data-testid="ficha-papeles">
      <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Papeles</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...fila, borderBottom: `1px solid ${V.lineaFila}` }}>
          {e.conformidad ? (
            <>
              <span>Conformidad {e.codigo} firmada{e.conformidad_en ? ' en el teléfono' : ' en papel'}</span>
              {papelUrl && <a href={papelUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: '11.5px', color: V.tenue, textDecoration: 'underline' }}>ver el papel</a>}
            </>
          ) : (
            <>
              <span style={{ color: V.warn }}>Conformidad sin firmar</span>
              {e.estado !== 'anulada' && <span style={{ marginLeft: 'auto' }}><SubirPapel entrega={e.id} /></span>}
            </>
          )}
        </div>
        <div style={{ ...fila, color: fotos ? V.tinta : V.tenue }}>
          {fotos} {fotos === 1 ? 'foto' : 'fotos'} de comprobantes
        </div>
      </div>
    </div>
  )
}
