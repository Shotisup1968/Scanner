/* Appli d'entraînement : écrans, séance guidée, stockage local. */
(function () {
  'use strict';

  var L = window.Logic;
  var CLE = 'entrainement:v1';
  var CLE_SEANCE = 'entrainement:seance';
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var INITIALES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  var CIRC = 2 * Math.PI * 90; // circonférence de l'anneau du minuteur

  var app = document.getElementById('app');
  var etat = charger();
  var S = restaurerSeance(); // séance en cours (ou null)
  var verrouEcran = null;
  var ctxAudio = null;
  var routePrecedente = null;

  /* ---------- Stockage ---------- */

  function charger() {
    var brut = null;
    try { brut = localStorage.getItem(CLE); } catch (e) { /* stockage indisponible */ }
    if (brut) {
      try {
        var r = L.validerSauvegarde(JSON.parse(brut));
        if (r.ok) return r.etat;
      } catch (e) { /* données illisibles */ }
      try { localStorage.setItem(CLE + ':corrompu', brut); } catch (e) { /* ignore */ }
    }
    return L.etatInitial(new Date());
  }

  function sauver() {
    try {
      localStorage.setItem(CLE, JSON.stringify(etat));
      return true;
    } catch (e) {
      message('Impossible d\'enregistrer sur ce téléphone.');
      return false;
    }
  }

  if (navigator.storage && navigator.storage.persist) {
    try { navigator.storage.persist(); } catch (e) { /* ignore */ }
  }

  /* ---------- Petits outils ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function dateLongue(d) {
    return L.JOURS[L.indexJour(d)] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()];
  }

  function dateCourte(cle) {
    var d = L.depuisCle(cle);
    return L.JOURS[L.indexJour(d)].slice(0, 3).toLowerCase() + '. ' + d.getDate() + ' ' + MOIS_COURT[d.getMonth()];
  }

  function minutes(sec) {
    if (!sec) return '—';
    var m = Math.round(sec / 60);
    return (m < 1 ? '< 1' : m) + ' min';
  }

  var minuteurToast = null;
  function message(texte) {
    var t = document.getElementById('toast');
    t.textContent = texte;
    t.hidden = false;
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(function () { t.hidden = true; }, 3500);
  }

  // Fenêtre de choix : renvoie une promesse avec la valeur du bouton choisi.
  function demander(titre, texte, boutons) {
    return new Promise(function (resolve) {
      var m = document.getElementById('modal');
      document.getElementById('modal-titre').textContent = titre;
      document.getElementById('modal-texte').textContent = texte;
      var zone = document.getElementById('modal-boutons');
      zone.innerHTML = '';
      boutons.forEach(function (b) {
        var el = document.createElement('button');
        el.type = 'button';
        el.textContent = b.label;
        if (b.style) el.className = b.style;
        el.addEventListener('click', function () { m.hidden = true; resolve(b.valeur); });
        zone.appendChild(el);
      });
      m.hidden = false;
      var premier = zone.querySelector('button');
      if (premier) premier.focus();
    });
  }

  function confirmer(titre, texte, libelle, danger) {
    return demander(titre, texte, [
      { label: libelle, valeur: true, style: danger ? 'danger' : 'primaire' },
      { label: 'Annuler', valeur: false }
    ]);
  }

  /* ---------- Son, vibration, écran allumé ---------- */

  function initAudio() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctxAudio) ctxAudio = new AC();
      if (ctxAudio.state === 'suspended') ctxAudio.resume();
    } catch (e) { /* pas de son */ }
  }

  function bip(long) {
    if (etat.reglages.bip && ctxAudio) {
      try {
        var t = ctxAudio.currentTime;
        var osc = ctxAudio.createOscillator();
        var gain = ctxAudio.createGain();
        osc.type = 'sine';
        osc.frequency.value = long ? 988 : 660;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + (long ? 0.6 : 0.15));
        osc.connect(gain);
        gain.connect(ctxAudio.destination);
        osc.start(t);
        osc.stop(t + (long ? 0.65 : 0.2));
      } catch (e) { /* ignore */ }
    }
    if (etat.reglages.vibration && navigator.vibrate) {
      try { navigator.vibrate(long ? 300 : 60); } catch (e) { /* ignore */ }
    }
  }

  function verrou(actif) {
    if (!actif) {
      if (verrouEcran) { try { verrouEcran.release(); } catch (e) { /* ignore */ } verrouEcran = null; }
      return;
    }
    if (verrouEcran || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (w) {
      verrouEcran = w;
      w.addEventListener('release', function () { if (verrouEcran === w) verrouEcran = null; });
    }).catch(function () { /* refusé : l'écran pourra s'éteindre */ });
  }

  /* ---------- Séance guidée ---------- */

  function creerSeance(idx) {
    var jour = L.copie(etat.programme[idx]);
    return {
      jourIdx: idx, jour: jour, steps: L.construireEtapes(jour),
      i: 0, phase: 'attente', endsAt: null, restant: null, totalMs: 0, dernierSec: null,
      paused: false, pauseDepuis: 0, pauseTotal: 0, debut: Date.now(), series: 0, fini: false
    };
  }

  function demarrerPhase(i) {
    var st = S.steps[i];
    var ms = null;
    S.i = i;
    S.dernierSec = null;
    if (st.type === 'work') {
      if (st.mode === 'temps') {
        if (st.prep > 0) { S.phase = 'prep'; ms = st.prep * 1000; }
        else { S.phase = 'run'; ms = st.duree * 1000; }
      } else {
        S.phase = 'attente';
      }
    } else {
      S.phase = 'repos';
      ms = st.duree * 1000;
    }
    S.totalMs = ms || 0;
    if (ms === null) { S.endsAt = null; S.restant = null; }
    else if (S.paused) { S.endsAt = null; S.restant = ms; }
    else { S.endsAt = Date.now() + ms; S.restant = null; }
  }

  function allerA(i) {
    demarrerPhase(i);
    sauverSeance();
    render();
  }

  function msRestant() {
    if (S.endsAt) return Math.max(0, S.endsAt - Date.now());
    if (S.restant !== null) return S.restant;
    return 0;
  }

  function dureeSeanceMs() {
    var fin = S.paused ? S.pauseDepuis : Date.now();
    return Math.max(0, fin - S.debut - S.pauseTotal);
  }

  function pauser() {
    if (!S || S.paused || S.fini) return;
    var now = Date.now();
    S.paused = true;
    S.pauseDepuis = now;
    if (S.endsAt) { S.restant = Math.max(0, S.endsAt - now); S.endsAt = null; }
    sauverSeance();
  }

  function reprendre() {
    if (!S || !S.paused) return;
    var now = Date.now();
    S.pauseTotal += now - S.pauseDepuis;
    S.paused = false;
    if (S.restant !== null) { S.endsAt = now + S.restant; S.restant = null; }
    S.dernierSec = null;
  }

  function avancer() {
    if (S.i + 1 >= S.steps.length) terminer();
    else allerA(S.i + 1);
  }

  function finPhase() {
    bip(true);
    var st = S.steps[S.i];
    if (st.type === 'work' && S.phase === 'prep') {
      S.phase = 'run';
      S.totalMs = st.duree * 1000;
      S.endsAt = Date.now() + S.totalMs;
      S.dernierSec = null;
      sauverSeance();
      render();
      return;
    }
    if (st.type === 'work') compterSerie(st);
    avancer();
  }

  function serieTerminee() {
    var st = S.steps[S.i];
    if (!st || st.type !== 'work') return;
    compterSerie(st);
    bip(false);
    avancer();
  }

  // Une série « par côté » ne compte qu'une fois (au second côté).
  function compterSerie(st) {
    if (st.cote !== 1) S.series++;
  }

  function suivant() {
    var j = L.etapeTravail(S.steps, S.i, 1);
    if (j === -1) {
      confirmer('Terminer la séance ?', 'C\'était le dernier exercice.', 'Terminer et enregistrer').then(function (ok) { if (ok) terminer(); });
    } else {
      allerA(j);
    }
  }

  function precedent() {
    var j = L.etapeTravail(S.steps, S.i, -1);
    allerA(j === -1 ? S.i : j);
  }

  function terminer() {
    var duree = Math.round(dureeSeanceMs() / 1000);
    S.fini = true;
    S.recap = { duree: duree, series: S.series, nom: S.jour.nom };
    etat.historique.push({
      id: L.uid(), date: L.cleDate(new Date()), jour: S.jourIdx, nom: S.jour.nom,
      duree: duree, series: S.series, manuel: false
    });
    sauver();
    effacerSeanceSauvee();
    verrou(false);
    bip(true);
    render();
  }

  function demarrer(idx) {
    if (!etat.programme[idx].exercices.length) { message('Cette séance est vide : ajoute des exercices.'); return; }
    initAudio();
    var lancer = function () {
      S = creerSeance(idx);
      demarrerPhase(0);
      sauverSeance();
      location.hash = '#/seance';
      render();
    };
    if (S && !S.fini) {
      demander('Une séance est déjà en cours', 'Tu peux la reprendre ou en commencer une nouvelle.', [
        { label: 'Reprendre la séance en cours', valeur: 'reprendre', style: 'primaire' },
        { label: 'Recommencer à zéro', valeur: 'nouvelle' },
        { label: 'Annuler', valeur: 'non', style: 'fantome' }
      ]).then(function (v) {
        if (v === 'nouvelle') lancer();
        else if (v === 'reprendre') reprendreDepuisAccueil();
      });
    } else {
      lancer();
    }
  }

  function reprendreDepuisAccueil() {
    initAudio();
    reprendre();
    location.hash = '#/seance';
    render();
  }

  function quitter() {
    var boutons = [{ label: 'Continuer la séance', valeur: 'continuer', style: 'primaire' },
      { label: 'Pause : je reviens plus tard', valeur: 'pause' }];
    if (S.series > 0) boutons.push({ label: 'Terminer et enregistrer', valeur: 'terminer' });
    boutons.push({ label: 'Abandonner sans enregistrer', valeur: 'abandon', style: 'danger' });
    demander('Quitter la séance ?', 'Rien n\'est perdu si tu mets en pause.', boutons).then(function (v) {
      if (v === 'pause') { pauser(); location.hash = '#/'; }
      else if (v === 'terminer') terminer();
      else if (v === 'abandon') { S = null; effacerSeanceSauvee(); verrou(false); location.hash = '#/'; }
    });
  }

  /* Séance mémorisée : si le téléphone ferme l'appli, on peut reprendre. */
  function sauverSeance() {
    if (!S || S.fini) return;
    try {
      localStorage.setItem(CLE_SEANCE, JSON.stringify({
        jourIdx: S.jourIdx, jour: S.jour, i: S.i, series: S.series,
        ecoule: dureeSeanceMs(), sauveA: Date.now()
      }));
    } catch (e) { /* ignore */ }
  }

  function effacerSeanceSauvee() {
    try { localStorage.removeItem(CLE_SEANCE); } catch (e) { /* ignore */ }
  }

  function restaurerSeance() {
    try {
      var brut = localStorage.getItem(CLE_SEANCE);
      if (!brut) return null;
      var d = JSON.parse(brut);
      if (!d || !d.jour || Date.now() - d.sauveA > 6 * 3600 * 1000) { effacerSeanceSauvee(); return null; }
      var r = L.validerSauvegarde({ programme: [0, 1, 2, 3, 4, 5, 6].map(function (n) { return n === d.jourIdx ? d.jour : { nom: 'x', exercices: [] }; }), historique: [] });
      if (!r.ok) return null;
      var jour = r.etat.programme[d.jourIdx];
      var steps = L.construireEtapes(jour);
      if (!steps.length) return null;
      var i = Math.min(Math.max(0, Math.round(d.i) || 0), steps.length - 1);
      var s = {
        jourIdx: d.jourIdx, jour: jour, steps: steps, i: i, phase: 'attente', endsAt: null, restant: null,
        totalMs: 0, dernierSec: null, paused: true, pauseDepuis: Date.now(), pauseTotal: 0,
        debut: Date.now() - (Number(d.ecoule) || 0), series: Math.max(0, Math.round(d.series) || 0), fini: false
      };
      S = s;
      demarrerPhase(i);
      return s;
    } catch (e) {
      return null;
    }
  }

  /* Mise à jour de l'affichage du minuteur, 5 fois par seconde. */
  function tic() {
    if (!S || S.fini || location.hash !== '#/seance') return;
    var el = document.getElementById('ecoule');
    if (el) el.textContent = L.formatDuree(dureeSeanceMs() / 1000);
    if (S.paused || !S.endsAt) return;
    var reste = S.endsAt - Date.now();
    var sec = Math.max(0, Math.ceil(reste / 1000));
    var ch = document.getElementById('chiffres');
    if (ch) ch.textContent = L.formatDuree(sec);
    var an = document.getElementById('avance');
    if (an && S.totalMs) an.style.strokeDashoffset = String(CIRC * (1 - Math.max(0, reste) / S.totalMs));
    if (sec !== S.dernierSec) {
      S.dernierSec = sec;
      if (sec >= 1 && sec <= 3) bip(false);
    }
    if (reste <= 0) finPhase();
  }
  setInterval(tic, 200);

  /* ---------- Vues ---------- */

  function etatJour(idx, ref) {
    var cle = L.cleDate(L.ajouterJours(L.debutSemaine(ref), idx));
    return { cle: cle, seances: etat.historique.filter(function (h) { return h.date === cle; }) };
  }

  function dessin(e, petite) {
    return '<div class="vignette' + (petite ? ' petite' : '') + '">' + Illus.svg(L.dessinPour(e)) + '</div>';
  }

  function pastilleTenir(e) {
    var t = L.tenirPour(e);
    return t ? '<div class="pastille">⏱ Tenir ' + esc(t) + '</div>' : '';
  }

  function listeExos(jour) {
    return '<ul class="liste">' + jour.exercices.map(function (e) {
      return '<li><span>' + esc(e.nom) + '</span><span class="cible">' + esc(L.formatCible(e)) + '</span></li>';
    }).join('') + '</ul>';
  }

  function vueAccueil() {
    var now = new Date();
    var idx = L.indexJour(now);
    var jour = etat.programme[idx];
    var faite = etatJour(idx, now).seances.length > 0;
    var html = '<div class="date">' + esc(dateLongue(now)) + '</div><h1>Aujourd\'hui</h1>';

    if (S && !S.fini) {
      html += '<div class="carte alerte"><div class="etiquette">Séance en pause</div><h2>' + esc(S.jour.nom) + '</h2>' +
        '<p class="doux petit">Exercice ' + (S.steps[S.i].ei + 1) + ' sur ' + S.jour.exercices.length + '</p>' +
        '<button class="primaire" data-action="reprendre-seance">Reprendre la séance</button></div>';
    }

    if (L.progressionDue(etat, now)) {
      html += '<div class="carte alerte"><div class="etiquette">Progression</div><h2>Il est temps de progresser 💪</h2>' +
        '<p class="doux petit">Si les dernières séances étaient faciles, ajoute :</p>' +
        '<ul class="liste">' + L.apercuProgression(etat).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +
        '<div class="pile" style="margin-top:12px"><button class="primaire" style="min-height:64px;font-size:19px" data-action="progression-oui">Appliquer</button>' +
        '<button data-action="progression-plus-tard">Plus tard (3 jours)</button></div></div>';
    }

    html += '<div class="carte' + (faite ? '' : ' accentuee') + '"><div class="etiquette">Séance du jour</div>';
    if (jour.exercices.length) {
      html += '<h2>' + esc(L.JOURS[idx]) + ' · ' + esc(jour.nom) + '</h2>' +
        '<p class="doux petit">' + jour.exercices.length + ' exercices · environ ' + minutes(L.dureeEstimee(jour)) +
        (faite ? ' · <b style="color:var(--accent)">✓ déjà faite aujourd\'hui</b>' : '') + '</p>' +
        (faite ? '' : listeExos(jour)) +
        '<div style="margin-top:14px"><button class="' + (faite ? '' : 'primaire') + '" data-action="demarrer" data-jour="' + idx + '">' + (faite ? 'Refaire la séance' : 'Démarrer') + '</button></div>';
    } else {
      html += '<h2>' + esc(L.JOURS[idx]) + ' · jour libre</h2><p class="doux" style="margin:0">Pas de séance prévue aujourd\'hui. Repose-toi !</p>';
    }
    html += '</div>';

    // Séance du jour faite ou jour libre : on propose directement la suivante.
    var proch = (faite || !jour.exercices.length) ? L.prochaineSeance(etat.programme, now) : null;
    if (proch) {
      var pj = etat.programme[proch.idx];
      html += '<div class="carte accentuee"><div class="etiquette">Prochaine séance · ' + (proch.dans === 1 ? 'demain' : 'dans ' + proch.dans + ' jours') + '</div>' +
        '<h2>' + esc(L.JOURS[proch.idx]) + ' · ' + esc(pj.nom) + '</h2>' +
        '<p class="doux petit">' + pj.exercices.length + ' exercices · environ ' + minutes(L.dureeEstimee(pj)) + '</p>' +
        '<div style="margin-top:6px"><button class="primaire" data-action="demarrer" data-jour="' + proch.idx + '">Commencer quand même</button></div></div>';
    }

    var sem = L.vueSemaine(etat.historique, now);
    html += '<a href="#/semaine" style="text-decoration:none;color:inherit"><div class="bandeau">' + sem.map(function (j) {
      return '<div class="' + (j.seances.length ? 'fait ' : '') + (j.index === idx ? 'auj' : '') + '">' + INITIALES[j.index] +
        '<i>' + (j.seances.length ? '✓' : '') + '</i></div>';
    }).join('') + '</div></a>';
    var nb = sem.reduce(function (a, j) { return a + j.seances.length; }, 0);
    html += '<p class="doux petit" style="text-align:center">' + nb + (nb > 1 ? ' séances' : ' séance') + ' cette semaine</p>';
    return html;
  }

  function vueSemaine() {
    var now = new Date();
    var idxAuj = L.indexJour(now);
    var sem = L.vueSemaine(etat.historique, now);
    var html = '<h1>Ma semaine</h1><p class="doux petit">Touche un jour pour voir, lancer ou modifier la séance.</p>';
    html += sem.map(function (j) {
      var p = etat.programme[j.index];
      var libre = !p.exercices.length;
      return '<a class="rang' + (j.index === idxAuj ? ' aujourdhui' : '') + '" href="#/jour/' + j.index + '">' +
        '<span class="coche' + (j.seances.length ? ' ok' : '') + '">' + (j.seances.length ? '✓' : '') + '</span>' +
        '<span class="corps"><span class="titre">' + L.JOURS[j.index] + (j.index === idxAuj ? '<span class="badge">AUJOURD\'HUI</span>' : '') + '</span><br>' +
        '<span class="sous">' + esc(p.nom) + (libre ? '' : ' · ' + p.exercices.length + ' exercices') + '</span></span>' +
        '<span class="doux">›</span></a>';
    }).join('');
    return html;
  }

  function vueJour(idx) {
    var p = etat.programme[idx];
    if (!p) return vueIntrouvable();
    var now = new Date();
    var ej = etatJour(idx, now);
    var passe = ej.cle <= L.cleDate(now);
    var manuelles = ej.seances.filter(function (h) { return h.manuel; });
    var html = '<div class="retour"><a href="#/semaine">‹ Semaine</a></div><h1>' + L.JOURS[idx] + '</h1><h2 class="doux" style="font-weight:600">' + esc(p.nom) + '</h2>';
    if (ej.seances.length) {
      html += '<p style="color:var(--accent);font-weight:700">✓ Faite cette semaine (' + esc(dateCourte(ej.cle)) + ')</p>';
    }
    if (p.exercices.length) {
      html += '<div class="carte">' + listeExos(p) + '<p class="doux petit" style="margin:10px 0 0">Environ ' + minutes(L.dureeEstimee(p)) + '</p></div>';
      html += '<div class="pile"><button class="primaire" data-action="demarrer" data-jour="' + idx + '">Démarrer cette séance</button>';
    } else {
      html += '<div class="carte"><p class="doux" style="margin:0">Jour libre : aucun exercice prévu.</p></div><div class="pile">';
    }
    if (passe && !ej.seances.length) html += '<button data-action="cocher" data-jour="' + idx + '">Marquer comme faite</button>';
    if (manuelles.length) html += '<button data-action="decocher" data-jour="' + idx + '">Retirer la coche</button>';
    html += '<a class="bouton" href="#/jour/' + idx + '/modifier">✎ Modifier ce jour</a></div>';

    p.exercices.forEach(function (e) {
      html += '<h3>' + esc(e.nom) + '</h3><div style="display:flex;gap:12px;align-items:center">' + dessin(e, true) + '<p class="doux petit" style="margin:0">' + esc(e.zone) + ' · ' + esc(L.formatCible(e)) + (e.repos ? ' · repos ' + e.repos + ' s' : '') + '</p></div><p class="petit">' + esc(e.description) + '</p>';
    });
    return html;
  }

  function vueEditionJour(idx) {
    var p = etat.programme[idx];
    if (!p) return vueIntrouvable();
    var html = '<div class="retour"><a href="#/jour/' + idx + '">‹ ' + L.JOURS[idx] + '</a></div><h1>Modifier ' + L.JOURS[idx].toLowerCase() + '</h1>';
    html += '<label for="nom-jour">Nom de la séance</label><input type="text" id="nom-jour" data-champ="nom-jour" data-jour="' + idx + '" maxlength="60" value="' + esc(p.nom) + '">';
    html += '<h3>Exercices</h3>';
    if (!p.exercices.length) html += '<p class="doux">Aucun exercice : c\'est un jour libre.</p>';
    p.exercices.forEach(function (e, k) {
      html += '<div class="exo-edit"><div class="corps"><b>' + esc(e.nom) + '</b><span class="doux petit">' + esc(L.formatCible(e)) + (e.repos ? ' · repos ' + e.repos + ' s' : '') + '</span></div>' +
        '<button aria-label="Monter" data-action="monter" data-jour="' + idx + '" data-exo="' + k + '"' + (k === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button aria-label="Descendre" data-action="descendre" data-jour="' + idx + '" data-exo="' + k + '"' + (k === p.exercices.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<a class="bouton" style="width:48px;min-height:48px;padding:0;border-radius:12px" aria-label="Modifier" href="#/jour/' + idx + '/exo/' + k + '">✎</a>' +
        '<button class="danger" aria-label="Supprimer" data-action="supprimer-exo" data-jour="' + idx + '" data-exo="' + k + '">✕</button></div>';
    });
    html += '<div class="pile" style="margin-top:12px"><a class="bouton primaire" style="min-height:64px;font-size:19px" href="#/jour/' + idx + '/exo/nouveau">+ Ajouter un exercice</a></div>';

    html += '<h3>Changer de jour</h3><p class="doux petit">Échange cette séance avec celle d\'un autre jour.</p>';
    html += '<select id="echange" aria-label="Échanger avec">' + L.JOURS.map(function (n, k) {
      return k === idx ? '' : '<option value="' + k + '">' + n + ' (' + esc(etat.programme[k].nom) + ')</option>';
    }).join('') + '</select>';
    html += '<div class="pile" style="margin-top:10px"><button data-action="echanger" data-jour="' + idx + '">⇄ Échanger les deux jours</button>' +
      '<button class="danger" data-action="vider-jour" data-jour="' + idx + '">Vider ce jour (jour libre)</button></div>';
    return html;
  }

  function bibliotheque() {
    var vus = {}, liste = [];
    etat.programme.concat(L.programmeParDefaut()).forEach(function (j) {
      j.exercices.forEach(function (e) {
        if (vus[e.nom]) return;
        vus[e.nom] = true;
        liste.push(e);
      });
    });
    return liste;
  }

  function vueEditionExo(idx, m) {
    var p = etat.programme[idx];
    if (!p) return vueIntrouvable();
    var nouveau = m === 'nouveau';
    var e = nouveau
      ? { nom: '', zone: '', description: '', mode: 'reps', series: 3, min: 10, max: 10, parCote: false, repos: 45, progresse: true }
      : p.exercices[Number(m)];
    if (!e) return vueIntrouvable();
    var biblio = bibliotheque();
    var html = '<div class="retour"><a href="#/jour/' + idx + '/modifier">‹ Annuler</a></div><h1>' + (nouveau ? 'Nouvel exercice' : 'Modifier l\'exercice') + '</h1>';
    html += '<form id="form-exo" data-mode="' + e.mode + '" data-jour="' + idx + '" data-exo="' + esc(m) + '" autocomplete="off">';
    if (nouveau) {
      html += '<label for="biblio">Partir d\'un exercice connu (facultatif)</label><select id="biblio"><option value="">— Exercice vide —</option>' +
        biblio.map(function (b, k) { return '<option value="' + k + '">' + esc(b.nom) + '</option>'; }).join('') + '</select>';
    }
    html += '<label for="f-nom">Nom</label><input type="text" id="f-nom" name="nom" maxlength="80" required value="' + esc(e.nom) + '">';
    html += '<label for="f-zone">Zone travaillée</label><input type="text" id="f-zone" name="zone" maxlength="80" value="' + esc(e.zone) + '">';
    html += '<label for="f-desc">Description</label><textarea id="f-desc" name="description" maxlength="600">' + esc(e.description) + '</textarea>';
    var dessinChoisi = L.dessinPour(e);
    html += '<label for="f-dessin">Dessin</label><div class="vignette" id="apercu-dessin" style="margin-bottom:8px">' + Illus.svg(dessinChoisi) + '</div>' +
      '<select id="f-dessin" name="illus">' + L.DESSINS.map(function (k) {
        return '<option value="' + k + '"' + (k === dessinChoisi ? ' selected' : '') + '>' + esc(Illus.D[k].nom) + '</option>';
      }).join('') + '</select>';
    html += '<label for="f-tenir">Durée à tenir en position (facultatif, ex. 2-3 s)</label><input type="text" id="f-tenir" name="tenir" maxlength="20" value="' + esc(L.tenirPour(e)) + '">';
    html += '<label for="f-mode">Type d\'exercice</label><select id="f-mode" name="mode"><option value="reps"' + (e.mode === 'reps' ? ' selected' : '') + '>Répétitions</option><option value="temps"' + (e.mode === 'temps' ? ' selected' : '') + '>Au temps (maintien, compte à rebours)</option></select>';
    html += '<label for="f-series">Nombre de séries</label><input type="number" inputmode="numeric" id="f-series" name="series" min="1" max="30" value="' + e.series + '">';
    html += '<div class="deux"><div><label for="f-min"><span class="m-reps">Répétitions (min)</span><span class="m-temps">Durée min (secondes)</span></label><input type="number" inputmode="numeric" id="f-min" name="min" min="1" value="' + e.min + '"></div>' +
      '<div><label for="f-max"><span class="m-reps">Répétitions (max)</span><span class="m-temps">Durée max (secondes)</span></label><input type="number" inputmode="numeric" id="f-max" name="max" min="1" value="' + e.max + '"></div></div>';
    html += '<p class="doux petit m-temps" style="margin-top:6px">Le compte à rebours dure la valeur max. Pour 15 minutes, écris 900.</p>';
    html += '<p class="doux petit m-reps" style="margin-top:6px">Pour un nombre fixe, mets la même valeur dans min et max.</p>';
    html += '<label for="f-repos">Repos entre les séries (secondes)</label><input type="number" inputmode="numeric" id="f-repos" name="repos" min="0" max="600" value="' + e.repos + '">';
    html += '<label class="case"><input type="checkbox" name="parCote"' + (e.parCote ? ' checked' : '') + '> À faire de chaque côté</label>';
    html += '<label class="case"><input type="checkbox" name="progresse"' + (e.progresse ? ' checked' : '') + '> Inclure dans les suggestions de progression</label>';
    html += '<div class="pile" style="margin-top:16px"><button class="primaire" type="submit">Enregistrer</button></div></form>';
    return html;
  }

  function vueHistorique() {
    var now = new Date();
    var semaines = L.seancesParSemaine(etat.historique, now, 6);
    var maxi = Math.max(1, Math.max.apply(null, semaines.map(function (s) { return s.nombre; })));
    var total = etat.historique.length;
    var html = '<h1>Historique</h1>';
    html += '<div class="carte"><div class="etiquette">Séances par semaine</div>' + semaines.map(function (s, k) {
      var d = L.depuisCle(s.debut);
      var lib = k === 0 ? 'Cette semaine' : (d.getDate() + ' ' + MOIS_COURT[d.getMonth()]);
      return '<div class="barre-ligne"><span class="lib">' + lib + '</span><span class="piste"><i style="width:' + Math.round(100 * s.nombre / maxi) + '%"></i></span><b>' + s.nombre + '</b></div>';
    }).join('') + '</div>';
    html += '<h3>Séances réalisées (' + total + ')</h3>';
    if (!total) html += '<p class="doux">Aucune séance pour l\'instant. Lance ta première séance depuis l\'écran « Aujourd\'hui ».</p>';
    etat.historique.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }).forEach(function (h) {
      html += '<div class="exo-edit"><div class="corps"><b>' + esc(dateCourte(h.date)) + ' · ' + esc(h.nom) + '</b><span class="doux petit">' +
        (h.manuel ? 'cochée à la main' : minutes(h.duree) + ' · ' + h.series + ' séries') + '</span></div>' +
        '<button class="danger" aria-label="Supprimer cette séance" data-action="suppr-hist" data-id="' + esc(h.id) + '">✕</button></div>';
    });
    return html;
  }

  function segments(cle, valeurs, courant, suffixe) {
    return '<div class="segments">' + valeurs.map(function (v) {
      return '<button type="button" data-action="reglage" data-cle="' + cle + '" data-val="' + v + '" aria-pressed="' + (v === courant) + '">' + (cle === 'semainesProgression' ? v + (v > 1 ? ' semaines' : ' semaine') : suffixe + v) + '</button>';
    }).join('') + '</div>';
  }

  function vueReglages() {
    var r = etat.reglages;
    var html = '<h1>Réglages</h1>';
    html += '<h3>Progression</h3><label>Me suggérer de progresser toutes les</label>' + segments('semainesProgression', [1, 2], r.semainesProgression);
    html += '<label>Répétitions à ajouter</label>' + segments('incrementReps', [2, 3], r.incrementReps, '+');
    html += '<label>Secondes de gainage à ajouter</label>' + segments('incrementTemps', [5, 10], r.incrementTemps, '+');
    html += '<h3>Son</h3><label class="case"><input type="checkbox" data-champ="bip"' + (r.bip ? ' checked' : '') + '> Bips du minuteur</label>' +
      '<label class="case"><input type="checkbox" data-champ="vibration"' + (r.vibration ? ' checked' : '') + '> Vibration (si le téléphone le permet)</label>';
    html += '<h3>Sauvegarde</h3><p class="doux petit">Tes données restent uniquement sur ce téléphone. Exporte-les de temps en temps dans un fichier pour ne rien perdre.</p>' +
      '<div class="pile"><button class="primaire" style="min-height:64px;font-size:19px" data-action="exporter">Exporter mes données</button>' +
      '<button data-action="importer">Importer un fichier</button></div>';
    html += '<h3>Remise à zéro</h3><div class="pile"><button class="danger" data-action="reinit-programme">Remettre le programme d\'origine</button>' +
      '<button class="danger" data-action="reinit-historique">Effacer l\'historique</button></div>';
    html += '<h3>À savoir</h3><p class="doux petit">Pour installer l\'appli : dans Safari (iPhone) touche Partager puis « Sur l\'écran d\'accueil » ; dans Chrome (Android) menu ⋮ puis « Installer l\'application ».</p>' +
      '<p class="doux petit">' + ('wakeLock' in navigator ? 'L\'écran reste allumé pendant les séances.' : 'Ce navigateur ne peut pas garder l\'écran allumé : règle la mise en veille du téléphone sur « jamais » pendant tes séances.') + '</p>';
    return html;
  }

  function vueIntrouvable() {
    return '<h1>Page introuvable</h1><a class="bouton" href="#/">Retour à l\'accueil</a>';
  }

  /* ---------- Vue de la séance ---------- */

  function vueSeance() {
    if (!S) return '<h1>Aucune séance en cours</h1><a class="bouton primaire" href="#/">Retour à l\'accueil</a>';
    if (S.fini) {
      var r = S.recap;
      return '<div class="recap"><div class="gros">🎉</div><h1>Bravo !</h1><p class="doux">' + esc(r.nom) + ' terminée</p>' +
        '<div class="stats"><div><b>' + L.formatDuree(r.duree) + '</b><span class="doux petit">durée</span></div><div><b>' + r.series + '</b><span class="doux petit">séries</span></div></div>' +
        '<a class="bouton primaire" href="#/historique" data-action="fermer-seance">Voir l\'historique</a>' +
        '<div style="margin-top:10px"><a class="bouton" href="#/" data-action="fermer-seance">Retour à l\'accueil</a></div></div>';
    }
    var st = S.steps[S.i];
    var nbExos = S.jour.exercices.length;
    var exoIdx = st.ei;
    var e = S.jour.exercices[exoIdx];
    var pct = Math.round(100 * S.i / S.steps.length);
    var html = '<div class="seance"><div class="seance-haut"><button data-action="quitter">✕ Quitter</button>' +
      '<div class="info">Exercice ' + (exoIdx + 1) + ' / ' + nbExos + '</div><div class="info" style="flex:none" id="ecoule">' + L.formatDuree(dureeSeanceMs() / 1000) + '</div></div>' +
      '<div class="progbar"><i style="width:' + pct + '%"></i></div>';

    if (st.type === 'work') {
      var lib = 'Série ' + st.serie + ' / ' + st.nbSeries + (st.cote ? ' · côté ' + st.cote + ' / 2' : '');
      html += '<div class="zone">' + esc(e.zone) + '</div><h1>' + esc(e.nom) + '</h1><div class="serie">' + lib + '</div><div class="cible">' + esc(L.formatCible(e)) + '</div>';
      html += '<div class="milieu' + (st.mode === 'temps' ? ' avec-dessin' : '') + '">' + dessin(e) + pastilleTenir(e);
      if (st.mode === 'temps') html += anneau(S.phase === 'prep' ? 'prep' : 'travail', S.phase === 'prep' ? 'Prépare-toi…' : 'Tiens bon !');
      html += '</div><div class="bas">';
      if (st.mode === 'temps' && S.phase === 'prep') html += '<button class="primaire" data-action="go">Commencer maintenant</button>';
      else if (st.mode === 'temps') html += '<button class="primaire" data-action="fini-temps">J\'ai fini</button>';
      else html += '<button class="primaire" data-action="serie-finie">Série terminée</button>';
      html += '<details class="details"><summary>Détails de l\'exercice</summary>' + esc(e.description) + '</details>';
    } else {
      var suiv = S.steps[S.i + 1];
      var se = suiv ? S.jour.exercices[suiv.ei] : null;
      html += '<div class="zone">' + (st.cote ? 'Change de côté' : 'Récupération') + '</div><h1>' + (st.cote ? 'Autre côté' : 'Repos') + '</h1>';
      if (se) html += '<div class="cible">Ensuite : ' + esc(se.nom) + ' · série ' + suiv.serie + ' / ' + suiv.nbSeries + (suiv.cote ? ' · côté ' + suiv.cote : '') + '</div>';
      html += '<div class="milieu avec-dessin">' + anneau('repos', 'Repos') + (se ? dessin(se, true) : '') + '</div><div class="bas">' +
        '<div class="ligne"><button data-action="plus10">+10 s</button><button class="primaire" style="flex:2" data-action="passer">Passer le repos</button></div>';
    }

    html += '<div class="nav3"><button data-action="precedent"><span>◀</span>Précédent</button>' +
      '<button class="pause" data-action="pause">' + (S.paused ? '<span>▶</span>Reprendre' : '<span>⏸</span>Pause') + '</button>' +
      '<button data-action="suivant"><span>▶</span>Suivant</button></div></div></div>';
    return html;
  }

  function anneau(classe, libelle) {
    var reste = msRestant();
    var off = S.totalMs ? CIRC * (1 - reste / S.totalMs) : 0;
    return '<div class="anneau ' + classe + '"><svg viewBox="0 0 200 200" aria-hidden="true"><circle class="fond" cx="100" cy="100" r="90"/>' +
      '<circle class="avance" id="avance" cx="100" cy="100" r="90" stroke-dasharray="' + CIRC.toFixed(1) + '" style="stroke-dashoffset:' + off.toFixed(1) + '"/></svg>' +
      '<div class="centre"><div class="chiffres" id="chiffres">' + L.formatDuree(Math.ceil(reste / 1000)) + '</div><div class="phase">' + (S.paused ? 'En pause' : libelle) + '</div></div></div>';
  }

  /* ---------- Routeur ---------- */

  function render() {
    var p = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    var page = p[0] || 'accueil';
    var html;

    if (S && S.fini && page !== 'seance') { S = null; }
    if (page !== 'seance' && S && !S.fini) { pauser(); verrou(false); }
    if (page === 'seance' && S && !S.fini) verrou(true);

    switch (page) {
      case 'accueil': html = vueAccueil(); break;
      case 'semaine': html = vueSemaine(); break;
      case 'historique': html = vueHistorique(); break;
      case 'reglages': html = vueReglages(); break;
      case 'seance': html = vueSeance(); break;
      case 'jour':
        var idx = Number(p[1]);
        if (!(idx >= 0 && idx <= 6) || p[1] === '') html = vueIntrouvable();
        else if (p[2] === 'modifier') html = vueEditionJour(idx);
        else if (p[2] === 'exo') html = vueEditionExo(idx, p[3]);
        else html = vueJour(idx);
        break;
      default: html = vueIntrouvable();
    }

    app.innerHTML = html;
    app.className = page === 'seance' ? 'plein' : '';
    var tabs = document.getElementById('tabs');
    tabs.hidden = page === 'seance';
    Array.prototype.forEach.call(tabs.querySelectorAll('a'), function (a) {
      var actif = a.getAttribute('data-tab') === (page === 'jour' ? 'semaine' : page);
      a.classList.toggle('actif', actif);
      if (actif) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });

    var cleRoute = location.hash;
    if (cleRoute !== routePrecedente) window.scrollTo(0, 0);
    routePrecedente = cleRoute;
  }

  /* ---------- Actions (clics) ---------- */

  function lireFormExo(form) {
    var f = new FormData(form);
    return L.normaliserExercice({
      id: null,
      nom: f.get('nom'), zone: f.get('zone'), description: f.get('description'), mode: f.get('mode'),
      series: f.get('series'), min: f.get('min'), max: f.get('max'), repos: f.get('repos'),
      parCote: f.get('parCote') === 'on', progresse: f.get('progresse') === 'on',
      illus: f.get('illus'), tenir: f.get('tenir')
    });
  }

  function exporter() {
    var contenu = JSON.stringify(Object.assign({ application: 'entrainement', exporteLe: new Date().toISOString() }, etat), null, 2);
    var nom = 'entrainement-sauvegarde-' + L.cleDate(new Date()) + '.json';
    var fichier;
    try { fichier = new File([contenu], nom, { type: 'application/json' }); } catch (e) { fichier = null; }
    var telecharger = function () {
      var url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
      var a = document.createElement('a');
      a.href = url; a.download = nom;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      message('Sauvegarde exportée : ' + nom);
    };
    if (fichier && navigator.canShare && navigator.canShare({ files: [fichier] })) {
      navigator.share({ files: [fichier], title: 'Sauvegarde entraînement' }).catch(function (err) {
        if (!err || err.name !== 'AbortError') telecharger();
      });
    } else {
      telecharger();
    }
  }

  var actions = {
    'demarrer': function (el) { demarrer(Number(el.dataset.jour)); },
    'reprendre-seance': function () { reprendreDepuisAccueil(); },
    'progression-oui': function () {
      L.appliquerProgression(etat, new Date());
      sauver(); render();
      message('Programme mis à jour. Bonne progression !');
    },
    'progression-plus-tard': function () { L.reporterProgression(etat, new Date(), 3); sauver(); render(); },
    'cocher': function (el) {
      var idx = Number(el.dataset.jour);
      etat.historique.push({ id: L.uid(), date: etatJour(idx, new Date()).cle, jour: idx, nom: etat.programme[idx].nom, duree: 0, series: 0, manuel: true });
      sauver(); render();
    },
    'decocher': function (el) {
      var cle = etatJour(Number(el.dataset.jour), new Date()).cle;
      etat.historique = etat.historique.filter(function (h) { return !(h.date === cle && h.manuel); });
      sauver(); render();
    },
    'monter': function (el) { L.deplacer(etat.programme[+el.dataset.jour].exercices, +el.dataset.exo, +el.dataset.exo - 1); sauver(); render(); },
    'descendre': function (el) { L.deplacer(etat.programme[+el.dataset.jour].exercices, +el.dataset.exo, +el.dataset.exo + 1); sauver(); render(); },
    'supprimer-exo': function (el) {
      var j = etat.programme[+el.dataset.jour], k = +el.dataset.exo;
      confirmer('Supprimer cet exercice ?', j.exercices[k].nom, 'Supprimer', true).then(function (ok) {
        if (ok) { j.exercices.splice(k, 1); sauver(); render(); }
      });
    },
    'echanger': function (el) {
      var a = +el.dataset.jour, b = +document.getElementById('echange').value;
      confirmer('Échanger les jours ?', L.JOURS[a] + ' et ' + L.JOURS[b] + ' échangent leurs séances.', 'Échanger').then(function (ok) {
        if (!ok) return;
        L.echangerJours(etat.programme, a, b);
        sauver(); location.hash = '#/jour/' + b; message('Séances échangées.');
      });
    },
    'vider-jour': function (el) {
      var j = etat.programme[+el.dataset.jour];
      confirmer('Vider ce jour ?', 'Tous les exercices de ' + L.JOURS[+el.dataset.jour].toLowerCase() + ' seront supprimés.', 'Vider', true).then(function (ok) {
        if (ok) { j.exercices = []; j.nom = 'Libre'; sauver(); render(); }
      });
    },
    'suppr-hist': function (el) {
      confirmer('Supprimer cette séance de l\'historique ?', '', 'Supprimer', true).then(function (ok) {
        if (ok) { etat.historique = etat.historique.filter(function (h) { return h.id !== el.dataset.id; }); sauver(); render(); }
      });
    },
    'reglage': function (el) {
      etat.reglages[el.dataset.cle] = Number(el.dataset.val);
      sauver(); render();
    },
    'exporter': function () { exporter(); },
    'importer': function () { document.getElementById('fichier-import').click(); },
    'reinit-programme': function () {
      confirmer('Remettre le programme d\'origine ?', 'Tes modifications du programme seront perdues. L\'historique est conservé.', 'Remettre', true).then(function (ok) {
        if (ok) { etat.programme = L.programmeParDefaut(); sauver(); message('Programme d\'origine restauré.'); }
      });
    },
    'reinit-historique': function () {
      confirmer('Effacer tout l\'historique ?', 'Cette action est définitive. Pense à exporter avant.', 'Tout effacer', true).then(function (ok) {
        if (ok) { etat.historique = []; sauver(); message('Historique effacé.'); }
      });
    },
    /* séance */
    'quitter': function () { quitter(); },
    'serie-finie': function () { serieTerminee(); },
    'go': function () { S.endsAt = S.paused ? null : Date.now(); if (S.paused) S.restant = 0; },
    'fini-temps': function () { compterSerie(S.steps[S.i]); bip(false); avancer(); },
    'passer': function () { avancer(); },
    'plus10': function () {
      if (S.endsAt) S.endsAt += 10000; else if (S.restant !== null) S.restant += 10000;
      S.totalMs += 10000;
    },
    'precedent': function () { precedent(); },
    'suivant': function () { suivant(); },
    'pause': function () { if (S.paused) reprendre(); else pauser(); render(); },
    'fermer-seance': function () { /* la navigation fait le reste */ }
  };

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var fn = actions[el.dataset.action];
    if (fn) fn(el);
  });

  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.dataset && el.dataset.champ === 'nom-jour') {
      var j = etat.programme[Number(el.dataset.jour)];
      j.nom = el.value.trim().slice(0, 60) || L.JOURS[Number(el.dataset.jour)];
      sauver();
    } else if (el.dataset && (el.dataset.champ === 'bip' || el.dataset.champ === 'vibration')) {
      etat.reglages[el.dataset.champ] = el.checked;
      sauver();
      if (el.checked && el.dataset.champ === 'bip') { initAudio(); bip(false); }
      if (el.checked && el.dataset.champ === 'vibration' && navigator.vibrate) navigator.vibrate(80);
    } else if (el.id === 'f-mode') {
      el.form.dataset.mode = el.value === 'temps' ? 'temps' : 'reps';
    } else if (el.id === 'f-dessin') {
      document.getElementById('apercu-dessin').innerHTML = Illus.svg(el.value);
      el.form.tenir.value = L.tenirPour({ illus: el.value });
    } else if (el.id === 'biblio') {
      var b = bibliotheque()[Number(el.value)];
      var f = el.form;
      if (!b) return;
      f.nom.value = b.nom; f.zone.value = b.zone; f.description.value = b.description;
      f.mode.value = b.mode; f.dataset.mode = b.mode;
      f.series.value = b.series; f.min.value = b.min; f.max.value = b.max; f.repos.value = b.repos;
      f.parCote.checked = b.parCote; f.progresse.checked = b.progresse;
      var dc = L.dessinPour(b);
      f.illus.value = dc; f.tenir.value = L.tenirPour(b);
      document.getElementById('apercu-dessin').innerHTML = Illus.svg(dc);
    } else if (el.id === 'fichier-import') {
      importer(el);
    }
  });

  document.addEventListener('submit', function (ev) {
    if (ev.target.id !== 'form-exo') return;
    ev.preventDefault();
    var f = ev.target;
    var idx = Number(f.dataset.jour);
    var e = lireFormExo(f);
    var liste = etat.programme[idx].exercices;
    if (f.dataset.exo === 'nouveau') liste.push(e);
    else { e.id = liste[Number(f.dataset.exo)].id; liste[Number(f.dataset.exo)] = e; }
    sauver();
    location.hash = '#/jour/' + idx + '/modifier';
    message('Exercice enregistré.');
  });

  function importer(input) {
    var fichier = input.files && input.files[0];
    input.value = '';
    if (!fichier) return;
    fichier.text().then(function (texte) {
      var r;
      try { r = L.validerSauvegarde(JSON.parse(texte)); }
      catch (e) { r = { ok: false, erreur: 'Ce fichier n\'est pas lisible (JSON invalide).' }; }
      if (!r.ok) { message(r.erreur); return; }
      confirmer('Remplacer tes données ?',
        'Le fichier contient ' + r.etat.historique.length + ' séances et un programme complet. Tes données actuelles seront remplacées.',
        'Importer', true).then(function (ok) {
        if (!ok) return;
        etat = r.etat;
        S = null; effacerSeanceSauvee();
        sauver(); render();
        message('Données importées.');
      });
    }).catch(function () { message('Impossible de lire ce fichier.'); });
  }

  window.addEventListener('hashchange', render);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      if (S && !S.fini && location.hash === '#/seance') verrou(true);
    } else {
      sauverSeance();
    }
  });

  if (!location.hash) location.hash = '#/';
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('service-worker.js').catch(function () { /* hors-ligne indisponible */ });
    });
  }
})();
