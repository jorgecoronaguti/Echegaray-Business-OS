// LOS PAPELES QUE CONFORMARON CADA OBRA — la cara Documentos de la ficha del cliente.
//
// Dueño (11/09/2026): «en el CRM admin no encuentro las cotizaciones, los documentos, archivos y
// demás cuestiones que han conformado todas las obras. Te pedí que todo de los clientes esté ahí».
//
// ═══ CÓMO SE LEE ═══
//
// Una sección por OBRA, en el orden del árbol —el adicional con sangría debajo de su obra mayor, la
// misma jerarquía que la lista de Trabajos—, y adentro una FILA POR CATEGORÍA con su conteo. La
// categoría se despliega en el lugar (`<details>`) y recién ahí aparecen los archivos: Messina tiene
// 106 papeles y dibujarlos todos abiertos convierte la cara en un listado de Drive, que es de lo que
// el dueño se quiere ir.
//
// ═══ LAS REGLAS DE DISEÑO QUE DECIDEN ACÁ (skill diseno-ui-ux-producto-os) ═══
//
//   · NO HAY UNA TARJETA POR DATO: es una lista con rótulos, del mismo ritmo que las otras caras.
//   · SIN SOMBRAS, SIN GRADIENTES, SIN COLOR DE ÉNFASIS NUEVO. La única tinta distinta es el ámbar
//     de `V.warn`, y sólo para «sin carpeta vinculada en Drive», que es trabajo pendiente del OS.
//   · GRID DE 8: la sangría del adicional son los mismos 24px de la lista de Trabajos.
//   · NO HAY PÁRRAFO EXPLICATIVO PERMANENTE: por qué un archivo cayó en su categoría y con qué
//     evidencia se ató a la obra viven en el `title`, bajo demanda.
//
// ═══ «SIN PAPELES» Y «SIN CARPETA VINCULADA» NO SE DIBUJAN IGUAL ═══
//
// El primero es una obra sin documentar —un hecho sobre la obra—; el segundo es que el OS todavía no
// sabe qué carpeta de Drive es suya —un hecho sobre el OS—. Dibujados los dos como una lista vacía,
// el dueño no puede saber cuál de los dos está mirando ni a quién reclamarle.

import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import { IconoObra } from '@/shared/components/iconos'
import { fechaCortaConAnio } from '@/shared/components/canon/formato'
import { peso, type PapelesDeUnaObra } from '../services/papelesDeObra'
import { MarcaAdicional } from './MarcaAdicional'

/** La sangría del bloque, y el paso del adicional: los mismos de la lista de Trabajos. */
const SANGRIA = 16
const PASO_ADICIONAL = 24

const AYUDA_SIN_CARPETA = 'El OS no tiene ninguna carpeta de Drive vinculada a este trabajo, así que '
  + 'no puede mostrar sus papeles. Se vincula corriendo '
  + '`node orquestador/scripts/obras-carpetas-drive.mjs --aplicar`, y lo que ese script no puede '
  + 'resolver con evidencia queda en su lista de dudas — nunca se ata por parecido.'

export interface FilaDePapeles {
  obra_id: string
  nombre: string
  /** `1` = es un adicional y se dibuja debajo de su obra mayor. */
  nivel: 0 | 1
  esAdicional: boolean
  huerfano: boolean
  /** `null` = esta obra no tiene ni papeles ni carpeta vinculada. */
  papeles: PapelesDeUnaObra | null
}

function Archivo({ p }: { p: {
  drive_file_id: string; nombre: string; ruta: string; size_bytes: number | null
  modified_time: string | null; web_view_link: string | null; via: string | null
  porque: string | null; aceptada: boolean
} }) {
  const href = p.web_view_link ?? `https://drive.google.com/file/d/${p.drive_file_id}/view`
  return (
    <Link
      href={href} target="_blank" rel="noopener noreferrer" data-testid="papel-de-obra"
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,88px)_minmax(0,72px)] items-center gap-[16px] hover:bg-[#F2F1ED]"
      style={{ height: 30, paddingLeft: 24, paddingRight: 8, borderBottom: `1px solid ${V.lineaFila}` }}
      title={[
        p.ruta,
        p.porque ? `Clasificado por ${p.porque}` : 'Sin marca en el nombre ni en la ruta: queda en «Otros».',
        p.via ? `Atado a la obra por: ${p.via}` : null,
      ].filter(Boolean).join('\n')}
    >
      <span className="truncate" style={{ fontSize: '12px', color: V.tinta }}>
        {p.nombre}
        {/* LA ACEPTADA LA DICE `obra_contrato`, NO EL NOMBRE: «FINAL», «APROBADA» y «v2» conviven en
            la misma carpeta y ninguna de las tres palabras prueba que sea la que se firmó. */}
        {p.aceptada && (
          <span
            data-testid="papel-aceptado"
            title="Es el papel del que sale el precio contratado de esta obra (obra_contrato)."
            style={{ fontSize: '10.5px', letterSpacing: '0.06em', textTransform: 'uppercase', color: V.tenue, marginLeft: 8 }}
          >
            fija el precio
          </span>
        )}
      </span>
      <span className="truncate font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.apagado, textAlign: 'right' }}>
        {fechaCortaConAnio(p.modified_time) ?? '—'}
      </span>
      <span className="truncate font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.tenue, textAlign: 'right' }}>
        {peso(p.size_bytes)}
      </span>
    </Link>
  )
}

export function PapelesDeLaObra({ filas }: { filas: FilaDePapeles[] }) {
  const total = filas.reduce((a, f) => a + (f.papeles?.total ?? 0), 0)
  return (
    <div data-testid="papeles-por-obra">
      <p style={{ fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase', color: V.tenue, padding: '6px 0 4px' }}>
        Papeles por trabajo · {total}
      </p>

      {filas.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }} data-testid="papeles-por-obra-vacio">
          Este cliente no tiene ningún trabajo cargado.
        </p>
      )}

      {filas.map((f) => (
        <section key={f.obra_id} data-testid="papeles-obra" data-obra={f.obra_id}
          style={{ paddingLeft: f.nivel ? SANGRIA + PASO_ADICIONAL : SANGRIA, paddingTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, height: 26 }}>
            <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
              <IconoObra className="h-[15px] w-[15px]" />
            </span>
            <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta }}>
              {f.nombre}
            </span>
            {f.esAdicional && <MarcaAdicional huerfano={f.huerfano} />}
            <span style={{ fontSize: '11.5px', color: V.tenue }}>
              {f.papeles ? `· ${f.papeles.total}` : ''}
            </span>
          </div>

          {!f.papeles && (
            <p data-testid="obra-sin-carpeta" title={AYUDA_SIN_CARPETA}
              style={{ fontSize: '11.5px', color: V.warn, paddingLeft: 24, paddingBottom: 6 }}>
              sin carpeta vinculada en Drive
            </p>
          )}

          {f.papeles && f.papeles.total === 0 && (
            <p data-testid="obra-sin-papeles"
              style={{ fontSize: '11.5px', color: V.apagado, paddingLeft: 24, paddingBottom: 6 }}>
              su carpeta de Drive está vinculada y no tiene ningún archivo
            </p>
          )}

          {f.papeles?.grupos.map((g) => (
            <details key={g.clave} data-testid="categoria-de-papeles" data-categoria={g.clave}>
              <summary
                style={{
                  cursor: 'pointer', listStyle: 'revert', height: 28, display: 'flex',
                  alignItems: 'center', gap: 8, paddingLeft: 10, fontSize: '12px', color: V.tintaSuave,
                  borderBottom: `1px solid ${V.lineaFila}`,
                }}
              >
                {g.rotulo}
                <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.tenue }}>
                  {g.papeles.length}
                </span>
              </summary>
              {g.papeles.map((p) => <Archivo key={p.drive_file_id} p={p} />)}
            </details>
          ))}
        </section>
      ))}
    </div>
  )
}
