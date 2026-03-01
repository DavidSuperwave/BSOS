/**
 * Company Intake System - Main Export
 * 
 * This module provides the complete company onboarding and intake pipeline
 * for Blitzscale OS. It synthesizes data from multiple sources into a
 * comprehensive company profile stored in Supermemory.
 */

// Core builders
export { buildCompanyProfile } from "./profile-builder";
export type {
  OnboardingFormData,
  CompanyProfile,
  ServiceDefinition,
  ServiceTier,
  IndustryProfile,
  PersonaProfile,
  CompetitorProfile,
  CaseStudy,
  DocumentAsset,
  EmailTemplate,
} from "./profile-builder";

// Pipeline
export { runIntakePipeline } from "./intake-pipeline";
export type {
  IntakePipelineConfig,
  IntakePipelineResult,
} from "./intake-pipeline";

// Supermemory sync
export { syncIntakeToSupermemory } from "./supermemory-sync";

// Importers and document analysis
export {
  importPlusVibeCampaigns,
  type PlusVibeCampaign,
  type EmailStep,
} from "./importers/plusvibe";
export { importCloseDeals, type CloseDeal } from "./importers/close";
export { analyzeDocument, type AnalyzedDocument } from "./document-analyzer";

// Re-export for convenience
export { default } from "./intake-pipeline";
