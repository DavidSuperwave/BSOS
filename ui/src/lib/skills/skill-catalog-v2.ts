// Backward-compatible bridge: v2 now delegates to the merged catalog implementation.
export {
  BUILT_IN_SKILLS,
  loadWorkspaceDefaultSkillBlueprints,
  ensureDefaultBlueprints,
  listSkillCatalogForCompany,
  importBlueprintToCompany,
  applyDefaultSkillPackToCompany,
} from "./skill-catalog";
