// EL MARCO DE CADA PANTALLA DE HERRAMIENTAS — nivel 2 + contenido, o el aviso de que falta la base.
//
// Si la migración 20260921T2100 no está aplicada, NINGUNA pantalla pinta un inventario vacío: dice qué
// falta. Un «0 herramientas» ahí sería mentir sobre 178 que existen en el listado viejo.

import type { ReactNode } from 'react'
import { MIGRACION } from '../logica/falta-migracion'
import { conProblema, vivo, type DatosParque, type Parque } from '../logica/parque'
import { EspacioHerramientas } from './Espacio'
import type { Lectura } from '../services/datos'
import { NavHerramientas, type CuentasNav } from './NavHerramientas'
import { bajadaPagina, pagina, tituloPagina, V } from './estilo'

export function cuentasDeNav(l: Lectura): CuentasNav {
  if (l.estado !== 'ok') return { mantenimiento: null, maquinarias: null, rodados: null }
  const vivos = l.parque.activos.filter(vivo)
  return {
    mantenimiento: vivos.filter(conProblema).length,
    maquinarias: vivos.filter((a) => a.clase === 'equipo').length,
    rodados: vivos.filter((a) => a.clase === 'rodado').length,
  }
}

/**
 * Nivel 2 + el espacio de trabajo con los paneles. `children` recibe la lectura ya buena: una pantalla
 * de Herramientas nunca ve el caso «sin base».
 */
export function Marco({ lectura, children, derecha }: {
  lectura: Lectura
  children: (l: Extract<Lectura, { estado: 'ok' }>) => ReactNode
  derecha?: ReactNode
}) {
  return (
    <div style={{ background: '#FFFFFF', minHeight: 'calc(100vh - 48px)', color: V.tinta }}>
      <NavHerramientas cuentas={cuentasDeNav(lectura)} derecha={lectura.estado === 'ok' ? derecha : undefined} />
      {lectura.estado === 'ok' ? (
        <EspacioHerramientas datos={datosPlanos(lectura.parque)} obras={lectura.obras} yo={lectura.yo}>
          {children(lectura)}
        </EspacioHerramientas>
      ) : (
        <SinBase lectura={lectura} />
      )}
    </div>
  )
}

/**
 * El parque sin sus índices (`Map` no cruza al cliente): el cliente lo vuelve a armar. El `satisfies`
 * obliga a pasar CADA campo de `DatosParque`: el 22/09 las existencias por lugar se quedaron afuera y
 * la pantalla mostraba el lote entero en el Taller aunque la base ya lo tenía repartido.
 */
function datosPlanos(p: Parque): DatosParque {
  return {
    activos: p.activos, ubicaciones: p.ubicaciones, obras: p.obras, movimientos: p.movimientos, incidencias: p.incidencias,
    nombres: p.nombres, categorias: p.categorias, lecturas: p.lecturas, personas: p.personas, existencias: p.existencias, ajustes: p.ajustes, papeles: p.papeles,
  } satisfies Record<keyof DatosParque, unknown>
}

function SinBase({ lectura }: { lectura: Exclude<Lectura, { estado: 'ok' }> }) {
  if (lectura.estado === 'falta_migracion') {
    return (
      <div style={pagina} data-testid="falta-migracion">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 640 }}>
          <div style={tituloPagina}>El módulo espera la migración {MIGRACION}</div>
          <div style={{ ...bajadaPagina, lineHeight: 1.55 }}>
            Las tablas de activos, ubicaciones y movimientos todavía no existen en la base. Cuando se aplique,
            el listado actual de herramientas y rodados entra solo y esta pantalla se llena. Hasta entonces no
            hay nada que mostrar: no es que no haya herramientas.
          </div>
        </div>
      </div>
    )
  }
  return (
    <div style={pagina} data-testid="error-herramientas">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 640 }}>
        <div style={tituloPagina}>No se pudo leer el inventario</div>
        <div style={{ ...bajadaPagina, color: V.neg }}>{lectura.mensaje}</div>
      </div>
    </div>
  )
}
