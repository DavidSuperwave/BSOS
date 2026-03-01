import { buildCompanyProfile, OnboardingFormData, CompanyProfile } from "./profile-builder";
import { syncIntakeToSupermemory } from "./supermemory-sync";
import { importPlusVibeCampaigns, type PlusVibeCampaign } from "./importers/plusvibe";
import { importCloseDeals, type CloseDeal } from "./importers/close";
import { analyzeDocument, type AnalyzedDocument } from "./document-analyzer";

/**
 * Intake Pipeline Configuration
 */
export interface IntakePipelineConfig {
  companyId: string;
  companySlug: string;
  projectId: string;
  userId: string;
  
  // Data sources
  formData: OnboardingFormData;
  
  // Optional imports
  plusvibeConfig?: {
    apiKey: string;
    workspaceId: string;
    importRange: { from: Date; to: Date };
  };
  
  closeConfig?: {
    apiKey: string;
    importRange: { from: Date; to: Date };
  };
  
  // File uploads
  uploadedFiles?: File[];
  
  // Options
  options?: {
    skipSupermemorySync?: boolean;
    skipPlusVibeImport?: boolean;
    skipCloseImport?: boolean;
    skipDocumentAnalysis?: boolean;
  };

  onProgress?: (progress: number, stage: string) => void;
}

/**
 * Intake Pipeline Result
 */
export interface IntakePipelineResult {
  success: boolean;
  stage: 'completed' | 'partial' | 'failed';
  progress: number;
  
  // Profile data
  profile?: CompanyProfile;
  
  // Stage results
  stages: {
    formProcessing: { success: boolean; error?: string };
    plusvibeImport?: { success: boolean; campaignsImported?: number; error?: string };
    closeImport?: { success: boolean; dealsImported?: number; error?: string };
    documentAnalysis?: { success: boolean; documentsAnalyzed?: number; error?: string };
    profileBuild: { success: boolean; error?: string };
    supermemorySync?: { success: boolean; documentsCreated?: number; error?: string };
  };
  
  // Summary
  summary: {
    totalDocumentsCreated: number;
    totalCampaignsImported: number;
    totalDealsImported: number;
    insightsGenerated: number;
    processingTimeMs: number;
  };
  
  // Errors
  errors: string[];
  warnings: string[];
}

/**
 * Main Intake Pipeline
 * Orchestrates the entire company onboarding process
 */
export async function runIntakePipeline(
  config: IntakePipelineConfig
): Promise<IntakePipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const result: IntakePipelineResult = {
    success: false,
    stage: 'failed',
    progress: 0,
    stages: {
      formProcessing: { success: false },
      profileBuild: { success: false },
    },
    summary: {
      totalDocumentsCreated: 0,
      totalCampaignsImported: 0,
      totalDealsImported: 0,
      insightsGenerated: 0,
      processingTimeMs: 0,
    },
    errors,
    warnings,
  };

  const setProgress = (progress: number, stage: string) => {
    result.progress = Math.max(0, Math.min(100, progress));
    if (config.onProgress) {
      try {
        config.onProgress(result.progress, stage);
      } catch {
        // non-blocking progress callback
      }
    }
  };
  
  try {
    console.log(`[IntakePipeline] Starting intake for ${config.companySlug}`);
    setProgress(5, "starting");
    
    // Stage 1: Process form data
    console.log('[IntakePipeline] Stage 1: Processing form data...');
    const formData = config.formData;
    result.stages.formProcessing = { success: true };
    setProgress(15, "form_processing");
    
    // Stage 2: Import PlusVibe data (if configured)
    let plusvibeData = null;
    if (!config.options?.skipPlusVibeImport && config.plusvibeConfig) {
      console.log('[IntakePipeline] Stage 2: Importing PlusVibe data...');
      try {
        plusvibeData = await importPlusVibeData(config.plusvibeConfig);
        result.stages.plusvibeImport = {
          success: true,
          campaignsImported: plusvibeData?.campaigns?.length || 0,
        };
        result.summary.totalCampaignsImported = plusvibeData?.campaigns?.length || 0;
        console.log(`[IntakePipeline] Imported ${plusvibeData?.campaigns?.length || 0} campaigns from PlusVibe`);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        result.stages.plusvibeImport = { success: false, error };
        warnings.push(`PlusVibe import failed: ${error}`);
        console.warn('[IntakePipeline] PlusVibe import failed:', error);
      }
    } else {
      console.log('[IntakePipeline] Skipping PlusVibe import');
    }
    setProgress(35, "plusvibe_import");
    
    // Stage 3: Import Close CRM data (if configured)
    let closeData = null;
    if (!config.options?.skipCloseImport && config.closeConfig) {
      console.log('[IntakePipeline] Stage 3: Importing Close CRM data...');
      try {
        closeData = await importCloseData(config.closeConfig);
        result.stages.closeImport = {
          success: true,
          dealsImported: closeData?.deals?.length || 0,
        };
        result.summary.totalDealsImported = closeData?.deals?.length || 0;
        console.log(`[IntakePipeline] Imported ${closeData?.deals?.length || 0} deals from Close`);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        result.stages.closeImport = { success: false, error };
        warnings.push(`Close import failed: ${error}`);
        console.warn('[IntakePipeline] Close import failed:', error);
      }
    } else {
      console.log('[IntakePipeline] Skipping Close import');
    }
    setProgress(50, "close_import");
    
    // Stage 4: Analyze uploaded documents
    let analyzedDocuments = null;
    if (!config.options?.skipDocumentAnalysis && config.uploadedFiles && config.uploadedFiles.length > 0) {
      console.log('[IntakePipeline] Stage 4: Analyzing uploaded documents...');
      try {
        analyzedDocuments = await analyzeDocuments(config.uploadedFiles);
        result.stages.documentAnalysis = {
          success: true,
          documentsAnalyzed: analyzedDocuments?.length || 0,
        };
        console.log(`[IntakePipeline] Analyzed ${analyzedDocuments?.length || 0} documents`);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        result.stages.documentAnalysis = { success: false, error };
        warnings.push(`Document analysis failed: ${error}`);
        console.warn('[IntakePipeline] Document analysis failed:', error);
      }
    } else {
      console.log('[IntakePipeline] Skipping document analysis');
    }
    setProgress(65, "document_analysis");
    
    // Stage 5: Build comprehensive profile
    console.log('[IntakePipeline] Stage 5: Building company profile...');
    try {
      const profile = await buildCompanyProfile(formData, {
        plusvibeData: plusvibeData || undefined,
        closeData: closeData || undefined,
        uploadedDocuments: analyzedDocuments || undefined,
      });
      
      result.profile = profile;
      result.stages.profileBuild = { success: true };
      console.log('[IntakePipeline] Profile built successfully');
      setProgress(80, "profile_build");
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      result.stages.profileBuild = { success: false, error };
      errors.push(`Profile build failed: ${error}`);
      console.error('[IntakePipeline] Profile build failed:', error);
      
      result.summary.processingTimeMs = Date.now() - startTime;
      return result;
    }
    
    // Stage 6: Sync to Supermemory
    if (!config.options?.skipSupermemorySync && result.profile) {
      console.log('[IntakePipeline] Stage 6: Syncing to Supermemory...');
      try {
        const syncResult = await syncIntakeToSupermemory(
          config.companyId,
          config.companySlug,
          config.projectId,
          result.profile
        );
        
        result.stages.supermemorySync = {
          success: syncResult.success,
          documentsCreated: syncResult.documentsCreated,
          error: syncResult.errors.length > 0 ? syncResult.errors.join('; ') : undefined,
        };
        
        result.summary.totalDocumentsCreated = syncResult.documentsCreated;
        result.summary.insightsGenerated = syncResult.documentsCreated; // Each doc has insights
        
        console.log(`[IntakePipeline] Created ${syncResult.documentsCreated} documents in Supermemory`);
        
        if (!syncResult.success) {
          warnings.push(...syncResult.errors);
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        result.stages.supermemorySync = { success: false, error };
        warnings.push(`Supermemory sync failed: ${error}`);
        console.warn('[IntakePipeline] Supermemory sync failed:', error);
      }
    } else {
      console.log('[IntakePipeline] Skipping Supermemory sync');
    }
    setProgress(95, "supermemory_sync");
    
    // Calculate final status
    const criticalStages = [
      result.stages.formProcessing,
      result.stages.profileBuild,
    ];
    
    const optionalStages = [
      result.stages.plusvibeImport,
      result.stages.closeImport,
      result.stages.documentAnalysis,
      result.stages.supermemorySync,
    ].filter(Boolean);
    
    const allCriticalSuccess = criticalStages.every(s => s.success);
    const someOptionalSuccess = optionalStages.some(s => s?.success);
    
    if (allCriticalSuccess) {
      result.success = true;
      result.stage = someOptionalSuccess || optionalStages.length === 0 ? 'completed' : 'partial';
    } else {
      result.success = false;
      result.stage = 'failed';
    }
    
    result.summary.processingTimeMs = Date.now() - startTime;
    setProgress(100, "completed");
    
    console.log(`[IntakePipeline] Completed in ${result.summary.processingTimeMs}ms`);
    console.log(`[IntakePipeline] Status: ${result.stage}, Success: ${result.success}`);
    
    return result;
    
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    errors.push(`Pipeline failed: ${error}`);
    console.error('[IntakePipeline] Pipeline failed:', error);
    
    result.summary.processingTimeMs = Date.now() - startTime;
    return result;
  }
}

/**
 * Import data from PlusVibe
 */
async function importPlusVibeData(config: {
  apiKey: string;
  workspaceId: string;
  importRange: { from: Date; to: Date };
}): Promise<{ campaigns: PlusVibeCampaign[] }> {
  console.log(`[IntakePipeline] Fetching PlusVibe data for workspace ${config.workspaceId}`);
  const campaigns = await importPlusVibeCampaigns(config);
  return { campaigns };
}

/**
 * Import data from Close CRM
 */
async function importCloseData(config: {
  apiKey: string;
  importRange: { from: Date; to: Date };
}): Promise<{ deals: CloseDeal[] }> {
  console.log(`[IntakePipeline] Fetching Close CRM data`);
  const deals = await importCloseDeals(config);
  return { deals };
}

/**
 * Analyze uploaded documents
 */
async function analyzeDocuments(files: File[]): Promise<AnalyzedDocument[]> {
  console.log(`[IntakePipeline] Analyzing ${files.length} documents`);
  const analyzed: AnalyzedDocument[] = [];
  
  for (const file of files) {
    try {
      const analysis = await analyzeDocument(file);
      analyzed.push(analysis);
    } catch (err) {
      console.warn(`[IntakePipeline] Failed to analyze ${file.name}:`, err);
    }
  }
  
  return analyzed;
}

export default runIntakePipeline;
