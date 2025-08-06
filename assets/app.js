/**
 * @license Copyright 2024 Your Name
 *
 * Sublicensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview
 * This file contains the core logic for the Fast Bets Lookup Zendesk app.
 * It handles UI creation, API requests, and synchronization with ticket data.
 */

(function () {
  'use strict';

  // --- App Configuration ---

  // NOTE: This should be replaced with the real custom field ID from your Zendesk instance.
  // Example: if your field ID is 987654321, this becomes 'custom_field_987654321'.
  const FASTCODE_FIELD = 'custom_field_123456789';

  // --- ZAF Client ---

  const client = ZAFClient.init();

  // --- Utility Functions ---

  /**
   * Resizes the app iframe to fit its content.
   * A timeout is used to ensure the DOM has been updated before resizing.
   */
  function resize() {
    setTimeout(() => {
      client.invoke('resize', {
        width: '100%',
        height: Math.max(document.body.scrollHeight, 300) + 'px'
      });
    }, 0);
  }

  /**
   * A lightweight hyperscript-style function to create HTML elements.
   * @param {string} tag - The HTML tag name.
   * @param {object} [attrs={}] - A map of attributes (e.g., { class: 'foo', 'data-id': 1 }).
   * @param {Array|string} [children=[]] - A single child or an array of children (elements or strings).
   * @returns {HTMLElement} The created DOM element.
   */
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

  /**
   * Renders a key-value object as a series of styled cards.
   * Handles nested objects/arrays by pretty-printing them as JSON.
   * @param {object} obj - The object to render.
   * @returns {HTMLElement} A container element with the rendered cards.
   */
  function renderKV(obj) {
    const container = h('div', { class: 'attributes-container' });

    if (!obj || (typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length === 0)) {
      return h('div', { class: 'no-data-message' }, 'No attributes to display.');
    }

    Object.keys(obj).forEach((key) => {
      const value = obj[key];
      const isComplex = Array.isArray(value) || (value && typeof value === 'object');
      const valueEl = isComplex
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

  // --- Zendesk Ticket Field Helpers ---

  /**
   * Retrieves the value of the fastcode custom field from the current ticket.
   * @returns {Promise<string>} The fastcode value, or an empty string if not found.
   */
  async function getFastcodeFromTicket() {
    const key = `ticket.customField:${FASTCODE_FIELD}`;
    const resp = await client.get(key);
    return resp[key] || '';
  }

  /**
   * Subscribes to changes in the fastcode custom field UI.
   * @param {function(string): void} onChange - The callback to execute with the new value.
   */
  function subscribeToFastcodeUIChanges(onChange) {
    client.on(`ticket.${FASTCODE_FIELD}.changed`, (e) => {
      const value = e && e.newValue ? String(e.newValue).trim() : '';
      onChange(value);
    });
  }

  // --- UI Construction ---

  /**
   * Builds the initial user interface of the app.
   * Note: This function only creates the DOM elements; event binding is handled separately.
   * @returns {object} A map of the core UI elements for later use.
   */
  function buildUI() {
    const title = h('h1', {}, 'FastBets Lookup');

    const label = h('label', { class: 'label', for: 'fastcode' }, 'Enter Fastcode');
    const input = h('input', { id: 'fastcode', class: 'input', type: 'text', autocomplete: 'off' });
    const formGroup = h('div', { class: 'form-group' }, [label, input]);

    const fetchBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Get Attributes');
    const confirmBtn = h('button', { type: 'button', id: 'confirm', class: 'btn btn-secondary' }, 'Confirm');
    const actions = h('div', { class: 'actions' }, [fetchBtn, confirmBtn]);

    const form = h('form', {}, [formGroup, actions]);

    const error = h('div', { class: 'error' });
    const results = h('div', { id: 'results' });

    const panel = h('div', { class: 'panel' }, [title, form, error, results]);
    const container = h('div', { class: 'container' }, panel);

    // Hide the confirm button initially.
    confirmBtn.style.display = 'none';

    document.getElementById('app').appendChild(container);

    return { form, input, fetchBtn, confirmBtn, results, error };
  }

  // --- API and Data Handling ---

  /**
   * A centralized function to fetch and render fastcode attributes.
   * Manages UI state (loading, error, success).
   * @param {object} ctx - The context object.
   * @param {string} ctx.code - The fastcode to look up.
   * @param {HTMLElement} ctx.fetchBtn - The fetch button element.
   * @param {HTMLElement} ctx.confirmBtn - The confirm button element.
   * @param {HTMLElement} ctx.results - The results container element.
   * @param {HTMLElement} ctx.error - The error display element.
   */
  async function runFetch(ctx) {
    const { code, fetchBtn, confirmBtn, results, error } = ctx;

    // Reset UI state
    error.textContent = '';
    results.innerHTML = '';
    confirmBtn.style.display = 'none';

    if (!code) {
      error.textContent = 'Please enter a fastcode.';
      resize();
      return;
    }

    fetchBtn.disabled = true;

    // Show loading indicator
    results.appendChild(
      h('div', { class: 'loading-container' }, [
        h('div', {}, 'Loading…'),
        h('p', {}, 'Fetching Fast Bets for your fastcode')
      ])
    );
    resize();

    const url = `https://t9tjcj1rud.execute-api.us-east-1.amazonaws.com/sportsbet/getFastBets?fastcode=${encodeURIComponent(code)}`;

    try {
      const data = await client.request({
        url,
        type: 'GET',
        dataType: 'json',
        headers: { Accept: 'application/json' }
      });

      results.innerHTML = ''; // Clear loading indicator

      // Render data based on its structure
      if (Array.isArray(data)) {
        if (data.length === 0) {
          results.appendChild(h('div', { class: 'no-data-message' }, 'No results.'));
        } else {
          data.forEach((item, idx) => {
            results.appendChild(h('div', { class: 'label' }, `Item ${idx + 1}`));
            results.appendChild(renderKV(item));
          });
        }
      } else if (data && typeof data === 'object') {
        results.appendChild(renderKV(data));
      } else {
        // Fallback for unexpected data types
        results.appendChild(
          h('div', { class: 'attributes-container' }, [
            h('div', { class: 'attribute-card' }, [
              h('div', { class: 'attribute-key' }, 'value'),
              h('pre', { class: 'attribute-value' }, JSON.stringify(data, null, 2))
            ])
          ])
        );
      }

      // Show confirm button on successful render
      confirmBtn.style.display = 'inline-flex';
    } catch (err) {
      console.error(err);
      const errorMsg = err && err.responseText ? err.responseText : 'An unknown error occurred.';
      error.textContent = `Request failed: ${errorMsg}`;
      confirmBtn.style.display = 'none';
    } finally {
      fetchBtn.disabled = false;
      resize();
    }
  }

  // --- Event Binding ---

  /**
   * Binds event listeners to the UI elements.
   * @param {object} ui - The map of UI elements from buildUI.
   */
  function bindUiHandlers(ui) {
    const { form, input, confirmBtn, results, error } = ui;

    // Handle form submission to trigger the fetch
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = (input.value || '').trim();
      runFetch({ code, ...ui });
    });

    // Handle confirm button click to reset the UI
    confirmBtn.addEventListener('click', () => {
      input.value = '';
      results.innerHTML = '';
      error.textContent = '';
      confirmBtn.style.display = 'none';
      resize();
    });
  }

  /**
   * Binds ZAF client event handlers to sync with the ticket.
   * @param {object} ui - The map of UI elements from buildUI.
   */
  function bindZafEventHandlers(ui) {
    /**
     * Helper to read the fastcode from the ticket and update the input field.
     */
    const syncFastcodeFromTicket = async () => {
      try {
        const fc = await getFastcodeFromTicket();
        // Only update if the value is different to avoid disrupting user input.
        if (fc && fc !== ui.input.value) {
          ui.input.value = fc;
          // NOTE: Auto-fetch on sync can be enabled here if desired.
          // await runFetch({ code: fc, ...ui });
        }
      } catch (e) {
        console.warn('Failed to sync fastcode from ticket:', e);
      }
    };

    // Sync when the app is first activated or reactivated
    client.on('app.activated', syncFastcodeFromTicket);

    // Sync after a ticket is saved, as triggers may have changed the field
    client.on('ticket.submit.done', syncFastcodeFromTicket);

    // Sync live as the agent types into the custom field
    subscribeToFastcodeUIChanges((value) => {
      ui.input.value = value;
      // NOTE: Auto-fetch on every keystroke can be enabled here, but may be noisy.
      // if (value) await runFetch({ code: value, ...ui });
    });
  }

  // --- Initialization ---

  /**
   * Initializes the application by building the UI, binding events,
   * and performing the initial data sync.
   */
  async function init() {
    const ui = buildUI();
    bindUiHandlers(ui);
    bindZafEventHandlers(ui);

    // On initial load, immediately pull the fastcode from the ticket field.
    try {
      const initialFastcode = await getFastcodeFromTicket();
      if (initialFastcode) {
        ui.input.value = initialFastcode;
        // NOTE: Auto-fetch on app load can be enabled here if desired.
        // await runFetch({ code: initialFastcode, ...ui });
      }
    } catch (e) {
      console.warn('Could not read fastcode field on initial load:', e);
    }

    // Adjust iframe size to content.
    resize();
  }

  // Start the app once the DOM is ready.
  document.addEventListener('DOMContentLoaded', init);
})();
