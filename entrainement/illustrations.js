/* Petits dessins des exercices : un personnage schématique vu de profil, avec deux
 * positions (a, b) qui alternent. c = corps, a = partie qui travaille (en couleur),
 * t = tête, d = décor (chaise, mur...). Repère : 240 × 130, sol à y = 122. */
(function (root) {
  'use strict';

  var D = {
    pompes: {
      nom: 'Pompes',
      a: { c: [[[30, 116], [170, 76]]], a: [[[170, 76], [172, 116]]], t: [189, 70] },
      b: { c: [[[30, 116], [170, 104]]], a: [[[170, 104], [150, 106], [172, 116]]], t: [190, 100] }
    },
    dips: {
      nom: 'Dips sur chaise',
      d: [[[18, 86], [72, 86]], [[24, 86], [24, 122]], [[66, 86], [66, 122]]],
      a: { c: [[[74, 74], [88, 100]], [[88, 100], [136, 104], [182, 118]]], a: [[[74, 74], [68, 86]]], t: [78, 58] },
      b: { c: [[[76, 92], [90, 112]], [[90, 112], [136, 110], [182, 118]]], a: [[[76, 92], [58, 100], [68, 86]]], t: [78, 76] }
    },
    rowing: {
      nom: 'Rowing',
      a: { c: [[[100, 118], [106, 96], [100, 72]], [[100, 72], [158, 58]]], a: [[[158, 58], [160, 102]]], t: [174, 54] },
      b: { c: [[[100, 118], [106, 96], [100, 72]], [[100, 72], [158, 58]]], a: [[[158, 58], [128, 66], [146, 80]]], t: [174, 54] }
    },
    planche: {
      nom: 'Planche',
      a: { c: [[[30, 116], [168, 84]]], a: [[[168, 84], [168, 114], [204, 114]]], t: [186, 78] }
    },
    crunch: {
      nom: 'Crunchs',
      a: { c: [[[92, 112], [122, 84], [152, 112]], [[92, 112], [46, 112]]], a: [[[46, 110], [34, 100]]], t: [28, 110] },
      b: { c: [[[92, 112], [122, 84], [152, 112]]], a: [[[92, 112], [54, 92]], [[54, 92], [42, 82]]], t: [38, 84] }
    },
    releve: {
      nom: 'Relevé de jambes',
      a: { c: [[[34, 112], [92, 112]], [[40, 115], [74, 117]]], a: [[[92, 112], [92, 38]]], t: [20, 110] },
      b: { c: [[[34, 112], [92, 112]], [[40, 115], [74, 117]]], a: [[[92, 112], [172, 102]]], t: [20, 110] }
    },
    lateral: {
      nom: 'Planche latérale',
      a: { c: [[[30, 116], [160, 82]]], a: [[[160, 82], [160, 114], [192, 114]], [[160, 82], [162, 38]]], t: [176, 72] }
    },
    superman: {
      nom: 'Superman',
      a: { c: [[[22, 114], [84, 114]], [[84, 114], [150, 114]], [[150, 114], [212, 114]]], a: [], t: [168, 112] },
      b: { c: [], a: [[[22, 98], [84, 112]], [[84, 112], [150, 100]], [[150, 100], [212, 92]]], t: [168, 94] }
    },
    extension: {
      nom: 'Extension dorsale',
      a: { c: [[[24, 114], [88, 114]], [[88, 114], [152, 114]], [[152, 114], [100, 117]]], a: [], t: [170, 112] },
      b: { c: [[[24, 114], [88, 114]]], a: [[[88, 114], [150, 100]], [[150, 100], [136, 90], [158, 88]]], t: [166, 92] }
    },
    obliques: {
      nom: 'Crunchs obliques',
      a: { c: [[[92, 112], [168, 112]]], a: [[[92, 112], [114, 82], [146, 100]], [[92, 112], [56, 94]], [[56, 94], [78, 82], [106, 80]]], t: [42, 88] },
      b: { c: [[[92, 112], [170, 114]]], a: [[[92, 112], [122, 86], [150, 102]], [[92, 112], [60, 92]], [[60, 92], [84, 84], [114, 84]]], t: [46, 86] }
    },
    mountain: {
      nom: 'Mountain climbers',
      a: { c: [[[100, 92], [170, 76]], [[170, 76], [172, 116]], [[100, 92], [30, 112]]], a: [[[100, 92], [142, 100], [116, 116]]], t: [188, 70] },
      b: { c: [[[100, 92], [170, 76]], [[170, 76], [172, 116]], [[100, 92], [30, 112]]], a: [[[100, 92], [30, 116]]], t: [188, 70] }
    },
    birddog: {
      nom: 'Bird-dog',
      a: { c: [[[90, 84], [160, 84]], [[160, 84], [160, 116]], [[90, 84], [90, 116], [58, 116]]], a: [], t: [177, 78] },
      b: { c: [[[90, 84], [160, 84]], [[160, 84], [160, 116]], [[90, 84], [90, 116], [58, 116]]], a: [[[160, 84], [216, 84]], [[90, 84], [28, 84]]], t: [177, 78] }
    },
    etirpecs: {
      nom: 'Étirement pectoraux',
      d: [[[170, 6], [170, 122]]],
      a: { c: [[[100, 118], [108, 70]], [[118, 118], [108, 70]], [[108, 70], [108, 36]], [[108, 40], [106, 70]]], a: [[[140, 38], [166, 38], [166, 12]], [[140, 70], [140, 38]]], t: [140, 22] }
    },
    enfant: {
      nom: 'Position de l\'enfant',
      a: { c: [[[40, 116], [96, 116]], [[96, 116], [54, 98]], [[54, 98], [128, 106]]], a: [[[128, 106], [208, 116]]], t: [146, 110] }
    },
    marche: {
      nom: 'Marche / vélo',
      a: { c: [[[110, 66], [110, 30]], [[110, 34], [124, 52], [116, 66]], [[110, 34], [98, 52], [104, 66]]], a: [[[110, 66], [124, 92], [134, 118]], [[110, 66], [100, 92], [84, 112]]], t: [110, 17] },
      b: { c: [[[110, 66], [110, 30]], [[110, 34], [112, 52], [110, 66]]], a: [[[110, 66], [110, 92], [110, 118]]], t: [110, 17] }
    },
    etirgen: {
      nom: 'Étirements',
      a: { c: [[[100, 118], [108, 68]], [[116, 118], [108, 68]], [[108, 68], [120, 34]], [[120, 36], [96, 52], [106, 68]]], a: [[[120, 36], [140, 10], [160, 6]]], t: [126, 20] },
      b: { c: [[[100, 118], [108, 68]], [[116, 118], [108, 68]], [[108, 68], [96, 34]], [[96, 36], [120, 52], [110, 68]]], a: [[[96, 36], [76, 10], [56, 6]]], t: [90, 20] }
    },
    generique: {
      nom: 'Mouvement générique',
      a: { c: [[[110, 66], [110, 32]], [[110, 66], [104, 118]], [[110, 66], [116, 118]], [[110, 34], [96, 62]], [[110, 34], [124, 62]]], a: [], t: [110, 18] },
      b: { c: [[[110, 66], [110, 32]]], a: [[[110, 66], [90, 118]], [[110, 66], [130, 118]], [[110, 34], [84, 14]], [[110, 34], [136, 14]]], t: [110, 18] }
    }
  };

  var CLES = Object.keys(D);

  function pts(l) { return l.map(function (p) { return p[0] + ',' + p[1]; }).join(' '); }

  function lignes(liste, classe) {
    return (liste || []).map(function (l) { return '<polyline class="' + classe + '" points="' + pts(l) + '"/>'; }).join('');
  }

  function pose(p) {
    return lignes(p.c, 'c') + lignes(p.a, 'a') + '<circle class="c" cx="' + p.t[0] + '" cy="' + p.t[1] + '" r="10"/>';
  }

  // Cadre ajusté au personnage (toutes positions confondues), au format 2,3 : 1.
  function cadre(d) {
    var xs = [], ys = [122];
    function ajoute(listes) {
      (listes || []).forEach(function (l) { l.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
    }
    [d.a, d.b].forEach(function (p) {
      if (!p) return;
      ajoute(p.c); ajoute(p.a);
      xs.push(p.t[0] - 10, p.t[0] + 10); ys.push(p.t[1] - 10);
    });
    ajoute(d.d);
    var x0 = Math.min.apply(null, xs) - 14, x1 = Math.max.apply(null, xs) + 14;
    var y0 = Math.min.apply(null, ys) - 12, y1 = 130;
    var w = x1 - x0, h = y1 - y0, R = 2.3;
    if (w / h < R) { x0 -= (h * R - w) / 2; w = h * R; }
    else { y0 -= (w / R - h); h = w / R; }
    return { x: Math.round(x0), y: Math.round(y0), w: Math.round(w), h: Math.round(h) };
  }

  // options.pose : 'a' ou 'b' pour une image fixe ; sinon les deux positions alternent.
  function svg(cle, options) {
    var d = D[cle] || D.generique;
    var o = options || {};
    var v = cadre(d);
    var h = '<svg class="dessin' + (d.b && !o.pose ? ' anime' : '') + '" viewBox="' + [v.x, v.y, v.w, v.h].join(' ') + '" role="img" aria-label="' + d.nom.replace(/"/g, '') + '">';
    h += '<g class="decor"><polyline points="' + v.x + ',122 ' + (v.x + v.w) + ',122"/>' + lignes(d.d, '') + '</g>';
    if (o.pose === 'b' && d.b) h += '<g class="pose">' + pose(d.b) + '</g>';
    else if (o.pose || !d.b) h += '<g class="pose">' + pose(d.a) + '</g>';
    else h += '<g class="pose pa">' + pose(d.a) + '</g><g class="pose pb">' + pose(d.b) + '</g>';
    return h + '</svg>';
  }

  var Illus = { D: D, CLES: CLES, svg: svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = Illus;
  else root.Illus = Illus;
})(typeof window !== 'undefined' ? window : this);
