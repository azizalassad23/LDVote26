// Ornamen bergaya ukiran Dayak (spiral emas bertepi oranye di atas hitam), mengikuti banner Literacy Day 2026.
// Elemen dengan atribut data-ornament="panel|flourish|swirl" diisi SVG secara otomatis.
(function () {
  'use strict';
  const C = { ink: '#1D1512', gold: '#F4B81C', orange: '#E2692B' };
  let uid = 0;

  // Spiral yang membesar dari pusat, dengan ekor lengkung opsional di ujung luar.
  function spiral(cx, cy, r, turns, rot, dir, tail) {
    const steps = Math.ceil(turns * 40);
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = rot + dir * t * turns * Math.PI * 2;
      const rr = r * (0.12 + 0.88 * Math.pow(t, 0.9));
      pts.push((cx + rr * Math.cos(a)).toFixed(1) + ' ' + (cy + rr * Math.sin(a)).toFixed(1));
    }
    let d = 'M' + pts.join(' L');
    if (tail) d += ' Q' + tail.join(' ');
    return d;
  }

  // Goresan ganda: oranye lebar di bawah, emas di atas — memberi efek tepi seperti pada banner.
  const carved = (d, w) =>
    `<path d="${d}" fill="none" stroke="${C.orange}" stroke-width="${w + 6}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${C.gold}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

  function panel() {
    const id = 'clip' + ++uid;
    const shape = 'M80 4 C128 70 156 150 152 238 C149 300 120 342 80 356 C40 342 11 300 8 238 C4 150 32 70 80 4 Z';
    return `<svg viewBox="0 0 160 360" xmlns="http://www.w3.org/2000/svg" focusable="false">
      <defs><clipPath id="${id}"><path d="${shape}"/></clipPath></defs>
      <path d="${shape}" fill="${C.ink}"/>
      <g clip-path="url(#${id})">
        ${carved(spiral(76, 262, 58, 2.1, 0.4, 1, [150, 330, 120, 372]), 10)}
        ${carved(spiral(98, 150, 36, 1.8, Math.PI, -1, [30, 160, 24, 236]), 8)}
        ${carved(spiral(66, 78, 20, 1.5, 0, 1, [120, 70, 112, 120]), 6)}
        ${carved('M84 12 C70 40 60 60 66 78', 5)}
      </g>
      <path d="${shape}" fill="none" stroke="${C.orange}" stroke-width="4"/>
    </svg>`;
  }

  function flourish() {
    const half = `<path d="M6 14 C46 14 76 14 104 10" fill="none" stroke="${C.ink}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="${spiral(112, 12, 7, 1.4, Math.PI, 1)}" fill="none" stroke="${C.ink}" stroke-width="2.2" stroke-linecap="round"/>`;
    return `<svg viewBox="0 0 240 24" xmlns="http://www.w3.org/2000/svg" focusable="false">
      ${half}<g transform="translate(240 0) scale(-1 1)">${half}</g>
      <circle cx="120" cy="12" r="3.2" fill="${C.orange}"/>
    </svg>`;
  }

  function swirl() {
    return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" focusable="false">
      ${carved(spiral(120, 120, 64, 2.2, 0, 1, [30, 190, 6, 120]), 11)}
      ${carved(spiral(52, 52, 26, 1.6, Math.PI, -1, [110, 20, 150, 40]), 7)}
    </svg>`;
  }

  const makers = { panel, flourish, swirl };

  function render(root) {
    (root || document).querySelectorAll('[data-ornament]').forEach((el) => {
      if (el.dataset.ornamentDone) return;
      const make = makers[el.dataset.ornament];
      if (!make) return;
      el.innerHTML = make();
      el.dataset.ornamentDone = '1';
    });
  }

  // Spiral kecil sebagai latar kartu (dipakai lewat var(--swirl) di CSS).
  document.documentElement.style.setProperty('--swirl', `url("data:image/svg+xml,${encodeURIComponent(swirl())}")`);

  window.Ornament = { render };
  render();
})();
