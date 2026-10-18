import { uniqueViolationFields } from './prisma-errors.js';

describe('uniqueViolationFields', () => {
  it('reads meta.target', () => {
    expect(uniqueViolationFields({ target: ['email'] })).toEqual(['email']);
  });

  it('reads constraint fields from a driver adapter error', () => {
    const meta = { driverAdapterError: { cause: { constraint: { fields: ['username'] } } } };
    expect(uniqueViolationFields(meta)).toEqual(['username']);
  });

  it('derives the field from the index name', () => {
    const meta = {
      driverAdapterError: { cause: { table: 'User', constraint: { index: 'User_email_key' } } },
    };
    expect(uniqueViolationFields(meta)).toEqual(['email']);
  });

  it('returns nothing when the shape is unknown', () => {
    expect(uniqueViolationFields(undefined)).toEqual([]);
  });
});
