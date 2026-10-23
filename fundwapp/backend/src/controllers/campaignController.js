const campaignService = require('../services/campaignService');

async function create(req, res, next) {
  try {
    const fundraiser = await campaignService.createFundraiser(req.user, req.body);
    res.status(201).json(fundraiser);
  } catch (err) { next(err); }
}

async function getPublic(req, res, next) {
  try {
    const { fundraiser, contributorCount } = await campaignService.getPublicFundraiser(req.params.slug);
    res.json({
      id: fundraiser.id,
      title: fundraiser.title,
      description: fundraiser.description,
      category: fundraiser.category,
      goal_amount: fundraiser.goal_amount,
      amount_raised: fundraiser.amount_raised,
      currency: fundraiser.currency,
      cover_image_url: fundraiser.cover_image_url,
      qr_code_url: fundraiser.qr_code_url,
      slug: fundraiser.slug,
      contributor_count: contributorCount,
      progress_pct: Math.min(100, (fundraiser.amount_raised / fundraiser.goal_amount) * 100),
    });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const fundraiser = await campaignService.updateFundraiser(req.user, req.params.id, req.body);
    res.json(fundraiser);
  } catch (err) { next(err); }
}

async function mine(req, res, next) {
  try {
    const fundraisers = await campaignService.listOrganizerFundraisers(req.user);
    res.json(fundraisers);
  } catch (err) { next(err); }
}

module.exports = { create, getPublic, update, mine };
