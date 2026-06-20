import crypto from 'crypto';

const VERIFY_BASE_URL = 'https://verify.et';

const moneyNumber = value => {
  const n = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const normalizeDigits = value => String(value || '').replace(/\D/g, '');

const normalizeEthPhone = value => {
  let digits = normalizeDigits(value);
  if (digits.startsWith('251')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length > 9) digits = digits.slice(-9);
  return /^[79]\d{8}$/.test(digits) ? `0${digits}` : '';
};

const normalizeReference = value => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9-]/g, '')
  .slice(0, 80);

const normalizeName = value => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter(token => token.length >= 2);

const namesLikelyMatch = (expected, actual) => {
  const expectedTokens = normalizeName(expected);
  const actualTokens = normalizeName(actual);
  if (!expectedTokens.length || !actualTokens.length) return true;
  return expectedTokens.some(token => actualTokens.includes(token));
};

const providerBank = value => {
  const text = String(value || '').toLowerCase();
  if (/tele\s*birr|telebirr/.test(text)) return 'telebirr';
  if (/\bcbe\b|commercial bank/.test(text)) return 'cbe';
  if (/\bboa\b|abyssinia/.test(text)) return 'boa';
  if (/dashen/.test(text)) return 'dashen';
  if (/awash/.test(text)) return 'awash';
  if (/siinqee|sinqee/.test(text)) return 'siinqee';
  if (/mpesa|m-pesa|safaricom/.test(text)) return 'mpesa';
  if (/cbe\s*birr|cbebirr/.test(text)) return 'cbebirr';
  if (/kaafi/.test(text)) return 'kaafiebirr';
  return '';
};

const methodBank = method => providerBank(method);

const referenceFromText = text => {
  const value = String(text || '');
  const explicit = value.match(/\b(?:txn|trx|transaction|ref|reference|receipt|id)\s*(?:no\.?|number|id)?\s*[:#-]?\s*([A-Z0-9-]{5,})\b/i);
  if (explicit?.[1]) return normalizeReference(explicit[1]);
  const telebirrLike = value.match(/\b([A-Z]{2,}[A-Z0-9]{6,})\b/i);
  if (telebirrLike?.[1]) return normalizeReference(telebirrLike[1]);
  const cbeLike = value.match(/\b(FT[A-Z0-9]{8,})\b/i);
  if (cbeLike?.[1]) return normalizeReference(cbeLike[1]);
  return '';
};

const proofReference = proof => normalizeReference(
  proof?.extracted?.transactionId ||
  proof?.referenceNumber ||
  proof?.transactionId ||
  referenceFromText(`${proof?.manualSmsText || ''}\n${proof?.caption || ''}`)
);

const proofProviderBank = proof => providerBank([
  proof?.extracted?.provider,
  proof?.provider,
  proof?.manualSmsText,
  proof?.caption
].filter(Boolean).join(' '));

const candidateAccounts = (client, proof) => {
  const options = Array.isArray(client?.settings?.paymentOptions) ? client.settings.paymentOptions : [];
  const hintedBank = proofProviderBank(proof);
  const allCandidates = options
    .map(option => {
      const bank = methodBank(option.method);
      if (!bank) return null;
      return {
        bank,
        method: option.method,
        accountNumber: String(option.accountNumber || '').trim(),
        accountName: String(option.accountName || '').trim()
      };
    })
    .filter(Boolean);
  const matchingCandidates = hintedBank
    ? allCandidates.filter(option => option.bank === hintedBank)
    : allCandidates;
  if (matchingCandidates.length) {
    return { hintedBank, candidates: matchingCandidates, hintMatched: Boolean(hintedBank), hintedProviderIgnored: false, savedAccountCount: allCandidates.length };
  }
  if (hintedBank && allCandidates.length === 1) {
    return { hintedBank, candidates: allCandidates, hintMatched: false, hintedProviderIgnored: true, savedAccountCount: allCandidates.length };
  }
  return { hintedBank, candidates: [], hintMatched: false, hintedProviderIgnored: false, savedAccountCount: allCandidates.length };
};

const accountSuffix = (accountNumber, length) => normalizeDigits(accountNumber).slice(-length);

const buildPayload = (candidate, reference) => {
  const payload = {
    bank: candidate.bank,
    settlementAccount: candidate.accountNumber
  };
  if (candidate.bank === 'telebirr' || candidate.bank === 'mpesa') {
    payload.transactionNumber = reference;
    return payload;
  }
  if (candidate.bank === 'cbe') {
    payload.referenceNumber = reference;
    payload.accountSuffix = accountSuffix(candidate.accountNumber, 8);
    return payload;
  }
  if (candidate.bank === 'boa') {
    payload.referenceNumber = reference;
    payload.accountSuffix = accountSuffix(candidate.accountNumber, 5);
    return payload;
  }
  if (candidate.bank === 'cbebirr') {
    payload.receiptNumber = reference;
    payload.phoneNumber = normalizeEthPhone(candidate.accountNumber) || candidate.accountNumber;
    return payload;
  }
  payload.referenceNumber = reference;
  payload.reference = reference;
  return payload;
};

const safePayload = payload => ({
  bank: payload.bank,
  referenceNumber: payload.referenceNumber,
  transactionNumber: payload.transactionNumber,
  receiptNumber: payload.receiptNumber,
  accountSuffix: payload.accountSuffix,
  suffix: payload.suffix,
  settlementAccountLast4: normalizeDigits(payload.settlementAccount).slice(-4),
  phoneLast4: normalizeDigits(payload.phoneNumber).slice(-4)
});

const responseRows = body => {
  if (Array.isArray(body?.data)) return body.data;
  if (body?.data && typeof body.data === 'object') return [body.data];
  return [];
};

const summarizeVerification = body => {
  const rows = responseRows(body);
  const row = rows.find(item => item?.verified === true || item?.status === 'success') || rows[0] || {};
  const verification = body?.verification || {};
  return {
    requestId: body?.requestId || verification.requestId || row.requestId || '',
    processingStatus: verification.processingStatus || row.processingStatus || '',
    status: verification.status || row.status || '',
    verified: verification.verified === true || row.verified === true || row.status === 'success',
    row
  };
};

const processingState = summaryOrBody => {
  if (!summaryOrBody || typeof summaryOrBody !== 'object') return '';
  if ('processingStatus' in summaryOrBody || ('status' in summaryOrBody && ('verified' in summaryOrBody || 'row' in summaryOrBody))) {
    return String(summaryOrBody.processingStatus || summaryOrBody.status || '').toLowerCase();
  }
  const summary = summarizeVerification(summaryOrBody);
  return String(summary.processingStatus || summary.status || '').toLowerCase();
};

const isProcessingState = value => ['queued', 'pending', 'processing', 'in_progress'].includes(String(value || '').toLowerCase());

const requestIdFromBody = body => body?.requestId || body?.verification?.requestId || body?.data?.requestId || '';

const alreadyUsedReference = (data, clientId, reference) => {
  const ref = normalizeReference(reference);
  if (!ref) return null;
  return (data.paymentVerificationReferences || []).find(item =>
    item.clientId === clientId &&
    normalizeReference(item.reference) === ref &&
    item.status === 'verified'
  ) || null;
};

const recordReferenceUse = (data, { client, order, proof, reference, bank, verification }) => {
  data.paymentVerificationReferences ||= [];
  const ref = normalizeReference(reference);
  if (!ref || alreadyUsedReference(data, client.id, ref)) return;
  data.paymentVerificationReferences.push({
    id: `payref_${crypto.randomUUID()}`,
    clientId: client.id,
    orderId: order?.id || '',
    proofId: proof?.id || '',
    reference: ref,
    bank: bank || '',
    amount: String(verification?.amount || order?.total || ''),
    verifyRequestId: verification?.requestId || '',
    status: 'verified',
    createdAt: new Date().toISOString()
  });
};

export const normalizePaymentVerificationMode = value => (
  String(value || '').toLowerCase() === 'automatic' ? 'automatic' : 'manual'
);

export function createPaymentVerificationService(deps = {}) {
  const {
    apiKey = process.env.VERIFY_ET_API_KEY || process.env.VERIFY_BANK_ET_API_KEY || '',
    baseUrl = process.env.VERIFY_ET_BASE_URL || VERIFY_BASE_URL,
    fetchWithTimeout = globalThis.fetch,
    now = () => new Date().toISOString(),
    isProClient = client => String(client?.billing?.plan || '').toLowerCase() === 'pro'
  } = deps;

  const configured = () => Boolean(String(apiKey || '').trim());
  const modeForClient = client => normalizePaymentVerificationMode(client?.settings?.paymentVerificationMode || client?.settings?.paymentVerification?.mode || 'manual');
  const canUseAutomatic = client => configured() && isProClient(client) && modeForClient(client) === 'automatic';

  const publicStatus = client => ({
    mode: modeForClient(client),
    automaticAvailable: configured() && isProClient(client),
    apiConfigured: configured(),
    requiresPro: !isProClient(client)
  });

  const fetchJson = async (url, options) => {
    const response = await fetchWithTimeout(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 202) {
      const message = body?.message || body?.error || `Verify.et request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return { status: response.status, body };
  };

  const pollVerification = async requestId => {
    if (!requestId) return null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const { body } = await fetchJson(`${baseUrl.replace(/\/$/, '')}/api/verify/${encodeURIComponent(requestId)}`, {
        headers: { 'x-api-key': apiKey }
      });
      const summary = summarizeVerification(body);
      const status = processingState(summary);
      if (status === 'completed' || status === 'failed' || !isProcessingState(status)) return body;
    }
    return null;
  };

  const submitVerification = async ({ payload, idempotencyKey }) => {
    const { status, body } = await fetchJson(`${baseUrl.replace(/\/$/, '')}/api/verify?waitMs=5000`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'idempotency-key': idempotencyKey
      },
      body: JSON.stringify(payload)
    });
    const summary = summarizeVerification(body);
    if (status === 202 || isProcessingState(processingState(summary))) {
      const requestId = requestIdFromBody(body) || summary.requestId || '';
      const polled = await pollVerification(requestId);
      return polled || body;
    }
    return body;
  };

  const evaluate = ({ body, candidate, order }) => {
    const summary = summarizeVerification(body);
    const row = summary.row || {};
    const amount = moneyNumber(row.amount || body?.data?.amount);
    const expected = moneyNumber(order?.total);
    const settlement = row.settlementAccountMatch || body?.data?.settlementAccountMatch || null;
    const confirmedBefore = row.confirmationHistory?.confirmedBefore === true ||
      row.confirmationHistory?.isFirstConfirmation === false;

    if (confirmedBefore) {
      return { action: 'duplicate', reason: 'Verify.et says this reference was confirmed before.', summary, amount };
    }
    if (isProcessingState(processingState(summary))) {
      return { action: 'pending', reason: 'Verify.et is still processing this reference.', summary, amount };
    }
    if (!summary.verified) {
      return { action: 'manual_review', reason: 'Verify.et did not return a successful verification.', summary, amount };
    }
    if (expected && amount && Math.abs(expected - amount) > 0.01) {
      return { action: 'manual_review', reason: `Amount mismatch. Expected ${expected} ETB but Verify.et returned ${amount} ETB.`, summary, amount };
    }
    if (expected && !amount) {
      return { action: 'manual_review', reason: 'Verify.et did not return an amount to compare with the order total.', summary, amount };
    }
    if (settlement && settlement.matched === false) {
      return { action: 'manual_review', reason: `Receiver account did not match: ${settlement.reason || 'account mismatch'}.`, summary, amount };
    }
    if (!settlement) {
      const receiverDigits = normalizeDigits(row.receiverAccount);
      const expectedDigits = normalizeDigits(candidate.accountNumber);
      const suffixOk = receiverDigits && expectedDigits && expectedDigits.endsWith(receiverDigits.replace(/\*/g, '').slice(-4));
      if (row.receiverAccount && !suffixOk) {
        return { action: 'manual_review', reason: 'Receiver account could not be matched safely.', summary, amount };
      }
    }
    if (row.receiverName && candidate.accountName && !namesLikelyMatch(candidate.accountName, row.receiverName)) {
      return { action: 'manual_review', reason: `Receiver name mismatch. Expected ${candidate.accountName}; Verify.et returned ${row.receiverName}.`, summary, amount };
    }
    return { action: 'verified', reason: 'Payment verified automatically by Verify.et.', summary, amount };
  };

  const verifyPaymentProof = async ({ data, client, order, proof }) => {
    const startedAt = now();
    proof.autoVerification ||= {};
    proof.autoVerification.mode = modeForClient(client);
    proof.autoVerification.startedAt = startedAt;

    if (modeForClient(client) !== 'automatic') {
      proof.autoVerification.status = 'skipped';
      proof.autoVerification.reason = 'Client payment mode is manual.';
      return { action: 'manual_review', reason: proof.autoVerification.reason };
    }
    if (!isProClient(client)) {
      proof.autoVerification.status = 'skipped';
      proof.autoVerification.reason = 'Automatic payment verification is available only on Pro plan.';
      return { action: 'manual_review', reason: proof.autoVerification.reason };
    }
    if (!configured()) {
      proof.autoVerification.status = 'skipped';
      proof.autoVerification.reason = 'Verify.et API key is not configured on the server.';
      return { action: 'manual_review', reason: proof.autoVerification.reason };
    }
    if (!order) {
      proof.autoVerification.status = 'manual_review';
      proof.autoVerification.reason = 'No order is linked to this proof.';
      return { action: 'manual_review', reason: proof.autoVerification.reason };
    }

    const reference = proofReference(proof);
    proof.extracted ||= {};
    proof.extracted.transactionId ||= reference;
    if (!reference) {
      proof.autoVerification.status = 'manual_review';
      proof.autoVerification.reason = 'No transaction/reference number was found in the proof.';
      return { action: 'manual_review', reason: proof.autoVerification.reason };
    }

    const duplicate = alreadyUsedReference(data, client.id, reference);
    if (duplicate) {
      proof.autoVerification.status = 'duplicate';
      proof.autoVerification.reason = `Reference ${reference} was already used for order ${duplicate.orderId || 'another order'}.`;
      proof.autoVerification.reference = reference;
      return { action: 'duplicate', reason: proof.autoVerification.reason, duplicate };
    }

    const { hintedBank, candidates, hintedProviderIgnored, savedAccountCount } = candidateAccounts(client, proof);
    if (!candidates.length) {
      proof.autoVerification.status = 'manual_review';
      proof.autoVerification.reason = hintedBank
        ? `The payment text looked like ${hintedBank}, but none of the ${savedAccountCount || 0} saved receiving accounts match that provider.`
        : 'No supported saved payment account is available for automatic verification.';
      proof.autoVerification.reference = reference;
      return { action: 'manual_review', reason: proof.autoVerification.reason };
    }
    if (!hintedBank && candidates.length > 1) {
      proof.autoVerification.status = 'manual_review';
      proof.autoVerification.reason = 'Payment method was not clear and multiple saved accounts exist. Manual review is safer.';
      proof.autoVerification.reference = reference;
      return { action: 'manual_review', reason: proof.autoVerification.reason };
    }
    if (hintedProviderIgnored) {
      proof.autoVerification.providerHintIgnored = hintedBank;
      proof.autoVerification.providerHintIgnoredReason = 'The SMS/provider hint did not match the saved account, so the only saved receiving account was used.';
    }

    data.paymentVerifications ||= [];
    const attempts = [];
    for (const candidate of candidates.slice(0, 2)) {
      const payload = buildPayload(candidate, reference);
      const attempt = {
        id: `payverify_${crypto.randomUUID()}`,
        clientId: client.id,
        orderId: order.id,
        proofId: proof.id,
        reference,
        bank: candidate.bank,
        method: candidate.method,
        requestPayload: safePayload(payload),
        status: 'submitted',
        createdAt: now()
      };
      data.paymentVerifications.push(attempt);
      attempts.push(attempt);
      try {
        const body = await submitVerification({
          payload,
          idempotencyKey: `sprintsales-${client.id}-${proof.id}-${candidate.bank}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 120)
        });
        const decision = evaluate({ body, candidate, order });
        attempt.status = decision.action;
        attempt.reason = decision.reason;
        attempt.verifyRequestId = decision.summary?.requestId || '';
        attempt.responseSummary = {
          processingStatus: decision.summary?.processingStatus || '',
          status: decision.summary?.status || '',
          verified: Boolean(decision.summary?.verified),
          amount: decision.amount || '',
          receiverName: decision.summary?.row?.receiverName || '',
          receiverAccount: decision.summary?.row?.receiverAccount || '',
          settlementAccountMatch: decision.summary?.row?.settlementAccountMatch || null
        };
        attempt.updatedAt = now();
        if (decision.action === 'verified') {
          proof.autoVerification = {
            ...proof.autoVerification,
            status: 'verified',
            reference,
            bank: candidate.bank,
            method: candidate.method,
            amount: String(decision.amount || ''),
            verifyRequestId: attempt.verifyRequestId,
            verifiedAt: now(),
            reason: decision.reason
          };
          recordReferenceUse(data, {
            client,
            order,
            proof,
            reference,
            bank: candidate.bank,
            verification: { amount: decision.amount, requestId: attempt.verifyRequestId }
          });
          return {
            action: 'verified',
            reason: decision.reason,
            reference,
            bank: candidate.bank,
            amount: decision.amount,
            verifyRequestId: attempt.verifyRequestId,
            attempt
          };
        }
        if (decision.action === 'duplicate') {
          proof.autoVerification = {
            ...proof.autoVerification,
            status: 'duplicate',
            reference,
            bank: candidate.bank,
            method: candidate.method,
            verifyRequestId: attempt.verifyRequestId,
            reason: decision.reason
          };
          return { action: 'duplicate', reason: decision.reason, reference, bank: candidate.bank, attempt };
        }
        if (decision.action === 'pending') {
          proof.autoVerification = {
            ...proof.autoVerification,
            status: 'pending',
            reference,
            bank: candidate.bank,
            method: candidate.method,
            verifyRequestId: attempt.verifyRequestId,
            reason: decision.reason,
            updatedAt: now()
          };
          return { action: 'pending', reason: decision.reason, reference, bank: candidate.bank, verifyRequestId: attempt.verifyRequestId, attempt };
        }
      } catch (error) {
        attempt.status = 'error';
        attempt.reason = error.message;
        attempt.errorStatus = error.status || '';
        attempt.updatedAt = now();
      }
    }

    const lastReason = attempts.slice().reverse().find(item => item.reason)?.reason || 'Automatic verification could not complete.';
    proof.autoVerification.status = 'manual_review';
    proof.autoVerification.reference = reference;
    proof.autoVerification.reason = lastReason;
    proof.autoVerification.updatedAt = now();
    return { action: 'manual_review', reason: lastReason, reference };
  };

  return {
    canUseAutomatic,
    publicStatus,
    modeForClient,
    verifyPaymentProof,
    extractReference: proofReference,
    alreadyUsedReference
  };
}
