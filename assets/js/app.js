// assets/js/app.js
import { calculateIncome } from './calc.js';

// ==== Theme toggle (default: system preference) ====
const THEME_KEY = 'wn-income-calc-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function effectiveTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    return stored || (media.matches ? 'dark' : 'light');
}

function updateToggleUI() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const eff = effectiveTheme();
    // The switch's thumb position is driven entirely by CSS (data-theme / prefers-color-scheme);
    // this just keeps its accessible state in sync.
    btn.setAttribute('aria-checked', eff === 'dark' ? 'true' : 'false');
    btn.setAttribute('aria-label', `Switch to ${eff === 'dark' ? 'light' : 'dark'} theme`);
}

function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) document.documentElement.setAttribute('data-theme', stored);

    const btn = document.getElementById('themeToggle');
    updateToggleUI();
    btn?.addEventListener('click', () => {
        const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
        localStorage.setItem(THEME_KEY, next);
        document.documentElement.setAttribute('data-theme', next);
        updateToggleUI();
    });
    media.addEventListener('change', () => {
        if (!localStorage.getItem(THEME_KEY)) updateToggleUI();
    });
}
initTheme();

// ==== FX rates: fetched once in the background, cached, so Calculate never waits on it ====
let ratesPromise = null;
function getRates() {
    if (!ratesPromise) {
        ratesPromise = fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) })
            .then(r => r.json())
            .catch(() => null);
    }
    return ratesPromise;
}
getRates(); // kick off immediately on page load

// Wait until everything (including Chart.js) is ready
window.addEventListener('load', () => {
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
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#6c7cf8';
        if (chart) chart.destroy();
        chart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ data: dataset, backgroundColor: accent, borderRadius: 8 }] },
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

    function debounce(fn, delay) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), delay);
        };
    }

    // ==== Word Count validation (1000–2800) ====
    // Purely advisory now: it flags the field but never blocks the live calculation below,
    // since calc.js's tiered pricing already handles any number without erroring.
    const wc = document.getElementById('word_count');

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
        return ok;
    }
    validateWC(); // set initial state

    // ==== Live calculation: recomputes from whatever is currently in the form,
    // treating blank/non-numeric fields as 0. ====
    async function compute() {
        validateWC();

        const w = +wc.value || 0;
        const s = +document.getElementById('subscribers').value || 0;
        const p = +document.getElementById('privilege_coins').value || 0;
        const g = +document.getElementById('gift_coins').value || 0;
        const m = document.getElementById('mgs').value;
        const ww = document.getElementById('winwin').value;
        const curr = document.getElementById('currency').value;

        // USD calculation with approved MGS logic
        const result = calculateIncome(w, s, p, g, m, ww);

        // Everything here is local/synchronous, so it updates immediately regardless of network.
        setVal('res_word_count', w);
        setVal('res_subscribers', s);
        setVal('res_final_sub', `$${result.finalSubUSD.toFixed(2)}`);
        setVal('res_privilege_income', `$${result.privilegeUSD.toFixed(2)}`);
        setVal('res_gift', `$${result.giftUSD.toFixed(2)}`);
        setVal('res_mgs', `$${result.mgsUSD.toFixed(2)}`);
        setVal('res_winwin', `$${result.winwinUSD.toFixed(2)}`);
        setVal('res_subtotal', `$${(result.finalSubUSD + result.privilegeUSD + result.giftUSD).toFixed(2)}`);
        renderChart([result.finalSubUSD, result.privilegeUSD, result.giftUSD]);

        // The currency-converted total is the only thing waiting on the (cached) FX rate.
        let rate = 1;
        const data = await getRates();
        if (data && data.result === 'success' && data.rates[curr]) rate = data.rates[curr];
        const converted = result.totalUSD * rate;
        document.getElementById('res_total').textContent = `${curr} ${converted.toFixed(2)}`;
    }

    const debouncedCompute = debounce(compute, 150);

    // Typed fields: debounced, so a fast typist doesn't retrigger the chart on every keystroke.
    ['word_count', 'subscribers', 'privilege_coins', 'gift_coins'].forEach(id => {
        document.getElementById(id).addEventListener('input', debouncedCompute);
    });
    // Dropdowns change discretely, so recompute right away.
    ['mgs', 'winwin', 'currency'].forEach(id => {
        document.getElementById(id).addEventListener('change', compute);
    });
    // The button still works, for anyone who prefers an explicit action.
    document.getElementById('calcBtn').addEventListener('click', compute);

    compute(); // reflect the default field values immediately on load
});
