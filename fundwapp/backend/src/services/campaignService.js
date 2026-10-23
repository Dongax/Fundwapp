const { Fundraiser, Contribution } = require('../models');
const { generateSlug } = require('../utils/slug');
const { generateQrCodeDataUrl } = require('../utils/qrcode');
const config = require('../config');
const notificationService = require('./notificationService');

async function createFundraiser(organizer, data) {
  const slug = generateSlug(data.title);
  const publicUrl = `${config.frontendUrl}/f/${slug}`;
  const qr_code_url = await generateQrCodeDataUrl(publicUrl);

  const fundraiser = await Fundraiser.create({
    organizer_id: organizer.id,
    title: data.title,
    description: data.description,
    category: data.category,
    goal_amount: data.goal_amount,
    currency: data.currency || 'KES',
    start_date: data.start_date,
    end_date: data.end_date,
    cover_image_url: data.cover_image_url,
    slug,
    qr_code_url,
  });

  await notificationService.notifyCampaignCreated(organizer, fundraiser);

  return fundraiser;
}

async function getPublicFundraiser(slug) {
  const fundraiser = await Fundraiser.findOne({
    where: { slug, status: 'active' },
  });
  if (!fundraiser) {
    const err = new Error('Fundraiser not found or not active');
    err.statusCode = 404;
    throw err;
  }

  const contributorCount = await Contribution.count({
    where: { fundraiser_id: fundraiser.id, status: 'confirmed' },
  });

  return { fundraiser, contributorCount };
}

async function updateFundraiser(organizer, fundraiserId, updates) {
  const fundraiser = await Fundraiser.findOne({
    where: { id: fundraiserId, organizer_id: organizer.id },
  });
  if (!fundraiser) {
    const err = new Error('Fundraiser not found');
    err.statusCode = 404;
    throw err;
  }

  const allowedFields = ['title', 'description', 'category', 'goal_amount', 'end_date', 'cover_image_url'];
  allowedFields.forEach((field) => {
    if (updates[field] !== undefined) fundraiser[field] = updates[field];
  });

  await fundraiser.save();
  return fundraiser;
}

async function listOrganizerFundraisers(organizer) {
  return Fundraiser.findAll({ where: { organizer_id: organizer.id }, order: [['created_at', 'DESC']] });
}

// Admin: approve a fundraiser pending review
async function approveFundraiser(fundraiserId) {
  const fundraiser = await Fundraiser.findByPk(fundraiserId);
  if (!fundraiser) {
    const err = new Error('Fundraiser not found');
    err.statusCode = 404;
    throw err;
  }
  fundraiser.status = 'active';
  await fundraiser.save();
  return fundraiser;
}

async function rejectFundraiser(fundraiserId, reason) {
  const fundraiser = await Fundraiser.findByPk(fundraiserId);
  if (!fundraiser) {
    const err = new Error('Fundraiser not found');
    err.statusCode = 404;
    throw err;
  }
  fundraiser.status = 'rejected';
  await fundraiser.save();
  return fundraiser;
}

module.exports = {
  createFundraiser,
  getPublicFundraiser,
  updateFundraiser,
  listOrganizerFundraisers,
  approveFundraiser,
  rejectFundraiser,
};
