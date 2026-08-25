import type { ReactNode } from 'react'
import type { SolapaPortal } from '../reglas/permisos'
import { P, SUBRAYADO_SOLAPA_MOVIL } from '../estilos'
import { IcoArchivo, IcoCalendario, IcoConsulta, IcoObra } from './iconos'

// LA BARRA DE ABAJO DEL TELÉFONO — `30`, líneas 221–238 y 346–363.
//
// Cuatro entradas: Obra · Pagos · Comprobantes · Consultas, con el subrayado amarillo ARRIBA de la
// activa (`inset 0 2px 0`, al revés que en el escritorio) y `paddingBottom:8` para el gesto de
// inicio del teléfono.
//
// ═══ SON CUATRO ACÁ Y TRES EN EL ESCRITORIO, Y ESTÁ BIEN ═══
//
// En el `29` las Consultas viven en la columna de la derecha, que en 390px no existe: por eso el
// teléfono les da su propia entrada. Y «Documentos» se llama «Comprobantes» porque lo que el
// mockup del teléfono lista ahí son facturas, recibos y certificados —lo que el cliente busca en el
// teléfono— con los documentos de la obra en el mismo listado.
//
// LAS ENTRADAS QUE EL ACCESO NO ABRE NO SE DIBUJAN. Cuatro iconos de los que dos no llevan a nada
// enseñan que la pantalla miente.

export type SolapaMovil = SolapaPortal | 'consultas'

const ENTRADAS: { clave: SolapaMovil; rotulo: string; icono: ReactNode }[] = [
  { clave: 'obra', rotulo: 'Obra', icono: <IcoObra s={21} w={1.8} /> },
  { clave: 'pagos', rotulo: 'Pagos', icono: <IcoCalendario s={21} w={1.8} /> },
  { clave: 'docs', rotulo: 'Comprobantes', icono: <IcoArchivo s={21} w={1.8} /> },
  { clave: 'consultas', rotulo: 'Consultas', icono: <IcoConsulta s={21} w={1.8} /> },
]

export function BarraInferiorMovil({ activa, disponibles, onIr }: {
  activa: SolapaMovil
  disponibles: SolapaMovil[]
  onIr: (s: SolapaMovil) => void
}) {
  const entradas = ENTRADAS.filter((e) => disponibles.includes(e.clave))

  return (
    <nav
      className="portal-movil portal-barra-inferior"
      style={{
        background: P.superficie, borderTop: `1px solid ${P.linea}`, display: 'flex',
        alignItems: 'stretch', flexShrink: 0, paddingBottom: 8,
      }}
    >
      {entradas.map((e) => {
        const viva = e.clave === activa
        return (
          <button
            key={e.clave}
            type="button"
            onClick={() => onIr(e.clave)}
            aria-current={viva ? 'page' : undefined}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '9px 0', color: viva ? P.tinta : P.apagado, fontWeight: viva ? 600 : 400,
              boxShadow: viva ? SUBRAYADO_SOLAPA_MOVIL : 'none', cursor: 'pointer',
              background: 'none', border: 'none', fontFamily: 'inherit',
            }}
          >
            {e.icono}
            <span style={{ fontSize: '10.5px' }}>{e.rotulo}</span>
          </button>
        )
      })}
    </nav>
  )
}
