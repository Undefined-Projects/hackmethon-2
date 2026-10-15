# Prueba end-to-end

Comprueba en un navegador real el renderizado estricto por rol: que al mezclar
roles el árbol de componentes se **destruye** y se reconstruye, en vez de
repintarse conservando estado.

La prueba **reinicia el juego por sí misma** antes de empezar (pulsa "Reiniciar
juego" en el panel), así que puede ejecutarse las veces que haga falta sin
preparar nada. Eso sí: borra el progreso, no la lances con un evento en curso.

## Requisitos

Un Chromium/Chrome local. La ruta está fijada en `test.mjs` (`/usr/bin/chromium`);
cámbiala si tu binario está en otro sitio.

## Uso

```bash
cd server && npm run dev   # terminal 1
cd client && npm run dev   # terminal 2
cd e2e && npm install && npm test
```
