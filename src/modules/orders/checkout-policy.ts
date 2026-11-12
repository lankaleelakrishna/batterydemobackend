import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors';
import { percentOfPaise } from '../../common/money';
import { GstMode, StoreEnv } from '../../config/env';

/**
 * Checkout business rules. Every value comes from configuration. None is
 * defaulted here, because shipping, GST, minimum order, COD and delivery areas
 * are business decisions that must be approved before orders can be placed.
 */

export const PAYMENT_METHODS = ['cod'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface ConfiguredRules {
  shippingFeePaise: number;
  gstRateBasisPoints: number;
  gstMode: GstMode;
  minOrderPaise: number | null;
  codEnabled: boolean;
  serviceablePincodes: string[];
}

/** Throws 503 STORE_NOT_CONFIGURED listing every missing setting. */
export function requireConfiguredRules(store: StoreEnv): ConfiguredRules {
  const missing: string[] = [];
  if (store.shippingFeePaise === null) missing.push('SHIPPING_FEE_PAISE');
  if (store.gstRateBasisPoints === null) missing.push('GST_RATE_BASIS_POINTS');
  if (store.gstMode === null) missing.push('GST_MODE');
  if (store.serviceablePincodes === null) missing.push('SERVICEABLE_PINCODES');
  if (missing.length) {
    throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'STORE_NOT_CONFIGURED', 'Orders are not available yet. Please try again later.', {
      missing,
    });
  }
  return {
    shippingFeePaise: store.shippingFeePaise!,
    gstRateBasisPoints: store.gstRateBasisPoints!,
    gstMode: store.gstMode!,
    minOrderPaise: store.minOrderPaise,
    codEnabled: store.codEnabled,
    serviceablePincodes: store.serviceablePincodes!,
  };
}

export interface Totals {
  subtotalPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
}

/**
 * GST is either already included in listed prices (inclusive) or added on top
 * (exclusive). Shipping is always added.
 */
export function computeTotals(subtotalPaise: number, rules: Pick<ConfiguredRules, 'shippingFeePaise' | 'gstRateBasisPoints' | 'gstMode'>): Totals {
  const shippingPaise = rules.shippingFeePaise;
  if (rules.gstMode === 'exclusive') {
    const taxPaise = percentOfPaise(subtotalPaise, rules.gstRateBasisPoints);
    return { subtotalPaise, shippingPaise, taxPaise, totalPaise: subtotalPaise + shippingPaise + taxPaise };
  }
  const taxPaise = Math.round((subtotalPaise * rules.gstRateBasisPoints) / (10_000 + rules.gstRateBasisPoints));
  return { subtotalPaise, shippingPaise, taxPaise, totalPaise: subtotalPaise + shippingPaise };
}

/** Checks the order against the rules that depend on the address and the payment method. */
export function assertOrderAllowed(
  rules: ConfiguredRules,
  input: { subtotalPaise: number; pincode: string; paymentMethod: PaymentMethod },
) {
  if (rules.minOrderPaise !== null && input.subtotalPaise < rules.minOrderPaise) {
    throw AppError.unprocessable('BELOW_MINIMUM_ORDER', 'Your order is below the minimum order value.', {
      minimumPaise: rules.minOrderPaise,
      subtotalPaise: input.subtotalPaise,
    });
  }
  if (input.paymentMethod === 'cod' && !rules.codEnabled) {
    throw AppError.unprocessable('PAYMENT_METHOD_UNAVAILABLE', 'Cash on delivery is not available right now.');
  }
  if (!rules.serviceablePincodes.includes(input.pincode)) {
    throw AppError.unprocessable('DELIVERY_UNAVAILABLE', 'We do not deliver to this pincode yet.', { pincode: input.pincode });
  }
}
