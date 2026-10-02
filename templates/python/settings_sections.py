# Modules add their own boxes to the Settings page with add_settings_section().
# render() returns the section's HTML as a string (it runs inside a request).
_sections = []


def add_settings_section(section_id, title, render):
    _sections.append({"id": section_id, "title": title, "render": render})


def render_settings_sections():
    rendered = []
    for section in _sections:
        try:
            html = section["render"]()
        except Exception as exc:
            print(f"[settings] section {section['id']} failed: {exc}")
            html = '<p class="text-sm text-red-400">This section failed to load.</p>'
        rendered.append({"id": section["id"], "title": section["title"], "html": html})
    return rendered
