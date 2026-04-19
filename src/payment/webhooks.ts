import type Stripe from "stripe";

import { getProductById, getProductExpiryDays } from "@/config/credits";
import {
  CreditTransType,
  SubscriptionPlan,
  creditPackages,
  customers,
  db,
} from "@/db";
import { creditService } from "@/services/credit";
import { eq } from "drizzle-orm";

import { stripe } from ".";
import { getSubscriptionPlan } from "./plans";

function planFromProduct(productId: string | undefined) {
  if (!productId) return SubscriptionPlan.FREE;

  const product = getProductById(productId);
  if (!product || product.type !== "subscription") return SubscriptionPlan.FREE;

  return product.name.toLowerCase().includes("ultimate")
    ? SubscriptionPlan.BUSINESS
    : SubscriptionPlan.PRO;
}

async function rechargeFromStripe(params: {
  userId: string;
  productId: string;
  orderNo: string;
  remarkPrefix: string;
}) {
  const product = getProductById(params.productId);
  if (!product || product.credits <= 0) return;

  const [existing] = await db
    .select({ id: creditPackages.id })
    .from(creditPackages)
    .where(eq(creditPackages.orderNo, params.orderNo))
    .limit(1);

  if (existing) {
    console.log(`[Stripe] Duplicate webhook ignored: ${params.orderNo}`);
    return;
  }

  await creditService.recharge({
    userId: params.userId,
    credits: product.credits,
    orderNo: params.orderNo,
    transType:
      product.type === "subscription"
        ? CreditTransType.SUBSCRIPTION
        : CreditTransType.ORDER_PAY,
    expiryDays: getProductExpiryDays(product),
    remark: `${params.remarkPrefix}: ${product.name}`,
  });
}

async function upsertStripeCustomer(params: {
  userId: string;
  customerId: string;
  subscriptionId?: string | null;
  priceId?: string | null;
  productId?: string | null;
  currentPeriodEnd?: Date | null;
}) {
  const mappedPlan = getSubscriptionPlan(params.priceId ?? undefined);
  const plan =
    mappedPlan === SubscriptionPlan.FREE
      ? planFromProduct(params.productId ?? undefined)
      : mappedPlan;

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.authUserId, params.userId))
    .limit(1);

  const values = {
    stripeCustomerId: params.customerId,
    stripeSubscriptionId: params.subscriptionId,
    stripePriceId: params.priceId,
    stripeCurrentPeriodEnd: params.currentPeriodEnd,
    plan,
    updatedAt: new Date(),
  };

  if (customer) {
    return db
      .update(customers)
      .set(values)
      .where(eq(customers.id, customer.id));
  }

  return db.insert(customers).values({
    authUserId: params.userId,
    ...values,
  });
}

export async function handleEvent(event: Stripe.DiscriminatedEvent) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id ?? session.metadata?.userId;
    if (!userId) throw new Error("Missing user id");

    if (session.mode === "payment") {
      const productId = session.metadata?.productId;
      if (!productId) throw new Error("Missing product id");

      await rechargeFromStripe({
        userId,
        productId,
        orderNo: `stripe_checkout_${session.id}`,
        remarkPrefix: "Stripe payment",
      });
    }
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId =
      typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;

    if (!subscriptionId) return;

    const subscription = await stripe.subscriptions.retrieve(
      subscriptionId
    );
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    const { userId, productId } = subscription.metadata;
    if (!userId) {
      throw new Error("Missing user id");
    }

    const priceId = subscription.items.data[0]?.price.id;
    if (!priceId) {
      return;
    }

    await upsertStripeCustomer({
      userId,
      customerId,
      subscriptionId: subscription.id,
      priceId,
      productId,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    });

    await rechargeFromStripe({
      userId,
      productId: productId ?? priceId,
      orderNo: `stripe_invoice_${invoice.id}`,
      remarkPrefix: "Stripe subscription",
    });
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const { userId } = subscription.metadata;
    if (userId) {
      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.authUserId, userId))
        .limit(1);

      if (customer) {
        await db
          .update(customers)
          .set({
            plan: SubscriptionPlan.FREE,
            stripeSubscriptionId: null,
            stripePriceId: null,
            stripeCurrentPeriodEnd: null,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, customer.id));
      }
    }
  }
  if (event.type === "customer.subscription.updated") {
    console.log("event.type: ", event.type);
  }
  console.log("✅ Stripe Webhook Processed");
}
