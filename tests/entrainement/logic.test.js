const test = require('node:test');
const assert = require('node:assert');
const L = require('../../entrainement/logic.js');
const Illus = require('../../entrainement/illustrations.js');

const lundi = new Date(2026, 9, 26); // lundi 26 oct. 2026

test('jours de la semaine : lundi = 0, dimanche = 6', () => {
  assert.strictEqual(L.indexJour(new Date(2026, 9, 26)), 0);
  assert.strictEqual(L.indexJour(new Date(2026, 9, 28)), 2);
  assert.strictEqual(L.indexJour(new Date(2026, 10, 1)), 6);
  assert.strictEqual(L.cleDate(L.debutSemaine(new Date(2026, 10, 1))), '2026-10-26');
});

test('programme par défaut : 7 jours, bons exercices', () => {
  const p = L.programmeParDefaut();
  assert.strictEqual(p.length, 7);
  assert.deepStrictEqual(p.map(j => j.exercices.length), [4, 4, 2, 4, 4, 0, 0]);
  assert.strictEqual(p[0].exercices[0].nom, 'Pompes');
  assert.strictEqual(L.formatCible(p[0].exercices[0]), '3 × 8-12 répétitions');
  assert.strictEqual(L.formatCible(p[0].exercices[3]), '2 × 30 s par côté');
  assert.strictEqual(L.formatCible(p[4].exercices[1]), '3 × 12 par côté');
  assert.strictEqual(L.formatCible(p[2].exercices[0]), '1 × 15-20 min');
  assert.ok(p.every(j => j.exercices.every(e => e.description.length > 10)));
});

test('étapes : pompes 3 séries = 3 travails + 2 repos de 60 s', () => {
  const jour = { exercices: [L.programmeParDefaut()[0].exercices[0]] };
  const et = L.construireEtapes(jour);
  assert.deepStrictEqual(et.map(s => s.type), ['work', 'rest', 'work', 'rest', 'work']);
  assert.strictEqual(et[1].duree, 60);
});

test('étapes : étirement par côté = 2 côtés par série, changement de côté 5 s', () => {
  const jour = { exercices: [L.programmeParDefaut()[0].exercices[3]] }; // 2 × 30 s par côté
  const et = L.construireEtapes(jour);
  assert.deepStrictEqual(et.map(s => s.type), ['work', 'rest', 'work', 'rest', 'work', 'rest', 'work']);
  assert.deepStrictEqual(et.filter(s => s.type === 'work').map(s => s.cote), [1, 2, 1, 2]);
  assert.strictEqual(et[1].duree, 5);
  assert.strictEqual(et[3].duree, 10);
});

test('étapes : pas de repos après la dernière série ; navigation sans les repos', () => {
  const et = L.construireEtapes(L.programmeParDefaut()[1]);
  assert.strictEqual(et[et.length - 1].type, 'work');
  assert.strictEqual(L.etapeTravail(et, 0, 1), 2);
  assert.strictEqual(L.etapeTravail(et, 2, -1), 0);
  assert.strictEqual(L.etapeTravail(et, 0, -1), -1);
});

test('jour libre : aucune étape', () => {
  assert.deepStrictEqual(L.construireEtapes(L.programmeParDefaut()[5]), []);
});

test('semaine et compteur par semaine', () => {
  const h = [{ date: '2026-10-26' }, { date: '2026-10-27' }, { date: '2026-10-20' }];
  const v = L.vueSemaine(h, new Date(2026, 9, 28));
  assert.strictEqual(v.length, 7);
  assert.strictEqual(v[0].seances.length, 1);
  assert.strictEqual(v[1].seances.length, 1);
  assert.strictEqual(v[2].seances.length, 0);
  assert.deepStrictEqual(L.seancesParSemaine(h, new Date(2026, 9, 28), 3).map(x => x.nombre), [2, 1, 0]);
});

test('progression : pas avant 2 semaines, ni sans séances', () => {
  const e = L.etatInitial(lundi);
  e.historique = [{ date: '2026-10-26' }, { date: '2026-10-27' }];
  assert.strictEqual(L.progressionDue(e, new Date(2026, 10, 3)), false); // 8 jours
  assert.strictEqual(L.progressionDue(e, new Date(2026, 10, 9)), true);  // 14 jours
  e.reglages.semainesProgression = 1;
  assert.strictEqual(L.progressionDue(e, new Date(2026, 10, 2)), true);  // 7 jours
  e.historique = [{ date: '2026-10-26' }];
  assert.strictEqual(L.progressionDue(e, new Date(2026, 10, 9)), false); // 1 seule séance
});

test('progression : appliquer ajoute +2 reps / +5 s et relance le compteur', () => {
  const e = L.etatInitial(lundi);
  e.historique = [{ date: '2026-10-26' }, { date: '2026-10-27' }];
  const now = new Date(2026, 10, 9);
  assert.ok(L.apercuProgression(e).length > 0);
  L.appliquerProgression(e, now);
  const pompes = e.programme[0].exercices[0];
  assert.deepStrictEqual([pompes.min, pompes.max], [10, 14]);
  const planche = e.programme[1].exercices[0];
  assert.deepStrictEqual([planche.min, planche.max], [25, 35]);
  assert.strictEqual(e.programme[0].exercices[3].min, 30); // étirement : inchangé
  assert.strictEqual(e.progression.derniere, '2026-11-09');
  assert.strictEqual(L.progressionDue(e, new Date(2026, 10, 10)), false);
});

test('progression : « plus tard » repousse la suggestion', () => {
  const e = L.etatInitial(lundi);
  e.historique = [{ date: '2026-10-26' }, { date: '2026-10-27' }];
  const now = new Date(2026, 10, 9);
  L.reporterProgression(e, now, 3);
  assert.strictEqual(L.progressionDue(e, now), false);
  assert.strictEqual(L.progressionDue(e, new Date(2026, 10, 12)), true);
});

test('édition : déplacer et échanger des jours', () => {
  const a = [1, 2, 3];
  L.deplacer(a, 0, 2);
  assert.deepStrictEqual(a, [2, 3, 1]);
  L.deplacer(a, 0, -1);
  assert.deepStrictEqual(a, [2, 3, 1]);
  const p = L.programmeParDefaut();
  L.echangerJours(p, 0, 5);
  assert.strictEqual(p[0].exercices.length, 0);
  assert.strictEqual(p[5].nom, 'Haut du corps');
  assert.strictEqual(p[5].exercices.length, 4);
});

test('normaliserExercice : bornes et valeurs absurdes', () => {
  const e = L.normaliserExercice({ nom: '  ', mode: 'x', series: -4, min: 'abc', max: 2, repos: 99999 });
  assert.strictEqual(e.nom, 'Exercice');
  assert.strictEqual(e.mode, 'reps');
  assert.strictEqual(e.series, 1);
  assert.ok(e.max >= e.min);
  assert.strictEqual(e.repos, 600);
});

test('sauvegarde : aller-retour exact et refus des fichiers invalides', () => {
  const e = L.etatInitial(lundi);
  e.historique.push({ id: 'a', date: '2026-10-26', jour: 0, nom: 'Haut du corps', duree: 1500, series: 12, manuel: false });
  const r = L.validerSauvegarde(JSON.parse(JSON.stringify(e)));
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.etat.programme, e.programme);
  assert.deepStrictEqual(r.etat.historique, e.historique);
  for (const mauvais of [null, 'x', [], {}, { programme: [], historique: [] }, { programme: new Array(7).fill({}), historique: 3 }]) {
    assert.strictEqual(L.validerSauvegarde(mauvais).ok, false);
  }
  const bizarre = L.validerSauvegarde({ programme: new Array(7).fill({ exercices: [{ nom: '<img src=x>' }] }), historique: [{ date: 'pas une date' }] });
  assert.strictEqual(bizarre.ok, true);
  assert.strictEqual(bizarre.etat.historique.length, 0);
});

test('formatage du temps', () => {
  assert.strictEqual(L.formatDuree(65), '1:05');
  assert.strictEqual(L.formatDuree(0), '0:00');
});

test('dessins : chaque dessin existe et chaque exercice du programme en a un propre', () => {
  assert.deepStrictEqual([...L.DESSINS].sort(), [...Illus.CLES].sort());
  L.DESSINS.forEach((k) => {
    const svg = Illus.svg(k);
    assert.ok(svg.startsWith('<svg') && svg.includes('<polyline') && svg.includes('<circle'), k);
  });
  const attendu = { 'Pompes': 'pompes', 'Dips sur chaise': 'dips', 'Planche': 'planche', 'Planche latérale': 'lateral',
    'Crunchs classiques': 'crunch', 'Crunchs obliques': 'obliques', 'Relevé de jambes allongé': 'releve',
    'Superman': 'superman', 'Extension dorsale légère': 'extension', 'Mountain climbers lents': 'mountain',
    'Bird-dog': 'birddog', 'Étirement pectoraux/épaules': 'etirpecs', 'Marche ou vélo tranquille': 'marche',
    'Étirements généraux': 'etirgen', 'Rowing élastique ou bouteilles': 'rowing' };
  L.programmeParDefaut().forEach((j) => j.exercices.forEach((e) => {
    if (attendu[e.nom]) assert.strictEqual(L.dessinPour(e), attendu[e.nom], e.nom);
    else assert.strictEqual(L.dessinPour(e), 'enfant', e.nom); // étirement lombaires (position de l'enfant)
  }));
  assert.strictEqual(L.dessinPour({ nom: 'Burpees' }), 'generique');
  assert.strictEqual(L.dessinPour({ nom: 'Burpees', illus: 'pompes' }), 'pompes');
  assert.strictEqual(L.dessinPour({ nom: 'x', illus: 'nimportequoi' }), 'generique');
});

test('dessins : durée à tenir par défaut et personnalisée', () => {
  assert.strictEqual(L.tenirPour({ nom: 'Bird-dog' }), '2-3 s');
  assert.strictEqual(L.tenirPour({ nom: 'Superman' }), '1-2 s');
  assert.strictEqual(L.tenirPour({ nom: 'Pompes' }), '');
  assert.strictEqual(L.tenirPour({ nom: 'Bird-dog', tenir: '5 s' }), '5 s');
  assert.strictEqual(L.tenirPour({ nom: 'Bird-dog', tenir: '' }), '');
  const e = L.normaliserExercice({ nom: 'A', illus: 'pompes', tenir: '  3 s  ' });
  assert.strictEqual(e.illus, 'pompes');
  assert.strictEqual(e.tenir, '3 s');
  assert.strictEqual(L.normaliserExercice({ nom: 'A', illus: 'zzz' }).illus, '');
});
