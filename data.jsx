/* ============================================================
   Event data model — stands, activities, pieces, badges, prizes
   Bilingual: each label is { es, en }
   ============================================================ */

const T = (es, en) => ({ es, en });

/* avatar pieces (the collectible album) */
const PIECES = {
  cap:      { id: 'cap',      sprite: 'cap',      slot: T('Cabeza','Head'),    name: T('Gorra AWS','AWS Cap'),        color: 'var(--orange)' },
  visor:    { id: 'visor',    sprite: 'visor',    slot: T('Ojos','Eyes'),      name: T('Visor IA','AI Visor'),        color: 'var(--cyan)' },
  shield:   { id: 'shield',   sprite: 'shield',   slot: T('Mano','Hand'),      name: T('Escudo Cloud','Cloud Shield'),color: 'var(--green)' },
  backpack: { id: 'backpack', sprite: 'backpack', slot: T('Espalda','Back'),   name: T('Mochila Crew','Crew Pack'),   color: 'var(--pink)' },
  boots:    { id: 'boots',    sprite: 'boots',    slot: T('Pies','Feet'),      name: T('Botas Builder','Builder Boots'), color: 'var(--purple)' },
};
const PIECE_ORDER = ['cap', 'visor', 'shield', 'backpack', 'boots'];

/* stands — each is a "zone" on the map */
const STANDS = [
  {
    id: 'cloud', icon: 'ic_cloud', color: 'var(--orange)', accent: '#ff9900',
    name: T('Puesto Nube', 'Cloud Outpost'),
    tag: T('AWS · Infraestructura', 'AWS · Infrastructure'),
    blurb: T('Lanza tu carga a la nube y aprende a escalar sin servidores.',
             'Toss your workload to the cloud and learn to scale serverless.'),
    piece: 'cap', map: { x: 16, y: 70 },
    activities: [
      { id: 'c1', name: T('Lanza el aro a la nube', 'Ring toss to the cloud'), tickets: 1 },
      { id: 'c2', name: T('Habla con un Arquitecto', 'Talk to an Architect'), tickets: 1 },
      { id: 'c3', name: T('Demo de despliegue', 'Deploy demo'), tickets: 2, special: true },
    ],
  },
  {
    id: 'ia', icon: 'ic_chip', color: 'var(--cyan)', accent: '#36c5f0',
    name: T('Laboratorio IA', 'Neural Lab'),
    tag: T('Inteligencia Artificial', 'Artificial Intelligence'),
    blurb: T('Entrena un modelo en vivo y reta a la máquina a adivinar tu dibujo.',
             'Train a model live and dare the machine to guess your sketch.'),
    piece: 'visor', map: { x: 38, y: 34 },
    activities: [
      { id: 'i1', name: T('Adivina con la IA', 'Beat the AI guesser'), tickets: 1 },
      { id: 'i2', name: T('Prompt challenge', 'Prompt challenge'), tickets: 2, special: true },
      { id: 'i3', name: T('Tómate una foto IA', 'Snap an AI portrait'), tickets: 1 },
    ],
  },
  {
    id: 'sec', icon: 'ic_shield', color: 'var(--green)', accent: '#2bd576',
    name: T('Bastión Security', 'Security Bastion'),
    tag: T('Seguridad en la nube', 'Cloud Security'),
    blurb: T('Defiende el castillo: detecta la brecha antes de que caiga el muro.',
             'Defend the keep: spot the breach before the wall falls.'),
    piece: 'shield', map: { x: 62, y: 64 },
    activities: [
      { id: 's1', name: T('Encuentra la brecha', 'Find the breach'), tickets: 1 },
      { id: 's2', name: T('Arma tu contraseña', 'Build a strong password'), tickets: 1 },
      { id: 's3', name: T('Reto del firewall', 'Firewall challenge'), tickets: 2, special: true },
    ],
  },
  {
    id: 'crew', icon: 'ic_people', color: 'var(--pink)', accent: '#ff5c8a',
    name: T('Aldea Community', 'Community Village'),
    tag: T('Comunidad & Networking', 'Community & Networking'),
    blurb: T('Conoce builders, intercambia stickers y suma aliados a tu party.',
             'Meet builders, swap stickers and add allies to your party.'),
    piece: 'backpack', map: { x: 80, y: 30 },
    activities: [
      { id: 'm1', name: T('Conoce a 3 builders', 'Meet 3 builders'), tickets: 1 },
      { id: 'm2', name: T('Foto con la comunidad', 'Community group photo'), tickets: 1 },
      { id: 'm3', name: T('Únete a un user group', 'Join a user group'), tickets: 2, special: true },
    ],
  },
  {
    id: 'build', icon: 'ic_gear', color: 'var(--purple)', accent: '#9b6dff',
    name: T('Arena Builders', 'Builders Arena'),
    tag: T('Reto final', 'Boss challenge'),
    blurb: T('La zona jefe. Completa el circuito de builders y reclama tus botas.',
             'The boss zone. Clear the builder gauntlet and claim your boots.'),
    piece: 'boots', map: { x: 50, y: 88 },
    activities: [
      { id: 'b1', name: T('Mini-hack de 5 min', '5-min mini hack'), tickets: 2 },
      { id: 'b2', name: T('Arma una arquitectura', 'Assemble an architecture'), tickets: 2 },
      { id: 'b3', name: T('Derrota al jefe', 'Defeat the boss'), tickets: 3, special: true },
    ],
  },
];

const standById = id => STANDS.find(s => s.id === id);

/* badges — achievements */
const BADGES = [
  { id: 'explorer', icon: 'ic_compass', name: T('Explorador', 'Explorer'),
    desc: T('Visita 3 stands', 'Visit 3 stands'),
    check: p => p.visitedStands.length >= 3 },
  { id: 'network', icon: 'ic_medal', name: T('Networking Pro', 'Networking Pro'),
    desc: T('Completa 6 actividades', 'Complete 6 activities'),
    check: p => p.doneActivities.length >= 6 },
  { id: 'challenger', icon: 'ic_bolt', name: T('Cloud Challenger', 'Cloud Challenger'),
    desc: T('Termina el Puesto Nube', 'Clear Cloud Outpost'),
    check: p => standDone(p, 'cloud') },
  { id: 'collector', icon: 'ic_star', name: T('Coleccionista', 'Collector'),
    desc: T('Arma el avatar completo', 'Complete your avatar'),
    check: p => PIECE_ORDER.every(id => p.pieces.includes(id)) },
  { id: 'full', icon: 'ic_trophy', name: T('Full Event', 'Full Event'),
    desc: T('Completa los 5 stands', 'Clear all 5 stands'),
    check: p => STANDS.every(s => standDone(p, s.id)) },
];

/* prizes — claim with tickets */
const PRIZES = [
  { id: 'stickers', sprite: 'flag',     name: T('Pack de stickers', 'Sticker pack'),     cost: 3,  stock: 200 },
  { id: 'tee',      sprite: 'heart',    name: T('Camiseta del evento', 'Event tee'),     cost: 8,  stock: 80 },
  { id: 'bag',      sprite: 'backpack', name: T('Mochila builder', 'Builder backpack'),  cost: 14, stock: 40 },
  { id: 'cap',      sprite: 'cap',      name: T('Gorra edición límite', 'Limited cap'),  cost: 10, stock: 60 },
  { id: 'grand',    sprite: 'ic_trophy',name: T('Sorteo: ticket a re:Invent', 'Raffle: re:Invent pass'), cost: 1, stock: 1, raffle: true },
];

/* helpers operating on a progress object */
function standDone(p, standId) {
  const st = standById(standId); if (!st) return false;
  return st.activities.every(a => p.doneActivities.includes(a.id));
}
function standProgress(p, standId) {
  const st = standById(standId); if (!st) return { done: 0, total: 0 };
  const done = st.activities.filter(a => p.doneActivities.includes(a.id)).length;
  return { done, total: st.activities.length };
}

Object.assign(window, {
  T, PIECES, PIECE_ORDER, STANDS, standById, BADGES, PRIZES, standDone, standProgress,
});
