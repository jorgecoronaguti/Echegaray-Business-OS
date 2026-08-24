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
// Buscar, filtrar y conmutar tabla/tiempo son estado del CLIENTE, como en el mockup: son trece
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
const ROTULO: React.CSSProperties = {
  fontSize: '10px', color: C.tenue, letterSpacing: '.05em', paddingBottom: '8px',
}
const N = (x: number) => Math.round(x).toLocaleString('es-AR')

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
  const [tiempo, setTiempo] = useState(false)

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
          <button type="button" onClick={() => setTiempo((v) => !v)} data-testid="conmutar-vista"
            title={tiempo ? 'Ver como tabla' : 'Ver línea de tiempo'}
            style={{
              width: '28px', height: '28px', borderRadius: '6px', border: `1px solid ${C.borde}`,
              background: C.superficie, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.tintaSuave, cursor: 'pointer',
            }}>
            <Ico d={tiempo ? P.tabla : P.tiempo} s={15} />
          </button>
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
        {!tiempo ? (
          <Tarjeta testid="portafolio-tabla">
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
        ) : (
          <LineaDeTiempo obras={lista} ir={(id) => router.push(`/obras/${id}`)} />
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

function mesesDelRango(obras: FilaCartera[], hoy: Date): { clave: number; t: string; hoy: boolean }[] {
  let min = Infinity, max = -Infinity
  for (const o of obras) {
    for (const f of [o.fecha_inicio_plan, o.fecha_fin_plan, o.forecast_fin]) {
      if (!f) continue
      const ms = Date.parse(`${f.slice(0, 10)}T00:00:00Z`)
      min = Math.min(min, ms); max = Math.max(max, ms)
    }
  }
  if (!Number.isFinite(min)) return []
  const desde = new Date(Date.UTC(new Date(min).getUTCFullYear(), new Date(min).getUTCMonth(), 1))
  const hasta = new Date(Date.UTC(new Date(max).getUTCFullYear(), new Date(max).getUTCMonth(), 1))
  const mesHoy = hoy.getUTCFullYear() * 12 + hoy.getUTCMonth()
  const out: { clave: number; t: string; hoy: boolean }[] = []
  const d = new Date(desde)
  while (d <= hasta && out.length < 36) {
    const clave = d.getUTCFullYear() * 12 + d.getUTCMonth()
    const t = d.toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' }).replace('.', '')
    out.push({ clave, t: t.charAt(0).toUpperCase() + t.slice(1), hoy: clave === mesHoy })
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out
}

function LineaDeTiempo({ obras, ir }: { obras: FilaCartera[]; ir: (id: string) => void }) {
  const hoy = useMemo(() => new Date(), [])
  const meses = useMemo(() => mesesDelRango(obras, hoy), [obras, hoy])
  if (meses.length === 0) {
    return (
      <Tarjeta>
        <div style={{ padding: '26px 14px', fontSize: '12.5px', color: C.tintaSuave }}>
          Ninguna de estas obras tiene fechas de plan cargadas: no hay línea de tiempo que dibujar.
        </div>
      </Tarjeta>
    )
  }
  const inicioRango = meses[0].clave
  const total = meses.length
  const pos = (iso: string | null): number | null => {
    if (!iso) return null
    const d = new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`))
    const mes = d.getUTCFullYear() * 12 + d.getUTCMonth()
    const diasDelMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    return ((mes - inicioRango) + (d.getUTCDate() - 1) / diasDelMes) / total * 100
  }
  return (
    <Tarjeta testid="cartera-linea-tiempo">
      <div style={{ display: 'flex', height: '38px', borderBottom: `1px solid ${C.borde}`, background: C.tenueFondo }}>
        <div style={{
          width: '250px', flexShrink: 0, display: 'flex', alignItems: 'flex-end',
          padding: '0 14px 8px', fontSize: '10px', color: C.tenue, letterSpacing: '.05em',
        }}>OBRA</div>
        <div style={{ flex: 1, display: 'flex' }}>
          {meses.map((m) => (
            <div key={m.clave} style={{
              flex: 1, borderLeft: `1px solid ${C.bordeTarjeta}`, display: 'flex',
              alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '8px',
              fontSize: '10.5px', color: m.hoy ? C.tinta : C.tintaSuave, fontWeight: m.hoy ? 600 : 400,
            }}>{m.t}</div>
          ))}
        </div>
      </div>
      {obras.map((o) => {
        const x = pos(o.fecha_inicio_plan)
        const x2 = pos(o.forecast_fin ?? o.fecha_fin_plan)
        const hayBarra = x != null && x2 != null && x2 > x
        return (
          <Hover key={o.obra_id} onClick={() => ir(o.obra_id)} data-testid={`tiempo-${o.obra_id}`}
            base={{
              display: 'flex', alignItems: 'center', height: '44px',
              borderBottom: `1px solid ${C.bordeFila}`, cursor: 'pointer',
            }} hover={{ background: C.tenueFondo }}>
            <div style={{ width: '250px', flexShrink: 0, padding: '0 14px', minWidth: 0 }}>
              <div style={{
                fontSize: '12.5px', fontWeight: 500, color: C.tinta, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{o.nombre}</div>
              <div style={{
                fontSize: '11px', color: C.tenue, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{o.cliente_nombre ?? o.cliente_texto ?? 'sin cliente declarado'}</div>
            </div>
            <div style={{ flex: 1, position: 'relative', height: '100%' }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
                {meses.map((m) => (
                  <div key={m.clave} style={{
                    flex: 1, borderLeft: `1px solid ${C.bordeLista}`,
                    background: m.hoy ? '#FEFCF2' : 'transparent',
                  }} />
                ))}
              </div>
              {/* SIN FECHAS NO SE DIBUJA UNA BARRA INVENTADA: el hueco ES el dato —esa obra no
                  está planificada— y una barra desde hoy lo taparía. */}
              {hayBarra ? (
                <div style={{
                  position: 'absolute', top: '16px', left: `${x}%`, width: `${x2 - x}%`, height: '12px',
                  borderRadius: '3px', overflow: 'hidden',
                  background: (o.avance_pct ?? 0) >= 100 ? '#E6F3EB' : (o.avance_pct ?? 0) > 0 ? '#E4EEFC' : C.pistaPlan,
                  border: `1px solid ${(o.avance_pct ?? 0) >= 100 ? '#CDE7D7' : (o.avance_pct ?? 0) > 0 ? '#CFE0FA' : C.borde}`,
                }}>
                  <div style={{ height: '100%', width: `${Math.min(100, o.avance_pct ?? 0)}%`, background: colorDeBarra(o) }} />
                </div>
              ) : (
                <span style={{
                  position: 'absolute', top: '15px', left: '8px', fontSize: '11px', color: C.tenue,
                }} data-nulo="">sin fechas de plan</span>
              )}
            </div>
          </Hover>
        )
      })}
    </Tarjeta>
  )
}
