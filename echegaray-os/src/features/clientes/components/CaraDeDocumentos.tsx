// LA CARA DOCUMENTOS DE LA FICHA — UNA jerarquía, no cinco bloques apilados.
//
// Dueño (11/09/2026 17:50): «el crm dice documentos de drive (0) y está pésimo eso, arreglar» ·
// «no se entiende nada realmente la UX de esa sección documentos».
//
// ═══ LA ESTRUCTURA, Y POR QUÉ ES UNA SOLA ═══
//
//   TRABAJO (colapsado, con su conteo)
//     └ ADICIONAL, con sangría, debajo de su obra mayor
//         └ CATEGORÍA (Cotizaciones · Contrato · OC · Certificaciones · Planos · HyS · Actas · Otros)
//             └ ARCHIVO: nombre → Drive en pestaña nueva · fecha · tamaño
//
// Y al final, SÓLO SI TIENEN ALGO, tres secciones que dicen qué les falta: los papeles que no
// llegaron a ninguna obra, los vínculos hechos a mano y los archivos de la carpeta del cliente que
// ninguna obra reclama. Cada una es trabajo pendiente de alguien, no una categoría más.
//
// Lo que se fue: el rótulo «Documentos de Drive · N» —que decía 0 con 226 archivos debajo—, la lista
// plana de papeles por tipo y el índice completo de la carpeta del cliente como bloque de primer
// nivel. Un archivo que ya está adentro de su obra NO se repite abajo.
//
// ═══ COLAPSADO POR DEFECTO, Y ESO ES LA DECISIÓN DE DISEÑO ═══
//
// Messina tiene 226 papeles. Abiertos, la cara es un listado de Drive —exactamente de lo que el
// dueño se quiere ir—. Cerrada, la cara contesta de un vistazo la pregunta que la trae: qué trabajos
// hay, cuántos papeles tiene cada uno y cuáles no tienen ni carpeta.
//
// Skill `diseno-ui-ux-producto-os`: sin tarjetas por dato, sin sombras, sin gradientes, sin un color
// de énfasis nuevo. El único ámbar es «sin carpeta vinculada en Drive», que es trabajo pendiente del
// OS. Grid de 8: la sangría del adicional son los mismos 24 px de la lista de Trabajos. Las
// explicaciones viven en el `title`, no en un párrafo permanente.

import Link from 'next/link'
import { ALTO_V2, V } from '@/shared/components/v2/patron'
import { IconoObra } from '@/shared/components/iconos'
import { fechaCortaConAnio } from '@/shared/components/canon/formato'
import { peso } from '../services/papelesDeObra'
import type { ArchivoDeLaCara, CaraDocumentos, GrupoDeLaCara } from '../services/caraDocumentos'
import { MarcaAdicional } from './MarcaAdicional'

const SANGRIA = 16
const PASO_ADICIONAL = 24

/** NOMBRE · FECHA · TAMAÑO. A 400 px el tamaño se suelta: el nombre y la fecha no se negocian. */
const COLS_ARCHIVO = 'grid-cols-[minmax(0,1fr)_minmax(0,88px)_minmax(0,72px)]'
  + ' max-[559px]:grid-cols-[minmax(0,1fr)_minmax(0,72px)] max-[559px]:gap-[8px]'
const SOLO_ANCHO = 'max-[559px]:hidden'

const AYUDA_SIN_CARPETA = 'El OS no tiene ninguna carpeta de Drive vinculada a este trabajo, así que '
  + 'no puede mostrar sus papeles. Se vincula corriendo '
  + '`node orquestador/scripts/obras-carpetas-drive.mjs --aplicar`; lo que ese script no resuelve con '
  + 'evidencia queda en su lista de dudas, nunca se ata por parecido.'

const AYUDA_OS = 'Este papel vive en el OS (lo cargó el bot o la app), no en la carpeta de Drive.'

function Archivo({ a }: { a: ArchivoDeLaCara }) {
  return (
    <Link
      href={a.href} target="_blank" rel="noopener noreferrer" data-testid="papel-de-obra"
      data-clave={a.clave}
      className={`grid ${COLS_ARCHIVO} items-center gap-[16px] hover:bg-[#F2F1ED]`}
      style={{ height: 30, paddingLeft: 24, paddingRight: 8, borderBottom: `1px solid ${V.lineaFila}` }}
      title={[
        a.porque ? `Clasificado por ${a.porque}` : 'Sin marca en el nombre ni en la ruta: queda en «Otros».',
        a.via ? `Atado a la obra por: ${a.via}` : null,
      ].filter(Boolean).join('\n')}
    >
      <span className="truncate" style={{ fontSize: '12px', color: V.tinta }}>
        {a.nombre}
        {a.fuente === 'os' && (
          <span data-testid="marca-os" title={AYUDA_OS}
            style={{ fontSize: '10px', letterSpacing: '0.06em', color: V.tenue, marginLeft: 8 }}>
            OS
          </span>
        )}
        {a.aceptada && (
          <span
            data-testid="papel-aceptado"
            title="Es el papel del que sale el precio contratado de esta obra (obra_contrato)."
            style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', color: V.tenue, marginLeft: 8 }}
          >
            fija el precio
          </span>
        )}
      </span>
      <span className="truncate font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.apagado, textAlign: 'right' }}>
        {fechaCortaConAnio(a.fecha) ?? '—'}
      </span>
      <span className={`truncate font-mono tabular-nums ${SOLO_ANCHO}`} style={{ fontSize: '11.5px', color: V.tenue, textAlign: 'right' }}>
        {peso(a.tamano)}
      </span>
    </Link>
  )
}

function Categoria({ g }: { g: GrupoDeLaCara }) {
  return (
    <details data-testid="categoria-de-papeles" data-categoria={g.clave}>
      <summary style={{
        cursor: 'pointer', height: 28, display: 'flex', alignItems: 'center', gap: 8,
        paddingLeft: 10, fontSize: '12px', color: V.tintaSuave, borderBottom: `1px solid ${V.lineaFila}`,
      }}>
        {g.rotulo}
        <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.tenue }}>
          {g.archivos.length}
        </span>
      </summary>
      {g.archivos.map((a) => <Archivo key={a.clave} a={a} />)}
    </details>
  )
}

/** El enlace discreto que abre la carpeta en Drive. Texto, no botón: es una acción secundaria. */
function AbrirCarpeta({ href, testid }: { href: string; testid: string }) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" data-testid={testid}
      style={{ fontSize: '11.5px', color: V.apagado, marginLeft: 'auto', flexShrink: 0 }}
      title="Abre la carpeta en Drive, en una pestaña nueva.">
      Abrir en Drive ↗
    </Link>
  )
}

function Seccion({ titulo, ayuda, grupos, archivos, testid }: {
  titulo: string
  ayuda: string
  grupos?: GrupoDeLaCara[]
  archivos?: ArchivoDeLaCara[]
  testid: string
}) {
  return (
    <section data-testid={testid} style={{ paddingLeft: SANGRIA, paddingTop: 14 }}>
      <p title={ayuda} style={{
        fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase', color: V.tenue,
        padding: '6px 0 2px',
      }}>
        {titulo}
      </p>
      {grupos?.map((g) => <Categoria key={g.clave} g={g} />)}
      {archivos?.map((a) => <Archivo key={a.clave} a={a} />)}
    </section>
  )
}

export function CaraDeDocumentos({ cara, carpetaDelClienteHref, truncado = false, vinculados, extra }: {
  cara: CaraDocumentos
  /** `true` = la lectura de la carpeta del cliente se topó y hay más archivos de los que se ven. */
  truncado?: boolean
  /** La carpeta del cliente en Drive. `null` = no tiene ninguna vinculada. */
  carpetaDelClienteHref: string | null
  /** `BloqueDocumentos` con los vínculos que no salieron por ninguna obra. `null` = no hay ninguno. */
  vinculados?: React.ReactNode
  /** Lo que sigue viviendo en su propio componente (documentos subidos al bucket). */
  extra?: React.ReactNode
}) {
  return (
    <div data-testid="papeles-por-obra">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0 4px' }}>
        <p style={{ fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase', color: V.tenue }}>
          Papeles por trabajo · {cara.total}
        </p>
        {carpetaDelClienteHref && <AbrirCarpeta href={carpetaDelClienteHref} testid="abrir-carpeta-cliente" />}
      </div>

      {cara.obras.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }} data-testid="papeles-por-obra-vacio">
          Este cliente no tiene ningún trabajo cargado.
        </p>
      )}

      {cara.obras.map((o) => (
        <details key={o.obra_id} data-testid="papeles-obra" data-obra={o.obra_id}
          style={{ paddingLeft: o.nivel ? SANGRIA + PASO_ADICIONAL : SANGRIA }}>
          <summary style={{
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, minWidth: 0,
            height: ALTO_V2.ramaDeTrabajo, borderBottom: `1px solid ${V.lineaFila}`,
          }}>
            <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
              <IconoObra className="h-[15px] w-[15px]" />
            </span>
            <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta }}>
              {o.nombre}
            </span>
            {o.esAdicional && <MarcaAdicional huerfano={o.huerfano} />}
            {o.tieneCarpeta
              ? (
                  <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.tenue, flexShrink: 0 }}>
                    {o.total} {o.total === 1 ? 'papel' : 'papeles'}
                  </span>
                )
              : (
                  <span data-testid="obra-sin-carpeta" title={AYUDA_SIN_CARPETA}
                    style={{ fontSize: '11.5px', color: V.warn, flexShrink: 0 }}>
                    sin carpeta vinculada en Drive
                  </span>
                )}
            {o.carpetaHref && <AbrirCarpeta href={o.carpetaHref} testid="abrir-carpeta-obra" />}
          </summary>
          {o.grupos.map((g) => <Categoria key={g.clave} g={g} />)}
        </details>
      ))}

      {/* LAS TRES SECCIONES DEL FINAL SÓLO EXISTEN SI TIENEN ALGO. Un bloque vacío que dice «0» es
          exactamente lo que el dueño mandó sacar. */}
      {cara.nSinObra > 0 && (
        <Seccion
          testid="papeles-sin-obra" titulo={`Sin obra · ${cara.nSinObra}`}
          ayuda="Papeles del cliente que el OS no pudo atribuir a ningún trabajo. Es trabajo pendiente de atribución, no un archivo perdido."
          grupos={cara.sinObra}
        />
      )}

      {/* LOS VÍNCULOS HECHOS A MANO siguen dibujándose con SU tabla —`BloqueDocumentos`, que llega
          en `vinculados`— y no con una copia de acá: esa tabla trae los verbos (clasificar,
          desvincular) y reproducirlos en una lista nueva sería tener dos formas de borrar un
          vínculo. Lo que cambió es su lugar: al final, y sólo si hay alguno. */}
      {vinculados}

      {cara.carpetaDelCliente.length > 0 && (
        <Seccion
          testid="papeles-carpeta-cliente"
          // EL TOPE SE DICE. Drive devuelve 300 archivos por lectura y ARCOR tiene 641: sin esta
          // frase, el número de abajo se lee como «esto es todo lo que hay» y no lo es.
          titulo={`Carpeta del cliente · sin obra asignada · ${cara.carpetaDelCliente.length}`
            + (truncado ? ' · hay más: Drive devolvió el tope de 300' : '')}
          ayuda="Están en la carpeta del cliente en Drive y ninguna obra los reclama: o son del cliente y no de un trabajo, o falta vincular la carpeta de esa obra."
          archivos={cara.carpetaDelCliente}
        />
      )}

      {extra}
    </div>
  )
}
