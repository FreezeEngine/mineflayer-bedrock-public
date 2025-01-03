module.exports = inject

function inject (bot) {
  const ChatMessage = require('prismarine-chat')(bot.registry)

  bot.tablist = {
    header: new ChatMessage(''),
    footer: new ChatMessage('')
  }
}
