import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function getStripeClient() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(stripeSecretKey);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

function getPeriodBounds(invoice: Stripe.Invoice): {
  start: string | null;
  end: string | null;
} {
  const line = invoice.lines?.data?.[0];
  const start = line?.period?.start
    ? new Date(line.period.start * 1000).toISOString()
    : null;
  const end = line?.period?.end
    ? new Date(line.period.end * 1000).toISOString()
    : null;
  return { start, end };
}

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: "Stripe secret key is not configured" },
      { status: 500 }
    );
  }

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing webhook signature or secret" },
      { status: 400 }
    );
  }

  const stripe = getStripeClient();
  let event: Stripe.Event;
  const rawBody = await request.text();

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("[stripe.webhook] Signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = getAdmin();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const companyId = session.metadata?.company_id;
        const domainInventoryId = session.metadata?.domain_inventory_id;
        const domainTransactionId = session.metadata?.domain_transaction_id;

        if (!companyId || !domainInventoryId) {
          console.warn("[stripe.webhook] Missing metadata on checkout.session.completed", {
            sessionId: session.id,
          });
          break;
        }

        await admin
          .from("domain_inventory")
          .update({
            status: "assigned",
            assigned_to_company_id: companyId,
            assigned_at: new Date().toISOString(),
            reserved_until: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", domainInventoryId);

        if (domainTransactionId) {
          await admin
            .from("domain_transactions")
            .update({
              status: "completed",
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : session.payment_intent?.id ?? null,
              stripe_subscription_id:
                typeof session.subscription === "string"
                  ? session.subscription
                  : session.subscription?.id ?? null,
              amount_paid: (session.amount_total ?? 0) / 100,
              currency: session.currency ?? "usd",
              updated_at: new Date().toISOString(),
            })
            .eq("id", domainTransactionId);
        } else {
          await admin
            .from("domain_transactions")
            .update({
              status: "completed",
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : session.payment_intent?.id ?? null,
              stripe_subscription_id:
                typeof session.subscription === "string"
                  ? session.subscription
                  : session.subscription?.id ?? null,
              amount_paid: (session.amount_total ?? 0) / 100,
              currency: session.currency ?? "usd",
              updated_at: new Date().toISOString(),
            })
            .eq("company_id", companyId)
            .eq("domain_inventory_id", domainInventoryId)
            .eq("status", "pending");
        }

        if (session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;

          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const mailboxItem = subscription.items.data.find(
            (item) => item.price.recurring?.interval === "month"
          );

          await admin.from("mailbox_subscriptions").upsert(
            {
              company_id: companyId,
              domain_inventory_id: domainInventoryId,
              mailbox_count: mailboxItem?.quantity ?? 3,
              price_per_mailbox:
                mailboxItem?.price?.unit_amount !== null &&
                mailboxItem?.price?.unit_amount !== undefined
                  ? mailboxItem.price.unit_amount / 100
                  : 10,
              stripe_subscription_id: subscriptionId,
              stripe_price_id: mailboxItem?.price?.id ?? null,
              status: subscription.status,
              current_period_start: new Date(
                subscription.current_period_start * 1000
              ).toISOString(),
              current_period_end: new Date(
                subscription.current_period_end * 1000
              ).toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "stripe_subscription_id" }
          );
        }

        console.log("[stripe.webhook] checkout.session.completed handled", {
          sessionId: session.id,
          companyId,
          domainInventoryId,
        });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;

        if (!subscriptionId) break;

        const { start, end } = getPeriodBounds(invoice);

        await admin
          .from("mailbox_subscriptions")
          .update({
            status: "active",
            current_period_start: start,
            current_period_end: end,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscriptionId);

        console.log("[stripe.webhook] invoice.paid handled", {
          invoiceId: invoice.id,
          subscriptionId,
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;

        if (!subscriptionId) break;

        await admin
          .from("mailbox_subscriptions")
          .update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscriptionId);

        console.warn("[stripe.webhook] invoice.payment_failed handled", {
          invoiceId: invoice.id,
          subscriptionId,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;

        const { data: mailboxSub } = await admin
          .from("mailbox_subscriptions")
          .select("id, domain_inventory_id")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();

        await admin
          .from("mailbox_subscriptions")
          .update({
            status: "canceled",
            updated_at: new Date().toISOString(),
            canceled_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscriptionId);

        if (mailboxSub?.domain_inventory_id) {
          await admin
            .from("domain_inventory")
            .update({
              status: "suspended",
              updated_at: new Date().toISOString(),
            })
            .eq("id", mailboxSub.domain_inventory_id);
        }

        console.log("[stripe.webhook] customer.subscription.deleted handled", {
          subscriptionId,
        });
        break;
      }

      default:
        console.log("[stripe.webhook] Unhandled event type", event.type);
        break;
    }
  } catch (error) {
    console.error("[stripe.webhook] Handler error", {
      eventType: event.type,
      error,
    });
  }

  return NextResponse.json({ received: true });
}
