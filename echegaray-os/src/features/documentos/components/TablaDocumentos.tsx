// 27 · DOCUMENTOS — porte literal de `echegaray-design/27 · Documentos.dc.html`.
//
// ═══ LAS COLUMNAS SON LAS DEL CANÓNICO, CON LAS QUE NO TIENEN FUENTE DECLARADAS ═══
//
// El zip dibuja: DOCUMENTO · PERTENECE A · PARA QUÉ SIRVE · ESTADO · VENCE · SUBIDO, con anchos
// `minmax(0,1.7fr) minmax(0,1.2fr) minmax(0,1.1fr) 126px 74px 74px 60px` (línea 138).
//
// **PARA QUÉ SIRVE** se derivó de la categoría que esta pantalla ya calculaba (`PROPOSITO`): es la
// misma regla leída desde el uso del papel en vez de desde su tipo. La etiqueta de la categoría
// queda debajo, en la misma celda, para que el chip de arriba se siga pudiendo auditar mirando lo
// que devolvió.
//
// **SUBIDO no existe.** `drive_index` no tiene `created_time`: la única fecha del índice es
// `modified_time`, la última modificación en Drive. La columna se rotula MODIFICADO, que es lo que
// contiene. Rotularla «SUBIDO» diría que ese día alguien cargó el archivo, y para un plano
// reeditado tres veces esa fecha no es la de la carga.
//
// **UBICACIÓN se fue de columna a subtítulo**: el canónico no la dibuja, pero la ruta es lo que
// permite ir a buscar el archivo a Drive. Va bajo el nombre, que es donde no compite con nada.
//
// ═══ ESTADO Y VENCE APARECEN JUNTAS, Y SÓLO CUANDO HAY FECHAS ═══
//
// Son la misma fuente: `documentacion_legajo.fecha_vencimiento`. Mientras esté en `null` en las 847
// filas, ninguna de las dos se dibuja — 100 pastillas que dicen «sin control» no informan, empujan
// el resto fuera de la pantalla y enseñan a no mirar la columna. El día que se cargue el primer
// vencimiento las dos aparecen solas, y la grilla vuelve a los siete tramos del canónico.
//
// Y NO HAY PASTILLA SIN FECHA. El zip pinta «Vigente» en verde en casi todas las filas, y también
// «Sin firmar» y «Falta»: los tres son estados que ninguna tabla de la base sabe. Sólo se dibuja el
// estado que `estadoVigencia` puede probar con una fecha.

import { AccionesDeFila } from './AccionesDeFila'
import Link from 'next/link'
import { Estado } from '@/shared/components/ds'
import {
  ALTO, C, CeldaTexto, EncabezadoCanon, FilaCanon, PieCanon, TarjetaTabla, VacioCanon,
  IcoCliente, IcoExportar, IcoObra, IcoPersona, IcoVer, diaMes, entero,
} from '@/shared/components/canon'
import { enlaceDescarga, enlaceDrive, estadoVigencia, hayVencimientos, migajaDe, resumirListado } from '../services/documentos'
import { categoriaDe, ETIQUETA_CATEGORIA, PROPOSITO } from '../services/categorias'
import type { ClaseVinculo, Documento } from '../types'

const TONO = { vencido: 'neg', 'vence-pronto': 'warn', vigente: 'pos' } as const
const PALABRA = { vencido: 'Vencido', 'vence-pronto': 'Vence pronto', vigente: 'Vigente' } as const

/** `27`, línea 138. Sin ESTADO ni VENCE mientras no haya una sola fecha cargada. */
const COLS_CON_VENCE = 'minmax(0,1.7fr) minmax(0,1.2fr) minmax(0,1.1fr) 126px 74px 74px 60px'
const COLS_SIN_VENCE = 'minmax(0,1.7fr) minmax(0,1.2fr) minmax(0,1.1fr) 74px 60px'

// UNA ACCIÓN = UN ICONO, y acá una CLASE = UN ICONO: el canónico 27 marca de qué cuelga el archivo
// con el mismo icono con el que se nombra esa entidad en todo el OS. Va con `title` porque solo no
// se lee: «obra», «persona» y «cliente» son tres siluetas parecidas a 13px.
const ICONO: Record<ClaseVinculo, typeof IcoObra> = {
  obra: IcoObra,
  persona: IcoPersona,
  cliente: IcoCliente,
}

const NOMBRE_CLASE: Record<ClaseVinculo, string> = { obra: 'Obra', persona: 'Persona', cliente: 'Cliente' }

function IconoClase({ clase }: { clase: ClaseVinculo }) {
  const Icono = ICONO[clase]
  return (
    <span title={NOMBRE_CLASE[clase]} style={{ display: 'flex', color: C.tenue, flexShrink: 0 }}>
      <Icono s={13} />
    </span>
  )
}

export function TablaDocumentos({
  documentos, seleccionado, hrefs, hoy, vacio,
}: {
  documentos: Documento[]
  seleccionado?: string
  /** Enlace por `drive_file_id`, calculado en el servidor: una función no puede cruzar a este componente. */
  hrefs: Record<string, string>
  /** El día contra el que se mide la vigencia, en ISO. Se pasa: `new Date()` dentro de un
   *  componente lo vuelve imposible de probar y hace que el render dependa del reloj del servidor. */
  hoy: string
  vacio: React.ReactNode
}) {
  const conVence = hayVencimientos(documentos)
  const cols = conVence ? COLS_CON_VENCE : COLS_SIN_VENCE
  // El pie cuenta LAS FILAS DIBUJADAS con el MISMO `hoy` con que se pintó cada pastilla. El total
  // del archivo entero lo dice la banda de arriba, que consulta Postgres: son dos preguntas, y
  // cruzarlas en la misma línea invitaría a leer los vencidos como parte de este listado.
  const totales = resumirListado(documentos, hoy)

  return (
    <TarjetaTabla testid="tabla-documentos" cols={cols}>
      <EncabezadoCanon
        cols={cols}
        columnas={[
          { rotulo: 'DOCUMENTO' },
          { rotulo: 'PERTENECE A' },
          { rotulo: 'PARA QUÉ SIRVE' },
          ...(conVence
            ? [{ rotulo: 'ESTADO' }, { rotulo: 'VENCE', alineacion: 'derecha' as const }]
            : []),
          { rotulo: 'MODIFICADO', alineacion: 'derecha' },
          { rotulo: '', vacia: true },
        ]}
      />

      {documentos.map((d) => {
        const vigencia = estadoVigencia(d.vence, hoy)
        const categoria = categoriaDe(d)
        const proposito = PROPOSITO[categoria]
        const descarga = enlaceDescarga(d.drive_file_id, d.mime_type)
        return (
          <FilaCanon
            key={d.drive_file_id}
            cols={cols}
            alto={ALTO.fila}
            seleccionada={d.drive_file_id === seleccionado}
            // `fila-archivo` y NO `fila-documento`: ese nombre YA es el de la fila de la ficha de
            // proveedor (`administracion/components/BloquesFicha.tsx`). Dos elementos con el mismo
            // identificador de prueba hacen fallar por ambigüedad a cualquier test que los busque, y
            // el mensaje no dice cuál sobra.
            testid="fila-archivo"
          >
            <div style={{ minWidth: 0 }}>
              <Link
                href={hrefs[d.drive_file_id] ?? '#'}
                data-testid="abrir-documento"
                className="block truncate hover:underline"
                style={{ fontSize: '12.5px', color: C.tinta }}
              >
                {d.name}
              </Link>
              {/* LA RUTA ES EL SUBTÍTULO DEL NOMBRE, no una columna: dos archivos que se llaman
                  igual sólo se distinguen por dónde viven, y es lo que hay que copiar para ir a
                  buscarlo a Drive. */}
              <span className="block truncate" style={{ fontSize: '10.5px', color: C.tenue }} data-testid="ubicacion-documento">
                {migajaDe(d.path) ?? 'sin ruta'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              {d.vinculos.length === 0 ? (
                // SIN VÍNCULO NO ES UN ERROR: 2 de cada 3 archivos del Drive no cuelgan de ninguna
                // entidad todavía. Se dice, y la ruta de al lado ubica igual.
                <span style={{ fontSize: '12px', color: C.tenue }}>sin vincular</span>
              ) : (
                <>
                  {/* El icono de la PRIMERA clase: cuando un archivo cuelga de dos entidades, el
                      detalle de abajo las nombra a las dos. Dos iconos en 13px son dos manchas. */}
                  <IconoClase clase={d.vinculos[0].clase} />
                  <div style={{ minWidth: 0 }}>
                    <span className="block truncate" style={{ fontSize: '12px', color: C.tintaSuave }}>
                      {d.vinculos.map((v) => v.nombre).join(' · ')}
                    </span>
                    <span className="block truncate" style={{ fontSize: '10.5px', color: C.tenue }}>
                      {d.vinculos.map((v) => v.detalle ?? `${v.clase} · sin clasificar`).join(' · ')}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* PARA QUÉ SIRVE — el uso; abajo, la categoría que lo produjo. `otros` no tiene uso
                conocido y son la mitad del archivo: la celda lo dice en vez de elegirle uno. */}
            <div style={{ minWidth: 0 }}>
              <span className="block truncate" style={{ fontSize: '12px', color: proposito === null ? C.tenue : C.apagado }}>
                {proposito ?? 'sin clasificar'}
              </span>
              <span className="block truncate" style={{ fontSize: '10.5px', color: C.tenue }} data-testid="categoria-documento">
                {ETIQUETA_CATEGORIA[categoria]}
              </span>
            </div>

            {conVence && (
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                {vigencia === null
                  ? <span style={{ fontSize: '11px', color: C.tenue }}>sin control</span>
                  : <Estado tono={TONO[vigencia]} clave={vigencia}>{PALABRA[vigencia]}</Estado>}
              </div>
            )}
            {conVence && (
              <CeldaTexto
                mono
                tam="11.5px"
                alineacion="derecha"
                color={vigencia === 'vencido' ? C.neg : vigencia === 'vence-pronto' ? C.warn : C.apagado}
              >
                {d.vence ? (diaMes(d.vence) ?? '—') : '—'}
              </CeldaTexto>
            )}

            <CeldaTexto mono tam="11.5px" alineacion="derecha" color={C.apagado}>
              {diaMes(d.modified_time) ?? '—'}
            </CeldaTexto>

            {/* LAS DOS ACCIONES DEL CANÓNICO, Y LAS DOS VAN A DRIVE DE VERDAD. No abren un visor
                inventado: `enlaceDrive` es la vista del archivo y `enlaceDescarga` la descarga
                directa, las mismas dos que ya usa el panel. `target="_blank"` porque salen del OS.
                El clic no debe seleccionar la fila: por eso frena la propagación. */}
            <AccionesDeFila>
              <a
                href={enlaceDrive(d.drive_file_id)}
                target="_blank"
                rel="noreferrer"
                title="Ver en Drive"
                data-testid="ver-en-drive"
                className="flex text-[#C9C4C2] transition-colors hover:text-[#1F1F1E]"
              >
                <span className="sr-only">Ver en Drive</span>
                <IcoVer s={15} />
              </a>
              {/* La descarga NO SE DIBUJA para los 15 archivos nativos de Google del índice: no
                  tienen bytes que bajar, y un «Descargar» que baja 0 bytes es peor que no tenerlo.
                  Lo decide `enlaceDescarga`, que devuelve `null` en ese caso. */}
              {descarga && (
                <a
                  href={descarga}
                  target="_blank"
                  rel="noreferrer"
                  title="Descargar"
                  data-testid="descargar-documento-fila"
                  className="flex text-[#C9C4C2] transition-colors hover:text-[#1F1F1E]"
                >
                  <span className="sr-only">Descargar</span>
                  <IcoExportar s={15} />
                </a>
              )}
            </AccionesDeFila>
          </FilaCanon>
        )
      })}

      {documentos.length === 0 && <VacioCanon testid="documentos-vacio">{vacio}</VacioCanon>}

      {/* EL PIE DE TOTALES DEL CANÓNICO, adentro de la caja.

          VENCIDOS y POR VENCER SÓLO SE DIBUJAN SI HAY AL MENOS UNA FECHA CARGADA entre las filas
          listadas. Con cero fechas —el estado de hoy— un «VENCIDOS 0» se lee «está todo en orden», y
          lo que pasa es que nadie cargó el control. Es la misma regla que aplica la banda de arriba. */}
      {documentos.length > 0 && (
        <div data-testid="totales-documentos">
          <PieCanon
            totales={[
              { rotulo: 'DOCUMENTOS', valor: entero(totales.documentos) ?? '0', testid: 'total-documentos' },
              ...(totales.conVencimiento > 0
                ? [
                    {
                      rotulo: 'VENCIDOS',
                      valor: entero(totales.vencidos) ?? '0',
                      color: totales.vencidos > 0 ? C.neg : C.tinta,
                      testid: 'total-vencidos',
                    },
                    {
                      rotulo: 'POR VENCER 30 D',
                      valor: entero(totales.porVencer) ?? '0',
                      color: totales.porVencer > 0 ? C.warn : C.tinta,
                      testid: 'total-por-vencer-30-d',
                    },
                  ]
                : []),
            ]}
          />
        </div>
      )}
    </TarjetaTabla>
  )
}
