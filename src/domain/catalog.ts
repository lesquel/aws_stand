/* ============================================================
   Domain · Event catalog (entities + reference data)
   Stands, activities, collectible pieces, badges and prizes.
   Pure data + lookups. No framework, no side effects.
   Badge rules live here as `check(progress)` predicates; they are
   domain invariants, so they sit with the entity they evaluate.
   ============================================================ */

import { T } from './i18n';
import type { PieceId, Piece, Stand, Prize } from './types';


/* avatar pieces (the collectible album) */
export const PIECES: Record<PieceId, Piece> = {
  cap:      { id: 'cap',      sprite: 'cap',      slot: T('Cabeza','Head'),    name: T('Gorra AWS','AWS Cap'),        color: 'var(--orange)' },
  visor:    { id: 'visor',    sprite: 'visor',    slot: T('Ojos','Eyes'),      name: T('Visor IA','AI Visor'),        color: 'var(--cyan)' },
  shield:   { id: 'shield',   sprite: 'shield',   slot: T('Mano','Hand'),      name: T('Escudo Cloud','Cloud Shield'),color: 'var(--green)' },
  backpack: { id: 'backpack', sprite: 'backpack', slot: T('Espalda','Back'),   name: T('Mochila Crew','Crew Pack'),   color: 'var(--pink)' },
  boots:    { id: 'boots',    sprite: 'boots',    slot: T('Pies','Feet'),      name: T('Botas Builder','Builder Boots'), color: 'var(--purple)' },
};
export const PIECE_ORDER: PieceId[] = ['cap', 'visor', 'shield', 'backpack', 'boots'];

/* stands — each is a "zone" on the map */
export const STANDS: Stand[] = [
  {
    id: 'cloud', icon: 'ic_cloud', color: 'var(--orange)', accent: '#ff9900',
    name: T('Puesto Nube', 'Cloud Outpost'),
    tag: T('AWS · Infraestructura', 'AWS · Infrastructure'),
    blurb: T('Lanza tu carga a la nube y aprende a escalar sin servidores.',
             'Toss your workload to the cloud and learn to scale serverless.'),
    piece: 'cap', map: { x: 16, y: 70 }, staffCode: '2486',
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
    piece: 'visor', map: { x: 38, y: 34 }, staffCode: '7391',
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
    piece: 'shield', map: { x: 62, y: 64 }, staffCode: '5028',
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
    piece: 'backpack', map: { x: 80, y: 30 }, staffCode: '9143',
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
    piece: 'boots', map: { x: 50, y: 88 }, staffCode: '6675',
    activities: [
      { id: 'b1', name: T('Mini-hack de 5 min', '5-min mini hack'), tickets: 2 },
      { id: 'b2', name: T('Arma una arquitectura', 'Assemble an architecture'), tickets: 2 },
      { id: 'b3', name: T('Derrota al jefe', 'Defeat the boss'), tickets: 3, special: true },
    ],
  },
];

export const standById = (id: string): Stand | undefined => STANDS.find(s => s.id === id);

/* prizes — claim with tickets */
export const PRIZES: Prize[] = [
  { id: 'stickers', sprite: 'flag',     name: T('Pack de stickers', 'Sticker pack'),     cost: 3,  stock: 200 },
  { id: 'tee',      sprite: 'heart',    name: T('Camiseta del evento', 'Event tee'),     cost: 8,  stock: 80 },
  { id: 'bag',      sprite: 'backpack', name: T('Mochila builder', 'Builder backpack'),  cost: 14, stock: 40 },
  { id: 'cap',      sprite: 'cap',      name: T('Gorra edición límite', 'Limited cap'),  cost: 10, stock: 60 },
  { id: 'grand',    sprite: 'ic_trophy',name: T('Sorteo: ticket a re:Invent', 'Raffle: re:Invent pass'), cost: 1, stock: 1, raffle: true },
];

export const prizeById = (id: string): Prize | undefined => PRIZES.find(p => p.id === id);
