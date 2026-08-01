const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@localhost:5432/dispatch';

const { normalizeDriverPayload, validateDriverPayload } = require('../routes/drivers');

test('tractor drivers require a medical certificate expiration date', () => {
  const errors = validateDriverPayload({
    name: 'Kerry M',
    phone: '3120000444',
    email: 'kerry@mail.com',
    schedule: 'Mon-Fri (08:00-17:00)',
    daysOff: ['Saturday', 'Sunday'],
    vehicleTypes: ['Tractor']
  });

  assert.ok(errors.includes('DOT medical expiration is required for tractor drivers'));
});

test('non-tractor drivers do not require a medical certificate expiration date', () => {
  const errors = validateDriverPayload({
    name: 'Kerry M',
    phone: '3120000444',
    email: 'kerry@mail.com',
    schedule: 'Mon-Fri (08:00-17:00)',
    daysOff: ['Saturday', 'Sunday'],
    vehicleTypes: ['Straight Truck']
  });

  assert.ok(!errors.includes('DOT medical expiration is required for tractor drivers'));
});

test('plain date strings are converted to Date objects before persistence', () => {
  const payload = normalizeDriverPayload({
    dateOfBirth: '1999-07-30',
    availableFrom: '2026-07-28',
    medicalCertExpiration: '2027-09-30'
  });

  assert.ok(payload.dateOfBirth instanceof Date);
  assert.ok(payload.availableFrom instanceof Date);
  assert.ok(payload.medicalCertExpiration instanceof Date);
});
