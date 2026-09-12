# A/B local del 12/09/2026 — `perf/administracion-compras-personas`

Las doce corridas `perf-web-base-*` y `perf-web-cambio-*` de este directorio **no son producción**: su
campo `base` dice `http://127.0.0.1:3178`. Son dos builds de producción del MISMO commit salvo el
diff de la rama, servidos por `next start` en esta VM contra el Supabase real, seis corridas por
lado, reiniciando el servidor antes de cada una para que «frío» sea frío.

No se midió en `app.ecsas.com.ar` porque el cambio no está desplegado y esta rama no mergea: medir
producción habría medido `main`.

## Medianas de `doc` frío (n=6 por lado)

| ruta | base | con el cambio |
|---|---|---|
| `/administracion` | 3.578 ms | **792 ms** |
| `/administracion/compras` | 1.268 ms | **1.060 ms** |
| `/administracion/personas` | 867 ms | **428 ms** |
| `/clientes` *(no se tocó — es el control)* | 1.610 ms | 2.699 ms |

**LA FILA DE CONTROL SE LEE PRIMERO.** `/clientes` no se tocó y empeoró un 68% entre las dos mitades
de la medición: Supabase se degradó con la tarde (hay corridas con `doc` de 8 s y 22 s en rutas
triviales). Las tres mejoras de arriba se consiguieron **mientras el entorno empeoraba**, así que el
número real es mejor que el que muestra la tabla — y por el mismo motivo ninguna de estas cifras
sirve como promesa de producción.

## Lo que NO depende del ruido

| | base | con el cambio |
|---|---|---|
| `/administracion`, archivos de JS del viaje | 35 | 21 |
| `/administracion`, redirección | meta refresh de **1.000 ms** | **307 de 10 ms** |
| `/administracion/compras`, viajes a PostgREST | 8 en 3 rondas seriales | **7 en 1 ronda** |
| `/administracion/personas`, viajes a PostgREST | 10 | **7** |
| chunk de `supabase-js` (177 kB) en el primer load de Compras | sí | **no** |

## La trampa que pagó esta medición

Las primeras cuatro corridas fueron a la basura y se borraron: `matar` mataba el `npx` y no al
`next-server`, que es su nieto, así que los cuatro `next start` fallaron con `EADDRINUSE` y midieron
el servidor VIEJO. El antes y el después salieron del MISMO build y el «después» parecía diez veces
mejor. `medir.sh` ahora mata por PUERTO y ABORTA si el log no dice «Ready».
