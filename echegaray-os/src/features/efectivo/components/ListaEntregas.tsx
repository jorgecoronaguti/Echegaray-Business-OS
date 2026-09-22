// D01 · EFECTIVO A RENDIR — cuánta plata de la empresa está en manos de alguien.
//
// Cuatro tarjetas y la lista de entregas. La tercera tarjeta del diseño («Rendición vencida · bloquea una
// nueva») NO se construye: el dueño decidió el 22/09 que no hay plazo ni bloqueo. En su lugar va el dato
// que sí existe —cuántos días lleva la entrega abierta más vieja—, en tinta neutra: es un hecho, no una
// alarma con una regla atrás.

import Link from 'next/link'
import type { Comprobante, Entrega } from '../types'
import {
  destinoDe, diasDeEntrega, estadoDeEntrega, numero, ordenarLista, pesos, type FiltroLista, type Resumen,
} from '../logica/entregas'
import { urlEfectivo } from '../logica/url'
import { ALTO_V2, HOVER_FILA } from '@/shared/components/v2/patron'
import { COLOR_TONO, MONO, V, botonOscuro, chip, cifra, eyebrow, punto } from './estilo'

const COLUMNAS = '92px minmax(0,1.2fr) minmax(0,1.3fr) 130px 130px 130px 80px 150px'

export function Tarjetas({ r }: { r: Resumen }) {
  const t = (rotulo: string, valor: React.ReactNode, bajada: React.ReactNode, color?: string, testid?: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }} data-testid={testid}>
      <div style={eyebrow}>{rotulo}</div>
      <div style={{ ...cifra, color: color ?? V.tinta }}>{valor}</div>
      <div style={{ fontSize: '12.5px', color: V.apagado }}>{bajada}</div>
    </div>
  )
  return (
    <div
      className="grid grid-cols-2 gap-6 lg:grid-cols-4"
      style={{ columnGap: 36, paddingBottom: 20, borderBottom: `1px solid ${V.linea}` }}
      data-testid="efectivo-tarjetas"
    >
      {t('En manos de la gente', pesos(r.enManos),
        `${r.entregasConSaldo} ${r.entregasConSaldo === 1 ? 'entrega' : 'entregas'} · todavía no es gasto`, undefined, 'tarjeta-en-manos')}
      {t('Rendido este mes', pesos(r.rendidoMes), `${r.filasMes} ${r.filasMes === 1 ? 'fila' : 'filas'} de Compras`, undefined, 'tarjeta-rendido')}
      {t('Días sin rendir',
        r.masVieja ? `${r.masVieja.dias} ${r.masVieja.dias === 1 ? 'día' : 'días'}` : '—',
        r.masVieja ? `la más vieja · ${r.masVieja.codigo} · ${r.masVieja.persona}` : 'nadie tiene saldo',
        r.masVieja ? V.tinta : V.tenue, 'tarjeta-dias')}
      {t('Por imputar', r.porImputar, 'comprobantes esperando', r.porImputar > 0 ? V.warn : V.tenue, 'tarjeta-por-imputar')}
    </div>
  )
}

export function ListaEntregas({
  entregas, comprobantes, filtro, hoy, puestos, clienteDeObra,
}: {
  entregas: Entrega[]
  comprobantes: Comprobante[]
  filtro: FiltroLista
  hoy: string
  puestos: Record<string, string | null>
  clienteDeObra: Record<string, string>
}) {
  const grupos = ordenarLista(entregas, filtro)
  const porEntrega = new Map<string, Comprobante[]>()
  for (const c of comprobantes) porEntrega.set(c.entrega_id, [...(porEntrega.get(c.entrega_id) ?? []), c])
  const vacia = grupos.every((g) => g.entregas.length === 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{filtro === 'todas' ? 'Todas las entregas' : 'Entregas abiertas'}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }} data-testid="efectivo-recortes">
          {([['abiertas', 'Abiertas'], ['todas', 'Todas'], ['obra', 'Por obra']] as const).map(([f, t]) => (
            <Link key={f} href={urlEfectivo({ f })} prefetch={false} scroll={false} style={chip(filtro === f)} aria-current={filtro === f ? 'true' : undefined}>
              {t}
            </Link>
          ))}
        </div>
      </div>

      {vacia ? (
        <Vacio />
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: 980 }}>
            <div
              style={{
                display: 'grid', gridTemplateColumns: COLUMNAS, gap: 16, height: 32, alignItems: 'center',
                borderBottom: `1px solid ${V.lineaFuerte}`, ...eyebrow,
              }}
            >
              <div>Entrega</div><div>A cargo de</div><div>Destino económico</div>
              <div style={{ textAlign: 'right' }}>Entregado</div><div style={{ textAlign: 'right' }}>Rendido</div>
              <div style={{ textAlign: 'right' }}>En su poder</div><div style={{ textAlign: 'right' }}>Días</div><div>Estado</div>
            </div>
            {grupos.map((g) => (
              <div key={g.grupo ?? 'todas'}>
                {g.grupo && (
                  <div style={{ padding: '14px 0 6px', fontSize: '12.5px', fontWeight: 600, color: V.tintaSuave }}>{g.grupo}</div>
                )}
                {g.entregas.map((e) => (
                  <FilaEntrega
                    key={e.id} e={e} hoy={hoy} comprobantes={porEntrega.get(e.id) ?? []} puesto={puestos[e.persona_id] ?? null}
                    cliente={e.obra_id ? (clienteDeObra[e.obra_id] ?? null) : null}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FilaEntrega({ e, hoy, comprobantes, puesto, cliente }: {
  e: Entrega; hoy: string; comprobantes: Comprobante[]; puesto: string | null; cliente: string | null
}) {
  const estado = estadoDeEntrega(e, comprobantes)
  const quieta = e.estado !== 'abierta'
  const destino = destinoDe(e, cliente)
  const poderColor = e.en_su_poder === 0 && !quieta ? V.pos : e.en_su_poder < 0 ? V.warn : quieta ? V.tenue : V.tinta
  return (
    <Link
      href={urlEfectivo({ entrega: e.codigo })}
      prefetch={false}
      className={HOVER_FILA}
      data-testid="fila-entrega"
      data-codigo={e.codigo}
      style={{
        display: 'grid', gridTemplateColumns: COLUMNAS, gap: 16, minHeight: ALTO_V2.entrega, alignItems: 'center',
        borderBottom: `1px solid ${V.lineaFila}`, fontSize: '13.5px', color: quieta ? V.tenue : V.tinta,
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: '12px', color: quieta ? V.tenue : V.apagado }}>{e.codigo}</div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span className="truncate" style={{ fontWeight: 500 }}>{e.persona}</span>
        {puesto && <span className="truncate" style={{ fontSize: '12px', color: V.tenue }}>{puesto}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span className="truncate">
          {destino.linea}
          {e.estructura && <span style={{ color: V.tenue, fontSize: '12px' }}> · sin obra</span>}
        </span>
        {destino.bajada && <span className="truncate" style={{ fontSize: '12px', color: V.tenue }}>{destino.bajada}</span>}
        {e.estructura && <span style={{ fontSize: '12px', color: V.tenue }}>declarado en el alta</span>}
      </div>
      <div style={{ textAlign: 'right', fontFamily: MONO }}>{numero(e.entregado)}</div>
      <div style={{ textAlign: 'right', fontFamily: MONO, color: quieta ? V.tenue : V.tintaSuave }}>{numero(e.rendido)}</div>
      <div style={{ textAlign: 'right', fontFamily: MONO, fontWeight: quieta ? 400 : 600, color: poderColor }}>{numero(e.en_su_poder)}</div>
      <div style={{ textAlign: 'right', fontFamily: MONO, color: quieta ? V.tenue : V.apagado }}>{diasDeEntrega(e, hoy)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '13px', color: estado.tono === 'neutro' ? V.tinta : COLOR_TONO[estado.tono] }}>
        {estado.tono !== 'apagado' && <span style={punto(estado.tono)} />}
        {estado.texto}
      </div>
    </Link>
  )
}

/** VACÍO — una línea y el verbo. Sin ilustración ni explicación del circuito. */
function Vacio() {
  return (
    <div style={{ border: `1px solid ${V.linea}`, borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="efectivo-vacio">
      <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Nadie tiene efectivo de la empresa</div>
      <Link href={urlEfectivo({ panel: 'entregar' })} prefetch={false} style={{ ...botonOscuro, height: 30, padding: '0 12px', fontSize: '12.5px', width: 'max-content' }}>
        Entregar efectivo
      </Link>
    </div>
  )
}
