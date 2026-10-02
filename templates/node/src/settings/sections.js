// Modules add their own boxes to the Settings page with addSettingsSection().
// render(req, res) returns the section's HTML as a string.
const sections = [];

export function addSettingsSection({ id, title, render }) {
  sections.push({ id, title, render });
}

export async function renderSettingsSections(req, res) {
  const rendered = [];
  for (const section of sections) {
    let html;
    try {
      html = await section.render(req, res);
    } catch (err) {
      console.error(`[settings] section "${section.id}" failed:`, err);
      html = '<p class="text-sm text-red-400">This section failed to load.</p>';
    }
    rendered.push({ id: section.id, title: section.title, html });
  }
  return rendered;
}
