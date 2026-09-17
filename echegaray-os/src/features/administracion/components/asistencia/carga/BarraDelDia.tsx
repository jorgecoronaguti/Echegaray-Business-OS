'use client'

// LA BARRA DEL DÍA — qué día, qué obra, quién falta, y UNA acción primaria.
//
// La primaria es «Marcar presentes · N sin marcar» y es la única en grafito: es el gesto de todas las
// mañanas. Todo lo demás de la pantalla es secundario y se ve secundario (regla del dueño: acciones
// primarias evidentes, secundarias discretas). En el teléfono la primaria baja a una barra fija: se
// llega con el pulgar sin volver arriba de la lista.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ResumenDeCarga } from '@/features/administracion/services/cargaDeAsistencia'

/** «jueves 17 de septiembre» → «jueves 17 sep»: en la barra de la compu el rótulo largo empujaba el
 *  resumen a dos renglones (captura del 17/09/2026). */
const diaCorto = (rotulo: string): string => rotulo.replace(/ de (\p{L}{3})\p{L}*$/u, ' $1')

export interface OpcionDeObra { clave: string; etiqueta: string; cuenta?: number; href: string; activo: boolean }

export function BarraDelDia({ rotuloDia, esHoy, hrefAyer, hrefManana, hrefHoy, opciones, q, onBuscar, resumen, sinMarcar, puedeMarcar, onMarcar }: {
  rotuloDia: string; esHoy: boolean; hrefAyer: string; hrefManana: string; hrefHoy: string | null
  opciones: OpcionDeObra[]; q: string; onBuscar: (q: string) => void; resumen: ResumenDeCarga
  sinMarcar: number; puedeMarcar: boolean; onMarcar: () => void
}) {
  const router = useRouter()
  const activa = opciones.find((o) => o.activo)?.clave ?? ''
  const primaria = `Marcar presentes · ${sinMarcar} sin marcar`
  return (
    <div className="flex flex-col gap-2 px-4 pb-3 pt-3 md:flex-row md:items-center md:gap-4 md:px-8 md:pb-4 md:pt-4" data-testid="barra-del-dia">
      <div className="grid h-11 grid-cols-[44px_1fr_44px] items-center rounded-card border border-line bg-surface md:flex md:h-9 md:rounded-control md:px-1" data-testid="elegir-dia">
        <Link prefetch={false} href={hrefAyer} aria-label="Día anterior" data-testid="dia-anterior" className="flex h-11 items-center justify-center text-[18px] text-muted hover:text-ink md:h-7 md:w-7 md:text-[14px]">‹</Link>
        <span className="text-center text-[14px] font-medium text-ink md:px-2 md:text-[13px]" data-testid="rotulo-dia">
          <span className="md:hidden">{rotuloDia}</span><span className="hidden md:inline">{diaCorto(rotuloDia)}</span>{esHoy ? ' · hoy' : ''}
        </span>
        <Link prefetch={false} href={hrefManana} aria-label="Día siguiente" data-testid="dia-siguiente" className="flex h-11 items-center justify-center text-[18px] text-muted hover:text-ink md:h-7 md:w-7 md:text-[14px]">›</Link>
      </div>
      {hrefHoy && (
        <Link prefetch={false} href={hrefHoy} data-testid="ir-a-hoy" className="hidden text-[12.5px] text-muted underline hover:text-ink md:inline">Hoy</Link>
      )}
      <label className="flex items-center gap-2 text-[13px] text-muted">
        <span className="sr-only md:not-sr-only">Obra</span>
        <select
          value={activa} data-testid="filtro-obra-carga" aria-label="Obra"
          onChange={(e) => { const o = opciones.find((x) => x.clave === e.target.value); if (o) router.push(o.href) }}
          className="h-11 w-full rounded-card border border-line bg-surface px-3 text-[14px] text-ink md:h-9 md:w-auto md:max-w-[260px] md:rounded-control md:px-2 md:text-[13px]"
        >
          {opciones.map((o) => <option key={o.clave} value={o.clave}>{o.etiqueta}{o.cuenta !== undefined ? ` · ${o.cuenta}` : ''}</option>)}
        </select>
      </label>
      <input
        type="search" value={q} onChange={(e) => onBuscar(e.target.value)} placeholder="Buscar persona"
        aria-label="Buscar persona" data-testid="buscar-carga"
        className="hidden h-9 w-[220px] rounded-control border border-line bg-surface px-3 text-[13px] text-ink md:block"
      />
      <Resumen resumen={resumen} />
      {puedeMarcar && (
        <>
          <button type="button" onClick={onMarcar} disabled={sinMarcar === 0} data-testid="marcar-presentes" className="hidden h-9 shrink-0 rounded-control bg-accent px-4 text-[13px] font-medium text-surface hover:bg-accent-hover disabled:opacity-50 md:block">
            {primaria}
          </button>
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 pb-5 pt-3 md:hidden">
            <button type="button" onClick={onMarcar} disabled={sinMarcar === 0} data-testid="marcar-presentes-movil" className="h-12 w-full rounded-card bg-accent text-[15px] font-medium text-surface disabled:opacity-50">
              {primaria}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Resumen({ resumen: r }: { resumen: ResumenDeCarga }) {
  const cifra = (n: number, rotulo: string, clase: string) => (
    <span className="whitespace-nowrap"><span className={`font-semibold tabular-nums ${n > 0 ? clase : 'text-muted'}`}>{n}</span> {rotulo}</span>
  )
  return (
    <p className="flex flex-wrap gap-x-1 text-[12.5px] text-muted md:min-w-0 md:flex-1 md:flex-nowrap md:justify-end md:text-[13px]" data-testid="resumen-del-dia">
      {cifra(r.presentes, r.presentes === 1 ? 'presente' : 'presentes', 'text-pos')}<span className="text-faint">·</span>
      {cifra(r.ausentes, r.ausentes === 1 ? 'ausente' : 'ausentes', 'text-neg')}<span className="text-faint">·</span>
      {cifra(r.licencias, 'licencia', 'text-ink')}<span className="text-faint">·</span>
      {cifra(r.sinMarcar, 'sin marcar', 'text-ink')}<span className="text-faint">·</span>
      {cifra(r.conTardanza, 'tardanza', 'text-warn')}
    </p>
  )
}
