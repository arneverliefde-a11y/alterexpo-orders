(() => {
  'use strict';
  const CFG = window.ALTER_EXPO_CONFIG || {};
  let accessToken = '';
  let exhibitor = null;
  let submitting = false;
  const $ = id => document.getElementById(id);
  const normalizeToken = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  const endpointReady = value => value && !String(value).startsWith('PASTE_');

  function createGate() {
    document.body.classList.add('ae-token-locked');
    const gate = document.createElement('section');
    gate.id = 'aeTokenScreen';
    gate.className = 'ae-token-screen';
    gate.innerHTML = `<div class="ae-token-card"><div class="ae-token-brand">ALTER EXPO</div><h1>Exhibitor access</h1><p>Enter the access code supplied by the event organiser. The order form opens after validation.</p><label for="aeTokenInput">Access code</label><div class="ae-token-row"><input id="aeTokenInput" autocomplete="one-time-code" spellcheck="false" maxlength="100" placeholder="Enter access code"><button id="aeTokenButton" type="button">Continue</button></div><div id="aeTokenMessage" class="ae-token-message" role="alert"></div></div>`;
    document.body.prepend(gate);
    $('aeTokenButton').addEventListener('click', validateToken);
    $('aeTokenInput').addEventListener('keydown', e => { if (e.key === 'Enter') validateToken(); });
    $('aeTokenInput').focus();
  }

  function message(text, type='error') {
    const el = $('aeTokenMessage');
    el.textContent = text;
    el.className = `ae-token-message show ${type}`;
  }

  async function postFlow(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      redirect: 'follow'
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { throw new Error('The flow returned an invalid response.'); }
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
    return data;
  }

  async function validateToken() {
    const token = normalizeToken($('aeTokenInput').value);
    if (token.length < 8) return message('Enter a valid access code.');
    if (!endpointReady(CFG.validateTokenUrl)) return message('The token validation flow URL has not been configured.');
    const button = $('aeTokenButton');
    button.disabled = true; button.textContent = 'Checking...';
    message('Checking access code...', 'ok');
    try {
      const data = await postFlow(CFG.validateTokenUrl, { token, origin: location.origin });
      if (data.valid !== true) throw new Error(data.message || 'This access code is invalid, inactive or expired.');
      accessToken = token;
      exhibitor = data.exhibitor || data;
      unlockApp();
    } catch (error) {
      message(error.message || 'The access code could not be checked.');
    } finally {
      button.disabled = false; button.textContent = 'Continue';
    }
  }

  function setReadonly(id, value) {
    const el = $(id); if (!el) return;
    el.value = value || '';
    el.readOnly = true;
    el.setAttribute('aria-readonly', 'true');
    el.classList.add('ae-portal-field');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function unlockApp() {
    setReadonly('company', exhibitor.company);
    setReadonly('contact', exhibitor.contact);
    setReadonly('email', exhibitor.email);
    setReadonly('stand', exhibitor.standNumber || exhibitor.stand);
    setReadonly('country', exhibitor.country);
    setReadonly('vatNumber', exhibitor.vatNumber || exhibitor.vat);
    $('aeTokenScreen').remove();
    document.body.classList.remove('ae-token-locked');
    const main = document.querySelector('main');
    if (main) {
      const strip = document.createElement('div');
      strip.className = 'ae-access-strip';
      strip.innerHTML = `<span><strong>${escapeHtml(exhibitor.company || 'Exhibitor')}</strong>${exhibitor.eventCode ? ` · ${escapeHtml(exhibitor.eventCode)}` : ''}${(exhibitor.standNumber || exhibitor.stand) ? ` · Stand ${escapeHtml(exhibitor.standNumber || exhibitor.stand)}` : ''}</span><button type="button" id="aeChangeCode">Use another code</button>`;
      main.prepend(strip);
      $('aeChangeCode').onclick = () => location.reload();
    }
    installSubmitButton();
    window.scrollTo({top: 0, behavior: 'instant'});
  }

  const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const value = id => $(id)?.value ?? '';
  const number = id => Math.max(0, Number(value(id)) || 0);

  function collectOrder() {
    const calculation = typeof window.calc === 'function' ? window.calc() : (typeof calc === 'function' ? calc() : null);
    if (!calculation) throw new Error('The calculator result could not be read.');
    const packageCard = window.selected ? document.querySelector(`.card[data-id="${window.selected}"]`) : document.querySelector('.card.active');
    const packageCode = packageCard?.dataset.id || '';
    const packageDef = window.packages?.find?.(p => p.id === packageCode);
    const sqm = Math.max(0, Number(packageCard?.querySelector('.sqm')?.value) || 0);
    const openSides = packageDef?.fixedSides || Number(packageCard?.querySelector('.sides')?.value) || null;
    const carpetOption = $('carpet')?.selectedOptions?.[0];
    return {
      schemaVersion: '1.0', pricingVersion: '2027.1', token: accessToken,
      clientSubmissionId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      submittedAtClient: new Date().toISOString(), origin: location.origin,
      exhibitorPreview: { company: exhibitor.company || '', email: exhibitor.email || '', eventCode: exhibitor.eventCode || '' },
      package: { code: packageCode, name: packageDef?.name || '', sqm, openSides },
      extras: { storage: number('storage'), storageExtraSqm: number('storageExtra'), coathangers: number('coat'), shelves: number('shelf'), cleaning: value('cleaning') === '1' },
      graphics: { panels: number('panel'), fabricLinearMetres: number('fabric'), nameboards: number('nameboard'), stickersSqm: number('sticker'), doors: number('door') },
      electrics: { powerSupplyPriceCode: number('power'), extraLights: number('lights'), multiSockets: number('multi'), televisions: number('tv') },
      furniture: { pack1: number('f1'), pack2: number('f2'), pack3: number('f3'), pack4: number('f4') },
      carpet: { label: carpetOption?.textContent || '', surchargePerSqm: Number(carpetOption?.value) || 0 },
      customer: { purchaseOrder: value('po'), vatNumber: value('vatNumber'), vatRate: number('vatRate'), viesStatus: window.vatVerification?.status || 'unchecked' },
      calculationPreview: { packagePrice: calculation.pkg, extrasPrice: calculation.extra, graphicsPrice: calculation.graph, electricsPrice: calculation.elec, furniturePrice: calculation.furn, carpetPrice: calculation.carp, subtotal: calculation.subtotal, vat: calculation.vat, total: calculation.total }
    };
  }

  function validateBeforeSubmit(order) {
    if (!order.package.code || !order.package.sqm) throw new Error('Choose a stand package and enter a valid stand size.');
    if (!$('accept')?.checked) throw new Error('Accept the applicable terms before submitting.');
    if (!exhibitor?.email) throw new Error('The validated exhibitor record has no email address.');
  }

  function installSubmitButton() {
    const buttons = document.querySelector('.summary .buttons'); if (!buttons || $('aeSubmitOrder')) return;
    buttons.insertAdjacentHTML('afterbegin', '<button id="aeSubmitOrder" class="ae-submit-button" type="button">Submit order</button><div id="aeSubmitStatus" class="ae-submit-status" role="status"></div>');
    $('aeSubmitOrder').onclick = submitOrder;
  }

  function submitStatus(text, type='') { const el=$('aeSubmitStatus'); el.textContent=text; el.className=`ae-submit-status ${type}`; }

  async function submitOrder() {
    if (submitting) return;
    if (!endpointReady(CFG.submitOrderUrl)) return submitStatus('The order flow URL has not been configured.', 'error');
    let order;
    try { order = collectOrder(); validateBeforeSubmit(order); } catch (e) { return submitStatus(e.message, 'error'); }
    submitting = true; $('aeSubmitOrder').disabled = true; $('aeSubmitOrder').textContent = 'Submitting...'; submitStatus('Submitting order...');
    try {
      const data = await postFlow(CFG.submitOrderUrl, order);
      if (data.success !== true) throw new Error(data.message || 'The order was not accepted.');
      submitStatus(`Order submitted successfully${data.orderNumber ? ` · ${data.orderNumber}` : ''}. A confirmation will be emailed.`, 'ok');
      $('aeSubmitOrder').textContent = 'Order submitted';
    } catch (error) {
      submitStatus(error.message || 'The order could not be submitted.', 'error');
      $('aeSubmitOrder').disabled = false; $('aeSubmitOrder').textContent = 'Submit order'; submitting = false;
    }
  }

  addEventListener('DOMContentLoaded', createGate);
})();
