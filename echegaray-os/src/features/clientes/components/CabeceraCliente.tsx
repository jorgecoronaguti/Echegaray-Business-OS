// LA CABECERA DE LA FICHA DE CLIENTE — canónico 26, y calcada en los mockups 28, 31 y 32.
//
// ═══ POR QUÉ SALIÓ DE `page.tsx` ═══
//
// La página pasó de 453 a 575 líneas cuando las tres caras nuevas sumaron su pastilla y su fila de
// acciones; el tope del repo son 500. Lo que se fue de ahí es exactamente lo que NO decide nada: el
// dibujo de la identidad. La página sigue decidiendo qué leer, quién ve qué y qué cara abrir.
//
// Es un Server Component. `Pastilla` y las tres `Acciones*` viven en módulos `'use client'` y
// cruzan la frontera como COMPONENTES —que React proxea—, no como valores, que es lo que
// `orquestador/lib/frontera-servidor-cliente.test.mjs` prohíbe.
//
// CADA CARA TRAE SU PASTILLA Y SUS ACCIONES, que es como lo dibuja cada mockup: la 28 corona con
// «Registrar cobro» y lo vencido en rojo (`28:41`), la 32 con «Publicar al cliente» y «N cambios
// sin publicar» (`32:26`), la 31 con «Agregar mail» y «Portal activo» (`31:44`). No se acumulan con
// «Editar»: el mockup pone una sola fila y la primaria pertenece a la cara que se está mirando.

import { BotonEnlace } from '@/shared/components/ds'
import {
  CabeceraFicha, HechoFicha, PastillaFicha, Punto,
} from '@/features/administracion/components/FichaCanonica'
import { AccionesAccesos, AccionesCuenta, AccionesEsquema } from './canon/AccionesDeVista'
import { SolapasFicha, type Solapa as SolapaVisible } from './canon/SolapasFicha'
import { Pastilla } from './canon/Piezas'
import { Ico, P } from './canon/Iconos'
import { montoM } from '../services/cobranzaFormato'
import type { Solapa } from '../services/solapasCliente'
import type { ClientePanel } from '../types'

export function CabeceraCliente({
  cliente, solapa, solapas, veEconomia, puedeEditar, obrasEnCurso, urlEditar, editando,
  vencido, sinPublicar, portalActivo,
}: {
  cliente: ClientePanel
  solapa: Solapa
  solapas: SolapaVisible[]
  veEconomia: boolean
  puedeEditar: boolean
  obrasEnCurso: number
  urlEditar: string
  editando: boolean
  /** Lo vencido de la cuenta corriente. `null` = no hay dato, que NO es cero. */
  vencido: number | null
  sinPublicar: number
  portalActivo: boolean
}) {
  return (
    // A SANGRE (`-mx`): su filo inferior es el que separa la identidad del cuerpo, y un filo que
    // arranca a 40px del borde no separa nada.
    <div className="-mx-4 mb-4 lg:-mx-10">
      <CabeceraFicha
        testid="slab-cliente"
        volverA="/clientes"
        volverLabel="Clientes"
        titulo={cliente.nombre_comercial}
        avatar={
          // EL GLIFO DE EMPRESA, el mismo que lleva el proveedor. Un cliente no tiene iniciales de
          // persona: «La Estrella» abreviado a «LE» al lado de su propio nombre no agrega nada.
          // Cuadrado con radio 10 (`26:41`), no un círculo: el círculo es el avatar de una PERSONA.
          <span
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#F2F1ED] text-[#3A3A38]"
            data-testid="glifo-cliente"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 21v-5h6v5" /><path d="M9 10h.01M15 10h.01" />
            </svg>
          </span>
        }
        pastillas={
          <>
            {/* ARCHIVADO GANA SOBRE EL RESTO: es la razón por la que esta ficha no aparece en la
                cartera, y saberlo cambia lo que se hace con ella. */}
            <PastillaFicha
              tono={!cliente.activo ? 'neutro' : obrasEnCurso > 0 ? 'curso' : 'neutro'}
              testid="pastilla-estado-cliente"
            >
              {!cliente.activo
                ? 'Archivado'
                : obrasEnCurso > 0
                  ? `${obrasEnCurso} ${obrasEnCurso === 1 ? 'obra en curso' : 'obras en curso'}`
                  : 'Sin obra en curso'}
            </PastillaFicha>

            {/* Lo vencido, en rojo, al lado del nombre. Sólo cuando hay algo vencido: una pastilla
                «$ 0 vencido» permanente entrena a no mirar el rojo, que es justo lo que esta
                pastilla existe para lograr. */}
            {solapa === 'cuenta' && vencido != null && vencido > 0 && (
              <Pastilla tono="neg" icono={<Ico d={P.alerta} s={12} w={2.2} />} testid="pastilla-vencido">
                {montoM(vencido)} vencido
              </Pastilla>
            )}

            {/* Lo que el cliente TODAVÍA NO VIO: es la pastilla que justifica el botón «Publicar al
                cliente» de al lado. */}
            {solapa === 'esquema' && sinPublicar > 0 && (
              <Pastilla tono="warn" icono={<Ico d={P.reloj} s={12} w={2.2} />} testid="pastilla-sin-publicar">
                {sinPublicar} {sinPublicar === 1 ? 'cambio sin publicar' : 'cambios sin publicar'}
              </Pastilla>
            )}

            {/* El portal está vivo cuando hay al menos un mail que entra. Sin ninguno no se dibuja
                nada: «Portal inactivo» sonaría a una falla y es sólo que nadie lo habilitó todavía,
                que ya lo dice la tabla vacía de abajo. */}
            {solapa === 'accesos' && portalActivo && (
              <Pastilla tono="pos" icono={<Ico d={P.okCirculo} s={12} w={2.2} />} testid="pastilla-portal">
                Portal activo
              </Pastilla>
            )}
          </>
        }
        hechos={
          <>
            <HechoFicha>{cliente.razon_social?.trim() || 'sin razón social'}</HechoFicha>
            <Punto />
            {/* EL CUIT EN MONO TABULAR: es un número que se compara contra ARCA y contra el banco,
                y en proporcional los dígitos no se alinean con nada. La ausencia va en texto normal
                porque no es un número — escribirla en mono la disfraza de dato. */}
            {cliente.cuit
              ? <HechoFicha mono>{cliente.cuit}</HechoFicha>
              : <HechoFicha>sin CUIT</HechoFicha>}
            <Punto />
            <HechoFicha>{cliente.responsable_nombre ?? 'sin responsable asignado'}</HechoFicha>
          </>
        }
        acciones={
          solapa === 'cuenta' && veEconomia
            ? <AccionesCuenta />
            : solapa === 'esquema' && veEconomia
              ? <AccionesEsquema />
              : solapa === 'accesos' && veEconomia
                ? <AccionesAccesos />
                : puedeEditar && (
                  // UNA SOLA ACCIÓN en las caras viejas. El canónico pone acá la primaria «Nueva
                  // obra»; en esta pantalla esa alta ES un formulario que vive dentro del bloque
                  // Obras (`alta-obra`), y un segundo botón con el mismo nombre daría dos entradas a
                  // la misma escritura. Queda declarado como desviación.
                  <BotonEnlace href={urlEditar} data-testid="editar-ficha">
                    {editando ? 'Cerrar edición' : 'Editar'}
                  </BotonEnlace>
                )
        }
        solapas={
          /* DENTRO de la cabecera y pegadas abajo, para que la activa se apoye sobre su filo.
             Cambian de vista, no de página: el estado viaja en `?vista=`, así que cada cara es una
             dirección compartible y «atrás» vuelve a la anterior. Quién ve cada una lo decide
             `solapasDeCliente`, que está probada. */
          <SolapasFicha testid="solapas-cliente" items={solapas} />
        }
      />
    </div>
  )
}
