/** Locally installed skill — desktop-only, no backend equivalent */
export interface InstalledSkill {
  slug: string;
  name: string;
  description: string;
  author: string;
  version: string;
  filePath: string;
  installedAt: string;
}
