import type React from 'react';

/**
 * Lo que se ve en Datos y en Terminal no se copia: lo que se lleva al
 * portapapeles —con Ctrl+C, el menú del botón derecho o cortando— es
 * «Buen intento». La información se dice en voz alta, que es el juego;
 * copiarla y pegarla en otro lado (o mandársela a otra mesa) se lo
 * salta. Arrastrar el texto seleccionado a otra ventana es la misma
 * copia por otra puerta, así que tampoco.
 *
 * Se esparce en la <section> del puesto: `<section {...ANTICOPIA}>`.
 */
const BUEN_INTENTO = 'Buen intento';

function soloBuenIntento(e: React.ClipboardEvent) {
  e.preventDefault();
  e.clipboardData.setData('text/plain', BUEN_INTENTO);
}

function sinArrastrar(e: React.DragEvent) {
  e.preventDefault();
}

export const ANTICOPIA = { onCopy: soloBuenIntento, onCut: soloBuenIntento, onDragStart: sinArrastrar };
