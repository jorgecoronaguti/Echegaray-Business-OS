// 25 · EL PANEL LATERAL DE LA CARTERA v2 — el detalle sin salir de la lista (`25v2:172-247`).
//
// ═══ QUÉ CAMBIÓ RESPECTO DEL PORTE DE AGOSTO ═══
//
//   · SE FUERON LAS CUATRO SOLAPAS (Resumen · Obras · Documentos · Cuenta). El v2 dibuja UNA sola
//     columna: quién es, qué le falta, sus obras y los verbos. Cuatro solapas dentro de un panel de
//     372px es una segunda navegación adentro del detalle de una fila — y las tres escondidas se
//     leían menos que si estuvieran una debajo de la otra, que es como están ahora.
//   · SE FUE LA CAJA: `PanelDetalle` dibuja una tarjeta con borde y radio; el v2 es un filo
//     izquierdo y 24px de sangría, nada más (`PanelFilo`).
//   · APARECE LA BANDA DE LO QUE FALTA, arriba de todo y con su verbo: es el criterio 2 aplicado al
//     panel. Antes había que leer los cinco datos para darse cuenta de que faltaba el CUIT.
//
// ═══ POR QUÉ NO ES DE CLIENTE ═══
//
// No tiene estado propio: cuál cliente está abierto vive en la URL (`?c=`), igual que en Proveedores
// v2. Eso lo hace compartible por chat y deshacible con el botón de atrás, y deja el panel entero en
// el servidor — sin JavaScript que descargar para leer cinco renglones.
//
// ═══ LO QUE EL PANEL NO INVENTA ═══
//
// Los mismos `null` con los mismos nombres que la lista: «sin cargar» es sin cargar de los dos
// lados, y CONTRATADO desaparece para quien no ve economía exactamente igual que la columna. Y no
// hay línea de tiempo: `getActividadCliente` son seis lecturas por cliente, o sea treinta consultas
// para recorrer una cartera de cinco. Vive en la ficha, y el verbo «Editar» lleva hasta ahí.

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { BotonAccion } from '@/shared/components/ui'
import { pesos, porcentajeCanon } from '@/shared/components/canon/formato'
import { IconoBloqueo, IconoCerrar, IconoCrear, IconoEditar } from '@/shared/components/iconos'
import { PanelFilo, RotuloPanel, V } from '@/shared/components/v2/patron'
import { archivarCliente } from '../services/actions'
import type { ClientePanel, ObraDePanel } from '../types'

/** `25v2:229`. Verde = terminada; azul = en ejecución. Nunca sólo el color: el % va al lado. */
const PUNTO = { fin: '#067647', curso: '#175CD3', otro: V.lupa } as const

/** Un atajo a una solapa de la ficha: fila entera clicable, sin caja — el patrón de la lista. */
const ATAJO: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  minHeight: 34, fontSize: '12.5px', color: V.tinta, textDecoration: 'none',
  borderBottom: `1px solid ${V.linea}`,
}
const CHEVRON: CSSProperties = { color: V.tenue, fontSize: '12px' }

export function PanelCliente({
  c, obras, veEconomia, cerrarHref, puedeEditar,
}: {
  c: ClientePanel
  /** TODAS sus obras, no sólo las activas: el panel muestra la relación completa. */
  obras: ObraDePanel[]
  veEconomia: boolean
  cerrarHref: string
  /** El nivel Obras entra al detalle pero no administra el maestro: sin esto, sin verbos. */
  puedeEditar: boolean
}) {
  const faltan = [
    !c.cuit?.trim() && 'el CUIT',
    !c.telefono?.trim() && 'el teléfono',
    c.contratado === null && 'el contrato de sus obras',
  ].filter((x): x is string => typeof x === 'string')

  return (
    <PanelFilo testid="panel-cliente">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: V.tinta, lineHeight: 1.25 }}>
            {c.nombre_comercial}
          </div>
          <div style={{ fontSize: '12px', color: c.razon_social ? V.apagado : V.warn, marginTop: 3 }}>
            {c.razon_social ?? 'sin razón social'}
          </div>
        </div>
        <Link href={cerrarHref} prefetch={false} title="Cerrar" data-testid="panel-cliente-cerrar" style={{ display: 'flex', color: V.tenue, flexShrink: 0 }}>
          <IconoCerrar className="h-[14px] w-[14px]" />
        </Link>
      </div>

      {/* LO QUE FALTA, ARRIBA Y CON SU VERBO. La frase nombra el dato, no dice «datos incompletos»:
          un aviso que no nombra lo que falta obliga a leer los cinco renglones de abajo. */}
      {faltan.length > 0 && (
        <div
          data-testid="panel-cliente-falta"
          style={{
            display: 'flex', alignItems: 'center', gap: 9, marginTop: 14,
            borderTop: `1px solid ${V.lineaFila}`, borderBottom: `1px solid ${V.lineaFila}`,
            padding: '9px 0 9px 11px', boxShadow: `inset 2px 0 0 ${V.warn}`,
          }}
        >
          <span style={{ display: 'flex', color: V.warn, flexShrink: 0 }}>
            <IconoBloqueo className="h-[14px] w-[14px]" />
          </span>
          <span style={{ fontSize: '12px', color: V.tintaSuave, flex: 1, minWidth: 0 }}>
            Falta {faltan.join(', ')}.
          </span>
          {puedeEditar && c.slug && (
            <Link
              href={`/clientes/${c.slug}`}
              prefetch={false}
              data-testid="panel-cliente-completar"
              style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta, flexShrink: 0 }}
            >
              Completar →
            </Link>
          )}
        </div>
      )}

      <div style={{ marginTop: 18 }} data-testid="panel-cliente-datos">
        <Dato k="CUIT" falta={!c.cuit}>{c.cuit ?? 'sin cargar'}</Dato>
        <Dato k="Contacto" falta={!c.responsable_nombre}>{c.responsable_nombre ?? 'sin asignar'}</Dato>
        <Dato k="Teléfono" falta={!c.telefono}>{c.telefono ?? 'sin cargar'}</Dato>
        <Dato k="Email" falta={!c.email}>{c.email ?? 'sin cargar'}</Dato>
        <Dato k="Domicilio" falta={!c.direccion}>{c.direccion ?? 'sin cargar'}</Dato>
        {veEconomia && (
          <Dato k="Contratado" falta={c.contratado === null} mono>
            {c.contratado === null ? 'sin contrato' : pesos(c.contratado)}
          </Dato>
        )}
        {veEconomia && (
          // COSTO REAL no está en el mockup y no se saca: es el otro lado de lo contratado y ya
          // viene en la misma lectura. Sacarlo sería perder un dato para parecerse más a un dibujo.
          <Dato k="Costo real" falta={c.costo_real === null} mono>
            {c.costo_real === null ? 'sin costo imputado' : pesos(c.costo_real)}
          </Dato>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <RotuloPanel cuenta={obras.length}>Sus obras</RotuloPanel>
        {obras.length === 0
          ? <p style={{ fontSize: '12px', color: V.apagado, padding: '8px 0' }} data-testid="panel-cliente-sin-obras">Todavía no tiene obras cargadas.</p>
          : obras.map((o) => (
              <Link
                key={o.obra_id}
                href={`/obras/${o.obra_id}`}
                prefetch={false}
                data-testid="panel-cliente-obra"
                className="hover:bg-[#FAFAF8]"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: `1px solid ${V.lineaPanel}`,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6, height: 6, borderRadius: 3, flexShrink: 0,
                    background: o.estado === 'cerrada' ? PUNTO.fin : o.estado === 'activa' ? PUNTO.curso : PUNTO.otro,
                  }}
                />
                <span className="truncate" style={{ fontSize: '12px', color: V.tinta, minWidth: 0 }}>{o.nombre}</span>
                {/* EL ESTADO NUNCA VA SÓLO EN EL COLOR: la palabra viaja al lado del punto. */}
                <span style={{ fontSize: '11px', color: V.tenue, flexShrink: 0 }}>{rotuloEstado(o.estado)}</span>
                {/* UN AVANCE QUE NO SE SINCRONIZÓ NO ES 0 %. */}
                <span
                  className="font-mono tabular-nums"
                  style={{
                    marginLeft: 'auto', fontSize: '11.5px', flexShrink: 0,
                    color: o.avance_pct === null ? V.lupa : o.estado === 'cerrada' ? PUNTO.fin : V.tinta,
                  }}
                >
                  {o.avance_pct === null ? 'sin medir' : porcentajeCanon(o.avance_pct, 0)}
                </span>
              </Link>
            ))}
      </div>

      {/* ── LO QUE SE ADMINISTRA DE ESTE CLIENTE, NOMBRADO ───────────────────────────────────
          El panel se abre al tocar un cliente en la lista y hasta hoy sólo ofrecía «Nueva obra»,
          «Editar» y «Archivar». Su cronograma de cobros y sus accesos al portal viven en la ficha,
          dos solapas más adentro, y desde acá no había forma de saber que existían. El dueño lo
          resumió así: «nunca encuentro nada». Son enlaces a la MISMA ficha, no una segunda pantalla:
          lo único que cambia es que la solapa se nombra en vez de esconderse. */}
      {c.slug && veEconomia && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 18 }}>
          <span style={{ fontSize: '10.5px', letterSpacing: '.08em', color: V.tenue, marginBottom: 4 }}>
            ADMINISTRAR
          </span>
          <Link href={`/clientes/${c.slug}?vista=esquema`} prefetch={false} data-testid="panel-cliente-esquema"
            style={ATAJO}>Cronograma de cobros<span style={CHEVRON}>→</span></Link>
          <Link href={`/clientes/${c.slug}?vista=accesos`} prefetch={false} data-testid="panel-cliente-accesos"
            style={ATAJO}>Acceso al portal<span style={CHEVRON}>→</span></Link>
          <Link href={`/clientes/${c.slug}?vista=cuenta`} prefetch={false} data-testid="panel-cliente-cuenta"
            style={ATAJO}>Cuenta corriente<span style={CHEVRON}>→</span></Link>
          {/* Abre en otra pestaña: es el portal, otra aplicación, y perder la ficha para mirarlo
              obligaría a volver a buscar el cliente en la lista. */}
          <a href={`/portal/vista-previa/${c.slug}`} target="_blank" rel="noreferrer"
            data-testid="panel-cliente-ver-portal" style={ATAJO}>
            Ver el portal como lo ve el cliente<span style={CHEVRON}>↗</span>
          </a>
        </div>
      )}

      {puedeEditar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          {/* LA ÚNICA PRIMARIA DEL PANEL. El alta de obra vive en /obras: repetir el formulario acá
              sería una segunda puerta al mismo maestro. */}
          <Link
            href={c.slug ? `/obras?nueva=1&cliente=${c.slug}` : '/obras?nueva=1'}
            prefetch={false}
            data-testid="panel-cliente-nueva-obra"
            className="hover:bg-[#EEBE00]"
            style={{
              display: 'flex', alignItems: 'center', gap: 7, background: V.marca, color: V.tinta,
              fontSize: '12.5px', fontWeight: 600, borderRadius: 6, padding: '8px 13px',
            }}
          >
            <IconoCrear className="h-[14px] w-[14px]" /> Nueva obra
          </Link>
          {c.slug && (
            <Link
              href={`/clientes/${c.slug}`}
              prefetch={false}
              data-testid="panel-cliente-ficha"
              style={{
                display: 'flex', alignItems: 'center', gap: 7, border: `1px solid ${V.linea}`,
                background: '#FFFFFF', color: V.tinta, fontSize: '12.5px', fontWeight: 500,
                borderRadius: 6, padding: '8px 12px',
              }}
            >
              <IconoEditar className="h-[14px] w-[14px]" /> Editar
            </Link>
          )}
          {/* ARCHIVAR NO ES BORRAR, y el `title` es lo único que lo garantiza antes del clic. Es la
              MISMA acción del pie de la ficha, no una segunda: se ata acá con sus argumentos. */}
          <span style={{ marginLeft: 'auto' }} title="Sale de la cartera activa; sus obras y sus documentos quedan">
            <BotonAccion
              accion={archivarCliente}
              args={[c.cliente_id, !c.activo]}
              testid="panel-cliente-archivar"
              tono={c.activo ? 'peligro' : 'neutral'}
            >
              {c.activo ? 'Archivar' : 'Reactivar'}
            </BotonAccion>
          </span>
        </div>
      )}
    </PanelFilo>
  )
}

/** Un renglón clave/valor del panel: 104px de rótulo y el valor al lado (`25v2:196-199`). */
function Dato({ k, children, falta, mono }: {
  k: string
  children: React.ReactNode
  /** `true` = el dato no está cargado. El ámbar va SÓLO en el valor, nunca en el rótulo. */
  falta?: boolean
  mono?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: `1px solid ${V.lineaPanel}` }}>
      <span style={{ fontSize: '11.5px', color: V.tenue, width: 96, flexShrink: 0 }}>{k}</span>
      <span
        className={mono ? 'font-mono tabular-nums' : undefined}
        style={{ fontSize: '12px', color: falta ? V.warn : V.tinta, minWidth: 0, textWrap: 'pretty' }}
      >
        {children}
      </span>
    </div>
  )
}

/** El estado de la obra en palabras. Un punto de color sin palabra no lo lee nadie que no vea color. */
function rotuloEstado(estado: string): string {
  if (estado === 'activa') return 'en ejecución'
  if (estado === 'cerrada') return 'terminada'
  if (estado === 'pausada') return 'pausada'
  return estado
}
