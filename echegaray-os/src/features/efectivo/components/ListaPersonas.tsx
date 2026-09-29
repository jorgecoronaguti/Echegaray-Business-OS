// LA LISTA DE PERSONAS CON EFECTIVO (dueño, 29/09/2026: «una fila por persona, no las entregas apiladas»).
//
// Cada fila es una persona con lo que tiene en la mano, lo entregado, lo rendido y su última actividad; entrar
// en ella abre sus entregas y rendiciones (`FichaPersona`). Orden: apellido, con el comparador único.
// En el teléfono la fila se apila en dos líneas —nombre y saldo arriba, el resto abajo—: una tabla de cinco
// columnas obligaba a desplazarse de costado.

import Link from 'next/link'
import { ddmm, numero, pesos, type FiltroLista } from '../logica/entregas'
import type { PersonaConEfectivo } from '../logica/personas'
import { urlEfectivo } from '../logica/url'
import { ALTO_V2, HOVER_FILA } from '@/shared/components/v2/patron'
import { MONO, V, chip, eyebrow } from './estilo'
import { Vacio } from './Tarjetas'

const COLUMNAS = 'minmax(0,1.5fr) 132px 132px 132px minmax(0,1.3fr)'

// «Anuladas» va último: no es un estado de trabajo, es el cajón de lo que no existió.
const RECORTES = [['abiertas', 'Con efectivo'], ['todas', 'Todas'], ['anuladas', 'Anuladas']] as const

const TITULO = { abiertas: 'Personas con efectivo', obra: 'Personas con efectivo', todas: 'Personas que recibieron efectivo', anuladas: 'Personas con entregas anuladas' } as const
const VACIO = { abiertas: 'Nadie tiene efectivo de la empresa', obra: 'Nadie tiene efectivo de la empresa', todas: 'Nadie recibió efectivo todavía', anuladas: 'No hay entregas anuladas' } as const

export function ListaPersonas({ personas, filtro, puestos }: {
  personas: PersonaConEfectivo[]; filtro: FiltroLista; puestos: Record<string, string | null>
}) {
  const activo = filtro === 'obra' ? 'abiertas' : filtro
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="efectivo-personas">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{TITULO[filtro]}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }} data-testid="efectivo-recortes">
          {RECORTES.map(([f, t]) => (
            <Link key={f} href={urlEfectivo({ f })} prefetch={false} scroll={false} style={chip(activo === f)} aria-current={activo === f ? 'true' : undefined}>
              {t}
            </Link>
          ))}
        </div>
      </div>

      {personas.length === 0 ? (
        <Vacio texto={VACIO[filtro]} />
      ) : filtro === 'anuladas' ? (
        personas.map((p) => <FilaAnuladas key={p.id} p={p} />)
      ) : (
        <div>
          <div className="max-md:hidden" style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 16, height: 32, alignItems: 'center', borderBottom: `1px solid ${V.lineaFuerte}`, ...eyebrow }}>
            <div>Persona</div><div style={{ textAlign: 'right' }}>En su poder</div><div style={{ textAlign: 'right' }}>Entregado</div>
            <div style={{ textAlign: 'right' }}>Rendido</div><div>Última actividad</div>
          </div>
          {personas.map((p) => <FilaPersona key={p.id} p={p} puesto={puestos[p.id] ?? null} />)}
        </div>
      )}
    </div>
  )
}

function FilaPersona({ p, puesto }: { p: PersonaConEfectivo; puesto: string | null }) {
  const sinSaldo = p.enMano === 0
  const detalle = [
    puesto,
    p.abiertas > 0 ? `${p.abiertas} ${p.abiertas === 1 ? 'entrega abierta' : 'entregas abiertas'}` : 'sin entregas abiertas',
    p.dias != null ? `${p.dias} ${p.dias === 1 ? 'día' : 'días'} sin rendir` : null,
  ].filter(Boolean).join(' · ')
  return (
    <Link
      href={urlEfectivo({ persona: p.id })} prefetch={false} className={`${HOVER_FILA} max-md:!py-2`}
      data-testid="fila-persona" data-persona={p.id}
      style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: '4px 16px', minHeight: ALTO_V2.fila, alignItems: 'center', borderBottom: `1px solid ${V.lineaFila}`, fontSize: '13.5px', color: sinSaldo ? V.apagado : V.tinta }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span className="truncate" style={{ fontWeight: 500 }}>{p.nombre}</span>
        <span className="truncate" style={{ fontSize: '12px', color: V.tenue }}>{detalle}</span>
      </div>
      <div style={{ textAlign: 'right', fontFamily: MONO, fontWeight: 600, color: sinSaldo ? V.tenue : V.tinta }}>{numero(p.enMano)}</div>
      <div className="max-md:hidden" style={{ textAlign: 'right', fontFamily: MONO }}>{numero(p.entregado)}</div>
      <div className="max-md:hidden" style={{ textAlign: 'right', fontFamily: MONO, color: V.tintaSuave }}>{numero(p.rendido)}</div>
      <div style={{ fontSize: '12.5px', color: V.apagado, minWidth: 0 }}>
        <span className="md:hidden" style={{ fontFamily: MONO, fontSize: '11.5px', display: 'block' }}>Entregado {numero(p.entregado)} · Rendido {numero(p.rendido)}</span>
        {p.ultima ? <span>{p.ultima.texto} · {ddmm(p.ultima.dia)}</span> : <span style={{ color: V.tenue }}>sin actividad</span>}
      </div>
    </Link>
  )
}

/** En el cajón de anuladas: la persona y los códigos que no existieron. */
function FilaAnuladas({ p }: { p: PersonaConEfectivo }) {
  return (
    <Link
      href={urlEfectivo({ persona: p.id })} prefetch={false} className={HOVER_FILA} data-testid="fila-persona" data-persona={p.id}
      style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', minHeight: ALTO_V2.fila, alignItems: 'center', borderBottom: `1px solid ${V.lineaFila}`, fontSize: '13.5px', color: V.apagado }}
    >
      <span style={{ fontWeight: 500, color: V.tinta }}>{p.nombre}</span>
      <span style={{ fontFamily: MONO, fontSize: '12px' }}>{p.anuladas.map((e) => e.codigo).sort().join(' · ')}</span>
      <span style={{ marginLeft: 'auto', fontSize: '12px' }}>{pesos(p.anuladas.reduce((s, e) => s + e.entregado, 0))} sin efecto</span>
    </Link>
  )
}
