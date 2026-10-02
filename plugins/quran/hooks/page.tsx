import type { ClientModule } from 'claude-code'

import type { PageRows } from './layout'

// The terminal page, drawn as a Client so that, once clicked, it takes the keys
// a pane never hands a plugin: the arrows (and + and -). It sends each key on to
// the hooks module, which turns the pages; see `ui.message` in register.tsx.
const Page: ClientModule<PageRows, true> = (rows, surface) => {
  if (surface.state === undefined) {
    surface.onKey(event => {
      if (!event.ctrl && !event.meta) {
        surface.post(event.key)
      }
    })
    surface.setState(true)
  }
  const { Box, Text } = surface.elements

  return (
    <Box flexDirection="column">
      {rows.map(row => (
        <Box>
          {row.map(([text, color, backgroundColor, bold]) => (
            <Text color={color} backgroundColor={backgroundColor} bold={bold}>
              {text}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export default Page
