(function () {
  let FASTCODE_FIELD = 'custom_field_13448269212559'; // fallback
  const client = ZAFClient.init();

  // Utility to set up UI and event listeners once FASTCODE_FIELD is resolved
  async function initApp() {
    const root = document.getElementById('app');
    const ui = buildUI(root);
    resize();

    try {
      const fc = await getFastcodeFromTicket();
      if (fc) {
        ui.input.value = fc;
        await runFetch({ code: fc, ...ui });
      }
    } catch (e) {
      console.warn('Could not read fastcode field on load:', e);
    }

    client.on('app.activated', async () => {
      try {
        const fc = await getFastcodeFromTicket();
        if (fc && fc !== ui.input.value) {
          ui.input.value = fc;
          await runFetch({ code: fc, ...ui });
        }
      } catch (e) {
        console.warn('app.activated read failed:', e);
      }
    });

    client.on('ticket.submit.done', async () => {
      try {
        const fc = await getFastcodeFromTicket();
        if (fc && fc !== ui.input.value) {
          ui.input.value = fc;
          await runFetch({ code: fc, ...ui });
        }
      } catch (e) {
        console.warn('ticket.submit.done read failed:', e);
      }
    });

    subscribeToFastcodeUIChanges(async (v) => {
      ui.input.value = v || '';
      if (v) await runFetch({ code: v, ...ui });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    client.metadata().then((meta) => {
      const configuredId = meta.settings.custom_field_id;
      if (configuredId && /^\d+$/.test(configuredId)) {
        FASTCODE_FIELD = 'custom_field_' + configuredId;
      }
      initApp(); // only start app once FASTCODE_FIELD is finalized
    });
  });

  function resize() {
    setTimeout(() => {
      client.invoke('resize', {
        width: '100%',
        height: Math.max(document.body.scrollHeight, 300) + 'px'
      });
    }, 0);
  }

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

  async function getFastcodeFromTicket() {
    const key = `ticket.customField:${FASTCODE_FIELD}`;
    const resp = await client.get(key);
    return resp[key] || '';
  }

  function subscribeToFastcodeUIChanges(onChange) {
    client.on(`ticket.${FASTCODE_FIELD}.changed`, (e) => {
      const v = e && e.newValue ? String(e.newValue).trim() : '';
      onChange(v);
    });
  }

  function buildUI(container) {
    const wrap = h('div', { class: 'container' });
    const panel = h('div', { class: 'panel' });

    const title = h('h1', {}, 'FastBets Lookup');

    const form = h('form');
    const group = h('div', { class: 'form-group' });
    const label = h('label', { class: 'label', for: 'fastcode' }, 'Enter Fastcode');

    const input = h('input', {
      id: 'fastcode',
      class: 'input',
      type: 'text',
      value: '',
      autocomplete: 'off'
    });

    const actions = h('div', { class: 'actions' });
    const fetchBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Get Bet');
    const confirmBtn = h('button', { type: 'button', id: 'confirm', class: 'btn btn-secondary' }, 'Confirm');

    const error = h('div', { class: 'error' });
    const results = h('div', { id: 'results' });

    confirmBtn.style.display = 'none';

    group.appendChild(label);
    group.appendChild(input);
    actions.appendChild(fetchBtn);
    actions.appendChild(confirmBtn);
    form.appendChild(group);
    form.appendChild(actions);

    confirmBtn.addEventListener('click', async () => {
      try {
        const allCards = results.querySelectorAll('.attribute-card');
    
        // Extract values from the displayed data
        let market, stake, winner, price;
    
        allCards.forEach(card => {
          const key = card.querySelector('.attribute-key')?.textContent?.trim();
          const value = card.querySelector('.attribute-value')?.textContent?.trim();
    
          if (/market/i.test(key)) market = value;
          if (/stake/i.test(key)) stake = value;
          if (/winner/i.test(key)) winner = value;
          if (/price/i.test(key)) price = value;
        });
    
        if (!market || !stake || !winner || !price) {
          alert("Missing required data from the bet to confirm.");
          return;
        }
    
        const message = `Live Bet Confirmed for ${market} with stake of ${stake} result ${winner} and the price ${price}`;
    
        // Get ticket ID
        const { ticket } = await client.get('ticket');
        const ticketId = ticket.id;
    
        // Submit internal note
        await client.request({
          url: `/api/v2/tickets/${ticketId}.json`,
          type: 'PUT',
          dataType: 'json',
          contentType: 'application/json',
          data: JSON.stringify({
            ticket: {
              comment: {
                body: message,
                public: false
              }
            }
          })
        });
    
        // Clear UI
        input.value = '';
        results.innerHTML = '';
        error.textContent = '';
        confirmBtn.style.display = 'none';
        resize();
      } catch (e) {
        console.error('Failed to confirm bet:', e);
        alert('Failed to confirm bet. Please try again.');
      }
    });

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
})();
