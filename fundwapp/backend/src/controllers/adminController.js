const campaignService = require('../services/campaignService');
const { User, Fundraiser, Contribution } = require('../models');

async function listPendingFundraisers(req, res, next) {
  try {
    const fundraisers = await Fundraiser.findAll({ where: { status: 'pending_review' } });
    res.json(fundraisers);
  } catch (err) { next(err); }
}

async function approveFundraiser(req, res, next) {
  try {
    const fundraiser = await campaignService.approveFundraiser(req.params.id);
    res.json(fundraiser);
  } catch (err) { next(err); }
}

async function rejectFundraiser(req, res, next) {
  try {
    const fundraiser = await campaignService.rejectFundraiser(req.params.id, req.body.reason);
    res.json(fundraiser);
  } catch (err) { next(err); }
}

async function listUsers(req, res, next) {
  try {
    const users = await User.findAll({ attributes: { exclude: ['password_hash'] } });
    res.json(users);
  } catch (err) { next(err); }
}

async function suspendUser(req, res, next) {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.status = 'suspended';
    await user.save();
    res.json({ message: 'User suspended' });
  } catch (err) { next(err); }
}

async function flaggedActivity(req, res, next) {
  try {
    // Example heuristic: contributions repeatedly failing on the same fundraiser
    const failed = await Contribution.findAll({
      where: { status: 'failed' },
      order: [['created_at', 'DESC']],
      limit: 50,
    });
    res.json(failed);
  } catch (err) { next(err); }
}

module.exports = {
  listPendingFundraisers, approveFundraiser, rejectFundraiser,
  listUsers, suspendUser, flaggedActivity,
};
