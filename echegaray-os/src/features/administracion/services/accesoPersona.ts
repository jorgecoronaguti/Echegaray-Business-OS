// QUÉ PUEDE HACER LA CUENTA DE ESTA PERSONA — derivado, nunca guardado.
//
// ═══ POR QUÉ ACÁ NO HAY UNA TABLA DE PERMISOS ═══
//
// El design de la Ficha 360 dibuja el bloque «Permisos» como una lista de capacidades con un
// interruptor al lado. Un interruptor sugiere que hay algo que guardar, y no lo hay: los permisos de
// este sistema son EXACTAMENTE lo que contestan `ve_obra()`, `es_administracion()` y `ve_economia()`
// en Postgres a partir de `perfiles.rol`. Guardarlos en una tabla crearía una segunda versión de la
// verdad que se desincroniza el primer día que alguien cambia un rol — es la misma razón por la que
// `usuarios/types.ts` calcula `permisosEfectivos()` en vez de leerlo.
//
// Por eso la lista se DERIVA y se muestra en sólo lectura: se cambia el rol y cambia sola.
//
// ═══ Y POR QUÉ NO SON LAS CINCO DEL DESIGN ═══
//
// El design lista «Registrar su propio avance», «Ver HH de la obra», «Reportar impedimentos» y «Ver
// documentos de la obra». Hoy ninguna de esas cuatro existe como predicado: no hay función en la
// base ni en TypeScript que las conteste, y dibujarlas con un interruptor apagado o encendido sería
// inventar una capacidad que el sistema no distingue. Se listan las CUATRO que sí existen, cada una
// atada a la función que la decide, más la del design que sí es real —el permiso económico—.
//
// LAS FUNCIONES SE IMPORTAN, NO SE COPIAN. Un `rol === 'direccion' || …` escrito acá sería una
// quinta definición del mismo criterio, y la que nadie actualiza.

// RUTAS RELATIVAS CON EXTENSIÓN en los imports de VALOR: `accesoPersona.test.ts` lo ejercita con
// `node --test`, que no conoce el alias `@/`. Es la misma razón anotada en `usuarios/services/reglas.ts`.
import type { Rol } from '@/features/auth/types'
import { esAdministracion, puedeVerRuta, veEconomia, RUTAS_SOLO_ECONOMIA } from '../../auth/types/areas.ts'
import { motivoParaNoRegenerarClave, veTodasLasObras } from '../../usuarios/services/reglas.ts'

export interface Permiso {
  /** La capacidad, dicha para alguien que no sabe qué es una policy. */
  clave: string
  /** Qué abre de verdad. Sin esto, «permiso económico» no le dice nada a nadie. */
  detalle: string
  tiene: boolean
}

/** La regla del design, textual. Va al lado de la lista porque es lo que explica por qué el permiso
 *  económico NO se sigue del nivel: un jefe de obra administra los maestros y no ve el precio. */
export const REGLA_ECONOMICO = 'El permiso económico es una capacidad aparte del rol.'

/**
 * LAS CAPACIDADES DE UN ROL, CADA UNA ATADA A LA FUNCIÓN QUE LA DECIDE.
 *
 * Se pasa el rol y no la cuenta entera a propósito: es una función del rol y de nada más, y así se
 * puede probar los cuatro roles y el `null` sin una base.
 */
export function permisosDelRol(rol: Rol | null | undefined): Permiso[] {
  return [
    {
      clave: 'Entra a todas las obras',
      detalle: 'sin que haya que asignárselas una por una',
      tiene: veTodasLasObras(rol),
    },
    {
      clave: 'Administra los maestros y ve el costo',
      detalle: 'personas, legajos, cuadrillas, clientes y proveedores · el costo presupuestado y el gastado',
      tiene: esAdministracion(rol),
    },
    {
      clave: 'Permiso económico',
      detalle: 'el precio de venta: contratado, margen, certificado, facturado y cobrado',
      tiene: veEconomia(rol),
    },
    {
      clave: 'Gestiona las cuentas y los roles',
      detalle: 'la puerta a todo lo de arriba: quien cambia un rol se lo puede cambiar a sí mismo',
      tiene: veEconomia(rol),
    },
    {
      // NO es `veEconomia`: regenerar una contraseña es un escalón MÁS ARRIBA —quien pone la clave
      // entra con ella— y lo decide `motivoParaNoRegenerarClave`. Escribirlo con `veEconomia` haría
      // que la pantalla afirmara un permiso que la acción del servidor niega.
      clave: 'Restablece contraseñas',
      detalle: 'sólo Dirección: quien pone una clave puede entrar con ella',
      tiene: motivoParaNoRegenerarClave(rol) === null,
    },
  ]
}

/**
 * LAS RUTAS QUE ESTA CUENTA NO ABRE.
 *
 * Sale de `puedeVerRuta` sobre la misma lista que usa el guard, no de una copia: si mañana entra una
 * ruta más a `RUTAS_SOLO_ECONOMIA`, aparece acá sin tocar este archivo. Es la parte concreta del
 * bloque —«permiso económico: no» es abstracto; «no abre Flujo de Caja» se entiende de una—.
 */
export function rutasCerradasPara(rol: Rol | null | undefined): string[] {
  return RUTAS_SOLO_ECONOMIA.filter((r) => !puedeVerRuta(rol, r))
}

/**
 * ═══ QUIÉN PUEDE ABRIR LA SOLAPA «USUARIO Y PERMISOS» ═══
 *
 * La ficha de una persona la abre TODA el área Administración, y desde el 19/08 eso incluye al jefe
 * de obra. Pero `/administracion/usuarios` está cerrada a `ve_economia()` justamente porque es la
 * puerta a los roles, y esta solapa muestra lo mismo —el correo con el que entra alguien, si está
 * bloqueado, cuándo entró por última vez— con los mismos dos botones.
 *
 * Si la solapa se abriera con `es_administracion()`, la ficha sería el camino largo hasta la pantalla
 * que la lista negra cierra. Se cierra con el MISMO predicado, y la solapa ni se dibuja para quien no
 * puede: un botón que lleva a «no tenés permiso» es una pantalla más ancha que la base.
 *
 * ESTO NO ES LA CERRADURA. Las dos acciones vuelven a preguntar quién llama contra la cookie, en
 * `usuariosActions.ts`, porque una acción de servidor se invoca sin abrir jamás esta pantalla.
 */
export const veLaCuentaDeOtro = (rolActor: Rol | null | undefined) => veEconomia(rolActor)
