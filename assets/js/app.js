// assets/js/app.js
import { calculateIncome } from './calc.js';

// Wait until everything (including Chart.js) is ready
window.addEventListener('load', () => {
    // ==== 3D tilt ====
    function attachTilt() {
        document.querySelectorAll('[data-tilt]').forEach(el => {
            el.addEventListener('pointermove', e => {
                const r = el.getBoundingClientRect();
                const cx = e.clientX - r.left, cy = e.clientY - r.top;
                const rx = ((cy / r.height) - .5) * -7, ry = ((cx / r.width) - .5) * 7;
                el.style.setProperty('--rx', rx.toFixed(2) + 'deg');
                el.style.setProperty('--ry', ry.toFixed(2) + 'deg');
            });
            el.addEventListener('pointerleave', () => {
                el.style.setProperty('--rx', '0deg');
                el.style.setProperty('--ry', '0deg');
            });
        });
    }

    // ==== Particle background ====
    (function space() {
        const c = document.getElementById('space'), d = c.getContext('2d'); let w, h, ps = [];
        function R() { w = c.width = innerWidth; h = c.height = innerHeight; }
        function init() {
            ps = Array.from({ length: 80 }, () => ({
                x: Math.random() * w, y: Math.random() * h,
                vx: (Math.random() - .5) * .2, vy: (Math.random() - .5) * .2,
                r: Math.random() * 1.6 + 0.4, op: Math.random() * 0.6 + 0.2
            }));
        }
        function draw() {
            d.clearRect(0, 0, w, h); d.fillStyle = 'white';
            ps.forEach(p => {
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0 || p.x > w) p.vx *= -1;
                if (p.y < 0 || p.y > h) p.vy *= -1;
                d.globalAlpha = p.op; d.beginPath(); d.arc(p.x, p.y, p.r, 0, Math.PI * 2); d.fill();
            });
            requestAnimationFrame(draw);
        }
        addEventListener('resize', () => { R(); init(); });
        R(); init(); draw();
    })();

    // ==== Chart setup (3 bars) ====
    const labels = ['Final Sub', 'Privilege', 'Gift'];
    let chart;

    function highlightCard(i) {
        document.querySelectorAll('.card').forEach(c => c.classList.remove('is-active'));
        const key = labels[i];
        const card = document.querySelector(`.card[data-key="${key}"]`);
        if (card) card.classList.add('is-active');
    }

    function renderChart(dataset) {
        const ctx = document.getElementById('breakdown').getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
        grad.addColorStop(0, 'rgba(123,255,178,0.85)');
        grad.addColorStop(1, 'rgba(120,207,255,0.85)');
        if (chart) chart.destroy();
        chart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ data: dataset, backgroundColor: grad, borderRadius: 10 }] },
            options: {
                maintainAspectRatio: false, responsive: true,
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true } },
                plugins: { legend: { display: false } },
                onHover: (e, els) => {
                    if (els && els.length) highlightCard(els[0].index);
                    else document.querySelectorAll('.card').forEach(c => c.classList.remove('is-active'));
                }
            }
        });
        const wrap = document.querySelector('.chart-wrap');
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => chart?.resize());
            ro.observe(wrap);
        }
    }

    function setVal(id, val) { document.getElementById(id).textContent = val; }

    // ==== Word Count validation (1000–2800) ====
    const wc = document.getElementById('word_count');
    const calcBtn = document.getElementById('calcBtn');

    // ensure there's a message element; create if missing
    function getOrCreateMsg() {
        let msg = document.getElementById('wc_msg');
        if (!msg) {
            const row = wc.closest('.row') || wc;
            msg = document.createElement('div');
            msg.id = 'wc_msg';
            msg.className = 'field-msg';
            msg.setAttribute('role', 'alert');
            msg.setAttribute('aria-live', 'polite');
            msg.hidden = true;
            row.insertAdjacentElement('afterend', msg);
        }
        return msg;
    }
    const wcMsg = getOrCreateMsg();

    function validateWC() {
        const min = parseInt(wc.min || '1000', 10);
        const max = parseInt(wc.max || '2800', 10);
        const v = parseInt(wc.value, 10);
        const ok = Number.isFinite(v) && v >= min && v <= max;

        if (!ok) {
            wc.classList.add('invalid');
            wc.setCustomValidity(`Please enter a value between ${min} and ${max}.`);
            wcMsg.textContent = `Average Word Count must be between ${min} and ${max}.`;
            wcMsg.hidden = false;
        } else {
            wc.classList.remove('invalid');
            wc.setCustomValidity('');
            wcMsg.textContent = '';
            wcMsg.hidden = true;
        }
        calcBtn.disabled = !ok;
        return ok;
    }
    wc.addEventListener('input', validateWC);
    wc.addEventListener('blur', validateWC);
    validateWC(); // set initial state

    // ==== Click handler ====
    document.getElementById('calcBtn').addEventListener('click', async () => {
        if (!validateWC()) return; // block if invalid WC

        const w = +document.getElementById('word_count').value || 0;
        const s = +document.getElementById('subscribers').value || 0;
        const p = +document.getElementById('privilege_coins').value || 0;
        const g = +document.getElementById('gift_coins').value || 0;
        const m = document.getElementById('mgs').value;
        const ww = document.getElementById('winwin').value;
        const curr = document.getElementById('currency').value;

        // USD calculation with approved MGS logic
        const result = calculateIncome(w, s, p, g, m, ww);

        // Try FX; fall back to USD if it fails
        let rate = 1;
        try {
            const r = await fetch('https://open.er-api.com/v6/latest/USD');
            const data = await r.json();
            if (data.result === 'success' && data.rates[curr]) rate = data.rates[curr];
        } catch (e) {
            console.warn('FX fetch failed, using USD totals');
        }

        const converted = result.totalUSD * rate;

        // Update UI
        setVal('res_word_count', w);
        setVal('res_subscribers', s);
        setVal('res_final_sub', `$${result.finalSubUSD.toFixed(2)}`);
        setVal('res_privilege_income', `$${result.privilegeUSD.toFixed(2)}`);
        setVal('res_gift', `$${result.giftUSD.toFixed(2)}`);
        setVal('res_mgs', `$${result.mgsUSD.toFixed(2)}`);
        setVal('res_winwin', `$${result.winwinUSD.toFixed(2)}`);
        setVal('res_subtotal', `$${(result.finalSubUSD + result.privilegeUSD + result.giftUSD).toFixed(2)}`);
        document.getElementById('res_total').textContent = `${curr} ${converted.toFixed(2)}`;

        renderChart([result.finalSubUSD, result.privilegeUSD, result.giftUSD]);
    });

    attachTilt();
    renderChart([0, 0, 0]); // stable initial chart size
});
