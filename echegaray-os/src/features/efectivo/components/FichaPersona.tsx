// LA PERSONA CON EFECTIVO (dueño, 29/09/2026): sus entregas y sus rendiciones en UNA sola línea de tiempo, con
// el saldo que le queda después de cada movimiento. Las rendiciones se desprenden de la persona: bajan SU saldo,
// no el de una entrega suelta. La ficha de cada entrega (`FichaEntrega`) sigue siendo el lugar de trabajo
// (revisar tickets, editar, devolver); acá se lee la cuenta corriente.
//
// Lo más nuevo arriba, como el resto del OS. El saldo de cada línea es el posterior al movimiento; si el corrido
// no coincide con lo que dice la base se avisa en vez de callarlo (un control no se valida contra sí mismo).

import type { CSSProperties } from 'react'
import Link from 'next/link'
import type { Cronologia, Movimiento, PersonaConEfectivo } from '../logica/personas'
import { ROTULO_COMPROBANTE, ddmm, numero, pesos } from '../logica/entregas'
import { urlEfectivo, urlFilaDeCompras } from '../logica/url'
import { ALTO_V2, HOVER_FILA } from '@/shared/components/v2/patron'
import { MONO, TOQUE_TELEFONO, V, cifraFicha, eyebrow } from './estilo'

const COLUMNAS = '64px 92px minmax(0,1.6fr) 120px 120px'

export function FichaPersona({ p, cronologia, puesto }: { p: PersonaConEfectivo; cronologia: Cronologia; puesto: string | null }) {
  return (
    <div className={TOQUE_TELEFONO} style={{ display: 'flex', flexDirection: 'column', gap: 22 }} data-testid="ficha-persona" data-persona={p.id}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: '21px', fontWeight: 600, letterSpacing: '-.015em' }}>{p.nombre}</div>
        <div style={{ fontSize: '13px', color: V.apagado }}>
          {[puesto, p.abiertas ? `${p.abiertas} ${p.abiertas === 1 ? 'entrega abierta' : 'entregas abiertas'}` : 'sin entregas abiertas'].filter(Boolean).join(' · ')}
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-5 md:grid-cols-5" data-testid="persona-cuenta"
        style={{ columnGap: 30, padding: '18px 0', borderTop: `1px solid ${V.linea}`, borderBottom: `1px solid ${V.linea}` }}
      >
        <Cifra rotulo="En su poder" valor={pesos(p.enMano)} color={p.enMano < 0 ? V.warn : V.tinta} />
        <Cifra rotulo="Entregado" valor={pesos(p.entregado)} />
        <Cifra rotulo="Rendido" valor={pesos(p.rendido)} color={V.tintaSuave} />
        <Cifra rotulo="Devuelto" valor={p.devuelto > 0 ? pesos(p.devuelto) : 'sin devoluciones'} color={p.devuelto > 0 ? V.tinta : V.tenue} />
        <Cifra rotulo="Última actividad" valor={p.ultima ? ddmm(p.ultima.dia) : '—'} bajada={p.ultima?.texto} pequeno />
      </div>

      {!cronologia.cuadra && (
        <div data-testid="persona-no-cuadra" style={{ border: `1px solid ${V.warn}`, borderRadius: 10, padding: '10px 14px', fontSize: '12.5px', color: V.warn }}>
          El saldo corrido de abajo ({pesos(cronologia.saldo)}) difiere en {pesos(Math.abs(cronologia.diferencia))} de entregado − rendido − devuelto.
          Se revisa entrega por entrega.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Entregas y rendiciones</div>
        <div className="max-md:hidden" style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 16, height: 32, alignItems: 'center', borderBottom: `1px solid ${V.lineaFuerte}`, ...eyebrow }}>
          <div>Fecha</div><div>Entrega</div><div>Movimiento</div><div style={{ textAlign: 'right' }}>Importe</div><div style={{ textAlign: 'right' }}>Saldo</div>
        </div>
        {cronologia.movimientos.length === 0
          ? <div style={{ fontSize: '13px', color: V.tenue }}>Todavía no tiene movimientos.</div>
          : <div>{cronologia.movimientos.map((m, i) => <FilaMovimiento key={clave(m, i)} m={m} />)}</div>}
      </div>

      {p.anuladas.length > 0 && (
        <div data-testid="persona-anuladas" style={{ fontSize: '12.5px', color: V.tenue }}>
          Anuladas, sin efecto en el saldo:{' '}
          {p.anuladas.map((e, i) => (
            <span key={e.id}>{i > 0 && ' · '}<Link href={urlEfectivo({ entrega: e.codigo })} prefetch={false} className="max-md:inline-flex max-md:min-h-11 max-md:items-center max-md:px-1" style={{ fontFamily: MONO, textDecoration: 'underline', textUnderlineOffset: 2 }}>{e.codigo}</Link></span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Un mismo ticket o devolución no aparece dos veces en la línea; el índice sólo desempata lo que no trae id. */
function clave(m: Movimiento, i: number): string {
  const id = m.tipo === 'devolucion' ? m.devolucion.id : m.tipo === 'entrega' ? m.entrega.id : (m.fila.rendicion?.id ?? m.fila.comprobante?.id ?? m.fila.adelanto ?? '')
  return `${m.tipo}-${id}-${i}`
}

function FilaMovimiento({ m }: { m: Movimiento }) {
  const { texto, sub, href } = describir(m)
  const esRendicion = m.tipo === 'rendicion'
  const importe = m.tipo === 'en_camino' ? '' : `${m.delta > 0 ? '+' : '−'}${numero(Math.abs(m.delta))}`
  // Columnas por variable y sólo desde `md`: en línea le ganaban a la clase y el teléfono seguía con cinco columnas.
  const base = { '--cols': COLUMNAS, minHeight: ALTO_V2.fila, borderBottom: `1px solid ${V.lineaFila}`, fontSize: '13.5px' } as CSSProperties
  const clase = 'grid gap-x-4 gap-y-0.5 max-md:py-3 md:items-center md:[grid-template-columns:var(--cols)]'
  const signo = m.tipo === 'entrega' ? V.tinta : V.tintaSuave
  const contenido = (
    <>
      <div className="max-md:flex max-md:items-baseline max-md:gap-2" style={{ fontFamily: MONO, fontSize: '12.5px', color: V.apagado }}>
        <span>{ddmm(m.dia)}</span>
        <span className="md:hidden" style={{ fontSize: '12px' }}>{m.entrega.codigo}</span>
      </div>
      <div className="max-md:hidden" style={{ fontFamily: MONO, fontSize: '12px', color: V.apagado }}>{m.entrega.codigo}</div>
      <div style={{ minWidth: 0, paddingLeft: esRendicion || m.tipo === 'en_camino' ? 16 : 0, borderLeft: esRendicion || m.tipo === 'en_camino' ? `2px solid ${V.linea}` : undefined }}>
        <div className="md:truncate" style={{ fontWeight: m.tipo === 'entrega' ? 500 : 400, color: m.tipo === 'en_camino' ? V.apagado : V.tinta }}>{texto}</div>
        {sub && <div className="md:truncate" style={{ fontSize: '12px', color: V.tenue }}>{sub}</div>}
      </div>
      <div className="tabular-nums max-md:flex max-md:justify-between" style={{ textAlign: 'right', fontFamily: MONO, color: signo }}>
        <span className="md:hidden" style={{ ...eyebrow, fontFamily: 'inherit' }}>{importe ? 'Importe' : ''}</span>{importe}
      </div>
      <div className="tabular-nums max-md:flex max-md:justify-between" style={{ textAlign: 'right', fontFamily: MONO, fontWeight: 600, color: m.saldo < 0 ? V.warn : V.tinta }}>
        <span className="md:hidden" style={{ ...eyebrow, fontFamily: 'inherit' }}>{m.tipo === 'en_camino' ? '' : 'Saldo'}</span>{m.tipo === 'en_camino' ? '' : numero(m.saldo)}
      </div>
    </>
  )
  return href
    ? <Link href={href} prefetch={false} className={`${HOVER_FILA} ${clase}`} style={base} data-testid="fila-movimiento" data-tipo={m.tipo}>{contenido}</Link>
    : <div className={clase} style={base} data-testid="fila-movimiento" data-tipo={m.tipo}>{contenido}</div>
}

function describir(m: Movimiento): { texto: string; sub: string | null; href: string | null } {
  if (m.tipo === 'entrega') {
    const dest = m.entrega.estructura ? 'Estructura' : m.entrega.obra
    return { texto: 'Entrega de efectivo', sub: dest || null, href: urlEfectivo({ entrega: m.entrega.codigo }) }
  }
  if (m.tipo === 'devolucion') {
    return { texto: 'Devolvió efectivo', sub: m.devolucion.nota ?? null, href: urlEfectivo({ entrega: m.entrega.codigo }) }
  }
  const f = m.fila
  const sub = [f.rubro, f.fila ? `Fila ${f.fila} de Compras` : null].filter(Boolean).join(' · ') || null
  if (m.tipo === 'en_camino') {
    const r = ROTULO_COMPROBANTE[f.estado]
    return { texto: `${f.proveedor ?? 'Ticket sin proveedor legible'} · ${r.texto}, todavía no baja el saldo`, sub, href: f.comprobante ? urlEfectivo({ entrega: m.entrega.codigo, comprobante: f.comprobante.id }) : null }
  }
  const href = f.comprobante ? urlEfectivo({ entrega: m.entrega.codigo, comprobante: f.comprobante.id }) : f.fila ? urlFilaDeCompras(f.fila) : null
  return { texto: `Rindió · ${f.proveedor ?? 'sin proveedor'}`, sub, href }
}

function Cifra({ rotulo, valor, bajada, color, pequeno }: { rotulo: string; valor: string; bajada?: string; color?: string; pequeno?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={eyebrow}>{rotulo}</div>
      <div style={{ ...cifraFicha, ...(pequeno ? { fontSize: '15px' } : {}), color: color ?? V.tinta }}>{valor}</div>
      {bajada && <div className="truncate" style={{ fontSize: '12px', color: V.apagado }}>{bajada}</div>}
    </div>
  )
}
