'use strict';
// test_flow_robust.js — Suite completo para el workflow DentiFlow / Implantarte
// Referencia: hoy fijo = 2026-04-27 (lunes, getDay()=1)

// ─── Estado compartido (replica staticData de n8n) ────────────────────────────
const staticData   = { sessions: {} };
const pendingStore = {};            // replica staticData.pendingConfirmation

// ─── Catálogo de doctores (idéntico al nodo Session Manager) ─────────────────
const ODONTOLOGOS = {
  '1': { id:'1', nombre:'Dr. Alejandro Contreras', especialidad:'Implantologia y Cirugia',
    calendar_id:'3e2d7a3f62231eff8e8f233ec1dbe1f8a416539f52530171c9e457d7c735e87a@group.calendar.google.com',
    dias:[1,2,3,4,5,6], inicio:'08:00', fin:'17:00', fin_sabado:'13:00', duracion_min:60 },
  '2': { id:'2', nombre:'Dra. Maria B. Fuenmayor', especialidad:'Ortodoncia',
    calendar_id:'7b66ca52aef646deff180d5d8e1fcb1767ae9f26db8304f9879c93cdaffe2dfe@group.calendar.google.com',
    dias:[1,3,5], inicio:'09:00', fin:'18:00', duracion_min:60 },
  '3': { id:'3', nombre:'Dr. German', especialidad:'Odontologia General',
    calendar_id:'cf87f5290d01e5ad24e5e8fe6f0251a57e757c1fb3b95c706ca0c924fc779930@group.calendar.google.com',
    dias:[2,3,4,5,6], inicio:'08:00', fin:'16:00', duracion_min:45 },
  '4': { id:'4', nombre:'Dra. Vanessa', especialidad:'Odontologia Estetica',
    calendar_id:'b7d0c4882de72e7b799c6f0c91291beef2dca67a9f23485428203f786ee3e4c@group.calendar.google.com',
    dias:[1,2,3,4], inicio:'10:00', fin:'19:00', duracion_min:60 },
  '5': { id:'5', nombre:'Dra. Beatriz', especialidad:'Radiologia',
    calendar_id:'b45e211b61fb2ddb7309f449c7cc507edd0a9b90e2d359bead1fdc2639b0af4f@group.calendar.google.com',
    dias:[1,2,3,4,5], inicio:'08:00', fin:'15:00', duracion_min:30 }
};

// ─── Funciones del workflow ───────────────────────────────────────────────────
function sessionManager(body) {
  const telefono    = body.telefono || 'test_user';
  const msgOriginal = (body.mensaje || '').trim();
  const mensaje     = msgOriginal.toLowerCase();

  let session = staticData.sessions[telefono] || { estado: 'inicio' };
  if (['menu','inicio','reiniciar','hola','hi','0','reset'].includes(mensaje)) session = { estado: 'inicio' };

  let respuesta = '', accion = 'responder';

  if (session.estado === 'inicio' || session.estado === 'menu') {
    if (['1','odontolog','cita'].some(k => mensaje.includes(k))) {
      session.servicio = 'odontologia'; session.estado = 'seleccion_odontologo';
      respuesta = '[MENU ODONTOLOGOS]';
    } else {
      session.estado = 'inicio'; respuesta = '[BIENVENIDA]';
    }
  } else if (session.estado === 'seleccion_odontologo') {
    const doc = ODONTOLOGOS[msgOriginal];
    if (doc) { session.odontologo = doc; session.estado = 'fecha_hora'; respuesta = '[SELECCIONADO]'; }
    else       { respuesta = '[ERROR: numero 1-5]'; }
  } else if (session.estado === 'fecha_hora') {
    session.fecha_preferida = msgOriginal;
    session.estado = 'verificando_disponibilidad';
    accion = 'verificar_calendar'; respuesta = '[VERIFICANDO...]';
  } else if (session.estado === 'confirmacion') {
    if (['1','si','confirmo','ok','dale','yes'].some(k => mensaje.includes(k))) {
      session.estado = 'crear_evento'; accion = 'crear_evento'; respuesta = '[CREANDO CITA...]';
    } else if (['2','no','otro','cambiar','cancel'].some(k => mensaje.includes(k))) {
      session.estado = 'fecha_hora'; respuesta = '[OTRO DIA]';
    }
  }

  session.updated_at = new Date().toISOString();
  staticData.sessions[telefono] = JSON.parse(JSON.stringify(session));
  return { telefono, mensaje: msgOriginal, session: JSON.parse(JSON.stringify(session)), respuesta, accion };
}

function verificarDisponibilidad(input) {
  const session    = input.session;
  const odontologo = session.odontologo;
  const fechaPref  = session.fecha_preferida || '';

  function parsearFecha(texto) {
    const hoy = new Date('2026-04-27T12:00:00');   // lunes fijo para tests
    const t   = texto.toLowerCase();
    if (t.includes('hoy')) return new Date(hoy);
    if (t.includes('mañana') || t.includes('manana')) {
      const m = new Date(hoy); m.setDate(m.getDate() + 1); return m;
    }
    const diasMap = { lunes:1, martes:2, miercoles:3, jueves:4, viernes:5, sabado:6 };
    for (const [nombre, num] of Object.entries(diasMap)) {
      if (t.includes(nombre)) {
        const d    = new Date(hoy);
        const diff = (num - d.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + diff);
        return d;
      }
    }
    const m1 = texto.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (m1) return new Date(m1[3] + '-' + m1[2].padStart(2,'0') + '-' + m1[1].padStart(2,'0') + 'T12:00:00');
    const def = new Date(hoy); def.setDate(def.getDate() + 1); return def;
  }

  const fecha      = parsearFecha(fechaPref);
  const rawDay     = fecha.getDay();
  const diaSemana  = rawDay === 0 ? 7 : rawDay;
  const trabajaEseDia = odontologo.dias.includes(diaSemana);
  const esSabado   = diaSemana === 6;
  const horaFin    = (esSabado && odontologo.fin_sabado) ? odontologo.fin_sabado : odontologo.fin;

  function generarSlots(f, inicio, fin, durMin) {
    const slots = [];
    const [hI, mI] = inicio.split(':').map(Number);
    const [hF, mF] = fin.split(':').map(Number);
    let cur        = new Date(f); cur.setHours(hI, mI, 0, 0);
    const finD     = new Date(f); finD.setHours(hF, mF, 0, 0);
    while (cur < finD) {
      if (cur.getHours() !== 12) {
        const end = new Date(cur.getTime() + durMin * 60000);
        if (end <= finD) slots.push({
          inicio: new Date(cur), fin: new Date(end),
          label: cur.getHours() + ':' + String(cur.getMinutes()).padStart(2,'0')
        });
      }
      cur = new Date(cur.getTime() + durMin * 60000);
    }
    return slots;
  }

  let respuesta = '';
  const s = JSON.parse(JSON.stringify(staticData.sessions[input.telefono] || {}));
  s.odontologo = odontologo;

  if (!trabajaEseDia) {
    respuesta = '[NO TRABAJA diaSemana=' + diaSemana + ']';
    s.estado   = 'fecha_hora';
  } else {
    const slots    = generarSlots(fecha, odontologo.inicio, horaFin, odontologo.duracion_min);
    const primeros = slots.slice(0, 3);
    if (primeros.length > 0) {
      s.estado          = 'confirmacion';
      s.slots_propuestos = primeros.map(sl => ({
        inicio: sl.inicio.toISOString(), fin: sl.fin.toISOString(), label: sl.label
      }));
      s.slot_confirmado  = s.slots_propuestos[0];
      respuesta = '[SLOTS: ' + primeros.map(x => x.label).join(', ') + ']';
    } else {
      respuesta = '[SIN SLOTS]'; s.estado = 'fecha_hora';
    }
  }
  staticData.sessions[input.telefono] = s;
  return Object.assign({}, input, { respuesta, session: JSON.parse(JSON.stringify(s)) });
}

function prepararEvento(input) {
  const session    = input.session || {};
  const odontologo = session.odontologo;
  const slot       = session.slot_confirmado;
  if (!slot || !odontologo) return Object.assign({}, input, { error: 'DATOS INCOMPLETOS' });
  pendingStore[input.telefono] = { telefono: input.telefono, session };  // simula staticData
  return Object.assign({}, input, {
    evento: {
      titulo:      'Cita ' + odontologo.especialidad + ' - WhatsApp ' + input.telefono,
      descripcion: 'Paciente: ' + input.telefono,
      inicio:      new Date(slot.inicio).toISOString(),
      fin:         new Date(slot.fin).toISOString(),
      calendar_id: odontologo.calendar_id || 'primary'
    }
  });
}

function respuestaConfirmacion(input) {
  // Lee desde pendingStore (replica staticData.pendingConfirmation)
  // Simula que Google Calendar reemplazó todos los campos del input original
  const pending    = pendingStore[input.telefono] || pendingStore[Object.keys(pendingStore)[0]] || {};
  const telefono   = pending.telefono || input.telefono || 'desconocido';
  const session    = pending.session  || input.session  || {};
  const odontologo = session.odontologo      || {};
  const slot       = session.slot_confirmado || {};
  const inicio     = slot.inicio ? new Date(slot.inicio) : new Date();
  const fechaStr   = inicio.toLocaleDateString('es-VE', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const horaStr    = slot.label || inicio.toLocaleTimeString('es-VE', { hour:'2-digit', minute:'2-digit', hour12:true });
  delete pendingStore[telefono];
  const nombre      = odontologo.nombre       || 'Especialista';
  const especialidad = odontologo.especialidad || '';
  const lineas = [
    '✅ *¡Cita confirmada en Implantarte!*', '',
    '👨‍⚕️ ' + nombre,
    '📋 ' + especialidad,
    '📅 ' + fechaStr,
    '🕐 ' + horaStr, '',
    '📍 Implantarte - Clínica Dental', '',
    '*Recuerda:*',
    '• Llegar 10 min antes',
    '• Traer documentos de identificación',
    '• Ante cualquier cambio avísanos con anticipación', '',
    '¡Te esperamos! 😊', '',
    'Para nueva consulta escribe *hola*'
  ];
  return { telefono, session, respuesta: lineas.join('\n') };
}

// ─── Utilidades de test ───────────────────────────────────────────────────────
let PASS = 0, FAIL = 0;
const TEL  = '04141234567';
const TEL2 = '04241111111';

function reset(tel) {
  delete staticData.sessions[tel || TEL];
  delete pendingStore[tel || TEL];
}

function check(label, cond, detail) {
  if (cond) {
    console.log('  \x1b[32mPASS\x1b[0m ' + label);
    PASS++;
  } else {
    console.log('  \x1b[31mFAIL\x1b[0m ' + label + (detail !== undefined ? '  ← ' + detail : ''));
    FAIL++;
  }
}

function flow(msgs, tel) {
  let last;
  for (const msg of msgs) {
    last = sessionManager({ telefono: tel || TEL, mensaje: msg });
    if (last.accion === 'verificar_calendar') last = verificarDisponibilidad(last);
  }
  return last;
}

// ─── GRUPO 1: Máquina de estados ─────────────────────────────────────────────
console.log('\n\x1b[1m=== GRUPO 1: Maquina de estados de sesion ===\x1b[0m');

console.log('\n  [1.1] Todas las palabras de reset vuelven a inicio');
for (const kw of ['menu','inicio','reiniciar','hola','hi','0','reset']) {
  reset();
  sessionManager({ telefono: TEL, mensaje: '1' });   // avanza a seleccion_odontologo
  const out = sessionManager({ telefono: TEL, mensaje: kw });
  check('"' + kw + '" -> estado=inicio', out.session.estado === 'inicio');
}

console.log('\n  [1.2] Doctor invalido no avanza el estado');
reset();
flow(['hola', '1']);
const invDoc = sessionManager({ telefono: TEL, mensaje: '9' });
check('numero 9 mantiene seleccion_odontologo', invDoc.session.estado === 'seleccion_odontologo');
check('respuesta indica error', invDoc.respuesta.toLowerCase().includes('error') || invDoc.respuesta.includes('1-5'));

const invDoc2 = sessionManager({ telefono: TEL, mensaje: 'abc' });
check('texto libre mantiene seleccion_odontologo', invDoc2.session.estado === 'seleccion_odontologo');

console.log('\n  [1.3] Aislamiento entre numeros de telefono');
reset(TEL); reset(TEL2);
flow(['hola', '1', '1'], TEL);
const outTEL2 = sessionManager({ telefono: TEL2, mensaje: 'hola' });
check('sesion TEL2 empieza en inicio independiente de TEL', outTEL2.session.estado === 'inicio');
check('TEL2 no tiene odontologo de TEL', !outTEL2.session.odontologo);

console.log('\n  [1.4] Todas las keywords de confirmacion (SI)');
for (const kw of ['1','si','confirmo','ok','dale','yes']) {
  reset();
  flow(['hola', '1', '1', 'lunes']);
  const out = sessionManager({ telefono: TEL, mensaje: kw });
  check('"' + kw + '" produce accion=crear_evento', out.accion === 'crear_evento', 'estado=' + out.session.estado);
}

console.log('\n  [1.5] Todas las keywords de rechazo (NO)');
for (const kw of ['2','no','otro','cambiar','cancel']) {
  reset();
  flow(['hola', '1', '1', 'lunes']);
  const out = sessionManager({ telefono: TEL, mensaje: kw });
  check('"' + kw + '" vuelve a fecha_hora', out.session.estado === 'fecha_hora', 'accion=' + out.accion);
}

console.log('\n  [1.6] Flujo completo de estados');
reset();
let s = sessionManager({ telefono: TEL, mensaje: 'hola' });
check('hola -> inicio',               s.session.estado === 'inicio');
s = sessionManager({ telefono: TEL, mensaje: '1' });
check('1 -> seleccion_odontologo',    s.session.estado === 'seleccion_odontologo');
s = sessionManager({ telefono: TEL, mensaje: '1' });
check('1 (doc) -> fecha_hora',        s.session.estado === 'fecha_hora');
s = sessionManager({ telefono: TEL, mensaje: 'lunes' });
s = verificarDisponibilidad(s);
check('lunes -> confirmacion',        s.session.estado === 'confirmacion');
s = sessionManager({ telefono: TEL, mensaje: '1' });
check('1 (confirm) -> crear_evento',  s.session.estado === 'crear_evento');

// ─── GRUPO 2: Horarios por doctor ────────────────────────────────────────────
console.log('\n\n\x1b[1m=== GRUPO 2: Horarios por doctor ===\x1b[0m');

// hoy=lunes(1), mañana=martes(2), lunes=próximo lun(May4), martes=Apr28, mié=Apr29, jue=Apr30, vie=May1, sáb=May2
const TRABAJA = 'confirmacion';
const NO_TRABAJA = 'fecha_hora';

const horarioTests = [
  // [docId, nombre, [[dia, esperado], ...]]
  ['1', 'Dr. Alejandro (Lun-Sab)',
    [['lunes', TRABAJA], ['martes', TRABAJA], ['sabado', TRABAJA],
     ['26/04/2026', NO_TRABAJA]] ],        // domingo = NO trabaja
  ['2', 'Dra. Maria (Lun/Mie/Vie)',
    [['lunes', TRABAJA], ['miercoles', TRABAJA], ['viernes', TRABAJA],
     ['martes', NO_TRABAJA], ['jueves', NO_TRABAJA], ['sabado', NO_TRABAJA]] ],
  ['3', 'Dr. German (Mar-Sab)',
    [['martes', TRABAJA], ['sabado', TRABAJA],
     ['lunes', NO_TRABAJA]] ],
  ['4', 'Dra. Vanessa (Lun-Jue)',
    [['lunes', TRABAJA], ['jueves', TRABAJA],
     ['viernes', NO_TRABAJA], ['sabado', NO_TRABAJA]] ],
  ['5', 'Dra. Beatriz (Lun-Vie)',
    [['lunes', TRABAJA], ['viernes', TRABAJA],
     ['sabado', NO_TRABAJA]] ],
];

horarioTests.forEach(([docId, label, casos]) => {
  console.log('\n  ' + label);
  casos.forEach(([dia, esperado]) => {
    reset();
    flow(['hola', '1', docId]);
    const out = sessionManager({ telefono: TEL, mensaje: dia });
    const v   = verificarDisponibilidad(out);
    const etiqueta = esperado === TRABAJA ? 'trabaja' : 'NO trabaja';
    check(label + ' ' + etiqueta + ' ' + dia, v.session.estado === esperado, 'estado=' + v.session.estado);
  });
});

// ─── GRUPO 3: Generación de slots ────────────────────────────────────────────
console.log('\n\n\x1b[1m=== GRUPO 3: Generacion de slots ===\x1b[0m');

console.log('\n  [3.1] Duracion correcta por doctor');
const durTests = [
  ['1', 'lunes',  60, 'Dr. Alejandro'],
  ['2', 'lunes',  60, 'Dra. Maria'],
  ['3', 'martes', 45, 'Dr. German'],
  ['4', 'lunes',  60, 'Dra. Vanessa'],
  ['5', 'lunes',  30, 'Dra. Beatriz'],
];
durTests.forEach(([docId, dia, minEsperados, nombre]) => {
  reset();
  flow(['hola', '1', docId]);
  const out = sessionManager({ telefono: TEL, mensaje: dia });
  const v   = verificarDisponibilidad(out);
  const sp  = v.session.slots_propuestos;
  if (sp && sp.length >= 2) {
    const diff = (new Date(sp[1].inicio) - new Date(sp[0].inicio)) / 60000;
    check(nombre + ': slots de ' + minEsperados + 'min', diff === minEsperados, 'got ' + diff + 'min');
  } else {
    check(nombre + ': tiene slots para medir', false, 'slots=' + JSON.stringify(sp));
  }
});

console.log('\n  [3.2] Dr. Alejandro sabado usa fin_sabado (13:00, no 17:00)');
reset();
flow(['hola', '1', '1']);
const outSab = sessionManager({ telefono: TEL, mensaje: 'sabado' });
const vSab   = verificarDisponibilidad(outSab);
check('sabado genera slots', vSab.session.estado === 'confirmacion');
if (vSab.session.slots_propuestos) {
  // Con fin 13:00 y duracion 60min, slots: 8,9,10,11 (salta 12) = primer slot 8:00
  const primer = vSab.session.slots_propuestos[0];
  check('primer slot sabado es 8:00', primer.label === '8:00', 'got ' + primer.label);
  // No debe haber slot a las 12:00 ni a las 13:00
  const noTarde = vSab.session.slots_propuestos.every(sl =>
    new Date(sl.inicio).getHours() < 12
  );
  check('sabado no tiene slots >= 12:00 (fin=13:00)', noTarde);
}

console.log('\n  [3.3] Nunca se ofrecen slots a las 12:00');
[['1','lunes'],['3','martes'],['5','lunes'],['4','lunes']].forEach(([docId, dia]) => {
  reset();
  flow(['hola', '1', docId]);
  const out2 = sessionManager({ telefono: TEL, mensaje: dia });
  const v2   = verificarDisponibilidad(out2);
  if (v2.session.slots_propuestos) {
    const noNoon = v2.session.slots_propuestos.every(sl => new Date(sl.inicio).getHours() !== 12);
    check('Doc ' + docId + ' no ofrece slot a las 12', noNoon);
  }
});

console.log('\n  [3.4] Se ofrecen exactamente 3 slots (o menos si no hay suficientes)');
[['1','lunes'],['3','martes'],['5','lunes']].forEach(([docId, dia]) => {
  reset();
  flow(['hola', '1', docId]);
  const out2 = sessionManager({ telefono: TEL, mensaje: dia });
  const v2   = verificarDisponibilidad(out2);
  const len  = v2.session.slots_propuestos ? v2.session.slots_propuestos.length : 0;
  check('Doc ' + docId + ' ofrece 3 slots', len === 3, 'got ' + len);
});

console.log('\n  [3.5] slot_confirmado = primer slot propuesto');
reset();
flow(['hola', '1', '1', 'lunes']);
const sesConf = staticData.sessions[TEL];
check('slot_confirmado coincide con slots_propuestos[0]',
  sesConf.slot_confirmado && sesConf.slots_propuestos &&
  sesConf.slot_confirmado.inicio === sesConf.slots_propuestos[0].inicio
);

// ─── GRUPO 4: Preparación de evento ──────────────────────────────────────────
console.log('\n\n\x1b[1m=== GRUPO 4: Preparacion del evento ===\x1b[0m');

console.log('\n  [4.1] Errores cuando faltan datos');
check('error sin slot_confirmado',
  !!prepararEvento({ telefono: TEL, session: { odontologo: ODONTOLOGOS['1'] } }).error);
check('error sin odontologo',
  !!prepararEvento({ telefono: TEL, session: { slot_confirmado: { inicio:'2026-05-04T08:00:00Z', fin:'2026-05-04T09:00:00Z' } } }).error);
check('error con session vacia',
  !!prepararEvento({ telefono: TEL, session: {} }).error);

console.log('\n  [4.2] Calendar IDs — todos reales y con formato Google');
Object.values(ODONTOLOGOS).forEach(doc => {
  check(doc.nombre + ': no es "primary"',  doc.calendar_id !== 'primary');
  check(doc.nombre + ': no esta vacio',    !!doc.calendar_id && doc.calendar_id.length > 10);
  check(doc.nombre + ': formato @group',   doc.calendar_id.endsWith('@group.calendar.google.com'));
});

console.log('\n  [4.3] Evento tiene todos los campos requeridos');
reset();
flow(['hola', '1', '1', 'lunes']);
const confPrep = sessionManager({ telefono: TEL, mensaje: '1' });
const evPrep   = prepararEvento(confPrep);
check('sin error',                     !evPrep.error, evPrep.error);
check('evento.titulo presente',        !!evPrep.evento.titulo);
check('titulo incluye especialidad',   evPrep.evento.titulo.includes('Implantologia'));
check('titulo incluye telefono',       evPrep.evento.titulo.includes(TEL));
check('evento.descripcion presente',   !!evPrep.evento.descripcion);
check('evento.inicio es ISO',          evPrep.evento.inicio.includes('T'));
check('evento.fin es ISO',             evPrep.evento.fin.includes('T'));
check('fin > inicio',                  new Date(evPrep.evento.fin) > new Date(evPrep.evento.inicio));
check('duracion exacta 60min',         (new Date(evPrep.evento.fin) - new Date(evPrep.evento.inicio)) === 3600000);
check('calendar_id Dr. Alejandro',     evPrep.evento.calendar_id.startsWith('3e2d'));

console.log('\n  [4.4] Duraciones correctas en el evento por doctor');
const durEvTests = [
  ['3', 'martes', 45 * 60000, 'Dr. German 45min'],
  ['5', 'lunes',  30 * 60000, 'Dra. Beatriz 30min'],
];
durEvTests.forEach(([docId, dia, msEsperado, nombre]) => {
  reset();
  flow(['hola', '1', docId, dia]);
  const conf = sessionManager({ telefono: TEL, mensaje: '1' });
  const ev   = prepararEvento(conf);
  if (!ev.error) {
    const dur = new Date(ev.evento.fin) - new Date(ev.evento.inicio);
    check(nombre + ': duracion=' + (msEsperado/60000) + 'min en evento', dur === msEsperado, dur/60000 + 'min');
  } else {
    check(nombre + ': sin error', false, ev.error);
  }
});

// ─── GRUPO 5: Mensaje de confirmación ────────────────────────────────────────
console.log('\n\n\x1b[1m=== GRUPO 5: Mensaje de confirmacion al paciente ===\x1b[0m');

console.log('\n  [5.1] Contenido del mensaje — Dr. Alejandro');
reset();
flow(['hola', '1', '1', 'lunes']);
const cOut1 = sessionManager({ telefono: TEL, mensaje: '1' });
prepararEvento(cOut1);  // guarda en pendingStore
const r1 = respuestaConfirmacion({ telefono: TEL });   // simula Google Calendar borrando todo
check('contiene nombre del doctor',    r1.respuesta.includes('Alejandro'));
check('contiene especialidad',         r1.respuesta.includes('Implantologia'));
check('NO dice "Especialista"',        !r1.respuesta.includes('Especialista'));
check('contiene instruccion hola',     r1.respuesta.includes('hola'));
check('tiene telefono correcto',       r1.telefono === TEL);
check('pendingStore limpiado',         !pendingStore[TEL]);

console.log('\n  [5.2] Contenido del mensaje — Dr. German');
reset();
flow(['hola', '1', '3', 'martes']);
const cOut3 = sessionManager({ telefono: TEL, mensaje: '1' });
prepararEvento(cOut3);
const r3 = respuestaConfirmacion({ telefono: TEL });
check('contiene "German"',             r3.respuesta.includes('German'));
check('contiene "Odontologia General"',r3.respuesta.includes('Odontologia'));
check('NO dice "Especialista"',        !r3.respuesta.includes('Especialista'));

console.log('\n  [5.3] Contenido del mensaje — Dra. Beatriz');
reset();
flow(['hola', '1', '5', 'lunes']);
const cOut5 = sessionManager({ telefono: TEL, mensaje: '1' });
prepararEvento(cOut5);
const r5 = respuestaConfirmacion({ telefono: TEL });
check('contiene "Beatriz"',            r5.respuesta.includes('Beatriz'));
check('contiene "Radiologia"',         r5.respuesta.includes('Radiologia'));
check('NO dice "Especialista"',        !r5.respuesta.includes('Especialista'));

console.log('\n  [5.4] pendingStore sobrevive al "borrado" de Google Calendar');
reset();
flow(['hola', '1', '2', 'lunes']);
const cOut2 = sessionManager({ telefono: TEL, mensaje: '1' });
prepararEvento(cOut2);
check('pendingStore tiene datos antes de confirmar', !!pendingStore[TEL]);
// Simula que Google Calendar borró todo el contexto del input
const rGcal = respuestaConfirmacion({ telefono: TEL, session: null, odontologo: null });
check('recupera nombre desde pendingStore (no del input)', rGcal.respuesta.includes('Maria'));
check('pendingStore borrado despues de confirmar', !pendingStore[TEL]);

// ─── GRUPO 6: Flujo E2E completo por doctor ───────────────────────────────────
console.log('\n\n\x1b[1m=== GRUPO 6: Flujo E2E completo — 1 por doctor ===\x1b[0m');

const e2eTests = [
  ['1', 'lunes',  'Alejandro',  'Implantologia',    '3e2d'],
  ['2', 'lunes',  'Maria',      'Ortodoncia',        '7b66'],
  ['3', 'martes', 'German',     'Odontologia',       'cf87'],
  ['4', 'lunes',  'Vanessa',    'Estetica',          'b7d0'],
  ['5', 'lunes',  'Beatriz',    'Radiologia',        'b45e'],
];

e2eTests.forEach(([docId, dia, nombre, espec, calPfx]) => {
  console.log('\n  Doc ' + docId + ': ' + nombre);
  reset();
  flow(['hola', '1', docId, dia]);
  const conf = sessionManager({ telefono: TEL, mensaje: '1' });
  check('estado=crear_evento',          conf.session.estado === 'crear_evento');
  check('accion=crear_evento',          conf.accion === 'crear_evento');
  check('tiene slot_confirmado',        !!conf.session.slot_confirmado);
  check('tiene odontologo',             !!conf.session.odontologo);
  const ev = prepararEvento(conf);
  check('preparar sin error',           !ev.error, ev.error);
  check('calendar_id correcto',         ev.evento && ev.evento.calendar_id.startsWith(calPfx),
    'got ' + (ev.evento && ev.evento.calendar_id.slice(0,6)));
  const rc = respuestaConfirmacion({ telefono: TEL });
  check('respuesta menciona ' + nombre, rc.respuesta.includes(nombre));
  check('respuesta menciona ' + espec,  rc.respuesta.includes(espec));
});

// ─── GRUPO 7: Parseo de fechas ────────────────────────────────────────────────
console.log('\n\n\x1b[1m=== GRUPO 7: Parseo de fechas ===\x1b[0m');

// hoy = 2026-04-27 (lunes, día 1)
// Dr. Alejandro trabaja Lun-Sab => cualquier día laboral funciona para verificar el parseo

console.log('\n  [7.1] "hoy" = lunes (dia 1)');
reset();
flow(['hola', '1', '1']);
const outHoy = sessionManager({ telefono: TEL, mensaje: 'hoy' });
const vHoy   = verificarDisponibilidad(outHoy);
check('"hoy" (lunes) acepta Dr. Alejandro', vHoy.session.estado === 'confirmacion');

console.log('\n  [7.2] "mañana" = martes (dia 2)');
reset();
flow(['hola', '1', '3']); // Dr. German trabaja mar
const outMañana = sessionManager({ telefono: TEL, mensaje: 'mañana' });
const vMañana   = verificarDisponibilidad(outMañana);
check('"mañana" (martes) acepta Dr. German', vMañana.session.estado === 'confirmacion');

console.log('\n  [7.3] "manana" (sin tilde) = martes');
reset();
flow(['hola', '1', '3']);
const outManana = sessionManager({ telefono: TEL, mensaje: 'manana' });
const vManana   = verificarDisponibilidad(outManana);
check('"manana" (sin tilde) acepta Dr. German', vManana.session.estado === 'confirmacion');

console.log('\n  [7.4] Todos los nombres de dias de la semana');
const diasCheck = [
  { texto:'lunes',     diaSem:1, docId:'1' },  // Alejandro Lun-Sab
  { texto:'martes',    diaSem:2, docId:'1' },
  { texto:'miercoles', diaSem:3, docId:'1' },
  { texto:'jueves',    diaSem:4, docId:'1' },
  { texto:'viernes',   diaSem:5, docId:'1' },
  { texto:'sabado',    diaSem:6, docId:'1' },
];
diasCheck.forEach(({ texto, docId }) => {
  reset();
  flow(['hola', '1', docId]);
  const outD = sessionManager({ telefono: TEL, mensaje: texto });
  const vD   = verificarDisponibilidad(outD);
  check('"' + texto + '" reconocido y acepta Dr. Alejandro', vD.session.estado === 'confirmacion',
    'estado=' + vD.session.estado);
});

console.log('\n  [7.5] Formato DD/MM/YYYY');
reset();
flow(['hola', '1', '1']); // Dr. Alejandro
const outFmt = sessionManager({ telefono: TEL, mensaje: '04/05/2026' }); // lunes
const vFmt   = verificarDisponibilidad(outFmt);
check('"04/05/2026" (lunes) aceptado', vFmt.session.estado === 'confirmacion');

console.log('\n  [7.6] Fecha invalida -> fallback a mañana (martes -> Dr. German trabaja)');
reset();
flow(['hola', '1', '3']);
const outInv = sessionManager({ telefono: TEL, mensaje: 'xyzzy' });
const vInv   = verificarDisponibilidad(outInv);
check('fecha invalida fallback a mañana y acepta Dr. German', vInv.session.estado === 'confirmacion');

// ─── RESULTADO FINAL ──────────────────────────────────────────────────────────
const total = PASS + FAIL;
const color = FAIL === 0 ? '\x1b[32m' : '\x1b[31m';
console.log('\n\x1b[1m' + '='.repeat(50) + '\x1b[0m');
console.log(color + '\x1b[1mRESULTADO: ' + PASS + ' PASS  /  ' + FAIL + ' FAIL  (total: ' + total + ')\x1b[0m');
console.log('\x1b[1m' + '='.repeat(50) + '\x1b[0m');
process.exit(FAIL > 0 ? 1 : 0);
