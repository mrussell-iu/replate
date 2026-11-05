const express = require('express');
const repo = require('../repositories/donationRepository');
const router = express.Router();

const validId = n => Number.isSafeInteger(n) && n > 0;
const nonblank = s => typeof s === 'string' && s.trim().length > 0;
// Convert HTML datetime-local into a MySQL DATETIME string (local wall time).
function mysqlDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return value.replace('T', ' ') + (value.length === 16 ? ':00' : '');
}
function validateDonation(data, partial=false) {
  const required = ['food_type','quantity','quantity_unit','pickup_address',
    'pickup_date','pickup_time','claim_deadline'];
  if (!partial && required.some(k => data[k] === undefined || data[k] === null || data[k] === ''))
    return 'Please complete all required donation fields.';
  for (const key of ['food_type','quantity_unit','pickup_address']) {
    if (key in data && !nonblank(data[key])) return `${key} cannot be empty.`;
  }
  if ('quantity' in data && (data.quantity === '' || data.quantity === null ||
      !Number.isFinite(Number(data.quantity)) || Number(data.quantity) <= 0))
    return 'Quantity must be a positive number.';
  if ('pickup_date' in data && !/^\d{4}-\d{2}-\d{2}$/.test(data.pickup_date))
    return 'Pickup date is invalid.';
  if ('pickup_time' in data && !/^\d{2}:\d{2}(?::\d{2})?$/.test(data.pickup_time))
    return 'Pickup time is invalid.';
  if ('claim_deadline' in data) {
    const dt = mysqlDateTime(data.claim_deadline);
    if (!dt || new Date(data.claim_deadline).getTime() <= Date.now())
      return 'Claim deadline must be in the future.';
  }
  return null;
}

router.get('/', async (req,res) => {
  try { res.json(await repo.findAvailable()); }
  catch (err) { console.error('GET donations failed:',err); res.status(500).json({error:'Unable to retrieve donations.'}); }
});

router.post('/', async (req,res) => {
  try {
    const data = req.body || {};
    const problem = validateDonation(data);
    if (problem) return res.status(400).json({error:problem});
    const result = await repo.insertDonation({
      food_type:data.food_type.trim(), quantity:Number(data.quantity),
      quantity_unit:data.quantity_unit.trim(), pickup_address:data.pickup_address.trim(),
      pickup_date:data.pickup_date, pickup_time:data.pickup_time,
      claim_deadline:mysqlDateTime(data.claim_deadline),
      additional_information:data.additional_information || null
    });
    if (result.status === 'MISSING_DONOR')
      return res.status(409).json({error:'Demo donor missing. Run database/seed.sql.'});
    return res.status(201).json({message:'Donation posted successfully.', donation_id:result.donation_id});
  } catch(err) { console.error('POST donation failed:',err); res.status(500).json({error:'Unable to save donation.'}); }
});

router.post('/:id/claim', async (req,res) => {
  const id = Number(req.params.id);
  const recipientId = Number(req.body?.recipient_user_id);
  if (!validId(id)) return res.status(400).json({error:'Invalid donation ID.'});
  if (!validId(recipientId)) return res.status(400).json({error:'A valid recipient user ID is required.'});
  try {
    const result = await repo.claimDonation(id,recipientId);
    if (result.status === 'INVALID_RECIPIENT') return res.status(400).json({error:'Recipient account not found.'});
    if (result.status === 'UNAVAILABLE') return res.status(409).json({error:'This donation is already claimed or expired.'});
    return res.json({message:'Donation claimed successfully.',donation_id:id});
  } catch(err) { console.error('Claim donation failed:',err); res.status(500).json({error:'Unable to claim donation.'}); }
});

router.put('/:id', async (req,res) => {
  const id=Number(req.params.id);
  if (!validId(id)) return res.status(400).json({error:'Invalid donation ID.'});
  const allowed=['food_type','quantity','quantity_unit','pickup_address','pickup_date',
    'pickup_time','claim_deadline','additional_information'];
  const updates={};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body || {},key)) updates[key]=req.body[key];
  if (!Object.keys(updates).length) return res.status(400).json({error:'No valid fields provided.'});
  const problem=validateDonation(updates,true);
  if (problem) return res.status(400).json({error:problem});
  if ('quantity' in updates) updates.quantity=Number(updates.quantity);
  if ('claim_deadline' in updates) updates.claim_deadline=mysqlDateTime(updates.claim_deadline);
  try {
    const count=await repo.updateDonation(id,updates);
    if (!count) return res.status(404).json({error:'Donation not found or no longer available.'});
    return res.json({message:'Donation updated successfully.'});
  } catch(err) { console.error('PUT donation failed:',err); res.status(500).json({error:'Unable to update donation.'}); }
});
module.exports=router;
