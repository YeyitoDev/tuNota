import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './harness.js';

// El plan del día y el tablero comparten datos: estas pruebas fijan ese contrato.
function bootApp() {
  const app = loadApp(['01-storage.js', '02-state.js', '10-sync-panels.js', '20-planner.js', '22-tareas.js']);
  // Lo que en la app viene de módulos con DOM.
  app.KAN = [['todo', 'Por hacer'], ['doing', 'En progreso'], ['done', 'Hecho']];
  app.kanbanLabel = (s) => (app.KAN.find((k) => k[0] === s) || [s, s])[1];
  app.kanbanOrderOf = (b) => (typeof b.kanbanOrder === 'number' ? b.kanbanOrder : b.kanbanAt || 0);
  app.notebookIdOfBlock = () => '';
  app.serverSave = () => {};
  app.renderCanvas = () => {};
  app.renderTareas = () => {};
  app.toastAction = () => {};
  app.toast = () => {};
  app.touchNote = () => {};
  app.getNote = () => null;
  app.getSection = () => null;
  app.getBlockById = (id) => (app.data.blocks || []).find((b) => b.id === id) || null;
  app.reminderText = (b) => (b.content && b.content.text) || '';
  app.ui = { currentNoteId: null, kanbanBook: '', kanbanBlockedOnly: false, tasksView: 'lista', tasksSrc: 'all',
    tasksDate: 'all', tasksFrom: '', tasksTo: '', tasksPrio: 'all', tasksSort: 'manual' };
  app.data = { notebooks: [], sections: [], notes: [], blocks: [], links: [], groups: [], log: [], plan: [] };
  return app;
}

describe('normalizeData — migración de las tareas del día', () => {
  it('da estado y orden a las tareas antiguas y limpia la bandera de interfaz', () => {
    const app = bootApp();
    app.data.plan = [
      { id: 't1', title: 'vieja pendiente', day: '2026-01-01', done: false, createdAt: 111, _open: true },
      { id: 't2', title: 'vieja hecha', day: '2026-01-01', done: true, createdAt: 222, subs: null },
    ];
    app.normalizeData();
    const [t1, t2] = app.data.plan;
    expect(t1.status).toBe('todo');
    expect(t2.status).toBe('done');
    expect(t1.order).toBe(111);
    expect(t2.order).toBe(222);
    expect(Array.isArray(t2.subs)).toBe(true);
    expect('_open' in t1).toBe(false);
  });

  it('done queda siempre en espejo con status, aunque el guardado viniera incoherente', () => {
    const app = bootApp();
    app.data.plan = [{ id: 't1', title: 'x', day: '2026-01-01', done: true, status: 'doing', createdAt: 1 }];
    app.normalizeData();
    expect(app.data.plan[0].done).toBe(false);
  });

  it('las tarjetas del tablero pueden desglosarse en pasos', () => {
    const app = bootApp();
    app.data.blocks = [{ id: 'b1', kanban: 'todo' }, { id: 'b2' }];
    app.normalizeData();
    expect(app.data.blocks[0].subs).toEqual([]);
    expect(app.data.blocks[1].subs).toBeUndefined(); // solo las que están en el tablero
  });
});

describe('mergeFromStorage — sincronización entre ventanas', () => {
  it('trae el plan del día de la otra ventana (antes se quedaba congelado)', () => {
    const app = bootApp();
    app.data.plan = [{ id: 't1', title: 'viejo', status: 'todo', done: false }];
    app.activeCardId = () => null;
    app.mergeFromStorage({
      blocks: [], notes: [], sections: [], notebooks: [], links: [], log: [],
      plan: [{ id: 't1', title: 'movida en la otra ventana', status: 'doing', done: false }],
    });
    expect(app.data.plan[0].title).toBe('movida en la otra ventana');
    expect(app.data.plan[0].status).toBe('doing');
  });

  it('propaga el bloqueo y los pasos de las tarjetas', () => {
    const app = bootApp();
    app.data.blocks = [{ id: 'b1', noteId: 'n1', blocked: false, subs: [] }];
    app.activeCardId = () => null;
    app.mergeFromStorage({
      blocks: [{ id: 'b1', noteId: 'n1', blocked: true, subs: [{ id: 's1', text: 'paso', done: false }] }],
      notes: [], sections: [], notebooks: [], links: [], log: [],
    });
    expect(app.data.blocks[0].blocked).toBe(true);
    expect(app.data.blocks[0].subs).toHaveLength(1);
  });
});

describe('modelo de tareas — estado, orden y pasos', () => {
  let app;
  beforeEach(() => { app = bootApp(); });

  it('una tarea nueva nace en «Por hacer» y sin completar', () => {
    const t = app.planAddTask('escribir el informe');
    expect(t.status).toBe('todo');
    expect(t.done).toBe(false);
    expect(t.day).toBe(app.planTodayStr());
    expect(t.subs).toEqual([]);
    expect(app.data.plan).toHaveLength(1);
  });

  it('ignora el texto vacío', () => {
    expect(app.planAddTask('   ')).toBeNull();
    expect(app.data.plan).toHaveLength(0);
  });

  it('marcar la casilla la manda a «Hecho» y desmarcarla la reabre', () => {
    const t = app.planAddTask('x');
    app.planToggleDone(t, true);
    expect(t.status).toBe('done');
    expect(t.doneAt).toBeTypeOf('number');
    app.planToggleDone(t, false);
    expect(t.status).toBe('todo');
    expect(t.done).toBe(false);
    expect(t.doneAt).toBeNull();
  });

  it('moverla a «Hecho» en el tablero también marca la casilla', () => {
    const t = app.planAddTask('x');
    app.planSetStatus(t, 'done');
    expect(t.done).toBe(true);
  });

  it('completar una tarea arrastrada la fecha en el día de hoy', () => {
    const t = app.planAddTask('x');
    t.day = '2020-01-01';
    app.planSetStatus(t, 'done');
    expect(t.day).toBe(app.planTodayStr());
  });

  it('colocar entre dos tareas les asigna un orden intermedio', () => {
    const a = app.planAddTask('a');
    const b = app.planAddTask('b');
    const c = app.planAddTask('c');
    a.order = 10; b.order = 20; c.order = 30;
    app.planSetStatus(c, 'todo', b.id); // c pasa a ir justo antes de b
    expect(c.order).toBeGreaterThan(a.order);
    expect(c.order).toBeLessThan(b.order);
    expect(app.planTasksIn('todo').map((x) => x.id)).toEqual([a.id, c.id, b.id]);
  });

  it('marcar el primer paso arranca la tarea; desmarcar uno reabre la completada', () => {
    const t = app.planAddTask('x');
    const s1 = app.planSubAdd(t, 'paso 1');
    app.planSubAdd(t, 'paso 2');
    app.planSubToggle(t, s1, true);
    expect(t.status).toBe('doing');
    app.planSetStatus(t, 'done');
    app.planSubToggle(t, s1, false);
    expect(t.status).toBe('doing');
    expect(t.done).toBe(false);
  });

  it('los pasos se añaden, se editan y se quitan', () => {
    const t = app.planAddTask('x');
    const s = app.planSubAdd(t, 'primer paso');
    expect(app.planSubAdd(t, '  ')).toBeNull();
    app.planSubSetText(t, s, 'paso corregido');
    expect(t.subs[0].text).toBe('paso corregido');
    app.planSubSetText(t, s, '   '); // vacío: no pisa el texto bueno
    expect(t.subs[0].text).toBe('paso corregido');
    app.planSubRemove(t, s);
    expect(t.subs).toHaveLength(0);
  });

  it('planSubsDone cuenta solo los pasos marcados', () => {
    const t = app.planAddTask('x');
    const s1 = app.planSubAdd(t, 'a');
    app.planSubAdd(t, 'b');
    app.planSubToggle(t, s1, true);
    expect(app.planSubsDone(t)).toBe(1);
  });
});

describe('tablero — tareas del día y tarjetas del lienzo en las mismas columnas', () => {
  let app;
  beforeEach(() => { app = bootApp(); });

  it('boardAll mezcla ambos orígenes y los ordena por su posición', () => {
    const t = app.planAddTask('tarea');
    t.order = 20;
    app.data.blocks = [{ id: 'b1', kanban: 'todo', kanbanOrder: 10, content: { text: 'tarjeta' } }];
    const items = app.boardAll('todo');
    expect(items.map((i) => i.src)).toEqual(['block', 'task']);
    expect(items.map((i) => i.id)).toEqual(['b1', t.id]);
  });

  it('el filtro de origen deja ver solo lo del día o solo lo del lienzo', () => {
    app.planAddTask('tarea');
    app.data.blocks = [{ id: 'b1', kanban: 'todo', kanbanOrder: 1, content: { text: 'tarjeta' } }];
    app.ui.tasksSrc = 'task';
    expect(app.boardItems('todo').map((i) => i.src)).toEqual(['task']);
    app.ui.tasksSrc = 'block';
    expect(app.boardItems('todo').map((i) => i.src)).toEqual(['block']);
    app.ui.tasksSrc = 'all';
    expect(app.boardItems('todo')).toHaveLength(2);
  });

  it('boardPlace mueve una tarea de columna respetando a sus vecinas', () => {
    const a = app.planAddTask('a');
    const b = app.planAddTask('b');
    app.planSetStatus(a, 'doing');
    a.order = 100;
    app.boardPlace('task', b.id, 'doing', a.id); // b se coloca antes que a
    expect(b.status).toBe('doing');
    expect(b.order).toBeLessThan(a.order);
  });

  it('boardPlace mueve una tarjeta del lienzo y la deja junto a una tarea del día', () => {
    const t = app.planAddTask('tarea');
    app.planSetStatus(t, 'doing');
    t.order = 50;
    app.data.blocks = [{ id: 'b1', noteId: 'n1', kanban: 'todo', kanbanOrder: 1, content: { text: 'tarjeta' } }];
    app.boardPlace('block', 'b1', 'doing', t.id);
    expect(app.data.blocks[0].kanban).toBe('doing');
    expect(app.data.blocks[0].kanbanOrder).toBeLessThan(50);
    expect(app.boardAll('doing').map((i) => i.id)).toEqual(['b1', t.id]);
  });

  it('el filtro de prioridad deja pasar solo el nivel elegido', () => {
    const a = app.planAddTask('urgente');
    const b = app.planAddTask('normal');
    app.planAddTask('sin marcar');
    a.priority = 'alta';
    b.priority = 'baja';
    app.ui.tasksPrio = 'alta';
    expect(app.boardItems('todo').map((i) => i.ref.title)).toEqual(['urgente']);
    app.ui.tasksPrio = 'baja';
    expect(app.boardItems('todo').map((i) => i.ref.title)).toEqual(['normal']);
    app.ui.tasksPrio = 'all';
    expect(app.boardItems('todo')).toHaveLength(3);
  });

  it('ordenar por prioridad sube lo alto y deja lo no marcado al final', () => {
    const sin = app.planAddTask('sin prioridad');
    const baja = app.planAddTask('baja');
    const alta = app.planAddTask('alta');
    baja.priority = 'baja';
    alta.priority = 'alta';
    sin.order = 1; baja.order = 2; alta.order = 3; // el orden manual es el inverso
    app.ui.tasksSort = 'manual';
    expect(app.boardItems('todo').map((i) => i.ref.title)).toEqual(['sin prioridad', 'baja', 'alta']);
    app.ui.tasksSort = 'prio';
    expect(app.boardItems('todo').map((i) => i.ref.title)).toEqual(['alta', 'baja', 'sin prioridad']);
  });

  it('planVisibleTasks arrastra lo pendiente de días anteriores y suelta lo ya hecho', () => {
    const viejaPendiente = app.planAddTask('pendiente de ayer');
    viejaPendiente.day = '2020-01-01';
    const viejaHecha = app.planAddTask('hecha ayer');
    app.planSetStatus(viejaHecha, 'done');
    viejaHecha.day = '2020-01-01';
    const ids = app.planVisibleTasks().map((t) => t.id);
    expect(ids).toContain(viejaPendiente.id);
    expect(ids).not.toContain(viejaHecha.id);
  });
});

describe('prioridad — el ciclo del chip', () => {
  let app;
  beforeEach(() => { app = bootApp(); });

  it('recorre sin prioridad → alta → media → baja → sin prioridad', () => {
    const t = app.planAddTask('x');
    expect(app.planPriorityOf(t)).toBe('');
    expect(app.planCyclePriority(t)).toBe('alta');
    expect(app.planCyclePriority(t)).toBe('media');
    expect(app.planCyclePriority(t)).toBe('baja');
    expect(app.planCyclePriority(t)).toBe('');
    expect('priority' in t).toBe(false); // se borra, no queda un valor vacío colgando
  });

  it('vale igual para una tarjeta del lienzo', () => {
    const b = { id: 'b1', noteId: 'n1', kanban: 'todo', content: { text: 'idea' } };
    app.data.blocks = [b];
    app.planCyclePriority(b);
    expect(app.planPriorityOf(b)).toBe('alta');
  });

  it('ignora un valor inventado y lo trata como sin prioridad', () => {
    expect(app.planPriorityOf({ priority: 'urgentisimo' })).toBe('');
    expect(app.planPriorityRank({ priority: 'urgentisimo' })).toBe(3);
  });
});

describe('filtros de fecha', () => {
  let app;
  const dias = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  };
  beforeEach(() => { app = bootApp(); });

  it('«Hoy» deja solo lo del día en curso', () => {
    const hoy = app.planAddTask('de hoy');
    const vieja = app.planAddTask('de hace una semana');
    vieja.day = dias(-7);
    app.ui.tasksDate = 'today';
    expect(app.boardItems('todo').map((i) => i.ref.title)).toEqual([hoy.title]);
  });

  it('«Vencidas» muestra lo abierto con la fecha límite pasada, no lo solo arrastrado', () => {
    app.planAddTask('vencida ayer', { due: dias(-1) });
    const arrastrada = app.planAddTask('arrastrada sin fecha');
    arrastrada.day = dias(-3);
    const hecha = app.planAddTask('hecha y vencida', { due: dias(-2) });
    app.planSetStatus(hecha, 'done');
    app.planAddTask('vence mañana', { due: dias(1) });
    app.ui.tasksDate = 'late';
    const vistos = ['todo', 'doing', 'done'].flatMap((s) => app.boardItems(s).map((i) => i.ref.title));
    expect(vistos).toEqual(['vencida ayer']);
  });

  it('«Completadas» incluye lo terminado otros días (historial)', () => {
    const vieja = app.planAddTask('hecha la semana pasada');
    app.planSetStatus(vieja, 'done');
    vieja.day = dias(-7); vieja.doneAt = Date.now() - 7 * 86400000;
    app.planAddTask('abierta');
    app.ui.tasksDate = 'done';
    expect(app.boardItems('done').map((i) => i.ref.title)).toEqual(['hecha la semana pasada']);
  });

  it('«Semana» incluye lo del lunes en curso y descarta lo del mes pasado', () => {
    const estaSemana = app.planAddTask('esta semana');
    estaSemana.day = app.planWeekStartStr();
    const mesPasado = app.planAddTask('del mes pasado');
    mesPasado.day = dias(-40);
    app.ui.tasksDate = 'week';
    expect(app.boardItems('todo').map((i) => i.ref.title)).toEqual(['esta semana']);
  });

  it('el rango personalizado acota por ambos extremos, y cada extremo es opcional', () => {
    const a = app.planAddTask('hace 10 días'); a.day = dias(-10);
    const b = app.planAddTask('hace 5 días'); b.day = dias(-5);
    const c = app.planAddTask('hoy');
    app.ui.tasksDate = 'range';
    app.ui.tasksFrom = dias(-7); app.ui.tasksTo = dias(-1);
    expect(app.boardItems('todo').map((i) => i.ref.title)).toEqual(['hace 5 días']);
    app.ui.tasksTo = ''; // solo "desde"
    expect(app.boardItems('todo').map((i) => i.ref.title)).toEqual(['hace 5 días', 'hoy']);
    app.ui.tasksFrom = ''; // sin extremos: no filtra nada
    expect(app.boardItems('todo')).toHaveLength(3);
  });

  it('una tarjeta del lienzo se fecha por cuándo entró al tablero', () => {
    const hace3 = new Date(); hace3.setDate(hace3.getDate() - 3);
    app.data.blocks = [
      { id: 'b1', noteId: 'n1', kanban: 'todo', kanbanAt: hace3.getTime(), kanbanOrder: 1, content: { text: 'vieja' } },
      { id: 'b2', noteId: 'n1', kanban: 'todo', kanbanAt: Date.now(), kanbanOrder: 2, content: { text: 'de hoy' } },
    ];
    app.ui.tasksDate = 'today';
    expect(app.boardItems('todo').map((i) => i.id)).toEqual(['b2']);
  });

  it('planWeekStartStr devuelve un lunes', () => {
    const [y, m, d] = app.planWeekStartStr().split('-').map(Number);
    expect(new Date(y, m - 1, d).getDay()).toBe(1);
  });
});

describe('orden de la vista Lista', () => {
  let app;
  const items = (a) => a.map((t) => ({ src: 'task', id: t.id, ref: t, order: app.planOrderOf(t) }));
  beforeEach(() => { app = bootApp(); });

  it('en orden manual, lo que está en marcha va primero y lo hecho al final', () => {
    const a = app.planAddTask('pendiente');
    const b = app.planAddTask('en marcha'); app.planSetStatus(b, 'doing');
    const c = app.planAddTask('hecha'); app.planSetStatus(c, 'done');
    app.ui.tasksSort = 'manual';
    const orden = items([a, b, c]).sort(app.tareasListCmp).map((i) => i.ref.title);
    expect(orden).toEqual(['en marcha', 'pendiente', 'hecha']);
  });

  it('con orden por prioridad, la prioridad manda por encima del estado', () => {
    const a = app.planAddTask('alta pero pendiente'); a.priority = 'alta';
    const b = app.planAddTask('sin prioridad en marcha'); app.planSetStatus(b, 'doing');
    const c = app.planAddTask('baja'); c.priority = 'baja';
    app.ui.tasksSort = 'prio';
    const orden = items([a, b, c]).sort(app.tareasListCmp).map((i) => i.ref.title);
    expect(orden).toEqual(['alta pero pendiente', 'baja', 'sin prioridad en marcha']);
  });

  it('a igual prioridad, decide el estado y luego el orden manual', () => {
    const a = app.planAddTask('alta pendiente'); a.priority = 'alta'; a.order = 99;
    const b = app.planAddTask('alta en marcha'); b.priority = 'alta'; app.planSetStatus(b, 'doing');
    const c = app.planAddTask('alta pendiente antigua'); c.priority = 'alta'; c.order = 1;
    app.ui.tasksSort = 'prio';
    const orden = items([a, b, c]).sort(app.tareasListCmp).map((i) => i.ref.title);
    expect(orden).toEqual(['alta en marcha', 'alta pendiente antigua', 'alta pendiente']);
  });
});

describe('modo del panel: acoplado o ventana', () => {
  let app;
  beforeEach(() => {
    app = bootApp();
    app.window = { innerWidth: 1400 };
  });

  it('acoplado es el modo por defecto y cualquier valor raro cae en él', () => {
    app.ui.tasksDock = undefined;
    expect(app.tareasDock()).toBe('dock');
    app.ui.tasksDock = 'flotante';
    expect(app.tareasDock()).toBe('dock');
    app.ui.tasksDock = 'modal';
    expect(app.tareasDock()).toBe('modal');
  });

  it('sin ancho guardado, cada vista tiene el suyo', () => {
    app.ui.tasksWidth = 0;
    app.ui.tasksView = 'lista';
    expect(app.tareasWidth()).toBe(420);
    app.ui.tasksView = 'tablero';
    expect(app.tareasWidth()).toBe(760);
  });

  // La regla es que SIEMPRE quede lienzo visible: el tope es el 56% de la ventana y, además,
  // el sitio que queda desde donde empieza el lienzo menos 200 px reservados para verlo.
  it('respeta el ancho guardado y nunca se come el lienzo entero', () => {
    app.ui.tasksWidth = 640;
    expect(app.tareasWidth()).toBe(640);
    app.ui.tasksWidth = 5000;                  // más ancho que la ventana
    expect(app.tareasWidth()).toBe(784);       // 56% de 1400
    app.ui.tasksWidth = 50;                    // absurdamente estrecho: cae al valor por defecto
    app.ui.tasksView = 'lista';
    expect(app.tareasWidth()).toBe(420);
  });

  it('en pantalla estrecha el panel se acopla abajo, no al lado', () => {
    app.ui.tasksDock = 'dock';
    const w = app.window.innerWidth;
    app.window.innerWidth = 390;               // teléfono
    expect(app.tareasIsSheet()).toBe(true);
    app.window.innerWidth = 1400;              // escritorio con sitio de sobra
    expect(app.tareasIsSheet()).toBe(false);
    app.ui.tasksDock = 'modal';                // en ventana centrada no hay hoja
    app.window.innerWidth = 390;
    expect(app.tareasIsSheet()).toBe(false);
    app.ui.tasksDock = 'dock';
    app.window.innerWidth = w;
  });

  it('el alto de la hoja deja ver el lienzo por encima', () => {
    app.window.innerHeight = 800; // el arnés solo define el ancho
    app.ui.tasksHeight = 0;
    const alto = app.tareasHeight();           // por defecto, 55% de la ventana
    expect(alto).toBeLessThan(app.window.innerHeight * 0.6);
    app.ui.tasksHeight = 5000;                 // no puede tragarse la pantalla
    expect(app.tareasHeight()).toBeLessThanOrEqual(Math.round(app.window.innerHeight * 0.82));
    app.ui.tasksHeight = 10;                   // ridículo: cae al mínimo usable
    expect(app.tareasHeight()).toBeGreaterThanOrEqual(180);
  });
});
