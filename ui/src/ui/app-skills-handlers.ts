import { loadSkillsRegistry } from "./controllers/skills";
import type { OpenClawApp } from "./app";

type App = OpenClawApp & {
  skillsView: "installed" | "registry";
  registryList: any[];
};

export function handleSkillsViewChange(app: App, view: "installed" | "registry") {
  app.skillsView = view;
  if (view === "registry" && app.registryList.length === 0) {
    loadSkillsRegistry(app as any);
  }
}
