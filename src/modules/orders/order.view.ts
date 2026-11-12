import { Order, OrderItem } from '../../database/entities/order.entity';
import { toRupees } from '../../common/money';

/** Order as shown to the customer and the admin. Money is in rupees. */
export function toOrderView(o: Order, items: OrderItem[]) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    subtotal: toRupees(o.subtotalPaise),
    shipping: toRupees(o.shippingPaise),
    tax: toRupees(o.taxPaise),
    total: toRupees(o.totalPaise),
    shippingAddress: o.shippingAddress,
    items: items
      .filter((i) => i.orderId === o.id)
      .sort((a, b) => a.id - b.id)
      .map((i) => ({
        productId: String(i.productId),
        productName: i.productName,
        brandName: i.brandName,
        modelNumber: i.modelNumber,
        unitPrice: toRupees(i.unitPricePaise),
        quantity: i.quantity,
        lineTotal: toRupees(i.lineTotalPaise),
      })),
    createdAt: o.createdAt,
    cancelledAt: o.cancelledAt,
  };
}
