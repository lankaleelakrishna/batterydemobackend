import { AppError } from '../../common/errors';
import { assertOrderAllowed, computeTotals, requireConfiguredRules, ConfiguredRules } from './checkout-policy';

const RULES: ConfiguredRules = {
  shippingFeePaise: 5000,
  gstRateBasisPoints: 1800,
  gstMode: 'exclusive',
  minOrderPaise: null,
  codEnabled: true,
  serviceablePincodes: ['500001'],
};

describe('computeTotals', () => {
  it('adds GST on top when prices exclude GST', () => {
    const t = computeTotals(1_449_000, RULES);
    expect(t.taxPaise).toBe(260_820); // 18% of Rs 14,490
    expect(t.shippingPaise).toBe(5000);
    expect(t.totalPaise).toBe(1_449_000 + 5000 + 260_820);
  });

  it('extracts GST from prices that already include it', () => {
    const t = computeTotals(1_180_000, { ...RULES, gstMode: 'inclusive' });
    expect(t.taxPaise).toBe(180_000); // 1,180,000 * 18 / 118
    expect(t.totalPaise).toBe(1_180_000 + 5000);
  });

  it('handles a zero shipping fee', () => {
    expect(computeTotals(100_000, { ...RULES, shippingFeePaise: 0 }).totalPaise).toBe(100_000 + 18_000);
  });
});

describe('requireConfiguredRules', () => {
  it('refuses checkout and lists every missing setting', () => {
    try {
      requireConfiguredRules({ shippingFeePaise: null, gstRateBasisPoints: null, gstMode: null, minOrderPaise: null, codEnabled: false, serviceablePincodes: null });
      throw new Error('expected STORE_NOT_CONFIGURED');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.getStatus()).toBe(503);
      expect(e.code).toBe('STORE_NOT_CONFIGURED');
      expect(e.details).toEqual({ missing: ['SHIPPING_FEE_PAISE', 'GST_RATE_BASIS_POINTS', 'GST_MODE', 'SERVICEABLE_PINCODES'] });
    }
  });

  it('returns the rules when everything required is set', () => {
    const rules = requireConfiguredRules({ shippingFeePaise: 0, gstRateBasisPoints: 0, gstMode: 'inclusive', minOrderPaise: null, codEnabled: false, serviceablePincodes: [] });
    expect(rules.shippingFeePaise).toBe(0);
  });
});

describe('assertOrderAllowed', () => {
  const input = { subtotalPaise: 100_000, pincode: '500001', paymentMethod: 'cod' as const };

  it('allows an order that meets every rule', () => {
    expect(() => assertOrderAllowed(RULES, input)).not.toThrow();
  });

  it('enforces a configured minimum order', () => {
    expect(() => assertOrderAllowed({ ...RULES, minOrderPaise: 200_000 }, input)).toThrow(/minimum order/);
  });

  it('refuses cash on delivery while it is disabled', () => {
    expect(() => assertOrderAllowed({ ...RULES, codEnabled: false }, input)).toThrow(/Cash on delivery is not available/);
  });

  it('refuses pincodes outside the delivery area', () => {
    try {
      assertOrderAllowed(RULES, { ...input, pincode: '999999' });
      throw new Error('expected DELIVERY_UNAVAILABLE');
    } catch (err) {
      expect((err as AppError).code).toBe('DELIVERY_UNAVAILABLE');
    }
  });
});
