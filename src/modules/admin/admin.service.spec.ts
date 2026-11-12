import { canTransition, ALLOWED_TRANSITIONS } from './admin.service';

describe('order status transitions', () => {
  it('moves forward along the fulfilment path', () => {
    expect(canTransition('placed', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'processing')).toBe(true);
    expect(canTransition('processing', 'shipped')).toBe(true);
    expect(canTransition('shipped', 'delivered')).toBe(true);
  });

  it('allows cancelling only before shipment', () => {
    expect(canTransition('placed', 'cancelled')).toBe(true);
    expect(canTransition('processing', 'cancelled')).toBe(true);
    expect(canTransition('shipped', 'cancelled')).toBe(false);
    expect(canTransition('delivered', 'cancelled')).toBe(false);
  });

  it('never leaves a terminal status, and never skips steps', () => {
    expect(ALLOWED_TRANSITIONS.delivered).toEqual([]);
    expect(ALLOWED_TRANSITIONS.cancelled).toEqual([]);
    expect(canTransition('placed', 'shipped')).toBe(false);
    expect(canTransition('cancelled', 'placed')).toBe(false);
  });
});
