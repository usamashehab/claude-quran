export type Bookmark = { page: number; surah: number; ayah: number }
export type Theme = 'day' | 'night'

declare module 'claude-code' {
  interface PluginState {
    quran: {
      page: number
      cursor: number
      bookmark: Bookmark | null
      isPlain: boolean
      isSpaced: boolean
      theme: Theme
    }
  }
}
