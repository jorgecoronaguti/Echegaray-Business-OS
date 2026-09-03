'use client'

// LA COLUMNA DERECHA — el presupuesto formándose, porte de «Presupuestos v5 · Lectura del plano»
// (líneas 139-212). Certeza arriba, el cómputo agrupado por paso en el medio, la cascada y el
// precio abajo. Clic en el pie de un paso filtra esta columna a ESE paso — el filtro vive en el
// padre porque el pie que lo dispara está en la columna de al lado.

import { C } from '@/shared/components/canon'
import {
  certezaMonetaria, filtrarComputo, formatoMillones, formatoPesos, pctSobreCostoDirecto,
  type Cascada, type Computo, type PasoTrabajo,
} from '../services/trabajoLectura'
import { GrupoComputo } from './GrupoComputo'

export function PresupuestoEnFormacion({
  pasos, computo, cascada, filtro, listo, presupuestoId, onQuitarFiltro, onDerivar,
}: {
  pasos: PasoTrabajo[]
  computo: Computo | null
  cascada: Cascada | null
  filtro: string | null
  listo: boolean
  presupuestoId: string | null
  onQuitarFiltro: () => void
  onDerivar: () => void
}) {
  const cm = certezaMonetaria(pasos, computo)
  const totalPartidas = pasos.reduce((a, p) => a + p.deriva.partidas, 0)
  const grupos = filtrarComputo(computo, filtro)
  const pasoFiltrado = filtro ? pasos.find((p) => p.id === filtro) : null

  return (
    <div className="flex flex-1 flex-col" style={{ minWidth: 0, background: C.superficieTenue, minHeight: 0 }}>
      <CabeceraCerteza cm={cm} totalPartidas={totalPartidas} />

      {pasoFiltrado && (
        <div className="flex flex-none items-center gap-3.5" style={{ background: C.superficie, borderBottom: `1px solid ${C.linea}`, padding: '11px 26px' }} data-testid="banner-filtro">
          <span className="text-[12px]" style={{ color: C.tintaSuave }}>Solo las partidas del paso {pasoFiltrado.etiqueta}</span>
          <div className="flex-1" />
          <span role="button" onClick={onQuitarFiltro} className="cursor-pointer text-[12px]" style={{ color: C.tintaSuave, borderBottom: `1px solid ${C.lineaFuerte}` }}>
            Ver todo el cómputo
          </span>
        </div>
      )}

      <div className="flex-1 overflow-auto" style={{ padding: '8px 26px 24px', minHeight: 0 }} data-testid="lista-computo">
        {grupos.length === 0 && (
          <p className="pt-6 text-[12.5px]" style={{ color: C.tenue }}>Todavía no hay partidas derivadas.</p>
        )}
        {grupos.map((g) => <GrupoComputo key={g.pasoId} g={g} />)}
      </div>

      <PieCascada cascada={cascada} listo={listo} presupuestoId={presupuestoId} onDerivar={onDerivar} />
    </div>
  )
}

function CabeceraCerteza({ cm, totalPartidas }: { cm: ReturnType<typeof certezaMonetaria>; totalPartidas: number }) {
  return (
    <div className="flex flex-none items-center gap-6" style={{ background: C.superficie, borderBottom: `1px solid ${C.linea}`, padding: '18px 26px' }} data-testid="cabecera-certeza">
      <span className="flex flex-col gap-[7px]" style={{ minWidth: 230 }}>
        <span className="flex overflow-hidden rounded" style={{ height: 6, background: C.lineaFila }}>
          <span className="block h-full" style={{ width: `${cm.pctFirme}%`, background: C.grafito }} />
          <span className="block h-full" style={{ width: `${cm.pctDisputa}%`, background: C.neg }} />
        </span>
        <span className="text-[11.5px]" style={{ color: C.apagado }}>{totalPartidas} partida{totalPartidas === 1 ? '' : 's'} derivada{totalPartidas === 1 ? '' : 's'}</span>
      </span>
      <Estadistica rotulo="COSTO FIRME" valor={formatoMillones(cm.firme) ?? 'sin datos'} />
      <Estadistica rotulo="EN DISPUTA" valor={cm.disputa ? formatoMillones(cm.disputa)! : 'nada'} color={cm.disputa ? C.neg : undefined} />
      <Estadistica rotulo="SIN COTIZAR" valor={`${cm.sinCotizar} ${cm.sinCotizar === 1 ? 'ítem' : 'ítems'}`} />
    </div>
  )
}

function Estadistica({ rotulo, valor, color }: { rotulo: string; valor: string; color?: string }) {
  return (
    <span className="flex flex-col gap-[5px]">
      <span className="text-[10px] font-semibold" style={{ letterSpacing: '.08em', color: C.tenue }}>{rotulo}</span>
      <span className="font-mono text-[12.5px]" style={{ color: color ?? C.tinta }}>{valor}</span>
    </span>
  )
}

function PieCascada({ cascada, listo, presupuestoId, onDerivar }: {
  cascada: Cascada | null; listo: boolean; presupuestoId: string | null; onDerivar: () => void
}) {
  return (
    <div className="flex flex-none flex-col" style={{ background: C.superficie, borderTop: `1px solid ${C.linea}`, padding: '16px 26px 20px', gap: 2 }}>
      {cascada ? <FilasCascada c={cascada} /> : (
        <p className="py-2 text-[12px]" style={{ color: C.tenue }} data-testid="cascada-vacia">La cascada aparece cuando haya costo directo firme.</p>
      )}
      <div className="mt-3.5 flex items-center gap-[18px]">
        <span className="flex-1 text-[11.5px]" style={{ minWidth: 0, color: C.apagado, lineHeight: 1.6, textWrap: 'pretty' }}>
          La venta se calcula solo sobre lo firme.
        </span>
        {listo && presupuestoId && (
          <span
            role="button" data-testid="derivar-cotizacion" onClick={onDerivar}
            className="flex-none cursor-pointer whitespace-nowrap rounded-[6px] px-[15px] py-2.5 text-[12.5px] font-semibold"
            style={{ color: C.grafito, background: C.marca }}
          >
            Derivar en cotización
          </span>
        )}
      </div>
    </div>
  )
}

function FilasCascada({ c }: { c: Cascada }) {
  if (!c) return null
  // Nombres reales de `cotizacion_cascada` (ver el comentario del tipo `Cascada`): no hay
  // «riesgo» en la cascada del motor — ese escalón nunca existió fuera del mockup.
  const filas: { k: string; pct: string | null; v: string | null; venta?: boolean }[] = [
    { k: 'Costo directo medido', pct: null, v: formatoPesos(c.costo_directo) },
    { k: 'Gastos generales', pct: pctSobreCostoDirecto(c.costo_directo, c.gastos_generales), v: formatoPesos(c.gastos_generales) },
    { k: 'Beneficio', pct: pctSobreCostoDirecto(c.costo_directo, c.beneficio), v: formatoPesos(c.beneficio) },
    { k: 'Financiero', pct: pctSobreCostoDirecto(c.costo_directo, c.financiero), v: formatoPesos(c.financiero) },
    { k: 'Precio de venta', pct: c.coeficiente_sin_iva ? `coef. ${c.coeficiente_sin_iva.toLocaleString('es-AR', { maximumFractionDigits: 3 })}` : null, v: formatoPesos(c.venta_final), venta: true },
  ]
  return (
    <>
      {filas.map((f) => (
        <div key={f.k} className="flex items-baseline gap-2.5" style={{ minHeight: 26, ...(f.venta ? { marginTop: 8, paddingTop: 10, borderTop: `1px solid ${C.linea}` } : {}) }}>
          <span className="text-[12px]" style={{ fontWeight: f.venta ? 600 : 400, fontSize: f.venta ? 12.5 : 12, color: C.tintaSuave }}>{f.k}</span>
          <span className="font-mono text-[11px]" style={{ color: C.tenue }}>{f.pct ?? ''}</span>
          <div className="flex-1" />
          <span className="font-mono" style={{ fontSize: f.venta ? 15 : 12.5, fontWeight: f.venta ? 600 : 400, color: f.venta ? C.tinta : C.tintaSuave }}>{f.v ?? 'sin dato'}</span>
        </div>
      ))}
    </>
  )
}
