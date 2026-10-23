const { Withdrawal, Fundraiser } = require('../models');
const notificationService = require('../services/notificationService');

async function request(req, res, next) {
  try {
    const { fundraiser_id, amount, payout_method, payout_destination } = req.body;
    const fundraiser = await Fundraiser.findOne({ where: { id: fundraiser_id, organizer_id: req.user.id } });
    if (!fundraiser) return res.status(404).json({ message: 'Fundraiser not found' });

    if (Number(amount) > Number(fundraiser.amount_raised)) {
      return res.status(400).json({ message: 'Withdrawal amount exceeds funds raised' });
    }

    const withdrawal = await Withdrawal.create({
      fundraiser_id, amount, payout_method, payout_destination, status: 'pending',
    });
    res.status(201).json(withdrawal);
  } catch (err) { next(err); }
}

// Admin: approve + mark paid out (in production, split into two steps once
// the payout has actually been disbursed via the relevant gateway).
async function approve(req, res, next) {
  try {
    const withdrawal = await Withdrawal.findByPk(req.params.id);
    if (!withdrawal) return res.status(404).json({ message: 'Withdrawal not found' });

    withdrawal.status = 'approved';
    withdrawal.approved_by = req.user.id;
    await withdrawal.save();

    // TODO: trigger actual payout via mpesa B2C / airtel disbursement / bank transfer here,
    // then set status to 'paid_out' once confirmed.

    const fundraiser = await Fundraiser.findByPk(withdrawal.fundraiser_id);
    const organizer = await fundraiser.getOrganizer();
    await notificationService.notifyWithdrawalCompleted(organizer, fundraiser, withdrawal);

    res.json(withdrawal);
  } catch (err) { next(err); }
}

async function reject(req, res, next) {
  try {
    const withdrawal = await Withdrawal.findByPk(req.params.id);
    if (!withdrawal) return res.status(404).json({ message: 'Withdrawal not found' });
    withdrawal.status = 'rejected';
    withdrawal.notes = req.body.reason;
    await withdrawal.save();
    res.json(withdrawal);
  } catch (err) { next(err); }
}

module.exports = { request, approve, reject };
