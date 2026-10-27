/* Test de bout en bout : lance l'appli dans un navigateur simulant un téléphone.
 * Usage : node tests/entrainement/e2e.js   (démarre son propre petit serveur) */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const serveur = http.createServer((req, res) => {
  let f = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); // comme GitHub Pages
  if (!f.startsWith(RACINE) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

let echecs = 0, reussis = 0;
function ok(cond, msg) {
  if (cond) { reussis++; console.log('  ✓ ' + msg); } else { echecs++; console.log('  ✗ ÉCHEC : ' + msg); }
}
// Captures d'écran facultatives : CAPTURES=/dossier node tests/entrainement/e2e.js
const capture = async (page, nom) => { if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/' + nom }); };
const LUNDI = new Date(2026, 9, 26, 18, 0, 0);

async function nouvellePage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true, ...opts.ctx });
  await ctx.addInitScript(() => {
    window.__bips = 0; window.__verrous = 0;
    const AC = window.AudioContext;
    if (AC) {
      const o = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function () { window.__bips++; return o.call(this); };
    }
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__verrous++; return { release() {}, addEventListener() {} }; } } });
  });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  await page.clock.install({ time: opts.time || LUNDI });
  return { ctx, page, erreurs };
}

// Laisse à la page le temps de changer d'écran (le changement d'adresse est asynchrone).
const texte = async (page) => { await new Promise((r) => setTimeout(r, 150)); return page.locator('#app').innerText(); };
const lu = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('entrainement:v1')));

(async () => {
  await new Promise((r) => serveur.listen(0, r));
  const base = `http://localhost:${serveur.address().port}/entrainement/index.html`;
  const browser = await chromium.launch();

  console.log('\n1. Accueil le lundi');
  let { ctx, page, erreurs } = await nouvellePage(browser);
  await page.goto(base);
  let t = await texte(page);
  ok(/Lundi · Haut du corps/.test(t), 'la séance du lundi est proposée');
  ok(/Pompes/.test(t) && /Dips sur chaise/.test(t) && /Rowing/.test(t), 'les 4 exercices du lundi sont listés');
  ok(await page.getByRole('button', { name: 'Démarrer' }).isVisible(), 'bouton Démarrer présent');
  const taille = await page.getByRole('button', { name: 'Démarrer' }).boundingBox();
  ok(taille.height >= 60 && taille.width >= 300, `gros bouton (${Math.round(taille.width)}×${Math.round(taille.height)} px)`);
  ok(await page.locator('link[rel=manifest]').count() === 1, 'manifeste présent');
  await capture(page, '01-accueil.png');

  console.log('\n2. Séance guidée : répétitions, repos, navigation');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  t = await texte(page);
  ok(/Pompes/.test(t) && /Série 1 \/ 3/.test(t), 'exercice 1, série 1/3');
  ok(/Face au sol/.test(t), 'la description est affichée');
  ok(/pectoraux/i.test(t), 'la zone travaillée est affichée');
  ok(/3 × 8-12 répétitions/.test(t), 'la cible est affichée');
  ok(await page.evaluate(() => window.__verrous) >= 1, 'verrou « écran allumé » demandé');
  await capture(page, '02-seance.png');
  await page.getByRole('button', { name: 'Série terminée' }).click();
  t = await texte(page);
  ok(/Repos/.test(t) && /1:00/.test(t), 'repos automatique de 1:00');
  ok(/Ensuite : Pompes · série 2 \/ 3/.test(t), 'aperçu de la suite');
  await capture(page, '03-repos.png');
  await page.clock.runFor(10000);
  ok(/0:50/.test(await texte(page)), 'le minuteur descend (0:50 après 10 s)');
  await page.getByRole('button', { name: '+10 s' }).click();
  await page.clock.runFor(1000);
  ok(/1:00|0:59/.test(await texte(page)), '+10 s rallonge le repos');
  await page.getByRole('button', { name: 'Pause' }).click();
  const avant = await page.locator('#chiffres').innerText();
  await page.clock.runFor(20000);
  ok(avant === await page.locator('#chiffres').innerText(), 'Pause fige le minuteur (' + avant + ')');
  ok(/En pause/.test(await texte(page)), 'état « En pause » affiché');
  await page.getByRole('button', { name: 'Reprendre' }).click();
  await page.clock.runFor(1500);
  ok(await page.locator('#chiffres').innerText() !== avant, 'Reprendre relance le minuteur');
  await page.clock.runFor(70000);
  t = await texte(page);
  ok(/Série 2 \/ 3/.test(t), 'à la fin du repos, la série 2 démarre toute seule');
  ok(await page.evaluate(() => window.__bips) >= 4, 'des bips ont retenti (' + await page.evaluate(() => window.__bips) + ')');
  await page.getByRole('button', { name: 'Précédent' }).click();
  ok(/Série 1 \/ 3/.test(await texte(page)), 'Précédent revient à la série 1');
  await page.getByRole('button', { name: 'Suivant' }).click();
  ok(/Série 2 \/ 3/.test(await texte(page)), 'Suivant va à la série 2');
  await page.getByRole('button', { name: 'Série terminée' }).click();
  await page.getByRole('button', { name: 'Passer le repos' }).click();
  ok(/Série 3 \/ 3/.test(await texte(page)), '« Passer le repos » saute le repos');

  console.log('\n3. Séance complète, exercices au temps, par côté');
  let garde = 0;
  while (!/Bravo/.test(await texte(page)) && garde++ < 60) {
    t = await texte(page);
    if (await page.getByRole('button', { name: 'Série terminée' }).isVisible()) await page.getByRole('button', { name: 'Série terminée' }).click();
    else if (/Prépare-toi/.test(t)) {
      if (/Étirement/.test(t) && !(globalThis.__vuTemps)) { globalThis.__vuTemps = true; ok(/Côté|côté 1 \/ 2/.test(t) || /côté 1/.test(t), 'étirement : côté 1/2 annoncé'); }
      await page.clock.runFor(3200);
    }
    else if (await page.getByRole('button', { name: 'J\'ai fini' }).isVisible()) await page.clock.runFor(31000);
    else if (await page.getByRole('button', { name: 'Passer le repos' }).isVisible()) await page.getByRole('button', { name: 'Passer le repos' }).click();
  }
  ok(/Bravo/.test(await texte(page)), 'écran de fin « Bravo ! »');
  let etat = await lu(page);
  ok(etat.historique.length === 1, 'la séance est enregistrée dans l\'historique');
  ok(etat.historique[0].series === 11, 'nombre de séries = 11 (3+3+3+2 côté-à-côté) : ' + etat.historique[0].series);
  ok(etat.historique[0].date === '2026-10-26' && etat.historique[0].nom === 'Haut du corps', 'date et nom corrects');
  ok(etat.historique[0].duree > 100, 'durée enregistrée (' + etat.historique[0].duree + ' s)');
  await capture(page, '04-bravo.png');
  await page.getByRole('link', { name: 'Retour à l\'accueil' }).click();
  t = await texte(page);
  ok(/déjà faite aujourd'hui/.test(t) && /1 séance cette semaine/.test(t), 'accueil : séance cochée, 1 séance cette semaine');

  console.log('\n4. Vue semaine, historique');
  await page.getByRole('link', { name: 'Semaine' }).click();
  t = await texte(page);
  ok(['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].every((j) => t.includes(j)), '7 jours affichés');
  ok(await page.locator('.rang .coche.ok').count() === 1, 'une seule case cochée (lundi)');
  ok(/Samedi\s+Libre/.test(t), 'week-end libre');
  await capture(page, '05-semaine.png');
  await page.getByRole('link', { name: 'Historique' }).click();
  t = await texte(page);
  ok(/Séances réalisées \(1\)/i.test(t) && /lun\. 26 oct\. · Haut du corps/.test(t), 'historique : date + séance');
  ok(/Cette semaine\s+1/.test(t), 'compteur par semaine');
  await capture(page, '06-historique.png');

  console.log('\n5. Personnalisation du programme');
  await page.goto(base + '#/jour/1/modifier');
  await page.fill('#nom-jour', 'Abdos maison');
  await page.locator('#nom-jour').blur();
  await page.getByRole('button', { name: 'Descendre' }).first().click();
  t = await texte(page);
  ok(t.indexOf('Crunchs classiques') < t.indexOf('Planche\n'), 'réordonner : Crunchs passe avant Planche');
  await page.getByRole('button', { name: 'Monter' }).nth(1).click();
  await page.getByRole('link', { name: 'Modifier' }).first().click();
  await page.selectOption('#f-mode', 'temps');
  await page.fill('#f-series', '4');
  await page.fill('#f-min', '40');
  await page.fill('#f-max', '50');
  await page.fill('#f-repos', '20');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  etat = await lu(page);
  const p1 = etat.programme[1];
  ok(p1.nom === 'Abdos maison', 'nom du jour modifié');
  ok(p1.exercices[0].nom === 'Planche' && p1.exercices[0].series === 4 && p1.exercices[0].min === 40 && p1.exercices[0].max === 50 && p1.exercices[0].repos === 20, 'séries/temps/repos modifiés + ordre rétabli');
  await page.goto(base + '#/jour/1/exo/nouveau');
  await page.selectOption('#biblio', { label: 'Superman' });
  ok(await page.inputValue('#f-nom') === 'Superman' && (await page.inputValue('#f-desc')).includes('Sur le ventre'), 'ajout depuis la bibliothèque : champs préremplis');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.goto(base + '#/jour/1/exo/nouveau');
  await page.fill('#f-nom', 'Burpees <b>x</b>');
  await page.fill('#f-series', '2');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  etat = await lu(page);
  ok(etat.programme[1].exercices.length === 6 && etat.programme[1].exercices[5].nom === 'Burpees <b>x</b>', 'exercices ajoutés (6 au total)');
  ok(await page.locator('.exo-edit b', { hasText: 'Burpees' }).count() === 1 && await page.locator('.exo-edit b b').count() === 0, 'le texte saisi est affiché tel quel (pas de HTML injecté)');
  page.once('dialog', () => {});
  await page.getByRole('button', { name: 'Supprimer' }).last().click();
  await page.getByRole('button', { name: 'Supprimer', exact: true }).last().click();
  etat = await lu(page);
  ok(etat.programme[1].exercices.length === 5, 'suppression avec confirmation');
  await page.selectOption('#echange', '4');
  await page.getByRole('button', { name: /Échanger les deux jours/ }).click();
  await page.getByRole('button', { name: 'Échanger', exact: true }).click();
  etat = await lu(page);
  ok(etat.programme[4].nom === 'Abdos maison' && etat.programme[1].nom === 'Gainage et abdos', 'changer les jours : mardi et vendredi échangés');
  await page.reload();
  etat = await lu(page);
  ok(etat.programme[4].nom === 'Abdos maison', 'les modifications survivent au rechargement');

  console.log('\n6. Suggestion de progression');
  await ctx.close();
  ({ ctx, page, erreurs: erreurs } = await nouvellePage(browser, { time: new Date(2026, 10, 9, 18, 0, 0) }));
  await page.goto(base);
  // état fabriqué : dernière progression il y a 14 jours, 2 séances faites depuis
  // Utilise la logique de l'appli pour fabriquer l'état
  await page.evaluate(() => {
    const e = window.Logic.etatInitial(new Date(2026, 9, 26));
    e.historique = [
      { id: 'a', date: '2026-10-26', jour: 0, nom: 'Haut du corps', duree: 1500, series: 11, manuel: false },
      { id: 'b', date: '2026-10-27', jour: 1, nom: 'Gainage et abdos', duree: 1300, series: 11, manuel: false }
    ];
    localStorage.setItem('entrainement:v1', JSON.stringify(e));
  });
  await page.reload();
  t = await texte(page);
  ok(/Il est temps de progresser/.test(t) && /\+2 répétitions : Pompes/.test(t) && /\+5 secondes : Planche/.test(t), 'bandeau de progression affiché (+2 reps, +5 s)');
  await capture(page, '07-progression.png');
  await page.getByRole('button', { name: 'Plus tard (3 jours)' }).click();
  ok(!/Il est temps de progresser/.test(await texte(page)), '« Plus tard » masque le bandeau');
  etat = await lu(page);
  etat.progression.reporteJusquau = null;
  await page.evaluate((e) => localStorage.setItem('entrainement:v1', JSON.stringify(e)), etat);
  await page.reload();
  await page.getByRole('button', { name: 'Appliquer' }).click();
  etat = await lu(page);
  ok(etat.programme[0].exercices[0].min === 10 && etat.programme[0].exercices[0].max === 14, 'Appliquer : pompes 8-12 → 10-14');
  ok(etat.programme[1].exercices[0].min === 25 && etat.programme[1].exercices[0].max === 35, 'Appliquer : planche 20-30 s → 25-35 s');
  ok(!/Il est temps de progresser/.test(await texte(page)), 'le bandeau disparaît après application');

  console.log('\n7. Export / import');
  await page.getByRole('link', { name: 'Réglages' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter mes données' }).click()]);
  const chemin = '/tmp/export-test-entrainement.json';
  await dl.saveAs(chemin);
  const export_ = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  ok(/^entrainement-sauvegarde-2026-11-09\.json$/.test(dl.suggestedFilename()), 'fichier exporté : ' + dl.suggestedFilename());
  ok(export_.historique.length === 2 && export_.programme.length === 7, 'le fichier contient programme et historique');
  await ctx.close();
  ({ ctx, page, erreurs: erreurs } = await nouvellePage(browser));
  await page.goto(base + '#/reglages');
  await page.setInputFiles('#fichier-import', chemin);
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  etat = await lu(page);
  ok(etat.historique.length === 2 && etat.programme[0].exercices[0].max === 14, 'import dans une appli vierge : tout est restauré');
  fs.writeFileSync('/tmp/mauvais-entrainement.json', '{"coucou":1}');
  await page.setInputFiles('#fichier-import', '/tmp/mauvais-entrainement.json');
  await new Promise((r) => setTimeout(r, 400));
  ok(/incomplet|pas une sauvegarde/.test(await page.locator('#toast').innerText()), 'fichier invalide refusé avec un message clair');
  etat = await lu(page);
  ok(etat.historique.length === 2, 'données intactes après un import refusé');
  await capture(page, '08-reglages.png');

  console.log('\n8. Réglages et reprise');
  await page.getByRole('button', { name: '1 semaine' }).click();
  await page.getByRole('button', { name: '+3' }).click();
  etat = await lu(page);
  ok(etat.reglages.semainesProgression === 1 && etat.reglages.incrementReps === 3, 'réglages de progression enregistrés');
  await page.goto(base + '#/');
  await page.getByRole('button', { name: /Démarrer|Refaire la séance/ }).click();
  await page.getByRole('button', { name: 'Série terminée' }).click();
  await page.reload();
  t = await texte(page);
  ok(/Séance en pause/.test(t) || /Aucune|Reprendre/.test(t), 'après fermeture de l\'appli : « Séance en pause » proposée');
  await page.goto(base + '#/');
  await page.getByRole('button', { name: 'Reprendre la séance' }).click();
  ok(/Pompes/.test(await texte(page)) && /Repos/.test(await texte(page)), 'reprise exactement où on s\'était arrêté');
  await page.getByRole('button', { name: 'Quitter' }).click();
  await page.getByRole('button', { name: 'Abandonner sans enregistrer' }).click();
  etat = await lu(page);
  ok(etat.historique.length === 2, 'abandonner n\'enregistre rien');

  console.log('\n9. Jour libre et marquage manuel');
  await ctx.close();
  ({ ctx, page, erreurs: erreurs } = await nouvellePage(browser, { time: new Date(2026, 9, 31, 10, 0, 0) }));
  await page.goto(base);
  ok(/jour libre/.test(await texte(page)), 'samedi : jour libre');
  await page.goto(base + '#/jour/2');
  await page.getByRole('button', { name: 'Marquer comme faite' }).click();
  ok(await page.locator('text=Faite cette semaine').count() === 1, 'mercredi marqué comme fait');
  await page.getByRole('button', { name: 'Retirer la coche' }).click();
  ok(await page.getByRole('button', { name: 'Marquer comme faite' }).isVisible(), 'coche retirée');

  console.log('\n10. Hors connexion');
  await ctx.close();
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  const p2 = await c2.newPage();
  await p2.goto(base);
  await p2.evaluate(() => navigator.serviceWorker.ready);
  await p2.reload();
  await p2.waitForFunction(() => navigator.serviceWorker.controller);
  await c2.setOffline(true);
  await p2.reload();
  ok(/Aujourd'hui/.test(await texte(p2)), 'l\'appli se rouvre sans réseau');
  ok((await p2.evaluate(() => caches.keys())).some((k) => k.startsWith('entrainement-cache-')), 'cache hors-ligne créé');
  await c2.close();

  console.log('\nErreurs JavaScript pendant les tests :', erreurs.length ? erreurs : 'aucune');
  ok(erreurs.length === 0, 'aucune erreur dans la console');
  await browser.close();
  serveur.close();
  console.log(`\n${reussis} vérifications réussies, ${echecs} échec(s)`);
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
