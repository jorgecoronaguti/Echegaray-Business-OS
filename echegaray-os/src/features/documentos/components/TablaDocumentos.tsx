// 27 · DOCUMENTOS v2 — el archivo sin caja. Porte literal de `27 · Documentos v2.dc.html`.
//
// ═══ DE SIETE COLUMNAS A CUATRO ═══
//
// DOCUMENTO · CUELGA DE · CARPETA · VENCE. El porte de agosto dibujaba DOCUMENTO · PERTENECE A ·
// PARA QUÉ SIRVE · ESTADO · VENCE · MODIFICADO · acciones, dentro de una tarjeta con encabezado
// gris y pie de totales. Qué se fue y adónde:
//
//   PARA QUÉ SIRVE   la categoría sube al lado del nombre, en 10,5px (`27v2:113`). Era una columna
//                    entera para una palabra derivada del nombre del archivo.
//   ESTADO           la pastilla «Vencido / Vence pronto / Vigente» se va: lo dice el COLOR DE LA
//                    FECHA y el filo de la fila, sin gastar 126px en repetir lo que la columna de
//                    al lado ya dice con su número. El estado nunca queda sólo en el color — la
//                    fecha en ámbar es una fecha, y el bloque de trabajo de arriba la nombra.
//   MODIFICADO       baja al panel. Es la fecha de la última edición en Drive, no la de la carga:
//                    útil para desempatar dos versiones, no para encontrar un papel.
//   ACCIONES         bajan al panel. Ver en Drive y descargar son dos iconos por fila (300 objetivos
//                    de clic en una lista de 100) para dos acciones que se hacen de a una.
//   UBICACIÓN        deja de ser el subtítulo del nombre y vuelve a ser COLUMNA («Carpeta»): es lo
//                    que ordena el archivo, y como subtítulo competía con el nombre por el ancho.
//
// ═══ LA FILA NO PROMETE UN CONTROL QUE NO EXISTE ═══
//
// «Vence» es la única columna con fecha, y escribe tres cosas distintas: la fecha, «sin fecha» —el
// papel está en un legajo y nadie le cargó el vencimiento— y «—» cuando ese papel no vence. Los
// tres son hechos distintos y ninguno es «vigente».
//
// ═══ EL NOMBRE DEL ARCHIVO NUNCA SE ESTRANGULA ═══
//
// Es lo que se busca. Por debajo de 1250px cae CARPETA —dónde vive, no qué es— (`27v2:145`). Su
// `display` NUNCA va inline: un estilo inline le gana a cualquier media query.

import Link from 'next/link'
import { IconoDocumento, IconoFoto, IconoPresupuesto } from '@/shared/components/iconos'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, RotuloCol, V } from '@/shared/components/v2/patron'
import { diaMes } from '@/shared/components/canon/formato'
import { estadoVigencia, migajaDe } from '../services/documentos'
import { categoriaDe, ETIQUETA_CATEGORIA } from '../services/categorias'
import type { Documento } from '../types'

/** `27v2:145`. Literales porque Tailwind no compila una clase armada en runtime. */
const COLS
  = 'grid-cols-[minmax(280px,2fr)_minmax(0,1fr)_minmax(0,190px)_minmax(0,80px)]'
  + ' max-[1249px]:grid-cols-[minmax(230px,1.9fr)_minmax(0,1fr)_minmax(0,80px)]'
const SOLO_ANCHO = 'max-[1249px]:hidden'

/** UN TIPO = UN ICONO (`27v2:112`). El del §11, no uno redibujado. */
const ICONO_TIPO: Record<string, (p: { className?: string }) => React.ReactElement> = {
  planilla: IconoPresupuesto,
  imagen: IconoFoto,
}

export function TablaDocumentos({
  documentos, seleccionado, hrefs, hoy, vacio,
}: {
  documentos: Documento[]
  seleccionado?: string
  /** Enlace por `drive_file_id`, calculado en el servidor: una función no cruza a este componente. */
  hrefs: Record<string, string>
  /** El día contra el que se mide la vigencia, en ISO. Se pasa: `new Date()` dentro de un
   *  componente lo vuelve imposible de probar y hace que el render dependa del reloj del servidor. */
  hoy: string
  vacio: React.ReactNode
}) {
  return (
    <div data-testid="tabla-documentos">
      <div className={`grid gap-[14px] ${COLS}`} style={{ ...ENCABEZADO, paddingLeft: 13 }}>
        <RotuloCol>Documento</RotuloCol>
        <RotuloCol>Cuelga de</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol>Carpeta</RotuloCol></span>
        <RotuloCol derecha>Vence</RotuloCol>
      </div>

      {documentos.map((d) => {
        const vigencia = estadoVigencia(d.vence, hoy)
        const categoria = categoriaDe(d)
        const Icono = ICONO_TIPO[d.tipo ?? ''] ?? IconoDocumento
        const elegido = d.drive_file_id === seleccionado
        // SÓLO UN PAPEL DE LEGAJO PUEDE «NO TENER FECHA»: es la única tabla de vínculo con
        // `fecha_vencimiento`. Para el resto, la ausencia de fecha no es un pendiente — es que ese
        // archivo no vence, y escribirle «sin fecha» inventaría un control que no le corresponde.
        const enLegajo = d.vinculos.some((v) => v.legajoId !== null)
        return (
          <Link
            key={d.drive_file_id}
            href={hrefs[d.drive_file_id] ?? '#'}
            prefetch={false}
            role="row"
            data-testid="fila-archivo"
            data-seleccionada={elegido ? '' : undefined}
            className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS} ${elegido ? '' : 'hover:bg-[#F2F1ED]'}`}
            style={{
              height: ALTO_V2.fila,
              paddingLeft: 13,
              borderBottom: `1px solid ${V.lineaFila}`,
              background: elegido ? V.seleccion : undefined,
              // El filo dice «esto bloquea» y sobrevive a la selección, que va sólo en el fondo.
              boxShadow: vigencia === 'vencido'
                ? `inset 2px 0 0 ${V.neg}`
                : vigencia === 'vence-pronto' ? `inset 2px 0 0 ${V.warn}` : undefined,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                <Icono className="h-[15px] w-[15px]" />
              </span>
              <span data-testid="abrir-documento" className="truncate" style={{ fontSize: '12.5px', color: V.tinta }}>
                {d.name}
              </span>
              {/* LA CATEGORÍA, al lado del nombre y no en su propia columna. Se deriva de la ruta y
                  del nombre (`categorias.ts`); mostrarla acá es lo que permite AUDITAR el filtro de
                  arriba mirando lo que devolvió. */}
              <span data-testid="categoria-documento" style={{ fontSize: '10.5px', color: V.lupa, flexShrink: 0 }}>
                {ETIQUETA_CATEGORIA[categoria]}
              </span>
            </span>

            {/* SIN VÍNCULO NO ES UN ERROR: 2 de cada 3 archivos del Drive no cuelgan de ninguna
                entidad todavía. Se dice, y la carpeta de al lado ubica igual. */}
            <span
              className="truncate"
              style={{ fontSize: '12px', color: d.vinculos.length ? V.tintaSuave : V.lupa }}
            >
              {d.vinculos.length ? d.vinculos.map((v) => v.nombre).join(' · ') : 'sin vincular'}
            </span>

            <span
              className={`font-mono truncate ${SOLO_ANCHO}`}
              data-testid="ubicacion-documento"
              style={{ fontSize: '11.5px', color: V.tenue }}
            >
              {migajaDe(d.path) ?? 'sin ruta'}
            </span>

            {/* TRES RESPUESTAS DISTINTAS, Y NINGUNA ES «VIGENTE»: la fecha, «sin fecha» (está en un
                legajo y nadie la cargó) y «—» (este papel no vence). */}
            <span
              className="font-mono tabular-nums"
              style={{
                fontSize: '11.5px', textAlign: 'right',
                color: vigencia === 'vencido' ? V.neg : vigencia === 'vence-pronto' ? V.warn : vigencia === null ? V.lupa : V.cuentaApagada,
              }}
            >
              {d.vence ? (diaMes(d.vence) ?? '—') : enLegajo ? 'sin fecha' : '—'}
            </span>
          </Link>
        )
      })}

      {documentos.length === 0 && (
        <div style={{ padding: '24px 2px', fontSize: '12.5px', color: V.apagado }} data-testid="documentos-vacio">
          {vacio}
        </div>
      )}
    </div>
  )
}
