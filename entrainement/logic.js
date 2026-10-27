/* Logique pure de l'appli d'entraînement (sans écran) : programme par défaut,
 * découpage d'une séance en étapes, semaine, progression, import/export.
 * Fonctionne dans le navigateur (window.Logic) et dans Node (tests). */
(function (root) {
  'use strict';

  var JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  var VERSION_DONNEES = 1;

  var DEFAUTS_REGLAGES = {
    semainesProgression: 2, // suggérer une progression toutes les 1 ou 2 semaines
    incrementReps: 2,       // +2 ou +3 répétitions
    incrementTemps: 5,      // +5 secondes de gainage
    bip: true,
    vibration: true
  };

  // Dessins disponibles (voir illustrations.js) et durée de maintien par défaut.
  var DESSINS = ['pompes', 'dips', 'rowing', 'planche', 'crunch', 'releve', 'lateral', 'superman',
    'extension', 'obliques', 'mountain', 'birddog', 'etirpecs', 'enfant', 'marche', 'etirgen', 'generique'];
  var TENIR_DEFAUT = { birddog: '2-3 s', superman: '1-2 s' };

  var uidCompteur = 0;
  function uid() {
    uidCompteur += 1;
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + uidCompteur;
  }

  /* ---------- Dates (toujours en heure locale) ---------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function cleDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function depuisCle(cle) {
    var p = String(cle).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  // 0 = lundi ... 6 = dimanche
  function indexJour(d) { return (d.getDay() + 6) % 7; }

  function ajouterJours(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function debutSemaine(d) { return ajouterJours(d, -indexJour(d)); }

  function joursEntre(a, b) {
    var ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    var ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((ub - ua) / 86400000);
  }

  /* ---------- Dessin d'un exercice ---------- */

  function sansAccents(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  // Dessin choisi, sinon deviné d'après le nom de l'exercice.
  function dessinPour(e) {
    if (e && DESSINS.indexOf(e.illus) >= 0) return e.illus;
    var n = sansAccents(e && e.nom);
    var regles = [
      [/enfant|etirement.*lombaire/, 'enfant'], [/etirement.*(pect|epaule)/, 'etirpecs'], [/etirement/, 'etirgen'],
      [/planche.*lat|lateral/, 'lateral'], [/planche|gainage/, 'planche'],
      [/oblique/, 'obliques'], [/crunch|abdo/, 'crunch'], [/releve|jambe/, 'releve'],
      [/pompe/, 'pompes'], [/dip/, 'dips'], [/rowing|tirage/, 'rowing'], [/superman/, 'superman'],
      [/extension|dorsal/, 'extension'], [/mountain|climber/, 'mountain'], [/bird|dog/, 'birddog'],
      [/marche|velo|course|cardio/, 'marche']
    ];
    for (var i = 0; i < regles.length; i++) if (regles[i][0].test(n)) return regles[i][1];
    return 'generique';
  }

  // Durée à tenir (« 2-3 s ») : celle de l'exercice, sinon celle par défaut du dessin.
  function tenirPour(e) {
    if (typeof e.tenir === 'string') return e.tenir;
    return TENIR_DEFAUT[dessinPour(e)] || '';
  }

  /* ---------- Programme par défaut ---------- */

  function exo(nom, zone, description, mode, series, min, max, repos, extra) {
    var e = {
      id: uid(), nom: nom, zone: zone, description: description,
      mode: mode, series: series, min: min, max: max,
      parCote: false, repos: repos, progresse: false
    };
    for (var k in (extra || {})) e[k] = extra[k];
    return e;
  }

  var D = {
    pompes: 'Face au sol, mains un peu plus larges que les épaules, corps aligné. Descendre en pliant les coudes puis repousser. Version sur les genoux possible.',
    dips: 'Dos à une chaise stable, mains sur le bord, jambes tendues. Descendre le bassin en pliant les coudes puis remonter.',
    rowing: 'Buste penché, dos plat. Tirer les mains vers le buste en resserrant les omoplates.',
    planche: 'Appui sur les avant-bras, corps aligné, ventre et fessiers contractés.',
    crunchs: 'Dos au sol, genoux pliés. Décoller les épaules sans tirer sur la nuque.',
    releve: 'Jambes tendues montées à la verticale puis descendues sans toucher le sol.',
    plancheLaterale: 'Appui sur un avant-bras, corps en ligne, hanche décollée.',
    superman: 'Sur le ventre, lever bras, torse et jambes de quelques centimètres. Tenir 1 à 2 secondes.',
    extension: 'Sur le ventre, décoller uniquement le buste de quelques centimètres.',
    obliques: 'Amener le coude vers le genou opposé en tournant le buste, en alternant.',
    mountain: 'En planche haute, ramener un genou vers la poitrine en alternant, lentement.',
    birdDog: 'À quatre pattes, tendre un bras et la jambe opposée, tenir 2-3 s.',
    etirPecs: 'Debout, avant-bras contre un mur ou un montant de porte. Tourner doucement le buste à l\'opposé jusqu\'à sentir l\'étirement. Respirer calmement.',
    enfant: 'À genoux, assis sur les talons, buste penché vers l\'avant, bras tendus devant soi, front vers le sol. Respirer lentement.',
    marche: 'Marche ou vélo à allure tranquille : tu dois pouvoir parler sans être essoufflé.',
    etirGeneraux: 'Enchaîne une dizaine d\'étirements doux (cou, épaules, pectoraux, dos, hanches, cuisses, mollets). Reste 20 à 30 secondes sur chacun, sans douleur.'
  };

  function programmeParDefaut() {
    return [
      { nom: 'Haut du corps', exercices: [
        exo('Pompes', 'Pectoraux, épaules, triceps', D.pompes, 'reps', 3, 8, 12, 60, { progresse: true }),
        exo('Dips sur chaise', 'Triceps, épaules', D.dips, 'reps', 3, 8, 10, 60, { progresse: true }),
        exo('Rowing élastique ou bouteilles', 'Dos, biceps', D.rowing, 'reps', 3, 12, 12, 45, { progresse: true }),
        exo('Étirement pectoraux/épaules', 'Pectoraux, épaules', D.etirPecs, 'temps', 2, 30, 30, 10, { parCote: true })
      ] },
      { nom: 'Gainage et abdos', exercices: [
        exo('Planche', 'Abdos profonds, gainage', D.planche, 'temps', 3, 20, 30, 30, { progresse: true }),
        exo('Crunchs classiques', 'Abdominaux', D.crunchs, 'reps', 3, 15, 15, 30, { progresse: true }),
        exo('Relevé de jambes allongé', 'Bas du ventre', D.releve, 'reps', 3, 10, 10, 45, { progresse: true }),
        exo('Planche latérale', 'Obliques, gainage', D.plancheLaterale, 'temps', 2, 20, 20, 30, { parCote: true, progresse: true })
      ] },
      { nom: 'Repos actif', exercices: [
        exo('Marche ou vélo tranquille', 'Cardio doux', D.marche, 'temps', 1, 900, 1200, 0),
        exo('Étirements généraux', 'Tout le corps', D.etirGeneraux, 'temps', 10, 20, 30, 20)
      ] },
      { nom: 'Haut du corps + dos', exercices: [
        exo('Pompes', 'Pectoraux, épaules, triceps', D.pompes, 'reps', 3, 8, 12, 60, { progresse: true }),
        exo('Superman', 'Dos, lombaires, fessiers', D.superman, 'reps', 3, 12, 12, 45, { progresse: true }),
        exo('Extension dorsale légère', 'Lombaires', D.extension, 'reps', 3, 10, 10, 45, { progresse: true }),
        exo('Étirement lombaires (position de l\'enfant)', 'Lombaires, dos', D.enfant, 'temps', 2, 30, 30, 10)
      ] },
      { nom: 'Gainage et abdos', exercices: [
        exo('Planche', 'Abdos profonds, gainage', D.planche, 'temps', 3, 25, 35, 30, { progresse: true }),
        exo('Crunchs obliques', 'Obliques', D.obliques, 'reps', 3, 12, 12, 30, { parCote: true, progresse: true }),
        exo('Mountain climbers lents', 'Abdos, gainage, cardio', D.mountain, 'reps', 3, 20, 20, 45, { progresse: true }),
        exo('Bird-dog', 'Dos, abdos profonds, équilibre', D.birdDog, 'reps', 3, 8, 8, 30, { parCote: true, progresse: true })
      ] },
      { nom: 'Libre', exercices: [] },
      { nom: 'Libre', exercices: [] }
    ].map(function (j, i) {
      j.id = i;
      j.exercices.forEach(function (e) { e.illus = dessinPour(e); });
      return j;
    });
  }

  function etatInitial(maintenant) {
    return {
      version: VERSION_DONNEES,
      programme: programmeParDefaut(),
      historique: [],
      reglages: copie(DEFAUTS_REGLAGES),
      progression: { derniere: cleDate(maintenant || new Date()), reporteJusquau: null }
    };
  }

  function copie(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- Affichage des cibles ---------- */

  function formatDuree(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + pad(s);
  }

  // « 20-30 s », « 15-20 min », « 8-12 »
  function formatPlage(e) {
    var unite = '';
    var a = e.min, b = e.max;
    if (e.mode === 'temps') {
      if (a >= 120 && a % 60 === 0 && b % 60 === 0) { a /= 60; b /= 60; unite = ' min'; }
      else unite = ' s';
    }
    return (a === b ? '' + a : a + '-' + b) + unite;
  }

  function formatCible(e) {
    var txt = e.series + ' × ' + formatPlage(e);
    if (e.mode === 'reps') txt += e.parCote ? ' par côté' : ' répétitions';
    else if (e.parCote) txt += ' par côté';
    return txt;
  }

  // Durée estimée d'une séance, en secondes (pour l'afficher avant de démarrer).
  function dureeEstimee(jour) {
    var total = 0;
    construireEtapes(jour).forEach(function (s) {
      if (s.type === 'rest') total += s.duree;
      else if (s.mode === 'temps') total += s.duree + s.prep;
      else total += 40; // une série de répétitions ≈ 40 s
    });
    return total;
  }

  /* ---------- Découpage d'une séance en étapes ---------- */

  var PREP_SEC = 3;
  var CHANGEMENT_COTE_SEC = 5;

  function construireEtapes(jour) {
    var etapes = [];
    (jour.exercices || []).forEach(function (e, ei) {
      for (var s = 1; s <= e.series; s++) {
        var cotes = (e.mode === 'temps' && e.parCote) ? [1, 2] : [0];
        cotes.forEach(function (cote, ci) {
          etapes.push({
            type: 'work', ei: ei, serie: s, nbSeries: e.series, cote: cote, mode: e.mode,
            duree: e.mode === 'temps' ? e.max : 0,
            prep: e.mode === 'temps' ? PREP_SEC : 0
          });
          if (ci < cotes.length - 1) {
            etapes.push({ type: 'rest', ei: ei, duree: CHANGEMENT_COTE_SEC, cote: true });
          }
        });
        if (s < e.series && e.repos > 0) {
          etapes.push({ type: 'rest', ei: ei, duree: e.repos, cote: false });
        }
      }
    });
    return etapes;
  }

  // Indice de la prochaine / précédente étape de travail (les repos sont sautés).
  function etapeTravail(etapes, depuis, sens) {
    for (var i = depuis + sens; i >= 0 && i < etapes.length; i += sens) {
      if (etapes[i].type === 'work') return i;
    }
    return -1;
  }

  /* ---------- Semaine et historique ---------- */

  // Pour chaque jour de la semaine contenant `ref` : la date et les séances faites ce jour-là.
  function vueSemaine(historique, ref) {
    var debut = debutSemaine(ref);
    var jours = [];
    for (var i = 0; i < 7; i++) {
      var cle = cleDate(ajouterJours(debut, i));
      jours.push({
        index: i, cle: cle,
        seances: historique.filter(function (h) { return h.date === cle; })
      });
    }
    return jours;
  }

  // Nombre de séances pour les `n` dernières semaines (la plus récente en premier).
  function seancesParSemaine(historique, ref, n) {
    var debut = debutSemaine(ref);
    var res = [];
    for (var w = 0; w < n; w++) {
      var d0 = ajouterJours(debut, -7 * w);
      var c0 = cleDate(d0), c1 = cleDate(ajouterJours(d0, 6));
      res.push({
        debut: c0,
        nombre: historique.filter(function (h) { return h.date >= c0 && h.date <= c1; }).length
      });
    }
    return res;
  }

  /* ---------- Progression ---------- */

  // Une suggestion est due si la dernière progression date de ≥ N semaines
  // et qu'au moins 2 séances ont été faites depuis.
  function progressionDue(etat, maintenant) {
    var p = etat.progression || {};
    var jours = joursEntre(depuisCle(p.derniere), maintenant);
    if (jours < 7 * etat.reglages.semainesProgression) return false;
    if (p.reporteJusquau && cleDate(maintenant) < p.reporteJusquau) return false;
    var faites = etat.historique.filter(function (h) { return h.date >= p.derniere; }).length;
    if (faites < 2) return false;
    return etat.programme.some(function (j) { return j.exercices.some(function (e) { return e.progresse; }); });
  }

  // Décrit ce que ferait la progression, sans rien modifier.
  function apercuProgression(etat) {
    var vus = {}, lignes = [];
    etat.programme.forEach(function (j) {
      j.exercices.forEach(function (e) {
        if (!e.progresse || vus[e.nom]) return;
        vus[e.nom] = true;
        lignes.push(e.mode === 'reps'
          ? '+' + etat.reglages.incrementReps + ' répétitions : ' + e.nom
          : '+' + etat.reglages.incrementTemps + ' secondes : ' + e.nom);
      });
    });
    return lignes;
  }

  // Applique la progression au programme (modifie `etat`).
  function appliquerProgression(etat, maintenant) {
    etat.programme.forEach(function (j) {
      j.exercices.forEach(function (e) {
        if (!e.progresse) return;
        var inc = e.mode === 'reps' ? etat.reglages.incrementReps : etat.reglages.incrementTemps;
        e.min += inc;
        e.max += inc;
      });
    });
    etat.progression = { derniere: cleDate(maintenant), reporteJusquau: null };
    return etat;
  }

  function reporterProgression(etat, maintenant, jours) {
    etat.progression.reporteJusquau = cleDate(ajouterJours(maintenant, jours));
    return etat;
  }

  /* ---------- Édition du programme ---------- */

  function deplacer(liste, de, vers) {
    if (vers < 0 || vers >= liste.length || de === vers) return liste;
    var x = liste.splice(de, 1)[0];
    liste.splice(vers, 0, x);
    return liste;
  }

  // Échange le contenu (nom + exercices) de deux jours : change les jours de séance.
  function echangerJours(programme, a, b) {
    if (a === b) return programme;
    var na = programme[a].nom, ea = programme[a].exercices;
    programme[a].nom = programme[b].nom; programme[a].exercices = programme[b].exercices;
    programme[b].nom = na; programme[b].exercices = ea;
    return programme;
  }

  // Remet les valeurs d'un exercice dans des bornes raisonnables.
  function normaliserExercice(e) {
    var n = function (v, def, mini, maxi) {
      v = Math.round(Number(v));
      if (!isFinite(v)) v = def;
      return Math.min(maxi, Math.max(mini, v));
    };
    var mode = e.mode === 'temps' ? 'temps' : 'reps';
    var plafond = mode === 'temps' ? 7200 : 500;
    var min = n(e.min, 10, 1, plafond);
    var max = n(e.max, min, 1, plafond);
    if (max < min) max = min;
    var r = {
      id: typeof e.id === 'string' && e.id ? e.id : uid(),
      nom: String(e.nom || 'Exercice').trim().slice(0, 80) || 'Exercice',
      zone: String(e.zone || '').trim().slice(0, 80),
      description: String(e.description || '').trim().slice(0, 600),
      mode: mode,
      series: n(e.series, 3, 1, 30),
      min: min, max: max,
      parCote: !!e.parCote,
      repos: n(e.repos, 30, 0, 600),
      progresse: !!e.progresse,
      illus: DESSINS.indexOf(e.illus) >= 0 ? e.illus : ''
    };
    if (typeof e.tenir === 'string') r.tenir = e.tenir.trim().slice(0, 20);
    return r;
  }

  /* ---------- Sauvegarde : validation à l'import ---------- */

  function validerSauvegarde(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { ok: false, erreur: 'Ce fichier n\'est pas une sauvegarde de l\'application.' };
    }
    if (!Array.isArray(obj.programme) || obj.programme.length !== 7) {
      return { ok: false, erreur: 'Le programme du fichier est incomplet (7 jours attendus).' };
    }
    if (!Array.isArray(obj.historique)) {
      return { ok: false, erreur: 'L\'historique du fichier est illisible.' };
    }
    var base = etatInitial(new Date());
    var etat = {
      version: VERSION_DONNEES,
      programme: obj.programme.map(function (j, i) {
        return {
          id: i,
          nom: String((j && j.nom) || JOURS[i]).trim().slice(0, 60) || JOURS[i],
          exercices: Array.isArray(j && j.exercices) ? j.exercices.map(normaliserExercice) : []
        };
      }),
      historique: obj.historique.filter(function (h) {
        return h && /^\d{4}-\d{2}-\d{2}$/.test(h.date);
      }).map(function (h) {
        return {
          id: typeof h.id === 'string' && h.id ? h.id : uid(),
          date: h.date,
          jour: Math.min(6, Math.max(0, Math.round(Number(h.jour)) || 0)),
          nom: String(h.nom || 'Séance').slice(0, 60),
          duree: Math.max(0, Math.round(Number(h.duree)) || 0),
          series: Math.max(0, Math.round(Number(h.series)) || 0),
          manuel: !!h.manuel
        };
      }),
      reglages: base.reglages,
      progression: base.progression
    };
    var r = obj.reglages || {};
    etat.reglages.semainesProgression = r.semainesProgression === 1 ? 1 : 2;
    etat.reglages.incrementReps = r.incrementReps === 3 ? 3 : 2;
    etat.reglages.incrementTemps = [5, 10].indexOf(r.incrementTemps) >= 0 ? r.incrementTemps : 5;
    etat.reglages.bip = r.bip !== false;
    etat.reglages.vibration = r.vibration !== false;
    var p = obj.progression || {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(p.derniere)) etat.progression.derniere = p.derniere;
    if (/^\d{4}-\d{2}-\d{2}$/.test(p.reporteJusquau)) etat.progression.reporteJusquau = p.reporteJusquau;
    return { ok: true, etat: etat };
  }

  var Logic = {
    JOURS: JOURS, VERSION_DONNEES: VERSION_DONNEES, DEFAUTS_REGLAGES: DEFAUTS_REGLAGES,
    uid: uid, cleDate: cleDate, depuisCle: depuisCle, indexJour: indexJour,
    ajouterJours: ajouterJours, debutSemaine: debutSemaine, joursEntre: joursEntre,
    programmeParDefaut: programmeParDefaut, etatInitial: etatInitial, copie: copie,
    formatDuree: formatDuree, formatPlage: formatPlage, formatCible: formatCible,
    dureeEstimee: dureeEstimee, construireEtapes: construireEtapes, etapeTravail: etapeTravail,
    vueSemaine: vueSemaine, seancesParSemaine: seancesParSemaine,
    progressionDue: progressionDue, apercuProgression: apercuProgression,
    appliquerProgression: appliquerProgression, reporterProgression: reporterProgression,
    deplacer: deplacer, echangerJours: echangerJours, normaliserExercice: normaliserExercice,
    validerSauvegarde: validerSauvegarde, DESCRIPTIONS: D, DESSINS: DESSINS, dessinPour: dessinPour, tenirPour: tenirPour
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
  else root.Logic = Logic;
})(typeof window !== 'undefined' ? window : this);
