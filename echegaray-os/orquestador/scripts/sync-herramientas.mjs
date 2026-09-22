#!/usr/bin/env node
// RETIRADO 21/09/2026. Copiaba el AppSheet «GESTION DE MATERIALES» a la base.
//
// Decisión del dueño: «no se usa appsheet» y «todo debe funcionar por bd nada de sheet». Con la
// migración 20260921T2100 las herramientas viven en `activo` / `activo_movimiento` y las tablas que
// este script escribía pasaron a ser vistas de sólo lectura: escribirles falla.
//
// El archivo queda, y sale con 0, porque la unidad echegaray-pedidos-sync.service lo sigue invocando
// después del sync de pedidos: si faltara, la unidad quedaría en «failed» todos los ciclos. Cuando la
// unidad deje de llamarlo, este archivo se borra.
console.log('sync del AppSheet de herramientas: retirado el 21/09/2026 (las herramientas viven en la base)')
