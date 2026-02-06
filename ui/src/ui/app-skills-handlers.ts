import type { AppViewState } from "./app-view-state";
import {
  loadSkillsRegistry,
  toggleSkillGroup,
  toggleSkillExpanded,
  type SkillsState,
} from "./controllers/skills";

type SkillsAppState = {
  skillsView: "installed" | "registry";
  registryList: unknown[];
  skillsExpandedGroups: Set<string>;
  skillsExpandedSkill: string | null;
};

export function handleSkillsViewChange(
  app: AppViewState | SkillsAppState,
  view: "installed" | "registry",
) {
  app.skillsView = view;
  if (view === "registry" && app.registryList.length === 0) {
    void loadSkillsRegistry(app as unknown as SkillsState);
  }
}

export function handleSkillGroupToggle(app: AppViewState | SkillsAppState, group: string) {
  toggleSkillGroup(app as unknown as SkillsState, group);
}

export function handleSkillExpandToggle(
  app: AppViewState | SkillsAppState,
  skillKey: string | null,
) {
  toggleSkillExpanded(app as unknown as SkillsState, skillKey);
}
