import assert from 'node:assert/strict';
import { createPaymentVerificationService } from './src/services/payment-verification-service.js';

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
});

const proClient = {
  id: 'client_1',
  billing: { plan: 'pro' },
  settings: {
    paymentVerificationMode: 'automatic',
    paymentOptions: [{
      method: 'Commercial Bank of Ethiopia (CBE)',
      accountNumber: '1000303997441',
      accountName: 'Acme Trading'
    }]
  }
};

const order = { id: 'order_1', total: '1500' };
const proof = {
  id: 'proof_1',
  extracted: {
    transactionId: 'FT1234567890',
    provider: 'CBE'
  }
};

async function testSuccessfulVerification() {
  const calls = [];
  const data = {};
  const service = createPaymentVerificationService({
    apiKey: 'test-key',
    isProClient: () => true,
    fetchWithTimeout: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return response(200, {
        success: true,
        data: [{
          bank: 'cbe',
          status: 'success',
          verified: true,
          amount: 1500,
          receiverName: 'Acme Trading',
          receiverAccount: '1****7441',
          referenceNumber: 'FT1234567890',
          confirmationHistory: { isFirstConfirmation: true, confirmedBefore: false },
          settlementAccountMatch: { matched: true, reason: 'receiver_suffix_matches' }
        }],
        verification: { processingStatus: 'completed', status: 'success', verified: true },
        requestId: 'verify_1'
      });
    }
  });

  const result = await service.verifyPaymentProof({ data, client: proClient, order, proof: structuredClone(proof) });
  assert.equal(result.action, 'verified');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.bank, 'cbe');
  assert.equal(calls[0].body.accountSuffix, '03997441');
  assert.equal(data.paymentVerificationReferences.length, 1);
}

async function testDuplicateBlockedBeforeApiCall() {
  const data = {
    paymentVerificationReferences: [{
      clientId: proClient.id,
      reference: 'FT1234567890',
      status: 'verified',
      orderId: 'order_existing'
    }]
  };
  let calls = 0;
  const service = createPaymentVerificationService({
    apiKey: 'test-key',
    isProClient: () => true,
    fetchWithTimeout: async () => {
      calls += 1;
      return response(500, {});
    }
  });
  const result = await service.verifyPaymentProof({ data, client: proClient, order, proof: structuredClone(proof) });
  assert.equal(result.action, 'duplicate');
  assert.equal(calls, 0);
}

async function testAmountMismatchFallsBackToManualReview() {
  const service = createPaymentVerificationService({
    apiKey: 'test-key',
    isProClient: () => true,
    fetchWithTimeout: async () => response(200, {
      success: true,
      data: [{
        bank: 'cbe',
        status: 'success',
        verified: true,
        amount: 1200,
        receiverName: 'Acme Trading',
        confirmationHistory: { isFirstConfirmation: true, confirmedBefore: false },
        settlementAccountMatch: { matched: true }
      }],
      verification: { processingStatus: 'completed', status: 'success', verified: true }
    })
  });
  const result = await service.verifyPaymentProof({ data: {}, client: proClient, order, proof: structuredClone(proof) });
  assert.equal(result.action, 'manual_review');
  assert.match(result.reason, /Amount mismatch/);
}

async function testQueuedVerificationExplainsProcessing() {
  let calls = 0;
  const service = createPaymentVerificationService({
    apiKey: 'test-key',
    isProClient: () => true,
    fetchWithTimeout: async () => {
      calls += 1;
      return response(200, {
        success: true,
        data: [],
        verification: { processingStatus: 'queued', status: 'pending', verified: false, requestId: 'verify_queued' },
        requestId: 'verify_queued'
      });
    }
  });
  const result = await service.verifyPaymentProof({ data: {}, client: proClient, order, proof: structuredClone(proof) });
  assert.equal(result.action, 'pending');
  assert.match(result.reason, /still processing/);
  assert.equal(calls, 6);
}

async function testQueuedVerificationPollsToSuccess() {
  let calls = 0;
  const service = createPaymentVerificationService({
    apiKey: 'test-key',
    isProClient: () => true,
    fetchWithTimeout: async () => {
      calls += 1;
      if (calls === 1) {
        return response(200, {
          success: true,
          data: [],
          verification: { processingStatus: 'queued', status: 'pending', verified: false, requestId: 'verify_later' },
          requestId: 'verify_later'
        });
      }
      return response(200, {
        success: true,
        data: [{
          bank: 'cbe',
          status: 'success',
          verified: true,
          amount: 1500,
          receiverName: 'Acme Trading',
          receiverAccount: '1****7441',
          referenceNumber: 'FT1234567890',
          confirmationHistory: { isFirstConfirmation: true, confirmedBefore: false },
          settlementAccountMatch: { matched: true }
        }],
        verification: { processingStatus: 'completed', status: 'success', verified: true, requestId: 'verify_later' },
        requestId: 'verify_later'
      });
    }
  });
  const data = {};
  const result = await service.verifyPaymentProof({ data, client: proClient, order, proof: structuredClone(proof) });
  assert.equal(result.action, 'verified');
  assert.equal(calls, 2);
  assert.equal(data.paymentVerificationReferences.length, 1);
}

async function testBasicPlanCannotAutoVerify() {
  const service = createPaymentVerificationService({
    apiKey: 'test-key',
    isProClient: () => false,
    fetchWithTimeout: async () => {
      throw new Error('should not call Verify.et');
    }
  });
  const result = await service.verifyPaymentProof({
    data: {},
    client: { ...proClient, billing: { plan: 'basic' } },
    order,
    proof: structuredClone(proof)
  });
  assert.equal(result.action, 'manual_review');
  assert.match(result.reason, /Pro plan/);
}

async function testAmbiguousMethodAvoidsExtraCalls() {
  let calls = 0;
  const service = createPaymentVerificationService({
    apiKey: 'test-key',
    isProClient: () => true,
    fetchWithTimeout: async () => {
      calls += 1;
      return response(200, {});
    }
  });
  const client = {
    ...proClient,
    settings: {
      paymentVerificationMode: 'automatic',
      paymentOptions: [
        proClient.settings.paymentOptions[0],
        { method: 'Telebirr', accountNumber: '0911223344', accountName: 'Acme Trading' }
      ]
    }
  };
  const result = await service.verifyPaymentProof({
    data: {},
    client,
    order,
    proof: { id: 'proof_ambiguous', extracted: { transactionId: 'ABC123456789' } }
  });
  assert.equal(result.action, 'manual_review');
  assert.equal(calls, 0);
}

async function testNoisyProviderHintUsesOnlySavedAccount() {
  const calls = [];
  const service = createPaymentVerificationService({
    apiKey: 'test-key',
    isProClient: () => true,
    fetchWithTimeout: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return response(200, {
        success: true,
        data: [{
          bank: 'cbe',
          status: 'success',
          verified: true,
          amount: 1500,
          receiverName: 'Acme Trading',
          receiverAccount: '1****7441',
          referenceNumber: 'FT1234567890',
          confirmationHistory: { isFirstConfirmation: true, confirmedBefore: false },
          settlementAccountMatch: { matched: true }
        }],
        verification: { processingStatus: 'completed', status: 'success', verified: true },
        requestId: 'verify_noisy_hint'
      });
    }
  });
  const result = await service.verifyPaymentProof({
    data: {},
    client: proClient,
    order,
    proof: {
      id: 'proof_noisy_hint',
      manualSmsText: 'Telebirr message copied by the customer. CBE Reference FT1234567890 amount 1500.',
      extracted: { transactionId: 'FT1234567890', provider: 'telebirr' }
    }
  });
  assert.equal(result.action, 'verified');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.bank, 'cbe');
}

async function testNestedVerifyEtShapeVerifies() {
  const service = createPaymentVerificationService({
    apiKey: 'test-key',
    isProClient: () => true,
    fetchWithTimeout: async () => response(200, {
      data: {
        requestId: 'verify_nested',
        bank: 'cbe',
        processingStatus: 'completed',
        status: 'success',
        verified: true,
        result: {
          bank: 'cbe',
          status: 'success',
          verified: true,
          amount: 1500,
          senderName: 'Test Buyer',
          receiverName: 'Acme Trading',
          referenceNumber: 'FT1234567890',
          bankSpecific: {
            receiverName: 'Acme Trading',
            receiverAccount: '1****7441',
            settledAmountValue: 1500,
            reference: 'FT1234567890'
          }
        }
      }
    })
  });
  const data = {};
  const result = await service.verifyPaymentProof({ data, client: proClient, order, proof: structuredClone(proof) });
  assert.equal(result.action, 'verified');
  assert.equal(result.amount, 1500);
  assert.equal(result.verifyRequestId, 'verify_nested');
  assert.equal(data.paymentVerificationReferences.length, 1);
}

await testSuccessfulVerification();
await testDuplicateBlockedBeforeApiCall();
await testAmountMismatchFallsBackToManualReview();
await testQueuedVerificationExplainsProcessing();
await testQueuedVerificationPollsToSuccess();
await testBasicPlanCannotAutoVerify();
await testAmbiguousMethodAvoidsExtraCalls();
await testNoisyProviderHintUsesOnlySavedAccount();
await testNestedVerifyEtShapeVerifies();

console.log('payment verification service tests passed');
