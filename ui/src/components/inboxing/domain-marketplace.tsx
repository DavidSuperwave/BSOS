"use client";

import { useState, useEffect, useCallback } from "react";
import { Globe, Search, Loader2, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface DomainMarketplaceProps {
  companyId: string;
}

interface AvailableDomain {
  id: string;
  domain_name: string;
  domain_type: "elite" | "standard" | "byo";
  sale_price: number;
  domain_age_years: number | null;
  health_score: number | null;
  tags: string[];
  user_count: number;
  mailbox_count: number;
}

interface Summary {
  available_elite: number;
  available_standard: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

type FilterTab = "all" | "elite" | "standard";

export function DomainMarketplace({ companyId }: DomainMarketplaceProps) {
  const [domains, setDomains] = useState<AvailableDomain[]>([]);
  const [summary, setSummary] = useState<Summary>({ available_elite: 0, available_standard: 0 });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 12, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [selectedDomain, setSelectedDomain] = useState<AvailableDomain | null>(null);
  const [mailboxCount, setMailboxCount] = useState(3);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDomains = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ company_id: companyId, page: String(page), limit: "12" });
      if (activeTab !== "all") params.set("domain_type", activeTab);
      if (search) params.set("search", search);

      const res = await fetch(`/api/inboxing/request-domain?${params}`);
      if (!res.ok) throw new Error("Failed to load domains");
      const data = await res.json();
      setDomains(data.domains || []);
      setSummary(data.summary || { available_elite: 0, available_standard: 0 });
      setPagination(data.pagination || { page: 1, limit: 12, total: 0, pages: 0 });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, activeTab, search]);

  useEffect(() => { fetchDomains(1); }, [fetchDomains]);

  const handleGetDomain = useCallback(async (domainId?: string, domainType?: string) => {
    setCheckoutLoading(true);
    setError(null);
    try {
      // Step 1: Reserve domain
      const reserveBody: any = { company_id: companyId, mailbox_count: mailboxCount };
      if (domainId) reserveBody.domain_inventory_id = domainId;
      else if (domainType) reserveBody.domain_type = domainType;

      const reserveRes = await fetch("/api/inboxing/request-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reserveBody),
      });
      if (!reserveRes.ok) {
        const err = await reserveRes.json();
        throw new Error(err.error || "Failed to reserve domain");
      }
      const reserveData = await reserveRes.json();

      // Step 2: Create Stripe checkout
      const checkoutRes = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          domain_inventory_id: reserveData.domain.id,
          mailbox_count: mailboxCount,
        }),
      });
      if (!checkoutRes.ok) {
        const err = await checkoutRes.json();
        throw new Error(err.error || "Failed to create checkout session");
      }
      const checkoutData = await checkoutRes.json();

      // Step 3: Redirect to Stripe
      if (checkoutData.checkout_url) {
        window.location.href = checkoutData.checkout_url;
      }
    } catch (err: any) {
      setError(err.message);
      setCheckoutLoading(false);
    }
  }, [companyId, mailboxCount]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(price);

  const totalAvailable = summary.available_elite + summary.available_standard;

  return (
    <div className="space-y-6 mb-8">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Domain Marketplace</h2>
          <p className="text-sm text-zinc-400 mt-0.5">
            Purchase pre-configured domains for outbound campaigns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            onClick={() => handleGetDomain(undefined, "elite")}
            disabled={summary.available_elite === 0 || checkoutLoading}
          >
            Get Any Elite Domain
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            onClick={() => handleGetDomain(undefined, "standard")}
            disabled={summary.available_standard === 0 || checkoutLoading}
          >
            Get Any Standard Domain
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-red-300">
            Dismiss
          </button>
        </div>
      )}

      {/* Availability Banner */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-5 py-4 flex items-center gap-4">
        <Globe className="h-5 w-5 text-zinc-500 shrink-0" />
        {totalAvailable > 0 ? (
          <div className="flex items-center gap-4 text-sm">
            {summary.available_elite > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                <span className="text-zinc-300">
                  <span className="font-medium text-white">{summary.available_elite}</span> Elite Domains
                </span>
              </span>
            )}
            {summary.available_standard > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                <span className="text-zinc-300">
                  <span className="font-medium text-white">{summary.available_standard}</span> Standard Domains
                </span>
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            No domains currently available. Check back soon or contact support.
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
          {(["all", "elite", "standard"] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-sm capitalize transition-colors ${
                activeTab === tab
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            className="pl-10 bg-zinc-900/50 border-zinc-800"
            placeholder="Search domains..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Domain Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
        </div>
      ) : domains.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 text-sm">
          No domains match your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {domains.map((domain) => (
            <button
              key={domain.id}
              onClick={() => { setSelectedDomain(domain); setMailboxCount(3); }}
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 text-left hover:border-zinc-600 transition-colors group"
            >
              <div className="flex items-start justify-between mb-3">
                <Badge
                  className={
                    domain.domain_type === "elite"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  }
                >
                  {domain.domain_type === "elite" ? "Elite" : "Standard"}
                </Badge>
                {domain.health_score != null && (
                  <span className="text-xs text-zinc-500">{domain.health_score}/100</span>
                )}
              </div>

              <p className="text-white font-medium text-base group-hover:text-zinc-100 truncate">
                {domain.domain_name}
              </p>

              {domain.domain_type === "elite" && domain.domain_age_years && (
                <p className="text-xs text-amber-400/70 mt-0.5">
                  Aged {domain.domain_age_years} years
                </p>
              )}

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-2xl font-bold text-white">{formatPrice(domain.sale_price)}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">one-time</p>
                </div>
                <p className="text-xs text-zinc-500">{domain.user_count} mailboxes</p>
              </div>

              {domain.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {domain.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => fetchDomains(pagination.page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-zinc-400">
            Page {pagination.page} of {pagination.pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.pages}
            onClick={() => fetchDomains(pagination.page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* BYO Section */}
      <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-zinc-500" />
          <div>
            <p className="text-sm text-zinc-300">Already have a domain?</p>
            <p className="text-xs text-zinc-500">
              Connect your own for $0 domain fee + $10/mailbox/month
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="border-zinc-700">
          Connect Domain
        </Button>
      </div>

      {/* Selection Dialog */}
      <Dialog open={!!selectedDomain} onOpenChange={(open) => !open && setSelectedDomain(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
          {selectedDomain && (
            <>
              <DialogTitle className="text-lg font-semibold">
                {selectedDomain.domain_name}
              </DialogTitle>
              <DialogDescription className="text-zinc-400">
                {selectedDomain.domain_type === "elite" ? "Elite" : "Standard"} domain
                {selectedDomain.domain_age_years
                  ? ` — aged ${selectedDomain.domain_age_years} years`
                  : ""}
              </DialogDescription>

              <div className="space-y-4 mt-4">
                {/* Mailbox Count */}
                <div>
                  <label className="text-sm text-zinc-400 block mb-1.5">Number of mailboxes</label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-zinc-700"
                      onClick={() => setMailboxCount(Math.max(1, mailboxCount - 1))}
                      disabled={mailboxCount <= 1}
                    >
                      −
                    </Button>
                    <span className="w-12 text-center text-white font-medium">{mailboxCount}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-zinc-700"
                      onClick={() => setMailboxCount(Math.min(10, mailboxCount + 1))}
                      disabled={mailboxCount >= 10}
                    >
                      +
                    </Button>
                  </div>
                </div>

                {/* Pricing Breakdown */}
                <div className="bg-zinc-950 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Domain fee (one-time)</span>
                    <span className="text-white">{formatPrice(selectedDomain.sale_price)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">
                      Mailboxes ({mailboxCount} × $10/mo)
                    </span>
                    <span className="text-white">{formatPrice(mailboxCount * 10)}/mo</span>
                  </div>
                  <div className="border-t border-zinc-800 pt-2 mt-2 flex justify-between">
                    <span className="text-zinc-300 font-medium">Total first month</span>
                    <span className="text-white font-bold text-lg">
                      {formatPrice(selectedDomain.sale_price + mailboxCount * 10)}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Then {formatPrice(mailboxCount * 10)}/month for mailboxes
                  </p>
                </div>

                {/* CTA */}
                <Button
                  className="w-full bg-gradient-to-r from-red-500 to-orange-500 text-white font-medium hover:opacity-90 transition-opacity"
                  onClick={() => handleGetDomain(selectedDomain.id)}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Get This Domain"
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Checkout Loading Overlay */}
      {checkoutLoading && !selectedDomain && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-zinc-900 rounded-xl p-8 text-center space-y-3">
            <Loader2 className="h-8 w-8 text-red-400 animate-spin mx-auto" />
            <p className="text-white font-medium">Setting up checkout...</p>
            <p className="text-sm text-zinc-400">You'll be redirected to Stripe momentarily</p>
          </div>
        </div>
      )}
    </div>
  );
}
