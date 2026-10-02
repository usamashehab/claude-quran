// What the quran mod asks of the terminal beyond its font (font.ts): taller rows
// (`/quran spacing`) and a larger or smaller text size (the l and s keys). Both
// are the terminal's own; GNOME Terminal takes them over D-Bus and gsettings,
// others get the setting to change. The steps that run commands live in
// register.tsx, beside `$`.

// Row height for `/quran spacing`: a little more room between lines, and a
// little more below them, where a terminal cuts off kasra.
export const LINE_HEIGHT = 1.2

export const GNOME_TERMINAL = 'org.gnome.Terminal'
export const GNOME_PROFILES = 'org.gnome.Terminal.ProfilesList'
export const gnomeProfile = (id: string) =>
  `org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:${id}/`

export const OTHER_TERMINALS_SPACING = [
  'Row height is a terminal setting; /quran spacing sets it for GNOME Terminal only. Elsewhere:',
  `   - kitty (kitty.conf): modify_font cell_height ${LINE_HEIGHT * 100}%`,
  `   - WezTerm: config.line_height = ${LINE_HEIGHT}`,
  '   - Others: a line height or cell spacing setting, if the terminal has one.',
].join('\n')
