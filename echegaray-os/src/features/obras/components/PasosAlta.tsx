'use client'

// ═══ EL ALTA EN PASOS — PORTE LITERAL DE `erp-obras/02b.html` Y `M03.html` (dueño, 23/09/2026) ═══
//
// Ocho pasos en una banda con número mono y tilde en los hechos; el cuerpo del paso a la izquierda
// (máx. 620px) y el «Estado de preparación» en un aside de 380px; «Guardar y seguir» amarilla de
// 32px con «Saltar este paso» y «Volver al principio» subrayados. En el teléfono (M03): la banda se
// desliza, un paso por pantalla, inputs de 44px y la primaria de 48px al pie sobre la barra.
//
// LOS PASOS SON NAVEGABLES HACIA ATRÁS Y HACIA ADELANTE una vez que la obra existe: la obra ya está
// guardada, así que saltar del 2 al 6 no puede perder nada. Antes de que exista, ninguno es
// alcanzable — no hay fila que editar.
//
// Es un módulo de CLIENTE porque el formulario necesita `useActionState` para dibujar la primaria del
// diseño (y no la del `FormAccion` genérico), y porque el teléfono se decide por el ancho real.

import Link from 'next/link'
import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { Ico, P } from './canon/Ico'
import { C, MONO } from './canon/tokens'
import { useAnchoVentana } from './useAnchoVentana'
import { esAngosto } from '../services/anchoPantalla'
import { PASOS, urlPaso, type PasoAlta } from '../services/alta'
import type { LineaPreparacion } from '../services/preparacion'

type Resultado = { ok: true; id?: string; mensaje?: string } | { ok: false; error: string }

/** El ancho lo decide la ventana real, una sola vez, y lo consumen las piezas de abajo. */
export function useTelefono(): boolean {
  return esAngosto(useAnchoVentana())
}

// ── LA CABECERA: «‹ Obras» · «OB-0027 · Nombre» · subtítulo ─────────────────

export function CabeceraAlta({ titulo, subtitulo, volverHref, volverTexto }: {
  titulo: string; subtitulo: string; volverHref: string; volverTexto: string
}) {
  const telefono = useTelefono()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: telefono ? '3px' : '5px' }}>
      <Link href={volverHref} prefetch={false} data-testid="volver-obras"
        style={{ fontSize: telefono ? '11.5px' : '12px', color: C.tenue, display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none' }}>
        <Ico d={P.izquierda} s={telefono ? 11 : 12} />{volverTexto}
      </Link>
      <div style={{ fontSize: telefono ? '17px' : '19px', fontWeight: 600, letterSpacing: '-.01em', color: C.tinta }} data-testid="titulo-alta">{titulo}</div>
      {!telefono && <div style={{ fontSize: '13px', color: C.tintaSuave }}>{subtitulo}</div>}
    </div>
  )
}

// ── LA BANDA DE PASOS ───────────────────────────────────────────────────────

export function BandaDePasos({ obraId, actual, hechos }: {
  obraId: string | null
  actual: PasoAlta
  hechos: Set<PasoAlta>
}) {
  const telefono = useTelefono()
  return (
    <ol data-testid="pasos-alta" style={{
      display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${C.borde}`, listStyle: 'none', margin: 0,
      padding: 0, ...(telefono ? { overflowX: 'auto', margin: '0 -16px', padding: '0 8px', scrollbarWidth: 'none' } : {}),
    }}>
      {PASOS.map((p, k) => {
        const esActual = p.id === actual
        const hecho = hechos.has(p.id)
        const alcanzable = Boolean(obraId) && !esActual
        const estilo = {
          display: 'flex', alignItems: 'center', gap: telefono ? '5px' : '7px', padding: telefono ? '9px 8px' : '9px 12px',
          fontSize: '12.5px', whiteSpace: 'nowrap' as const, textDecoration: 'none',
          color: esActual ? C.tinta : hecho ? C.tintaMedia : C.tintaSuave,
          fontWeight: esActual ? (telefono ? 600 : 500) : 400,
          boxShadow: esActual ? `inset 0 -2px 0 ${C.grafito}` : undefined,
        }
        const contenido = (
          <>
            <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue }}>{k + 1}</span>
            {p.label}
            {hecho && !esActual && <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.ok} s={11} /></span>}
          </>
        )
        return (
          <li key={p.id} data-testid={`paso-${p.id}`} data-hecho={hecho ? '1' : undefined} aria-current={esActual ? 'step' : undefined}>
            {alcanzable
              ? <Link href={urlPaso(obraId, p.id)} prefetch={false} style={estilo}>{contenido}</Link>
              : <span style={estilo}>{contenido}</span>}
          </li>
        )
      })}
    </ol>
  )
}

// ── EL CUERPO + ASIDE ───────────────────────────────────────────────────────

export function CuerpoYAside({ cuerpo, aside }: { cuerpo: ReactNode; aside: ReactNode }) {
  const telefono = useTelefono()
  if (telefono) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {cuerpo}
        {aside}
      </div>
    )
  }
  // La grilla de escritorio sólo se dibuja por encima de los 640px del teléfono; entre 640 y una
  // ventana angosta scrollea POR DENTRO y la página nunca se corre de costado.
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: '64px', alignItems: 'start', paddingTop: '8px', minWidth: '600px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '620px' }}>{cuerpo}</div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{aside}</aside>
      </div>
    </div>
  )
}

/** El envoltorio de la página: 26px 30px 40px en escritorio; 16px en el teléfono con lugar para la
 *  primaria fija de abajo. */
export function MarcoAlta({ children, conPrimariaFija }: { children: ReactNode; conPrimariaFija: boolean }) {
  const telefono = useTelefono()
  return (
    <div style={telefono
      ? { padding: '16px', paddingBottom: conPrimariaFija ? '96px' : '16px', display: 'flex', flexDirection: 'column', gap: '14px', background: C.superficie }
      : { padding: '26px 30px 40px', display: 'flex', flexDirection: 'column', gap: '22px', background: C.superficie, flex: 1 }}
      data-testid="alta-obra">
      {children}
    </div>
  )
}

/** Título 15px/600 + ayuda 12.5px del paso. */
export function TituloPaso({ paso }: { paso: PasoAlta }) {
  const def = PASOS.find((p) => p.id === paso)
  const telefono = useTelefono()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: telefono ? '3px' : '4px' }} data-testid={`cuerpo-${paso}`}>
      <div style={{ fontSize: '15px', fontWeight: 600, color: C.tinta }}>{def?.label}</div>
      <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>{def?.ayuda}</div>
    </div>
  )
}

// ── LOS CAMPOS: rótulo 12px + control 34px (44 en el teléfono) ──────────────

export function CampoAlta({ rotulo, children, mono = false }: { rotulo: string; children: ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: mono ? MONO : undefined }}>
      <div style={{ fontSize: '12px', color: C.tintaSuave, fontFamily: 'inherit' }}>{rotulo}</div>
      {children}
    </div>
  )
}

/** El estilo de un `<input>` o `<select>` del alta. `sin cargar` va como placeholder en itálica. */
export function useEstiloControl(): React.CSSProperties {
  const telefono = useTelefono()
  return {
    height: telefono ? '44px' : '34px', display: 'flex', alignItems: 'center', padding: telefono ? '0 12px' : '0 11px',
    border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', fontSize: telefono ? '14px' : '13px', color: C.tinta,
    background: C.superficie, fontFamily: 'inherit', width: '100%', outline: 'none', boxSizing: 'border-box',
  }
}

export function InputAlta(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const estilo = useEstiloControl()
  return <input {...props} placeholder={props.placeholder ?? 'sin cargar'} style={{ ...estilo, ...props.style }} />
}

export function SelectAlta(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const estilo = useEstiloControl()
  return <select {...props} style={{ ...estilo, ...props.style }} />
}

/** Dos campos por renglón en escritorio (02b «Inicio previsto · Fin previsto»); uno en el teléfono. */
export function GrillaCampos({ children }: { children: ReactNode }) {
  const telefono = useTelefono()
  return (
    <div style={telefono
      ? { display: 'flex', flexDirection: 'column', gap: '14px' }
      : { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>{children}</div>
  )
}

// ── EL FORMULARIO DEL PASO, con la primaria del diseño ──────────────────────

/** Un enlace subrayado del pie: «Saltar este paso», «Volver al principio». */
export function EnlacePaso({ href, children, testid }: { href: string; children: ReactNode; testid?: string }) {
  return (
    <Link href={href} prefetch={false} data-testid={testid}
      style={{ fontSize: '12.5px', color: C.tintaSuave, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
      {children}
    </Link>
  )
}

export function FormPaso({ accion, children, enviar = 'Guardar y seguir', testid, limpiarAlOk = false, mensajeOk = 'Guardado.', enlaces }: {
  accion: (form: FormData) => Promise<Resultado>
  children: ReactNode
  enviar?: string
  testid: string
  limpiarAlOk?: boolean
  mensajeOk?: string
  /** «Saltar este paso» · «Volver al principio». */
  enlaces?: ReactNode
}) {
  const telefono = useTelefono()
  const ref = useRef<HTMLFormElement>(null)
  const [estado, ejecutar, pendiente] = useActionState<Resultado | null, FormData>((_p, form) => accion(form), null)

  // EL FORMULARIO SE VACÍA CUANDO GUARDÓ, NO CUANDO SE MANDÓ (ver `FormAccion`): React 19 limpia
  // solo todo `<form action>` al terminar la acción, haya guardado o no.
  function enviarFormulario(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const datos = new FormData(e.currentTarget)
    startTransition(() => ejecutar(datos))
  }
  useEffect(() => { if (estado?.ok && limpiarAlOk) ref.current?.reset() }, [estado, limpiarAlOk])

  const mensajes = (
    <>
      {estado?.ok === true && <span data-testid={`${testid}-ok`} style={{ fontSize: '12px', color: C.pos }}>{estado.mensaje ?? mensajeOk}</span>}
      {estado?.ok === false && <span data-testid={`${testid}-error`} style={{ fontSize: '12px', color: C.neg }}>{estado.error}</span>}
    </>
  )
  const boton = (
    <button type="submit" form={testid} disabled={pendiente} data-testid={`${testid}-enviar`} style={{
      height: telefono ? '48px' : '32px', padding: telefono ? 0 : '0 14px', border: 0, borderRadius: '6px', background: C.marca,
      color: C.grafito, font: 'inherit', fontFamily: 'inherit', fontSize: telefono ? '14px' : '13px', fontWeight: 600, cursor: pendiente ? 'wait' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: telefono ? '8px' : '7px', width: telefono ? '100%' : undefined,
      opacity: pendiente ? .7 : 1,
    }}><Ico d={P.ok} s={telefono ? 15 : 13} />{pendiente ? 'Guardando…' : enviar}</button>
  )

  return (
    <form ref={ref} id={testid} onSubmit={enviarFormulario} data-testid={testid}
      style={{ display: 'flex', flexDirection: 'column', gap: telefono ? '14px' : '22px' }}>
      {children}
      {telefono ? (
        <>
          <div style={{ display: 'flex', gap: '18px', fontSize: '12.5px', color: C.tintaSuave, flexWrap: 'wrap' }}>{enlaces}{mensajes}</div>
          <PrimariaFija>{boton}</PrimariaFija>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>{boton}{enlaces}{mensajes}</div>
      )}
    </form>
  )
}

/** La primaria de 48px al pie del teléfono, sobre la barra (M03). */
export function PrimariaFija({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: C.superficie, borderTop: `1px solid ${C.borde}`, zIndex: 19 }}>
      {children}
    </div>
  )
}

/** Un enlace que pesa como la primaria (el «Ir a la obra» de Confirmar). */
export function PrimariaEnlace({ href, children, testid }: { href: string; children: ReactNode; testid?: string }) {
  const telefono = useTelefono()
  const a = (
    <Link href={href} prefetch={false} data-testid={testid} style={{
      height: telefono ? '48px' : '32px', padding: telefono ? 0 : '0 14px', borderRadius: '6px', background: C.marca, color: C.grafito,
      fontSize: telefono ? '14px' : '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '7px', textDecoration: 'none', width: telefono ? '100%' : 'fit-content',
    }}><Ico d={P.ok} s={telefono ? 15 : 13} />{children}</Link>
  )
  return telefono ? <PrimariaFija>{a}</PrimariaFija> : a
}

// ── LA LISTA DE PREPARACIÓN (aside) ─────────────────────────────────────────

/** Las filas del «Estado de preparación» del diseño: 40px (44 en el teléfono), tilde verde o «·»,
 *  título de 104px (92), el faltante concreto y el chevron sólo donde hay trabajo. */
export function ListaPreparacion({ lineas, pendientes }: { lineas: LineaPreparacion[]; pendientes: number }) {
  const telefono = useTelefono()
  const resumen = pendientes === 0 ? 'Preparación completa' : `${pendientes} de ${lineas.length} pendientes`
  return (
    <section data-testid="preparacion" style={{ display: 'flex', flexDirection: 'column', gap: telefono ? '8px' : '12px', paddingTop: telefono ? '6px' : 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', justifyContent: telefono ? 'space-between' : undefined }}>
        <div style={{ fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }}>Estado de preparación</div>
        <div style={{ fontSize: telefono ? '12px' : '11.5px', color: telefono ? C.tintaSuave : C.tenue }} data-testid="preparacion-cuenta">{resumen}</div>
      </div>
      <ul data-testid="checklist-preparacion" style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.borde}`, listStyle: 'none', margin: 0, padding: 0 }}>
        {lineas.map((l) => (
          <li key={l.clave} data-testid={`preparacion-${l.clave}`} data-listo={l.listo ? 'si' : 'no'}>
            <Link href={l.href} prefetch={false} style={{
              height: telefono ? '44px' : '40px', display: 'flex', alignItems: 'center', gap: telefono ? '10px' : '12px',
              borderBottom: `1px solid ${C.bordeTarjeta}`, fontSize: '13px', textDecoration: 'none', color: C.tinta,
            }}>
              <span style={{ width: '12px', display: 'flex', justifyContent: 'center', color: l.listo ? C.pos : C.tenue }} aria-hidden>
                {l.listo ? <Ico d={P.ok} s={12} /> : '·'}
              </span>
              <span style={{ width: telefono ? '92px' : '104px', color: C.tintaSuave, flexShrink: 0 }}>{l.titulo}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: l.listo ? C.tenue : C.tinta }}>{l.detalle}</span>
              {!l.listo && <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.derecha} s={12} /></span>}
            </Link>
          </li>
        ))}
      </ul>
      {!telefono && (
        <div style={{ fontSize: '12.5px', color: C.tenue }}>Lo pendiente no bloquea: la obra ya está en la cartera, en Previo.</div>
      )}
    </section>
  )
}
