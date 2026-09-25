'use client'

// ═══ 04c · PLANILLA — la grilla tarea × día hábil (diseño ERP Obras, 23/09/2026; sin .dc.html: va por
// la especificación del dueño) ═══
//
//   toolbar   ‹ 24/08 → 04/09 › en mono · tres toggles de 30 px con icono (Fracción % · Cantidad ·
//             Quién) · a la derecha Imprimir y Exportar como botones-icono de 30 px
//   grilla    34 px # · 1fr tarea · 84 uni·cant · 64 T·R (fecha · check) · 58 % · repeat(10, 76px)
//             encabezado «L 24/08» mono, separador semanal de 1 px; grupo 38 px uppercase con costo y
//             peso; tarea 52 px; celda con parte en fondo quiet y fracción mono 13,5; sin parte, vacía
//   pie       tareas con parte por día · a la derecha «N de M · ver el resto»
//   impresión sin header, A4 apaisado, una obra por hoja
//
// En el teléfono no hay grilla: «Esta planilla se usa en computadora» y la puerta al Parte diario.

import Link from 'next/link'
import { useMemo, useState, type CSSProperties } from 'react'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import { useAnchoVentana } from '../useAnchoVentana'
import {
  abreSemana, claveCelda, csvDePlanilla, filasDePlanilla, pieDeTareasConParte, recortar, rotuloDia, rotuloRango,
  textoCelda, textoPie, totalTareas, ventanaHabil, type CeldaPlanilla, type ControlDeTarea, type ModoCelda, type NodoWbs,
  type PesoDeHistoria,
} from './planillaObra.ts'

const COLS = '34px minmax(0,1fr) 84px 64px 58px repeat(10, 76px)'
const EYEBROW: CSSProperties = {
  fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase',
}
const BOTON_30: CSSProperties = {
  width: '30px', height: '30px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: `1px solid ${C.borde}`, borderRadius: '6px', background: C.superficie, color: C.tintaMedia, cursor: 'pointer',
  padding: 0, fontFamily: 'inherit',
}
const TOPE = 40

const MODOS: { id: ModoCelda; rotulo: string; icono: React.ReactNode }[] = [
  { id: 'fraccion', rotulo: 'Fracción %', icono: <Ico d={P.porcentaje} s={14} /> },
  { id: 'cantidad', rotulo: 'Cantidad', icono: <Ico d={P.cantidad} s={14} /> },
  { id: 'quien', rotulo: 'Quién', icono: <Ico d={P.cuadrilla} s={14} /> },
]

export function PlanillaGrilla({
  obraId, hoy, isodows, feriados, celdas, wbs, control, historias, personas, activos, fallas,
}: {
  obraId: string
  hoy: string
  isodows: number[]
  feriados: string[]
  celdas: CeldaPlanilla[]
  wbs: NodoWbs[]
  control: ControlDeTarea[]
  historias: PesoDeHistoria[]
  personas: { id: string; nombre: string }[]
  activos: { id: string; nombre: string }[]
  fallas: string[]
}) {
  const telefono = useAnchoVentana() < 768
  const [pagina, setPagina] = useState(0)
  const [modo, setModo] = useState<ModoCelda>('fraccion')
  // TODAS LAS TAREAS DE ENTRADA (25/09): con el tope de 40 la planilla de Quattropani cortaba en la 40 de 95 y
  // las de más abajo —los plegados de 57 y 16 ml del techo— no aparecían aunque el árbol las mostrara;
  // «ver el resto» abajo de todo no se ve. El recorte queda disponible pero no arranca puesto.
  const [todas, setTodas] = useState(true)

  const setFeriados = useMemo(() => new Set(feriados), [feriados])
  const dias = useMemo(() => ventanaHabil(hoy, pagina, isodows, setFeriados), [hoy, pagina, isodows, setFeriados])
  const grupos = useMemo(() => filasDePlanilla(wbs, control, historias), [wbs, control, historias])
  const total = totalTareas(grupos)
  const visibles = useMemo(() => (todas ? grupos : recortar(grupos, TOPE)), [grupos, todas])
  const mostradas = totalTareas(visibles)
  const porClave = useMemo(() => new Map(celdas.map((c) => [claveCelda(c.actividad_id, c.fecha), c])), [celdas])
  const objetivoDe = useMemo(() => new Map(control.map((c) => [c.actividad_id, c.cantidad_objetivo])), [control])
  const nombreDe = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of personas) m.set(p.id, p.nombre)
    for (const a of activos) m.set(a.id, a.nombre)
    return (id: string) => m.get(id)
  }, [personas, activos])
  const pie = useMemo(() => pieDeTareasConParte(celdas, dias), [celdas, dias])

  const celdaTexto = (actividadId: string, fecha: string) => {
    const c = porClave.get(claveCelda(actividadId, fecha))
    return c && c.n_partes > 0 ? textoCelda(c, modo, objetivoDe.get(actividadId) ?? null, nombreDe) : ''
  }

  function exportar() {
    const csv = csvDePlanilla(grupos, dias, celdaTexto)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `planilla-${obraId}-${dias[0] ?? ''}-${dias[dias.length - 1] ?? ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (telefono) {
    return (
      <div data-testid="planilla-solo-escritorio" style={{ padding: '24px 16px', fontSize: '13.5px', color: C.tintaSuave, lineHeight: 1.5 }}>
        Esta planilla se usa en computadora.{' '}
        <Link prefetch={false} href={`/obras/${obraId}?vista=tareas&sub=parte`} style={{ color: C.tinta, fontWeight: 500, textDecoration: 'underline' }}>
          Ir al Parte diario
        </Link>
      </div>
    )
  }

  return (
    <div data-testid="planilla-obra" className="planilla-imprimible" style={{ padding: '14px 20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <style>{`@media print {
        header, nav, [data-testid="barra-telefono"], [data-testid="subnav-trabajo"], [data-testid^="cabecera"], .no-imprimir { display: none !important; }
        @page { size: A4 landscape; margin: 10mm; }
        .planilla-imprimible { padding: 0 !important; page-break-after: always; }
      }`}</style>

      {fallas.length > 0 && (
        <div data-testid="planilla-lectura-fallida" style={{ fontSize: '12.5px', color: C.neg }}>
          No se pudo leer parte de la planilla: {fallas.join(' · ')}
        </div>
      )}

      {/* ── TOOLBAR ── */}
      <div className="no-imprimir" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: C.tintaSuave }}>
          <button type="button" aria-label="Dos semanas antes" data-testid="planilla-antes" onClick={() => setPagina((p) => p - 1)}
            style={{ ...BOTON_30, border: 'none', width: '22px' }}>‹</button>
          <span data-testid="planilla-rango" style={{ fontFamily: MONO, color: C.tinta, fontWeight: 500 }}>{rotuloRango(dias)}</span>
          <button type="button" aria-label="Dos semanas después" data-testid="planilla-despues" onClick={() => setPagina((p) => p + 1)}
            style={{ ...BOTON_30, border: 'none', width: '22px' }}>›</button>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {MODOS.map((m) => {
            const activo = modo === m.id
            return (
              <button key={m.id} type="button" title={m.rotulo} aria-label={m.rotulo} aria-pressed={activo}
                data-testid={`planilla-modo-${m.id}`} onClick={() => setModo(m.id)} style={{
                  ...BOTON_30, width: 'auto', padding: '0 9px', gap: '6px', fontSize: '12px',
                  border: `1px solid ${activo ? C.grafito : C.borde}`, background: activo ? C.grafito : C.superficie,
                  color: activo ? C.superficie : C.tintaMedia,
                }}>{m.icono}{m.rotulo}</button>
            )
          })}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button type="button" title="Imprimir" aria-label="Imprimir" data-testid="planilla-imprimir" style={BOTON_30}
            onClick={() => window.print()}><Ico d={P.imprimir} s={14} /></button>
          <button type="button" title="Exportar" aria-label="Exportar" data-testid="planilla-exportar" style={BOTON_30}
            onClick={exportar}><Ico d={P.descargar} s={14} /></button>
        </div>
      </div>

      {/* ── GRILLA ── */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: '1100px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, height: '32px', alignItems: 'center', borderBottom: `1px solid ${C.borde}`, ...EYEBROW }}>
            <div>#</div><div>Tarea</div><div>Uni · cant</div><div>T · R</div><div>%</div>
            {dias.map((d, i) => (
              <div key={d} style={{ textAlign: 'center', letterSpacing: 0, borderLeft: abreSemana(dias, i) ? `1px solid ${C.borde}` : 'none', textTransform: 'none', color: d === hoy ? C.tinta : C.tenue }}>
                {rotuloDia(d)}
              </div>
            ))}
          </div>

          {grupos.length === 0 && (
            <div data-testid="planilla-vacia" style={{ padding: '16px 0', fontSize: '12.5px', color: C.tenue }}>
              Esta obra todavía no tiene tareas cargadas.
            </div>
          )}

          {visibles.map((g) => (
            <div key={g.id}>
              <div data-testid={`planilla-grupo-${g.id}`} style={{
                display: 'grid', gridTemplateColumns: COLS, height: '38px', alignItems: 'center', borderBottom: `1px solid ${C.borde}`,
                fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase', color: C.tintaMedia, fontWeight: 600,
              }}>
                <div style={{ fontFamily: MONO, letterSpacing: 0, color: C.tenue }}>{g.numero}</div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.nombre}</div>
                <div style={{ gridColumn: 'span 2', fontFamily: MONO, letterSpacing: 0, textTransform: 'none', fontWeight: 400, color: C.tintaSuave, fontSize: '11.5px' }}>{g.costo}</div>
                <div style={{ fontFamily: MONO, letterSpacing: 0, textTransform: 'none', fontWeight: 400, color: C.tintaSuave, fontSize: '11.5px' }}>{g.peso}</div>
                {dias.map((d, i) => <div key={d} style={{ height: '100%', borderLeft: abreSemana(dias, i) ? `1px solid ${C.borde}` : 'none' }} />)}
              </div>
              {g.tareas.map((t) => (
                <div key={t.id} data-testid={`planilla-tarea-${t.id}`} style={{
                  display: 'grid', gridTemplateColumns: COLS, height: '52px', alignItems: 'center', borderBottom: `1px solid ${C.bordeFila}`, fontSize: '13px',
                }}>
                  <div style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue }}>{t.numero}</div>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>{t.nombre}</div>
                  <div style={{ fontSize: '11.5px', color: t.uniCant === 'sin medición' ? C.tenue : C.tintaSuave, fontVariantNumeric: 'tabular-nums' }}>{t.uniCant}</div>
                  <div style={{ display: 'flex', gap: '8px', color: C.tenue }}>
                    <span title={t.tienePlan ? 'Con fechas de plan' : 'Sin fechas'} style={{ display: 'flex', color: t.tienePlan ? C.tintaMedia : C.fantasma }}><Ico d={P.fecha} s={13} /></span>
                    <span title={t.terminada ? 'Terminada' : 'Sin terminar'} style={{ display: 'flex', color: t.terminada ? C.pos : C.fantasma }}><Ico d={P.ok} s={13} w={2.2} /></span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: '12px', color: t.pct === '—' ? C.tenue : C.tinta }}>{t.pct}</div>
                  {dias.map((d, i) => {
                    const texto = celdaTexto(t.id, d)
                    return (
                      <div key={d} data-testid={`celda-${t.id}-${d}`} style={{
                        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderLeft: abreSemana(dias, i) ? `1px solid ${C.borde}` : 'none',
                        background: texto ? C.tenueFondo : 'transparent', fontFamily: MONO, fontSize: '13.5px', color: C.tinta,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px',
                      }}>{texto}</div>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}

          {/* ── PIE ── */}
          {grupos.length > 0 && (
            <div data-testid="planilla-pie" style={{ display: 'grid', gridTemplateColumns: COLS, height: '38px', alignItems: 'center', borderTop: `1px solid ${C.borde}` }}>
              <div />
              <div style={{ gridColumn: 'span 4', fontSize: '12px', color: C.tintaSuave }}>tareas con parte por día</div>
              {pie.map((n, i) => (
                <div key={dias[i]} style={{ textAlign: 'center', fontFamily: MONO, fontSize: '12.5px', color: n === '—' ? C.tenue : C.tinta, borderLeft: abreSemana(dias, i) ? `1px solid ${C.borde}` : 'none', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {grupos.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '12px', color: C.tintaSuave }}>
          {mostradas < total
            ? (
              <button type="button" data-testid="planilla-ver-resto" onClick={() => setTodas(true)} style={{
                border: 'none', background: 'none', padding: 0, font: 'inherit', color: C.tinta, cursor: 'pointer', textDecoration: 'underline',
              }}>{textoPie(mostradas, total)}</button>
              )
            : <span data-testid="planilla-cuenta">{textoPie(mostradas, total)}</span>}
        </div>
      )}
    </div>
  )
}
