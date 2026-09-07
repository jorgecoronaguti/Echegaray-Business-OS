'use client'

// ═══ 01 · OBRAS CARTERA — PORTE LITERAL DE «01 · Obras Cartera.dc.html» ═══
//
// Cada medida de este archivo salió de ese mockup y no del design system: 246px el buscador, 38px
// el encabezado, 48px la fila, `minmax(0,1.5fr) minmax(0,1.1fr) 152px 148px 82px 108px 44px 52px
// 26px` la grilla, 10px el radio de la tarjeta. Las cuatro entregas anteriores tradujeron esos
// valores al DS y el dueño las rechazó las cuatro: «estructura parecida, aspecto distinto».
//
// ═══ QUÉ CAMBIA RESPECTO DE LA CARTERA QUE HABÍA ═══
//
// El zip dibuja NUEVE columnas —obra, cliente, estado, avance, plazo, HH, hoy, ⚠ y el «···»— y no
// dibuja ni ETAPA ni CONTRATADO ni COSTO REAL como columnas. Contratado sobrevive donde el zip lo
// pone: en el pie, que es donde se lee una vez y no trece.
//
// Buscar y filtrar son estado del CLIENTE, como en el mockup: son trece
// filas ya cargadas y una vuelta al servidor por tecla haría pegajosa la primera pantalla del día.
// La URL deja de gobernar la vista y por eso esta pantalla ya no ordena por columna: el zip no
// tiene encabezados que ordenen, y sostener el orden por URL con el filtro en el cliente eran dos
// memorias de la misma pantalla.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Ico, IcoMas, P } from './canon/Ico'
import { C, ESTILO_PRIMARIA, MONO } from './canon/tokens'
import { Barra, Buscador, Chip, Hover, Pastilla, Tarjeta } from './canon/Piezas'
import {
  coincideTexto, colorDeBarra, colorDePlazo, diasDeAtraso, entraEnFiltro, esPrevio, estadoDeCartera,
  FILTROS_CARTERA, textoDePlazo, type FiltroCartera,
} from '../services/carteraCanon'

/** Lo que la página le entrega ya leído. Un tipo propio y no `ObraPanel`: así se ve de un vistazo
 *  qué necesita esta pantalla, y qué se rompe el día que la vista cambie. */
export interface FilaCartera {
  obra_id: string
  nombre: string
  cliente_slug: string | null
  cliente_nombre: string | null
  cliente_texto: string | null
  estado: string
  etapa: string | null
  avance_pct: number | null
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  forecast_fin: string | null
  monto_contratado: number | null
  hh_plan: number | null
  hh_real: number | null
  /** `null` = no se pudo leer si hay parte de hoy. Vacío ≠ «no cargó». */
  conParte: boolean | null
  /** `null` = no se pudo leer. Un control que no pudo mirar no dice «no hay». */
  impedimentos: number | null
}

const GRID = 'minmax(0,1.5fr) minmax(0,1.1fr) 152px 148px 82px 108px 44px 52px 26px'

/**
 * EL ANCHO POR DEBAJO DEL CUAL ESTA GRILLA DEJA DE SER LEGIBLE — 1.000px, y sale de sumar el GRID
 * de arriba, no del monitor de nadie: 612px de columnas fijas + 80px de los ocho gaps de 10px +
 * 28px del padding lateral = 720px que no ceden nunca. Lo único que se reparten `1.5fr` y `1.1fr`
 * es el resto, así que con 1.000px OBRA mide 161px y CLIENTE 118px, y con menos OBRA se va a cero.
 *
 * Eso es lo que pasaba en un teléfono de 390px: las dos columnas flexibles colapsaban, el nombre de
 * la obra y el cliente desaparecían, y los tres rótulos del encabezado se apilaban en el mismo
 * punto —se leía «OBRESTAADO»—. La cartera es la puerta de entrada al módulo desde el celular.
 *
 * NO SE DIBUJA UNA LISTA MÓVIL: el zip no tiene una y esta pantalla es un porte literal. La grilla
 * se queda igual y SCROLLEA POR DENTRO. El número es 1.000 y no los 1.240 que mide la tarjeta a
 * 1.280: la barra vertical se come ~15px del viewport, así que 1.240 haría aparecer una barra
 * horizontal en la pantalla del dueño —justo la fidelidad que este mínimo existe para proteger—.
 * A 1.280 y a 1.440 la tarjeta es más ancha que 1.000 y acá no cambia absolutamente nada.
 */
const MIN_TABLA = 1000
const ROTULO: React.CSSProperties = {
  fontSize: '10px', color: C.tenue, letterSpacing: '.05em', paddingBottom: '8px',
}
const N = (x: number) => Math.round(x).toLocaleString('es-AR')

/**
 * LA TABLA SCROLLEA POR DENTRO; LA PÁGINA NUNCA DE COSTADO (regla de geometría del porte).
 *
 * `overflowX:'auto'` no dibuja nada mientras el contenido entra: en escritorio esto es un `div` de
 * más y ni una barra. El pie de la tarjeta queda AFUERA a propósito —envuelve solo y se lee sin
 * arrastrar la tabla—.
 */
function Ancha({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: `${MIN_TABLA}px` }}>{children}</div>
    </div>
  )
}

/** «$ 29,6 M» — el `M()` del mockup, sin inventar precisión. */
function millones(v: number): string {
  return `$ ${(v / 1_000_000).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`
}

/** HH del zip: «612 / 1.496». Sin plan no se escribe «/ 0», y sin imputar no es cero horas. */
function textoHH(f: FilaCartera): { t: string; alerta: boolean } {
  if (f.hh_real == null && f.hh_plan == null) return { t: 'sin plan', alerta: true }
  if (f.hh_real == null) return { t: `sin imputar / ${N(f.hh_plan as number)}`, alerta: false }
  if (f.hh_plan == null) return { t: `${N(f.hh_real)} / sin plan`, alerta: true }
  return { t: `${N(f.hh_real)} / ${N(f.hh_plan)}`, alerta: f.hh_real > f.hh_plan }
}

export function CarteraObras({ obras, personasHoy, sinDato, esAdmin, pie }: {
  obras: FilaCartera[]
  /** `null` = nadie fichó o no se pudo leer; la página ya distinguió los dos casos en `pie`. */
  personasHoy: number | null
  /** Lo que no se pudo mirar, dicho con todas las letras debajo de la tabla. */
  sinDato: string[]
  esAdmin: boolean
  /** La línea de archivadas y de contratos sin cargar: información real que el mockup no dibuja. */
  pie?: React.ReactNode
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<FiltroCartera>('todo')

  const limpiar = () => { setQ(''); setFiltro('todo') }

  const lista = useMemo(
    () => obras.filter((o) => coincideTexto(o.nombre, o.cliente_nombre ?? o.cliente_texto, q)
      && entraEnFiltro(o, filtro, o.impedimentos)),
    [obras, q, filtro],
  )
  // LOS CONTADORES DE LOS CHIPS CUENTAN LA CARTERA, NO LO FILTRADO: un chip que dice «Previo 2»
  // tiene que seguir diciendo 2 después de tocar otro chip, o deja de ser un mapa de la cartera.
  const cuentas = useMemo(() => Object.fromEntries(
    FILTROS_CARTERA.map((f) => [f.k, obras.filter((o) => entraEnFiltro(o, f.k, o.impedimentos)).length]),
  ) as Record<FiltroCartera, number>, [obras])
  // UN CONTROL QUE NO PUDO MIRAR NO DICE CUÁNTOS. Con la lectura de impedimentos caída, el filtro
  // deja pasar todo —mostrar de más antes que esconder trabajo trabado— pero su chip NO puede
  // publicar ese número: diría «Con problema 13» sobre una cartera donde nadie contó nada.
  const sinImpedimentos = obras.some((o) => o.impedimentos == null)

  const enCurso = lista.filter((o) => o.estado === 'activa' && !esPrevio(o)).length
  const conContrato = lista.filter((o) => o.monto_contratado != null)
  const totalContratado = conContrato.reduce((s, o) => s + (o.monto_contratado ?? 0), 0)

  return (
    <div style={{ background: C.lienzo, display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* LA BARRA DE TÍTULO: 14px 20px 10px, y el conmutador y la primaria pegados a la derecha. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px 10px',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: '19px', fontWeight: 600, color: C.tinta }}>Obras</div>
        <Buscador valor={q} alCambiar={setQ} alLimpiar={limpiar} ancho={246}
          placeholder="Buscar obra o cliente" testid="buscar-obra" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {FILTROS_CARTERA.map((f) => (
            <Chip key={f.k} activo={filtro === f.k} onClick={() => setFiltro(f.k)}
              titulo={f.k === 'problema' && sinImpedimentos ? 'No se pudieron leer los impedimentos' : f.tip}
              n={f.k === 'problema' && sinImpedimentos ? null : String(cuentas[f.k])}
              icono={<Ico s={14} d={
                f.k === 'todo' ? P.todo : f.k === 'curso' ? P.hh
                  : f.k === 'atraso' ? P.alerta : f.k === 'problema' ? P.bloqueo : P.previo
              } />}>{f.t}</Chip>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* ═══ EL GANTT SE VE Y SE LLAMA GANTT (07/09/2026) ═══
              El dueño: *"necesito la vista gantt de todas las obras, esto ha sido quitado por vos"*.
              Acá había un cuadradito de 28px sin una palabra, cuyo `title` sólo aparece si el mouse
              se queda quieto encima —y en un teléfono no aparece nunca—: el único camino visible al
              Gantt era ninguno. Y no llevaba al Gantt: conmutaba a una SEGUNDA línea de tiempo
              dibujada dentro de esta pantalla, con otras fechas y sin semáforo ni marca de hoy.
              Ahora es un enlace con su nombre a `/obras/gantt`, que es la vista de la cartera sobre
              el calendario: una sola definición del plazo, y un camino que se ve. */}
          <Link prefetch={false} href="/obras/gantt" data-testid="conmutar-vista" title="Ver la cartera sobre el calendario"
            style={{
              height: '28px', padding: '0 10px', borderRadius: '6px', border: `1px solid ${C.borde}`,
              background: C.superficie, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '6px', fontSize: '12.5px', color: C.tintaMedia, textDecoration: 'none',
            }}>
            <Ico d={P.tiempo} s={15} />Gantt
          </Link>
          {/* SÓLO ADMINISTRACIÓN CREA OBRAS: la RLS lo rechaza igual, y un botón que falla es peor
              que un botón que no está. */}
          {esAdmin && (
            <Link prefetch={false} href="/obras/nueva" data-testid="alta-obra-nueva" style={ESTILO_PRIMARIA}>
              <Ico d={P.mas} s={14} w={2.2} />Nueva obra
            </Link>
          )}
        </div>
      </div>

      <div style={{ padding: '0 20px 20px' }}>
        {(
          <Tarjeta testid="portafolio-tabla">
            <Ancha>
              <div style={{
                display: 'grid', gridTemplateColumns: GRID, gap: '10px', alignItems: 'end',
                height: '38px', borderBottom: `1px solid ${C.borde}`, background: C.tenueFondo,
                padding: '0 14px',
              }}>
                <span style={ROTULO}>OBRA</span>
                <span style={ROTULO}>CLIENTE</span>
                <span style={ROTULO}>ESTADO</span>
                <span style={ROTULO}>AVANCE</span>
                <span style={{ ...ROTULO, textAlign: 'right' }}>PLAZO</span>
                <span style={{ ...ROTULO, textAlign: 'right' }}>HH</span>
                <span style={{ ...ROTULO, textAlign: 'center' }}>HOY</span>
                {/* EL ENCABEZADO DEL TRIÁNGULO ES EL TRIÁNGULO, como en el canon: la palabra
                    «Impedimentos» pedía tres veces el ancho de la columna que rotula. */}
                <span style={{ ...ROTULO, textAlign: 'center', color: C.tenue }} title="Impedimentos abiertos">
                  <Ico d={P.alerta} s={12} style={{ margin: '0 auto' }} />
                </span>
                <span />
              </div>

              {lista.map((o) => <Fila key={o.obra_id} o={o} ir={() => router.push(`/obras/${o.obra_id}`)} />)}

              {lista.length === 0 && (
                <div style={{ padding: '26px 14px', fontSize: '12.5px', color: C.tintaSuave }}>
                  Nada coincide.{' '}
                  <button type="button" onClick={limpiar} data-testid="ver-todo"
                    style={{
                      color: C.tinta, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline',
                      border: 'none', background: 'none', font: 'inherit', padding: 0,
                    }}>Ver todo</button>
                </div>
              )}
            </Ancha>

            {/* EL PIE DEL ZIP: cuenta lo que SE VE. Filtrada la cartera, un total que hable de obras
                fuera de la pantalla no se puede verificar mirándola. */}
            <div style={{
              display: 'flex', gap: '26px', justifyContent: 'flex-end', padding: '11px 16px',
              background: C.tenueFondo, flexWrap: 'wrap',
            }} data-testid="pie-cartera">
              <Cifra r="OBRAS" v={String(lista.length)} />
              <Cifra r="EN EJECUCIÓN" v={String(enCurso)} />
              {/* «PERSONAS HOY 0» ERA LA AUSENCIA DISFRAZADA DE HECHO: cero marcas es «sin fichar»
                  —incluye al que no tiene teléfono— y quién faltó lo declara el jefe. */}
              <Cifra r="PERSONAS HOY" v={personasHoy == null ? null : String(personasHoy)} falta="sin fichar"
                titulo="Personas con entrada fichada hoy en las obras de esta lista. Sale de `presencia_del_dia`." />
              {esAdmin && (
                <Cifra r="CONTRATADO"
                  v={conContrato.length === 0 ? null : millones(totalContratado)}
                  falta="sin cargar"
                  titulo={`${conContrato.length} de ${lista.length} obras con monto contratado cargado`}
                  sufijo={conContrato.length > 0 && conContrato.length < lista.length
                    ? `de ${conContrato.length} de ${lista.length}` : undefined} />
              )}
            </div>
          </Tarjeta>
        )}

        {/* LO QUE NO SE PUDO MIRAR SE DICE. Sin esta línea una lectura caída se ve exactamente igual
            que una cartera sin partes y sin impedimentos: ninguna señal dibujada. */}
        {sinDato.length > 0 && (
          <p style={{ marginTop: '12px', fontSize: '12px', color: C.warn }} data-testid="senales-sin-dato">
            {sinDato.join(' · ')}
          </p>
        )}
        {pie}
      </div>
    </div>
  )
}

/** Una celda del pie: rótulo 11px tenue, número 12px mono. */
function Cifra({ r, v, falta, titulo, sufijo }: {
  r: string; v: string | null; falta?: string; titulo?: string; sufijo?: string
}) {
  return (
    <div title={titulo}>
      <span style={{ fontSize: '11px', color: C.tenue }}>{r} </span>
      {v === null
        ? <span style={{ fontSize: '12px', color: C.tenue, fontStyle: 'italic' }} data-nulo="">{falta ?? 'sin dato'}</span>
        : <span style={{ fontFamily: MONO, fontSize: '12px', color: C.tinta }}>{v}</span>}
      {sufijo && <span style={{ marginLeft: '6px', fontSize: '11px', color: C.tenue }}>{sufijo}</span>}
    </div>
  )
}

/** UNA FILA DE 48px. El nombre y el cliente son enlaces de verdad —se abren en pestaña nueva y se
 *  copian—; el resto de la fila navega a la obra con un clic, como el `cursor:pointer` del zip. */
function Fila({ o, ir }: { o: FilaCartera; ir: () => void }) {
  const e = estadoDeCartera(o)
  const d = diasDeAtraso(o)
  const hh = textoHH(o)
  const previo = esPrevio(o)
  return (
    <Hover data-testid={`fila-obra-${o.obra_id}`} data-obra={o.obra_id}
      onClick={ir}
      base={{
        display: 'grid', gridTemplateColumns: GRID, gap: '10px', alignItems: 'center',
        height: '48px', borderBottom: `1px solid ${C.bordeFila}`, padding: '0 14px', cursor: 'pointer',
      }}
      hover={{ background: C.tenueFondo }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
        <span style={{ display: 'flex', color: C.tenue, flexShrink: 0 }}><Ico d={P.obra} s={15} /></span>
        <Link href={`/obras/${o.obra_id}`} prefetch={false} onClick={(ev) => ev.stopPropagation()}
          style={{
            fontSize: '12.5px', fontWeight: 500, color: C.tinta, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{o.nombre}</Link>
      </div>
      {/* SIN FICHA NO HAY ENLACE: una obra puede tener el cliente escrito a mano y sin fila en
          `clientes`. Un link a `/clientes/null` es una promesa que termina en 404. */}
      <span style={{
        fontSize: '12px', color: C.tintaMedia, minWidth: 0, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {o.cliente_slug && o.cliente_nombre
          ? <Link href={`/clientes/${o.cliente_slug}`} prefetch={false} onClick={(ev) => ev.stopPropagation()}
              style={{ color: C.tintaMedia }}>{o.cliente_nombre}</Link>
          : (o.cliente_nombre ?? o.cliente_texto
              ?? <span style={{ color: C.tenue, fontStyle: 'italic' }} data-nulo="">sin cliente declarado</span>)}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <Pastilla tono={e.tono}>{e.t}</Pastilla>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Barra pct={previo ? 0 : o.avance_pct} color={colorDeBarra(o)} />
        <span style={{
          fontFamily: MONO, fontSize: '11.5px', width: '38px', textAlign: 'right',
          color: o.avance_pct == null || previo ? C.tenue : o.avance_pct >= 100 ? C.pos : C.tinta,
        }}>{previo || o.avance_pct == null ? '—' : `${o.avance_pct}%`}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px' }}>
        {d !== null && d > 0 && (
          <span style={{ display: 'flex', color: colorDePlazo(o), flexShrink: 0 }}
            title={`${d} días de atraso proyectado`}><Ico d={P.alerta} s={14} /></span>
        )}
        <span style={{ fontFamily: MONO, fontSize: '11.5px', color: colorDePlazo(o), whiteSpace: 'nowrap' }}>
          {textoDePlazo(o)}
        </span>
      </div>
      <span style={{
        fontFamily: MONO, fontSize: '11.5px', textAlign: 'right',
        color: hh.alerta ? C.warn : C.tintaMedia,
      }}>{hh.t}</span>
      {/* HOY: el check afirma que hoy se cargó parte; el reloj afirma que TODAVÍA no. Ninguno de
          los dos dice que la obra esté parada. Con la lectura caída, la celda queda vacía. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
        {o.conParte === true && (
          <span title="Parte de hoy cargado" style={{ display: 'flex', color: C.pos }} data-testid="senal-hoy">
            <Ico d={P.ok} s={14} w={2.4} />
          </span>
        )}
        {o.conParte === false && o.estado === 'activa' && (
          <span title="Todavía no se cargó parte de ejecución hoy. No dice que la obra esté parada."
            style={{ display: 'flex', color: C.warn }} data-testid="senal-sin-parte">
            <Ico d={P.hh} s={14} />
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
        {o.impedimentos != null && o.impedimentos > 0 && (
          <span title={`${o.impedimentos} puntos para resolver`} data-testid="senal-impedimentos"
            data-impedimentos={o.impedimentos}
            style={{ display: 'flex', alignItems: 'center', gap: '3px', color: C.warn }}>
            <Ico d={P.alerta} s={14} />
            <span style={{ fontFamily: MONO, fontSize: '11px' }}>{o.impedimentos}</span>
          </span>
        )}
        {o.impedimentos === 0 && <span style={{ fontSize: '11px', color: C.fantasma }} data-nulo="">—</span>}
      </div>
      {/* EL «···» DEL ZIP LLEVA A LA OBRA. No abre un menú: acá no hay una acción por fila que el
          OS pueda ejecutar hoy, y un menú vacío es peor que un ícono que hace lo obvio. */}
      <Link href={`/obras/${o.obra_id}`} prefetch={false} title="Abrir la obra"
        aria-label={`Abrir ${o.nombre}`} onClick={(ev) => ev.stopPropagation()}
        style={{ display: 'flex', color: C.fantasma, justifyContent: 'center' }}>
        <IcoMas />
      </Link>
    </Hover>
  )
}

// ═══ LA LÍNEA DE TIEMPO (el `esTiempo` del mockup) ═══
//
// El zip la dibuja con seis meses fijos y el mes corriente resaltado. Acá los meses salen del
// rango REAL de las obras visibles: una cartera que arranca en marzo y termina en diciembre no
// entra en seis meses, y recortarla escondería obras enteras.

// ═══ LA SEGUNDA LÍNEA DE TIEMPO SE RETIRA (07/09/2026) ═══
//
// Acá vivían `mesesDelRango` y `LineaDeTiempo`: un Gantt propio de esta pantalla, con su propio
// rango de meses y su propia regla de fin (`forecast_fin ?? fecha_fin_plan`). El Gantt de la cartera
// ya existe en `/obras/gantt` y lee `obra_plan_vs_real`, que es de donde salen los plazos de la
// tabla de arriba. Dos dibujos del mismo plazo con dos reglas distintas es la forma en que dos
// pantallas empiezan a contestar distinto sobre la misma obra — y ninguna de las dos tenía cómo
// enterarse. Lo que se conserva es el CAMINO: el control de la barra de herramientas, ahora con su
// nombre, lleva a la vista que sí tiene eje, escalas, marca de hoy y semáforo.
