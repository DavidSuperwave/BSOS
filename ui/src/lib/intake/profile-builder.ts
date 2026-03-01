import { createClient } from "@supabase/supabase-js";
import { envConfig } from "../env";

// Types
export interface OnboardingFormData {
  // Company Identity
  company_name: string;
  slug: string;
  industry: string;
  industry_subsegment?: string;
  company_size: '1-10' | '11-50' | '51-200' | '201-500' | '500+';
  annual_revenue?: string;
  website: string;
  linkedin_url?: string;
  
  // Service Configuration
  service_tier: 'Foundation' | 'Fuel' | 'Engine' | 'Custom';
  primary_service: string;
  secondary_services?: string[];
  
  // Target Market
  target_industries: string[];
  target_personas: {
    title: string;
    seniority: 'C-Level' | 'VP' | 'Director' | 'Manager' | 'IC';
    pain_points: string[];
    decision_maker: boolean;
  }[];
  
  // Current State
  current_outbound_status: 'none' | 'in-house' | 'agency' | 'hybrid';
  current_tools?: string[];
  current_challenges?: string[];
  
  // Goals
  primary_goal: string;
  monthly_meeting_target?: number;
  timeline: 'immediate' | '1-3months' | '3-6months' | 'exploring';
  
  // Competitive Intel
  known_competitors?: string[];
  differentiated_angles?: string[];
  
  // Content & Assets
  existing_content?: string[];
  brand_voice?: 'professional' | 'casual' | 'technical' | 'playful';
  
  // Integrations
  has_crm: boolean;
  crm_type?: 'close' | 'salesforce' | 'hubspot' | 'other';
  has_calendly: boolean;
  has_existing_data: boolean;
}

export interface ServiceDefinition {
  name: string;
  description: string;
  deliverables: string[];
  price_range?: string;
}

export interface ServiceTier {
  name: string;
  description: string;
  price_monthly: string;
  features: string[];
  ideal_for: string;
}

export interface IndustryProfile {
  industry: string;
  priority: number; // 1-10
  pain_points: string[];
  buying_signals: string[];
  seasonality?: string;
}

export interface PersonaProfile {
  title: string;
  seniority: string;
  pain_points: string[];
  goals: string[];
  objections: string[];
  decision_maker: boolean;
  influence_level: 'high' | 'medium' | 'low';
}

export interface CompanyProfile {
  identity: {
    name: string;
    slug: string;
    industry: string;
    subsegment?: string;
    size: string;
    revenue_range?: string;
    website: string;
    description: string;
    value_proposition: string;
    differentiators: string[];
  };
  services: {
    primary: ServiceDefinition;
    secondary?: ServiceDefinition[];
    tiers: ServiceTier[];
    pricing_model: string;
  };
  icp: {
    industries: IndustryProfile[];
    personas: PersonaProfile[];
    company_size: string;
    technographics?: string[];
    buying_signals: string[];
  };
  performance: {
    campaigns_analyzed: number;
    total_leads_contacted: number;
    average_reply_rate: number;
    average_positive_rate: number;
    best_performing_campaign?: string;
    worst_performing_campaign?: string;
    best_performing_industry?: string;
    best_performing_persona?: string;
    best_performing_angle?: string;
  };
  competitive: {
    known_competitors: CompetitorProfile[];
    differentiated_angles: string[];
    positioning_statement: string;
  };
  assets: {
    case_studies: CaseStudy[];
    whitepapers: DocumentAsset[];
    playbooks: DocumentAsset[];
    templates: EmailTemplate[];
  };
}

export interface CompetitorProfile {
  name: string;
  website?: string;
  differentiators: string[];
  weaknesses: string[];
  positioning: string;
}

export interface CaseStudy {
  title: string;
  client_name: string;
  industry: string;
  challenge: string;
  solution: string;
  results: string;
  metrics?: Record<string, string>;
}

export interface DocumentAsset {
  title: string;
  description: string;
  url?: string;
  type: string;
  extracted_insights?: string[];
}

export interface EmailTemplate {
  name: string;
  subject: string;
  body: string;
  framework: string;
  use_case: string;
  performance?: {
    reply_rate?: number;
    positive_rate?: number;
  };
}

/**
 * Build comprehensive company profile from onboarding data
 */
export async function buildCompanyProfile(
  formData: OnboardingFormData,
  options?: {
    plusvibeData?: PlusVibeImportData;
    closeData?: CloseImportData;
    uploadedDocuments?: AnalyzedDocument[];
  }
): Promise<CompanyProfile> {
  
  // Build identity section
  const identity = buildIdentity(formData);
  
  // Build services section
  const services = buildServices(formData);
  
  // Build ICP section
  const icp = buildICP(formData);
  
  // Build performance section (from imports if available)
  const performance = await buildPerformance(formData, options);
  
  // Build competitive section
  const competitive = buildCompetitive(formData);
  
  // Build assets section (from uploads if available)
  const assets = buildAssets(formData, options);
  
  return {
    identity,
    services,
    icp,
    performance,
    competitive,
    assets,
  };
}

function buildIdentity(formData: OnboardingFormData) {
  // Generate AI description from form data
  const description = generateCompanyDescription(formData);
  
  // Extract value proposition
  const value_proposition = generateValueProposition(formData);
  
  // Generate differentiators
  const differentiators = generateDifferentiators(formData);
  
  return {
    name: formData.company_name,
    slug: formData.slug,
    industry: formData.industry,
    subsegment: formData.industry_subsegment,
    size: formData.company_size,
    revenue_range: formData.annual_revenue,
    website: formData.website,
    description,
    value_proposition,
    differentiators,
  };
}

function generateCompanyDescription(formData: OnboardingFormData): string {
  const { company_name, industry, primary_service, company_size, target_industries } = formData;
  
  const industries = target_industries.slice(0, 3).join(", ");
  
  return `${company_name} is a ${industry} company providing ${primary_service} to ${industries}. They operate in the ${company_size} employee range and specialize in helping businesses achieve measurable outcomes through targeted outreach.`;
}

function generateValueProposition(formData: OnboardingFormData): string {
  const { primary_service, differentiated_angles } = formData;
  
  let valueProp = `We provide ${primary_service}`;
  
  if (differentiated_angles && differentiated_angles.length > 0) {
    valueProp += ` with a unique focus on ${differentiated_angles[0]}`;
  }
  
  return valueProp + ".";
}

function generateDifferentiators(formData: OnboardingFormData): string[] {
  const differentiators: string[] = [];
  
  if (formData.differentiated_angles) {
    differentiators.push(...formData.differentiated_angles);
  }
  
  if (formData.service_tier === 'Engine') {
    differentiators.push("Full-service AI-powered outreach");
  } else if (formData.service_tier === 'Fuel') {
    differentiators.push("Managed infrastructure + verified data");
  }
  
  if (formData.current_outbound_status === 'in-house') {
    differentiators.push("Hybrid approach: AI + human strategy");
  }
  
  return differentiators.length > 0 ? differentiators : ["Quality-focused approach"];
}

function buildServices(formData: OnboardingFormData) {
  const primary: ServiceDefinition = {
    name: formData.primary_service,
    description: `Primary offering: ${formData.primary_service}`,
    deliverables: ["Strategy", "Execution", "Reporting"],
  };
  
  const tiers: ServiceTier[] = [
    {
      name: formData.service_tier,
      description: `${formData.service_tier} tier service`,
      price_monthly: formData.service_tier === 'Foundation' ? '$200-500' : 
                      formData.service_tier === 'Fuel' ? '$1k-2k' : 
                      formData.service_tier === 'Engine' ? '$7.5k-25k' : 'Custom',
      features: getTierFeatures(formData.service_tier),
      ideal_for: getTierIdealFor(formData.service_tier),
    }
  ];
  
  return {
    primary,
    secondary: formData.secondary_services?.map(s => ({
      name: s,
      description: `Secondary service: ${s}`,
      deliverables: [],
    })),
    tiers,
    pricing_model: formData.service_tier === 'Engine' ? 'Performance-based available' : 'Monthly retainer',
  };
}

function getTierFeatures(tier: string): string[] {
  switch (tier) {
    case 'Foundation':
      return ["Managed infrastructure", "95%+ deliverability SLA", "Domain warming"];
    case 'Fuel':
      return ["Infrastructure + human-verified lead data", "ICP research", "A/B testing"];
    case 'Engine':
      return ["Full AI-powered campaign execution", "Reply management", "Meeting booking"];
    default:
      return ["Custom solution"];
  }
}

function getTierIdealFor(tier: string): string {
  switch (tier) {
    case 'Foundation':
      return "Companies building their outbound infrastructure";
    case 'Fuel':
      return "Companies with existing outreach needing better data";
    case 'Engine':
      return "Companies wanting full-service campaign management";
    default:
      return "Companies with unique requirements";
  }
}

function buildICP(formData: OnboardingFormData) {
  const industries: IndustryProfile[] = formData.target_industries.map((industry, index) => ({
    industry,
    priority: 10 - index,
    pain_points: inferIndustryPainPoints(industry),
    buying_signals: inferBuyingSignals(industry),
  }));
  
  const personas: PersonaProfile[] = formData.target_personas.map(p => ({
    title: p.title,
    seniority: p.seniority,
    pain_points: p.pain_points,
    goals: inferGoalsFromPainPoints(p.pain_points),
    objections: inferObjections(p.seniority),
    decision_maker: p.decision_maker,
    influence_level: p.decision_maker ? 'high' : p.seniority === 'VP' ? 'high' : 'medium',
  }));
  
  return {
    industries,
    personas,
    company_size: formData.company_size,
    technographics: formData.current_tools,
    buying_signals: formData.target_industries.flatMap(inferBuyingSignals),
  };
}

function inferIndustryPainPoints(industry: string): string[] {
  const painPoints: Record<string, string[]> = {
    'SaaS': ['High CAC', 'Inconsistent pipeline', 'Long sales cycles', 'Competitive market'],
    'Staffing': ['Domain burnout', 'Bad contact data', 'Low response rates', 'Recruiter turnover'],
    'Agency': ['Feast-or-famine', 'Client acquisition', 'Margin pressure'],
    'Healthcare': ['Compliance concerns', 'Long procurement', 'Gatekeepers'],
    'default': ['Inconsistent leads', 'Poor conversion', 'High acquisition costs'],
  };
  
  return painPoints[industry] || painPoints['default'];
}

function inferBuyingSignals(industry: string): string[] {
  const signals: Record<string, string[]> = {
    'SaaS': ['Recent funding', 'Hiring sales roles', 'Product launch'],
    'Staffing': ['High volume hiring', 'New client wins', 'Domain issues'],
    'Agency': ['New service launch', 'Client churn', 'Expansion'],
    'default': ['Budget flush', 'Leadership change', 'Growth phase'],
  };
  
  return signals[industry] || signals['default'];
}

function inferGoalsFromPainPoints(painPoints: string[]): string[] {
  return painPoints.map(pain => {
    if (pain.includes('pipeline')) return 'Consistent lead flow';
    if (pain.includes('CAC')) return 'Lower acquisition costs';
    if (pain.includes('response')) return 'Higher engagement rates';
    return 'Improved outcomes';
  });
}

function inferObjections(seniority: string): string[] {
  const common = ['"We do this in-house"', '"Not the right time"', '"Send me more info"'];
  
  if (seniority === 'C-Level') {
    return [...common, '"Too expensive"', '"Need board approval"'];
  }
  
  return common;
}

async function buildPerformance(
  formData: OnboardingFormData,
  options?: {
    plusvibeData?: PlusVibeImportData;
    closeData?: CloseImportData;
  }
): Promise<CompanyProfile['performance']> {
  
  const basePerformance = {
    campaigns_analyzed: 0,
    total_leads_contacted: 0,
    average_reply_rate: 0,
    average_positive_rate: 0,
  };
  
  if (!options?.plusvibeData) {
    return basePerformance;
  }
  
  const campaigns = options.plusvibeData.campaigns;
  const totalLeads = campaigns.reduce((sum, c) => sum + (c.stats?.contacted || 0), 0);
  const avgReplyRate = campaigns.length > 0
    ? campaigns.reduce((sum, c) => sum + (c.stats?.reply_rate || 0), 0) / campaigns.length
    : 0;
  const avgPositiveRate = campaigns.length > 0
    ? campaigns.reduce((sum, c) => sum + (c.stats?.positive_rate || 0), 0) / campaigns.length
    : 0;
  
  // Find best/worst campaigns
  const sortedByReply = [...campaigns].sort((a, b) => 
    (b.stats?.reply_rate || 0) - (a.stats?.reply_rate || 0)
  );
  
  return {
    campaigns_analyzed: campaigns.length,
    total_leads_contacted: totalLeads,
    average_reply_rate: Number(avgReplyRate.toFixed(2)),
    average_positive_rate: Number(avgPositiveRate.toFixed(2)),
    best_performing_campaign: sortedByReply[0]?.name,
    worst_performing_campaign: sortedByReply[sortedByReply.length - 1]?.name,
  };
}

function buildCompetitive(formData: OnboardingFormData) {
  const competitors: CompetitorProfile[] = (formData.known_competitors || []).map(name => ({
    name,
    differentiators: [],
    weaknesses: [],
    positioning: '',
  }));
  
  return {
    known_competitors: competitors,
    differentiated_angles: formData.differentiated_angles || [],
    positioning_statement: generatePositioningStatement(formData),
  };
}

function generatePositioningStatement(formData: OnboardingFormData): string {
  const { company_name, primary_service, differentiated_angles, target_industries } = formData;
  const industries = target_industries.slice(0, 2).join(' and ');
  const differentiator = differentiated_angles?.[0] || 'proven results';
  
  return `${company_name} helps ${industries} companies achieve better outcomes through ${primary_service}, differentiated by our ${differentiator}.`;
}

function buildAssets(
  formData: OnboardingFormData,
  options?: {
    uploadedDocuments?: AnalyzedDocument[];
  }
): CompanyProfile['assets'] {
  
  const caseStudies: CaseStudy[] = [];
  const whitepapers: DocumentAsset[] = [];
  const playbooks: DocumentAsset[] = [];
  const templates: EmailTemplate[] = [];
  
  // Process uploaded documents
  if (options?.uploadedDocuments) {
    for (const doc of options.uploadedDocuments) {
      if (doc.document_type === 'case_study' && doc.case_study_data) {
        caseStudies.push(doc.case_study_data);
      } else if (doc.document_type === 'playbook') {
        playbooks.push({
          title: doc.title,
          description: doc.summary,
          type: 'playbook',
          extracted_insights: doc.key_points,
        });
      }
    }
  }
  
  return {
    case_studies: caseStudies,
    whitepapers,
    playbooks,
    templates,
  };
}

// Placeholder types for imports
interface PlusVibeImportData {
  campaigns: any[];
}

interface CloseImportData {
  deals: any[];
}

interface AnalyzedDocument {
  document_type: string;
  title: string;
  summary: string;
  key_points: string[];
  case_study_data?: CaseStudy;
}
