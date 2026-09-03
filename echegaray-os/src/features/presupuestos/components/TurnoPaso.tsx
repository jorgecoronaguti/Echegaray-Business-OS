'use client'

// UN TURNO DE LA CONVERSACIÓN = UN PASO DEL RAZONAMIENTO — porte literal del bloque `sc-for
// list="pasos"` de «Presupuestos v5 · Lectura del plano» (líneas 68-123). Un solo paso puede estar
// abierto a la vez (accordion de estado único, controlado por el padre): colapsado muestra la
// pregunta y el resumen; abierto suma la tabla, la evidencia y el supuesto.
//
// El estado de la fila NO se pinta a mano: viene de `f.falta`/`f.disputa`, que a su vez salen de
// que el propio plano tenga o no la cita — nunca de una regla puesta acá.

import { C } from '@/shared/components/canon'
import { COLOR_ESTADO, pieDePaso, type FilaPaso, type PasoTrabajo } from '../services/trabajoLectura'

export function TurnoPaso({ paso, abierto, esUltimo, filtroActivo, onAbrir, onFiltrar }: {
  paso: PasoTrabajo
  abierto: boolean
  esUltimo: boolean
  filtroActivo: string | null
  onAbrir: (id: string) => void
  onFiltrar: (id: string) => void
}) {
  const activo = filtroActivo === paso.id
  return (
    <div style={{ padding: '22px 0 24px', borderBottom: `1px solid ${esUltimo ? C.lineaFuerte : C.lineaFila}` }} data-testid={`paso-${paso.id}`} data-estado={paso.estado}>
      <div
        role="button" onClick={() => onAbrir(paso.id)} data-testid={`abrir-${paso.id}`}
        className="grid cursor-pointer items-baseline gap-3.5" style={{ gridTemplateColumns: '36px minmax(0,1fr) auto' }}
      >
        <span className="font-mono text-[12px] font-semibold" style={{ color: paso.etiqueta === 'x' ? C.info : C.tenue }}>{paso.etiqueta}</span>
        <span className="flex min-w-0 flex-col gap-[7px]">
          <span className="text-[14.5px] font-semibold" style={{ letterSpacing: '-.008em', color: C.tinta }}>{paso.titulo}</span>
          <span className="text-[12px]" style={{ color: C.tenue }}>{paso.pregunta}</span>
        </span>
        <span className="whitespace-nowrap text-[11px] font-semibold" style={{ color: COLOR_ESTADO[paso.estado] }}>{paso.estado}</span>
      </div>

      <div style={{ paddingLeft: 50, paddingTop: 13, display: 'flex', flexDirection: 'column' }}>
        <span className="text-[13px]" style={{ color: C.tintaSuave, lineHeight: 1.75, maxWidth: 640, textWrap: 'pretty' }}>{paso.resumen}</span>

        {abierto && <TablaPaso paso={paso} />}
        {abierto && (paso.evidencia || paso.supuesto) && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {paso.evidencia && <span className="text-[11.5px]" style={{ color: C.apagado, lineHeight: 1.6 }}>{paso.evidencia}</span>}
            {paso.supuesto && (
              <span className="text-[11.5px]" style={{ color: C.warn, lineHeight: 1.6, paddingLeft: 11, boxShadow: `inset 2px 0 0 ${C.linea}` }}>{paso.supuesto}</span>
            )}
          </div>
        )}

        <span
          role="button" data-testid={`filtrar-${paso.id}`} onClick={() => onFiltrar(paso.id)}
          className="mt-4 self-start cursor-pointer font-mono text-[12px]"
          style={{ color: activo ? C.tinta : C.apagado, borderBottom: `1px solid ${activo ? C.marca : C.linea}`, paddingBottom: 2 }}
        >
          {pieDePaso(paso)}
        </span>
      </div>
    </div>
  )
}

function TablaPaso({ paso }: { paso: PasoTrabajo }) {
  const { a, b, c, d } = paso.columnas
  return (
    <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column' }}>
      <div className="grid items-center gap-[18px]" style={{ gridTemplateColumns: '76px minmax(0,1fr) 104px 158px', paddingBottom: 7, borderBottom: `1px solid ${C.linea}` }}>
        <RotuloCol texto={a} />
        <RotuloCol texto={b} />
        <RotuloCol texto={c} derecha />
        <RotuloCol texto={d} derecha />
      </div>
      {paso.filas.map((f, i) => <FilaTabla key={`${f.k}-${i}`} f={f} />)}
    </div>
  )
}

function RotuloCol({ texto, derecha }: { texto: string; derecha?: boolean }) {
  return <span className="text-[10px] font-semibold" style={{ letterSpacing: '.08em', color: C.tenue, textAlign: derecha ? 'right' : undefined }}>{texto}</span>
}

function FilaTabla({ f }: { f: FilaPaso }) {
  return (
    <div className="grid items-center gap-[18px]" style={{ gridTemplateColumns: '76px minmax(0,1fr) 104px 158px', minHeight: 44, borderBottom: `1px solid ${C.lineaFila}` }}>
      <span className="font-mono text-[11.5px]" style={{ color: f.falta ? C.tenue : C.apagado }}>{f.k}</span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="text-[12.5px]" style={{ color: C.tinta }}>{f.d}</span>
        {f.sub && <span className="text-[11px]" style={{ color: C.tenue, lineHeight: 1.5 }}>{f.sub}</span>}
      </span>
      <span className="flex items-center justify-end gap-1.5 font-mono text-[12.5px]" style={{ color: C.tinta }}>
        {f.n ?? '—'}{f.u ? ` ${f.u}` : ''}
      </span>
      <span className="text-right font-mono text-[12px]" style={{ color: f.falta ? C.tenue : (f.disputa ? C.neg : C.tintaSuave) }}>{f.v ?? '—'}</span>
    </div>
  )
}
