import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Public } from '@auth/decorators/public.decorator';
import { CartService } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/add-cart-item.dto';
import { MergeCartDto } from './dto/merge-cart.dto';

@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  // ─── Spec-aligned cartId-scoped routes ─────────────────────

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create or return current cart (auth users get their primary cart; guests get a new one)',
  })
  @ApiCreatedResponse({
    description:
      'For auth users: returns the existing or new primary cart id. For guests: also returns a one-time `guestToken` that MUST be saved client-side and sent as `x-guest-token` on every subsequent request.',
    schema: {
      oneOf: [
        {
          description: 'Authenticated user',
          example: { cartId: '8d2e1f4c-3b9a-4b2c-9e7a-b1c2d3e4f5a6', ownerType: 'user' },
        },
        {
          description: 'Guest user (store guestToken; it will not be shown again)',
          example: {
            cartId: '8d2e1f4c-3b9a-4b2c-9e7a-b1c2d3e4f5a6',
            ownerType: 'guest',
            guestToken: 'EXAMPLE_GUEST_TOKEN_save_this_value_from_response',
          },
        },
      ],
    },
  })
  async create(@Req() req: Request) {
    return this.cartService.createCart(req);
  }

  @Public()
  @ApiHeader({ name: 'x-guest-token', required: false, description: 'Required for guest carts' })
  @Get(':cartId')
  @ApiOperation({ summary: 'Retrieve cart by public cartId' })
  @ApiOkResponse({
    schema: {
      example: {
        id: '8d2e1f4c-3b9a-4b2c-9e7a-b1c2d3e4f5a6',
        cartId: '8d2e1f4c-3b9a-4b2c-9e7a-b1c2d3e4f5a6',
        ownerType: 'guest',
        currency: 'NGN',
        items: [
          {
            itemId: '6710abc123def456789012ab',
            productId: '6710def123abc456789012ab',
            variantId: 'v-blue-m',
            name: 'Hisense 43" Smart TV',
            thumbnailUrl: 'https://res.cloudinary.com/.../hisense-43.jpg',
            price: { amount: 220000, currency: 'NGN', formatted: '₦220,000' },
            quantity: 1,
            stockQty: 12,
            lineTotal: { amount: 220000, currency: 'NGN', formatted: '₦220,000' },
          },
        ],
        totals: {
          subtotal: { amount: 220000, currency: 'NGN', formatted: '₦220,000' },
          shipping: { amount: 0, currency: 'NGN', formatted: '₦0' },
          discount: { amount: 0, currency: 'NGN', formatted: '₦0' },
          grandTotal: { amount: 220000, currency: 'NGN', formatted: '₦220,000' },
        },
      },
    },
  })
  async getByCartId(@Req() req: Request, @Param('cartId') cartId: string) {
    return this.cartService.getCartByPublicId(req, cartId);
  }

  @Public()
  @ApiHeader({ name: 'x-guest-token', required: false })
  @Post(':cartId/items')
  @ApiOperation({ summary: 'Add an item to a cart' })
  async addItemToCart(
    @Req() req: Request,
    @Param('cartId') cartId: string,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cartService.addItemByPublicId(
      req,
      cartId,
      dto.productId,
      dto.variantId ?? null,
      dto.quantity,
    );
  }

  @Public()
  @ApiHeader({ name: 'x-guest-token', required: false })
  @Patch(':cartId/items/:itemId')
  @ApiOperation({ summary: 'Update quantity of an item in a cart' })
  async updateItemInCart(
    @Req() req: Request,
    @Param('cartId') cartId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItemByPublicId(req, cartId, itemId, dto.quantity);
  }

  @Public()
  @ApiHeader({ name: 'x-guest-token', required: false })
  @Delete(':cartId/items/:itemId')
  @ApiOperation({ summary: 'Remove an item from a cart' })
  async removeItemFromCart(
    @Req() req: Request,
    @Param('cartId') cartId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.cartService.removeItemByPublicId(req, cartId, itemId);
  }

  @Public()
  @ApiHeader({ name: 'x-guest-token', required: false })
  @Delete(':cartId')
  @ApiOperation({ summary: 'Clear all items in a cart (keeps the cart record)' })
  async clearCart(@Req() req: Request, @Param('cartId') cartId: string) {
    return this.cartService.clearByPublicId(req, cartId);
  }

  @ApiBearerAuth()
  @Post(':cartId/merge')
  @ApiOperation({ summary: 'Merge a guest cart into the authenticated user cart' })
  async mergeCart(
    @CurrentUser('userId') userId: string,
    @Param('cartId') guestCartId: string,
    @Body() dto: MergeCartDto,
  ) {
    return this.cartService.mergeGuestIntoUser(userId, guestCartId, dto.guestToken);
  }

  @Public()
  @ApiHeader({ name: 'x-guest-token', required: false })
  @Get(':cartId/totals')
  @ApiOperation({ summary: 'Get totals breakdown for a cart (pricing not yet locked)' })
  @ApiOkResponse({
    description:
      '`pricingLocked` is false because the pricing-rule engine (Module 16) is not yet implemented. Tax uses a 7.5% VAT placeholder and delivery is a flat estimate.',
    schema: {
      example: {
        cartId: '8d2e1f4c-3b9a-4b2c-9e7a-b1c2d3e4f5a6',
        currency: 'NGN',
        subtotal: { amount: 220000, currency: 'NGN', formatted: '₦220,000' },
        taxAmount: { amount: 16500, currency: 'NGN', formatted: '₦16,500' },
        taxRate: 0.075,
        deliveryEstimate: { amount: 1500, currency: 'NGN', formatted: '₦1,500' },
        grandTotal: { amount: 238000, currency: 'NGN', formatted: '₦238,000' },
        pricingLocked: false,
        note: 'Tax and delivery use placeholder defaults until the pricing-rule engine ships.',
      },
    },
  })
  async getTotals(@Req() req: Request, @Param('cartId') cartId: string) {
    return this.cartService.getTotalsByPublicId(req, cartId);
  }

  @Public()
  @ApiHeader({ name: 'x-guest-token', required: false })
  @Post(':cartId/validate')
  @ApiOperation({ summary: 'Validate cart items (stock + active checks)' })
  @ApiCreatedResponse({
    schema: {
      example: {
        cartId: '8d2e1f4c-3b9a-4b2c-9e7a-b1c2d3e4f5a6',
        valid: false,
        issues: [{ itemId: '6710abc123def456789012ab', reason: 'variant_out_of_stock' }],
      },
    },
  })
  async validateCart(@Req() req: Request, @Param('cartId') cartId: string) {
    return this.cartService.validateByPublicId(req, cartId);
  }

  // ─── Legacy user-scoped routes (kept for back-compat) ─────

  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: "Get current user's primary cart (legacy)" })
  async getCart(@CurrentUser('userId') userId: string) {
    return this.cartService.getCart(userId);
  }

  @ApiBearerAuth()
  @Post('items')
  @ApiOperation({ summary: "Add item to current user's primary cart (legacy)" })
  async addItem(@CurrentUser('userId') userId: string, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(userId, dto.productId, dto.variantId ?? null, dto.quantity);
  }

  @ApiBearerAuth()
  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update cart item quantity (legacy)' })
  async updateItem(
    @CurrentUser('userId') userId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItemQuantity(userId, itemId, dto.quantity);
  }

  @ApiBearerAuth()
  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove item from cart (legacy)' })
  async removeItem(@CurrentUser('userId') userId: string, @Param('itemId') itemId: string) {
    return this.cartService.removeItem(userId, itemId);
  }
}
