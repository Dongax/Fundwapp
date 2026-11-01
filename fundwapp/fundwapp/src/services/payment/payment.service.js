import config from '../../config/index.js';
import { all, one, run, withTransaction } from '../../db/client.js';
import { uuid } from '../../utils/ids.js';
import { nowIso, minutesAgoIso } from '../../utils/time.js';
import { toMinor, fromMinor, isWhole, formatMoney } from '../../utils/money.js';
import { normalizePhone } from '../../utils/phone.js';
import { AppError, badRequest, conflict, notFound } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { getSetting } from '../settings.service.js';
import { getPublicByCode, canContribute, liveTotals, getTotals, shareUrl } from '../campaign.service.js';
import { notify } from '../notification/index.js';
import { publish } from '../realtime.service.js';
import { raiseFlag, checkLargeContribution, checkFailedAttempts } from '../flag.service.js';
import { getGateway } from './gateways/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FINAL_FAILURES = ['failed', 'cancelled', 'expired'];

// Safaricom rejects callback URLs that contain words like "mpesa" or "safaricom", so the public path uses neutral names.
export const CALLBACK_SEGMENTS = { mpesa: 'stk' };
export const callbackUrlFor = (gatewayName) => `${config.payment.callbackBaseUrl}/api/payments/callbacks/${CALLBACK_SEGMENTS[gatewayName] ?? gatewayName}/${config.payment.callbackSecret}`;

export async function listActivePaymentMethods() {
  const rows = await all('SELECT * FROM payment_methods WHERE is_active = 1 ORDER BY sort_order, label');
  return rows.map((m) => ({
    code: m.code, label: m.label, requires_phone: !!m.requires_phone, requires_email: !!m.requires_email,
    allows_decimals: !!m.allows_decimals, min_amount: fromMinor(m.min_amount), max_amount: fromMinor(m.max_amount), instructions: m.instructions,
  }));
}

async function loadAttempt(id) {
  const a = await one('SELECT a.*, f.unique_url AS fundraiser_code FROM payment_attempts a JOIN fundraisers f ON f.id = a.fundraiser_id WHERE a.id = ?', [id]);
  if (!a) throw notFound('Payment not found');
  return a;
}

async function presentAttempt(a) {
  const out = {
    id: a.id, status: a.status, failure_reason: a.failure_reason, amount: fromMinor(a.amount), payment_method: a.payment_method,
    instructions: a.instructions, redirect_url: a.status === 'pending' ? a.redirect_url : null, fundraiser_code: a.fundraiser_code,
    created_at: a.created_at, sandbox: config.payment.mode === 'sandbox',
  };
  if (a.status === 'succeeded') {
    const c = await one('SELECT id, transaction_id, amount, created_at FROM contributions WHERE payment_attempt_id = ?', [a.id]);
    if (c) out.contribution = { id: c.id, transaction_id: c.transaction_id, amount: fromMinor(c.amount), created_at: c.created_at };
  }
  return out;
}

/* ------------------------------ initiation ------------------------------- */

export async function initiateContribution(code, input, ctx = {}) {
  const fundraiser = await getPublicByCode(code);
  if (!canContribute(fundraiser)) throw conflict('This fundraiser is not accepting contributions right now', 'NOT_ACCEPTING');

  const method = await one('SELECT * FROM payment_methods WHERE code = ? AND is_active = 1', [input.payment_method]);
  if (!method) throw badRequest('Choose an available payment method', 'INVALID_PAYMENT_METHOD');
  const gateway = getGateway(method.gateway);

  const amount = toMinor(input.amount);
  if (amount < method.min_amount || amount > method.max_amount) {
    throw badRequest(`${method.label} accepts ${formatMoney(method.min_amount)} to ${formatMoney(method.max_amount)} per payment`, 'AMOUNT_OUT_OF_RANGE');
  }
  if (!(method.allows_decimals && gateway.supportsDecimals) && !isWhole(amount)) {
    throw badRequest(`${method.label} only accepts whole amounts`, 'AMOUNT_NOT_WHOLE');
  }

  let phone = null;
  if (method.requires_phone || input.phone_number) phone = normalizePhone(input.phone_number);
  const email = input.email ? input.email.toLowerCase() : null;
  if (method.requires_email && !email) throw badRequest(`${method.label} needs an email address for the receipt`, 'EMAIL_REQUIRED');

  const allowAnonymous = await getSetting('allow_anonymous_contributions');
  const attempt = {
    id: uuid(), fundraiser_id: fundraiser.id, contributor_name: input.contributor_name.trim(), phone_number: phone, email,
    amount, payment_method: method.code, gateway: method.gateway, is_anonymous: allowAnonymous && input.is_anonymous ? 1 : 0,
    message: input.message?.trim() || null, ip_address: ctx.ip ?? null, created_at: nowIso(),
  };
  await run(
    `INSERT INTO payment_attempts (id, fundraiser_id, contributor_name, phone_number, email, amount, payment_method, gateway, status, is_anonymous, message, ip_address, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?, 'pending', ?,?,?,?,?)`,
    [attempt.id, attempt.fundraiser_id, attempt.contributor_name, attempt.phone_number, attempt.email, attempt.amount, attempt.payment_method,
      attempt.gateway, attempt.is_anonymous, attempt.message, attempt.ip_address, attempt.created_at, attempt.created_at],
  );

  try {
    const result = await gateway.initiate({
      attempt, fundraiser, callbackUrl: callbackUrlFor(method.gateway),
    });
    await run(
      'UPDATE payment_attempts SET gateway_reference = ?, redirect_url = ?, instructions = ?, raw_response = ?, updated_at = ? WHERE id = ?',
      [result.gatewayReference, result.redirectUrl ?? null, result.message || method.instructions || null, JSON.stringify(result.raw ?? {}), nowIso(), attempt.id],
    );
  } catch (err) {
    const reason = err instanceof AppError ? err.message : 'The payment provider could not be reached. Try again.';
    logger.error(`Gateway ${method.gateway} failed to initiate attempt ${attempt.id}`, err);
    await run("UPDATE payment_attempts SET status = 'failed', failure_reason = ?, completed_at = ?, updated_at = ? WHERE id = ?", [reason, nowIso(), nowIso(), attempt.id]);
    await checkFailedAttempts(phone);
    throw err instanceof AppError ? err : new AppError(502, 'GATEWAY_ERROR', reason);
  }
  return presentAttempt(await loadAttempt(attempt.id));
}

/* ------------------------------- settlement ------------------------------ */

async function afterSuccess(attempt, contribution) {
  try {
    const f = await one('SELECT f.*, u.id AS org_id FROM fundraisers f JOIN users u ON u.id = f.organizer_id WHERE f.id = ?', [attempt.fundraiser_id]);
    const organizer = await one('SELECT * FROM users WHERE id = ?', [f.organizer_id]);
    const totals = await getTotals(f.id);
    publish(f.id, {
      type: 'contribution', ...(await liveTotals(f)),
      contribution: {
        name: contribution.is_anonymous ? null : contribution.contributor_name, amount: fromMinor(contribution.amount),
        message: contribution.message, created_at: contribution.created_at,
      },
    });
    const common = { title: f.title, reference: contribution.transaction_id, goal: formatMoney(f.goal_amount), raised: formatMoney(totals.raised) };
    await notify({
      event: 'contribution_received', user: organizer, fundraiserId: f.id,
      data: { ...common, contributor: contribution.is_anonymous ? 'An anonymous supporter' : contribution.contributor_name, amount: formatMoney(contribution.amount) },
    });
    if (await getSetting('contribution_receipt_enabled')) {
      await notify({
        event: 'contribution_receipt', fundraiserId: f.id, recipient: { phone: contribution.phone_number, email: contribution.email },
        data: { ...common, contributor: contribution.contributor_name, amount: formatMoney(contribution.amount) },
      });
    }
    if (totals.raised >= f.goal_amount) {
      const { rowsAffected } = await run('UPDATE fundraisers SET goal_notified_at = ? WHERE id = ? AND goal_notified_at IS NULL', [nowIso(), f.id]);
      if (rowsAffected === 1) await notify({ event: 'goal_reached', user: organizer, fundraiserId: f.id, data: common });
    }
    await checkLargeContribution(contribution);
  } catch (err) {
    logger.error('Post-contribution tasks failed', err);
  }
}

/**
 * The single place where a payment attempt reaches a final state. Callbacks, gateway queries,
 * reconciliation and the sandbox all end up here, and it is idempotent: only a PENDING attempt can settle.
 */
export async function settleAttempt(attemptId, outcome) {
  const attempt = await one('SELECT * FROM payment_attempts WHERE id = ?', [attemptId]);
  if (!attempt) throw notFound('Payment not found');
  if (attempt.status !== 'pending') return { settled: false, attempt };

  if (outcome.status === 'succeeded') {
    const received = outcome.amountMinor ?? attempt.amount;
    const contribution = {
      id: uuid(), fundraiser_id: attempt.fundraiser_id, payment_attempt_id: attempt.id, contributor_name: attempt.contributor_name,
      phone_number: attempt.phone_number, email: attempt.email, amount: received, payment_method: attempt.payment_method,
      transaction_id: outcome.transactionId || attempt.gateway_reference || attempt.id, is_anonymous: attempt.is_anonymous,
      message: attempt.message, created_at: nowIso(),
    };
    let committed;
    try {
      committed = await withTransaction(async (tx) => {
        const upd = await run(
          "UPDATE payment_attempts SET status = 'succeeded', transaction_id = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
          [contribution.transaction_id, contribution.created_at, contribution.created_at, attempt.id], tx,
        );
        if (upd.rowsAffected !== 1) return false; // someone else settled it first
        await run(
          `INSERT INTO contributions (id, fundraiser_id, payment_attempt_id, contributor_name, phone_number, email, amount, payment_method, transaction_id, is_anonymous, message, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [contribution.id, contribution.fundraiser_id, contribution.payment_attempt_id, contribution.contributor_name, contribution.phone_number,
            contribution.email, contribution.amount, contribution.payment_method, contribution.transaction_id, contribution.is_anonymous,
            contribution.message, contribution.created_at], tx,
        );
        return true;
      });
    } catch (err) {
      if (String(err.code ?? err.message).toUpperCase().includes('CONSTRAINT')) {
        // The gateway reused a transaction reference: never double count, put it in front of an admin.
        await run("UPDATE payment_attempts SET status = 'failed', failure_reason = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
          ['Duplicate gateway transaction reference', nowIso(), nowIso(), attempt.id]);
        await raiseFlag({ entityType: 'payment_attempt', entityId: attempt.id, reasonCode: 'duplicate_transaction', details: `Gateway reference ${contribution.transaction_id} already recorded`, severity: 'high' });
        return { settled: true, attempt: await one('SELECT * FROM payment_attempts WHERE id = ?', [attempt.id]) };
      }
      throw err;
    }
    if (!committed) return { settled: false, attempt: await one('SELECT * FROM payment_attempts WHERE id = ?', [attempt.id]) };
    if (received !== attempt.amount) {
      await raiseFlag({
        entityType: 'contribution', entityId: contribution.id, reasonCode: 'amount_mismatch', severity: 'high',
        details: `Requested ${attempt.amount} but the gateway reports ${received} (minor units)`,
      });
    }
    await afterSuccess(attempt, contribution);
    return { settled: true, attempt: await one('SELECT * FROM payment_attempts WHERE id = ?', [attempt.id]) };
  }

  // Failure paths: no contribution record is created (SDD 4.2)
  const status = FINAL_FAILURES.includes(outcome.status) ? outcome.status : 'failed';
  const { rowsAffected } = await run(
    "UPDATE payment_attempts SET status = ?, failure_reason = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
    [status, outcome.failureReason || 'The payment was not completed.', nowIso(), nowIso(), attempt.id],
  );
  if (rowsAffected === 1) await checkFailedAttempts(attempt.phone_number);
  return { settled: rowsAffected === 1, attempt: await one('SELECT * FROM payment_attempts WHERE id = ?', [attempt.id]) };
}

/* ------------------------- pulling status from gateway ------------------- */

/** Ask the gateway where a pending payment stands; settle it when the answer is final. */
export async function refreshAttempt(attemptId) {
  const attempt = await one('SELECT * FROM payment_attempts WHERE id = ?', [attemptId]);
  if (!attempt || attempt.status !== 'pending') return attempt;
  await run('UPDATE payment_attempts SET last_checked_at = ? WHERE id = ?', [nowIso(), attempt.id]);
  if (attempt.gateway_reference) {
    try {
      const result = await getGateway(attempt.gateway).query(attempt);
      if (result.status && result.status !== 'pending') {
        return (await settleAttempt(attempt.id, result)).attempt;
      }
    } catch (err) {
      logger.warn(`Gateway query failed for attempt ${attempt.id}: ${err.message}`);
    }
  }
  const expiry = await getSetting('payment_attempt_expiry_minutes');
  if (attempt.created_at < minutesAgoIso(expiry)) {
    return (await settleAttempt(attempt.id, { status: 'expired', failureReason: 'The payment prompt timed out. No money was taken.' })).attempt;
  }
  return one('SELECT * FROM payment_attempts WHERE id = ?', [attempt.id]);
}

export async function getAttemptStatus(id) {
  let attempt = await loadAttempt(id);
  if (attempt.status === 'pending') {
    const verifyAfter = await getSetting('status_poll_verify_after_seconds');
    const ageSeconds = (Date.now() - Date.parse(attempt.created_at)) / 1000;
    const sinceCheck = attempt.last_checked_at ? (Date.now() - Date.parse(attempt.last_checked_at)) / 1000 : Infinity;
    if (config.payment.mode === 'live' && ageSeconds >= verifyAfter && sinceCheck >= 10) {
      await refreshAttempt(id);
      attempt = await loadAttempt(id);
    } else if (attempt.created_at < minutesAgoIso(await getSetting('payment_attempt_expiry_minutes'))) {
      await refreshAttempt(id);
      attempt = await loadAttempt(id);
    }
  }
  return presentAttempt(attempt);
}

/* -------------------------------- callbacks ------------------------------ */

/**
 * Gateway webhook (SDD 4.1 step 5). The route has already checked the secret in the URL.
 * We never trust the body alone: Safaricom is asked to confirm (STK query) before money is recorded.
 */
export async function handleGatewayCallback(gatewayName, req, gateway) {
  const parsed = gateway.parseCallback(req);
  if (!parsed) return { ignored: true };
  const attempt = await one('SELECT * FROM payment_attempts WHERE gateway_reference = ?', [parsed.reference]);
  if (!attempt) {
    logger.warn(`${gatewayName} callback for unknown reference ${parsed.reference}`);
    return { ignored: true };
  }
  if (attempt.status !== 'pending') return { duplicate: true };

  if (parsed.status === 'succeeded' && typeof gateway.query === 'function') {
    let confirmation = { status: 'pending' };
    for (let i = 0; i < 3 && confirmation.status === 'pending'; i += 1) {
      try { confirmation = await gateway.query(attempt); } catch (err) { logger.warn(`Confirmation query failed: ${err.message}`); }
      if (confirmation.status === 'pending') await sleep(2000);
    }
    if (confirmation.status === 'pending') {
      logger.warn(`Could not confirm ${gatewayName} callback for ${attempt.id}; leaving it for reconciliation`);
      return { deferred: true };
    }
    if (confirmation.status !== 'succeeded') {
      await raiseFlag({ entityType: 'payment_attempt', entityId: attempt.id, reasonCode: 'callback_mismatch', severity: 'high', details: `Callback said success but the gateway reports ${confirmation.status}` });
      return settleAttempt(attempt.id, { status: 'failed', failureReason: confirmation.failureReason || 'The gateway did not confirm the payment.' });
    }
  }
  return settleAttempt(attempt.id, parsed);
}

/* -------------------------------- sandbox -------------------------------- */

export async function simulateSandbox(attemptId, decision) {
  if (config.payment.mode !== 'sandbox') throw new AppError(404, 'NOT_FOUND', 'Not found');
  const outcomes = {
    approve: { status: 'succeeded', transactionId: `SBX-RCPT-${uuid().slice(0, 10).toUpperCase()}` },
    decline: { status: 'failed', failureReason: 'The payment was declined.' },
    cancel: { status: 'cancelled', failureReason: 'You cancelled the payment on your phone.' },
  };
  if (!outcomes[decision]) throw badRequest('Unknown decision');
  await settleAttempt(attemptId, outcomes[decision]);
  return getAttemptStatus(attemptId);
}

export { shareUrl };
