'use client'

// C01 · MC1 — TRABAJO · OBRA SIN ESTRUCTURA. Porte literal de `C01.html` (1440) y `MC1.html` (390).
//
//   escritorio  `padding:40px 30px 44px`, columna de 28px de gap, `max-width:1120px`
//               título 19/600 · bajada 13,5 muted
//               dos tarjetas de 372 (serie B: sin «Pegar la planilla»), `padding:22px 22px 20px`, radio 10, `min-height:190`,
//               la primera con borde grafito; ícono 20 · rótulo 11 faint · título 15/600 ·
//               texto 12,5 muted 1.5 · «Empezar →» / «Elegir →» 13/500
//               pie: tres datos 12,5 muted con círculo hueco, línea arriba, `padding-top:18px`
//   teléfono    `padding:16px`, gap 16; título 17/600 · bajada 12,5; tres filas de 72px con
//               ícono 18, título 14/600, bajada 12 muted y chevron; pie 12,5 con dos datos

import { TOQUE_44 } from '../../canon/toque'
import Link from 'next/link'
import { C } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { Falta } from './Piezas'

export function EstadoVacio({ obraId, presupuesto, lineaBaseSellada, diasHabiles, plazo, puedeVincular = false }: {
  obraId: string
  /** Dirección y Administración: el presupuesto es precio. Ven «Vincular uno» y «Crear presupuesto». */
  puedeVincular?: boolean
  /** «PR-0042 · R03 · 19 partidas»; null = sin presupuesto vinculado. */
  presupuesto: { rotulo: string; nPartidas: number } | null
  lineaBaseSellada: boolean
  diasHabiles: number | null
  /** «24/08 → 22/09»; null = sin plazo. */
  plazo: string | null
}) {
  const base = `/obras/${obraId}?vista=tareas&sub=arbol`
  // Serie B (C01 · MC1 del diseño «De cero al final»): DOS puertas. «Pegar la planilla» salió del diseño;
  // su ruta (`&crear=planilla`) sigue andando para quien la tenga guardada. Sin presupuesto vinculado,
  // la puerta del presupuesto se dibuja apagada y dice por qué.
  const opciones = [
    {
      id: 'mano', href: `${base}&crear=mano`, icono: P.editar, rotulo: null as string | null,
      titulo: 'Armar a mano',
      texto: 'Un rubro, y adentro lo demás. Enter agrega hermano, Tab baja un nivel.',
      bajada: 'un rubro y adentro lo demás', accion: 'Empezar', destacada: true, apagada: false,
    },
    {
      id: 'presupuesto', href: `${base}&crear=presupuesto`, icono: P.base,
      rotulo: presupuesto ? `${presupuesto.rotulo} · ${presupuesto.nPartidas} partidas` : 'sin presupuesto vinculado',
      titulo: 'Desde el presupuesto',
      texto: 'Las partidas cotizadas pasan a historias con su unidad, cantidad y HH del análisis. La cantidad se conserva o no genera.',
      bajada: presupuesto ? `${presupuesto.rotulo} · ${presupuesto.nPartidas} partidas` : 'esta obra no tiene un presupuesto vinculado',
      accion: presupuesto ? 'Empezar' : 'Apagado', destacada: false, apagada: !presupuesto,
    },
  ]
  const circulo = <Ico d={P.pend} s={12} />
  // EL MÓDULO EXISTE (revisión por nivel, 25/09): sin presupuesto vinculado se dice eso y se ofrece
  // vincular uno existente (el campo «Obra» del presupuesto) o crearlo. Quien no ve precio, lo sabe.
  const vincular = (tel: boolean) => puedeVincular ? (
    <span style={{ display: 'inline-flex', gap: '14px', fontSize: tel ? '12.5px' : '13px', fontWeight: 500 }} data-testid={tel ? 'vincular-presupuesto-telefono' : 'vincular-presupuesto'}>
      <Link href="/presupuestos" prefetch={false} className={TOQUE_44} style={{ color: C.tinta, textDecoration: 'underline' }}>Vincular uno</Link>
      <Link href="/presupuestos/nuevo" prefetch={false} className={TOQUE_44} style={{ color: C.tinta, textDecoration: 'underline' }}>Crear presupuesto</Link>
    </span>
  ) : <span style={{ fontSize: '12.5px', color: C.tenue }}>lo vincula Administración</span>
  return (
    <>
      {/* ═══ ESCRITORIO (C01) ═══ */}
      <div className="hidden md:flex" data-testid="estado-vacio" style={{ padding: '40px 30px 44px', flexDirection: 'column', gap: '28px', maxWidth: '1120px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '19px', fontWeight: 600, letterSpacing: '-.01em', color: C.tinta }}>Esta obra todavía no tiene trabajo cargado</div>
          <div style={{ fontSize: '13.5px', color: C.tintaSuave }}>Rubro › épica › historia › tarea › subtarea. {presupuesto ? 'Se arma a mano o desde el presupuesto; se pueden mezclar.' : 'Se arma a mano; el presupuesto llegará después.'}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 372px)', gap: '16px' }}>
          {opciones.map((o) => (
            <Tarjeta key={o.id} href={o.apagada ? null : o.href} testid={`crear-${o.id}`} style={{
              display: 'flex', flexDirection: 'column', gap: '12px', padding: '22px 22px 20px', minHeight: '232px', textDecoration: 'none',
              border: `1px solid ${o.destacada ? C.grafito : C.borde}`, borderRadius: '10px', color: o.apagada ? C.tenue : C.tinta, cursor: o.apagada ? 'default' : 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: o.apagada ? C.tenue : C.tintaMedia, display: 'flex' }}><Ico d={o.icono} s={20} /></span>
                {o.rotulo && <span style={{ fontSize: '11px', color: C.tenue }}>{o.rotulo}</span>}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>{o.titulo}</div>
              <div style={{ fontSize: '12.5px', color: o.apagada ? C.tenue : C.tintaSuave, lineHeight: 1.5, flex: 1 }}>{o.texto}</div>
              {o.apagada ? vincular(false) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: C.tinta }}>
                  {o.accion}<Ico d={P.flecha} s={13} />
                </div>
              )}
            </Tarjeta>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '28px', fontSize: '12.5px', color: C.tintaSuave, borderTop: `1px solid ${C.borde}`, paddingTop: '18px', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>{circulo}Presupuesto vinculado:{' '}
            {presupuesto ? <b style={{ fontWeight: 500, color: C.tinta }}>{presupuesto.rotulo}</b> : <Falta>sin presupuesto</Falta>}</span>
          <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>{circulo}Línea base:{' '}
            {lineaBaseSellada ? <b style={{ fontWeight: 500, color: C.tinta }}>sellada</b> : <Falta>sin sellar</Falta>}</span>
          <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>{circulo}Etapa: Previo hasta que se selle</span>
        </div>
      </div>

      {/* ═══ TELÉFONO (MC1) ═══ */}
      <div className="flex md:hidden" data-testid="estado-vacio-telefono" style={{ padding: '16px 16px 100px', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-.01em', color: C.tinta }}>Todavía no hay trabajo cargado</div>
          <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>Rubro › épica › historia › tarea › subtarea</div>
        </div>
        {opciones.map((o) => (
          <Tarjeta key={o.id} href={o.apagada ? null : o.href} testid={`crear-telefono-${o.id}`} style={{
            display: 'flex', alignItems: 'center', gap: '12px', minHeight: '72px', padding: '12px 14px', textDecoration: 'none',
            border: `1px solid ${o.destacada ? C.grafito : C.borde}`, borderRadius: '8px', color: o.apagada ? C.tenue : C.tinta,
          }}>
            <span style={{ color: C.tintaMedia, display: 'flex' }}><Ico d={o.icono} s={18} /></span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{o.titulo}</div>
              <div style={{ fontSize: '12px', color: C.tintaSuave }}>{o.bajada}</div>
              {/* MC1: la tarjeta es de una línea; las dos puertas van DEBAJO, no al costado (a 390 aplastaban el título en cuatro renglones). */}
              {o.apagada && <div style={{ marginTop: '6px' }}>{vincular(true)}</div>}
            </div>
            {!o.apagada && <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.derecha} s={14} /></span>}
          </Tarjeta>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px', color: C.tintaSuave, borderTop: `1px solid ${C.borde}`, paddingTop: '14px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>{circulo}Línea base {lineaBaseSellada ? 'sellada' : <Falta>sin sellar</Falta>}</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>{circulo}
            {diasHabiles != null ? `${diasHabiles} días hábiles` : <Falta>sin días hábiles</Falta>}{plazo ? ` · ${plazo}` : ''}
          </div>
        </div>
      </div>
    </>
  )
}

/** Una puerta: enlace si se puede entrar, bloque quieto si no (adentro puede llevar sus propios enlaces). */
function Tarjeta({ href, testid, style, children }: { href: string | null; testid: string; style: React.CSSProperties; children: React.ReactNode }) {
  if (!href) return <div data-testid={testid} aria-disabled style={style}>{children}</div>
  return <Link href={href} prefetch={false} data-testid={testid} style={style}>{children}</Link>
}
