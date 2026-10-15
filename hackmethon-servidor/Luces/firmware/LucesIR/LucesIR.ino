/*
 * LucesIR 3.0 - emisor multi-pin y receptor, controlados por serial.
 *
 *   Pines 2..10 -> emisores IR (cada LED con su resistencia en serie)
 *   Pin 11      -> receptor IR (modulo demodulador tipo TSOP38238, OUT aqui)
 *   Pin 13      -> LED integrado, espejo de actividad
 *
 * La placa no guarda nada. Toda la informacion (botones, nombres, ondas)
 * vive en el servidor; aqui solo se ejecutan ordenes.
 *
 * Los pines 0 y 1 son RX/TX del serial y se dejan en paz. Una version
 * anterior apagaba el transmisor entre respuestas para poder emitir
 * tambien por el pin 1; funcionaba, pero metia un byte 0x00 de basura
 * tras cada linea y dejaba TX en bajo, lo que hacia fallar las subidas
 * de sketch con "not in sync". Con nueve emisores en los pines 2..10 no
 * hace falta, asi que el serial queda estandar.
 *
 * ---- Como se genera la portadora ----
 * El Timer2 corre en CTC a 76 kHz (el doble de la portadora) y su
 * interrupcion invierte una mascara de pines. Emitir es habilitar la
 * interrupcion; callar es deshabilitarla y forzar los pines a LOW. Asi
 * cualquier pin sirve de emisor, no solo el 11 como con la salida OC2A.
 *
 * Como la portadora la lleva el hardware, el CPU queda libre para
 * muestrear el receptor mientras emite: por eso cada envio puede
 * verificarse solo, escuchando su propia luz.
 *
 * ---- Protocolo ----
 * Lineas de texto a 115200 baud terminadas en \n. Una linea de respuesta
 * por comando, empezando con "OK " o con "ERR ".
 *
 *   PING                      -> OK PONG LucesIR 3.0
 *   INFO                      -> OK INFO pin_rx=11 pines_validos=2,...,10
 *   LEVEL                     -> OK LEVEL actual=<0|1> reposo=<0|1>
 *
 *   SEND <freq> <rep> <gap> <pines> <d1> <d2> ... <dn>
 *     <pines> es una mascara de bits: el bit N encendido significa emitir
 *     por el pin N. Por ejemplo 4 = solo pin 2; 12 = pines 2 y 3.
 *     -> OK SENT pulsos=<n> rep=<r> pines=<m> eco=<e>
 *     "eco" es cuantos pulsos oyo el receptor de la propia emision.
 *     Si sale 0, por esos pines no salio luz.
 *
 *   CAPTURE <timeout_ms>
 *     Espera una trama del control remoto y devuelve sus duraciones.
 *     -> OK CAPTURED <d1> <d2> ... <dn>   |   ERR TIMEOUT
 *
 *   BLINK <freq> <pines> <ms>
 *     Portadora continua hasta 3000 ms, para identificar un LED a ojo
 *     con la camara de un celular.
 *     -> OK BLINK pines=<m> ms=<t>
 */

const uint8_t PIN_RX  = 11;   // receptor
const uint8_t PIN_LED = 13;   // LED integrado

// Pines habilitados para emitir: 2..10. Quedan fuera el 0 y el 1 (serial),
// el 11 (receptor) y el 13 (LED de estado). El 12 queda libre.
const uint16_t PINES_VALIDOS = 0x07FC;
const uint16_t PINES_DEFECTO = (1 << 2);

const uint16_t      MAX_PULSOS   = 200;
const uint16_t      MAX_BLINK_MS = 3000;
const unsigned long FIN_TRAMA_US = 15000UL;  // silencio que cierra una trama
const uint8_t       MIN_PULSOS   = 4;        // menos que esto es ruido

// Un solo arreglo sirve para emitir y para capturar: nunca se hacen las
// dos cosas con datos distintos a la vez. Del eco de una emision solo
// interesa la cuenta, no las duraciones, asi que no necesita buffer.
unsigned int pulso[MAX_PULSOS];
uint16_t     nPulsos = 0;

uint8_t       nivelReposo;
uint8_t       ultimoNivel;
unsigned long tUltimaTransicion = 0;
bool          capturando = false;

// Mascaras de puerto que invierte la interrupcion. Volatiles porque se
// leen dentro de la ISR y se escriben fuera.
volatile uint8_t maskD = 0;   // pines 2..7  -> PORTD bits 2..7
volatile uint8_t maskB = 0;   // pines 8..10 -> PORTB bits 0..2

// ---------- parser ----------
char          tok[16];
uint8_t       tokLen = 0;
uint8_t       campo  = 0;
uint8_t       cmd    = 0;
unsigned long arg[4];
uint8_t       nArg   = 0;

// ============ portadora ============
ISR(TIMER2_COMPA_vect) {
  PORTD ^= maskD;
  PORTB ^= maskB;
}

void portadoraFreq(unsigned long hz) {
  if (hz < 25000UL) hz = 25000UL;
  if (hz > 60000UL) hz = 60000UL;
  // La interrupcion dispara al doble de la portadora: cada disparo
  // invierte los pines y hacen falta dos inversiones por ciclo.
  unsigned long div = F_CPU / (2UL * hz);
  if (div < 1)   div = 1;
  if (div > 256) div = 256;
  TCCR2A = (1 << WGM21);     // CTC, sin conectar ninguna salida OC2x
  TCCR2B = (1 << CS20);      // prescaler 1
  OCR2A  = (uint8_t)(div - 1);
}

void pinesEnBajo() {
  PORTD &= ~maskD;
  PORTB &= ~maskB;
}

void portadoraOn() {
  pinesEnBajo();
  TCNT2   = 0;
  TIFR2  |= (1 << OCF2A);        // descarta una bandera pendiente
  TIMSK2 |= (1 << OCIE2A);
}

void portadoraOff() {
  TIMSK2 &= ~(1 << OCIE2A);
  pinesEnBajo();
}

bool configurarPines(uint16_t mascara) {
  if (mascara == 0)             return false;
  if (mascara & ~PINES_VALIDOS) return false;

  portadoraOff();
  maskD = (uint8_t)( mascara        & 0x00FC);   // pines 2..7
  maskB = (uint8_t)((mascara >> 8)  & 0x0007);   // pines 8..10

  DDRD |= maskD;  PORTD &= ~maskD;
  DDRB |= maskB;  PORTB &= ~maskB;
  return true;
}

// ============ captura ============
void reiniciarCaptura() {
  nPulsos = 0;
  capturando = false;
  ultimoNivel = digitalRead(PIN_RX);
  tUltimaTransicion = micros();
}

// Devuelve true cuando una trama quedo cerrada y completa.
bool muestrear() {
  uint8_t nivel = digitalRead(PIN_RX);
  unsigned long ahora = micros();

  if (nivel != ultimoNivel) {
    if (!capturando) {
      capturando = true;         // primera transicion: arranca la trama
      nPulsos = 0;
    } else if (nPulsos < MAX_PULSOS) {
      unsigned long d = ahora - tUltimaTransicion;
      pulso[nPulsos++] = (d > 65535UL) ? 65535 : (unsigned int)d;
    }
    tUltimaTransicion = ahora;
    ultimoNivel = nivel;
    digitalWrite(PIN_LED, (nivel != nivelReposo) ? HIGH : LOW);
  }
  else if (capturando && nivel == nivelReposo &&
           (ahora - tUltimaTransicion) > FIN_TRAMA_US) {
    capturando = false;
    digitalWrite(PIN_LED, LOW);
    if (nPulsos >= MIN_PULSOS) return true;
    nPulsos = 0;                 // ruido suelto, se descarta
  }
  return false;
}

// Version ligera para el eco de una emision: solo cuenta transiciones.
uint16_t ecoTransiciones = 0;
uint8_t  ecoNivel;
void muestrearEco() {
  uint8_t nivel = digitalRead(PIN_RX);
  if (nivel != ecoNivel) { ecoTransiciones++; ecoNivel = nivel; }
}

// ============ comandos ============
void cmdSend() {
  if (nPulsos == 0) { Serial.println(F("ERR SIN_PULSOS")); return; }

  unsigned long freq  = (nArg > 0 && arg[0] > 0) ? arg[0] : 38000UL;
  unsigned int  rep   = (nArg > 1 && arg[1] > 0) ? (unsigned int)arg[1] : 1;
  unsigned int  gap   = (nArg > 2) ? (unsigned int)arg[2] : 40;
  uint16_t      pines = (nArg > 3 && arg[3] > 0) ? (uint16_t)arg[3] : PINES_DEFECTO;

  if (!configurarPines(pines)) { Serial.println(F("ERR PINES_INVALIDOS")); return; }

  portadoraFreq(freq);
  uint16_t nEnviados = nPulsos;
  uint32_t ecoTotal  = 0;

  for (unsigned int r = 0; r < rep; r++) {
    ecoTransiciones = 0;
    ecoNivel = digitalRead(PIN_RX);

    for (uint16_t i = 0; i < nEnviados; i++) {
      if (i % 2 == 0) portadoraOn();
      else            portadoraOff();
      unsigned long fin = micros() + pulso[i];
      while ((long)(fin - micros()) > 0) muestrearEco();
    }
    portadoraOff();

    // Deja que el receptor suelte la ultima marca antes de contarla.
    unsigned long t0 = millis();
    while (millis() - t0 < 25) muestrearEco();

    // n pulsos emitidos producen n+1 transiciones en el receptor.
    if (ecoTransiciones > 0) ecoTotal += (ecoTransiciones - 1);
    if (r + 1 < rep) delay(gap);
  }

  Serial.print(F("OK SENT pulsos="));
  Serial.print(nEnviados);
  Serial.print(F(" rep="));
  Serial.print(rep);
  Serial.print(F(" pines="));
  Serial.print(pines);
  Serial.print(F(" eco="));
  Serial.println(ecoTotal / rep);
}

void cmdCapture() {
  unsigned long timeout = (nArg > 0 && arg[0] > 0) ? arg[0] : 10000UL;
  reiniciarCaptura();

  unsigned long t0 = millis();
  while (millis() - t0 < timeout) {
    if (muestrear()) {
      Serial.print(F("OK CAPTURED"));
      for (uint16_t i = 0; i < nPulsos; i++) {
        Serial.print(' ');
        Serial.print(pulso[i]);
      }
      Serial.println();
      return;
    }
  }
  Serial.println(F("ERR TIMEOUT"));
}

void cmdBlink() {
  unsigned long freq  = (nArg > 0 && arg[0] > 0) ? arg[0] : 38000UL;
  uint16_t      pines = (nArg > 1) ? (uint16_t)arg[1] : PINES_DEFECTO;
  unsigned long ms    = (nArg > 2 && arg[2] > 0) ? arg[2] : 1000UL;
  if (ms > MAX_BLINK_MS) ms = MAX_BLINK_MS;

  if (!configurarPines(pines)) { Serial.println(F("ERR PINES_INVALIDOS")); return; }

  portadoraFreq(freq);
  portadoraOn();
  delay(ms);
  portadoraOff();

  Serial.print(F("OK BLINK pines="));
  Serial.print(pines);
  Serial.print(F(" ms="));
  Serial.println(ms);
}

void cmdInfo() {
  Serial.print(F("OK INFO pin_rx="));
  Serial.print(PIN_RX);
  Serial.print(F(" max_pulsos="));
  Serial.print(MAX_PULSOS);
  Serial.print(F(" reposo="));
  Serial.print(nivelReposo);
  Serial.print(F(" mascara_valida="));
  Serial.print(PINES_VALIDOS);
  Serial.print(F(" pines_validos="));
  bool primero = true;
  for (uint8_t p = 0; p <= 13; p++) {
    if (PINES_VALIDOS & (1 << p)) {
      if (!primero) Serial.print(',');
      Serial.print(p);
      primero = false;
    }
  }
  Serial.println();
}

void ejecutar() {
  switch (cmd) {
    case 1: Serial.println(F("OK PONG LucesIR 3.0")); break;
    case 2: cmdInfo();    break;
    case 3: cmdSend();    break;
    case 4: cmdCapture(); break;
    case 5: cmdBlink();   break;
    case 6:
      Serial.print(F("OK LEVEL actual="));
      Serial.print(digitalRead(PIN_RX));
      Serial.print(F(" reposo="));
      Serial.println(nivelReposo);
      break;
    default: Serial.println(F("ERR CMD_DESCONOCIDO")); break;
  }
}

// Los numeros se guardan conforme llegan, sin acumular la linea entera:
// una trama larga son ~1 KB de texto y la Uno tiene 2 KB de RAM.
void tokenTerminado() {
  tok[tokLen] = '\0';

  if (campo == 0) {
    if      (!strcmp(tok, "PING"))    cmd = 1;
    else if (!strcmp(tok, "INFO"))    cmd = 2;
    else if (!strcmp(tok, "SEND"))    cmd = 3;
    else if (!strcmp(tok, "CAPTURE")) cmd = 4;
    else if (!strcmp(tok, "BLINK"))   cmd = 5;
    else if (!strcmp(tok, "LEVEL"))   cmd = 6;
    else                              cmd = 255;
    nPulsos = 0;
    nArg = 0;
  } else {
    unsigned long v = strtoul(tok, NULL, 10);
    if (cmd == 3) {
      if (nArg < 4) arg[nArg++] = v;
      else if (nPulsos < MAX_PULSOS) pulso[nPulsos++] = (v > 65535UL) ? 65535 : (unsigned int)v;
    } else if (cmd == 4) {
      if (nArg < 1) arg[nArg++] = v;
    } else if (cmd == 5) {
      if (nArg < 3) arg[nArg++] = v;
    }
  }
  campo++;
  tokLen = 0;
}

void setup() {
  pinMode(PIN_RX, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);

  configurarPines(PINES_VALIDOS);   // todos los emisores a bajo de entrada
  configurarPines(PINES_DEFECTO);
  portadoraFreq(38000);
  portadoraOff();

  Serial.begin(115200);
  while (!Serial) { ; }

  delay(50);
  nivelReposo = digitalRead(PIN_RX);   // el nivel en reposo se toma como referencia
  ultimoNivel = nivelReposo;
  ecoNivel    = nivelReposo;
  tUltimaTransicion = micros();

  Serial.println(F("OK READY LucesIR 3.0"));
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();

    if (c == '\n') {
      if (tokLen > 0) tokenTerminado();
      if (campo > 0) ejecutar();
      campo = 0; cmd = 0; tokLen = 0;
    }
    else if (c == ' ' || c == '\t' || c == '\r' || c == ',') {
      if (tokLen > 0) tokenTerminado();
    }
    else if (tokLen < sizeof(tok) - 1) {
      tok[tokLen++] = c;
    }
  }
}
