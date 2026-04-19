import { customers, db } from "@/db";
import { getProductById } from "@/config/credits";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/payment";
import { pricingData } from "@/payment/subscriptions";
import { eq } from "drizzle-orm";

export type UserSubscriptionPlan = {
  title: string;
  description: string;
  benefits: string[];
  limitations: string[];
  prices: {
    monthly: number;
    yearly: number;
  };
  stripeIds: {
    monthly: string | null;
    yearly: string | null;
  };
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  stripeCurrentPeriodEnd: number;
  isPaid: boolean;
  interval: "month" | "year" | null;
  isCanceled?: boolean;
};

function getStripePriceIdForProduct(product: ReturnType<typeof getProductById>) {
  if (!product) return null;
  if (product.id.startsWith("price_")) return product.id;

  const name = product.name.toLowerCase();

  if (product.type === "subscription") {
    const interval = product.billingPeriod === "year" ? "YEARLY" : "MONTHLY";

    if (name.includes("basic")) {
      return (
        process.env[`NEXT_PUBLIC_STRIPE_BASIC_${interval}_PRICE_ID`] ||
        process.env[`NEXT_PUBLIC_STRIPE_STD_${interval}_PRICE_ID`] ||
        null
      );
    }

    if (name.includes("pro")) {
      return process.env[`NEXT_PUBLIC_STRIPE_PRO_${interval}_PRICE_ID`] || null;
    }

    if (name.includes("ultimate") || name.includes("team")) {
      return (
        process.env[`NEXT_PUBLIC_STRIPE_BUSINESS_${interval}_PRICE_ID`] || null
      );
    }
  }

  if (name.includes("starter")) {
    return process.env.NEXT_PUBLIC_STRIPE_STARTER_PACK_PRICE_ID || null;
  }

  if (name.includes("standard")) {
    return process.env.NEXT_PUBLIC_STRIPE_STANDARD_PACK_PRICE_ID || null;
  }

  if (name.includes("pro")) {
    return process.env.NEXT_PUBLIC_STRIPE_PRO_PACK_PRICE_ID || null;
  }

  return null;
}

export async function createStripeSession(userId: string, planId: string) {
  const [customer] = await db
    .select({
      id: customers.id,
      plan: customers.plan,
      stripeCustomerId: customers.stripeCustomerId,
    })
    .from(customers)
    .where(eq(customers.authUserId, userId))
    .limit(1);

  const returnUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
    : "/dashboard";

  if (customer?.plan && customer.plan !== "FREE") {
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId!,
      return_url: returnUrl,
    });
    return { success: true as const, url: session.url };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { success: false as const, url: null };
  }
  const email = user.email!;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: email,
    client_reference_id: userId,
    subscription_data: { metadata: { userId } },
    cancel_url: returnUrl,
    success_url: returnUrl,
    line_items: [{ price: planId, quantity: 1 }],
  });

  if (!session.url) return { success: false as const, url: null };
  return { success: true as const, url: session.url };
}

export async function createStripeProductCheckout(params: {
  userId: string;
  productId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const product = getProductById(params.productId);
  if (!product) {
    return { success: false as const, url: null };
  }
  const priceId = getStripePriceIdForProduct(product);
  if (!priceId) {
    return { success: false as const, url: null };
  }

  const user = await getCurrentUser();
  if (!user?.email) {
    return { success: false as const, url: null };
  }

  const session = await stripe.checkout.sessions.create({
    mode: product.type === "subscription" ? "subscription" : "payment",
    payment_method_types: ["card"],
    customer_email: user.email,
    client_reference_id: params.userId,
    cancel_url: params.cancelUrl,
    success_url: params.successUrl,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      userId: params.userId,
      productId: product.id,
      productType: product.type,
      credits: String(product.credits),
    },
    subscription_data:
      product.type === "subscription"
        ? {
            metadata: {
              userId: params.userId,
              productId: product.id,
              credits: String(product.credits),
            },
          }
        : undefined,
  });

  if (!session.url) return { success: false as const, url: null };
  return { success: true as const, url: session.url };
}

export async function getUserPlans(userId: string): Promise<UserSubscriptionPlan | undefined> {
  const [custom] = await db
    .select({
      stripeSubscriptionId: customers.stripeSubscriptionId,
      stripeCurrentPeriodEnd: customers.stripeCurrentPeriodEnd,
      stripeCustomerId: customers.stripeCustomerId,
      stripePriceId: customers.stripePriceId,
    })
    .from(customers)
    .where(eq(customers.authUserId, userId))
    .limit(1);

  if (!custom) {
    return undefined;
  }

  const isPaid =
    !!custom.stripePriceId &&
    !!custom.stripeCurrentPeriodEnd &&
    custom.stripeCurrentPeriodEnd.getTime() + 86_400_000 > Date.now();

  const customPlan =
    pricingData.find((plan) => plan.stripeIds.monthly === custom.stripePriceId) ??
    pricingData.find((plan) => plan.stripeIds.yearly === custom.stripePriceId);
  const plan = isPaid && customPlan ? customPlan : pricingData[0]!;

  const interval = isPaid
    ? customPlan?.stripeIds.monthly === custom.stripePriceId
      ? "month"
      : customPlan?.stripeIds.yearly === custom.stripePriceId
        ? "year"
        : null
    : null;

  let isCanceled = false;
  if (isPaid && custom.stripeSubscriptionId) {
    const stripePlan = await stripe.subscriptions.retrieve(
      custom.stripeSubscriptionId
    );
    isCanceled = stripePlan.cancel_at_period_end;
  }

  return {
    ...plan,
    ...custom,
    stripeCurrentPeriodEnd: custom.stripeCurrentPeriodEnd?.getTime() ?? 0,
    isPaid,
    interval,
    isCanceled,
  };
}

export async function getMySubscription(userId: string) {
  const [customer] = await db
    .select({
      plan: customers.plan,
      stripeCurrentPeriodEnd: customers.stripeCurrentPeriodEnd,
    })
    .from(customers)
    .where(eq(customers.authUserId, userId))
    .limit(1);

  if (!customer) return null;
  return {
    plan: customer.plan,
    endsAt: customer.stripeCurrentPeriodEnd,
  };
}
