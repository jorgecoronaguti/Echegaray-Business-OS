// LA NOTA CUANDO SU TABLA TODAVÍA NO EXISTE — QUE FALLE CERRADO Y QUE LO DIGA.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// `20260819T2000_la_nota_manual_del_cliente` está en el repositorio y NO en la base: las migraciones
// no las aplica un agente. Esa ventana existe y hay UN solo desenlace inaceptable: alguien escribe
// «llamé al arquitecto, la certificación de agosto entra en septiembre», la pantalla contesta «Nota
// guardada», y no hay ninguna fila en ninguna parte. Un dato que se cree guardado y no existe es
// peor que un dato que falta, porque nadie lo va a volver a cargar.
//
// Lo que se prueba acá es la GUARDA: que reconozca los dos códigos con los que la base dice «esa
// tabla no está», que NO confunda ese caso con cualquier otro error —un rechazo de RLS no es una
// migración faltante y no se arregla aplicando nada—, y que el mensaje nombre la migración, que es
// lo único que desbloquea la situación.
//
// Si alguien revierte `faltaLaTablaDeNotas` a mirar un solo código, o le saca el nombre de la
// migración al mensaje, algo de acá se pone rojo.
//
// Se importa el .ts DE VERDAD (Node 24 saca los tipos solo). Una copia probaría la copia.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MIGRACION_NOTAS, avisoDeNotasPendiente, faltaLaTablaDeNotas, mensajeDeNotasPendiente,
} from '../../src/features/clientes/services/notaPendiente.ts'

test('PGRST205 es «la tabla no existe»: es lo que contesta PostgREST hoy contra la base real', () => {
  assert.equal(faltaLaTablaDeNotas({ code: 'PGRST205' }), true)
})

test('42P01 también: es Postgres diciendo undefined_table, y mirar sólo uno de los dos deja media ventana sin cubrir', () => {
  // PostgREST cachea el esquema. En los minutos que siguen a un `create table` recién aplicado
  // contesta PGRST205 aunque la tabla exista; con la migración sin aplicar y sin caché de por medio
  // el que llega es 42P01. Los dos son el mismo hecho para quien mira la pantalla.
  assert.equal(faltaLaTablaDeNotas({ code: '42P01' }), true)
})

test('un rechazo de RLS NO es una migración faltante', () => {
  // 42501 = insufficient_privilege. Tratarlo como migración faltante mandaría a aplicar un SQL que
  // ya está aplicado, y dejaría sin diagnosticar el problema real, que es de permisos.
  assert.equal(faltaLaTablaDeNotas({ code: '42501' }), false)
  assert.equal(faltaLaTablaDeNotas({ code: '23505' }), false)
  assert.equal(faltaLaTablaDeNotas({ code: 'PGRST204' }), false)
})

test('sin error, y con error sin código, no hay migración faltante que declarar', () => {
  assert.equal(faltaLaTablaDeNotas(null), false)
  assert.equal(faltaLaTablaDeNotas(undefined), false)
  assert.equal(faltaLaTablaDeNotas({}), false)
})

test('el mensaje de escritura nombra la migración y dice que NO guardó nada', () => {
  const m = mensajeDeNotasPendiente()
  // El nombre de la migración es lo único accionable del mensaje: sin él, quien lo lee sabe que
  // falló y no sabe qué hacer.
  assert.ok(m.includes(MIGRACION_NOTAS), `el mensaje no nombra la migración: ${m}`)
  // Y tiene que decir que no se guardó. Un mensaje ambiguo sobre una escritura fallida deja a la
  // persona sin saber si tiene que volver a escribirla.
  assert.match(m, /No guardé nada/)
})

test('el aviso de lectura nombra la migración y aclara que el resto de la actividad sí se lee', () => {
  const a = avisoDeNotasPendiente()
  assert.ok(a.includes(MIGRACION_NOTAS), `el aviso no nombra la migración: ${a}`)
  assert.match(a, /resto de la actividad/)
})

test('el nombre de la migración es el del archivo que hay que aplicar, sin extensión ni ruta', () => {
  // Copiado a mano en dos lugares, se desincroniza. Esto ata la constante al archivo real.
  assert.equal(MIGRACION_NOTAS, '20260819T2000_la_nota_manual_del_cliente')
})
