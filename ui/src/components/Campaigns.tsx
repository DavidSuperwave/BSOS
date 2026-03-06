'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useCampaigns, useCampaignScore, type PlusVibeCampaign } from '@/lib/hooks';
import { useCompany } from '@/contexts/company-context';
import { SetupBanner } from '@/components/setup-banner';
import { CampaignAnalytics } from '@/components/campaigns/campaign-analytics';
import { CampaignWizard } from '@/components/campaigns/campaign-wizard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Search,
  Loader2,
  Users,
  Target,
  Reply,
  Smile,
  Mail,
  Edit3,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  ThumbsUp,
  Ban,
  MoreHorizontal,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

type CampaignRowAction =
  | 'rename'
  | 'duplicate'
  | 'note'
  | 'copySubsequences'
  | 'copyId'
  | 'delete';

function extractCreatedCampaignId(payload: any) {
  const candidates = [
    payload?.id,
    payload?.campaign_id,
    payload?.value?.id,
    payload?.value?.campaign_id,
    payload?.data?.id,
    payload?.data?.campaign_id,
    payload?.raw?.id,
    payload?.raw?.campaign_id,
    payload?.raw?.value?.id,
    payload?.raw?.value?.campaign_id,
    payload?.raw?.data?.id,
    payload?.raw?.data?.campaign_id,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return '';
}

interface CampaignRowProps {
  campaign: PlusVibeCampaign;
  isSelected: boolean;
  onToggle: (id: string, status: string) => void;
  onEdit: (id: string) => void;
  onAnalytics: (id: string) => void;
  onAction: (action: CampaignRowAction, campaign: PlusVibeCampaign) => void;
  rowRef?: (node: HTMLDivElement | null) => void;
  isLoading: boolean;
}

function HealthBadge({ campaignId, companyId }: { campaignId: string; companyId?: string }) {
  const { data } = useCampaignScore(campaignId, companyId);
  if (!data?.score && data?.score !== 0) return null;

  const score = data.score;
  const color =
    score >= 80 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    score >= 60 ? 'bg-amber-100 text-amber-700 border-amber-200' :
    'bg-red-100 text-red-700 border-red-200';

  return (
    <Badge variant="outline" className={cn('text-[10px] font-semibold', color)}>
      {score} {data.grade || ''}
    </Badge>
  );
}

function CampaignRow({
  campaign,
  isSelected,
  onToggle,
  onEdit,
  onAnalytics,
  onAction,
  rowRef,
  isLoading,
}: CampaignRowProps) {
  const { selectedCompany } = useCompany();
  const stats: Required<NonNullable<PlusVibeCampaign["stats"]>> = {
    sent: 0,
    replies: 0,
    positive: 0,
    opened: 0,
    leadCount: 0,
    contacted: 0,
    replyRate: 0,
    positiveRate: 0,
    openRate: 0,
    contactedRate: 0,
    completed: 0,
    bounced: 0,
    unsubscribed: 0,
    ...(campaign.stats || {}),
  };
  const status = campaign.status?.toLowerCase() || 'draft';
  
  // Status badge colors
  const statusColors = {
    active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    paused: 'bg-amber-100 text-amber-700 border-amber-200',
    draft: 'bg-slate-100 text-slate-700 border-slate-200',
    complete: 'bg-blue-100 text-blue-700 border-blue-200',
  };

  const isActive = status === 'active';

  return (
    <div
      ref={rowRef}
      className={cn(
        'grid grid-cols-12 gap-4 items-center px-4 py-3 border-b border-border hover:bg-muted/30 transition-colors',
        isSelected && 'bg-primary/5'
      )}
    >
      {/* Checkbox */}
      <div className="col-span-1 flex items-center">
        <input
          type="checkbox"
          className="rounded border-border"
          checked={isSelected}
          readOnly
        />
      </div>

      {/* Campaign Name + Health Score */}
      <div className="col-span-3 min-w-0 flex items-center gap-2">
        <p className="text-sm font-medium text-foreground truncate">
          {campaign.name}
        </p>
        <HealthBadge campaignId={campaign.id} companyId={selectedCompany?.id} />
      </div>

      {/* Status Toggle */}
      <div className="col-span-2 flex items-center gap-2">
        <Switch
          checked={isActive}
          onCheckedChange={() => onToggle(campaign.id, isActive ? 'PAUSED' : 'ACTIVE')}
          disabled={isLoading}
        />
        <Badge
          variant="outline"
          className={cn(
            'text-xs font-medium',
            statusColors[status as keyof typeof statusColors] || statusColors.draft
          )}
        >
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      </div>

      {/* Stats Row */}
      <div className="col-span-4 flex items-center gap-4 text-sm">
        {/* Leads */}
        <div className="flex items-center gap-1.5" title="Leads">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{stats.leadCount?.toLocaleString() || 0}</span>
        </div>

        {/* Open Rate */}
        <div className="flex items-center gap-1.5" title="Open Rate">
          <Target className="h-4 w-4 text-blue-500" />
          <span className="font-medium">{stats.openRate || 0}%</span>
        </div>

        {/* Reply Rate */}
        <div className="flex items-center gap-1.5" title="Reply Rate">
          <Reply className="h-4 w-4 text-violet-500" />
          <span className="font-medium">{stats.replyRate || 0}%</span>
        </div>

        {/* Positive Rate */}
        <div className="flex items-center gap-1.5" title="Positive Rate">
          <Smile className="h-4 w-4 text-emerald-500" />
          <span className="font-medium">{stats.positiveRate || 0}%</span>
        </div>

        {/* Emails Sent */}
        <div className="flex items-center gap-1.5" title="Emails Sent">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{stats.sent?.toLocaleString() || 0}</span>
        </div>
      </div>

      {/* Progress Bar - % Contacted */}
      <div className="col-span-1">
        <div className="flex items-center gap-2">
          <Progress 
            value={stats.contactedRate || 0} 
            className="h-2 w-16"
          />
          <span className="text-xs font-medium text-muted-foreground">
            {stats.contactedRate || 0}%
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="col-span-1 flex items-center justify-end gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            if (!campaign.id) {
              console.error('Campaign ID is missing!', campaign);
              return;
            }
            onEdit(campaign.id);
          }}
          title="Edit Campaign"
        >
          <Edit3 className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            if (!campaign.id) {
              console.error('Campaign ID is missing!', campaign);
              return;
            }
            onAnalytics(campaign.id);
          }}
          title="View Analytics"
        >
          <BarChart3 className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" title="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onAction('rename', campaign)}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction('duplicate', campaign)}>Duplicate</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction('note', campaign)}>Edit Note</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction('copySubsequences', campaign)}>
              Copy Subsequences
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction('copyId', campaign)}>Copy Id</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => onAction('delete', campaign)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default function Campaigns() {
  const searchParams = useSearchParams();
  const CAMPAIGNS_PER_PAGE = 10;
  const { selectedCompany } = useCompany();
  const { data, error, isLoading, mutate } = useCampaigns(selectedCompany?.id);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [createdCampaignDraft, setCreatedCampaignDraft] = useState<PlusVibeCampaign | null>(null);
  const [analyticsCampaignId, setAnalyticsCampaignId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createCampaignName, setCreateCampaignName] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());
  const [activeActionCampaign, setActiveActionCampaign] = useState<PlusVibeCampaign | null>(null);
  const [activeAction, setActiveAction] = useState<Exclude<CampaignRowAction, 'copyId'> | null>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateSubsequences, setDuplicateSubsequences] = useState(false);
  const [campaignNote, setCampaignNote] = useState('');
  const [copyTargetCampaignId, setCopyTargetCampaignId] = useState('');
  const [archiveCampaignOnDelete, setArchiveCampaignOnDelete] = useState(true);
  const [saveLeadsOnDelete, setSaveLeadsOnDelete] = useState(false);
  const campaignRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const focusedCampaignId = (searchParams.get("campaignId") || "").trim();
  const deepLinkSearch = (searchParams.get("q") || "").trim();
  const companyQuery = selectedCompany?.id
    ? `?companyId=${encodeURIComponent(selectedCompany.id)}`
    : '';

  const campaigns = data?.campaigns || [];
  const selectedEditCampaign =
    campaigns.find((campaign) => campaign.id === editingCampaignId) ??
    (createdCampaignDraft?.id === editingCampaignId ? createdCampaignDraft : null);

  // Calculate aggregated stats for overview
  const overviewStats = useMemo(() => {
    const totalLeads = campaigns.reduce((sum, c) => sum + (c.stats?.leadCount || 0), 0);
    const totalContacted = campaigns.reduce((sum, c) => sum + (c.stats?.contacted || 0), 0);
    const totalCompleted = campaigns.reduce((sum, c) => sum + (c.stats?.completed || 0), 0);
    const totalSent = campaigns.reduce((sum, c) => sum + (c.stats?.sent || 0), 0);
    const totalReplies = campaigns.reduce((sum, c) => sum + (c.stats?.replies || 0), 0);
    const totalPositive = campaigns.reduce((sum, c) => sum + (c.stats?.positive || 0), 0);
    const totalBounced = campaigns.reduce((sum, c) => sum + (c.stats?.bounced || 0), 0);
    
    const finishedRate = totalLeads > 0 ? ((totalCompleted / totalLeads) * 100).toFixed(1) : "0";
    const replyRate = totalSent > 0 ? ((totalReplies / totalSent) * 100).toFixed(1) : "0";
    const positiveRate = totalReplies > 0 ? ((totalPositive / totalReplies) * 100).toFixed(1) : "0";
    const bounceRate = totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(1) : "0";
    
    return {
      totalLeads,
      totalContacted,
      totalCompleted,
      totalReplies,
      totalPositive,
      totalBounced,
      finishedRate,
      replyRate,
      positiveRate,
      bounceRate,
    };
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    const filtered = campaigns.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

    // Keep newest campaigns first
    return filtered.sort((a: PlusVibeCampaign, b: PlusVibeCampaign) => {
      const aTimestamp = Date.parse(a.createdAt || '');
      const bTimestamp = Date.parse(b.createdAt || '');
      const aSafe = Number.isNaN(aTimestamp) ? 0 : aTimestamp;
      const bSafe = Number.isNaN(bTimestamp) ? 0 : bTimestamp;
      return bSafe - aSafe;
    });
  }, [campaigns, search]);

  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / CAMPAIGNS_PER_PAGE));
  const startIndex = (currentPage - 1) * CAMPAIGNS_PER_PAGE;
  const endIndex = startIndex + CAMPAIGNS_PER_PAGE;
  const visibleCampaigns = filteredCampaigns.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (deepLinkSearch && !search) {
      setSearch(deepLinkSearch);
    }
  }, [deepLinkSearch, search]);

  useEffect(() => {
    if (!focusedCampaignId) return;
    const node = campaignRefs.current[focusedCampaignId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedCampaignId, visibleCampaigns.length]);

  useEffect(() => {
    if (!createdCampaignDraft) return;
    if (!campaigns.some((campaign) => campaign.id === createdCampaignDraft.id)) return;
    setCreatedCampaignDraft(null);
  }, [campaigns, createdCampaignDraft]);

  const handleStatusChange = async (campaignId: string, newStatus: string) => {
    setActionLoading(campaignId);
    try {
      const response =
        newStatus === 'ACTIVE'
          ? await fetch(`/api/plusvibe/campaigns/${campaignId}/activate${companyQuery}`, {
              method: 'POST',
            })
          : await fetch(`/api/plusvibe/campaigns/${campaignId}/pause${companyQuery}`, {
              method: 'POST',
            });
      if (!response.ok) {
        throw new Error('Failed to update campaign status');
      }
      mutate();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
    setActionLoading(null);
  };

  const closeActionDialog = () => {
    setActiveActionCampaign(null);
    setActiveAction(null);
    setActionSubmitting(false);
    setActionError(null);
  };

  const openActionDialog = (action: CampaignRowAction, campaign: PlusVibeCampaign) => {
    setActionError(null);
    if (action === 'copyId') {
      navigator.clipboard
        .writeText(campaign.id)
        .catch(() => {
          window.prompt('Copy campaign id', campaign.id);
        });
      return;
    }

    setActiveActionCampaign(campaign);
    setActiveAction(action);
    setRenameValue(campaign.name || '');
    setDuplicateName(`${campaign.name || 'Campaign'} Copy`);
    setDuplicateSubsequences(false);
    setCampaignNote('');
    setCopyTargetCampaignId('');
    setArchiveCampaignOnDelete(true);
    setSaveLeadsOnDelete(false);
  };

  const handleCreateCampaign = async () => {
    const name = createCampaignName.trim();
    if (!name) return;

    setActionError(null);
    setCreateSubmitting(true);
    const optimisticId = `temp-${Date.now()}`;
    const optimisticCampaign: PlusVibeCampaign = {
      id: optimisticId,
      name,
      status: 'draft',
      createdAt: new Date().toISOString(),
      stats: {
        sent: 0,
        replies: 0,
        positive: 0,
        opened: 0,
        leadCount: 0,
        contacted: 0,
        replyRate: 0,
        positiveRate: 0,
        openRate: 0,
        contactedRate: 0,
        completed: 0,
        bounced: 0,
        unsubscribed: 0,
      },
    };
    const snapshot = data;
    await mutate((prev) => {
      if (!prev) return prev;
      return { campaigns: [optimisticCampaign, ...prev.campaigns] };
    }, { revalidate: false });

    try {
      const response = await fetch(`/api/plusvibe/campaigns${companyQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camp_name: name,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to create campaign' }));
        throw new Error(payload.error || payload.details || 'Failed to create campaign');
      }
      const payload = await response.json().catch(() => ({}));
      const createdCampaignId = extractCreatedCampaignId(payload);
      setCreateCampaignName('');
      setIsCreateDialogOpen(false);
      if (createdCampaignId) {
        setCreatedCampaignDraft({
          id: createdCampaignId,
          name,
          status: 'DRAFT',
          createdAt: new Date().toISOString(),
          stats: optimisticCampaign.stats,
        });
        setEditingCampaignId(createdCampaignId);
      }
      await mutate();
    } catch (err) {
      console.error('Failed to create campaign:', err);
      await mutate(snapshot, { revalidate: false });
      setActionError(err instanceof Error ? err.message : 'Failed to create campaign');
      setIsCreateDialogOpen(true);
    }
    setCreateSubmitting(false);
  };

  const handleActionSubmit = async () => {
    if (!activeActionCampaign || !activeAction) return;
    setActionSubmitting(true);
    setActionError(null);

    try {
      if (activeAction === 'rename') {
        const nextName = renameValue.trim();
        if (!nextName) {
          throw new Error('Campaign name is required.');
        }
        const snapshot = data;
        await mutate((prev) => {
          if (!prev) return prev;
          return {
            campaigns: prev.campaigns.map((campaign) =>
              campaign.id === activeActionCampaign.id ? { ...campaign, name: nextName } : campaign
            ),
          };
        }, { revalidate: false });
        const response = await fetch(`/api/plusvibe/campaigns/${activeActionCampaign.id}${companyQuery}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ camp_name: nextName }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: 'Failed to rename campaign' }));
          await mutate(snapshot, { revalidate: false });
          throw new Error(payload.error || payload.details || 'Failed to rename campaign');
        }
        closeActionDialog();
        mutate();
      }

      if (activeAction === 'duplicate') {
        const nextName = duplicateName.trim();
        if (!nextName) {
          throw new Error('Duplicated campaign name is required.');
        }
        const response = await fetch(`/api/plusvibe/campaigns${companyQuery}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            camp_name: nextName,
            source_campaign_id: activeActionCampaign.id,
            duplicate_subsequences: duplicateSubsequences,
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: 'Failed to duplicate campaign' }));
          throw new Error(payload.error || payload.details || 'Failed to duplicate campaign');
        }
        closeActionDialog();
        mutate();
      }

      if (activeAction === 'note') {
        const response = await fetch(`/api/plusvibe/campaigns/${activeActionCampaign.id}${companyQuery}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: campaignNote.trim() }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: 'Failed to update note' }));
          throw new Error(payload.error || payload.details || 'Failed to update note');
        }
        closeActionDialog();
        mutate();
      }

      if (activeAction === 'copySubsequences') {
        if (!copyTargetCampaignId) {
          throw new Error('Select a destination campaign first.');
        }
        const response = await fetch(`/api/plusvibe/campaigns/${activeActionCampaign.id}${companyQuery}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'copy_subsequences',
            destination_campaign_id: copyTargetCampaignId,
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: 'Failed to copy subsequences' }));
          throw new Error(payload.error || payload.details || 'Failed to copy subsequences');
        }
        closeActionDialog();
        mutate();
      }

      if (activeAction === 'delete') {
        const snapshot = data;
        await mutate((prev) => {
          if (!prev) return prev;
          return { campaigns: prev.campaigns.filter((campaign) => campaign.id !== activeActionCampaign.id) };
        }, { revalidate: false });
        const response = await fetch(`/api/plusvibe/campaigns/${activeActionCampaign.id}${companyQuery}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            archive_campaign: archiveCampaignOnDelete,
            save_leads_to_list: saveLeadsOnDelete,
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: 'Failed to delete campaign' }));
          await mutate(snapshot, { revalidate: false });
          throw new Error(payload.error || payload.details || 'Failed to delete campaign');
        }
        closeActionDialog();
        mutate();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to complete action');
    } finally {
      setActionSubmitting(false);
    }
  };

  // Missing API key
  if (error?.info?.code === 'MISSING_KEY') {
    return (
      <div className="space-y-6">
        <SetupBanner message="PlusVibe API key is not configured. Add your API key in Settings to manage campaigns." />
      </div>
    );
  }

  const plusVibeError = error?.info?.error as string | undefined;
  const plusVibeErrorDetails = error?.info?.details as string | undefined;
  const detailedErrorMessage = plusVibeErrorDetails
    ? `Failed to load campaigns. PlusVibe returned: ${plusVibeErrorDetails}`
    : plusVibeError
      ? `Failed to load campaigns. ${plusVibeError}`
      : 'Failed to load campaigns. Check your PlusVibe connection.';

  // Campaign wizard view
  if (editingCampaignId) {
    if (!selectedEditCampaign) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    return (
      <CampaignWizard
        campaign={selectedEditCampaign}
        companyId={selectedCompany?.id}
        companyQuery={companyQuery}
        onClose={() => {
          setEditingCampaignId(null);
          setCreatedCampaignDraft(null);
        }}
        onRefresh={() => {
          mutate();
        }}
      />
    );
  }

  // Analytics side panel view
  if (analyticsCampaignId) {
    return (
      <CampaignAnalytics
        campaignId={analyticsCampaignId}
        onClose={() => setAnalyticsCampaignId(null)}
        onEdit={(id) => {
          setAnalyticsCampaignId(null);
          setEditingCampaignId(id);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Search and Create */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            className="rounded border-border"
            checked={selectedCampaigns.size === visibleCampaigns.length && visibleCampaigns.length > 0}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedCampaigns(new Set(visibleCampaigns.map(c => c.id)));
              } else {
                setSelectedCampaigns(new Set());
              }
            }}
          />
          <span className="text-sm text-muted-foreground">
            Your campaigns ({campaigns.length})
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by campaign name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {/* Create Button */}
          <Button
            onClick={() => {
              setActionError(null);
              setIsCreateDialogOpen(true);
            }}
            size="sm"
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            New Campaign
          </Button>
        </div>
      </div>

      {/* Overview Stats Cards */}
      {!isLoading && campaigns.length > 0 && (
        <div className="grid grid-cols-6 gap-4 mb-2">
          <Card className="bg-slate-50/50 border-slate-100">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white rounded-lg shadow-sm text-slate-500">
                    <Users className="h-4 w-4" />
                  </div>
                  <span className="text-xs text-slate-500">Total Leads</span>
                </div>
              </div>
              <p className="text-2xl font-semibold text-indigo-600 mt-2">
                {overviewStats.totalLeads.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-50/50 border-slate-100">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white rounded-lg shadow-sm text-slate-500">
                    <Mail className="h-4 w-4" />
                  </div>
                  <span className="text-xs text-slate-500">Total Contacted</span>
                </div>
              </div>
              <p className="text-2xl font-semibold text-indigo-600 mt-2">
                {overviewStats.totalContacted.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-50/50 border-slate-100">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white rounded-lg shadow-sm text-slate-500">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                  <span className="text-xs text-slate-500">Finished</span>
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-semibold text-indigo-600">
                  {overviewStats.finishedRate}%
                </span>
                <span className="text-sm text-slate-400 ml-2">
                  {overviewStats.totalCompleted.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-50/50 border-slate-100">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white rounded-lg shadow-sm text-slate-500">
                    <Reply className="h-4 w-4" />
                  </div>
                  <span className="text-xs text-slate-500">Replied</span>
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-semibold text-indigo-600">
                  {overviewStats.replyRate}%
                </span>
                <span className="text-sm text-slate-400 ml-2">
                  {overviewStats.totalReplies.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-50/50 border-slate-100">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white rounded-lg shadow-sm text-slate-500">
                    <ThumbsUp className="h-4 w-4" />
                  </div>
                  <span className="text-xs text-slate-500">Positive Reply</span>
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-semibold text-indigo-600">
                  {overviewStats.positiveRate}%
                </span>
                <span className="text-sm text-slate-400 ml-2">
                  {overviewStats.totalPositive.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-50/50 border-slate-100">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white rounded-lg shadow-sm text-slate-500">
                    <Ban className="h-4 w-4" />
                  </div>
                  <span className="text-xs text-slate-500">Bounced</span>
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-semibold text-indigo-600">
                  {overviewStats.bounceRate}%
                </span>
                <span className="text-sm text-slate-400 ml-2">
                  {overviewStats.totalBounced.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error state */}
      {error && !error?.info?.code && (
        <SetupBanner message={detailedErrorMessage} />
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && campaigns.length === 0 && !error && (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">
              No campaigns yet
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first campaign to start outreach.
            </p>
            <Button
              className="mt-4 gap-2"
              onClick={() => {
                setActionError(null);
                setIsCreateDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Create Campaign
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Campaigns Table */}
      {!isLoading && filteredCampaigns.length > 0 && (
        <Card className="overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-1"></div>
            <div className="col-span-3">Campaign Name</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-4">Performance</div>
            <div className="col-span-1">Progress</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          {/* Campaign Rows */}
          <div className="divide-y divide-border">
            {visibleCampaigns.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                isSelected={selectedCampaigns.has(campaign.id)}
                onToggle={handleStatusChange}
                onEdit={setEditingCampaignId}
                onAnalytics={setAnalyticsCampaignId}
                onAction={openActionDialog}
                rowRef={(node) => {
                  campaignRefs.current[campaign.id] = node;
                }}
                isLoading={actionLoading === campaign.id}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Pagination */}
      {!isLoading && filteredCampaigns.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredCampaigns.length)} of {filteredCampaigns.length} campaigns
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Campaign</DialogTitle>
            <DialogDescription>Enter a campaign name to create a new draft campaign.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="campaign-name">
              Campaign name
            </label>
            <Input
              id="campaign-name"
              placeholder="Campaign name"
              value={createCampaignName}
              onChange={(event) => setCreateCampaignName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && createCampaignName.trim() && !createSubmitting) {
                  event.preventDefault();
                  handleCreateCampaign();
                }
              }}
            />
            {actionError ? <p className="text-xs text-destructive">{actionError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={createSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleCreateCampaign} disabled={!createCampaignName.trim() || createSubmitting}>
              {createSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(activeAction && activeActionCampaign)}
        onOpenChange={(open) => {
          if (!open) closeActionDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {activeAction === 'rename' && 'Rename Campaign'}
              {activeAction === 'duplicate' && 'Duplicate Campaign'}
              {activeAction === 'note' && 'Edit Note'}
              {activeAction === 'copySubsequences' && 'Copy Subsequences'}
              {activeAction === 'delete' && 'Delete Campaign'}
            </DialogTitle>
            <DialogDescription>
              {activeAction === 'rename' && 'Update campaign name.'}
              {activeAction === 'duplicate' && 'Create a new campaign from this one.'}
              {activeAction === 'note' && 'Save campaign notes for future reference.'}
              {activeAction === 'copySubsequences' && 'Choose destination campaign for subsequences.'}
              {activeAction === 'delete' && 'This action cannot be easily undone.'}
            </DialogDescription>
          </DialogHeader>

          {activeAction === 'rename' ? (
            <Input
              placeholder="Campaign name"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
            />
          ) : null}

          {activeAction === 'duplicate' ? (
            <div className="space-y-3">
              <Input
                placeholder="Duplicated campaign name"
                value={duplicateName}
                onChange={(event) => setDuplicateName(event.target.value)}
              />
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={duplicateSubsequences}
                  onChange={(event) => setDuplicateSubsequences(event.target.checked)}
                />
                Duplicate subsequences
              </label>
            </div>
          ) : null}

          {activeAction === 'note' ? (
            <textarea
              value={campaignNote}
              onChange={(event) => setCampaignNote(event.target.value)}
              placeholder="Add campaign note..."
              rows={4}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none resize-none"
            />
          ) : null}

          {activeAction === 'copySubsequences' ? (
            <select
              value={copyTargetCampaignId}
              onChange={(event) => setCopyTargetCampaignId(event.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">Select destination campaign</option>
              {campaigns
                .filter((campaign) => campaign.id !== activeActionCampaign?.id)
                .map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
            </select>
          ) : null}

          {activeAction === 'delete' ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={archiveCampaignOnDelete}
                  onChange={(event) => setArchiveCampaignOnDelete(event.target.checked)}
                />
                Archive Campaign
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={saveLeadsOnDelete}
                  onChange={(event) => setSaveLeadsOnDelete(event.target.checked)}
                />
                Save Leads data to List
              </label>
            </div>
          ) : null}

          {actionError ? <p className="text-xs text-destructive">{actionError}</p> : null}

          <DialogFooter>
            <Button variant="outline" onClick={closeActionDialog} disabled={actionSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleActionSubmit}
              disabled={
                actionSubmitting ||
                (activeAction === 'rename' && !renameValue.trim()) ||
                (activeAction === 'duplicate' && !duplicateName.trim()) ||
                (activeAction === 'copySubsequences' && !copyTargetCampaignId)
              }
              variant={activeAction === 'delete' ? 'destructive' : 'default'}
            >
              {actionSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {activeAction === 'copySubsequences' && 'Confirm'}
              {activeAction === 'delete' && 'Yes, Delete'}
              {(activeAction === 'rename' || activeAction === 'duplicate' || activeAction === 'note') && 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
