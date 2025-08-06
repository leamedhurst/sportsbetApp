(function () {
  // === CONFIG: replace with your real custom field ID ===
  // If your field id is 987654321, this becomes 'custom_field_987654321'
  const FASTCODE_FIELD = 'custom_field_123456789';

  const client = ZAFClient.init();

  // ---------- Utils ----------
  function resize() {
    setTimeout(() => {
      client.invoke('resize', {
        width: '100%',
        height: Math.max(document.body.scrollHeight, 300) + 'px'
      });
    }, 0);
  }

  // Small helper to create elements
  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children])
      .filter(Boolean)
      .forEach((c) => {
        if (typeof c === 'string') el.appendChild(document.createTextNode(c));
        else el.appendChild(c);
      });
    return el;
  }

  // Render attributes as cards (plain CSS classes that mimic styled-components option)
  function renderKV(obj) {
    const container = h('div', { class: 'attributes-container' });

    if (!obj || (typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length === 0)) {
      return h('div', { class: 'no-data-message' }, 'No attributes to display.');
    }

    Object.keys(obj).forEach((key) => {
      const value = obj[key];
      const valueEl =
        Array.isArray(value) || (value && typeof value === 'object')
          ? h('pre', { class: 'attribute-value' }, JSON.stringify(value, null, 2))
          : h('div', { class: 'attribute-value' }, String(value));

      const card = h('div', { class: 'attribute-card' }, [
        h('div', { class: 'attribute-key' }, key),
        valueEl
      ]);
      container.appendChild(card);
    });

    return container;
  }

  // ---------- Ticket field helpers ----------
  async function getFastcodeFromTicket() {
    // ZAF v2: property name is ticket.customField:<field_key>
    const key = `ticket.customField:${FASTCODE_FIELD}`;
    const resp = await client.get(key);
    return resp[key] || '';
  }

  function subscribeToFastcodeUIChanges(onChange) {
    // Fires when the AGENT edits the field in the UI
    client.on(`ticket.${FASTCODE_FIELD}.changed`, (e) => {
      const v = e && e.newValue ? String(e.newValue).trim() : '';
      onChange(v);
    });
  }

  // ---------- UI ----------
  function buildUI(container) {
    const wrap = h('div', { class: 'container' });
    const panel = h('div', { class: 'panel' });

    const title = h('h1', {}, 'FastBets Lookup');

    const form = h('form');
    const group = h('div', { class: 'form-group' });
    const label = h('label', { class: 'label', for: 'fastcode' }, 'Enter Fastcode');

    // No placeholder (as requested). Add autocomplete off to avoid browser prefill noise.
    const input = h('input', {
      id: 'fastcode',
      class: 'input',
      type: 'text',
      value: '',
      autocomplete: 'off'
    });

    const actions = h('div', { class: 'actions' });
    const fetchBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Get Attributes');
    const confirmBtn = h('button', { type: 'button', id: 'confirm', class: 'btn btn-secondary' }, 'Confirm');

    const error = h('div', { class: 'error' });
    const results = h('div', { id: 'results' });

    // Hide Confirm until results loaded
    confirmBtn.style.display = 'none';

    group.appendChild(label);
    group.appendChild(input);
    actions.appendChild(fetchBtn);
    actions.appendChild(confirmBtn);
    form.appendChild(group);
    form.appendChild(actions);

    // Confirm: reset UI + hide again
    confirmBtn.addEventListener('click', () => {
      input.value = '';
      results.innerHTML = '';
      error.textContent = '';
      confirmBtn.style.display = 'none';
      resize();
    });

    // Form submit triggers the fetch flow
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      runFetch({
        code: (input.value || '').trim(),
        fetchBtn,
        confirmBtn,
        results,
        error
      });
    });

    panel.appendChild(title);
    panel.appendChild(form);
    panel.appendChild(error);
    panel.appendChild(results);
    wrap.appendChild(panel);
    container.appendChild(wrap);

    return { input, fetchBtn, confirmBtn, results, error };
  }

  // Centralized fetch/render so we can call from multiple places
  async function runFetch(ctx) {
    const { code, fetchBtn, confirmBtn, results, error } = ctx;

    error.textContent = '';
    results.innerHTML = '';
    confirmBtn.style.display = 'none';

    if (!code) {
      error.textContent = 'Please enter a fastcode.';
      resize();
      return;
    }

    fetchBtn.disabled = true;

    // Loading state
    results.appendChild(
      h('div', { class: 'loading-container' }, [
        h('div', {}, 'Loading…'),
        h('p', {}, 'Fetching Fast Bets for your fastcode')
      ])
    );
    resize();

    const url =
      'https://t9tjcj1rud.execute-api.us-east-1.amazonaws.com/sportsbet/getFastBets?fastcode=' +
      encodeURIComponent(code);

    try {
      const data = await client.request({
        url,
        type: 'GET',
        dataType: 'json',
        headers: { Accept: 'application/json' }
      });

      results.innerHTML = '';

      if (Array.isArray(data)) {
        if (data.length === 0) {
          results.appendChild(h('div', { class: 'no-data-message' }, 'No results.'));
        } else {
          data.forEach((item, idx) => {
            results.appendChild(h('div', { class: 'label' }, 'Item ' + (idx + 1)));
            results.appendChild(renderKV(item));
          });
        }
      } else if (data && typeof data === 'object') {
        results.appendChild(renderKV(data));
      } else {
        results.appendChild(
          h('div', { class: 'attributes-container' }, [
            h('div', { class: 'attribute-card' }, [
              h('div', { class: 'attribute-key' }, 'value'),
              h('pre', { class: 'attribute-value' }, JSON.stringify(data, null, 2))
            ])
          ])
        );
      }

      // Show Confirm after successful render
      confirmBtn.style.display = 'inline-flex';
    } catch (err) {
      console.error(err);
      error.textContent = 'Request failed. ' + (err && err.responseText ? err.responseText : '');
      confirmBtn.style.display = 'none';
    } finally {
      fetchBtn.disabled = false;
      resize();
    }
  }

  // ---------- Init & Wiring ----------
  async function init() {
    const root = document.getElementById('app');
    const ui = buildUI(root);
    resize();

    // 1) On initial load, pull from ticket field (if present)
    try {
      const fc = await getFastcodeFromTicket();
      if (fc) {
        ui.input.value = fc;
        // Auto-fetch if you want immediate results on load:
        // await runFetch({ code: fc, ...ui });
      }
    } catch (e) {
      console.warn('Could not read fastcode field on load:', e);
    }

    // 2) When app pane is activated (agent switches back), re-read field
    client.on('app.activated', async () => {
      try {
        const fc = await getFastcodeFromTicket();
        if (fc && fc !== ui.input.value) {
          ui.input.value = fc;
          // Auto-fetch on activation change (optional):
          // await runFetch({ code: fc, ...ui });
        }
      } catch (e) {
        console.warn('app.activated read failed:', e);
      }
    });

    // 3) After ticket is saved (triggers may have modified the field), re-read
    client.on('ticket.submit.done', async () => {
      try {
        const fc = await getFastcodeFromTicket();
        if (fc && fc !== ui.input.value) {
          ui.input.value = fc;
          // Auto-fetch after save (optional):
          // await runFetch({ code: fc, ...ui });
        }
      } catch (e) {
        console.warn('ticket.submit.done read failed:', e);
      }
    });

    // 4) Live updates when the AGENT edits the field in the UI
    subscribeToFastcodeUIChanges(async (v) => {
      ui.input.value = v || '';
      // Auto-fetch on UI edit (optional):
      // if (v) await runFetch({ code: v, ...ui });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
