import { Controller, Get, Injectable, Module, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env';
import { toRupees } from '../../common/money';

/**
 * Public store rules the storefront needs to show the right options.
 * An unconfigured value is reported as null, never as a default.
 */
@Injectable()
export class StoreService {
  constructor(private readonly config: ConfigService) {}

  private get store() {
    return this.config.get<AppEnv>('app')!.store;
  }

  settings() {
    const s = this.store;
    return {
      codEnabled: s.codEnabled,
      shippingFee: s.shippingFeePaise === null ? null : toRupees(s.shippingFeePaise),
      gst: {
        ratePercent: s.gstRateBasisPoints === null ? null : s.gstRateBasisPoints / 100,
        mode: s.gstMode,
      },
      minimumOrder: s.minOrderPaise === null ? null : toRupees(s.minOrderPaise),
      deliveryConfigured: s.serviceablePincodes !== null,
      checkoutReady:
        s.shippingFeePaise !== null && s.gstRateBasisPoints !== null && s.gstMode !== null && s.serviceablePincodes !== null,
    };
  }

  /** `serviceable` is null when delivery areas are not configured yet. */
  checkPincode(pincode: string) {
    const list = this.store.serviceablePincodes;
    if (list === null) return { pincode, serviceable: null };
    return { pincode, serviceable: list.includes(pincode) };
  }
}

@Controller('store')
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get('settings')
  settings() {
    return this.store.settings();
  }

  @Get('pincodes/:pincode')
  pincode(@Param('pincode') pincode: string) {
    return this.store.checkPincode(pincode.trim());
  }
}

@Module({
  controllers: [StoreController],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}
