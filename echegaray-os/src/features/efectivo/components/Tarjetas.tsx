// D01 · EFECTIVO A RENDIR — cuánta plata de la empresa está en manos de alguien.
//
// Las cuatro tarjetas de arriba. La lista de abajo ya no es de entregas: es de PERSONAS (`ListaPersonas`). La tercera tarjeta del diseño («Rendición vencida · bloquea una
// nueva») NO se construye: el dueño decidió el 22/09 que no hay plazo ni bloqueo. En su lugar va el dato
// que sí existe —cuántos días lleva la entrega abierta más vieja—, en tinta neutra: es un hecho, no una
// alarma con una regla atrás.

import Link from 'next/link'
import { pesos, type Resumen } from '../logica/entregas'
import { urlEfectivo } from '../logica/url'
import { V, botonOscuro, cifra, eyebrow } from './estilo'

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
        `${r.entregasConSaldo} ${r.entregasConSaldo === 1 ? 'entrega' : 'entregas'} con saldo · todavía no es gasto`, undefined, 'tarjeta-en-manos')}
      {t('Rendido este mes', pesos(r.rendidoMes), `${r.filasMes} ${r.filasMes === 1 ? 'fila' : 'filas'} de Compras`, undefined, 'tarjeta-rendido')}
      {t('Días sin rendir',
        r.masVieja ? `${r.masVieja.dias} ${r.masVieja.dias === 1 ? 'día' : 'días'}` : '—',
        r.masVieja ? `la más vieja · ${r.masVieja.codigo} · ${r.masVieja.persona}` : 'nadie tiene saldo',
        r.masVieja ? V.tinta : V.tenue, 'tarjeta-dias')}
      {t('Por imputar', r.porImputar, 'comprobantes esperando', r.porImputar > 0 ? V.warn : V.tenue, 'tarjeta-por-imputar')}
    </div>
  )
}

/** VACÍO — una línea y el verbo. Sin ilustración ni explicación del circuito. */
export function Vacio({ texto = 'Nadie tiene efectivo de la empresa' }: { texto?: string }) {
  return (
    <div style={{ border: `1px solid ${V.linea}`, borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="efectivo-vacio">
      <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{texto}</div>
      <Link href={urlEfectivo({ panel: 'entregar' })} prefetch={false} style={{ ...botonOscuro, height: 30, padding: '0 12px', fontSize: '12.5px', width: 'max-content' }}>
        Entregar efectivo
      </Link>
    </div>
  )
}
